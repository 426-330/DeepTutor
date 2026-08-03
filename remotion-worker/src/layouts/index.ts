/**
 * Layout registry (DSL §12.2) — canonical layout id → component.
 * Lookup misses degrade to a placeholder (render whitelist, design D8).
 */
import type React from 'react';
import {CardGrid3Layout} from './CardGrid3Layout.js';
import {CardListLayout} from './CardListLayout.js';
import {CenteredTextLayout} from './CenteredTextLayout.js';
import {ChartFullLayout} from './ChartFullLayout.js';
import {ChartSideLayout} from './ChartSideLayout.js';
import {Compare2Layout} from './Compare2Layout.js';
import {Comparison2colLayout} from './Comparison2colLayout.js';
import {FormulaFocusLayout} from './FormulaFocusLayout.js';
import {FullBleedLayout} from './FullBleedLayout.js';
import {FullHeroLayout} from './FullHeroLayout.js';
import {Grid3x2Layout} from './Grid3x2Layout.js';
import {ImageFocusLayout} from './ImageFocusLayout.js';
import {NumberSpotlightLayout} from './NumberSpotlightLayout.js';
import {OverlayCaptionLayout} from './OverlayCaptionLayout.js';
import {QuoteCenterLayout} from './QuoteCenterLayout.js';
import {QuoteEmphasisLayout} from './QuoteEmphasisLayout.js';
import {SidebarLeftLayout} from './SidebarLeftLayout.js';
import {Split4060Layout} from './Split4060Layout.js';
import {SplitLayout} from './SplitLayout.js';
import {StackedLayout} from './StackedLayout.js';
import {TextFocusLayout} from './TextFocusLayout.js';
import {TimelineHorizontalLayout} from './TimelineHorizontalLayout.js';
import {TimelineLayout} from './TimelineLayout.js';
import {TitleClosingLayout} from './TitleClosingLayout.js';
import type {LayoutProps} from './types.js';

export const LAYOUT_REGISTRY: Record<string, React.FC<LayoutProps>> = {
  'full-hero': FullHeroLayout,
  split: SplitLayout,
  'centered-text': CenteredTextLayout,
  'formula-focus': FormulaFocusLayout,
  'chart-full': ChartFullLayout,
  'chart-side': ChartSideLayout,
  'card-grid-3': CardGrid3Layout,
  'card-list': CardListLayout,
  'compare-2': Compare2Layout,
  timeline: TimelineLayout,
  'quote-emphasis': QuoteEmphasisLayout,
  'title-closing': TitleClosingLayout,
  'full-bleed': FullBleedLayout,
  'sidebar-left': SidebarLeftLayout,
  'split-40-60': Split4060Layout,
  stacked: StackedLayout,
  'quote-center': QuoteCenterLayout,
  'timeline-horizontal': TimelineHorizontalLayout,
  'comparison-2col': Comparison2colLayout,
  'image-focus': ImageFocusLayout,
  'text-focus': TextFocusLayout,
  'grid-3x2': Grid3x2Layout,
  'overlay-caption': OverlayCaptionLayout,
  'number-spotlight': NumberSpotlightLayout,
};
