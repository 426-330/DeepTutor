/**
 * 局部重渲染场景的独立快速复跑（verify.ts [11] 的单独入口）：
 *   npx tsx scripts/verify-partial.ts
 * 用于迭代 partial 拼接逻辑时避免全量 verify。
 */
import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseVideoSpec} from '../src/parser/index.js';
import {spliceSegmentIntoFull} from '../src/partial.js';
import {CONCEPT_COMPOSITION_ID, renderToMp4} from '../src/render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_ROOT = path.resolve(__dirname, '..');
const EXAMPLES = path.join(WORKER_ROOT, 'examples');
const tmp = path.join(WORKER_ROOT, '.tmp-verify', 'partial');
const OUT_DIR = path.join(WORKER_ROOT, '.tmp-verify', 'renders');

fs.mkdirSync(path.join(tmp, 'partial_ep01', 'data'), {recursive: true});
const baseYaml = path.join(tmp, 'partial_ep01.yaml');
fs.copyFileSync(path.join(EXAMPLES, 'sample_ep01.yaml'), baseYaml);
fs.copyFileSync(
  path.join(EXAMPLES, 'sample_ep01', 'data', 'returns.csv'),
  path.join(tmp, 'partial_ep01', 'data', 'returns.csv'),
);

const ffprobeDuration = (mp4: string): number =>
  Number(
    execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', mp4,
    ]).toString().trim(),
  );

const frameHash = (mp4: string, sec: number): string => {
  const png = path.join(tmp, `frame-${sec}.png`);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(sec), '-i', mp4, '-frames:v', '1', png]);
  return crypto.createHash('md5').update(fs.readFileSync(png)).digest('hex');
};

const baseParsed = parseVideoSpec(baseYaml);
if (!baseParsed.ok) throw new Error('parse failed');
console.log('rendering full…');
const full = await renderToMp4({
  jobId: 'verify-partial',
  outDir: OUT_DIR,
  compositionId: CONCEPT_COMPOSITION_ID,
  inputProps: {ir: baseParsed.ir},
});
const before = {duration: ffprobeDuration(full), s01: frameHash(full, 10 / 30), s02: frameHash(full, 60 / 30)};

const modifiedYaml = path.join(tmp, 'partial_ep01_v2.yaml');
fs.writeFileSync(
  modifiedYaml,
  fs.readFileSync(baseYaml, 'utf8').replace('最大回撤的定义', '回撤公式（局部重渲版）'),
);
const modParsed = parseVideoSpec(modifiedYaml);
if (!modParsed.ok) throw new Error('parse failed');
console.log('rendering segment [45,89]…');
const segment = await renderToMp4({
  jobId: 'verify-partial',
  outDir: OUT_DIR,
  compositionId: CONCEPT_COMPOSITION_ID,
  inputProps: {ir: modParsed.ir},
  frameRange: {start: 45, end: 89},
});

const method = spliceSegmentIntoFull(full, segment, {start: 45, end: 89}, 30);
const after = {duration: ffprobeDuration(full), s01: frameHash(full, 10 / 30), s02: frameHash(full, 60 / 30)};
console.log(`splice method = ${method}`);
console.log(`duration ${before.duration.toFixed(3)} → ${after.duration.toFixed(3)}`);
console.log(`s02 changed: ${after.s02 !== before.s02}`);
console.log(`s01 identical: ${after.s01 === before.s01}`);
console.log(
  Math.abs(after.duration - before.duration) < 0.06 && after.s02 !== before.s02
    ? 'PARTIAL OK'
    : 'PARTIAL FAILED',
);
