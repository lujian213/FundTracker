/**
 * tests/utils/dataSnapshotService.test.ts
 *
 * 测试 dataSnapshotService 的核心功能
 */

import { buildSnapshotData, downloadSnapshotFile, MockDataSnapshot } from '../../utils/dataSnapshotService';
import { STORAGE_KEYS } from '../../services/storageKeys';
import * as marketNewsService from '../../services/marketNewsService';

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
    test('should return empty data when localStorage is empty', () => {
      const result = buildSnapshotData();

      expect(result.timestamp).toBeTruthy();
      expect(result.data).toEqual({});
      expect(result.newsCache).toEqual([]);
    });

    test('should collect all 7 localStorage keys', () => {
      // 设置所有7个key的数据
      localStorage.setItem(STORAGE_KEYS.USER_PREFERENCE, JSON.stringify({ sortOrder: 'desc' }));
      localStorage.setItem(STORAGE_KEYS.SYSTEM_CONFIG, JSON.stringify({ sync: {}, ai: {} }));
      localStorage.setItem(STORAGE_KEYS.CALENDAR, JSON.stringify({ '2026-04-10': [] }));
      localStorage.setItem(STORAGE_KEYS.INVESTMENT_DRAFT, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.COMBO_TRADE, JSON.stringify({}));
      localStorage.setItem(STORAGE_KEYS.FUND_DATA, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.INDEX_DATA, JSON.stringify([]));

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

    test('should only include existing keys', () => {
      localStorage.setItem(STORAGE_KEYS.USER_PREFERENCE, JSON.stringify({ sortOrder: 'asc' }));
      localStorage.setItem(STORAGE_KEYS.FUND_DATA, JSON.stringify([{ symbol: '000001' }]));

      const result = buildSnapshotData();

      expect(Object.keys(result.data)).toHaveLength(2);
      expect(result.data[STORAGE_KEYS.USER_PREFERENCE]).toBeDefined();
      expect(result.data[STORAGE_KEYS.FUND_DATA]).toBeDefined();
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
});