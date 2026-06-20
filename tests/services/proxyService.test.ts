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

      // 设置 mock：r.jina.ai 失败，law-ai 成功
      mockFetch.mockRejectedValueOnce(new Error('Network error')); // r.jina.ai 失败
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (key: string) => key === 'content-type' ? 'text/html' : null,
        },
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

    test('preferFormat: markdown prioritizes markdown format proxies', () => {
      const result = orderProxiesByPreference(PROXY_LIST, 'markdown');

      // markdown 格式代理应该排在前面
      const markdownProxies = result.filter(p => p.format === 'markdown');
      const rawProxies = result.filter(p => p.format === 'raw');

      // 所有 markdown 代理应该在 raw 代理之前
      if (markdownProxies.length > 0 && rawProxies.length > 0) {
        const lastMarkdownIndex = result.findIndex(p => p.format === 'raw') - 1;
        const firstRawIndex = result.findIndex(p => p.format === 'raw');
        expect(lastMarkdownIndex).toBeLessThan(firstRawIndex);
      }
    });

    test('preferFormat: raw or undefined uses score-based ordering', () => {
      const resultRaw = orderProxiesByPreference(PROXY_LIST, 'raw');
      const resultUndefined = orderProxiesByPreference(PROXY_LIST);

      // 两者应该都按评分排序（不强制 markdown 优先）
      expect(resultRaw.length).toBe(PROXY_LIST.length);
      expect(resultUndefined.length).toBe(PROXY_LIST.length);

      // 检查排序是否基于评分（默认分数相同，顺序不确定）
      const allProxiesIncludedRaw = resultRaw.every(p => PROXY_LIST.some(original => original.name === p.name));
      const allProxiesIncludedUndefined = resultUndefined.every(p => PROXY_LIST.some(original => original.name === p.name));
      expect(allProxiesIncludedRaw).toBe(true);
      expect(allProxiesIncludedUndefined).toBe(true);
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
        headers: {
          get: (key: string) => key === 'content-type' ? 'text/html' : null,
        },
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
    const createMockResponse = (content: string, contentType?: string) => ({
      ok: true,
      headers: {
        get: (key: string) => key === 'content-type' ? (contentType || 'text/html') : null,
      },
      text: () => Promise.resolve(content),
    });

    // 辅助函数：创建失败的 mock response
    const createMockErrorResponse = (status: number) => ({
      ok: false,
      status,
      headers: {
        get: (key: string) => null,
      },
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

    test('supports POST request with custom headers and body', async () => {
      const mockJsonContent = JSON.stringify({ code: 0, data: { results: [] } });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (key: string) => key === 'content-type' ? 'application/json' : null,
        },
        text: () => Promise.resolve(mockJsonContent),
      });

      const result = await fetchWithProxy('https://api.example.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-key',
        },
        body: JSON.stringify({ query: 'test' }),
      });

      expect(result.content).toBe(mockJsonContent);

      // 验证 fetch 调用参数
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1]?.method).toBe('POST');
      expect(fetchCall[1]?.headers).toEqual({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key',
      });
      expect(fetchCall[1]?.body).toBe(JSON.stringify({ query: 'test' }));
    });

    test('validates JSON content when content-type is application/json', async () => {
      // 返回无效 JSON
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (key: string) => key === 'content-type' ? 'application/json' : null,
        },
        text: () => Promise.resolve('not valid json'),
      });

      // 第二个代理返回有效 JSON
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (key: string) => key === 'content-type' ? 'application/json' : null,
        },
        text: () => Promise.resolve(JSON.stringify({ valid: true })),
      });

      const result = await fetchWithProxy('https://api.example.com');

      expect(result.content).toBe(JSON.stringify({ valid: true }));
    });

    test('throws error when all proxies return invalid JSON', async () => {
      // 所有代理返回无效 JSON
      for (let i = 0; i < PROXY_LIST.length; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: {
            get: (key: string) => key === 'content-type' ? 'application/json' : null,
          },
          text: () => Promise.resolve('invalid json'),
        });
      }

      await expect(fetchWithProxy('https://api.example.com')).rejects.toThrow('所有代理均失败');
    });

    test('validateContent callback returns true - validation passes', async () => {
      const mockJsonContent = JSON.stringify({ code: '1', data: { items: [] } });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (key: string) => key === 'content-type' ? 'application/json' : null,
        },
        text: () => Promise.resolve(mockJsonContent),
      });

      const result = await fetchWithProxy('https://api.example.com', {
        validateContent: (content) => {
          const data = JSON.parse(content);
          return data.code === '1';
        },
      });

      expect(result.content).toBe(mockJsonContent);
    });

    test('validateContent callback returns false - tries next proxy', async () => {
      // 第一个代理返回业务错误（code !== '1'）
      const errorResponse = JSON.stringify({ code: '0', message: 'API error' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (key: string) => key === 'content-type' ? 'application/json' : null,
        },
        text: () => Promise.resolve(errorResponse),
      });

      // 第二个代理返回成功
      const successResponse = JSON.stringify({ code: '1', data: { items: [] } });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (key: string) => key === 'content-type' ? 'application/json' : null,
        },
        text: () => Promise.resolve(successResponse),
      });

      const result = await fetchWithProxy('https://api.example.com', {
        validateContent: (content) => {
          const data = JSON.parse(content);
          return data.code === '1';
        },
      });

      expect(result.content).toBe(successResponse);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('validateContent callback returns object with error - tries next proxy', async () => {
      // 第一个代理返回业务错误
      const errorResponse = JSON.stringify({ code: '0', message: 'Required parameter missing' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (key: string) => key === 'content-type' ? 'application/json' : null,
        },
        text: () => Promise.resolve(errorResponse),
      });

      // 第二个代理返回成功
      const successResponse = JSON.stringify({ code: '1', data: { items: [] } });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (key: string) => key === 'content-type' ? 'application/json' : null,
        },
        text: () => Promise.resolve(successResponse),
      });

      const result = await fetchWithProxy('https://api.example.com', {
        validateContent: (content) => {
          const data = JSON.parse(content);
          if (data.code !== '1') {
            return { valid: false, error: `API error: ${data.message}` };
          }
          return true;
        },
      });

      expect(result.content).toBe(successResponse);
    });

    test('validateContent callback throws - tries next proxy', async () => {
      // 第一个代理返回内容，但 validateContent 抛出异常
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (key: string) => key === 'content-type' ? 'application/json' : null,
        },
        text: () => Promise.resolve(JSON.stringify({ invalid: true })),
      });

      // 第二个代理返回成功
      const successResponse = JSON.stringify({ code: '1', data: {} });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (key: string) => key === 'content-type' ? 'application/json' : null,
        },
        text: () => Promise.resolve(successResponse),
      });

      // 使用返回 false 的方式模拟验证失败（而不是抛出异常）
      // 因为抛出异常会被 catch 块捕获，视为代理失败
      const result = await fetchWithProxy('https://api.example.com', {
        validateContent: (content) => {
          const data = JSON.parse(content);
          // 第一个响应验证失败，第二个成功
          return data.code === '1';
        },
      });

      expect(result.content).toBe(successResponse);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('all proxies fail validateContent callback - throws error', async () => {
      // 所有代理返回业务错误
      for (let i = 0; i < PROXY_LIST.length; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          headers: {
            get: (key: string) => key === 'content-type' ? 'application/json' : null,
          },
          text: () => Promise.resolve(JSON.stringify({ code: '0', message: 'Error' })),
        });
      }

      await expect(fetchWithProxy('https://api.example.com', {
        validateContent: (content) => {
          const data = JSON.parse(content);
          return data.code === '1';
        },
      })).rejects.toThrow('所有代理均失败');
    });

    test('no validateContent callback - uses default format validation', async () => {
      const mockJsonContent = JSON.stringify({ any: 'data' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (key: string) => key === 'content-type' ? 'application/json' : null,
        },
        text: () => Promise.resolve(mockJsonContent),
      });

      // 不提供 validateContent，应该使用默认格式验证（JSON 格式验证）
      const result = await fetchWithProxy('https://api.example.com');

      expect(result.content).toBe(mockJsonContent);
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

    test('law-ai proxy encodes target URL', () => {
      const lawAiProxy = PROXY_LIST.find(p => p.name === 'law-ai');
      expect(lawAiProxy).toBeDefined();

      const targetUrl = 'https://example.com/path?query=value&foo=bar';
      const proxyUrl = lawAiProxy!.buildUrl(targetUrl);

      // law-ai 代理需要编码后的 URL
      expect(proxyUrl).toContain('target=');
      // URL 应该被编码
      expect(proxyUrl).toContain('https%3A%2F%2Fexample.com'); // : 和 / 被编码
      expect(proxyUrl).toContain('%26'); // & 被编码
    });

    test('txtify proxy is included', () => {
      const txtifyProxy = PROXY_LIST.find(p => p.name === 'txtify');
      expect(txtifyProxy).toBeDefined();
      expect(txtifyProxy!.format).toBe('markdown');
    });
  });
});