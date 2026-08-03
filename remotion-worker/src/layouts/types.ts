/**
 * Shared content bag passed from Scene components to layout components.
 * Scenes normalize their PageModel + content_slots into this bag; each of the
 * 12 layouts renders the parts it has regions for (DSL §12.2).
 */
import type React from 'react';

export interface MetricItem {
  label: string;
  value: string;
  unit?: string;
  note?: string;
}

export interface TimelineEvent {
  label: string;
  detail?: string;
}

export interface SceneContent {
  /** Big headline text (hook/quote/takeaway/closing title). */
  headline?: string;
  /** Secondary line under/next to the headline. */
  subline?: string;
  /** Bullet list (key_points / agenda / recap_points / promise…). */
  bullets?: string[];
  /** Card content (conclusion key_cards). */
  cards?: string[];
  /** Dominant visual node (formula block / chart / VisualCard). */
  visual?: React.ReactNode;
  /** Chart insight / 读图结论. */
  insight?: string;
  /** Extra emphasized line (misconception, call_to_action…). */
  callout?: string;
  /** compare-2 regions. */
  compareLeft?: string;
  compareRight?: string;
  /** timeline nodes. */
  timelineNodes?: string[];
  /** data_comparison: side-by-side metrics. */
  metrics?: MetricItem[];
  /** timeline: evolution nodes with optional detail. */
  events?: TimelineEvent[];
  /** quote: 金句正文 + 出处. */
  quoteText?: string;
  attribution?: string;
  /** big_number: 大数字 + 单位 + 参照系. */
  bigNumber?: string;
  unit?: string;
  /** comparison-2col: headed columns. */
  columns?: Array<{head: string; items: string[]}>;
  /** text-focus / grid-3x2 的补充小注. */
  footnote?: string;
}

export interface LayoutProps {
  content: SceneContent;
}
