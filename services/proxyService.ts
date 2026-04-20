/**
 * proxyService.ts
 *
 * 统一的代理服务，用于跨域获取外部网页内容。
 * 支持多种代理格式：raw（原样返回）和 markdown（r.jina.ai 转换）
 */

export interface ProxyConfig {
  name: string;
  buildUrl: (targetUrl: string) => string;
  format: 'raw' | 'markdown';
}

/**
 * 代理列表：按优先级排列
 * - r.jina.ai: 将 HTML 转为 Markdown，表格解析更方便
 * - law-ai: 简单代理，原样返回，速度快
 * - allorigins: 备选代理
 * - corsproxy: 备选代理
 */
export const PROXY_LIST: ProxyConfig[] = [
  { name: 'r.jina.ai', buildUrl: (url) => `https://r.jina.ai/${url}`, format: 'markdown' },
  { name: 'law-ai', buildUrl: (url) => `https://law-ai.top:9000/proxy?target=${encodeURIComponent(url)}`, format: 'raw' },
  { name: 'allorigins', buildUrl: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, format: 'raw' },
  { name: 'corsproxy', buildUrl: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`, format: 'raw' },
  { name: 'txtify', buildUrl: (url) => `https://txtify.it/${url}`, format: 'markdown' },
];

export interface FetchOptions {
  preferFormat?: 'raw' | 'markdown';
}

export interface FetchResult {
  content: string;
  format: 'raw' | 'markdown';
  proxyName: string;
}

/**
 * 通过代理获取网页内容
 * @param targetUrl 目标 URL
 * @param options 可选参数，包括格式偏好
 * @returns FetchResult 包含内容、格式和成功的代理名称
 * @throws Error 当所有代理都失败时抛出异常
 */
export async function fetchWithProxy(
  targetUrl: string,
  options?: FetchOptions
): Promise<FetchResult> {
  const errors: { proxy: string; error: Error }[] = [];

  // 根据格式偏好排序代理：偏好格式的代理优先尝试
  const orderedProxies = orderProxiesByPreference(PROXY_LIST, options?.preferFormat);

  for (const proxy of orderedProxies) {
    const proxyUrl = proxy.buildUrl(targetUrl);
    try {
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const content = await response.text();

      // 基本内容验证
      if (!content || content.length < 100) {
        throw new Error('返回内容过短或为空');
      }

      // raw 格式代理需要验证是否返回了有效 HTML
      if (proxy.format === 'raw') {
        if (!content.includes('<!DOCTYPE') && !content.includes('<html') && !content.includes('<body')) {
          throw new Error('返回内容不是有效的 HTML 格式');
        }
      }

      return {
        content,
        format: proxy.format,
        proxyName: proxy.name,
      };
    } catch (e) {
      errors.push({ proxy: proxy.name, error: e as Error });
      console.warn(`[ProxyService] ${proxy.name} 失败:`, e);
    }
  }

  // 所有代理都失败，抛出异常
  const errorMessages = errors.map(e => `${e.proxy}: ${e.error.message}`).join('; ');
  throw new Error(`所有代理均失败: ${errorMessages}`);
}

/**
 * 根据格式偏好排序代理列表
 * 导出供测试使用
 */
export function orderProxiesByPreference(
  proxies: ProxyConfig[],
  preferFormat?: 'raw' | 'markdown'
): ProxyConfig[] {
  if (!preferFormat) {
    return proxies; // 无偏好，使用默认顺序
  }

  // 将匹配格式的代理排在前面，其他代理排在后面
  const matching = proxies.filter(p => p.format === preferFormat);
  const others = proxies.filter(p => p.format !== preferFormat);

  return [...matching, ...others];
}

/**
 * 检查代理服务健康状态
 * 仅用于调试和监控
 */
export async function checkProxyHealth(): Promise<{ name: string; healthy: boolean }[]> {
  const results: { name: string; healthy: boolean }[] = [];

  for (const proxy of PROXY_LIST) {
    try {
      // 使用一个简单的测试 URL
      const testUrl = 'https://httpbin.org/get';
      const proxyUrl = proxy.buildUrl(testUrl);
      const response = await fetch(proxyUrl, { method: 'HEAD' });
      results.push({ name: proxy.name, healthy: response.ok });
    } catch {
      results.push({ name: proxy.name, healthy: false });
    }
  }

  return results;
}