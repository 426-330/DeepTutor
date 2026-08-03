/**
 * Browser-side Concept Video spec model (video_dsl/concept-video-dsl.md).
 *
 * This mirrors the pure (fs-free) subset of remotion-worker's parser:
 * YAML text → tolerant IR for the in-browser Remotion Player preview.
 * It deliberately duplicates the IR-build half of
 * `remotion-worker/src/parser/index.ts` (`buildIr`) minus every fs concern
 * (.align.json durations, chart data inlining, audio/BGM discovery) — schema
 * validation stays server-side (PUT /spec), so the preview keeps rendering
 * with safe defaults while a spec is mid-edit.
 *
 * The style chain itself is NOT duplicated: `resolveGlobalStyle` /
 * `resolveSceneStyle` come from the worker's pure modules, vendored into
 * `@/vendor/remotion-preview/` by scripts/sync-remotion-preview.mjs.
 */
import * as yaml from "js-yaml";

import {
  resolveGlobalStyle,
  resolveSceneStyle,
  type RawSceneStyleBlock,
  type RawStyleBlock,
} from "@/vendor/remotion-preview/parser/styleChain";
import type {
  Narration,
  SceneIR,
  SceneType,
  VideoIR,
  VisualSpec,
} from "@/vendor/remotion-preview/parser/types";
import {
  CHART_TYPES,
  LAYOUT_IDS,
  SCENE_TYPES,
} from "@/vendor/remotion-preview/parser/types";

// Mirrors remotion-worker/src/parser/index.ts defaults.
const DEFAULT_FPS = 30;
const DEFAULT_DURATION_FRAMES = 90;
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;

/**
 * Copy of the `layout_aliases` table in
 * video_dsl/concept-video-scene-templates.yaml (§11.2). The worker reads it
 * from disk via parser/templates.ts (fs); the browser keeps an inline copy.
 */
export const LAYOUT_ALIASES: Record<string, string> = {
  hero: "full-hero",
  fullscreen: "full-hero",
  "split-screen": "split",
  "left-right": "split",
  center: "centered-text",
  centered: "centered-text",
  formula: "formula-focus",
  chart: "chart-full",
  "full-chart": "chart-full",
  "chart-caption": "chart-side",
  "three-cards": "card-grid-3",
  cards: "card-grid-3",
  list: "card-list",
  "bullet-list": "card-list",
  compare: "compare-2",
  versus: "compare-2",
  steps: "timeline",
  quote: "quote-emphasis",
  "golden-sentence": "quote-emphasis",
  closing: "title-closing",
  "end-card": "title-closing",
  bleed: "full-bleed",
  sidebar: "sidebar-left",
  "asymmetric-split": "split-40-60",
  stack: "stacked",
  "centered-quote": "quote-center",
  "timeline-h": "timeline-horizontal",
  "two-col": "comparison-2col",
  image: "image-focus",
  text: "text-focus",
  "grid-6": "grid-3x2",
  caption: "overlay-caption",
  "big-number": "number-spotlight",
};

export { LAYOUT_IDS, SCENE_TYPES, CHART_TYPES };

// ---------------------------------------------------------------------------
// Spec document (raw YAML) editing model
// ---------------------------------------------------------------------------

/** Raw spec document as parsed by js-yaml (loosely typed on purpose). */
export type SpecDoc = {
  version?: string;
  series?: string;
  episode?: number;
  fps?: number;
  style?: RawStyleBlock;
  opening?: { title?: string; subtitle?: string };
  scenes?: RawSceneDoc[];
  [key: string]: unknown;
};

export type RawSceneDoc = {
  type?: string;
  layout?: string;
  duration_frames?: number;
  style?: RawSceneStyleBlock;
  title?: string;
  question?: string;
  core_message?: string;
  narration?: Partial<Narration>;
  visual?: Partial<VisualSpec>;
  transition?: { next_question?: string };
  [key: string]: unknown;
};

export interface SpecParseIssue {
  message: string;
}

export type SpecParseResult =
  | { ok: true; doc: SpecDoc }
  | { ok: false; issues: SpecParseIssue[] };

/** Parse YAML text into a spec doc. Structural problems become issues. */
export function parseSpecText(text: string): SpecParseResult {
  let doc: unknown;
  try {
    doc = yaml.load(text);
  } catch (err) {
    return {
      ok: false,
      issues: [
        { message: err instanceof Error ? err.message : String(err) },
      ],
    };
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    return {
      ok: false,
      issues: [{ message: "spec root must be a YAML mapping" }],
    };
  }
  const spec = doc as SpecDoc;
  if (spec.scenes !== undefined && !Array.isArray(spec.scenes)) {
    return {
      ok: false,
      issues: [{ message: "`scenes` must be a list" }],
    };
  }
  return { ok: true, doc: spec };
}

/** Serialize a spec doc back to YAML (2-space indent, no line wrapping). */
export function dumpSpecDoc(doc: SpecDoc): string {
  return yaml.dump(doc, { lineWidth: -1, noRefs: true, indent: 2 });
}

// ---------------------------------------------------------------------------
// Preview IR build (fs-free mirror of the worker's buildIr)
// ---------------------------------------------------------------------------

export type PreviewResult =
  | { ok: true; ir: VideoIR }
  | { ok: false; issues: SpecParseIssue[] };

function sceneIdOf(index: number): string {
  return `s${String(index + 1).padStart(2, "0")}`;
}

function asNarration(raw: Partial<Narration> | undefined): Narration {
  return {
    opening: raw?.opening ?? "",
    explanation: raw?.explanation ?? "",
    conclusion: raw?.conclusion ?? "",
  };
}

function asVisual(raw: Partial<VisualSpec> | undefined): VisualSpec {
  return {
    primary: raw?.primary ?? "",
    secondary: raw?.secondary,
    emphasis: raw?.emphasis,
  };
}

/** Slot keys consumed structurally; everything else passes through to IR. */
const STRUCTURAL_KEYS = new Set([
  "type",
  "layout",
  "duration_frames",
  "style",
  "title",
  "question",
  "core_message",
  "narration",
  "visual",
  "transition",
]);

/**
 * Build a preview IR from YAML text. Never throws: unparseable YAML or a
 * structurally unusable document returns issues; missing per-scene fields
 * degrade to empty defaults so the Player keeps rendering mid-edit states.
 */
export function buildPreviewIr(text: string): PreviewResult {
  const parsed = parseSpecText(text);
  if (!parsed.ok) return { ok: false, issues: parsed.issues };
  const spec = parsed.doc;

  const globalStyle = resolveGlobalStyle(spec.style);
  const fps =
    typeof spec.fps === "number" && spec.fps > 0 ? spec.fps : DEFAULT_FPS;

  let cursor = 0;
  const scenes: SceneIR[] = (spec.scenes ?? []).map((scene, index) => {
    const layout =
      typeof scene.layout === "string"
        ? (LAYOUT_ALIASES[scene.layout] ?? scene.layout)
        : "centered-text";
    const style = resolveSceneStyle(globalStyle, scene.style);
    // particles 背景在 M3 之前降级为 gradient（与 worker parser 一致）。
    if (style.effects.background.type === "particles") {
      style.effects = { ...style.effects, background: { type: "gradient" } };
    }

    const slots: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(scene)) {
      if (!STRUCTURAL_KEYS.has(key)) slots[key] = value;
    }

    const durationFrames =
      typeof scene.duration_frames === "number" && scene.duration_frames >= 1
        ? scene.duration_frames
        : DEFAULT_DURATION_FRAMES;
    const ir: SceneIR = {
      index,
      id: sceneIdOf(index),
      type: (scene.type ?? "concept") as SceneType,
      layout,
      startFrame: cursor,
      durationFrames,
      durationSource: scene.duration_frames !== undefined ? "dsl" : "default",
      style,
      title: scene.title ?? "",
      question: scene.question ?? "",
      coreMessage: scene.core_message ?? "",
      narration: asNarration(scene.narration),
      visual: asVisual(scene.visual),
      nextQuestion: scene.transition?.next_question,
      slots,
      // 浏览器预览无 fs：图表外链数据 / 口播音频 / align 字幕一律缺席，
      // 对应组件降级为占位帧（与 worker parser 的 chart-data-missing 一致）。
      chartData: null,
    };
    cursor += durationFrames;
    return ir;
  });

  return {
    ok: true,
    ir: {
      version: spec.version === "3.0" ? "3.0" : "3.1",
      series: spec.series ?? "",
      episode: typeof spec.episode === "number" ? spec.episode : 1,
      fps,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      totalFrames: Math.max(cursor, 1),
      opening:
        spec.opening && typeof spec.opening.title === "string"
          ? { title: spec.opening.title, subtitle: spec.opening.subtitle }
          : undefined,
      style: globalStyle,
      scenes,
    },
  };
}

// ---------------------------------------------------------------------------
// Form-mode field descriptors (DSL §3 PageModel + §4 content_slots)
// ---------------------------------------------------------------------------

export type SlotFieldKind =
  | "text" // single-line string
  | "textarea" // multi-line string
  | "string-list" // string[], edited one item per line
  | "object-list" // object[] rows, fields per objectFields (DSL object slots)
  | "variables" // formula: {symbol, meaning}[] rows
  | "select" // closed enum
  | "axes"; // chart: {x, y} pair

export interface SlotObjectField {
  key: string;
  label: string;
  required?: boolean;
}

export interface SlotFieldDef {
  key: string;
  /** English label — used as the i18n key. */
  label: string;
  kind: SlotFieldKind;
  options?: readonly string[];
  /** kind === "object-list": per-row object fields (schema-defined shape). */
  objectFields?: readonly SlotObjectField[];
}

/** §4 per-type content_slots, in DSL order. */
export const SCENE_SLOT_FIELDS: Record<SceneType, SlotFieldDef[]> = {
  opening: [
    { key: "hook_line", label: "Hook line", kind: "textarea" },
    { key: "key_visual", label: "Key visual", kind: "text" },
    { key: "agenda", label: "Agenda", kind: "string-list" },
  ],
  problem_hook: [
    { key: "phenomenon", label: "Phenomenon", kind: "textarea" },
    { key: "counter_question", label: "Counter question", kind: "textarea" },
    { key: "promise", label: "Promise", kind: "textarea" },
  ],
  concept: [
    { key: "definition", label: "Definition", kind: "textarea" },
    { key: "analogy", label: "Analogy", kind: "textarea" },
    { key: "key_points", label: "Key points", kind: "string-list" },
    { key: "misconception", label: "Misconception", kind: "textarea" },
  ],
  formula: [
    { key: "formula", label: "Formula (KaTeX)", kind: "text" },
    { key: "variables", label: "Variables", kind: "variables" },
    { key: "numeric_example", label: "Numeric example", kind: "text" },
    { key: "derivation", label: "Derivation", kind: "textarea" },
  ],
  chart: [
    {
      key: "chart_type",
      label: "Chart type",
      kind: "select",
      options: CHART_TYPES,
    },
    { key: "data", label: "Data file", kind: "text" },
    { key: "axes", label: "Axes", kind: "axes" },
    { key: "insight", label: "Insight", kind: "textarea" },
  ],
  conclusion: [
    { key: "key_cards", label: "Key cards (exactly 3)", kind: "string-list" },
    { key: "takeaway", label: "Takeaway", kind: "textarea" },
    { key: "call_to_action", label: "Call to action", kind: "textarea" },
  ],
  summary: [
    { key: "recap_points", label: "Recap points", kind: "string-list" },
    { key: "next_episode", label: "Next episode", kind: "text" },
    { key: "series_cta", label: "Series CTA", kind: "text" },
  ],
  data_comparison: [
    {
      key: "metrics",
      label: "Metrics",
      kind: "object-list",
      objectFields: [
        { key: "label", label: "Label", required: true },
        { key: "value", label: "Value", required: true },
        { key: "unit", label: "Unit" },
        { key: "note", label: "Note" },
      ],
    },
    { key: "insight", label: "Insight", kind: "textarea" },
  ],
  timeline: [
    {
      key: "events",
      label: "Events",
      kind: "object-list",
      objectFields: [
        { key: "label", label: "Label", required: true },
        { key: "detail", label: "Detail" },
      ],
    },
    { key: "insight", label: "Insight", kind: "textarea" },
  ],
  quote: [
    { key: "quote_text", label: "Quote text", kind: "textarea" },
    { key: "attribution", label: "Attribution", kind: "text" },
    { key: "context", label: "Context", kind: "textarea" },
  ],
  big_number: [
    { key: "number", label: "Number", kind: "text" },
    { key: "unit", label: "Unit", kind: "text" },
    { key: "context", label: "Context", kind: "textarea" },
    { key: "comparison", label: "Comparison", kind: "textarea" },
  ],
  case_study: [
    { key: "case_title", label: "Case title", kind: "text" },
    { key: "case_background", label: "Case background", kind: "textarea" },
    { key: "process", label: "Process steps", kind: "string-list" },
    { key: "result", label: "Result", kind: "textarea" },
    { key: "lesson", label: "Lesson", kind: "textarea" },
  ],
  recap: [
    { key: "points", label: "Points", kind: "string-list" },
    { key: "bridge", label: "Bridge", kind: "textarea" },
  ],
};

// ---------------------------------------------------------------------------
// Server-side validation errors (PUT /spec 400 payload)
// ---------------------------------------------------------------------------

export interface SpecValidationError {
  rule: string;
  field: string;
  message: string;
  /** 1-based scene number, null for top-level errors. */
  scene: number | null;
}

const FIELD_SCENE_RE = /^scenes\[(\d+)\](?:\.(.*))?$/;

/**
 * Map an error to a 0-based scene index + field sub-path, preferring the
 * `field` pointer (`scenes[2].numeric_example`) over the 1-based `scene`.
 */
export function locateValidationError(err: SpecValidationError): {
  sceneIndex: number | null;
  fieldPath: string | null;
} {
  const m = FIELD_SCENE_RE.exec(err.field ?? "");
  if (m) {
    return {
      sceneIndex: Number(m[1]),
      fieldPath: m[2] ?? null,
    };
  }
  return {
    sceneIndex: err.scene != null ? err.scene - 1 : null,
    fieldPath: null,
  };
}

/** Extract the error list from a PUT /spec 400 response body. */
export function extractValidationErrors(body: unknown): SpecValidationError[] {
  const detail = (body as { detail?: unknown })?.detail;
  if (detail && typeof detail === "object") {
    const errors = (detail as { errors?: unknown }).errors;
    if (Array.isArray(errors)) {
      return errors.map((e) => {
        const err = e as Partial<SpecValidationError>;
        return {
          rule: String(err.rule ?? ""),
          field: String(err.field ?? ""),
          message: String(err.message ?? ""),
          scene: typeof err.scene === "number" ? err.scene : null,
        };
      });
    }
  }
  if (typeof detail === "string") {
    return [{ rule: "", field: "(root)", message: detail, scene: null }];
  }
  return [
    { rule: "", field: "(root)", message: "unknown validation error", scene: null },
  ];
}

/** Default scene skeleton used by the form's "add scene" action. */
export function newSceneDoc(type: SceneType): RawSceneDoc {
  return {
    type,
    layout: "centered-text",
    title: "",
    question: "",
    core_message: "",
    narration: { opening: "", explanation: "", conclusion: "" },
    visual: { primary: "" },
    transition: { next_question: "" },
  };
}
