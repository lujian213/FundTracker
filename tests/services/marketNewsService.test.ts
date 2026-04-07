// tests/services/marketNewsService.test.ts
import * as marketNewsService from '../../services/marketNewsService';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

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
});