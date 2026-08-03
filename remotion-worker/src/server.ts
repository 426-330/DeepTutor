import {createServer} from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import express from 'express';
import {WebSocket, WebSocketServer} from 'ws';
import {z} from 'zod';
import {DEFAULT_BGM_VOLUME} from './parser/audio.js';
import {parseVideoSpec} from './parser/index.js';
import type {ParseWarning, VideoIR} from './parser/types.js';
import {rangeAlignsToScenes, spliceSegmentIntoFull} from './partial.js';
import {createQueueDriver, type RenderTask} from './queue.js';
import {CONCEPT_COMPOSITION_ID, renderToMp4} from './render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// src/ (dev via tsx) and dist/ (built) both sit one level below remotion-worker/.
const WORKER_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(WORKER_ROOT, '..');

const PORT = Number(process.env.PORT ?? 3100);
// Reserved location per repo layout: <repo>/data/videos/renders/<job_id>.mp4
const RENDER_OUT_DIR =
  process.env.RENDER_OUT_DIR ?? path.join(REPO_ROOT, 'data', 'videos', 'renders');

// ---------------------------------------------------------------------------
// Job table
// ---------------------------------------------------------------------------

export type JobStatus = 'queued' | 'rendering' | 'done' | 'error';

export interface Job {
  id: string;
  yaml_path?: string;
  /** M1+: sha256 of the YAML spec, for cache invalidation / dedup. */
  yaml_hash?: string;
  /** M1+: frame range override (e.g. from `.align.json` duration injection). */
  frames?: {start: number; end: number};
  status: JobStatus;
  progress: number;
  output?: string;
  error?: string;
}

// TODO(M1+): persist jobs in SQLite instead of process memory. Keep all
// access behind this Map-shaped surface so a JobStore (better-sqlite3)
// can drop in without touching the routes.
const jobs = new Map<string, Job>();

// ---------------------------------------------------------------------------
// Request envelope validation. The DSL YAML itself is validated by the parser
// against video_dsl/schema/concept-video.schema.json (design D5).
// ---------------------------------------------------------------------------

const RenderRequestSchema = z.object({
  yaml_path: z.string().optional(),
  job_id: z.string().min(1),
  /** Optional BGM override (M2): path wins over the asset-dir bgm/ convention. */
  bgm_path: z.string().optional(),
  bgm_volume: z.number().min(0).max(1).optional(),
  /** Partial re-render (tasks 7.1): inclusive frame range to re-render. */
  frames: z
    .object({
      start: z.number().int().min(0),
      end: z.number().int().min(0),
    })
    .optional(),
});

/** Resolve a submitted path: absolute stays, relative anchors at repo root. */
function resolveFromRepo(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(REPO_ROOT, p);
}

// ---------------------------------------------------------------------------
// HTTP + WS server
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({noServer: true});

server.on('upgrade', (req, socket, head) => {
  const {pathname} = new URL(req.url ?? '/', `http://${req.headers.host}`);
  if (pathname === '/ws/progress') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

function broadcast(event: Record<string, unknown>): void {
  const payload = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

app.get('/health', (_req, res) => {
  res.json({status: 'ok'});
});

app.post('/render', (req, res) => {
  const parsed = RenderRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({error: 'invalid request', details: parsed.error.issues});
    return;
  }

  const {job_id, yaml_path, bgm_path, bgm_volume, frames} = parsed.data;
  const existing = jobs.get(job_id);
  // 重复 job_id：进行中一律 409；已完成/失败的任务允许重提交
  // （局部迭代：改完 YAML 后用 frames 局部重渲拼回同一片，tasks 7.1）。
  if (existing && (existing.status === 'queued' || existing.status === 'rendering')) {
    res.status(409).json({error: `job '${job_id}' already exists`});
    return;
  }
  if (existing && !frames) {
    res.status(409).json({
      error: `job '${job_id}' already exists (resubmit only allowed with frames for partial re-render)`,
    });
    return;
  }
  if (frames && frames.end <= frames.start) {
    res.status(400).json({
      error: 'invalid request',
      details: [{path: '/frames', message: 'frames.end must be greater than frames.start'}],
    });
    return;
  }

  // M1: a yaml_path triggers the real pipeline (parse → validate → IR).
  // Without one we keep the M0 HelloWorld fallback composition.
  let ir: VideoIR | undefined;
  let warnings: ParseWarning[] = [];
  if (yaml_path) {
    const result = parseVideoSpec(resolveFromRepo(yaml_path));
    if (!result.ok) {
      // Structured rejection: no render artifact, WS error event (design D4).
      broadcast({
        job_id,
        status: 'error',
        progress: 0,
        error: 'spec validation failed',
        details: result.errors,
      });
      res.status(400).json({error: 'spec validation failed', details: result.errors});
      return;
    }
    ir = result.ir;
    warnings = result.warnings;

    if (frames && ir && frames.end >= ir.totalFrames) {
      res.status(400).json({
        error: 'invalid request',
        details: [
          {
            path: '/frames',
            message: `frames.end ${frames.end} out of range (totalFrames=${ir.totalFrames})`,
          },
        ],
      });
      return;
    }

    // M2: per-request BGM override (bgm_path wins over bgm/ convention;
    // bgm_volume tunes either source). Missing override file → 400.
    if (bgm_path) {
      const resolvedBgm = resolveFromRepo(bgm_path);
      if (!fs.existsSync(resolvedBgm)) {
        res.status(400).json({
          error: 'invalid request',
          details: [{path: '/bgm_path', message: `BGM file not found: ${resolvedBgm}`}],
        });
        return;
      }
      ir.bgm = {
        url: pathToFileURL(resolvedBgm).toString(),
        volume: bgm_volume ?? DEFAULT_BGM_VOLUME,
      };
    } else if (bgm_volume !== undefined && ir.bgm) {
      ir.bgm = {...ir.bgm, volume: bgm_volume};
    }
  }

  const job: Job = {
    id: job_id,
    yaml_path,
    frames,
    status: 'queued',
    progress: 0,
  };
  jobs.set(job_id, job);

  res.status(202).json({
    job_id,
    status: 'accepted',
    queue: queueDriver.mode,
    ...(frames ? {partial: true, frames} : {}),
    ...(ir ? {total_frames: ir.totalFrames, fps: ir.fps, warnings} : {}),
  });

  void queueDriver.enqueue({jobId: job.id, ir, warnings, frames});
});

/**
 * Execute one render task — shared by the memory path (immediate) and the
 * bullmq consumer path (tasks 7.2). Updates the in-memory job table and
 * broadcasts WS events; `report` additionally mirrors progress into the
 * BullMQ Job when queued.
 */
async function executeTask(
  task: RenderTask,
  report: (progress: number) => void | Promise<void>,
): Promise<void> {
  const {jobId, ir, warnings, frames} = task;
  const job = jobs.get(jobId) ?? {
    id: jobId,
    status: 'queued' as JobStatus,
    progress: 0,
  };
  jobs.set(jobId, job);

  job.status = 'rendering';
  broadcast({job_id: job.id, status: job.status, progress: 0, ...(frames ? {partial: true, frames} : {})});

  // Render-whitelist / asset degradations surface as WS warnings (design D8)
  // and never interrupt the render.
  for (const warning of warnings) {
    broadcast({job_id: job.id, type: 'warning', ...warning});
  }

  // 7.1: range not aligned to scene boundaries → best-effort warning.
  if (frames && ir && !rangeAlignsToScenes(ir.scenes, frames)) {
    broadcast({
      job_id: job.id,
      type: 'warning',
      code: 'partial-range-misaligned',
      message: `frames [${frames.start}, ${frames.end}] 未对齐分屏边界，拼接处可能有画面跳变`,
    });
  }

  try {
    const rendered = await renderToMp4({
      jobId: job.id,
      outDir: RENDER_OUT_DIR,
      compositionId: ir ? CONCEPT_COMPOSITION_ID : undefined,
      inputProps: ir ? {ir} : undefined,
      frameRange: frames,
      onProgress: (progress) => {
        job.progress = progress;
        void report(progress);
        broadcast({job_id: job.id, status: 'rendering', progress});
      },
    });

    let output = rendered;
    let splice: 'copy' | 'reencode' | undefined;
    if (frames && ir) {
      const fullPath = path.join(RENDER_OUT_DIR, `${job.id}.mp4`);
      if (fs.existsSync(fullPath)) {
        splice = spliceSegmentIntoFull(fullPath, rendered, frames, ir.fps);
        output = fullPath;
      } else {
        // 无整片可拼：降级为只出片段 + warning（产物即片段文件）。
        broadcast({
          job_id: job.id,
          type: 'warning',
          code: 'partial-no-full',
          message: `未找到整片 ${fullPath}，本次只输出片段 ${path.basename(rendered)}`,
        });
      }
    }

    job.status = 'done';
    job.progress = 1;
    job.output = output;
    broadcast({
      job_id: job.id,
      status: 'done',
      progress: 1,
      output,
      ...(frames ? {partial: true, frames, ...(splice ? {splice} : {})} : {}),
    });
  } catch (err) {
    job.status = 'error';
    job.error = err instanceof Error ? err.message : String(err);
    broadcast({job_id: job.id, status: 'error', progress: job.progress, error: job.error});
    if (queueDriver.mode === 'bullmq') throw err; // let BullMQ mark the job failed
  }
}

const QUEUE_ENABLED = process.env.QUEUE_ENABLED === 'true';
const queueDriver = createQueueDriver({
  enabled: QUEUE_ENABLED,
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  concurrency: Number(process.env.QUEUE_CONCURRENCY ?? 2),
  execute: executeTask,
  onQueueError: (task, err) => {
    console.error(
      `[remotion-worker] queue enqueue failed (${String(err)}) — falling back to immediate render`,
    );
    broadcast({
      job_id: task.jobId,
      type: 'warning',
      code: 'queue-unavailable',
      message: `redis 不可达，任务 ${task.jobId} 回退为立即渲染`,
    });
    void executeTask(task, () => {});
  },
});

server.listen(PORT, () => {
  console.log(`[remotion-worker] listening on :${PORT}`);
  console.log(`[remotion-worker] render output dir: ${RENDER_OUT_DIR}`);
  console.log(`[remotion-worker] queue mode: ${queueDriver.mode}`);
});
