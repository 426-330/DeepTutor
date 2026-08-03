/**
 * Shared IR type definitions for the Concept Video DSL (v3.1).
 *
 * This module is dependency-free (no fs / no ajv) so it can be imported by
 * both the server-side parser and the in-browser Remotion bundle (and, per
 * design D5, the frontend Player).
 *
 * Authoritative contract: video_dsl/concept-video-dsl.md (§10/§11/§12).
 */

// ---------------------------------------------------------------------------
// Closed enums (mirrors video_dsl/schema/concept-video.schema.json)
// ---------------------------------------------------------------------------

export const COLOR_TOKENS = [
  'primary',
  'secondary',
  'accent',
  'success',
  'warning',
  'danger',
  'neutral',
] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

export const SCENE_TYPES = [
  'opening',
  'problem_hook',
  'concept',
  'formula',
  'chart',
  'conclusion',
  'summary',
  'data_comparison',
  'timeline',
  'quote',
  'big_number',
  'case_study',
  'recap',
] as const;
export type SceneType = (typeof SCENE_TYPES)[number];

export const LAYOUT_IDS = [
  'full-hero',
  'split',
  'centered-text',
  'formula-focus',
  'chart-full',
  'chart-side',
  'card-grid-3',
  'card-list',
  'compare-2',
  'timeline',
  'quote-emphasis',
  'title-closing',
  'full-bleed',
  'sidebar-left',
  'split-40-60',
  'stacked',
  'quote-center',
  'timeline-horizontal',
  'comparison-2col',
  'image-focus',
  'text-focus',
  'grid-3x2',
  'overlay-caption',
  'number-spotlight',
] as const;
export type LayoutId = (typeof LAYOUT_IDS)[number];

export const ENTRANCES = ['fadeIn', 'slideUp', 'scaleIn', 'typewriter', 'none'] as const;
export type Entrance = (typeof ENTRANCES)[number];

export const TRANSITION_TYPES = ['fade', 'wipe-left', 'slide', 'zoom', 'none'] as const;
export type TransitionType = (typeof TRANSITION_TYPES)[number];

export const CHART_MOTIONS = ['drawLine', 'growBar', 'countUp', 'none'] as const;
export type ChartMotion = (typeof CHART_MOTIONS)[number];

export const CHART_TYPES = ['line', 'bar', 'pie', 'scatter', 'area', 'histogram', 'heatmap'] as const;
export type ChartType = (typeof CHART_TYPES)[number];

/**
 * Chart types the minimal SVG chart component (src/components/Chart.tsx) can
 * draw. Others degrade to a placeholder + warning (render whitelist, D8).
 */
export const SUPPORTED_CHART_TYPES: readonly ChartType[] = ['line', 'bar', 'area'];

export type ThemeName = 'default' | 'quant-traditional' | 'tech-minimal' | 'warm-editorial';

// ---------------------------------------------------------------------------
// Resolved style chain (§5 / §11.3) — output of the parser, input to the
// theme provider. Components read ONLY these resolved values from context.
// ---------------------------------------------------------------------------

export interface FontSpec {
  family: string;
  weight: number;
}

export interface ResolvedFonts {
  title: FontSpec;
  body: FontSpec;
  number: FontSpec;
}

/**
 * The 7 DSL tokens plus derived surface colors (background / surface / text …)
 * computed by the style chain from the token values. Components never see a
 * raw hex literal of their own.
 */
export interface ResolvedColors extends Record<ColorToken, string> {
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
}

export interface TransitionSpec {
  type: TransitionType;
  frames: number;
}

export interface BackgroundSpec {
  type: 'none' | 'gradient' | 'particles';
  skill?: string;
  params?: Record<string, unknown>;
}

export interface ResolvedEffects {
  transition: TransitionSpec;
  entrance: Entrance;
  chartMotion: ChartMotion;
  background: BackgroundSpec;
}

export interface ResolvedStyle {
  theme: ThemeName;
  preset?: string;
  colors: ResolvedColors;
  fonts: ResolvedFonts;
  effects: ResolvedEffects;
}

// ---------------------------------------------------------------------------
// Raw (validated) YAML shape — only the fields the renderer reads are typed;
// type-specific content slots are kept in `slots`.
// ---------------------------------------------------------------------------

export interface Narration {
  opening: string;
  explanation: string;
  conclusion: string;
}

export interface VisualSpec {
  primary: string;
  secondary?: string;
  emphasis?: string;
}

export interface Variable {
  symbol: string;
  meaning: string;
}

// ---------------------------------------------------------------------------
// IR (DSL §11) — the normalized render input.
// ---------------------------------------------------------------------------

export interface SubtitleCue {
  startFrame: number;
  endFrame: number;
  text: string;
}

export interface ChartPoint {
  x: string | number;
  y: number;
}

export interface ChartData {
  points: ChartPoint[];
}

export interface SceneIR {
  /** 0-based scene index. */
  index: number;
  /** Scene id matching the asset layout: s01, s02, … (audio/s<NN>.align.json). */
  id: string;
  type: SceneType;
  /** Canonical layout id after alias resolution (§11.2). */
  layout: string;
  /** Absolute start frame within the whole composition. */
  startFrame: number;
  durationFrames: number;
  /** Where the duration came from (align.json override wins, §11.4 / design D6). */
  durationSource: 'dsl' | 'default' | 'align';
  style: ResolvedStyle;
  // PageModel (§3)
  title: string;
  question: string;
  coreMessage: string;
  narration: Narration;
  visual: VisualSpec;
  nextQuestion?: string;
  // Type-specific content slots (§4), passed through from the YAML.
  slots: Record<string, unknown>;
  /** Chart data inlined from the external file (chart.data), null if unreadable. */
  chartData?: ChartData | null;
  /** Word/segment-level subtitle cues from .align.json (seconds → frames). */
  cues?: SubtitleCue[];
  /** Voiceover track for this scene (file:// URL), undefined = silent scene. */
  audioUrl?: string;
}

export interface BgmSpec {
  /** file:// URL of the background music file. */
  url: string;
  /** Fixed background volume (voiceover stays at 1.0), default 0.15. */
  volume: number;
}

export interface VideoIR {
  version: '3.0' | '3.1';
  series: string;
  episode: number;
  fps: number;
  width: number;
  height: number;
  totalFrames: number;
  opening?: {title: string; subtitle?: string};
  /** Global resolved style — provider fallback above per-scene overrides. */
  style: ResolvedStyle;
  scenes: SceneIR[];
  /** Background music (asset-dir convention or per-request override). */
  bgm?: BgmSpec;
}

// ---------------------------------------------------------------------------
// Parser result
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  /** JSON pointer-ish path, e.g. /scenes/0/style/colors/primary. */
  path: string;
  message: string;
  keyword?: string;
  /** schema = §10 ajv, semantic = §13 cross-field review. */
  layer: 'schema' | 'semantic' | 'yaml';
}

export interface ParseWarning {
  code:
    | 'layout-alias'
    | 'align-missing'
    | 'align-invalid'
    | 'chart-data-missing'
    | 'chart-data-invalid'
    | 'chart-type-unsupported'
    | 'particles-degraded'
    | 'skill-not-installed'
    | 'semantic-warning'
    | 'unknown-identifier';
  scene?: string;
  message: string;
}

export type ParseResult =
  | {ok: true; ir: VideoIR; warnings: ParseWarning[]}
  | {ok: false; errors: ValidationIssue[]};
