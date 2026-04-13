/**
 * indexService 迁移测试
 * 测试指数迁移时顺序保持和验证功能
 */

import { IndexInfo, MarketIndex } from '../../types';
import * as indexService from '../../services/indexService';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: jest.fn((key: string) => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; }),
    get store() { return store; }
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('indexService 迁移顺序测试', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
    // 重置 indexService 缓存
    indexService.resetCache();
  });

  describe('迁移保持指数顺序', () => {
    const testSymbols = ['1.000001', '0.399001', '0.399006', '100.HSI', '100.NDX', '100.SPX'];
    const testInfos: IndexInfo[] = testSymbols.map((symbol, idx) => ({
      symbol,
      name: `测试指数${idx}`,
      current: 1000 + idx * 100,
      change: idx,
      changePercent: idx * 0.1,
      lastUpdated: '2024-01-01'
    }));

    it('从统一 key 迁移时保持指数顺序', () => {
      // 设置旧的统一 key 数据
      localStorageMock.setItem('fund_all_indices_info', JSON.stringify(testInfos));

      // 触发迁移（通过重置缓存）
      indexService.resetCache();

      // 验证新数据顺序
      const newSymbols = indexService.getAllIndexSymbols();
      expect(newSymbols).toEqual(testSymbols);
    });

    it('从分开的两个 key 迁移时保持指数顺序', () => {
      // 模拟分开的国内和全球指数
      const domesticInfos = testInfos.slice(0, 3); // 前3个国内
      const globalInfos = testInfos.slice(3); // 后3个全球

      localStorageMock.setItem('fund_indices_info', JSON.stringify(domesticInfos));
      localStorageMock.setItem('fund_global_indices_info', JSON.stringify(globalInfos));

      // 触发迁移
      indexService.resetCache();

      // 验证新数据顺序：国内 + 全球
      const newSymbols = indexService.getAllIndexSymbols();
      expect(newSymbols).toEqual(testSymbols);
    });

    it('从旧配置格式迁移时保持指数顺序', () => {
      const domesticSymbols = testSymbols.slice(0, 3);
      const globalSymbols = testSymbols.slice(3);

      // 设置旧配置格式
      localStorageMock.setItem('fund_indices_config', JSON.stringify(domesticSymbols));
      localStorageMock.setItem('fund_global_indices_config', JSON.stringify(globalSymbols));

      // 设置市场数据
      const marketData: Record<string, any> = {};
      testInfos.forEach(info => {
        marketData[info.symbol] = info;
      });
      localStorageMock.setItem('fund_index_market_data', JSON.stringify(marketData));

      // 触发迁移
      indexService.resetCache();

      // 验证新数据顺序
      const newSymbols = indexService.getAllIndexSymbols();
      expect(newSymbols).toEqual(testSymbols);
    });
  });

  describe('验证函数检测顺序不一致', () => {
    it('验证函数检测到顺序不一致时只打印警告', () => {
      const originalOrder = ['1.000001', '0.399001', '0.399006'];
      const wrongOrder = ['0.399001', '1.000001', '0.399006'];

      // 设置旧数据（原始顺序）
      const oldInfos: IndexInfo[] = originalOrder.map((symbol, idx) => ({
        symbol,
        name: `指数${idx}`,
        current: 1000,
        change: 0,
        changePercent: 0,
        lastUpdated: ''
      }));
      localStorageMock.setItem('fund_all_indices_info', JSON.stringify(oldInfos));

      // 设置新数据（错误顺序，包含intraday数据）
      const mockIntraday = [
        { timestamp: Date.now() - 3600000, value: 3100, equityReturn: 0.5 },
      ];
      const newMarketIndices: MarketIndex[] = wrongOrder.map((symbol, idx) => ({
        info: {
          symbol,
          name: `指数${originalOrder.indexOf(symbol)}`,
          current: 1000,
          change: 0,
          changePercent: 0,
          lastUpdated: ''
        },
        intraday: symbol === '1.000001' ? mockIntraday : [],
        history: []
      }));
      localStorageMock.setItem('fund_all_indices_data', JSON.stringify(newMarketIndices));

      // 重置缓存以加载新数据
      indexService.resetCache();

      // 验证迁移结果
      const result = indexService.verifyIndexMigration(false);

      // 验证函数应该只打印警告，不触发重新迁移
      expect(result.details.some(d => d.includes('顺序不一致') && d.includes('警告'))).toBe(true);
      expect(result.details.some(d => d.includes('重新迁移'))).toBe(false);

      // 验证intraday数据被保留
      const savedDataRaw = localStorageMock.getItem('fund_all_indices_data');
      const savedData = savedDataRaw ? JSON.parse(savedDataRaw) : [];
      const shanghaiIndex = savedData.find((m: MarketIndex) => m.info.symbol === '1.000001');
      expect(shanghaiIndex?.intraday.length).toBe(1);
    });

    it('验证函数确认顺序一致', () => {
      const symbols = ['1.000001', '0.399001', '0.399006'];

      // 设置旧数据
      const oldInfos: IndexInfo[] = symbols.map((symbol, idx) => ({
        symbol,
        name: `指数${idx}`,
        current: 1000,
        change: 0,
        changePercent: 0,
        lastUpdated: ''
      }));
      localStorageMock.setItem('fund_all_indices_info', JSON.stringify(oldInfos));

      // 设置新数据（相同顺序）
      const newMarketIndices: MarketIndex[] = symbols.map((symbol, idx) => ({
        info: {
          symbol,
          name: `指数${idx}`,
          current: 1000,
          change: 0,
          changePercent: 0,
          lastUpdated: ''
        },
        intraday: [],
        history: []
      }));
      localStorageMock.setItem('fund_all_indices_data', JSON.stringify(newMarketIndices));

      // 重置缓存
      indexService.resetCache();

      // 验证迁移结果
      const result = indexService.verifyIndexMigration(false);

      // 应该确认顺序一致
      expect(result.details.some(d => d.includes('顺序一致'))).toBe(true);
    });
  });

  describe('saveAllIndexInfos 保持顺序', () => {
    it('saveAllIndexInfos 保持传入的指数顺序', () => {
      const customOrder = ['100.SPX', '100.NDX', '1.000001', '0.399006', '100.HSI', '0.399001'];
      const infos: IndexInfo[] = customOrder.map((symbol, idx) => ({
        symbol,
        name: `自定义顺序${idx}`,
        current: 1000,
        change: 0,
        changePercent: 0,
        lastUpdated: ''
      }));

      indexService.saveAllIndexInfos(infos);

      const savedSymbols = indexService.getAllIndexSymbols();
      expect(savedSymbols).toEqual(customOrder);
    });
  });

  describe('顺序不一致不应删除已有数据', () => {
    it('验证顺序不一致时不应删除新key中的intraday数据', () => {
      // 场景重现：导入备份后，新key有完整intraday，但顺序与旧key不同
      const newOrder = ['1.000001', '0.399001', '0.399006', '100.HSI', '100.NDX', '100.SPX'];
      const oldOrder = ['100.NDX', '100.SPX', '100.HSI', '1.000001', '0.399001', '0.399006']; // 旧key中的顺序不同

      // 设置旧key（Phase 1的IndexInfo，顺序不同）
      const oldInfos: IndexInfo[] = oldOrder.map((symbol, idx) => ({
        symbol,
        name: `旧顺序指数${idx}`,
        current: 1000,
        change: 0,
        changePercent: 0,
        lastUpdated: ''
      }));
      localStorageMock.setItem('fund_all_indices_info', JSON.stringify(oldInfos));

      // 设置新key（包含完整的intraday数据）
      const mockIntraday = [
        { timestamp: Date.now() - 3600000, value: 3100, equityReturn: 0.5 },  // 1小时前
        { timestamp: Date.now() - 1800000, value: 3110, equityReturn: 0.6 },  // 30分钟前
        { timestamp: Date.now() - 60000, value: 3120, equityReturn: 0.7 },    // 1分钟前
      ];
      const newMarketIndices: MarketIndex[] = newOrder.map((symbol, idx) => ({
        info: {
          symbol,
          name: `新顺序指数${idx}`,
          current: 1000 + idx * 100,
          change: idx,
          changePercent: idx * 0.1,
          lastUpdated: ''
        },
        intraday: symbol === '1.000001' ? mockIntraday : [],  // 上证指数有完整intraday
        history: []
      }));
      localStorageMock.setItem('fund_all_indices_data', JSON.stringify(newMarketIndices));

      // 重置缓存以加载新数据
      indexService.resetCache();

      // 调用验证函数
      const result = indexService.verifyIndexMigration(false);

      // 期望：顺序不一致应该只打印警告，不应触发重新迁移
      // 当前问题：会触发重新迁移，删除新key的intraday数据

      // 检查新key中的intraday数据是否被保留
      const savedDataRaw = localStorageMock.getItem('fund_all_indices_data');
      const savedData = savedDataRaw ? JSON.parse(savedDataRaw) : [];
      const shanghaiIndex = savedData.find((m: MarketIndex) => m.info.symbol === '1.000001');

      // 关键验证：intraday数据应该被保留，不应被删除
      expect(shanghaiIndex?.intraday.length).toBe(3);
      expect(shanghaiIndex?.intraday[0].value).toBe(3100);

      // 验证不应该触发重新迁移（这是修复后的期望行为）
      // 当前代码会触发重新迁移，导致测试失败
      expect(result.details.some(d => d.includes('重新迁移'))).toBe(false);
      expect(result.details.some(d => d.includes('顺序不一致') && d.includes('警告'))).toBe(true);
    });

    it('新key不存在时才应触发迁移', () => {
      // 场景：新key不存在，需要从旧key迁移
      const oldOrder = ['1.000001', '0.399001', '0.399006'];

      // 只设置旧key，新key不存在
      const oldInfos: IndexInfo[] = oldOrder.map((symbol, idx) => ({
        symbol,
        name: `指数${idx}`,
        current: 1000,
        change: 0,
        changePercent: 0,
        lastUpdated: ''
      }));
      localStorageMock.setItem('fund_all_indices_info', JSON.stringify(oldInfos));

      // 设置独立的intraday key
      const mockIntraday = [
        { timestamp: Date.now() - 3600000, value: 3100, equityReturn: 0.5 },
      ];
      localStorageMock.setItem('fund_intraday_1.000001', JSON.stringify(mockIntraday));

      // 重置缓存触发迁移
      indexService.resetCache();

      // 验证迁移完成：新key应该存在
      const savedDataRaw = localStorageMock.getItem('fund_all_indices_data');
      expect(savedDataRaw).not.toBeNull();

      const savedData = savedDataRaw ? JSON.parse(savedDataRaw) : [];
      // 验证迁移后有数据（至少包含旧key的指数）
      expect(savedData.length).toBeGreaterThanOrEqual(3);

      // 验证旧key的指数被迁移到新key中
      const symbolsInNewKey = savedData.map((m: MarketIndex) => m.info.symbol);
      expect(symbolsInNewKey).toContain('1.000001');
      expect(symbolsInNewKey).toContain('0.399001');
      expect(symbolsInNewKey).toContain('0.399006');

      // 验证intraday数据被迁移（如果存在）
      const shanghaiIndex = savedData.find((m: MarketIndex) => m.info.symbol === '1.000001');
      // 注意：filterTodayIntraday会过滤当天数据，所以intraday可能为空
      expect(shanghaiIndex).toBeDefined();
    });
  });
});