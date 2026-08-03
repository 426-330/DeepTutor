/**
 * YAML → validated → normalized TS IR (DSL §11, design D4/D5/D6).
 *
 * Pipeline: read file → js-yaml → layout alias pre-normalization →
 * ajv (§10 schema) → §13 semantic review → IR build (defaults, style chain,
 * .align.json duration override, chart data inlining).
 */
import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';
import {readAlignOverride} from './align.js';
import {DEFAULT_BGM_VOLUME, findBgm, findSceneAudio} from './audio.js';
import {loadChartData} from './chartData.js';
import {
  resolveGlobalStyle,
  resolveSceneStyle,
  type RawSceneStyleBlock,
  type RawStyleBlock,
} from './styleChain.js';
import {getLayoutAliases} from './templates.js';
import {listInstalledSkills} from '../skills/generate.js';
import {validateSpec} from './validate.js';
import type {
  Narration,
  ParseResult,
  ParseWarning,
  SceneIR,
  SceneType,
  ValidationIssue,
  VideoIR,
  VisualSpec,
} from './types.js';
import {SUPPORTED_CHART_TYPES} from './types.js';

const DEFAULT_FPS = 30;
const DEFAULT_DURATION_FRAMES = 90;
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;

/** Slot keys consumed structurally; everything else passes through to IR. */
const STRUCTURAL_KEYS = new Set([
  'type',
  'layout',
  'duration_frames',
  'style',
  'title',
  'question',
  'core_message',
  'narration',
  'visual',
  'transition',
]);

interface RawScene {
  type: SceneType;
  layout: string;
  duration_frames?: number;
  style?: RawSceneStyleBlock;
  title: string;
  question: string;
  core_message: string;
  narration: Narration;
  visual: VisualSpec;
  transition?: {next_question?: string};
  [key: string]: unknown;
}

interface RawSpec {
  version: '3.0' | '3.1';
  series: string;
  episode: number;
  fps?: number;
  style?: RawStyleBlock;
  opening?: {title: string; subtitle?: string};
  scenes: RawScene[];
}

export class SpecValidationError extends Error {
  constructor(public readonly errors: ValidationIssue[]) {
    super(`spec validation failed (${errors.length} issue(s))`);
    this.name = 'SpecValidationError';
  }
}

// ---------------------------------------------------------------------------
// §13 semantic review (cross-field rules not covered by the schema).
// error 级 → ValidationIssue（拒渲染）；warning 级 → ParseWarning（不阻断）。
// Keep in sync with deeptutor/capabilities/video/validator.py (backend).
// ---------------------------------------------------------------------------

const OPENING_TITLE_MAX = 14;

/** 提取字符串的连续 2 字子串集合（去空白/标点），用于呼应启发式。 */
function bigrams(text: string): Set<string> {
  const clean = text.replace(/[\s\p{P}\p{S}]/gu, '');
  const grams = new Set<string>();
  for (let i = 0; i + 2 <= clean.length; i++) grams.add(clean.slice(i, i + 2));
  return grams;
}

function sharesBigram(a: string, b: string): boolean {
  const ga = bigrams(a);
  for (const g of bigrams(b)) if (ga.has(g)) return true;
  return false;
}

interface SemanticOutcome {
  errors: ValidationIssue[];
  warnings: ParseWarning[];
}

function semanticReview(spec: RawSpec): SemanticOutcome {
  const errors: ValidationIssue[] = [];
  const warnings: ParseWarning[] = [];
  const push = (
    sceneIndex: number | null,
    field: string,
    message: string,
  ): void => {
    errors.push({
      path: sceneIndex === null ? field : `/scenes/${sceneIndex}/${field}`,
      message,
      layer: 'semantic',
    });
  };
  const warn = (sceneIndex: number, message: string): void => {
    warnings.push({
      code: 'semantic-warning',
      scene: sceneIdOf(sceneIndex),
      message,
    });
  };

  // R4: opening.title ≤14 字（schema 已查，复查兜底）
  const openingTitle = spec.opening?.title;
  if (typeof openingTitle === 'string' && openingTitle.length > OPENING_TITLE_MAX) {
    push(null, '/opening/title', `opening.title ${openingTitle.length} 字，超过上限 ${OPENING_TITLE_MAX} 字 (§13.4)`);
  }

  spec.scenes.forEach((scene, i) => {
    // R1: formula 场景必配 numeric_example
    if (scene.type === 'formula' && !String(scene.numeric_example ?? '').trim()) {
      push(i, 'numeric_example', 'formula scene requires numeric_example (§13.1)');
    }
    // R2: conclusion 场景 key_cards 恰好 3 张
    if (
      scene.type === 'conclusion' &&
      (!Array.isArray(scene.key_cards) || scene.key_cards.length !== 3)
    ) {
      push(i, 'key_cards', 'conclusion scene requires exactly 3 key_cards (§13.2)');
    }
    // R5: narration.explanation 非空
    if (!String(scene.narration?.explanation ?? '').trim()) {
      push(i, 'narration.explanation', 'narration.explanation must be non-empty (§13.5)');
    }
    // R6: visual.primary 非空
    if (!String(scene.visual?.primary ?? '').trim()) {
      push(i, 'visual.primary', 'visual.primary must be non-empty (§13.6)');
    }
    // R7: chart 场景必配 data 外链
    if (scene.type === 'chart' && !String(scene.data ?? '').trim()) {
      push(i, 'data', 'chart scene requires a data reference (§13.7)');
    }
    // R8: 新场景必填槽位
    if (scene.type === 'big_number' && !String(scene.number ?? '').trim()) {
      push(i, 'number', 'big_number scene requires number (§13.8)');
    }
    if (scene.type === 'quote' && !String(scene.quote_text ?? '').trim()) {
      push(i, 'quote_text', 'quote scene requires quote_text (§13.8)');
    }
    if (
      scene.type === 'data_comparison' &&
      (!Array.isArray(scene.metrics) || scene.metrics.length < 2)
    ) {
      push(i, 'metrics', 'data_comparison scene requires ≥2 metrics (§13.8)');
    }
    if (scene.type === 'timeline' && (!Array.isArray(scene.events) || scene.events.length < 2)) {
      push(i, 'events', 'timeline scene requires ≥2 events (§13.8)');
    }
    if (scene.type === 'case_study' && !String(scene.result ?? '').trim()) {
      push(i, 'result', 'case_study scene requires result (§13.8)');
    }
    if (scene.type === 'recap' && (!Array.isArray(scene.points) || scene.points.length < 2)) {
      push(i, 'points', 'recap scene requires ≥2 points (§13.8)');
    }

    // W9: 非末屏建议填写 transition.next_question
    const nextQuestion = scene.transition?.next_question;
    if (i < spec.scenes.length - 1 && !String(nextQuestion ?? '').trim()) {
      warn(i, `transition.next_question missing — 建议填写以衔接下一屏 (§13.9)`);
    }
    // W10: next_question 与下一屏 question 呼应（启发式）
    const next = spec.scenes[i + 1];
    if (next && String(nextQuestion ?? '').trim() && String(next.question ?? '').trim()) {
      if (!sharesBigram(String(nextQuestion), String(next.question))) {
        warn(
          i,
          `transition.next_question 与下一屏 question 无重合（"${String(nextQuestion).slice(0, 20)}…" vs "${String(next.question).slice(0, 20)}…"），注意衔接 (§13.10)`,
        );
      }
    }
  });

  return {errors, warnings};
}

// ---------------------------------------------------------------------------
// IR build
// ---------------------------------------------------------------------------

function sceneIdOf(index: number): string {
  return `s${String(index + 1).padStart(2, '0')}`;
}

function buildIr(
  spec: RawSpec,
  yamlPath: string,
  warnings: ParseWarning[],
  installedSkills: ReadonlySet<string>,
): VideoIR {
  const fps = spec.fps ?? DEFAULT_FPS;
  const globalStyle = resolveGlobalStyle(spec.style);

  let cursor = 0;
  const scenes: SceneIR[] = spec.scenes.map((scene, index) => {
    const id = sceneIdOf(index);
    const style = resolveSceneStyle(globalStyle, scene.style);

    // §11.1 default injection + §11.4 align.json override (IR only, D6).
    let durationFrames = scene.duration_frames ?? DEFAULT_DURATION_FRAMES;
    let durationSource: SceneIR['durationSource'] =
      scene.duration_frames !== undefined ? 'dsl' : 'default';
    const align = readAlignOverride(yamlPath, id, fps, warnings);
    if (align?.durationFrames !== undefined) {
      durationFrames = align.durationFrames;
      durationSource = 'align';
    }

    // §4.5 chart data inlining + unsupported chart_type warning (D8 白名单).
    let chartData: SceneIR['chartData'];
    if (scene.type === 'chart') {
      const chartType = scene.chart_type as string | undefined;
      if (chartType && !SUPPORTED_CHART_TYPES.includes(chartType as never)) {
        warnings.push({
          code: 'chart-type-unsupported',
          scene: id,
          message: `chart_type "${chartType}" is not supported by the minimal chart component — placeholder frame`,
        });
      }
      if (typeof scene.data === 'string' && scene.data.length > 0) {
        chartData = loadChartData(yamlPath, id, scene.data, warnings);
      } else {
        chartData = null;
        warnings.push({
          code: 'chart-data-missing',
          scene: id,
          message: 'chart scene has no `data` reference',
        });
      }
    }

    // particles 背景（task 6.2）：技能已安装 → 保留 R3F 渲染；
    // 未安装/未声明 skill → 渐变降级 + warning（D8 白名单）。
    if (style.effects.background.type === 'particles') {
      const skill = style.effects.background.skill;
      if (!skill || !installedSkills.has(skill)) {
        warnings.push({
          code: 'skill-not-installed',
          scene: id,
          message: `background skill "${
            skill ?? 'n/a'
          }" is not installed under video_dsl/skills/ — degraded to gradient`,
        });
        style.effects = {...style.effects, background: {type: 'gradient'}};
      }
    }

    const slots: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(scene)) {
      if (!STRUCTURAL_KEYS.has(key)) slots[key] = value;
    }

    const ir: SceneIR = {
      index,
      id,
      type: scene.type,
      layout: scene.layout,
      startFrame: cursor,
      durationFrames,
      durationSource,
      style,
      title: scene.title,
      question: scene.question,
      coreMessage: scene.core_message,
      narration: scene.narration,
      visual: scene.visual,
      nextQuestion: scene.transition?.next_question,
      slots,
      chartData,
      cues: align?.cues,
      // M2: voiceover discovered by asset-dir convention (silent when absent).
      audioUrl: findSceneAudio(yamlPath, id) ?? undefined,
    };
    cursor += durationFrames;
    return ir;
  });

  return {
    version: spec.version,
    series: spec.series,
    episode: spec.episode,
    fps,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    totalFrames: cursor,
    opening: spec.opening,
    style: globalStyle,
    scenes,
    bgm: (() => {
      const url = findBgm(yamlPath);
      return url ? {url, volume: DEFAULT_BGM_VOLUME} : undefined;
    })(),
  };
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/**
 * Parse a Concept Video YAML spec into a validated, normalized IR.
 * Alias resolution runs before schema validation so aliased layout names
 * (e.g. `split-screen`) are accepted; unknown ids are then caught by the
 * schema enum. The YAML file itself is never modified.
 */
export function parseVideoSpec(yamlPath: string): ParseResult {
  const resolvedPath = path.isAbsolute(yamlPath)
    ? yamlPath
    : path.resolve(process.cwd(), yamlPath);

  let text: string;
  try {
    text = fs.readFileSync(resolvedPath, 'utf8');
  } catch (err) {
    return {
      ok: false,
      errors: [
        {
          path: '/',
          message: `cannot read spec file ${resolvedPath}: ${
            err instanceof Error ? err.message : String(err)
          }`,
          layer: 'yaml',
        },
      ],
    };
  }

  let doc: unknown;
  try {
    doc = yaml.load(text);
  } catch (err) {
    return {
      ok: false,
      errors: [
        {
          path: '/',
          message: `YAML parse error: ${
            err instanceof Error ? err.message : String(err)
          }`,
          layer: 'yaml',
        },
      ],
    };
  }

  // §11.2 layout alias pre-normalization (mutates the in-memory doc only).
  const aliases = getLayoutAliases();
  const scenes = (doc as {scenes?: Array<{layout?: string}>})?.scenes;
  if (Array.isArray(scenes)) {
    for (const scene of scenes) {
      if (scene && typeof scene.layout === 'string' && aliases[scene.layout]) {
        scene.layout = aliases[scene.layout];
      }
    }
  }

  const schemaIssues = validateSpec(doc);
  if (schemaIssues.length > 0) return {ok: false, errors: schemaIssues};

  const spec = doc as RawSpec;
  const semantic = semanticReview(spec);
  if (semantic.errors.length > 0) return {ok: false, errors: semantic.errors};

  const warnings: ParseWarning[] = [...semantic.warnings];
  const installedSkills = new Set(listInstalledSkills().map((s) => s.id));
  const ir = buildIr(spec, resolvedPath, warnings, installedSkills);
  return {ok: true, ir, warnings};
}

/** Throwing variant for call sites that prefer exceptions. */
export function parseVideoSpecOrThrow(yamlPath: string): {
  ir: VideoIR;
  warnings: ParseWarning[];
} {
  const result = parseVideoSpec(yamlPath);
  if (!result.ok) throw new SpecValidationError(result.errors);
  return {ir: result.ir, warnings: result.warnings};
}
