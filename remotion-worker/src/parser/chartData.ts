/**
 * Chart data inlining (DSL §4.5). `chart.data` is a path resolved against the
 * video asset directory's `data/` folder (<yaml_dir>/<stem>/data/<data>).
 * The parser reads the file server-side and inlines points into the IR so the
 * browser bundle never touches the filesystem.
 *
 * Supported: .csv (two columns x,y, optional header) and .json
 * ([{x,y}…] | [[x,y]…] | [y…]).
 */
import fs from 'node:fs';
import path from 'node:path';
import type {ChartData, ChartPoint, ParseWarning} from './types.js';

const MAX_POINTS = 500;

function parseCsv(text: string): ChartPoint[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const points: ChartPoint[] = [];
  for (const line of lines) {
    const [a, b] = line.split(',').map((s) => s.trim());
    const y = Number(b);
    if (!Number.isFinite(y)) continue; // header or junk row
    const xNum = Number(a);
    points.push({x: Number.isFinite(xNum) && a !== '' ? xNum : a, y});
  }
  return points;
}

function parseJson(text: string): ChartPoint[] {
  const doc = JSON.parse(text) as unknown;
  if (!Array.isArray(doc)) throw new Error('JSON data must be an array');
  const points: ChartPoint[] = [];
  doc.forEach((item, i) => {
    if (typeof item === 'number') {
      points.push({x: i, y: item});
    } else if (Array.isArray(item) && typeof item[1] === 'number') {
      points.push({x: (item[0] as string | number) ?? i, y: item[1]});
    } else if (
      item !== null &&
      typeof item === 'object' &&
      typeof (item as Record<string, unknown>).y === 'number'
    ) {
      const o = item as Record<string, unknown>;
      points.push({x: (o.x as string | number) ?? i, y: o.y as number});
    }
  });
  return points;
}

export function resolveChartDataPath(yamlPath: string, dataRef: string): string {
  const dir = path.dirname(yamlPath);
  const stem = path.basename(yamlPath).replace(/\.ya?ml$/i, '');
  return path.join(dir, stem, 'data', dataRef);
}

/** Returns null (+ warning) when the file is missing or unreadable. */
export function loadChartData(
  yamlPath: string,
  sceneId: string,
  dataRef: string,
  warnings: ParseWarning[],
): ChartData | null {
  const dataPath = resolveChartDataPath(yamlPath, dataRef);
  if (!fs.existsSync(dataPath)) {
    warnings.push({
      code: 'chart-data-missing',
      scene: sceneId,
      message: `chart data not found: ${dataPath}`,
    });
    return null;
  }
  try {
    const text = fs.readFileSync(dataPath, 'utf8');
    const points = (
      dataPath.toLowerCase().endsWith('.json') ? parseJson(text) : parseCsv(text)
    ).slice(0, MAX_POINTS);
    if (points.length === 0) throw new Error('no usable data points');
    return {points};
  } catch (err) {
    warnings.push({
      code: 'chart-data-invalid',
      scene: sceneId,
      message: `failed to read chart data ${dataPath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
    return null;
  }
}
