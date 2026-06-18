/**
 * Chart utility functions for profit timeline visualization
 */

export interface ChartPoint {
  x: number;
  y: number;
}

export interface ChartPointWithData extends ChartPoint {
  data: {
    date: string;
    dailyProfit: number;
    cumulativeProfit: number;
  };
}

export interface SmoothPathOptions {
  closePath?: boolean;
  chartHeight: number;
  paddingBottom: number;
}

/**
 * Chart dimensions and padding constants
 */
export const CHART_DIMENSIONS = {
  width: 960,
  height: 200,
  padLeft: 80,
  padRight: 28, // 增大右侧内边距，确保最后一个 X 轴刻度文本（中心对齐）不被截断
  padTop: 20,
  padBottom: 32,
} as const;

/**
 * Maximum number of visible points on the chart
 * Based on chart width and minimum visual spacing (10px)
 */
export const MAX_VISIBLE_POINTS = 80;

/**
 * Number of most recent points to always preserve (not diluted)
 */
export const RECENT_POINTS_TO_KEEP = 10;

/**
 * Build a mapping from original point indices to display point indices
 * Used when original points are merged for display
 *
 * Performance: O(n + m) using date lookup map instead of O(n*m) findIndex
 */
export function buildDisplayIndexMap(
  originalPoints: ChartPointWithData[],
  displayPoints: ChartPointWithData[]
): Map<number, number> {
  const mapping = new Map<number, number>();

  // Build date-to-index lookup map for O(1) access (O(m) setup)
  const dateToDisplayIdx = new Map<string, number>();
  for (let i = 0; i < displayPoints.length; i++) {
    dateToDisplayIdx.set(displayPoints[i].data.date, i);
  }

  // Build mapping (O(n) for main loop)
  for (let origIdx = 0; origIdx < originalPoints.length; origIdx++) {
    const origPoint = originalPoints[origIdx];

    // O(1) date lookup
    const displayIdx = dateToDisplayIdx.get(origPoint.data.date);

    if (displayIdx !== undefined) {
      // Point exists in display: direct mapping
      mapping.set(origIdx, displayIdx);
    } else {
      // Point merged: find nearest by X coordinate (O(m) worst case)
      // Could be optimized with binary search if displayPoints are sorted by x
      let nearestIdx = 0;
      let minDistance = Math.abs(displayPoints[0].x - origPoint.x);

      for (let idx = 1; idx < displayPoints.length; idx++) {
        const distance = Math.abs(displayPoints[idx].x - origPoint.x);
        if (distance < minDistance) {
          minDistance = distance;
          nearestIdx = idx;
        }
      }

      mapping.set(origIdx, nearestIdx);
    }
  }

  return mapping;
}

/**
 * Find indices of key points that should always be preserved
 * - First point (start)
 * - Last point (current)
 * - Maximum cumulative profit point
 * - Minimum cumulative profit point
 * - Most recent N points (RECENT_POINTS_TO_KEEP)
 */
export function findKeyPointIndices(points: ChartPointWithData[]): Set<number> {
  const indices = new Set<number>();

  if (points.length === 0) return indices;

  // Always keep first and last
  indices.add(0);
  indices.add(points.length - 1);

  // Find max and min cumulative profit
  let maxIndex = 0;
  let minIndex = 0;
  let maxValue = points[0].data.cumulativeProfit;
  let minValue = points[0].data.cumulativeProfit;

  for (let i = 1; i < points.length; i++) {
    const profit = points[i].data.cumulativeProfit;
    if (profit > maxValue) {
      maxValue = profit;
      maxIndex = i;
    }
    if (profit < minValue) {
      minValue = profit;
      minIndex = i;
    }
  }

  indices.add(maxIndex);
  indices.add(minIndex);

  // Keep most recent N points (always preserve latest data)
  const startIdx = Math.max(0, points.length - RECENT_POINTS_TO_KEEP);
  for (let i = startIdx; i < points.length; i++) {
    indices.add(i);
  }

  return indices;
}

/**
 * Find indices of turning points where daily profit change exceeds threshold
 * A turning point is where the direction changes significantly
 */
export function findTurningPointIndices(
  points: ChartPointWithData[],
  threshold: number = 1000 // Minimum cumulative profit change to consider as turning
): number[] {
  const turningIndices: number[] = [];

  if (points.length < 3) return turningIndices;

  // Find local extrema where cumulative profit changes significantly
  for (let i = 1; i < points.length - 1; i++) {
    const prevProfit = points[i - 1].data.cumulativeProfit;
    const currProfit = points[i].data.cumulativeProfit;
    const nextProfit = points[i + 1].data.cumulativeProfit;

    // Check if this is a local maximum or minimum
    const isLocalMax = currProfit > prevProfit && currProfit > nextProfit;
    const isLocalMin = currProfit < prevProfit && currProfit < nextProfit;

    if (isLocalMax || isLocalMin) {
      // Only keep if the change is significant
      const changeFromPrev = Math.abs(currProfit - prevProfit);
      const changeToNext = Math.abs(currProfit - nextProfit);

      if (changeFromPrev >= threshold || changeToNext >= threshold) {
        turningIndices.push(i);
      }
    }
  }

  return turningIndices;
}

/**
 * Merge points when total count exceeds threshold
 * Strategy: Keep key points + turning points + fill remaining with uniform sampling
 */
export function mergeChartPoints(
  points: ChartPointWithData[],
  maxPoints: number = MAX_VISIBLE_POINTS
): ChartPointWithData[] {
  if (points.length <= maxPoints) {
    return points;
  }

  // Step 1: Get key points (first, last, max, min)
  const keyIndices = findKeyPointIndices(points);

  // Step 2: Get turning points
  const turningIndices = findTurningPointIndices(points);

  // Combine key and turning points, remove duplicates
  const keepSet = new Set<number>([...keyIndices, ...turningIndices]);

  // Step 3: If still under max, fill with uniform sampling
  if (keepSet.size < maxPoints) {
    const remainingSlots = maxPoints - keepSet.size;
    // Calculate interval for uniform sampling
    const interval = Math.max(1, Math.floor((points.length - 1) / (remainingSlots + 1)));

    for (let i = interval; i < points.length - 1 && keepSet.size < maxPoints; i += interval) {
      keepSet.add(i);
    }
  }

  // Step 4: Sort indices and return merged points
  const sortedIndices = Array.from(keepSet).sort((a, b) => a - b);
  return sortedIndices.map(i => points[i]);
}

/**
 * Get the original index for a merged point
 * Used for hover interaction to map back to original data
 */
export function getOriginalIndexMapping(
  originalPoints: ChartPointWithData[],
  mergedPoints: ChartPointWithData[]
): Map<number, number> {
  const mapping = new Map<number, number>();

  for (let mergedIdx = 0; mergedIdx < mergedPoints.length; mergedIdx++) {
    const mergedPoint = mergedPoints[mergedIdx];
    // Find matching original point by date and values
    for (let origIdx = 0; origIdx < originalPoints.length; origIdx++) {
      const origPoint = originalPoints[origIdx];
      if (
        mergedPoint.data.date === origPoint.data.date &&
        mergedPoint.data.cumulativeProfit === origPoint.data.cumulativeProfit
      ) {
        mapping.set(mergedIdx, origIdx);
        break;
      }
    }
  }

  return mapping;
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