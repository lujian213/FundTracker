/**
 * indexService.persistence.test.ts
 *
 * 单元测试：验证指数 intraday 数据的持久化机制
 * 与 marketFundService 的机制对比
 */

import * as indexService from '../../services/indexService';
import * as marketFundService from '../../services/marketFundService';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: jest.fn((key: string) => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; }),
    get store() { return store; },
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('指数 Intraday 数据持久化测试', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  describe('indexService.saveToStorage', () => {
    it('appendIntradayPoint 应该调用 localStorage.setItem', () => {
      // 先初始化一个指数
      indexService.resetToDefaults();

      const symbol = '1.000001';

      // 清除之前的调用记录
      localStorageMock.setItem.mockClear();

      // 添加一个 intraday 点
      indexService.appendIntradayPoint(symbol, 3300.00, 0.5);

      // 验证 localStorage.setItem 被调用
      expect(localStorageMock.setItem).toHaveBeenCalled();

      // 验证保存的 key 是正确的
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'fund_all_indices_data',
        expect.any(String)
      );

      // 验证保存的数据包含 intraday
      const savedData = localStorageMock.store['fund_all_indices_data'];
      const parsed = JSON.parse(savedData);
      const target = parsed.find((i: any) => i.info.symbol === symbol);

      expect(target).toBeDefined();
      expect(target.intraday).toBeDefined();
      expect(target.intraday.length).toBeGreaterThanOrEqual(1);
    });

    it('不同分钟时间戳的多个 intraday 点应该都保存', () => {
      indexService.resetToDefaults();

      const symbol = '1.000001';

      // 使用 updateIntraday 设置多个不同时间戳的点
      const now = Date.now();
      const points = [
        { timestamp: now - 2 * 60 * 1000, value: 3300.00, equityReturn: 0.5 }, // 2分钟前
        { timestamp: now - 1 * 60 * 1000, value: 3301.00, equityReturn: 0.6 }, // 1分钟前
        { timestamp: now, value: 3302.00, equityReturn: 0.7 }, // 现在
      ];

      indexService.updateIntraday(symbol, points);

      // 验证 localStorage 数据
      const savedData = localStorageMock.store['fund_all_indices_data'];
      const parsed = JSON.parse(savedData);
      const target = parsed.find((i: any) => i.info.symbol === symbol);

      expect(target.intraday.length).toBe(3);
      expect(target.intraday[0].value).toBe(3300.00);
      expect(target.intraday[1].value).toBe(3301.00);
      expect(target.intraday[2].value).toBe(3302.00);
    });

    it('相同值的连续点应该被压缩（只保留最早的）', () => {
      indexService.resetToDefaults();

      const symbol = '1.000001';

      // 使用不同时间戳但相同值
      const now = Date.now();
      const points = [
        { timestamp: now - 4 * 60 * 1000, value: 3300.00, equityReturn: 0.5 },
        { timestamp: now - 3 * 60 * 1000, value: 3300.00, equityReturn: 0.5 },
        { timestamp: now - 2 * 60 * 1000, value: 3300.00, equityReturn: 0.5 },
        { timestamp: now - 1 * 60 * 1000, value: 3300.00, equityReturn: 0.5 },
        { timestamp: now, value: 3300.00, equityReturn: 0.5 },
      ];

      // updateIntraday 会调用压缩函数
      indexService.updateIntraday(symbol, points);

      // 验证 localStorage 数据 - 应该只有 1 个点（压缩）
      const savedData = localStorageMock.store['fund_all_indices_data'];
      const parsed = JSON.parse(savedData);
      const target = parsed.find((i: any) => i.info.symbol === symbol);

      // 连续相同值被跳过，应该只有 1 个点
      expect(target.intraday.length).toBe(1);
    });
  });

  describe('对比 indexService 和 marketFundService', () => {
    it('两者的 updateIntraday 都调用 saveToStorage', () => {
      // 初始化指数
      indexService.resetToDefaults();

      // 初始化基金
      const fundSymbol = '000001';
      marketFundService.addFund(fundSymbol, '测试基金');

      // 清除之前的调用记录
      localStorageMock.setItem.mockClear();

      // 添加指数 intraday 点
      const now = Date.now();
      indexService.updateIntraday('1.000001', [
        { timestamp: now, value: 3300.00, equityReturn: 0.5 },
      ]);

      // 记录指数的调用
      const indexCalls = localStorageMock.setItem.mock.calls.filter(
        (call: any[]) => call[0] === 'fund_all_indices_data'
      );

      // 清除调用记录
      localStorageMock.setItem.mockClear();

      // 添加基金 intraday 点
      marketFundService.updateIntraday(fundSymbol, [
        { timestamp: now, value: 1.50, equityReturn: 0.5 },
      ]);

      // 记录基金的调用
      const fundCalls = localStorageMock.setItem.mock.calls.filter(
        (call: any[]) => call[0] === 'fund_all_funds_data'
      );

      // 验证两者都调用了 setItem
      expect(indexCalls.length).toBeGreaterThan(0);
      expect(fundCalls.length).toBeGreaterThan(0);
    });

    it('两者的 localStorage 数据格式应该一致（包含 intraday 字段）', () => {
      // 初始化并添加数据
      indexService.resetToDefaults();

      const now = Date.now();
      indexService.updateIntraday('1.000001', [
        { timestamp: now, value: 3300.00, equityReturn: 0.5 },
      ]);

      const fundSymbol = '000001';
      marketFundService.addFund(fundSymbol, '测试基金');
      marketFundService.updateIntraday(fundSymbol, [
        { timestamp: now, value: 1.50, equityReturn: 0.5 },
      ]);

      // 获取 localStorage 数据
      const indexData = JSON.parse(localStorageMock.store['fund_all_indices_data']);
      const fundData = JSON.parse(localStorageMock.store['fund_all_funds_data']);

      // 验证指数数据格式
      const indexTarget = indexData.find((i: any) => i.info.symbol === '1.000001');
      expect(indexTarget).toHaveProperty('info');
      expect(indexTarget).toHaveProperty('intraday');
      expect(indexTarget).toHaveProperty('history');

      // 验证基金数据格式
      const fundTarget = fundData.find((f: any) => f.info.ticker.symbol === fundSymbol);
      expect(fundTarget).toHaveProperty('info');
      expect(fundTarget).toHaveProperty('intraday');
      expect(fundTarget).toHaveProperty('history');
    });
  });

  describe('潜在问题场景', () => {
    it('指数不在 Map 中时，appendIntradayPoint 会静默失败', () => {
      // 重置为默认指数（只有 6 个默认指数）
      indexService.resetToDefaults();

      // 检查 COMEX 黄金是否在默认列表中
      const symbols = indexService.getAllIndexSymbols();
      const hasCOMEX = symbols.includes('101.GC00Y');

      // COMEX 黄金不在默认列表中
      expect(hasCOMEX).toBe(false);

      // 尝试添加 COMEX 黄金的 intraday 点
      indexService.appendIntradayPoint('101.GC00Y', 2000.00, 0.5);

      // 检查结果 - 应该没有被添加
      const indices = indexService.getAllMarketIndices();
      const comex = indices.find((i: any) => i.info.symbol === '101.GC00Y');

      // COMEX 黄金不存在于 Map 中
      expect(comex).toBeUndefined();

      // localStorage 中也没有
      const savedData = localStorageMock.store['fund_all_indices_data'];
      const parsed = JSON.parse(savedData);
      const comexStored = parsed.find((i: any) => i.info.symbol === '101.GC00Y');
      expect(comexStored).toBeUndefined();
    });

    it('如果指数不在 Map 中，需要先通过其他方式添加', () => {
      indexService.resetToDefaults();

      // 先通过 updateRealtimeData 添加 COMEX 黄金
      indexService.updateRealtimeData('101.GC00Y', {
        name: 'COMEX黄金',
        current: 2000,
        change: 10,
        changePercent: 0.5,
        lastUpdated: '2026-04-10',
      });

      // 现在可以添加 intraday 点了
      indexService.appendIntradayPoint('101.GC00Y', 2000.00, 0.5);

      // 检查结果
      const indices = indexService.getAllMarketIndices();
      const comex = indices.find((i: any) => i.info.symbol === '101.GC00Y');

      expect(comex).toBeDefined();
      expect(comex.intraday.length).toBeGreaterThanOrEqual(1);
    });

    it('模拟用户场景：localStorage 有额外指数，但 init() 后被默认值覆盖', () => {
      // 预先在 localStorage 中设置包含 COMEX 黄金的数据
      const now = Date.now();
      const mockIndexData = [
        {
          info: { symbol: '1.000001', name: '上证指数', current: 3300, change: 10, changePercent: 0.3, lastUpdated: '2026-04-10' },
          intraday: [{ timestamp: now - 60000, value: 3299, equityReturn: 0.2 }],
          history: [],
        },
        {
          info: { symbol: '101.GC00Y', name: 'COMEX黄金', current: 2000, change: 10, changePercent: 0.5, lastUpdated: '2026-04-10' },
          intraday: [
            { timestamp: now - 120000, value: 1998, equityReturn: 0.3 },
            { timestamp: now - 60000, value: 1999, equityReturn: 0.4 },
            { timestamp: now, value: 2000, equityReturn: 0.5 },
          ],
          history: [],
        },
      ];

      localStorageMock.setItem('fund_all_indices_data', JSON.stringify(mockIndexData));

      // 重新初始化
      indexService.resetCache();

      // 验证 COMEX 黄金已正确加载
      const indices = indexService.getAllMarketIndices();
      const comex = indices.find((i: any) => i.info.symbol === '101.GC00Y');

      expect(comex).toBeDefined();
      expect(comex.intraday.length).toBe(3);
    });
  });
});