/**
 * Style chain resolution (DSL §5 / §11.3, design D3).
 *
 * Merge order (low → high priority):
 *   内建主题 → style.theme → style.colors (顶层 hex 重定义)
 *     → 分镜 style.colors (token→token 重映射) → 组件取色
 * Fonts and effects: 全局 → 分镜覆盖 → 组件默认兜底 (defaults live here).
 *
 * Pure module (no fs) — safe to import from the browser bundle.
 */
import {BUILTIN_THEMES, DEFAULT_THEME} from './themes.js';
import type {
  BackgroundSpec,
  ChartMotion,
  ColorToken,
  Entrance,
  ResolvedColors,
  ResolvedEffects,
  ResolvedFonts,
  ResolvedStyle,
  ThemeName,
  TransitionSpec,
  TransitionType,
} from './types.js';
import {COLOR_TOKENS} from './types.js';

// ---------------------------------------------------------------------------
// Raw style blocks as they appear in YAML (post-schema-validation).
// ---------------------------------------------------------------------------

export interface RawFontSpec {
  family: string;
  weight?: number;
}

export interface RawStyleBlock {
  theme?: ThemeName;
  preset?: string;
  /** Global level: hex re-definitions of token values. */
  colors?: Partial<Record<ColorToken, string>>;
  fonts?: Partial<Record<'title' | 'body' | 'number', RawFontSpec>>;
  effects?: {
    transition?: {type: TransitionType; frames?: number};
    entrance?: Entrance;
    chart_motion?: ChartMotion;
    background?: BackgroundSpec;
  };
}

export interface RawSceneStyleBlock extends Omit<RawStyleBlock, 'colors'> {
  /** Scene level: token → token remapping (never hex — schema enforces). */
  colors?: Partial<Record<ColorToken, ColorToken>>;
}

// ---------------------------------------------------------------------------
// Component fallbacks (兜底) — the lowest priority of the chain.
// ---------------------------------------------------------------------------

export const DEFAULT_FONTS: ResolvedFonts = {
  title: {family: 'Noto Sans SC', weight: 800},
  body: {family: 'Noto Sans SC', weight: 500},
  number: {family: 'JetBrains Mono', weight: 600},
};

export const DEFAULT_EFFECTS: ResolvedEffects = {
  transition: {type: 'fade', frames: 10},
  entrance: 'fadeIn',
  chartMotion: 'drawLine',
  background: {type: 'gradient'},
};

// ---------------------------------------------------------------------------
// Color helpers — derive surface colors from tokens so components stay
// free of hardcoded hex (only the 7 tokens + these derivations exist).
// ---------------------------------------------------------------------------

function parseHex(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** Mix `hexA` toward `hexB` by t ∈ [0,1]. */
export function mixHex(hexA: string, hexB: string, t: number): string {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  return toHex(
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  );
}

const BLACK = '#000000';
const WHITE = '#FFFFFF';

function deriveSurfaces(tokens: Record<ColorToken, string>): ResolvedColors {
  return {
    ...tokens,
    background: mixHex(tokens.neutral, BLACK, 0.9),
    surface: mixHex(tokens.neutral, BLACK, 0.78),
    text: mixHex(tokens.neutral, WHITE, 0.93),
    textMuted: mixHex(tokens.neutral, WHITE, 0.45),
    border: mixHex(tokens.neutral, BLACK, 0.45),
  };
}

// ---------------------------------------------------------------------------
// Chain resolution
// ---------------------------------------------------------------------------

function mergeFonts(
  base: ResolvedFonts,
  override?: RawStyleBlock['fonts'],
): ResolvedFonts {
  if (!override) return base;
  const slot = (
    b: {family: string; weight: number},
    o?: RawFontSpec,
  ): {family: string; weight: number} =>
    o ? {family: o.family, weight: o.weight ?? b.weight} : b;
  return {
    title: slot(base.title, override.title),
    body: slot(base.body, override.body),
    number: slot(base.number, override.number),
  };
}

function mergeEffects(
  base: ResolvedEffects,
  override?: RawStyleBlock['effects'],
): ResolvedEffects {
  if (!override) return base;
  const transition: TransitionSpec = override.transition
    ? {
        type: override.transition.type,
        frames: override.transition.frames ?? base.transition.frames,
      }
    : base.transition;
  return {
    transition,
    entrance: override.entrance ?? base.entrance,
    chartMotion: override.chart_motion ?? base.chartMotion,
    background: override.background ?? base.background,
  };
}

/**
 * Resolve the global style chain (built-in theme → style.theme →
 * style.colors hex overrides → font/effect overrides).
 */
export function resolveGlobalStyle(global?: RawStyleBlock): ResolvedStyle {
  const theme: ThemeName = global?.theme ?? DEFAULT_THEME;
  const tokens = {...BUILTIN_THEMES[theme]};
  // 顶层 style.colors：hex 重定义 token 值（hex 唯一合法出现处）。
  if (global?.colors) {
    for (const token of COLOR_TOKENS) {
      const hex = global.colors[token];
      if (hex) tokens[token] = hex;
    }
  }
  return {
    theme,
    preset: global?.preset,
    colors: deriveSurfaces(tokens),
    fonts: mergeFonts(DEFAULT_FONTS, global?.fonts),
    effects: mergeEffects(DEFAULT_EFFECTS, global?.effects),
  };
}

/**
 * Resolve one scene's style on top of the global chain.
 * Scene colors are token→token remaps: `colors: {primary: danger}` makes
 * this scene's primary render with the (globally resolved) danger value.
 */
export function resolveSceneStyle(
  globalStyle: ResolvedStyle,
  sceneStyle?: RawSceneStyleBlock,
): ResolvedStyle {
  if (!sceneStyle) return globalStyle;
  const tokens = {...globalStyle.colors};
  if (sceneStyle.colors) {
    for (const token of COLOR_TOKENS) {
      const remap = sceneStyle.colors[token];
      if (remap) tokens[token] = globalStyle.colors[remap];
    }
  }
  return {
    theme: sceneStyle.theme ?? globalStyle.theme,
    preset: sceneStyle.preset ?? globalStyle.preset,
    colors: deriveSurfaces(tokens as Record<ColorToken, string>),
    fonts: mergeFonts(globalStyle.fonts, sceneStyle.fonts),
    effects: mergeEffects(globalStyle.effects, sceneStyle.effects),
  };
}
