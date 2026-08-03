/**
 * BullMQ queue smoke test (tasks.md 7.2):
 *
 *   # 1) start a throwaway redis
 *   docker run -d --name dt-redis-smoke -p 127.0.0.1:6399:6379 redis:7-alpine
 *   # 2) run
 *   npx tsx scripts/smoke-queue.ts
 *   # 3) cleanup
 *   docker rm -f dt-redis-smoke
 *
 * Boots the worker with QUEUE_ENABLED=true + QUEUE_CONCURRENCY=2, submits 3
 * render jobs at once and asserts: jobs are consumed with at most 2 active
 * concurrently, all reach done, and the 202 response reports queue=bullmq.
 */
import {spawn, type ChildProcess} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_ROOT = path.resolve(__dirname, '..');
const PORT = 30000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6399';
const OUT_DIR = path.join(WORKER_ROOT, '.tmp-smoke', 'queue-renders');
const CONCURRENCY = 2;

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  ✔ ${name}`);
  else {
    failures += 1;
    console.error(`  ✘ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error('server did not come up');
}

let server: ChildProcess | null = null;
try {
  server = spawn('npx', ['tsx', 'src/server.ts'], {
    cwd: WORKER_ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      RENDER_OUT_DIR: OUT_DIR,
      QUEUE_ENABLED: 'true',
      REDIS_URL,
      QUEUE_CONCURRENCY: String(CONCURRENCY),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr?.on('data', (d) => process.stderr.write(`[server] ${d}`));

  console.log('[0] wait for queued worker');
  await waitForServer();

  const events: Array<Record<string, unknown>> = [];
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/progress`);
  ws.on('message', (data) => events.push(JSON.parse(data.toString())));
  await new Promise<void>((resolve) => ws.on('open', () => resolve()));

  console.log('[1] submit 3 jobs at once (concurrency=2)');
  const jobIds = [1, 2, 3].map((i) => `queue-${i}-${Date.now()}`);
  for (const id of jobIds) {
    const res = await fetch(`${BASE}/render`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        job_id: id,
        yaml_path: path.join(WORKER_ROOT, 'examples', 'degrade_ep01.yaml'),
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    check(`${id}: 202 + queue=bullmq`, res.status === 202 && body.queue === 'bullmq',
      `${res.status} ${JSON.stringify(body)}`);
  }

  // Track concurrency: rendering-start → done per job; sample active count.
  const active = new Set<string>();
  let maxActive = 0;
  const deadline = Date.now() + 15 * 60 * 1000;
  const doneSet = new Set<string>();
  while (Date.now() < deadline && doneSet.size < jobIds.length) {
    for (const e of events) {
      const id = e.job_id as string;
      if (!jobIds.includes(id)) continue;
      if (e.status === 'rendering') active.add(id);
      if (e.status === 'done' || e.status === 'error') {
        active.delete(id);
        doneSet.add(id);
      }
    }
    maxActive = Math.max(maxActive, active.size);
    await sleep(200);
  }

  check('all 3 jobs done', doneSet.size === 3, `${doneSet.size}/3`);
  check(`max concurrent active ≤ ${CONCURRENCY}`, maxActive <= CONCURRENCY && maxActive >= 1,
    `observed maxActive=${maxActive}`);
  const errors = events.filter((e) => jobIds.includes(e.job_id as string) && e.status === 'error');
  check('no error events', errors.length === 0, JSON.stringify(errors).slice(0, 300));

  ws.close();
} finally {
  server?.kill('SIGTERM');
}

console.log(failures === 0 ? '\nQUEUE SMOKE PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
