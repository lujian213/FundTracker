// tests/services/proxyService.test.ts
import { fetchWithProxy, orderProxiesByPreference, PROXY_LIST } from '../../services/proxyService';

// Mock fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe('proxyService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('orderProxiesByPreference', () => {
    test('returns original order when no preference', () => {
      const result = orderProxiesByPreference(PROXY_LIST);
      expect(result).toEqual(PROXY_LIST);
    });

    test('puts markdown proxies first when preferFormat is markdown', () => {
      const result = orderProxiesByPreference(PROXY_LIST, 'markdown');

      // 所有 markdown 格式的代理应该在前面
      const markdownProxies = result.filter(p => p.format === 'markdown');
      const rawProxies = result.filter(p => p.format === 'raw');

      // markdown 代理应该排在前面
      expect(result.indexOf(markdownProxies[0])).toBeLessThan(result.indexOf(rawProxies[0]));
    });

    test('puts raw proxies first when preferFormat is raw', () => {
      const result = orderProxiesByPreference(PROXY_LIST, 'raw');

      // 所有 raw 格式的代理应该在前面
      const rawProxies = result.filter(p => p.format === 'raw');
      const markdownProxies = result.filter(p => p.format === 'markdown');

      // raw 代理应该排在前面
      expect(result.indexOf(rawProxies[0])).toBeLessThan(result.indexOf(markdownProxies[0]));
    });

    test('preserves relative order within same format group', () => {
      const result = orderProxiesByPreference(PROXY_LIST, 'markdown');

      // markdown 代理的相对顺序应该保持
      const markdownProxies = result.filter(p => p.format === 'markdown');
      const originalMarkdownProxies = PROXY_LIST.filter(p => p.format === 'markdown');

      expect(markdownProxies).toEqual(originalMarkdownProxies);
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

    test('successfully fetches content from first markdown proxy', async () => {
      // r.jina.ai 返回 markdown 格式，不需要 HTML 验证
      // 内容长度必须 > 100
      const mockMarkdownContent = `# Title

| Header | Value |
| --- | --- |
| A | B |

More content here to pass length check. This content should be longer than 100 characters to pass the validation in proxyService. Adding more text to ensure sufficient length.`;
      mockFetch.mockResolvedValueOnce(createMockResponse(mockMarkdownContent));

      const result = await fetchWithProxy('https://example.com');

      expect(result.content).toBe(mockMarkdownContent);
      expect(result.format).toBe('markdown'); // r.jina.ai is first, returns markdown
      expect(result.proxyName).toBe('r.jina.ai');
    });

    test('tries next proxy when first fails with network error', async () => {
      // 第一个代理失败
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // 第二个代理是 law-ai (raw 格式)，需要返回有效 HTML
      // 内容长度必须 > 100
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
      expect(result.format).toBe('raw');
      expect(result.proxyName).toBe('law-ai');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('throws error when all proxies fail', async () => {
      // 所有代理都失败 - 需要为每个代理设置 mock
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
      // markdown 代理失败
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // raw 代理返回非 HTML 内容（没有 <!DOCTYPE, <html, <body）
      mockFetch.mockResolvedValueOnce(createMockResponse('Not HTML content without proper tags'));

      // 其他代理也失败
      for (let i = 2; i < PROXY_LIST.length; i++) {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));
      }

      await expect(fetchWithProxy('https://example.com')).rejects.toThrow('所有代理均失败');
    });

    test('validates HTML content for raw format proxies', async () => {
      // markdown 代理失败
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

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
      expect(result.format).toBe('raw');
    });

    test('uses format preference to order proxies', async () => {
      // 当指定 preferFormat: 'raw' 时，raw 代理优先
      // 第一个被调用的是 law-ai（raw 格式）
      const mockHtml = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>Test content with enough length to pass validation check.</body>
</html>`;
      mockFetch.mockResolvedValueOnce(createMockResponse(mockHtml));

      const result = await fetchWithProxy('https://example.com', { preferFormat: 'raw' });

      expect(result.format).toBe('raw');
      expect(result.proxyName).toBe('law-ai');
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

    test('r.jina.ai is first in default order', () => {
      expect(PROXY_LIST[0].name).toBe('r.jina.ai');
      expect(PROXY_LIST[0].format).toBe('markdown');
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
  });
});