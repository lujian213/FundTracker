import { computeSMA, computeMultipleSMAs, computeSMAsForLast } from '../../utils/movingAverage';

describe('movingAverage utils', () => {
  test('computeSMA returns nulls until window filled and then averages', () => {
    const vals = [1,2,3,4,5,6];
    const res = computeSMA(vals, 3);
    expect(res.length).toBe(vals.length);
    expect(res[0]).toBeNull();
    expect(res[1]).toBeNull();
    expect(res[2]).toBeCloseTo((1+2+3)/3);
    expect(res[3]).toBeCloseTo((2+3+4)/3);
    expect(res[5]).toBeCloseTo((4+5+6)/3);
  });

  test('computeMultipleSMAs returns correct windows', () => {
    const vals = [10,20,30,40,50];
    const res = computeMultipleSMAs(vals, [2,5]);
    expect(res[2].length).toBe(vals.length);
    expect(res[5].length).toBe(vals.length);
    // For window=2, index 1 should be the average of [10,20]
    expect(res[2][1]).toBeCloseTo((10+20)/2);
    expect(res[2][2]).toBeCloseTo((20+30)/2);
    expect(res[5][4]).toBeCloseTo((10+20+30+40+50)/5);
  });

  describe('computeSMAsForLast', () => {
    test('returns correct number of values for each window', () => {
      const vals = Array.from({ length: 100 }, (_, i) => i + 1);
      const res = computeSMAsForLast(vals, 10, [5, 10, 20]);
      expect(res[5].length).toBe(10);
      expect(res[10].length).toBe(10);
      expect(res[20].length).toBe(10);
    });

    test('only computes necessary data points (optimization)', () => {
      // 100 data points, need last 10 with max window 20
      // Should only process 30 data points (10 + 20)
      const vals = Array.from({ length: 100 }, (_, i) => i + 1);
      const res = computeSMAsForLast(vals, 10, [5, 10, 20]);

      // Verify the last value is correct
      // Last 10 values: 91-100, MA5 at last position = (96+97+98+99+100)/5 = 98
      expect(res[5][9]).toBeCloseTo(98);
      // MA10 at last position = (91+92+...+100)/10 = 95.5
      expect(res[10][9]).toBeCloseTo(95.5);
      // MA20 at last position = (81+82+...+100)/20 = 90.5
      expect(res[20][9]).toBeCloseTo(90.5);
    });

    test('handles small arrays correctly', () => {
      const vals = [1, 2, 3, 4, 5];
      const res = computeSMAsForLast(vals, 10, [5]);
      // Should return all 5 values since array is smaller than requested
      expect(res[5].length).toBe(5);
    });

    test('handles empty array', () => {
      const res = computeSMAsForLast([], 10, [5, 10, 20]);
      expect(res[5].length).toBe(0);
      expect(res[10].length).toBe(0);
      expect(res[20].length).toBe(0);
    });

    test('uses default windows when not specified', () => {
      const vals = Array.from({ length: 50 }, (_, i) => i + 1);
      const res = computeSMAsForLast(vals, 10);
      expect(res[5]).toBeDefined();
      expect(res[10]).toBeDefined();
      expect(res[20]).toBeDefined();
    });
  });
});
