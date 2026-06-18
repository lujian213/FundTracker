/**
 * Test for OverallProfitModal chart point positioning bug fix
 *
 * Bug description:
 * - Points appear diluted (some points not showing)
 * - Hover info is misaligned (hovering highest point shows wrong date)
 *
 * Root cause:
 * - X coordinates were recalculated after point merging
 * - Display points used X based on merged count
 * - Hover detection used X based on original count
 *
 * Fix:
 * - Merged points now preserve original X coordinates
 * - Added originalToDisplayMap for proper data mapping
 * - Tooltip shows correct display point data
 */

import { mergeChartPoints, ChartPointWithData } from '../../utils/chartUtils';

describe('OverallProfitModal Chart Point Positioning Bug Fix', () => {
  // Create mock data with 100 points (over MAX_VISIBLE_POINTS=80)
  const createMockPoints = (count: number): ChartPointWithData[] => {
    const points: ChartPointWithData[] = [];
    const width = 960;
    const padLeft = 80;
    const padRight = 28;

    for (let i = 0; i < count; i++) {
      // Original X coordinate calculation (based on original count)
      const x = padLeft + (i * (width - padLeft - padRight) / (count - 1 || 1));
      points.push({
        x,
        y: 100 + i * 10, // Simple Y values
        data: {
          date: `2025-05-${String(i + 1).padStart(2, '0')}`,
          dailyProfit: i * 10,
          cumulativeProfit: i * 100
        }
      });
    }
    return points;
  };

  test('should demonstrate the fix: merged points preserve original X coordinates', () => {
    // Create 100 original points
    const originalPoints = createMockPoints(100);

    // Merge points (will reduce to ~80)
    const displayPoints = mergeChartPoints(originalPoints);

    console.log('Original count:', originalPoints.length);
    console.log('Merged (display) count:', displayPoints.length);

    // The fix: display points keep original X coordinates
    // No recalculation like: displayPts.map((p, i) => ({...p, x: getX(i, mergedPts.length)}))

    // Find a point that should be at position 50% of chart width
    const originalMiddleIndex = 50;
    const originalMiddleX = originalPoints[originalMiddleIndex].x;
    const originalMiddleDate = originalPoints[originalMiddleIndex].data.date;

    // After merging, find the same date in display points
    const displayPoint = displayPoints.find(p => p.data.date === originalMiddleDate);

    if (displayPoint) {
      console.log(`Original point index ${originalMiddleIndex}:`, {
        x: originalMiddleX,
        date: originalMiddleDate
      });
      console.log(`Display point (same date):`, {
        x: displayPoint.x,
        date: displayPoint.data.date
      });

      // The fix: display point X should match original point X
      expect(Math.abs(displayPoint.x - originalMiddleX)).toBeLessThan(1);
    }

    // Also verify all display points keep their original X
    for (const displayPt of displayPoints) {
      const originalPt = originalPoints.find(p => p.data.date === displayPt.data.date);
      if (originalPt) {
        expect(displayPt.x).toBe(originalPt.x);
      }
    }
  });

  test('display points should cover the correct date range', () => {
    const originalPoints = createMockPoints(100);
    const displayPoints = mergeChartPoints(originalPoints);

    // First and last points should always be preserved
    expect(displayPoints[0].data.date).toBe(originalPoints[0].data.date);
    expect(displayPoints[displayPoints.length - 1].data.date).toBe(originalPoints[originalPoints.length - 1].data.date);

    // Max cumulative profit point should be preserved
    const maxOriginalIndex = originalPoints.reduce((maxIdx, p, i, arr) =>
      p.data.cumulativeProfit > arr[maxIdx].data.cumulativeProfit ? i : maxIdx, 0);
    const maxDate = originalPoints[maxOriginalIndex].data.date;
    const maxDisplayPoint = displayPoints.find(p => p.data.date === maxDate);
    expect(maxDisplayPoint).toBeDefined();

    // Min cumulative profit point should be preserved
    const minOriginalIndex = originalPoints.reduce((minIdx, p, i, arr) =>
      p.data.cumulativeProfit < arr[minIdx].data.cumulativeProfit ? i : minIdx, 0);
    const minDate = originalPoints[minOriginalIndex].data.date;
    const minDisplayPoint = displayPoints.find(p => p.data.date === minDate);
    expect(minDisplayPoint).toBeDefined();
  });

  test('original to display mapping should work correctly', () => {
    const originalPoints = createMockPoints(100);
    const displayPoints = mergeChartPoints(originalPoints);

    // Simulate the mapping logic from OverallProfitModal
    const originalToDisplayMap = new Map<number, number>();

    for (let origIdx = 0; origIdx < originalPoints.length; origIdx++) {
      const origPoint = originalPoints[origIdx];
      // Find same date in display points
      const displayIdx = displayPoints.findIndex(dp => dp.data.date === origPoint.data.date);

      if (displayIdx !== -1) {
        originalToDisplayMap.set(origIdx, displayIdx);
      } else {
        // Find nearest display point (by X distance)
        let nearestDisplayIdx = 0;
        let minDistance = Math.abs(displayPoints[0].x - origPoint.x);
        for (let dpIdx = 1; dpIdx < displayPoints.length; dpIdx++) {
          const distance = Math.abs(displayPoints[dpIdx].x - origPoint.x);
          if (distance < minDistance) {
            minDistance = distance;
            nearestDisplayIdx = dpIdx;
          }
        }
        originalToDisplayMap.set(origIdx, nearestDisplayIdx);
      }
    }

    // Test: hover at original index 50 should map to a valid display index
    const hoverOrigIdx = 50;
    const mappedDisplayIdx = originalToDisplayMap.get(hoverOrigIdx);
    expect(mappedDisplayIdx).toBeDefined();
    expect(mappedDisplayIdx).toBeGreaterThanOrEqual(0);
    expect(mappedDisplayIdx).toBeLessThan(displayPoints.length);

    // The mapped display point should have correct data
    const mappedDisplayPoint = displayPoints[mappedDisplayIdx!];
    expect(mappedDisplayPoint.data).toBeDefined();
    expect(mappedDisplayPoint.data.date).toBeDefined();
  });
});