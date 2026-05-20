// tests/services/searchProviders/zhipuSearchProvider.test.ts

import { ZhipuSearchProvider } from '../../../services/searchProviders/zhipuSearchProvider';

// Mock fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe('ZhipuSearchProvider', () => {
  const provider = new ZhipuSearchProvider();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('key', () => {
    it('should have correct key', () => {
      expect(provider.key).toBe('zhipuSearch');
    });
  });

  describe('search', () => {
    it('should throw error when apiKey is missing', async () => {
      await expect(provider.search('test query', {}, 10)).rejects.toThrow('智谱 API 密钥未配置');
    });

    it('should call API with correct parameters', async () => {
      // 使用智谱实际返回格式
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          created: 1779252527,
          id: '20260520124846b8180b93587b48a6',
          request_id: 'zhipu_1779252526720_qalb1c',
          search_result: [
            {
              title: 'Test Result',
              link: 'https://example.com',
              content: 'Test snippet',
              icon: '',
              media: '',
              publish_date: '',
              refer: 'ref_1',
            },
          ],
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const params = {
        apiKey: 'test-api-key',
        searchEngine: 'search_std',
        searchIntent: false,
        count: 10,
      };

      const results = await provider.search('A股市场', params, 10);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://open.bigmodel.cn/api/paas/v4/web_search',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-api-key',
          },
          body: expect.any(String),
          signal: expect.any(Object),
        })
      );

      // Verify request body
      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

      expect(requestBody.search_query).toBe('A股市场');
      expect(requestBody.search_engine).toBe('search_std');
      expect(requestBody.search_intent).toBe(false);
      expect(requestBody.count).toBe(10);
      expect(requestBody.request_id).toMatch(/^zhipu_/);

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Test Result');
      expect(results[0].url).toBe('https://example.com');
      expect(results[0].snippet).toBe('Test snippet');
    });

    it('should use search_pro engine when specified', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          search_result: [],
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const params = {
        apiKey: 'test-api-key',
        searchEngine: 'search_pro',
      };

      await provider.search('test', params, 10);

      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

      expect(requestBody.search_engine).toBe('search_pro');
    });

    it('should include optional parameters when provided', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          search_result: [],
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const params = {
        apiKey: 'test-api-key',
        searchEngine: 'search_std',
        searchDomainFilter: 'www.example.com',
        searchRecencyFilter: 'oneWeek',
        contentSize: 'high',
      };

      await provider.search('test', params, 10);

      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

      expect(requestBody.search_domain_filter).toBe('www.example.com');
      expect(requestBody.search_recency_filter).toBe('oneWeek');
      expect(requestBody.content_size).toBe('high');
    });

    it('should handle web_pages response format (fallback)', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          web_pages: [
            { title: 'Web Page', link: 'https://page.com', content: 'Page snippet' },
          ],
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const params = { apiKey: 'test-api-key' };
      const results = await provider.search('test', params, 10);

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Web Page');
    });

    it('should handle data.search_result response format', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          data: {
            search_result: [
              { title: 'Data Result', link: 'https://data.com', content: 'Data snippet' },
            ],
          },
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const params = { apiKey: 'test-api-key' };
      const results = await provider.search('test', params, 10);

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Data Result');
    });

    it('should return empty array for empty results', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          search_result: [],
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const params = { apiKey: 'test-api-key' };
      const results = await provider.search('test', params, 10);

      expect(results).toEqual([]);
    });

    it('should handle results without content', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          search_result: [
            { title: 'No Content', link: 'https://nocontent.com' },
          ],
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const params = { apiKey: 'test-api-key' };
      const results = await provider.search('test', params, 10);

      expect(results[0].snippet).toBe('');
    });

    it('should validate count for search_pro_sogou engine', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          search_result: [],
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const params = {
        apiKey: 'test-api-key',
        searchEngine: 'search_pro_sogou',
        count: 15, // Invalid for sogou, should be converted to 20
      };

      await provider.search('test', params, 10);

      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

      // search_pro_sogou only supports 10,20,30,40,50
      // 15 should be converted to 20 (next valid value)
      expect(requestBody.count).toBe(20);
    });

    it('should cap count to 50', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          search_result: [],
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const params = {
        apiKey: 'test-api-key',
        count: 100, // Should be capped to 50
      };

      await provider.search('test', params, 10);

      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

      expect(requestBody.count).toBe(50);
    });

    it('should use default count when not specified', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          search_result: [],
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const params = {
        apiKey: 'test-api-key',
      };

      await provider.search('test', params, 10);

      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

      // 默认使用 maxResults 参数（10）
      expect(requestBody.count).toBe(10);
    });

    it('should throw error when request fails', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const params = { apiKey: 'test-api-key' };

      await expect(provider.search('test', params, 10)).rejects.toThrow('智谱搜索请求失败: HTTP 401');
    });

    it('should throw timeout error when request times out', async () => {
      // 模拟 AbortError（超时）
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      mockFetch.mockRejectedValueOnce(abortError);

      const params = { apiKey: 'test-api-key' };

      await expect(provider.search('test', params, 10)).rejects.toThrow('智谱搜索超时');
    });

    it('should throw network error when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const params = { apiKey: 'test-api-key' };

      await expect(provider.search('test', params, 10)).rejects.toThrow('Network error');
    });
  });
});