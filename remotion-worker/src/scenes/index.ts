/**
 * Scene registry (DSL §12.1) — DSL scene type → Scene component.
 * Lookup misses degrade to a placeholder (render whitelist, design D8).
 */
import type React from 'react';
import {BigNumberScene} from './BigNumberScene.js';
import {CaseStudyScene} from './CaseStudyScene.js';
import {ChartScene} from './ChartScene.js';
import {ConceptScene} from './ConceptScene.js';
import {ConclusionScene} from './ConclusionScene.js';
import {DataComparisonScene} from './DataComparisonScene.js';
import {FormulaScene} from './FormulaScene.js';
import {OpeningScene} from './OpeningScene.js';
import {ProblemHookScene} from './ProblemHookScene.js';
import {QuoteScene} from './QuoteScene.js';
import {RecapScene} from './RecapScene.js';
import {SummaryScene} from './SummaryScene.js';
import {TimelineScene} from './TimelineScene.js';
import type {SceneProps} from './types.js';

export const SCENE_REGISTRY: Record<string, React.FC<SceneProps>> = {
  opening: OpeningScene,
  problem_hook: ProblemHookScene,
  concept: ConceptScene,
  formula: FormulaScene,
  chart: ChartScene,
  conclusion: ConclusionScene,
  summary: SummaryScene,
  data_comparison: DataComparisonScene,
  timeline: TimelineScene,
  quote: QuoteScene,
  big_number: BigNumberScene,
  case_study: CaseStudyScene,
  recap: RecapScene,
};
