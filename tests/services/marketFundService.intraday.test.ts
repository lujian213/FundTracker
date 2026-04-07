import * as marketFundService from '../../services/marketFundService';
import { IntradayPoint } from '../../types';
import { compressConsecutiveSameValues } from '../../utils/intradayCompression';

// Mock toLocalDateKey to return a fixed date for tradeDate tests
jest.mock('../../utils/priceResolver', () => ({
  ...jest.requireActual('../../utils/priceResolver'),
  toLocalDateKey: (date: Date) => '2026-03-17'
}));

describe('marketFundService - Intraday Operations', () => {
  beforeEach(() => {
    localStorage.clear();
    marketFundService.resetCache();
  });

  afterEach(() => {
    localStorage.clear();
    marketFundService.resetCache();
  });

  describe('appendIntradayPoint - tradeDate handling', () => {
    test('should add intraday point when tradeDate equals today', () => {
      marketFundService.addFund('000001', '测试基金');

      marketFundService.appendIntradayPoint('000001', 1.23, 0.5, '2026-03-17 15:00', '2026-03-17');

      const intraday = marketFundService.getIntraday('000001');
      expect(intraday.length).toBe(1);
      expect(intraday[0].value).toBeCloseTo(1.23);
    });

    test('should NOT add intraday point when tradeDate is not today', () => {
      marketFundService.addFund('000001', '测试基金');

      // tradeDate is yesterday
      marketFundService.appendIntradayPoint('000001', 1.23, 0.5, '2026-03-16 15:00', '2026-03-16');

      const intraday = marketFundService.getIntraday('000001');
      expect(intraday.length).toBe(0);
    });

    test('should add intraday point when tradeDate is undefined', () => {
      marketFundService.addFund('000001', '测试基金');

      // No tradeDate provided - should still add
      marketFundService.appendIntradayPoint('000001', 1.23, 0.5, '2026-03-17 15:00');

      const intraday = marketFundService.getIntraday('000001');
      expect(intraday.length).toBe(1);
    });

    test('should combine tradeDate with time-only lastUpdated format', () => {
      marketFundService.addFund('000001', '测试基金');

      // lastUpdated is time-only format (HH:mm:ss)
      marketFundService.appendIntradayPoint('000001', 1.23, 0.5, '15:00:00', '2026-03-17');

      const intraday = marketFundService.getIntraday('000001');
      expect(intraday.length).toBe(1);
      // Timestamp should be based on tradeDate + time
      const expectedTs = new Date('2026-03-17 15:00:00').getTime();
      // Account for minute rounding
      expect(Math.abs(intraday[0].timestamp - expectedTs)).toBeLessThan(60000);
    });
  });

  describe('appendIntradayPoint - compression', () => {
    test('should skip adding point when value equals last point', () => {
      marketFundService.addFund('000001', '测试基金');

      const base = Date.now();
      marketFundService.appendIntradayPoint('000001', 2.0, 0, base);
      const after1 = marketFundService.getIntraday('000001');
      expect(after1.length).toBeGreaterThanOrEqual(1);

      // Same value, different time
      marketFundService.appendIntradayPoint('000001', 2.0, 0, base + 5 * 60000);
      const after2 = marketFundService.getIntraday('000001');
      expect(after2.length).toBe(after1.length); // Should not increase
      expect(after2[after2.length - 1].value).toBeCloseTo(2.0);
    });

    test('should add point when value differs from last point', () => {
      marketFundService.addFund('000001', '测试基金');

      const base = Date.now();
      marketFundService.appendIntradayPoint('000001', 2.0, 0, base);

      // Different value
      marketFundService.appendIntradayPoint('000001', 2.1, 0, base + 5 * 60000);
      const after2 = marketFundService.getIntraday('000001');
      expect(after2.length).toBe(2);
      expect(after2[0].value).toBeCloseTo(2.0);
      expect(after2[1].value).toBeCloseTo(2.1);
    });
  });

  describe('updateIntraday - compression', () => {
    test('setIntradayPoints compresses consecutive identical values keeping earliest timestamp', () => {
      marketFundService.addFund('000001', '测试基金');

      const base = Date.now();
      const pts: IntradayPoint[] = [
        { timestamp: base, value: 1.23, equityReturn: 0 },
        { timestamp: base + 60000, value: 1.23, equityReturn: 0 },
        { timestamp: base + 120000, value: 1.24, equityReturn: 0 },
      ];
      marketFundService.updateIntraday('000001', pts);
      const got = marketFundService.getIntraday('000001');
      expect(got.length).toBe(2);
      expect(got[0].value).toBeCloseTo(1.23);
      expect(got[1].value).toBeCloseTo(1.24);
    });
  });

  describe('getIntraday', () => {
    test('returns empty array for non-existent fund', () => {
      const result = marketFundService.getIntraday('nonexistent');
      expect(result).toEqual([]);
    });
  });
});

// Unit tests for intraday compression utility
describe('compressConsecutiveSameValues', () => {
  test('keeps earliest of identical runs', () => {
    const base = 1600000000000;
    const pts = [
      { timestamp: base, value: 1.0, equityReturn: 0 },
      { timestamp: base + 60000, value: 1.0, equityReturn: 0 },
      { timestamp: base + 120000, value: 1.1, equityReturn: 0 },
      { timestamp: base + 180000, value: 1.1, equityReturn: 0 },
      { timestamp: base + 240000, value: 1.2, equityReturn: 0 },
    ];
    const out = compressConsecutiveSameValues(pts as any);
    expect(out.length).toBe(3);
    expect(out[0].timestamp).toBe(base);
    expect(out[1].timestamp).toBe(base + 120000);
    expect(out[2].timestamp).toBe(base + 240000);
  });

  test('returns single point unchanged', () => {
    const pts = [{ timestamp: 1600000000000, value: 1.0, equityReturn: 0 }];
    const out = compressConsecutiveSameValues(pts as any);
    expect(out.length).toBe(1);
    expect(out[0].timestamp).toBe(1600000000000);
  });

  test('returns empty array unchanged', () => {
    const out = compressConsecutiveSameValues([]);
    expect(out.length).toBe(0);
  });

  test('preserves all points when values differ', () => {
    const base = 1600000000000;
    const pts = [
      { timestamp: base, value: 1.0, equityReturn: 0 },
      { timestamp: base + 60000, value: 1.1, equityReturn: 0 },
      { timestamp: base + 120000, value: 1.2, equityReturn: 0 },
    ];
    const out = compressConsecutiveSameValues(pts as any);
    expect(out.length).toBe(3);
  });
});