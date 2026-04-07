import * as indexService from '../../services/indexService';
import { IntradayPoint, IndexInfo } from '../../types';
import { compressConsecutiveSameValues } from '../../utils/intradayCompression';

// Mock toLocalDateKey to return a fixed date for tradeDate tests
jest.mock('../../utils/priceResolver', () => ({
  ...jest.requireActual('../../utils/priceResolver'),
  toLocalDateKey: (date: Date) => '2026-03-17'
}));

function createTestIndexInfo(symbol: string, name: string = '上证指数'): IndexInfo {
  return {
    symbol,
    name,
    current: 3300,
    change: 10,
    changePercent: 0.3,
    lastUpdated: '2026-03-17 15:00'
  };
}

describe('indexService - Intraday Operations', () => {
  beforeEach(() => {
    localStorage.clear();
    indexService.resetCache();
  });

  afterEach(() => {
    localStorage.clear();
    indexService.resetCache();
  });

  describe('appendIntradayPoint - tradeDate handling', () => {
    test('should add intraday point when tradeDate equals today', () => {
      indexService.saveIndexInfo(createTestIndexInfo('1.000001'));

      indexService.appendIntradayPoint('1.000001', 3300, 0.3, '2026-03-17 15:00', '2026-03-17');

      const intraday = indexService.getIntraday('1.000001');
      expect(intraday.length).toBe(1);
      expect(intraday[0].value).toBeCloseTo(3300);
    });

    test('should NOT add intraday point when tradeDate is not today', () => {
      indexService.saveIndexInfo(createTestIndexInfo('1.000001'));

      // tradeDate is yesterday
      indexService.appendIntradayPoint('1.000001', 3300, 0.3, '2026-03-16 15:00', '2026-03-16');

      const intraday = indexService.getIntraday('1.000001');
      expect(intraday.length).toBe(0);
    });

    test('should add intraday point when tradeDate is undefined', () => {
      indexService.saveIndexInfo(createTestIndexInfo('1.000001'));

      // No tradeDate provided - should still add
      indexService.appendIntradayPoint('1.000001', 3300, 0.3, '2026-03-17 15:00');

      const intraday = indexService.getIntraday('1.000001');
      expect(intraday.length).toBe(1);
    });

    test('should combine tradeDate with time-only lastUpdated format', () => {
      indexService.saveIndexInfo(createTestIndexInfo('1.000001'));

      // lastUpdated is time-only format (HH:mm:ss)
      indexService.appendIntradayPoint('1.000001', 3300, 0.3, '15:00:00', '2026-03-17');

      const intraday = indexService.getIntraday('1.000001');
      expect(intraday.length).toBe(1);
      // Timestamp should be based on tradeDate + time
      const expectedTs = new Date('2026-03-17 15:00:00').getTime();
      // Account for minute rounding
      expect(Math.abs(intraday[0].timestamp - expectedTs)).toBeLessThan(60000);
    });
  });

  describe('appendIntradayPoint - compression', () => {
    test('should skip adding point when value equals last point', () => {
      indexService.saveIndexInfo(createTestIndexInfo('1.000001'));

      const base = Date.now();
      indexService.appendIntradayPoint('1.000001', 3300, 0.3, base);
      const after1 = indexService.getIntraday('1.000001');
      expect(after1.length).toBeGreaterThanOrEqual(1);

      // Same value, different time
      indexService.appendIntradayPoint('1.000001', 3300, 0.3, base + 5 * 60000);
      const after2 = indexService.getIntraday('1.000001');
      expect(after2.length).toBe(after1.length); // Should not increase
      expect(after2[after2.length - 1].value).toBeCloseTo(3300);
    });

    test('should add point when value differs from last point', () => {
      indexService.saveIndexInfo(createTestIndexInfo('1.000001'));

      const base = Date.now();
      indexService.appendIntradayPoint('1.000001', 3300, 0.3, base);

      // Different value
      indexService.appendIntradayPoint('1.000001', 3310, 0.33, base + 5 * 60000);
      const after2 = indexService.getIntraday('1.000001');
      expect(after2.length).toBe(2);
      expect(after2[0].value).toBeCloseTo(3300);
      expect(after2[1].value).toBeCloseTo(3310);
    });
  });

  describe('updateIntraday - compression', () => {
    test('setIntradayPoints compresses consecutive identical values keeping earliest timestamp', () => {
      indexService.saveIndexInfo(createTestIndexInfo('1.000001'));

      const base = Date.now();
      const pts: IntradayPoint[] = [
        { timestamp: base, value: 3300, equityReturn: 0.3 },
        { timestamp: base + 60000, value: 3300, equityReturn: 0.3 },
        { timestamp: base + 120000, value: 3310, equityReturn: 0.33 },
      ];
      indexService.updateIntraday('1.000001', pts);
      const got = indexService.getIntraday('1.000001');
      expect(got.length).toBe(2);
      expect(got[0].value).toBeCloseTo(3300);
      expect(got[1].value).toBeCloseTo(3310);
    });
  });

  describe('getIntraday', () => {
    test('returns empty array for non-existent index', () => {
      const result = indexService.getIntraday('nonexistent');
      expect(result).toEqual([]);
    });
  });
});