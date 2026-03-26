// utils/sparklineUtils.ts
import { IntradayPoint } from '../types';

export interface SparklineResult {
  pathD: string;
  strokeColor: string;
}

/**
 * 计算 sparkline SVG 路径
 */
export function buildSparklinePath(
  points: IntradayPoint[],
  options: { width?: number; height?: number; padding?: number } = {}
): SparklineResult | null {
  const { width = 60, height = 20, padding = 2 } = options;

  if (!points || points.length < 2) return null;

  const pts = [...points].sort((a, b) => a.timestamp - b.timestamp);
  const pctValues = pts.map(p => Number.isFinite(p.equityReturn) ? p.equityReturn : 0);

  let min = Math.min(...pctValues);
  let max = Math.max(...pctValues);

  if (min > 0) min = 0;
  if (max < 0) max = 0;
  if (min === max) { min -= 1; max += 1; }

  const range = max - min;
  const innerWidth = width - 2 * padding;
  const innerHeight = height - 2 * padding;

  const getX = (i: number) => (i / Math.max(1, pts.length - 1)) * innerWidth + padding;
  const getY = (v: number) => padding + (1 - (v - min) / range) * innerHeight;

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.equityReturn)}`).join(' ');
  const strokeColor = pctValues[pctValues.length - 1] >= 0 ? '#ef4444' : '#16a34a';

  return { pathD, strokeColor };
}