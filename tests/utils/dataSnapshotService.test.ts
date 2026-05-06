/**
 * tests/utils/dataSnapshotService.test.ts
 *
 * 测试 dataSnapshotService 的核心功能
 */

import { buildSnapshotData, downloadSnapshotFile, MockDataSnapshot } from '../../utils/dataSnapshotService';
import { STORAGE_KEYS } from '../../services/storageKeys';
import * as marketNewsService from '../../services/marketNewsService';
import * as marketFundService from '../../services/marketFundService';
import * as indexService from '../../services/indexService';
import { HistoricalPoint, MarketType } from '../../types';

// Mock marketNewsService
jest.mock('../../services/marketNewsService', () => ({
  getNews: jest.fn(() => []),
}));

describe('dataSnapshotService', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('buildSnapshotData', () => {
    test('should always include fund and index data from memory', () => {
      // 基金和指数数据总是从内存获取
      const result = buildSnapshotData();

      expect(result.timestamp).toBeTruthy();
      expect(result.data[STORAGE_KEYS.FUND_DATA]).toBeDefined();
      expect(result.data[STORAGE_KEYS.INDEX_DATA]).toBeDefined();
      expect(result.newsCache).toEqual([]);
    });

    test('should collect all 7 localStorage keys', () => {
      // 设置所有7个key的数据
      localStorage.setItem(STORAGE_KEYS.USER_PREFERENCE, JSON.stringify({ sortOrder: 'desc' }));
      localStorage.setItem(STORAGE_KEYS.SYSTEM_CONFIG, JSON.stringify({ sync: {}, ai: {} }));
      localStorage.setItem(STORAGE_KEYS.CALENDAR, JSON.stringify({ '2026-04-10': [] }));
      localStorage.setItem(STORAGE_KEYS.INVESTMENT_DRAFT, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.COMBO_TRADE, JSON.stringify({}));
      // 基金和指数数据从内存获取，不需要设置 localStorage

      const result = buildSnapshotData();

      expect(Object.keys(result.data)).toHaveLength(7);
      expect(result.data[STORAGE_KEYS.USER_PREFERENCE]).toBeDefined();
      expect(result.data[STORAGE_KEYS.SYSTEM_CONFIG]).toBeDefined();
      expect(result.data[STORAGE_KEYS.CALENDAR]).toBeDefined();
      expect(result.data[STORAGE_KEYS.INVESTMENT_DRAFT]).toBeDefined();
      expect(result.data[STORAGE_KEYS.COMBO_TRADE]).toBeDefined();
      expect(result.data[STORAGE_KEYS.FUND_DATA]).toBeDefined();
      expect(result.data[STORAGE_KEYS.INDEX_DATA]).toBeDefined();
    });

    test('should include fund/index data plus existing localStorage keys', () => {
      localStorage.setItem(STORAGE_KEYS.USER_PREFERENCE, JSON.stringify({ sortOrder: 'asc' }));

      const result = buildSnapshotData();

      // 基金和指数数据总是存在，加上 USER_PREFERENCE
      expect(Object.keys(result.data)).toHaveLength(3);
      expect(result.data[STORAGE_KEYS.USER_PREFERENCE]).toBeDefined();
      expect(result.data[STORAGE_KEYS.FUND_DATA]).toBeDefined();
      expect(result.data[STORAGE_KEYS.INDEX_DATA]).toBeDefined();
    });

    test('should include newsCache from marketNewsService', () => {
      const mockNews = [
        { id: 'news-0', title: '测试新闻', time: '12:00', url: 'https://example.com' },
      ];
      (marketNewsService.getNews as jest.Mock).mockReturnValueOnce(mockNews);

      const result = buildSnapshotData();

      expect(result.newsCache).toEqual(mockNews);
    });

    test('should mask sync username and password', () => {
      const systemConfig = {
        sync: {
          eggfundUsername: 'my_username',
          eggfundPassword: 'my_password',
        },
        ai: {},
      };
      localStorage.setItem(STORAGE_KEYS.SYSTEM_CONFIG, JSON.stringify(systemConfig));

      const result = buildSnapshotData();
      const maskedConfig = JSON.parse(result.data[STORAGE_KEYS.SYSTEM_CONFIG]);

      expect(maskedConfig.sync.eggfundUsername).toBe('***MASKED***');
      expect(maskedConfig.sync.eggfundPassword).toBe('***MASKED***');
    });

    test('should mask AI API keys', () => {
      const systemConfig = {
        sync: {},
        ai: {
          manager: {
            configs: [
              { name: 'config1', apiKey: 'sk-12345' },
              { name: 'config2', apiKey: 'sk-67890' },
            ],
          },
        },
      };
      localStorage.setItem(STORAGE_KEYS.SYSTEM_CONFIG, JSON.stringify(systemConfig));

      const result = buildSnapshotData();
      const maskedConfig = JSON.parse(result.data[STORAGE_KEYS.SYSTEM_CONFIG]);

      expect(maskedConfig.ai.manager.configs[0].apiKey).toBe('***MASKED***');
      expect(maskedConfig.ai.manager.configs[1].apiKey).toBe('***MASKED***');
      // 其他字段保持不变
      expect(maskedConfig.ai.manager.configs[0].name).toBe('config1');
    });

    test('should mask both sync and AI config', () => {
      const systemConfig = {
        sync: {
          eggfundUsername: 'user',
          eggfundPassword: 'pass',
        },
        ai: {
          manager: {
            configs: [{ name: 'test', apiKey: 'secret-key' }],
          },
        },
      };
      localStorage.setItem(STORAGE_KEYS.SYSTEM_CONFIG, JSON.stringify(systemConfig));

      const result = buildSnapshotData();
      const maskedConfig = JSON.parse(result.data[STORAGE_KEYS.SYSTEM_CONFIG]);

      expect(maskedConfig.sync.eggfundUsername).toBe('***MASKED***');
      expect(maskedConfig.sync.eggfundPassword).toBe('***MASKED***');
      expect(maskedConfig.ai.manager.configs[0].apiKey).toBe('***MASKED***');
    });

    test('should not modify other localStorage keys', () => {
      const userPreference = { sortOrder: 'asc', draftModalHeight: 400 };
      localStorage.setItem(STORAGE_KEYS.USER_PREFERENCE, JSON.stringify(userPreference));

      const result = buildSnapshotData();

      expect(JSON.parse(result.data[STORAGE_KEYS.USER_PREFERENCE])).toEqual(userPreference);
    });

    test('should handle system config with missing fields', () => {
      const systemConfig = {
        sync: {},  // 没有 username/password
        ai: {},    // 没有 manager
      };
      localStorage.setItem(STORAGE_KEYS.SYSTEM_CONFIG, JSON.stringify(systemConfig));

      const result = buildSnapshotData();
      const parsedConfig = JSON.parse(result.data[STORAGE_KEYS.SYSTEM_CONFIG]);

      expect(parsedConfig.sync).toEqual({});
      expect(parsedConfig.ai).toEqual({});
    });

    test('should handle invalid JSON in system config gracefully', () => {
      localStorage.setItem(STORAGE_KEYS.SYSTEM_CONFIG, 'invalid json');

      const result = buildSnapshotData();

      // 解析失败时返回原始数据
      expect(result.data[STORAGE_KEYS.SYSTEM_CONFIG]).toBe('invalid json');
    });

    test('should return valid ISO timestamp', () => {
      const result = buildSnapshotData();

      const timestamp = new Date(result.timestamp);
      expect(timestamp.getTime()).not.toBeNaN();
    });

    test('should only export today\'s investment drafts', () => {
      // 模拟多天的草稿
      const multiDayDrafts = {
        '2026-04-01': { '000001': { fundSymbol: '000001', operation: '买入', amount: '1000', note: '' } },
        '2026-04-02': { '000002': { fundSymbol: '000002', operation: '卖出', amount: '500', note: '' } },
        '2026-04-13': { '000003': { fundSymbol: '000003', operation: '买入', amount: '2000', note: '' } },
      };
      localStorage.setItem(STORAGE_KEYS.INVESTMENT_DRAFT, JSON.stringify(multiDayDrafts));

      // Mock 日期为 2026-04-13
      const mockDate = new Date('2026-04-13T12:00:00');
      jest.useFakeTimers();
      jest.setSystemTime(mockDate);

      const result = buildSnapshotData();

      // 只导出当天的草稿
      const exportedDrafts = JSON.parse(result.data[STORAGE_KEYS.INVESTMENT_DRAFT] || '{}');
      expect(Object.keys(exportedDrafts)).toEqual(['2026-04-13']);
      expect(exportedDrafts['2026-04-13']).toEqual(multiDayDrafts['2026-04-13']);

      jest.useRealTimers();
    });

    test('should handle no drafts for today', () => {
      // 只有历史草稿，没有今天的
      const multiDayDrafts = {
        '2026-04-01': { '000001': { fundSymbol: '000001', operation: '买入', amount: '1000', note: '' } },
        '2026-04-02': { '000002': { fundSymbol: '000002', operation: '卖出', amount: '500', note: '' } },
      };
      localStorage.setItem(STORAGE_KEYS.INVESTMENT_DRAFT, JSON.stringify(multiDayDrafts));

      // Mock 日期为 2026-04-13（没有草稿）
      const mockDate = new Date('2026-04-13T12:00:00');
      jest.useFakeTimers();
      jest.setSystemTime(mockDate);

      const result = buildSnapshotData();

      // 今天没有草稿时，导出空对象
      const exportedDrafts = JSON.parse(result.data[STORAGE_KEYS.INVESTMENT_DRAFT] || '{}');
      expect(exportedDrafts).toEqual({});

      jest.useRealTimers();
    });
  });

  describe('downloadSnapshotFile', () => {
    test('should create download link with correct filename', () => {
      const mockData: MockDataSnapshot = {
        timestamp: '2026-04-10T12:00:00.000Z',
        data: { 'fund_user_preference': '{}' },
        newsCache: [],
      };

      // Mock URL.createObjectURL and revokeObjectURL
      const originalCreateObjectURL = URL.createObjectURL;
      const originalRevokeObjectURL = URL.revokeObjectURL;
      URL.createObjectURL = jest.fn(() => 'blob:test');
      URL.revokeObjectURL = jest.fn();

      // Mock DOM elements
      const mockLink = {
        href: '',
        download: '',
        click: jest.fn(),
      };
      const mockCreateElement = jest.spyOn(document, 'createElement').mockReturnValue(mockLink as any);

      downloadSnapshotFile(mockData);

      expect(mockCreateElement).toHaveBeenCalledWith('a');
      expect(mockLink.download).toMatch(/^mock-data_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/);
      expect(mockLink.click).toHaveBeenCalled();

      mockCreateElement.mockRestore();
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // 数据一致性验证：从内存获取的数据与 localStorage 中的数据格式一致
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('数据一致性验证', () => {
    beforeEach(() => {
      localStorage.clear();
      marketFundService.resetCache();
      indexService.resetCache();
    });

    afterEach(() => {
      localStorage.clear();
      marketFundService.resetCache();
      indexService.resetCache();
    });

    test('基金数据：从内存获取与 localStorage 存储格式一致', () => {
      // 1. 通过 marketFundService 添加基金和历史数据
      marketFundService.addFund('000001', '华夏成长混合');
      marketFundService.addFund('161226', '国投瑞银白银期货LOF');

      const history1: HistoricalPoint[] = [
        { date: 1740000000000, value: 1.48, equityReturn: 0.01 },
        { date: 1740086400000, value: 1.50, equityReturn: 0.014 },
        { date: 1740172800000, value: 1.52, equityReturn: 0.013 },
      ];
      marketFundService.updateHistory('000001', history1);
      marketFundService.updateHistory('161226', history1);

      // 2. 调用 saveAllToStorage() 写入 localStorage
      marketFundService.saveAllToStorage();

      // 3. 获取三份数据进行比较
      const localStorageData = localStorage.getItem(STORAGE_KEYS.FUND_DATA);
      const memoryData = JSON.stringify(marketFundService.getAllMarketFunds());
      const snapshotData = buildSnapshotData().data[STORAGE_KEYS.FUND_DATA];

      // 4. 验证三者完全一致
      expect(localStorageData).toBe(memoryData);
      expect(snapshotData).toBe(memoryData);

      // 5. 验证数据结构正确
      const parsed = JSON.parse(snapshotData);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].info.ticker.symbol).toBe('000001');
      expect(parsed[0].history).toHaveLength(3);
    });

    test('指数数据：从内存获取与 localStorage 存储格式一致', () => {
      // 1. 通过 indexService 更新指数数据（indexService 有默认指数）
      indexService.updateRealtimeData('1.000001', {
        name: '上证指数',
        current: 3200,
        change: 10,
        changePercent: 0.31,
        lastUpdated: '15:00',
        previousClose: 3190,
      });

      const history: HistoricalPoint[] = [
        { date: 1740000000000, value: 3190, equityReturn: 0, volume: 100000, amount: 5000000 },
        { date: 1740086400000, value: 3200, equityReturn: 0.0031, volume: 120000, amount: 6000000 },
      ];
      indexService.updateHistory('1.000001', history);

      // 2. 调用 saveAllToStorage() 写入 localStorage
      indexService.saveAllToStorage();

      // 3. 获取三份数据进行比较
      const localStorageData = localStorage.getItem(STORAGE_KEYS.INDEX_DATA);
      const memoryData = JSON.stringify(indexService.getAllMarketIndices());
      const snapshotData = buildSnapshotData().data[STORAGE_KEYS.INDEX_DATA];

      // 4. 验证三者完全一致
      expect(localStorageData).toBe(memoryData);
      expect(snapshotData).toBe(memoryData);

      // 5. 验证数据结构正确：找到我们更新的指数
      const parsed = JSON.parse(snapshotData);
      const shanghaiIndex = parsed.find(i => i.info.symbol === '1.000001');
      expect(shanghaiIndex).toBeDefined();
      expect(shanghaiIndex!.info.current).toBe(3200);
      expect(shanghaiIndex!.history).toHaveLength(2);
    });

    test('基金和指数数据同时存在时格式一致', () => {
      // 添加基金数据
      marketFundService.addFund('270023', '广发纳斯达克100ETF');
      const fundHistory: HistoricalPoint[] = [
        { date: 1740000000000, value: 5.5, equityReturn: 0.02 },
      ];
      marketFundService.updateHistory('270023', fundHistory);
      marketFundService.saveAllToStorage();

      // 添加指数数据
      indexService.updateRealtimeData('100.NDX', {
        name: '纳斯达克100',
        current: 18000,
        change: -50,
        changePercent: -0.28,
        lastUpdated: '04:00',
        previousClose: 18050,
      });
      indexService.saveAllToStorage();

      // 验证基金数据一致
      const fundLocal = localStorage.getItem(STORAGE_KEYS.FUND_DATA);
      const fundMemory = JSON.stringify(marketFundService.getAllMarketFunds());
      const fundSnapshot = buildSnapshotData().data[STORAGE_KEYS.FUND_DATA];
      expect(fundLocal).toBe(fundMemory);
      expect(fundSnapshot).toBe(fundMemory);

      // 验证指数数据一致
      const indexLocal = localStorage.getItem(STORAGE_KEYS.INDEX_DATA);
      const indexMemory = JSON.stringify(indexService.getAllMarketIndices());
      const indexSnapshot = buildSnapshotData().data[STORAGE_KEYS.INDEX_DATA];
      expect(indexLocal).toBe(indexMemory);
      expect(indexSnapshot).toBe(indexMemory);
    });
  });
});