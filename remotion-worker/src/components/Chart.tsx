/**
 * Minimal hand-rolled SVG chart (task 4.4 — no heavy chart lib).
 * Supports `line` / `bar` (+ `area` as a filled line). Other DSL chart types
 * (pie/scatter/histogram/heatmap) are rejected by the scene component and
 * degrade to a placeholder + warning (render whitelist discipline).
 * Chart motion: drawLine (stroke draw-on) / growBar (scale up), none static.
 */
import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import type {ChartMotion, ChartType} from '../parser/types.js';
import {mixHex} from '../parser/styleChain.js';
import {useTheme} from './ThemeProvider.js';

export {SUPPORTED_CHART_TYPES} from '../parser/types.js';

const W = 1000;
const H = 520;
const PAD = {left: 70, right: 30, top: 30, bottom: 56};

export const Chart: React.FC<{
  chartType: ChartType;
  points: Array<{x: string | number; y: number}>;
  motion: ChartMotion;
  xLabel?: string;
  yLabel?: string;
}> = ({chartType, points, motion, xLabel, yLabel}) => {
  const {colors, fonts} = useTheme();
  const frame = useCurrentFrame();

  const ys = points.map((p) => p.y);
  const yMin = Math.min(0, ...ys);
  const yMax = Math.max(...ys, 1);
  const span = yMax - yMin || 1;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const xOf = (i: number) =>
    PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const yOf = (y: number) => PAD.top + (1 - (y - yMin) / span) * plotH;

  const progress =
    motion === 'none'
      ? 1
      : interpolate(frame, [0, 40], [0, 1], {extrapolateRight: 'clamp'});

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p.y).toFixed(1)}`)
    .join(' ');
  const areaPath = `${path} L${xOf(points.length - 1).toFixed(1)},${yOf(yMin).toFixed(
    1,
  )} L${xOf(0).toFixed(1)},${yOf(yMin).toFixed(1)} Z`;

  const gridLines = 4;
  const barW = Math.min(60, (plotW / points.length) * 0.6);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{width: '100%', height: '100%'}}
      role="img"
    >
      {/* grid + y ticks */}
      {Array.from({length: gridLines + 1}, (_, i) => {
        const y = yMin + (span / gridLines) * i;
        const py = yOf(y);
        return (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={py}
              y2={py}
              stroke={colors.border}
              strokeWidth={1}
            />
            <text
              x={PAD.left - 10}
              y={py + 6}
              textAnchor="end"
              fill={colors.textMuted}
              fontSize={16}
              fontFamily={fonts.number.family}
            >
              {Number(y.toPrecision(3))}
            </text>
          </g>
        );
      })}

      {/* x labels (sparse) */}
      {points.map((p, i) =>
        i % Math.ceil(points.length / 8) === 0 ? (
          <text
            key={i}
            x={xOf(i)}
            y={H - PAD.bottom + 24}
            textAnchor="middle"
            fill={colors.textMuted}
            fontSize={15}
            fontFamily={fonts.number.family}
          >
            {String(p.x)}
          </text>
        ) : null,
      )}

      {/* axis titles */}
      {xLabel ? (
        <text
          x={W - PAD.right}
          y={H - 8}
          textAnchor="end"
          fill={colors.secondary}
          fontSize={17}
          fontFamily={fonts.body.family}
        >
          {xLabel}
        </text>
      ) : null}
      {yLabel ? (
        <text
          x={PAD.left}
          y={PAD.top - 10}
          fill={colors.secondary}
          fontSize={17}
          fontFamily={fonts.body.family}
        >
          {yLabel}
        </text>
      ) : null}

      {/* series */}
      {chartType === 'bar'
        ? points.map((p, i) => {
            const h = (yOf(yMin) - yOf(p.y)) * progress;
            return (
              <rect
                key={i}
                x={xOf(i) - barW / 2}
                y={yOf(yMin) - h}
                width={barW}
                height={Math.max(0, h)}
                rx={4}
                fill={p.y >= 0 ? colors.primary : colors.danger}
              />
            );
          })
        : null}

      {(chartType === 'line' || chartType === 'area') && points.length > 1 ? (
        <>
          {chartType === 'area' ? (
            <path d={areaPath} fill={mixHex(colors.primary, colors.background, 0.75)} opacity={progress} />
          ) : null}
          <path
            d={path}
            fill="none"
            stroke={colors.primary}
            strokeWidth={4}
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={motion === 'drawLine' ? 1 - progress : 0}
          />
        </>
      ) : null}
    </svg>
  );
};
