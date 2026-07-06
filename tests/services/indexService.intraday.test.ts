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

    test('should add intraday point when tradeDate is not today (no local time check)', () => {
      indexService.saveIndexInfo(createTestIndexInfo('1.000001'));

      // tradeDate is yesterday - now allowed since local time check was removed
      indexService.appendIntradayPoint('1.000001', 3300, 0.3, '2026-03-16 15:00', '2026-03-16');

      const intraday = indexService.getIntraday('1.000001');
      expect(intraday.length).toBe(1);
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

  describe('appendIntradayPoint - tradingPeriodBegin handling', () => {
    test('should NOT clear old intraday data when tradingPeriodBegin is in the future (before open)', () => {
      // 场景：开盘前，tradingPeriodBegin 是未来的开盘时间（如 9:30），当前时间是 9:12
      // 旧数据（上一交易日）应该保留，不应该被清空
      indexService.saveIndexInfo(createTestIndexInfo('1.000001'));

      // 设置上一交易日的日内数据
      const yesterdayTs = new Date('2026-03-16 14:00:00').getTime(); // 上一交易日 14:00
      const yesterdayTs2 = new Date('2026-03-16 15:00:00').getTime(); // 上一交易日 15:00
      const pts: IntradayPoint[] = [
        { timestamp: yesterdayTs, value: 3280, equityReturn: 0.28 },
        { timestamp: yesterdayTs2, value: 3300, equityReturn: 0.3 },
      ];
      indexService.updateIntraday('1.000001', pts);

      // 验证旧数据已设置
      const oldData = indexService.getIntraday('1.000001');
      expect(oldData.length).toBe(2);

      // 开盘前：当前时间 9:12，开盘时间 9:30（未来）
      const nowTs = new Date('2026-03-17 09:12:00').getTime(); // 当前时间 9:12
      const tradingPeriodBegin = new Date('2026-03-17 09:30:00').getTime(); // 开盘时间 9:30（未来）

      // 调用 appendIntradayPoint，传入未来开盘时间
      indexService.appendIntradayPoint(
        '1.000001',
        3300,
        0.3,
        nowTs, // 当前时间 9:12
        '2026-03-17',
        tradingPeriodBegin // 开盘时间 9:30（未来）
      );

      // 关键验证：旧数据不应该被清空
      const newData = indexService.getIntraday('1.000001');
      expect(newData.length).toBeGreaterThanOrEqual(2); // 至少保留旧数据
      // 验证旧数据的时间戳仍然存在
      const hasOldTimestamp = newData.some(p => p.timestamp === yesterdayTs || p.timestamp === yesterdayTs2);
      expect(hasOldTimestamp).toBe(true);
    });

    test('should clear old intraday data when tradingPeriodBegin is in the past (after open)', () => {
      // 场景：开盘后，tradingPeriodBegin 是过去的开盘时间（如 9:30），当前时间是 10:00
      // 旧数据（上一交易日）应该被清空，只保留当日数据
      indexService.saveIndexInfo(createTestIndexInfo('1.000001'));

      // 设置上一交易日的日内数据
      const yesterdayTs = new Date('2026-03-16 14:00:00').getTime();
      const pts: IntradayPoint[] = [
        { timestamp: yesterdayTs, value: 3280, equityReturn: 0.28 },
      ];
      indexService.updateIntraday('1.000001', pts);

      // 验证旧数据已设置
      const oldData = indexService.getIntraday('1.000001');
      expect(oldData.length).toBe(1);

      // 开盘后：当前时间 10:00，开盘时间 9:30（过去）
      const nowTs = new Date('2026-03-17 10:00:00').getTime(); // 当前时间 10:00
      const tradingPeriodBegin = new Date('2026-03-17 09:30:00').getTime(); // 开盘时间 9:30（过去）

      // 调用 appendIntradayPoint，传入过去开盘时间
      indexService.appendIntradayPoint(
        '1.000001',
        3320,
        0.32,
        nowTs, // 当前时间 10:00
        '2026-03-17',
        tradingPeriodBegin // 开盘时间 9:30（过去）
      );

      // 关键验证：旧数据应该被清空，只保留当日数据
      const newData = indexService.getIntraday('1.000001');
      expect(newData.length).toBe(1);
      expect(newData[0].value).toBeCloseTo(3320);
      // 验证旧数据的时间戳不存在
      const hasOldTimestamp = newData.some(p => p.timestamp === yesterdayTs);
      expect(hasOldTimestamp).toBe(false);
    });

    test('should NOT clear old intraday data when tradingPeriodBegin is undefined', () => {
      // 场景：没有传入 tradingPeriodBegin，旧数据应该保留
      indexService.saveIndexInfo(createTestIndexInfo('1.000001'));

      // 设置上一交易日的日内数据
      const yesterdayTs = new Date('2026-03-16 14:00:00').getTime();
      const pts: IntradayPoint[] = [
        { timestamp: yesterdayTs, value: 3280, equityReturn: 0.28 },
      ];
      indexService.updateIntraday('1.000001', pts);

      // 调用 appendIntradayPoint，不传入 tradingPeriodBegin
      const nowTs = new Date('2026-03-17 10:00:00').getTime();
      indexService.appendIntradayPoint(
        '1.000001',
        3320,
        0.32,
        nowTs,
        '2026-03-17'
        // tradingPeriodBegin 未传入
      );

      // 验证：旧数据应该保留（因为没有 tradingPeriodBegin 过滤）
      const newData = indexService.getIntraday('1.000001');
      expect(newData.length).toBe(2);
    });

    test('should keep indices Map and getMarketIndex return value synchronized', () => {
      // 场景：验证 getMarketIndex 返回的对象和 indices Map 保持同步
      // 这是数据一致性的关键：item 是 indices.get 的引用，appendIntradayPoint 修改同一个对象
      indexService.saveIndexInfo(createTestIndexInfo('1.000001'));

      // 设置初始日内数据
      const baseTs = new Date('2026-03-17 09:30:00').getTime();
      const pts: IntradayPoint[] = [
        { timestamp: baseTs, value: 3300, equityReturn: 0.3 },
      ];
      indexService.updateIntraday('1.000001', pts);

      // 获取 MarketIndex 对象（模拟 App.tsx 中的 fetchedMap.set）
      // item 是 indices.get(symbol) 的对象引用
      const item = indexService.getMarketIndex('1.000001');
      expect(item).not.toBeNull();
      expect(item!.intraday.length).toBe(1);

      // 调用 appendIntradayPoint 添加新点（模拟 App.tsx 中的 appendIntradayPoint）
      const nowTs = new Date('2026-03-17 10:00:00').getTime();
      const tradingPeriodBegin = new Date('2026-03-17 09:30:00').getTime();
      indexService.appendIntradayPoint(
        '1.000001',
        3320,
        0.32,
        nowTs,
        '2026-03-17',
        tradingPeriodBegin
      );

      // 关键验证：item.intraday 应该已经同步更新
      // 因为 item 和 indices.get(symbol) 是同一个对象，appendIntradayPoint 修改的是同一个引用
      const intradayFromService = indexService.getIntraday('1.000001');
      expect(intradayFromService.length).toBe(2);

      // item.intraday 应该和新数组是同一个引用
      expect(item!.intraday).toBe(intradayFromService);
      expect(item!.intraday.length).toBe(2);  // 同步更新，不是旧快照
    });
  });
});