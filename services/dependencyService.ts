/**
 * services/dependencyService.ts
 *
 * 依赖服务检测服务 - 检查系统依赖的外部服务状态
 */

import { PROXY_LIST } from './proxyService';
import { getAllSearchProvidersMeta } from './searchProvidersConfig';
import { searchService } from './searchService';

// 超时配置
const PROXY_TIMEOUT_MS = 12000;   // 代理服务超时 12 秒
const SEARCH_TIMEOUT_MS = 15000; // 搜索服务超时 15 秒

// 测试 URL - 使用项目中实际使用的网站（所有代理共用）
const PROXY_TEST_URL = 'https://fund.eastmoney.com/';

// 搜索服务测试查询
const SEARCH_TEST_QUERY = '今日财经新闻';

/**
 * 依赖服务状态
 */
export interface DependencyStatus {
  name: string;                    // 服务名称
  category: 'proxy' | 'search';    // 服务类型
  healthy: boolean;                // 是否正常
  error?: string;                  // 错误信息（异常时有）
  responseTime?: number;          // 响应时间（ms）
}

/**
 * 依赖服务元信息（用于界面渲染）
 */
export interface DependencyMeta {
  name: string;
  category: 'proxy' | 'search';
}

/**
 * 超时控制包装函数
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`响应超时(${timeoutMs}ms)`)), timeoutMs)
    ),
  ]);
}

/**
 * 检测单个代理服务
 */
async function checkProxy(proxyName: string): Promise<DependencyStatus> {
  const proxy = PROXY_LIST.find(p => p.name === proxyName);
  if (!proxy) {
    return {
      name: proxyName,
      category: 'proxy',
      healthy: false,
      error: `代理配置不存在`,
    };
  }

  const testUrl = PROXY_TEST_URL;
  const proxyUrl = proxy.buildUrl(testUrl);
  const startTime = Date.now();

  try {
    const response = await withTimeout(
      fetch(proxyUrl, { method: 'GET' }),  // 使用 GET 请求，确保兼容性
      PROXY_TIMEOUT_MS
    );
    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      return {
        name: proxyName,
        category: 'proxy',
        healthy: false,
        error: `HTTP ${response.status}`,
        responseTime,
      };
    }

    // 验证响应内容
    const content = await response.text();
    if (content.length < 100) {
      return {
        name: proxyName,
        category: 'proxy',
        healthy: false,
        error: '返回内容过短',
        responseTime,
      };
    }

    return {
      name: proxyName,
      category: 'proxy',
      healthy: true,
      responseTime,
    };
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    return {
      name: proxyName,
      category: 'proxy',
      healthy: false,
      error: error.message || '请求失败',
      responseTime,
    };
  }
}

/**
 * 检测单个搜索服务
 */
async function checkSearchProvider(providerKey: string, providerName: string): Promise<DependencyStatus> {
  const startTime = Date.now();

  try {
    const response = await withTimeout(
      searchService.search({ query: SEARCH_TEST_QUERY, maxResults: 1 }),
      SEARCH_TIMEOUT_MS
    );
    const responseTime = Date.now() - startTime;

    if (!response.success) {
      return {
        name: providerName,
        category: 'search',
        healthy: false,
        error: response.error || '搜索失败',
        responseTime,
      };
    }

    if (response.results.length === 0) {
      return {
        name: providerName,
        category: 'search',
        healthy: false,
        error: '返回结果为空',
        responseTime,
      };
    }

    return {
      name: providerName,
      category: 'search',
      healthy: true,
      responseTime,
    };
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    return {
      name: providerName,
      category: 'search',
      healthy: false,
      error: error.message || '请求失败',
      responseTime,
    };
  }
}

/**
 * 获取所有依赖服务列表（用于界面渲染）
 * 动态读取 PROXY_LIST 和 searchProvidersConfig
 */
export function getAllDependencies(): DependencyMeta[] {
  const dependencies: DependencyMeta[] = [];

  // 从 PROXY_LIST 获取代理服务
  for (const proxy of PROXY_LIST) {
    dependencies.push({
      name: proxy.name,
      category: 'proxy',
    });
  }

  // 从 searchProvidersConfig 获取搜索服务
  const searchProviders = getAllSearchProvidersMeta();
  for (const provider of searchProviders) {
    dependencies.push({
      name: provider.name,
      category: 'search',
    });
  }

  return dependencies;
}

/**
 * 检测所有依赖服务（并行执行）
 */
export async function checkAllDependencies(): Promise<DependencyStatus[]> {
  // 并行检测所有代理服务
  const proxyChecks = PROXY_LIST.map(proxy => checkProxy(proxy.name));

  // 并行检测所有搜索服务
  const searchProviders = getAllSearchProvidersMeta();
  const searchChecks = searchProviders.map(provider =>
    checkSearchProvider(provider.key, provider.name)
  );

  // 使用 Promise.all 并行执行所有检测
  const allResults = await Promise.all([...proxyChecks, ...searchChecks]);

  return allResults;
}