/**
 * Test for recent points preservation in chart merging
 *
 * Requirement: The most recent 10 points should not be diluted
 * These points are usually the most important for users to see
 */

import { mergeChartPoints, ChartPointWithData, RECENT_POINTS_TO_KEEP } from '../../utils/chartUtils';

describe('Recent Points Preservation', () => {
  const createMockPoints = (count: number): ChartPointWithData[] => {
    const points: ChartPointWithData[] = [];
    const width = 960;
    const padLeft = 80;
    const padRight = 28;

    for (let i = 0; i < count; i++) {
      const x = padLeft + (i * (width - padLeft - padRight) / (count - 1 || 1));
      points.push({
        x,
        y: 100 + i * 10,
        data: {
          date: `2025-06-${String(i + 1).padStart(2, '0')}`,
          dailyProfit: i * 10,
          cumulativeProfit: i * 100
        }
      });
    }
    return points;
  };

  test('should preserve the most recent 10 points when merging', () => {
    // Create 100 points (exceeds MAX_VISIBLE_POINTS=80)
    const originalPoints = createMockPoints(100);
    const displayPoints = mergeChartPoints(originalPoints);

    console.log('Original count:', originalPoints.length);
    console.log('Display count:', displayPoints.length);

    // Get the last 10 original points
    const recentOriginalPoints = originalPoints.slice(-RECENT_POINTS_TO_KEEP);
    console.log('Recent original points dates:', recentOriginalPoints.map(p => p.data.date));

    // Check if all recent 10 points are preserved in display points
    for (const recentPt of recentOriginalPoints) {
      const foundInDisplay = displayPoints.find(dp => dp.data.date === recentPt.data.date);
      expect(foundInDisplay).toBeDefined();
      console.log(`✓ Recent point ${recentPt.data.date} preserved in display`);
    }

    // Verify display points contain all recent 10 points
    expect(displayPoints.length).toBeGreaterThanOrEqual(RECENT_POINTS_TO_KEEP);
  });

  test('recent points should keep their original X coordinates', () => {
    const originalPoints = createMockPoints(100);
    const displayPoints = mergeChartPoints(originalPoints);

    // Get the last 10 original points
    const recentOriginalPoints = originalPoints.slice(-RECENT_POINTS_TO_KEEP);

    // Each recent point should preserve its original X coordinate
    for (const recentPt of recentOriginalPoints) {
      const displayPt = displayPoints.find(dp => dp.data.date === recentPt.data.date);
      if (displayPt) {
        expect(displayPt.x).toBe(recentPt.x);
        console.log(`✓ Recent point ${recentPt.data.date} X coord: ${displayPt.x} (original: ${recentPt.x})`);
      }
    }
  });

  test('recent points should be at correct Y positions', () => {
    const originalPoints = createMockPoints(100);
    const displayPoints = mergeChartPoints(originalPoints);

    // Get the last 10 original points
    const recentOriginalPoints = originalPoints.slice(-RECENT_POINTS_TO_KEEP);

    // Each recent point should preserve its original Y coordinate
    for (const recentPt of recentOriginalPoints) {
      const displayPt = displayPoints.find(dp => dp.data.date === recentPt.data.date);
      if (displayPt) {
        expect(displayPt.y).toBe(recentPt.y);
        expect(displayPt.data.cumulativeProfit).toBe(recentPt.data.cumulativeProfit);
      }
    }
  });

  test('should handle edge case: dataset smaller than RECENT_POINTS_TO_KEEP', () => {
    // Create only 15 points (less than MAX_VISIBLE_POINTS, so no merging)
    const originalPoints = createMockPoints(15);
    const displayPoints = mergeChartPoints(originalPoints);

    // All points should be preserved (no merging needed)
    expect(displayPoints.length).toBe(originalPoints.length);

    // All recent points (which is all points in this case) should be preserved
    for (const originalPt of originalPoints) {
      const displayPt = displayPoints.find(dp => dp.data.date === originalPt.data.date);
      expect(displayPt).toBeDefined();
    }
  });

  test('should preserve recent points even if they overlap with max/min points', () => {
    // Create points where the maximum is within the last 10 points
    const points: ChartPointWithData[] = [];
    const width = 960;
    const padLeft = 80;
    const padRight = 28;

    for (let i = 0; i < 100; i++) {
      const x = padLeft + (i * (width - padLeft - padRight) / 99);
      // Make index 95 the maximum (within last 10)
      const cumulativeProfit = i === 95 ? 10000 : i * 100;
      points.push({
        x,
        y: cumulativeProfit,
        data: {
          date: `2025-06-${String(i + 1).padStart(2, '0')}`,
          dailyProfit: i * 10,
          cumulativeProfit
        }
      });
    }

    const displayPoints = mergeChartPoints(points);

    // Verify index 95 (the max point) is preserved (should be both max and recent)
    const maxPoint = displayPoints.find(dp => dp.data.cumulativeProfit === 10000);
    expect(maxPoint).toBeDefined();

    // Verify all recent 10 points are preserved
    const recentDates = points.slice(-RECENT_POINTS_TO_KEEP).map(p => p.data.date);
    for (const date of recentDates) {
      const found = displayPoints.find(dp => dp.data.date === date);
      expect(found).toBeDefined();
    }
  });

  test('display count should be bounded by MAX_VISIBLE_POINTS', () => {
    // Create 150 points (way over MAX_VISIBLE_POINTS=80)
    const originalPoints = createMockPoints(150);
    const displayPoints = mergeChartPoints(originalPoints);

    // Display points should not exceed MAX_VISIBLE_POINTS
    expect(displayPoints.length).toBeLessThanOrEqual(80);

    // But should still include all recent 10 points
    const recentOriginalPoints = originalPoints.slice(-RECENT_POINTS_TO_KEEP);
    for (const recentPt of recentOriginalPoints) {
      const found = displayPoints.find(dp => dp.data.date === recentPt.data.date);
      expect(found).toBeDefined();
    }
  });
});