/**
 * Built-in theme tables — the hex source of the style chain (DSL §5).
 * Values mirror video_dsl/量化色卡规范.md §2; that document is authoritative.
 */
import type {ColorToken, ThemeName} from './types.js';

export const BUILTIN_THEMES: Record<ThemeName, Record<ColorToken, string>> = {
  // §2.1 default（中性通用 · 兜底主题）
  default: {
    primary: '#2563EB',
    secondary: '#64748B',
    accent: '#8B5CF6',
    success: '#16A34A',
    warning: '#D97706',
    danger: '#DC2626',
    neutral: '#6B7280',
  },
  // §2.2 quant-traditional（量化科普风 · 首个领域主题）
  'quant-traditional': {
    primary: '#1A5FB4',
    secondary: '#4A6FA5',
    accent: '#C9A227',
    success: '#2E9E5B',
    warning: '#E0A100',
    danger: '#D64545',
    neutral: '#5B6770',
  },
  // §2.3 tech-minimal（科技极简）
  'tech-minimal': {
    primary: '#0284C7',
    secondary: '#475569',
    accent: '#06B6D4',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    neutral: '#6B7280',
  },
  // §2.4 warm-editorial（暖调编辑风）
  'warm-editorial': {
    primary: '#C2410C',
    secondary: '#78716C',
    accent: '#D4A373',
    success: '#4D7C0F',
    warning: '#B45309',
    danger: '#B91C1C',
    neutral: '#57534E',
  },
};

export const DEFAULT_THEME: ThemeName = 'default';
