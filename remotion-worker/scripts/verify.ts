/**
 * CI-friendly verification for the YAML → IR → render pipeline (tasks
 * 4.3 / 4.4 / 4.6). Runs parser assertions, real renders and ffprobe
 * duration checks:
 *
 *   npx tsx scripts/verify.ts            # all checks
 *   VERIFY_SKIP_RENDER=1 npx tsx scripts/verify.ts   # parser-only checks
 *
 * Checks:
 *  1. positive sample parses; style chain + alias + defaults verified
 *  2. positive render → mp4 duration == Σ scene durations (ffprobe)
 *  3. negative samples (bare hex / unknown type) rejected with structured errors
 *  4. degrade sample renders with warnings (placeholder frames, no interruption)
 *  5. fake align.json overrides duration_frames (mp4 duration changes)
 *  6. audio sample: per-scene voiceover + BGM bed → aac stream, non-silent;
 *     silent (no-audio) sample renders fine and stays silent
 */
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as yaml from 'js-yaml';
import {parseVideoSpec} from '../src/parser/index.js';
import {getLayoutAliases} from '../src/parser/templates.js';
import {LAYOUT_IDS, SCENE_TYPES} from '../src/parser/types.js';
import {spliceSegmentIntoFull} from '../src/partial.js';
import {CONCEPT_COMPOSITION_ID, renderToMp4} from '../src/render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_ROOT = path.resolve(__dirname, '..');
const EXAMPLES = path.join(WORKER_ROOT, 'examples');
const OUT_DIR = path.join(WORKER_ROOT, '.tmp-verify', 'renders');
const SKIP_RENDER = process.env.VERIFY_SKIP_RENDER === '1';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    console.log(`  ✔ ${name}`);
  } else {
    failures += 1;
    console.error(`  ✘ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function ffprobeDuration(mp4: string): number {
  const out = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    mp4,
  ]).toString().trim();
  return Number(out);
}

async function renderAndProbe(
  jobId: string,
  yamlPath: string,
  expectedSeconds: number,
): Promise<void> {
  const parsed = parseVideoSpec(yamlPath);
  if (!parsed.ok) throw new Error(`parse failed for ${yamlPath}`);
  for (const w of parsed.warnings) console.log(`    [warning] ${w.code} ${w.scene ?? ''}: ${w.message}`);
  const mp4 = await renderToMp4({
    jobId,
    outDir: OUT_DIR,
    compositionId: CONCEPT_COMPOSITION_ID,
    inputProps: {ir: parsed.ir},
    onProgress: (p) => process.stdout.write(`\r    rendering ${jobId}: ${(p * 100).toFixed(0)}%`),
  });
  process.stdout.write('\n');
  const duration = ffprobeDuration(mp4);
  console.log(`    ffprobe duration = ${duration.toFixed(3)}s (expected ≈ ${expectedSeconds.toFixed(3)}s)`);
  check(
    `${jobId}: duration ≈ Σ scene durations`,
    Math.abs(duration - expectedSeconds) < 0.2,
    `got ${duration.toFixed(3)}s`,
  );
  return mp4;
}

function ffprobeAudioStreams(mp4: string): Array<{codec_name: string; channels?: number}> {
  const out = execFileSync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'a',
    '-show_entries', 'stream=codec_name,channels',
    '-of', 'json',
    mp4,
  ]).toString();
  return (JSON.parse(out).streams ?? []) as Array<{codec_name: string; channels?: number}>;
}

/** Mean volume in dB via ffmpeg volumedetect (very negative ≈ silent). */
function meanVolumeDb(mp4: string): number {
  const result = spawnSync('ffmpeg', [
    '-i', mp4,
    '-af', 'volumedetect',
    '-f', 'null', '-',
  ], {encoding: 'utf8'});
  const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(result.stderr ?? '');
  return m ? Number(m[1]) : -Infinity;
}

// ---------------------------------------------------------------------------
console.log('[0] DSL 三处一致性（schema 枚举 ↔ templates ↔ worker 类型）');
{
  const REPO_ROOT = path.resolve(WORKER_ROOT, '..');
  const schema = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'video_dsl', 'schema', 'concept-video.schema.json'), 'utf8'),
  );
  const templates = yaml.load(
    fs.readFileSync(path.join(REPO_ROOT, 'video_dsl', 'concept-video-scene-templates.yaml'), 'utf8'),
  ) as {layout_library?: Array<{name: string}>; layout_aliases?: Record<string, string>};

  const schemaTypes = schema.$defs.scene.properties.type.enum as string[];
  const schemaLayouts = schema.$defs.scene.properties.layout.enum as string[];
  const libraryLayouts = (templates.layout_library ?? []).map((l) => l.name);
  const aliases = getLayoutAliases();

  check('scene type: schema == worker SCENE_TYPES (13)',
    JSON.stringify([...schemaTypes].sort()) === JSON.stringify([...SCENE_TYPES].sort()),
    `${schemaTypes.length} vs ${SCENE_TYPES.length}`);
  check('layout: schema == templates layout_library (24)',
    JSON.stringify([...schemaLayouts].sort()) === JSON.stringify([...libraryLayouts].sort()),
    `${schemaLayouts.length} vs ${libraryLayouts.length}`);
  check('layout: schema == worker LAYOUT_IDS',
    JSON.stringify([...schemaLayouts].sort()) === JSON.stringify([...LAYOUT_IDS].sort()));
  check('layout aliases all resolve to canonical ids',
    Object.values(aliases).every((v) => schemaLayouts.includes(v)));
  check('themes: schema enum covers 4 builtin themes',
    ['default', 'quant-traditional', 'tech-minimal', 'warm-editorial'].every((t) =>
      (schema.$defs.globalStyle.properties.theme.enum as string[]).includes(t)));
}

// ---------------------------------------------------------------------------
console.log('[1] positive sample — parser checks');
const samplePath = path.join(EXAMPLES, 'sample_ep01.yaml');
const sample = parseVideoSpec(samplePath);
check('sample parses ok', sample.ok);
if (sample.ok) {
  const {ir} = sample;
  check('fps default injected (30)', ir.fps === 30);
  check('totalFrames = 45+45+45 = 135', ir.totalFrames === 135, `got ${ir.totalFrames}`);
  check('scene ids s01..s03', ir.scenes.map((s) => s.id).join(',') === 's01,s02,s03');
  check(
    'startFrames cumulative (0,45,90)',
    ir.scenes.map((s) => s.startFrame).join(',') === '0,45,90',
  );
  check(
    'global theme quant-traditional primary',
    ir.style.colors.primary === '#1A5FB4',
    ir.style.colors.primary,
  );
  check(
    'scene style remap: s03 primary → danger (#D64545)',
    ir.scenes[2].style.colors.primary === '#D64545',
    ir.scenes[2].style.colors.primary,
  );
  check(
    'scene style does not leak into other scenes (s01 primary unchanged)',
    ir.scenes[0].style.colors.primary === '#1A5FB4',
  );
  check(
    'scene effect override: s02 transition wipe-left/12',
    ir.scenes[1].style.effects.transition.type === 'wipe-left' &&
      ir.scenes[1].style.effects.transition.frames === 12,
  );
  check('chart data inlined (16 points)', ir.scenes[2].chartData?.points.length === 16);
  check('no warnings on positive sample', sample.warnings.length === 0, JSON.stringify(sample.warnings));
}

console.log('[2] layout alias pre-normalization');
{
  const aliasPath = path.join(EXAMPLES, 'alias_ep01.yaml');
  const parsed = parseVideoSpec(aliasPath);
  check('alias spec parses ok', parsed.ok);
  if (parsed.ok) {
    check(
      'split-screen → split, cards → card-grid-3',
      parsed.ir.scenes[0].layout === 'split' && parsed.ir.scenes[1].layout === 'card-grid-3',
      parsed.ir.scenes.map((s) => s.layout).join(','),
    );
  }
}

console.log('[3] negative samples — structured rejection');
for (const [file, expect] of [
  ['invalid-bad-hex.yaml', 'colors'],
  ['invalid-unknown-type.yaml', 'type'],
] as const) {
  const r = parseVideoSpec(path.join(EXAMPLES, file));
  check(`${file} rejected`, !r.ok);
  if (!r.ok) {
    check(
      `${file} structured errors (path + message + layer)`,
      r.errors.length > 0 &&
        r.errors.every((e) => typeof e.path === 'string' && e.message.length > 0 && !!e.layer),
    );
    check(`${file} error path mentions ${expect}`, r.errors.some((e) => e.path.includes(expect)),
      JSON.stringify(r.errors.map((e) => e.path)));
    console.log(`    errors: ${JSON.stringify(r.errors, null, 0).slice(0, 300)}`);
  }
}

console.log('[4] degrade sample — warnings without interrupting');
const degradePath = path.join(EXAMPLES, 'degrade_ep01.yaml');
const degrade = parseVideoSpec(degradePath);
check('degrade sample parses ok (warnings, not errors)', degrade.ok);
if (degrade.ok) {
  const codes = degrade.warnings.map((w) => w.code);
  check('chart-type-unsupported warning', codes.includes('chart-type-unsupported'), codes.join(','));
  check('skill-not-installed warning (three/nebula-storm 未安装)', codes.includes('skill-not-installed'), codes.join(','));
  check(
    'uninstalled skill degraded to gradient in IR',
    degrade.ir.scenes[1].style.effects.background.type === 'gradient',
  );
}

console.log('[4e] skills sample — installed three.js skills stay in IR (task 6.2)');
const skillsPath = path.join(EXAMPLES, 'skills_ep01.yaml');
const skillsParsed = parseVideoSpec(skillsPath);
check('skills sample parses ok', skillsParsed.ok,
  skillsParsed.ok ? '' : JSON.stringify(skillsParsed.errors));
if (skillsParsed.ok) {
  const bgs = skillsParsed.ir.scenes.map((s) => s.style.effects.background);
  check('3 scenes keep particles background (no degrade)',
    bgs.every((b) => b.type === 'particles'), JSON.stringify(bgs.map((b) => b.type)));
  check('skills referenced: particle-wave / floating-shapes / grid-terrain',
    bgs.map((b) => b.skill).join(',') === 'three/particle-wave,three/floating-shapes,three/grid-terrain');
  check('no skill-not-installed warnings',
    !skillsParsed.warnings.some((w) => w.code === 'skill-not-installed'));
}

console.log('[4b] audio sample — parser checks (M2: voiceover + BGM discovery)');
const audioPath = path.join(EXAMPLES, 'audio_ep01.yaml');
const audio = parseVideoSpec(audioPath);
check('audio sample parses ok', audio.ok);
if (audio.ok) {
  const {ir} = audio;
  check(
    'align durations: s01=60f / s02=45f, total 105',
    ir.scenes[0].durationFrames === 60 &&
      ir.scenes[1].durationFrames === 45 &&
      ir.totalFrames === 105,
    `${ir.scenes.map((s) => s.durationFrames).join('+')}=${ir.totalFrames}`,
  );
  check(
    'scene audioUrl discovered (file:// s01.wav / s02.wav)',
    ir.scenes.every((s) => s.audioUrl?.startsWith('file://') && s.audioUrl.endsWith('.wav')),
    ir.scenes.map((s) => s.audioUrl).join(', '),
  );
  check(
    'bgm discovered from bgm/ with default volume 0.15',
    ir.bgm?.url.endsWith('.wav') && ir.bgm.volume === 0.15,
    JSON.stringify(ir.bgm),
  );
  check('cues injected for subtitles', ir.scenes[0].cues?.length === 2);
}
check(
  'no-audio sample has no audioUrl/bgm (silent regression baseline)',
  sample.ok &&
    sample.ir.scenes.every((s) => s.audioUrl === undefined) &&
    sample.ir.bgm === undefined,
);

console.log('[4c] §13 全量规则（新 error 级 + warning 级）');
{
  const semDir = path.join(WORKER_ROOT, '.tmp-verify', 'sem');
  fs.mkdirSync(semDir, {recursive: true});
  const base = [
    'version: "3.1"', 'series: 语义复查', 'episode: 1', 'scenes:',
  ];
  const sceneYaml = (type: string, extra: string) => [
    `  - type: ${type}`,
    '    layout: centered-text',
    '    title: t', '    question: q', '    core_message: m',
    '    narration: { opening: "", explanation: "x", conclusion: "" }',
    '    visual: { primary: v }',
    '    transition: { next_question: "" }',
    extra,
  ].join('\n');

  // error 级：big_number 缺 number / recap points <2 / chart 缺 data / narration.explanation 空
  const cases: Array<[string, string, string]> = [
    ['big_number 缺 number', sceneYaml('big_number', ''), 'number'],
    ['recap points 不足 2 条', sceneYaml('recap', '    points: [ "only-one" ]'), 'points'],
    ['chart 缺 data', sceneYaml('chart', '    chart_type: line'), 'data'],
    ['narration.explanation 为空',
      sceneYaml('concept', '').replace('explanation: "x"', 'explanation: ""'),
      'narration.explanation'],
    ['visual.primary 为空',
      sceneYaml('concept', '').replace('primary: v', 'primary: ""'),
      'visual.primary'],
  ];
  for (const [name, sceneText, expectPath] of cases) {
    const p = path.join(semDir, 'case.yaml');
    fs.writeFileSync(p, [...base, sceneText].join('\n'));
    const r = parseVideoSpec(p);
    check(`§13 error: ${name}`, !r.ok && r.errors.some((e) => e.path.includes(expectPath) && e.layer === 'semantic'),
      r.ok ? 'unexpectedly ok' : JSON.stringify(r.errors.map((e) => e.path)));
  }

  // warning 级：next_question 缺失/不呼应 → ok + semantic-warning
  fs.writeFileSync(
    path.join(semDir, 'warn.yaml'),
    [
      ...base,
      '  - type: concept',
      '    layout: centered-text',
      '    title: t', '    question: 苹果为什么落地？', '    core_message: m',
      '    narration: { opening: "", explanation: "x", conclusion: "" }',
      '    visual: { primary: v }',
      '    transition: { next_question: "香蕉的价格是多少？" }',
      '    definition: d',
      '  - type: concept',
      '    layout: centered-text',
      '    title: t2', '    question: q2', '    core_message: m2',
      '    narration: { opening: "", explanation: "x", conclusion: "" }',
      '    visual: { primary: v }',
      '    transition: { next_question: "" }',
      '    definition: d2',
    ].join('\n'),
  );
  const wr = parseVideoSpec(path.join(semDir, 'warn.yaml'));
  check('§13 warning: 不呼应的 next_question 不阻断',
    wr.ok && wr.warnings.some((w) => w.code === 'semantic-warning'),
    wr.ok ? JSON.stringify(wr.warnings) : 'unexpectedly rejected');
}

console.log('[4d] full13 全量样本 — 13 场景 × 13 布局');
const full13Path = path.join(EXAMPLES, 'full13_ep01.yaml');
const full13 = parseVideoSpec(full13Path);
check('full13 parses ok', full13.ok,
  full13.ok ? '' : JSON.stringify(full13.errors));
if (full13.ok) {
  const {ir} = full13;
  check('13 scenes, totalFrames = 13×30 = 390',
    ir.scenes.length === 13 && ir.totalFrames === 390, `${ir.scenes.length}/${ir.totalFrames}`);
  check('覆盖全部 13 种场景 type',
    new Set(ir.scenes.map((s) => s.type)).size === 13);
  check('使用 13 种不同布局',
    new Set(ir.scenes.map((s) => s.layout)).size === 13,
    ir.scenes.map((s) => s.layout).join(','));
  check('tech-minimal 主题生效 (primary #0284C7)',
    ir.style.colors.primary === '#0284C7', ir.style.colors.primary);
  check('全量样本无 warning', full13.warnings.length === 0,
    JSON.stringify(full13.warnings));
}

// ---------------------------------------------------------------------------
if (!SKIP_RENDER) {
  console.log('[5] positive render + ffprobe (135 frames @30fps = 4.5s)');
  const sampleMp4 = await renderAndProbe('verify-sample', samplePath, 135 / 30);
  {
    // Silent regression: a spec without any audio assets must still render.
    // (This Remotion version always muxes an audio track; silence is the check.)
    const streams = ffprobeAudioStreams(sampleMp4);
    const meanDb = streams.length > 0 ? meanVolumeDb(sampleMp4) : -Infinity;
    console.log(`    audio streams in silent sample: ${streams.length}, mean_volume = ${meanDb.toFixed(1)} dB`);
    check(
      'no-audio sample renders silent (no stream or < -80 dB)',
      streams.length === 0 || meanDb < -80,
      `${streams.length} stream(s), ${meanDb} dB`,
    );
  }

  console.log('[6] degrade render completes (placeholder frames, 60 frames = 2.0s)');
  await renderAndProbe('verify-degrade', degradePath, 60 / 30);

  console.log('[7] align.json duration override (D6, YAML untouched)');
  const tmp = path.join(WORKER_ROOT, '.tmp-verify', 'align');
  fs.mkdirSync(path.join(tmp, 'align_ep01', 'audio'), {recursive: true});
  fs.mkdirSync(path.join(tmp, 'align_ep01', 'data'), {recursive: true});
  fs.copyFileSync(samplePath, path.join(tmp, 'align_ep01.yaml'));
  fs.copyFileSync(
    path.join(EXAMPLES, 'sample_ep01', 'data', 'returns.csv'),
    path.join(tmp, 'align_ep01', 'data', 'returns.csv'),
  );
  const before = fs.readFileSync(path.join(tmp, 'align_ep01.yaml'), 'utf8');
  // s01: 45 DSL frames → 2.0s real audio = 60 frames; total 60+45+45 = 150 (5.0s)
  fs.writeFileSync(
    path.join(tmp, 'align_ep01', 'audio', 's01.align.json'),
    JSON.stringify({
      duration_sec: 2.0,
      cues: [
        {start: 0, end: 1.0, text: '收益相同不代表体验相同。'},
        {start: 1.0, end: 2.0, text: '看回撤。'},
      ],
    }),
  );
  const alignParsed = parseVideoSpec(path.join(tmp, 'align_ep01.yaml'));
  check('align parse ok', alignParsed.ok);
  if (alignParsed.ok) {
    check(
      's01 duration overridden 45 → 60 (source=align)',
      alignParsed.ir.scenes[0].durationFrames === 60 &&
        alignParsed.ir.scenes[0].durationSource === 'align',
      `${alignParsed.ir.scenes[0].durationFrames} ${alignParsed.ir.scenes[0].durationSource}`,
    );
    check('totalFrames = 150', alignParsed.ir.totalFrames === 150);
    check('cues injected', (alignParsed.ir.scenes[0].cues ?? []).length === 2);
    check('YAML file untouched', fs.readFileSync(path.join(tmp, 'align_ep01.yaml'), 'utf8') === before);
  }
  await renderAndProbe('verify-align', path.join(tmp, 'align_ep01.yaml'), 150 / 30);

  console.log('[8] audio render — voiceover per scene + BGM bed (105 frames = 3.5s)');
  const audioMp4 = await renderAndProbe('verify-audio', audioPath, 105 / 30);
  {
    const streams = ffprobeAudioStreams(audioMp4);
    console.log(`    audio streams: ${JSON.stringify(streams)}`);
    check(
      'mp4 contains aac audio stream (mixed voiceover + BGM)',
      streams.some((s) => s.codec_name === 'aac'),
      JSON.stringify(streams),
    );
    const meanDb = meanVolumeDb(audioMp4);
    console.log(`    volumedetect mean_volume = ${meanDb.toFixed(1)} dB`);
    check('audio is not silent (mean_volume > -60 dB)', meanDb > -60, `${meanDb} dB`);
  }

  console.log('[9] full13 全量样本渲染（13 场景 × 13 布局，390 帧 = 13s）');
  await renderAndProbe('verify-full13', full13Path, 390 / 30);

  console.log('[10] skills 渲染 — 3 个 R3F 技能背景真实渲染（90 帧 = 3s）');
  await renderAndProbe('verify-skills', skillsPath, 90 / 30);

  console.log('[11] 局部重渲染（tasks 7.1：片段渲染 + 拼接 + 抽帧比对）');
  {
    const crypto = await import('node:crypto');
    const tmp = path.join(WORKER_ROOT, '.tmp-verify', 'partial');
    fs.mkdirSync(path.join(tmp, 'partial_ep01', 'data'), {recursive: true});
    const baseYaml = path.join(tmp, 'partial_ep01.yaml');
    fs.copyFileSync(samplePath, baseYaml);
    fs.copyFileSync(
      path.join(EXAMPLES, 'sample_ep01', 'data', 'returns.csv'),
      path.join(tmp, 'partial_ep01', 'data', 'returns.csv'),
    );

    const frameHash = (mp4: string, sec: number): string => {
      const png = path.join(tmp, `frame-${sec}.png`);
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(sec), '-i', mp4, '-frames:v', '1', png]);
      return crypto.createHash('md5').update(fs.readFileSync(png)).digest('hex');
    };

    // ① 整片渲染（135 帧，s02 = frames 45..89）
    const baseParsed = parseVideoSpec(baseYaml);
    if (!baseParsed.ok) throw new Error('partial base parse failed');
    const full = await renderToMp4({
      jobId: 'verify-partial',
      outDir: OUT_DIR,
      compositionId: CONCEPT_COMPOSITION_ID,
      inputProps: {ir: baseParsed.ir},
      onProgress: (p) => process.stdout.write(`\r    rendering verify-partial(full): ${(p * 100).toFixed(0)}%`),
    });
    process.stdout.write('\n');
    const before = {
      duration: ffprobeDuration(full),
      s01: frameHash(full, 10 / 30),
      s02: frameHash(full, 60 / 30),
    };

    // ② 修改 s02（formula 屏，标题变更）→ 只渲染 [45, 89] 片段
    const modifiedYaml = path.join(tmp, 'partial_ep01_v2.yaml');
    fs.writeFileSync(
      modifiedYaml,
      fs.readFileSync(baseYaml, 'utf8').replace('最大回撤的定义', '回撤公式（局部重渲版）'),
    );
    const modParsed = parseVideoSpec(modifiedYaml);
    if (!modParsed.ok) throw new Error('partial modified parse failed');
    const segment = await renderToMp4({
      jobId: 'verify-partial',
      outDir: OUT_DIR,
      compositionId: CONCEPT_COMPOSITION_ID,
      inputProps: {ir: modParsed.ir},
      frameRange: {start: 45, end: 89},
      onProgress: (p) => process.stdout.write(`\r    rendering verify-partial(segment): ${(p * 100).toFixed(0)}%`),
    });
    process.stdout.write('\n');
    check('segment file written (.partial-45-89.mp4)', segment.includes('.partial-45-89'));

    // ③ 拼接回原片
    const method = spliceSegmentIntoFull(full, segment, {start: 45, end: 89}, 30);
    console.log(`    splice method = ${method}`);
    const after = {
      duration: ffprobeDuration(full),
      s01: frameHash(full, 10 / 30),
      s02: frameHash(full, 60 / 30),
    };
    console.log(`    duration ${before.duration.toFixed(3)}s → ${after.duration.toFixed(3)}s`);
    check('总时长不变', Math.abs(after.duration - before.duration) < 0.2,
      `${before.duration} → ${after.duration}`);
    check('被改屏画面已更新 (s02 frame differs)', after.s02 !== before.s02);
    if (method === 'copy') {
      check('未改屏画面逐比特不变 (s01, stream-copy)', after.s01 === before.s01);
    } else {
      console.log('    (re-encode 兜底：未改屏不重比对像素，仅校验时长)');
    }
  }
} else {
  console.log('[5-11] renders skipped (VERIFY_SKIP_RENDER=1)');
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
