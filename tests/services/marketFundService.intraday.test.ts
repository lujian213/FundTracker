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

    test('should add intraday point even when tradeDate is not today (no local time check)', () => {
      marketFundService.addFund('000001', '测试基金');

      // tradeDate is yesterday - now will still add since local time check was removed
      marketFundService.appendIntradayPoint('000001', 1.23, 0.5, '2026-03-16 15:00', '2026-03-16');

      const intraday = marketFundService.getIntraday('000001');
      expect(intraday.length).toBe(1);
      expect(intraday[0].value).toBeCloseTo(1.23);
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

  describe('appendIntradayPoint - filtering by API data date (not current time)', () => {
    test('should preserve intraday data from same day as API data when current time is different day', () => {
      // 场景：周日刷新，API 返回周五数据（gztime = 周五），应保留周五的日内数据
      marketFundService.addFund('000001', '测试基金');

      // 使用 fake timers 模拟当前时间是周五（用于添加周五的日内数据）
      const fridayMorning = new Date('2026-07-03 09:00:00');
      jest.useFakeTimers().setSystemTime(fridayMorning);

      // 模拟周五的日内数据（多个点）
      const friday930 = new Date('2026-07-03 09:30:00').getTime();
      const friday1000 = new Date('2026-07-03 10:00:00').getTime();
      const friday1100 = new Date('2026-07-03 11:00:00').getTime();

      // 添加周五的日内数据点
      marketFundService.appendIntradayPoint('000001', 1.20, 0, friday930, '2026-07-03');
      marketFundService.appendIntradayPoint('000001', 1.22, 0.5, friday1000, '2026-07-03');
      marketFundService.appendIntradayPoint('000001', 1.25, 1.0, friday1100, '2026-07-03');

      // 验证周五数据已添加
      const beforeRefresh = marketFundService.getIntraday('000001');
      expect(beforeRefresh.length).toBe(3);

      // 模拟周日刷新：将当前时间设为周日
      const sundayMorning = new Date('2026-07-05 11:00:00');
      jest.setSystemTime(sundayMorning);

      // API 返回周五数据（gztime = 周五 15:00）
      // 关键：传入的 lastUpdated 是周五时间，而不是当前周日时间
      const friday1500 = new Date('2026-07-03 15:00:00').getTime();
      marketFundService.appendIntradayPoint('000001', 1.28, 1.5, friday1500, '2026-07-03');

      // 期望：周五的日内数据应该被保留（因为新数据也是周五的）
      const afterRefresh = marketFundService.getIntraday('000001');
      expect(afterRefresh.length).toBe(4); // 原有3个点 + 新增1个点
      expect(afterRefresh[0].value).toBeCloseTo(1.20);
      expect(afterRefresh[3].value).toBeCloseTo(1.28);

      jest.useRealTimers();
    });

    test('should clear intraday data when API data is from different day', () => {
      // 场景：周一开盘，API 返回周一数据，应清除周五的旧日内数据
      marketFundService.addFund('000001', '测试基金');

      // 模拟当前时间是周五
      const fridayMorning = new Date('2026-07-03 09:00:00');
      jest.useFakeTimers().setSystemTime(fridayMorning);

      // 添加周五的日内数据
      const friday1000 = new Date('2026-07-03 10:00:00').getTime();
      marketFundService.appendIntradayPoint('000001', 1.22, 0.5, friday1000, '2026-07-03');

      // 验证周五数据已添加
      expect(marketFundService.getIntraday('000001').length).toBe(1);

      // 模拟周一刷新：当前时间设为周一
      const mondayMorning = new Date('2026-07-05 09:00:00');
      jest.setSystemTime(mondayMorning);

      // API 返回周一数据
      const monday930 = new Date('2026-07-05 09:30:00').getTime();
      marketFundService.appendIntradayPoint('000001', 1.30, 2.0, monday930, '2026-07-05');

      // 期望：周五数据应该被清除，只保留周一新数据
      const afterRefresh = marketFundService.getIntraday('000001');
      expect(afterRefresh.length).toBe(1);
      expect(afterRefresh[0].value).toBeCloseTo(1.30);
      // 验证时间戳是周一
      const mondayDate = new Date(afterRefresh[0].timestamp);
      expect(mondayDate.getDate()).toBe(5);

      jest.useRealTimers();
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

  describe('updateIntraday - f80 trade date handling', () => {
    test('should clear old intraday when f80 indicates new trade date', () => {
      marketFundService.addFund('000001', '测试基金');

      // Set initial intraday data (old date)
      const oldTs = new Date('2026-05-07 10:00').getTime();
      const oldPts: IntradayPoint[] = [
        { timestamp: oldTs, value: 1.20, equityReturn: 0 },
      ];
      marketFundService.updateIntraday('000001', oldPts);

      // Verify old data was added
      expect(marketFundService.getIntraday('000001').length).toBe(1);

      // Update with new data and f80 indicating new trade date
      const newTs = new Date('2026-05-08 10:00').getTime();
      const newPts: IntradayPoint[] = [
        { timestamp: newTs, value: 1.25, equityReturn: 0 },
      ];
      // f80 indicates trade date 2026-05-08 (different from old data's date)
      const f80 = '[{"b":202605081000,"e":202605081130}]';
      marketFundService.updateIntraday('000001', newPts, f80);

      const intraday = marketFundService.getIntraday('000001');
      expect(intraday.length).toBe(1);
      expect(intraday[0].value).toBeCloseTo(1.25);
    });

    test('should NOT clear old intraday when f80 indicates same trade date', () => {
      marketFundService.addFund('000001', '测试基金');

      // Set initial intraday data (same date as f80)
      const oldTs = new Date('2026-05-08 09:30').getTime();
      const oldPts: IntradayPoint[] = [
        { timestamp: oldTs, value: 1.20, equityReturn: 0 },
      ];
      marketFundService.updateIntraday('000001', oldPts);

      // Update with new data and f80 indicating same trade date
      const newTs = new Date('2026-05-08 10:00').getTime();
      const newPts: IntradayPoint[] = [
        { timestamp: newTs, value: 1.25, equityReturn: 0 },
      ];
      // f80 indicates trade date 2026-05-08 (same as old data's date)
      const f80 = '[{"b":202605081000,"e":202605081130}]';
      marketFundService.updateIntraday('000001', newPts, f80);

      const intraday = marketFundService.getIntraday('000001');
      // Old data should be cleared because updateIntraday replaces all data
      expect(intraday.length).toBe(1);
      expect(intraday[0].value).toBeCloseTo(1.25);
    });

    test('should NOT clear old intraday when f80 is undefined (fallback)', () => {
      marketFundService.addFund('000001', '测试基金');

      // Set initial intraday data
      const oldTs = new Date('2026-05-07 10:00').getTime();
      const oldPts: IntradayPoint[] = [
        { timestamp: oldTs, value: 1.20, equityReturn: 0 },
      ];
      marketFundService.updateIntraday('000001', oldPts);

      // Update without f80 - should not clear old data based on date check
      const newTs = new Date('2026-05-08 10:00').getTime();
      const newPts: IntradayPoint[] = [
        { timestamp: newTs, value: 1.25, equityReturn: 0 },
      ];
      // No f80 provided
      marketFundService.updateIntraday('000001', newPts);

      const intraday = marketFundService.getIntraday('000001');
      // updateIntraday replaces all data, so only new data should exist
      expect(intraday.length).toBe(1);
      expect(intraday[0].value).toBeCloseTo(1.25);
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