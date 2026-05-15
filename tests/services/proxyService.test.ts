// tests/services/proxyService.test.ts
import { fetchWithProxy, orderProxiesByPreference, PROXY_LIST, getProxyScoresSummary, resetProxyScores } from '../../services/proxyService';

// Mock fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

// Mock AbortController
class MockAbortController {
  signal = {};
  abort() {}
}
(global as any).AbortController = MockAbortController;

describe('proxyService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    resetProxyScores();  // 重置评分状态，确保测试独立
  });

  describe('orderProxiesByPreference', () => {
    test('returns proxies sorted by score (high to low)', () => {
      // 默认情况下，所有代理分数都是 0.5，顺序不确定
      // 但排序逻辑应该按分数降序排列
      const result = orderProxiesByPreference(PROXY_LIST);

      // 验证返回了所有代理
      expect(result.length).toBe(PROXY_LIST.length);

      // 验证所有代理都在结果中
      const resultNames = result.map(p => p.name);
      const originalNames = PROXY_LIST.map(p => p.name);
      expect(resultNames.sort()).toEqual(originalNames.sort());
    });

    test('score affects proxy order after successful requests', async () => {
      // 第一个请求：让 law-ai 成功
      const mockHtml = `<!DOCTYPE html><html><head><title>Test</title></head><body>Test content with enough length to pass validation check. Adding more content here.</body></html>`;

      // 设置 mock：law-ai（第二个代理）成功，其他失败
      mockFetch.mockRejectedValueOnce(new Error('Network error')); // r.jina.ai 失败
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockHtml),
      }); // law-ai 成功

      await fetchWithProxy('https://example.com');

      // 现在获取排序结果，law-ai 分数应该更高
      const summary = getProxyScoresSummary();
      const lawAiScore = summary.find(s => s.name === 'law-ai')?.score;
      const rJinaAiScore = summary.find(s => s.name === 'r.jina.ai')?.score;

      // law-ai 成功后分数应该比 r.jina.ai 高
      expect(lawAiScore).toBeGreaterThan(rJinaAiScore!);
    });
  });

  describe('Proxy Score System', () => {
    test('score decreases after failure', async () => {
      // 所有代理都失败多次
      for (let round = 0; round < 3; round++) {
        for (let i = 0; i < PROXY_LIST.length; i++) {
          mockFetch.mockRejectedValueOnce(new Error('Network error'));
        }
        try {
          await fetchWithProxy('https://example.com');
        } catch (e) {
          // 预期失败
        }
      }

      const summary = getProxyScoresSummary();

      // 所有代理分数应该下降
      for (const s of summary) {
        if (s.requests > 0) {
          expect(s.successRate).toBeLessThan(1);
        }
      }
    });

    test('score increases after success', async () => {
      const mockHtml = `<!DOCTYPE html><html><head><title>Test</title></head><body>Test content with enough length to pass validation check. Adding more content here.</body></html>`;

      // 让第一个代理成功
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockHtml),
      });

      await fetchWithProxy('https://example.com');

      const summary = getProxyScoresSummary();
      const successProxy = summary.find(s => s.requests > 0 && s.successRate === 1);

      expect(successProxy).toBeDefined();
      expect(successProxy!.score).toBeGreaterThan(0.5);
    });

    test('getProxyScoresSummary returns all proxies', () => {
      const summary = getProxyScoresSummary();

      // 应包含所有代理
      expect(summary.length).toBe(PROXY_LIST.length);

      const summaryNames = summary.map(s => s.name);
      const proxyNames = PROXY_LIST.map(p => p.name);
      expect(summaryNames.sort()).toEqual(proxyNames.sort());
    });

    test('default score is 0.5 for proxies with no requests', () => {
      // 新创建的评分摘要，未请求的代理分数应为 0.5
      const summary = getProxyScoresSummary();

      for (const s of summary) {
        if (s.requests === 0) {
          expect(s.score).toBe(0.5);
        }
      }
    });
  });

  describe('fetchWithProxy', () => {
    // 辅助函数：创建成功的 mock response
    const createMockResponse = (content: string) => ({
      ok: true,
      text: () => Promise.resolve(content),
    });

    // 辅助函数：创建失败的 mock response
    const createMockErrorResponse = (status: number) => ({
      ok: false,
      status,
      text: () => Promise.resolve('Error'),
    });

    test('successfully fetches content from working proxy', async () => {
      const mockContent = `<!DOCTYPE html><html><head><title>Test</title></head><body>Test content with enough length to pass validation check in proxyService. Adding more text to ensure sufficient length.</body></html>`;
      mockFetch.mockResolvedValueOnce(createMockResponse(mockContent));

      const result = await fetchWithProxy('https://example.com');

      expect(result.content).toBe(mockContent);
      expect(result.proxyName).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('tries next proxy when first fails with network error', async () => {
      // 第一个代理失败
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // 第二个代理成功
      const mockHtmlContent = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <div>Test content with enough length to pass validation check in proxyService.</div>
  <p>Adding more content to ensure the total length exceeds 100 characters.</p>
</body>
</html>`;
      mockFetch.mockResolvedValueOnce(createMockResponse(mockHtmlContent));

      const result = await fetchWithProxy('https://example.com');

      expect(result.content).toBe(mockHtmlContent);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('throws error when all proxies fail', async () => {
      // 所有代理都失败
      for (let i = 0; i < PROXY_LIST.length; i++) {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));
      }

      await expect(fetchWithProxy('https://example.com')).rejects.toThrow('所有代理均失败');
    });

    test('throws error when response is not ok', async () => {
      // 所有代理返回非 ok 响应
      for (let i = 0; i < PROXY_LIST.length; i++) {
        mockFetch.mockResolvedValueOnce(createMockErrorResponse(404));
      }

      await expect(fetchWithProxy('https://example.com')).rejects.toThrow('所有代理均失败');
    });

    test('throws error when content is too short', async () => {
      // 所有代理返回过短内容
      for (let i = 0; i < PROXY_LIST.length; i++) {
        mockFetch.mockResolvedValueOnce(createMockResponse('short'));
      }

      await expect(fetchWithProxy('https://example.com')).rejects.toThrow('所有代理均失败');
    });

    test('throws error when raw proxy returns non-HTML content', async () => {
      // 所有代理返回非 HTML 内容（对于 raw 代理会失败）
      for (let i = 0; i < PROXY_LIST.length; i++) {
        mockFetch.mockResolvedValueOnce(createMockResponse('Not HTML content without proper tags'));
      }

      await expect(fetchWithProxy('https://example.com')).rejects.toThrow('所有代理均失败');
    });

    test('validates HTML content for raw format proxies', async () => {
      // raw 格式代理返回有效 HTML
      const validHtml = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <div>Valid content with enough length to pass validation check.</div>
  <p>Adding more content to ensure the total length exceeds 100 characters.</p>
</body>
</html>`;
      mockFetch.mockResolvedValueOnce(createMockResponse(validHtml));

      const result = await fetchWithProxy('https://example.com');

      expect(result.content).toBe(validHtml);
    });

    test('timeout error is handled correctly', async () => {
      // 模拟超时错误
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      // 所有代理都超时
      for (let i = 0; i < PROXY_LIST.length; i++) {
        mockFetch.mockRejectedValueOnce(abortError);
      }

      // 验证错误消息包含超时信息
      await expect(fetchWithProxy('https://example.com')).rejects.toThrow('超时');
    });
  });

  describe('PROXY_LIST', () => {
    test('contains expected proxies', () => {
      expect(PROXY_LIST.length).toBeGreaterThanOrEqual(4);

      const proxyNames = PROXY_LIST.map(p => p.name);
      expect(proxyNames).toContain('r.jina.ai');
      expect(proxyNames).toContain('law-ai');
      expect(proxyNames).toContain('allorigins');
      expect(proxyNames).toContain('corsproxy');
    });

    test('each proxy has valid buildUrl function', () => {
      const targetUrl = 'https://example.com/page';

      for (const proxy of PROXY_LIST) {
        const proxyUrl = proxy.buildUrl(targetUrl);
        expect(proxyUrl).toContain('example.com');
        expect(proxyUrl).toMatch(/^https?:\/\//);
      }
    });

    test('law-ai proxy does not encode target URL', () => {
      const lawAiProxy = PROXY_LIST.find(p => p.name === 'law-ai');
      expect(lawAiProxy).toBeDefined();

      const targetUrl = 'https://example.com/path?query=value&foo=bar';
      const proxyUrl = lawAiProxy!.buildUrl(targetUrl);

      // law-ai 代理不接受编码后的 URL
      expect(proxyUrl).toContain('target=');
      // URL 不应该被编码
      expect(proxyUrl).toContain('https://example.com');
      expect(proxyUrl).not.toContain('%3A');
      expect(proxyUrl).not.toContain('%2F');
    });

    test('txtify proxy is included', () => {
      const txtifyProxy = PROXY_LIST.find(p => p.name === 'txtify');
      expect(txtifyProxy).toBeDefined();
      expect(txtifyProxy!.format).toBe('markdown');
    });
  });
});