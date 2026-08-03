import React from 'react';
import {Chart, SUPPORTED_CHART_TYPES} from '../components/Chart.js';
import {PlaceholderFrame} from '../components/PlaceholderFrame.js';
import type {ChartType} from '../parser/types.js';
import type {SceneProps} from './types.js';
import {SceneShell} from './SceneShell.js';

/**
 * chart — 外链数据画简图（§4.5）。未支持的 chart_type 或缺失数据 →
 * 占位帧降级（渲染白名单，告警由 parser/服务端经 WS 发出）。
 */
export const ChartScene: React.FC<SceneProps> = ({scene}) => {
  const chartType = scene.slots.chart_type as ChartType | undefined;
  const axes = scene.slots.axes as {x?: string; y?: string} | undefined;
  const insight = scene.slots.insight as string | undefined;

  let visual: React.ReactNode;
  if (!chartType || !SUPPORTED_CHART_TYPES.includes(chartType)) {
    visual = (
      <PlaceholderFrame
        reason={`chart_type "${chartType ?? '未指定'}" 暂不支持（当前支持 ${SUPPORTED_CHART_TYPES.join(
          '/',
        )}）`}
      />
    );
  } else if (!scene.chartData) {
    visual = <PlaceholderFrame reason="图表数据缺失或不可读（chart.data）" />;
  } else {
    visual = (
      <Chart
        chartType={chartType}
        points={scene.chartData.points}
        motion={scene.style.effects.chartMotion}
        xLabel={axes?.x}
        yLabel={axes?.y}
      />
    );
  }

  return (
    <SceneShell
      scene={scene}
      content={{
        visual,
        insight: insight ?? scene.coreMessage,
        headline: scene.coreMessage,
      }}
    />
  );
};
