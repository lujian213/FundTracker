// tests/services/marketNewsService.test.ts
import * as marketNewsService from '../../services/marketNewsService';
import { fetchFastNews } from '../../services/marketNewsService';
import { fetchWithProxy } from '../../services/proxyService';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock fetchWithProxy
jest.mock('../../services/proxyService', () => ({
  fetchWithProxy: jest.fn(),
  PROXY_LIST: [],
  orderProxiesByPreference: jest.fn(),
  getProxyScoresSummary: jest.fn(),
  resetProxyScores: jest.fn(),
  checkProxyHealth: jest.fn(),
}));

describe('marketNewsService', () => {
  beforeEach(() => {
    marketNewsService.resetCache();
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('getNews / setNews', () => {
    it('should return empty array initially', () => {
      expect(marketNewsService.getNews()).toEqual([]);
    });

    it('should set and get news items', () => {
      const items = [
        { id: 'news-001', title: 'Test News', time: '10:00', url: 'https://example.com' }
      ];
      marketNewsService.setNews(items);
      expect(marketNewsService.getNews()).toEqual(items);
    });

    it('should overwrite existing news', () => {
      marketNewsService.setNews([{ id: '1', title: 'Old', time: '09:00', url: 'url1' }]);
      marketNewsService.setNews([{ id: '2', title: 'New', time: '10:00', url: 'url2' }]);
      expect(marketNewsService.getNews()).toHaveLength(1);
      expect(marketNewsService.getNews()[0].title).toBe('New');
    });
  });

  describe('resetCache', () => {
    it('should clear news cache', () => {
      marketNewsService.setNews([{ id: '1', title: 'Test', time: '10:00', url: 'url' }]);
      marketNewsService.resetCache();
      expect(marketNewsService.getNews()).toEqual([]);
    });
  });

  describe('fetchMarketNews', () => {
    it('should return news items on successful API response', async () => {
      const mockResponse = {
        data: {
          diff: [
            { f12: '000001', f14: '上证指数', f3: 1.5, f2: 3100, f4: 50 }
          ]
        }
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await marketNewsService.fetchMarketNews();
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].title).toContain('上证指数');
    });

    it('should return failure on empty API response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: {} })
      });
      const result = await marketNewsService.fetchMarketNews();
      expect(result.success).toBe(false);
    });

    it('should return failure on API error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      const result = await marketNewsService.fetchMarketNews();
      expect(result.success).toBe(false);
      expect(result.message).toContain('Network error');
    });

    it('should handle 6-digit fund code', async () => {
      const mockResponse = {
        data: {
          diff: [
            { f12: '110022', f14: '易方达消费', f3: 2.3, f2: 100, f4: 20 }
          ]
        }
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await marketNewsService.fetchMarketNews();
      expect(result.success).toBe(true);
      expect(result.data?.[0].altUrls).toBeDefined();
      // 应该包含基金页链接
      expect(result.data?.[0].altUrls?.some(a => a.label === '基金页')).toBe(true);
    });

    it('should handle BK prefix code', async () => {
      const mockResponse = {
        data: {
          diff: [
            { f12: 'BK0477', f14: '人工智能', f3: 3.2, f2: 200, f4: 30 }
          ]
        }
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await marketNewsService.fetchMarketNews();
      expect(result.success).toBe(true);
      expect(result.data?.[0].altUrls?.some(a => a.label === '板块页')).toBe(true);
    });

    it('should handle index code format (digits.digits)', async () => {
      const mockResponse = {
        data: {
          diff: [
            { f12: '1.000001', f14: '上证指数', f3: 1.5, f2: 3100, f4: 50 }
          ]
        }
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await marketNewsService.fetchMarketNews();
      expect(result.success).toBe(true);
      expect(result.data?.[0].altUrls?.some(a => a.label === '指数页')).toBe(true);
    });

    it('should handle multiple items', async () => {
      const mockResponse = {
        data: {
          diff: [
            { f12: '000001', f14: '上证指数', f3: 1.5, f2: 3100, f4: 50 },
            { f12: 'BK0477', f14: '人工智能', f3: 3.2, f2: 200, f4: 30 }
          ]
        }
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await marketNewsService.fetchMarketNews();
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });
  });

  describe('fetchFastNews', () => {
    const mockedFetchWithProxy = fetchWithProxy as jest.MockedFunction<typeof fetchWithProxy>;

    beforeEach(() => {
      mockedFetchWithProxy.mockReset();
    });

    it('should fetch fast news from API', async () => {
      const mockResponse = {
        code: '1',
        message: 'success',
        data: {
          sortEnd: '123456',
          index: 1,
          total: 100,
          size: 20,
          fastNewsList: [
            {
              code: '202606173774268029',
              title: '吴清：适时发布规范发展资本市场人工智能的指导意见',
              summary: '证监会主席表示...',
              showTime: '2026-06-17 11:11:50',
              titleColor: 3,
              stockList: [],
              image: [],
              share: 0,
              pinglun_Num: 0,
              realSort: '1781665910068029',
            },
          ],
        },
      };

      mockedFetchWithProxy.mockResolvedValueOnce({
        content: JSON.stringify(mockResponse),
        format: 'raw',
        proxyName: 'test-proxy',
      });

      const result = await fetchFastNews(20);

      expect(result).toHaveLength(1);
      expect(result[0].code).toBe('202606173774268029');
      expect(result[0].title).toBe('吴清：适时发布规范发展资本市场人工智能的指导意见');
      expect(result[0].titleColor).toBe(3);
    });

    it('should return empty array on API error', async () => {
      mockedFetchWithProxy.mockRejectedValueOnce(new Error('所有代理均失败'));

      const result = await fetchFastNews(20);
      expect(result).toEqual([]);
    });

    it('should return empty array on invalid JSON response', async () => {
      mockedFetchWithProxy.mockResolvedValueOnce({
        content: 'invalid json',
        format: 'raw',
        proxyName: 'test-proxy',
      });

      const result = await fetchFastNews(20);
      expect(result).toEqual([]);
    });

    it('should return empty array on API returning error code', async () => {
      const mockResponse = {
        code: '0',
        message: 'error',
        data: null,
      };

      mockedFetchWithProxy.mockResolvedValueOnce({
        content: JSON.stringify(mockResponse),
        format: 'raw',
        proxyName: 'test-proxy',
      });

      const result = await fetchFastNews(20);
      expect(result).toEqual([]);
    });

    it('should handle markdown format response from r.jina.ai', async () => {
      const mockJsonData = {
        code: '1',
        message: 'success',
        data: {
          sortEnd: '123456',
          index: 1,
          total: 100,
          size: 20,
          fastNewsList: [
            {
              code: '202606173774268029',
              title: '测试新闻标题',
              summary: '测试摘要',
              showTime: '2026-06-17 11:11:50',
              titleColor: 0,
              stockList: [],
              image: [],
              share: 0,
              pinglun_Num: 0,
              realSort: '1781665910068029',
            },
          ],
        },
      };

      // r.jina.ai 返回的 markdown 格式内容
      const markdownContent = `Title:

URL Source: https://np-weblist.eastmoney.com/api/test

Markdown Content:
${JSON.stringify(mockJsonData)}`;

      mockedFetchWithProxy.mockResolvedValueOnce({
        content: markdownContent,
        format: 'markdown',
        proxyName: 'r.jina.ai',
      });

      const result = await fetchFastNews(20);

      expect(result).toHaveLength(1);
      expect(result[0].code).toBe('202606173774268029');
      expect(result[0].title).toBe('测试新闻标题');
    });

    it('should handle markdown response without marker (fallback to raw parse)', async () => {
      const mockJsonData = {
        code: '1',
        message: 'success',
        data: {
          sortEnd: '123456',
          index: 1,
          total: 100,
          size: 20,
          fastNewsList: [
            {
              code: '202606173774268029',
              title: '测试标题',
              summary: '摘要',
              showTime: '2026-06-17 11:11:50',
              titleColor: 0,
              stockList: [],
              image: [],
              share: 0,
              pinglun_Num: 0,
              realSort: '1781665910068029',
            },
          ],
        },
      };

      // 没有 Markdown Content: 标记的响应
      mockedFetchWithProxy.mockResolvedValueOnce({
        content: JSON.stringify(mockJsonData),
        format: 'markdown',
        proxyName: 'test-proxy',
      });

      const result = await fetchFastNews(20);

      expect(result).toHaveLength(1);
      expect(result[0].code).toBe('202606173774268029');
    });
  });
});