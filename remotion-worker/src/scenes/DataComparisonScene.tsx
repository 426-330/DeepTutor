import React from 'react';
import type {MetricItem} from '../layouts/types.js';
import type {SceneProps} from './types.js';
import {SceneShell} from './SceneShell.js';

/** data_comparison — 并排关键数字对比（§4.8）。 */
export const DataComparisonScene: React.FC<SceneProps> = ({scene}) => {
  const metrics = (scene.slots.metrics as MetricItem[] | undefined) ?? [];
  const insight = scene.slots.insight as string | undefined;
  return (
    <SceneShell
      scene={scene}
      content={{
        headline: scene.coreMessage,
        subline: insight,
        metrics,
        columns: [
          {head: metrics[0]?.label ?? '', items: metrics.slice(0, 1).map((m) => `${m.value}${m.unit ?? ''} ${m.note ?? ''}`.trim())},
          {head: metrics[1]?.label ?? '', items: metrics.slice(1, 2).map((m) => `${m.value}${m.unit ?? ''} ${m.note ?? ''}`.trim())},
        ],
      }}
    />
  );
};
