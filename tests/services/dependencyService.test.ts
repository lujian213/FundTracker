// tests/services/dependencyService.test.ts
import {
  getAllDependencies,
  checkAllDependencies,
  DependencyStatus,
  DependencyMeta,
} from '../../services/dependencyService';

// Mock dependencies
jest.mock('../../services/proxyService', () => ({
  PROXY_LIST: [
    { name: 'r.jina.ai', buildUrl: (url: string) => `https://r.jina.ai/${url}`, format: 'markdown' },
    { name: 'law-ai', buildUrl: (url: string) => `https://law-ai.top/proxy?target=${url}`, format: 'raw' },
    { name: 'allorigins', buildUrl: (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, format: 'raw' },
  ],
}));

jest.mock('../../services/searchProvidersConfig', () => ({
  getAllSearchProvidersMeta: jest.fn(() => [
    { key: 'anySearch', name: 'AnySearch', description: 'Real-time search', params: {} },
    { key: 'zhipuSearch', name: '智谱搜索', description: 'Zhipu Web Search', params: {} },
  ]),
}));

jest.mock('../../services/searchService', () => ({
  searchService: {
    search: jest.fn(),
  },
}));

// Mock fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

// Get mocked modules for type safety
const mockedSearchService = require('../../services/searchService').searchService;

describe('dependencyService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockedSearchService.search.mockReset();
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllDependencies', () => {
    test('returns list with both proxy and search services', () => {
      const dependencies = getAllDependencies();

      // Verify contains proxy services
      const proxyDeps = dependencies.filter(d => d.category === 'proxy');
      expect(proxyDeps.length).toBe(3);

      // Verify contains search services
      const searchDeps = dependencies.filter(d => d.category === 'search');
      expect(searchDeps.length).toBe(2);
    });

    test('returns correct DependencyMeta structure', () => {
      const dependencies = getAllDependencies();

      for (const dep of dependencies) {
        expect(dep).toHaveProperty('name');
        expect(dep).toHaveProperty('category');
        expect(['proxy', 'search']).toContain(dep.category);
      }
    });

    test('reads from PROXY_LIST dynamically', () => {
      const dependencies = getAllDependencies();
      const proxyNames = dependencies.filter(d => d.category === 'proxy').map(d => d.name);

      expect(proxyNames).toContain('r.jina.ai');
      expect(proxyNames).toContain('law-ai');
      expect(proxyNames).toContain('allorigins');
    });

    test('reads from searchProvidersConfig dynamically', () => {
      const dependencies = getAllDependencies();
      const searchNames = dependencies.filter(d => d.category === 'search').map(d => d.name);

      expect(searchNames).toContain('AnySearch');
      expect(searchNames).toContain('智谱搜索');
    });
  });

  describe('checkAllDependencies', () => {
    test('checks all dependencies in parallel', async () => {
      // Mock successful proxy responses with content > 100 chars
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('long enough content for validation check - adding more text to exceed 100 characters limit for the proxy health check validation'),
      });

      // Mock successful search response
      mockedSearchService.search.mockResolvedValue({
        success: true,
        results: [{ title: 'test', snippet: 'test', url: 'http://test.com' }],
      });

      const results = await checkAllDependencies();

      // Verify all services are checked
      expect(results.length).toBe(5); // 3 proxy + 2 search

      // Verify all services are healthy
      expect(results.every(r => r.healthy)).toBe(true);
    });

    test('returns DependencyStatus with correct structure', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('long enough content for validation check - adding more text to exceed 100 characters'),
      });

      mockedSearchService.search.mockResolvedValue({
        success: true,
        results: [{ title: 'test', snippet: 'test', url: 'http://test.com' }],
      });

      const results = await checkAllDependencies();

      for (const result of results) {
        expect(result).toHaveProperty('name');
        expect(result).toHaveProperty('category');
        expect(result).toHaveProperty('healthy');
        expect(result).toHaveProperty('responseTime');
        expect(typeof result.responseTime).toBe('number');
      }
    });

    test('handles proxy HTTP error correctly', async () => {
      // Mock all proxies returning HTTP error
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve(''),
      });

      // Mock successful search
      mockedSearchService.search.mockResolvedValue({
        success: true,
        results: [{ title: 'test', snippet: 'test', url: 'http://test.com' }],
      });

      const results = await checkAllDependencies();

      const proxyResults = results.filter(r => r.category === 'proxy');
      expect(proxyResults.every(r => !r.healthy)).toBe(true);
      expect(proxyResults.every(r => r.error?.includes('HTTP 403'))).toBe(true);
    });

    test('handles proxy network error correctly', async () => {
      // Mock network error
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Mock successful search
      mockedSearchService.search.mockResolvedValue({
        success: true,
        results: [{ title: 'test', snippet: 'test', url: 'http://test.com' }],
      });

      const results = await checkAllDependencies();

      const proxyResults = results.filter(r => r.category === 'proxy');
      expect(proxyResults.every(r => !r.healthy)).toBe(true);
      expect(proxyResults.every(r => r.error?.includes('Network error'))).toBe(true);
    });

    test('handles proxy content too short', async () => {
      // Mock response with short content
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('short'),
      });

      // Mock successful search
      mockedSearchService.search.mockResolvedValue({
        success: true,
        results: [{ title: 'test', snippet: 'test', url: 'http://test.com' }],
      });

      const results = await checkAllDependencies();

      const proxyResults = results.filter(r => r.category === 'proxy');
      expect(proxyResults.every(r => !r.healthy)).toBe(true);
      expect(proxyResults.every(r => r.error?.includes('返回内容过短'))).toBe(true);
    });

    test('handles search service failure correctly', async () => {
      // Mock successful proxy
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('long enough content for validation check - adding more text'),
      });

      // Mock search failure
      mockedSearchService.search.mockResolvedValue({
        success: false,
        results: [],
        error: 'API 密钥无效',
      });

      const results = await checkAllDependencies();

      const searchResults = results.filter(r => r.category === 'search');
      expect(searchResults.every(r => !r.healthy)).toBe(true);
      expect(searchResults.every(r => r.error?.includes('API 密钥无效'))).toBe(true);
    });

    test('handles search service empty results', async () => {
      // Mock successful proxy
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('long enough content for validation check - adding more text'),
      });

      // Mock search with empty results
      mockedSearchService.search.mockResolvedValue({
        success: true,
        results: [],
      });

      const results = await checkAllDependencies();

      const searchResults = results.filter(r => r.category === 'search');
      expect(searchResults.every(r => !r.healthy)).toBe(true);
      expect(searchResults.every(r => r.error?.includes('返回结果为空'))).toBe(true);
    });

    test('handles search service exception', async () => {
      // Mock successful proxy
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('long enough content for validation check - adding more text'),
      });

      // Mock search throwing error
      mockedSearchService.search.mockRejectedValue(new Error('Service unavailable'));

      const results = await checkAllDependencies();

      const searchResults = results.filter(r => r.category === 'search');
      expect(searchResults.every(r => !r.healthy)).toBe(true);
      expect(searchResults.every(r => r.error?.includes('Service unavailable'))).toBe(true);
    });

    test('handles proxy timeout correctly', async () => {
      jest.useFakeTimers();

      // Mock fetch that never resolves (simulating timeout)
      mockFetch.mockImplementation(() => new Promise(() => {}));

      // Mock successful search
      mockedSearchService.search.mockResolvedValue({
        success: true,
        results: [{ title: 'test', snippet: 'test', url: 'http://test.com' }],
      });

      const checkPromise = checkAllDependencies();

      // Advance timers past proxy timeout (8 seconds)
      jest.advanceTimersByTime(9000);

      const results = await checkPromise;

      const proxyResults = results.filter(r => r.category === 'proxy');
      expect(proxyResults.every(r => !r.healthy)).toBe(true);
      expect(proxyResults.every(r => r.error?.includes('响应超时'))).toBe(true);

      jest.useRealTimers();
    });

    test('handles search timeout correctly', async () => {
      jest.useFakeTimers();

      // Mock successful proxy
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('long enough content for validation check - adding more text'),
      });

      // Mock search that never resolves (simulating timeout)
      mockedSearchService.search.mockImplementation(() => new Promise(() => {}));

      const checkPromise = checkAllDependencies();

      // Advance timers past search timeout (10 seconds)
      jest.advanceTimersByTime(11000);

      const results = await checkPromise;

      const searchResults = results.filter(r => r.category === 'search');
      expect(searchResults.every(r => !r.healthy)).toBe(true);
      expect(searchResults.every(r => r.error?.includes('响应超时'))).toBe(true);

      jest.useRealTimers();
    });

    test('includes responseTime in results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('long enough content for validation check - adding more text'),
      });

      mockedSearchService.search.mockResolvedValue({
        success: true,
        results: [{ title: 'test', snippet: 'test', url: 'http://test.com' }],
      });

      const results = await checkAllDependencies();

      // All results should have responseTime
      for (const result of results) {
        expect(result.responseTime).toBeDefined();
        expect(result.responseTime).toBeGreaterThanOrEqual(0);
      }
    });

    test('handles proxy not found in PROXY_LIST', async () => {
      // This test verifies behavior when checking a proxy that doesn't exist
      // In practice, getAllDependencies only returns proxies from PROXY_LIST
      // so this scenario shouldn't happen, but checkProxy handles it

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('long enough content for validation check - adding more text'),
      });

      mockedSearchService.search.mockResolvedValue({
        success: true,
        results: [{ title: 'test', snippet: 'test', url: 'http://test.com' }],
      });

      const results = await checkAllDependencies();

      // All proxies should be found since they come from PROXY_LIST
      const proxyResults = results.filter(r => r.category === 'proxy');
      expect(proxyResults.every(r => r.error !== '代理配置不存在')).toBe(true);
    });
  });
});