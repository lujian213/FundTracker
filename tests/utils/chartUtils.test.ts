import {
  findKeyPointIndices,
  findTurningPointIndices,
  mergeChartPoints,
  MAX_VISIBLE_POINTS,
  ChartPointWithData,
} from '../../utils/chartUtils';

describe('chartUtils', () => {
  // Helper to create test points
  function createTestPoints(count: number, profits: number[] = []): ChartPointWithData[] {
    const points: ChartPointWithData[] = [];
    for (let i = 0; i < count; i++) {
      const profit = profits[i] ?? (i * 100); // default: linear increase
      points.push({
        x: i,
        y: profit,
        data: {
          date: `2026-01-${String(i + 1).padStart(2, '0')}`,
          dailyProfit: profit - (i > 0 ? profits[i - 1] ?? ((i - 1) * 100) : 0),
          cumulativeProfit: profit,
        },
      });
    }
    return points;
  }

  describe('findKeyPointIndices', () => {
    test('returns first, last, max, and min indices', () => {
      const points = createTestPoints(10, [0, 100, 500, 200, 300, -100, 400, 800, 600, 700]);
      const indices = findKeyPointIndices(points);

      expect(indices.has(0)).toBe(true);   // first
      expect(indices.has(9)).toBe(true);   // last
      expect(indices.has(7)).toBe(true);   // max (800)
      expect(indices.has(5)).toBe(true);   // min (-100)
      expect(indices.size).toBe(4);
    });

    test('handles single point', () => {
      const points = createTestPoints(1);
      const indices = findKeyPointIndices(points);

      expect(indices.has(0)).toBe(true);
      expect(indices.size).toBe(1);
    });

    test('handles empty array', () => {
      const indices = findKeyPointIndices([]);
      expect(indices.size).toBe(0);
    });

    test('handles all equal profits', () => {
      const points = createTestPoints(5, [100, 100, 100, 100, 100]);
      const indices = findKeyPointIndices(points);

      expect(indices.has(0)).toBe(true);
      expect(indices.has(4)).toBe(true);
      // max and min are both at index 0
      expect(indices.size).toBe(2);
    });
  });

  describe('findTurningPointIndices', () => {
    test('finds local maxima and minima', () => {
      // Pattern: 0 -> 100 -> 50 -> 200 -> 150 (turning points at 100, 50, 200)
      const points = createTestPoints(5, [0, 100, 50, 200, 150]);
      const turningIndices = findTurningPointIndices(points, 10); // threshold 10

      expect(turningIndices).toContain(1); // local max (100)
      expect(turningIndices).toContain(2); // local min (50)
      expect(turningIndices).toContain(3); // local max (200)
      expect(turningIndices.length).toBe(3);
    });

    test('filters small fluctuations below threshold', () => {
      // Pattern: 100 -> 105 -> 104 -> 106 -> 105 (small fluctuations around 100)
      const points = createTestPoints(5, [100, 105, 104, 106, 105]);
      const turningIndices = findTurningPointIndices(points, 10); // threshold 10

      // 105 is local max, but change from 100 is only 5, below threshold
      // 104 is local min, but change from 105 is only 1, below threshold
      // 106 is local max, but change from 104 is only 2, below threshold
      expect(turningIndices.length).toBe(0);
    });

    test('handles small arrays', () => {
      const points = createTestPoints(2);
      const turningIndices = findTurningPointIndices(points);

      expect(turningIndices.length).toBe(0);
    });
  });

  describe('mergeChartPoints', () => {
    test('returns original points when count is below threshold', () => {
      const points = createTestPoints(50); // below MAX_VISIBLE_POINTS (80)
      const merged = mergeChartPoints(points);

      expect(merged.length).toBe(50);
      expect(merged).toEqual(points);
    });

    test('merges points when count exceeds threshold', () => {
      const points = createTestPoints(100);
      const merged = mergeChartPoints(points);

      expect(merged.length).toBeLessThanOrEqual(MAX_VISIBLE_POINTS);
      expect(merged.length).toBeGreaterThan(0);
    });

    test('always preserves first and last points', () => {
      const points = createTestPoints(100, Array.from({ length: 100 }, (_, i) => i * 100));
      const merged = mergeChartPoints(points);

      // First point
      expect(merged[0].data.date).toBe(points[0].data.date);
      // Last point
      expect(merged[merged.length - 1].data.date).toBe(points[points.length - 1].data.date);
    });

    test('always preserves max and min profit points', () => {
      // Create 100 points with max at index 80 and min at index 30
      const profits = Array.from({ length: 100 }, (_, i) => {
        if (i === 80) return 10000; // max
        if (i === 30) return -5000; // min
        return i * 50;
      });
      const points = createTestPoints(100, profits);
      const merged = mergeChartPoints(points);

      // Should include max point
      const hasMax = merged.some(p => p.data.cumulativeProfit === 10000);
      expect(hasMax).toBe(true);

      // Should include min point
      const hasMin = merged.some(p => p.data.cumulativeProfit === -5000);
      expect(hasMin).toBe(true);
    });

    test('handles extreme case: 200+ points', () => {
      const points = createTestPoints(200);
      const merged = mergeChartPoints(points);

      expect(merged.length).toBeLessThanOrEqual(MAX_VISIBLE_POINTS);
      expect(merged.length).toBeGreaterThan(0);
    });

    test('handles empty array', () => {
      const merged = mergeChartPoints([]);
      expect(merged.length).toBe(0);
    });

    test('handles single point', () => {
      const points = createTestPoints(1);
      const merged = mergeChartPoints(points);

      expect(merged.length).toBe(1);
      expect(merged[0]).toEqual(points[0]);
    });
  });

  describe('mergeChartPoints integration', () => {
    test('maintains visual clarity with realistic data', () => {
      // Simulate 150 trading days with realistic profit curve
      const profits: number[] = [];
      let cumulative = 0;
      for (let i = 0; i < 150; i++) {
        // Add daily profit with some volatility
        const dailyChange = (Math.random() - 0.4) * 500; // slightly positive bias
        cumulative += dailyChange;
        profits.push(cumulative);
      }

      const points = createTestPoints(150, profits);
      const merged = mergeChartPoints(points);

      expect(merged.length).toBeLessThanOrEqual(MAX_VISIBLE_POINTS);

      // Verify key points are preserved
      const firstDate = points[0].data.date;
      const lastDate = points[points.length - 1].data.date;
      expect(merged[0].data.date).toBe(firstDate);
      expect(merged[merged.length - 1].data.date).toBe(lastDate);
    });
  });
});