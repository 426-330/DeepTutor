/**
 * HTTP + WS smoke test for the worker server (design D4 contract):
 *
 *   npx tsx scripts/smoke-http.ts
 *
 * Boots the server on a scratch port, then:
 *  1. POST /render with a valid spec → 202 (+ total_frames/fps in the body)
 *  2. WS receives warning events (degrade sample) then progress → done
 *  3. renders/<job_id>.mp4 exists on disk
 *  4. POST /render with an invalid spec → 400 + structured error details,
 *     and an error event is pushed over WS
 *  5. GET /health → ok
 */
import {execFileSync, spawn, type ChildProcess} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_ROOT = path.resolve(__dirname, '..');
// Random port — a stale server from an earlier run must not answer instead.
const PORT = 30000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT_DIR = path.join(WORKER_ROOT, '.tmp-smoke', 'renders');

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
    env: {...process.env, PORT: String(PORT), RENDER_OUT_DIR: OUT_DIR},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr?.on('data', (d) => process.stderr.write(`[server] ${d}`));

  console.log('[0] wait for server');
  await waitForServer();
  check('GET /health → ok', true);

  // WS client collecting events.
  const events: Array<Record<string, unknown>> = [];
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/progress`);
  ws.on('message', (data) => events.push(JSON.parse(data.toString())));
  await new Promise<void>((resolve) => ws.on('open', () => resolve()));

  console.log('[1] POST /render — valid spec with degradations');
  const jobId = `smoke-${Date.now()}`;
  const res = await fetch(`${BASE}/render`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      job_id: jobId,
      yaml_path: path.join(WORKER_ROOT, 'examples', 'degrade_ep01.yaml'),
    }),
  });
  check('202 accepted', res.status === 202, `got ${res.status}`);
  const body = (await res.json()) as Record<string, unknown>;
  check('response carries total_frames/fps', body.total_frames === 60 && body.fps === 30,
    JSON.stringify(body));
  check('response carries warnings', Array.isArray(body.warnings) && body.warnings.length >= 2);

  console.log('[2] wait for WS done event');
  const deadline = Date.now() + 10 * 60 * 1000;
  let done: Record<string, unknown> | undefined;
  while (Date.now() < deadline) {
    done = events.find((e) => e.job_id === jobId && e.status === 'done');
    if (done) break;
    const failed = events.find((e) => e.job_id === jobId && e.status === 'error');
    if (failed) throw new Error(`render failed: ${JSON.stringify(failed)}`);
    await sleep(1000);
  }
  check('WS done event received', !!done);
  const warnings = events.filter((e) => e.job_id === jobId && e.type === 'warning');
  check(
    'WS warning events (chart-type-unsupported + skill-not-installed)',
    warnings.some((w) => w.code === 'chart-type-unsupported') &&
      warnings.some((w) => w.code === 'skill-not-installed'),
    JSON.stringify(warnings.map((w) => w.code)),
  );
  check('WS progress events seen', events.some((e) => e.job_id === jobId && e.status === 'rendering'));
  const mp4 = path.join(OUT_DIR, `${jobId}.mp4`);
  check('mp4 exists', fs.existsSync(mp4), mp4);
  if (done) check('done event output path matches', done.output === mp4);

  console.log('[3] POST /render — invalid spec → 400 + structured errors');
  const eventsBefore = events.length;
  const bad = await fetch(`${BASE}/render`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      job_id: `smoke-bad-${Date.now()}`,
      yaml_path: path.join(WORKER_ROOT, 'examples', 'invalid-bad-hex.yaml'),
    }),
  });
  check('400 rejected', bad.status === 400, `got ${bad.status}`);
  const badBody = (await bad.json()) as {error?: string; details?: Array<{path: string; message: string}>};
  check(
    'structured error details (path + message)',
    Array.isArray(badBody.details) &&
      badBody.details.length > 0 &&
      typeof badBody.details[0].path === 'string' &&
      typeof badBody.details[0].message === 'string',
    JSON.stringify(badBody).slice(0, 300),
  );
  await sleep(1000);
  const errorEvents = events
    .slice(eventsBefore)
    .filter((e) => e.status === 'error' && Array.isArray(e.details));
  check('WS error event pushed for rejected spec', errorEvents.length > 0);

  console.log('[4] POST /render — no yaml_path → M0 HelloWorld fallback');
  const m0JobId = `smoke-m0-${Date.now()}`;
  const m0 = await fetch(`${BASE}/render`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({job_id: m0JobId}),
  });
  check('202 accepted (M0 fallback)', m0.status === 202, `got ${m0.status}`);
  const m0Deadline = Date.now() + 10 * 60 * 1000;
  let m0Done: Record<string, unknown> | undefined;
  while (Date.now() < m0Deadline) {
    m0Done = events.find((e) => e.job_id === m0JobId && e.status === 'done');
    if (m0Done) break;
    if (events.find((e) => e.job_id === m0JobId && e.status === 'error')) break;
    await sleep(1000);
  }
  check('M0 fallback renders to done', !!m0Done);
  check('M0 mp4 exists', fs.existsSync(path.join(OUT_DIR, `${m0JobId}.mp4`)));

  console.log('[5] POST /render — audio sample with bgm_volume override (M2)');
  const audioJobId = `smoke-audio-${Date.now()}`;
  const audioRes = await fetch(`${BASE}/render`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      job_id: audioJobId,
      yaml_path: path.join(WORKER_ROOT, 'examples', 'audio_ep01.yaml'),
      bgm_volume: 0.2,
    }),
  });
  check('202 accepted (audio job)', audioRes.status === 202, `got ${audioRes.status}`);
  const audioDeadline = Date.now() + 10 * 60 * 1000;
  let audioDone: Record<string, unknown> | undefined;
  while (Date.now() < audioDeadline) {
    audioDone = events.find((e) => e.job_id === audioJobId && e.status === 'done');
    if (audioDone) break;
    const failed = events.find((e) => e.job_id === audioJobId && e.status === 'error');
    if (failed) throw new Error(`audio render failed: ${JSON.stringify(failed)}`);
    await sleep(1000);
  }
  check('audio job done', !!audioDone);
  const audioMp4 = path.join(OUT_DIR, `${audioJobId}.mp4`);
  check('audio mp4 exists', fs.existsSync(audioMp4), audioMp4);
  if (fs.existsSync(audioMp4)) {
    const probe = JSON.parse(
      execFileSync('ffprobe', [
        '-v', 'error',
        '-select_streams', 'a',
        '-show_entries', 'stream=codec_name',
        '-of', 'json',
        audioMp4,
      ]).toString(),
    ) as {streams?: Array<{codec_name: string}>};
    check(
      'audio job mp4 has aac audio stream (voiceover + BGM mix)',
      (probe.streams ?? []).some((s) => s.codec_name === 'aac'),
      JSON.stringify(probe),
    );
    const dur = Number(
      execFileSync('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        audioMp4,
      ]).toString().trim(),
    );
    check('audio job duration ≈ 3.5s (60f + 45f @30fps)', Math.abs(dur - 3.5) < 0.2, `${dur}s`);
  }

  console.log('[6] 局部重渲染（tasks 7.1，HTTP 路径）');
  const waitDone = async (id: string, minDone = 1): Promise<Record<string, unknown> | undefined> => {
    const deadline = Date.now() + 10 * 60 * 1000;
    for (;;) {
      // 同 job 可能先整片后局部各有一次 done —— 取最后一个。
      const doneEvents = events.filter((e) => e.job_id === id && e.status === 'done');
      if (doneEvents.length >= minDone) return doneEvents[doneEvents.length - 1];
      const failed = events.find((e) => e.job_id === id && e.status === 'error');
      if (failed) throw new Error(`render failed: ${JSON.stringify(failed)}`);
      if (Date.now() > deadline) return undefined;
      await sleep(1000);
    }
  };
  const probeDuration = (mp4: string): number =>
    Number(
      execFileSync('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        mp4,
      ]).toString().trim(),
    );

  const partialJobId = `smoke-partial-${Date.now()}`;
  const tmpDir = path.join(WORKER_ROOT, '.tmp-smoke', 'partial_ep01', 'data');
  fs.mkdirSync(tmpDir, {recursive: true});
  const tmpYaml = path.join(WORKER_ROOT, '.tmp-smoke', 'partial_ep01.yaml');
  fs.copyFileSync(path.join(WORKER_ROOT, 'examples', 'sample_ep01.yaml'), tmpYaml);
  fs.copyFileSync(
    path.join(WORKER_ROOT, 'examples', 'sample_ep01', 'data', 'returns.csv'),
    path.join(tmpDir, 'returns.csv'),
  );
  // ① 整片渲染
  const fullRes = await fetch(`${BASE}/render`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({job_id: partialJobId, yaml_path: tmpYaml}),
  });
  check('202 accepted (full render for partial)', fullRes.status === 202);
  check('full render done', !!(await waitDone(partialJobId)));
  const fullMp4 = path.join(OUT_DIR, `${partialJobId}.mp4`);
  const durationBefore = probeDuration(fullMp4);

  // ② 改一屏标题 → frames 局部重渲（同 job_id，拼回原片）
  const modifiedYaml = path.join(WORKER_ROOT, '.tmp-smoke', 'partial_ep01_v2.yaml');
  fs.mkdirSync(path.join(WORKER_ROOT, '.tmp-smoke', 'partial_ep01_v2', 'data'), {recursive: true});
  fs.copyFileSync(
    path.join(WORKER_ROOT, 'examples', 'sample_ep01', 'data', 'returns.csv'),
    path.join(WORKER_ROOT, '.tmp-smoke', 'partial_ep01_v2', 'data', 'returns.csv'),
  );
  fs.writeFileSync(
    modifiedYaml,
    fs.readFileSync(tmpYaml, 'utf8').replace('最大回撤的定义', '回撤公式（局部重渲版）'),
  );
  const partRes = await fetch(`${BASE}/render`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      job_id: partialJobId,
      yaml_path: modifiedYaml,
      frames: {start: 45, end: 89},
    }),
  });
  check('202 accepted (partial re-render)', partRes.status === 202, `got ${partRes.status}`);
  const partBody = (await partRes.json()) as Record<string, unknown>;
  check('response partial: true + frames', partBody.partial === true, JSON.stringify(partBody));
  const partDone = await waitDone(partialJobId, 2);
  check('partial done event carries partial/splice',
    partDone?.partial === true && typeof partDone?.splice === 'string',
    JSON.stringify(partDone));
  check('partial output == 整片路径', partDone?.output === fullMp4);
  const durationAfter = probeDuration(fullMp4);
  check('拼接后总时长不变', Math.abs(durationAfter - durationBefore) < 0.2,
    `${durationBefore} → ${durationAfter}`);

  // ③ 无整片降级：frames 直接提交新 job → 只出片段 + warning
  const orphanJobId = `smoke-orphan-${Date.now()}`;
  const eventsBeforeOrphan = events.length;
  const orphanRes = await fetch(`${BASE}/render`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({job_id: orphanJobId, yaml_path: tmpYaml, frames: {start: 45, end: 89}}),
  });
  check('202 accepted (orphan partial)', orphanRes.status === 202);
  const orphanDone = await waitDone(orphanJobId);
  check('orphan partial done', !!orphanDone);
  check('orphan outputs segment file (.partial-)',
    typeof orphanDone?.output === 'string' && (orphanDone.output as string).includes('.partial-45-89'),
    JSON.stringify(orphanDone));
  check(
    'WS warning partial-no-full',
    events.slice(eventsBeforeOrphan).some((e) => e.type === 'warning' && e.code === 'partial-no-full'),
  );

  ws.close();
} finally {
  server?.kill('SIGTERM');
}

console.log(failures === 0 ? '\nSMOKE PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
