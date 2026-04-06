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
    it('验证函数检测到顺序不一致时自动重新迁移', () => {
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

      // 设置新数据（错误顺序）
      const newMarketIndices: MarketIndex[] = wrongOrder.map((symbol, idx) => ({
        info: {
          symbol,
          name: `指数${originalOrder.indexOf(symbol)}`,
          current: 1000,
          change: 0,
          changePercent: 0,
          lastUpdated: ''
        },
        intraday: [],
        history: []
      }));
      localStorageMock.setItem('fund_all_indices_data', JSON.stringify(newMarketIndices));

      // 重置缓存以加载新数据
      indexService.resetCache();

      // 验证迁移结果
      const result = indexService.verifyIndexMigration(false);

      // 验证函数应该自动重新迁移并修复顺序
      expect(result.details.some(d => d.includes('重新迁移'))).toBe(true);

      // 验证内存中的顺序已经正确
      const currentSymbols = indexService.getAllIndexSymbols();
      expect(currentSymbols).toEqual(originalOrder);
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
});