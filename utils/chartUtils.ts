/**
 * Chart utility functions for profit timeline visualization
 */

export interface ChartPoint {
  x: number;
  y: number;
}

export interface SmoothPathOptions {
  closePath?: boolean;
  chartHeight: number;
  paddingBottom: number;
}

/**
 * Build a smooth SVG path using Catmull-Rom to Bezier curve conversion
 * Creates a smooth curve passing through all points
 */
export function buildSmoothPath(
  pts: ChartPoint[],
  options: SmoothPathOptions
): string {
  if (pts.length < 2) return '';

  const { closePath = false, chartHeight, paddingBottom } = options;

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
  }

  if (closePath) {
    d += ` L ${pts[pts.length - 1].x} ${chartHeight - paddingBottom}`;
    d += ` L ${pts[0].x} ${chartHeight - paddingBottom} Z`;
  }

  return d;
}

/**
 * Build a linear (non-smooth) SVG path - straight lines connecting points
 */
export function buildLinearPath(
  pts: ChartPoint[],
  options: SmoothPathOptions
): string {
  if (pts.length < 2) return '';

  const { closePath = false, chartHeight, paddingBottom } = options;

  // Start at first point
  let d = `M ${pts[0].x} ${pts[0].y}`;

  // Draw straight lines to each subsequent point
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i].x} ${pts[i].y}`;
  }

  if (closePath) {
    d += ` L ${pts[pts.length - 1].x} ${chartHeight - paddingBottom}`;
    d += ` L ${pts[0].x} ${chartHeight - paddingBottom} Z`;
  }

  return d;
}

/**
 * Chart dimensions and padding constants
 */
export const CHART_DIMENSIONS = {
  width: 960,
  height: 200,
  padLeft: 80,
  padRight: 20,
  padTop: 20,
  padBottom: 32,
} as const;