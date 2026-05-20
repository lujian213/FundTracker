/**
 * proxyService.ts
 *
 * 统一的代理服务，用于跨域获取外部网页内容。
 * 支持多种代理格式：raw（原样返回）和 markdown（r.jina.ai 转换）
 * 内置评分机制，根据成功率和响应时间动态调整代理优先级
 */

const PROXY_TIMEOUT_MS = 8000;  // 单个代理超时8秒
const SCORE_WINDOW_MS = 5 * 60 * 1000;  // 评分窗口：5分钟
const DEFAULT_SCORE = 0.5;  // 默认分数（中等，避免冷启动问题）

export interface ProxyConfig {
  name: string;
  buildUrl: (targetUrl: string) => string;
  format: 'raw' | 'markdown';
}

/**
 * 代理评分记录
 */
interface ProxyScoreRecord {
  timestamp: number;      // 记录时间戳
  success: boolean;       // 是否成功
  responseTime: number;   // 响应时间（毫秒）
}

/**
 * 代理评分统计
 */
interface ProxyScoreStats {
  records: ProxyScoreRecord[];  // 最近记录
  successRate: number;          // 成功率 (0-1)
  avgResponseTime: number;      // 平均响应时间 (ms)
  score: number;                // 综合分数 (0-1)
}

/**
 * 代理评分管理器
 */
class ProxyScoreManager {
  private scores: Map<string, ProxyScoreStats> = new Map();

  /**
   * 记录一次请求结果
   */
  record(proxyName: string, success: boolean, responseTime: number): void {
    const now = Date.now();
    let stats = this.scores.get(proxyName);

    if (!stats) {
      stats = { records: [], successRate: DEFAULT_SCORE, avgResponseTime: 3000, score: DEFAULT_SCORE };
      this.scores.set(proxyName, stats);
    }

    // 添加新记录
    stats.records.push({ timestamp: now, success, responseTime });

    // 清理过期记录（超过评分窗口）
    stats.records = stats.records.filter(r => now - r.timestamp < SCORE_WINDOW_MS);

    // 重新计算统计数据
    this.recalculateStats(stats);
  }

  /**
   * 获取代理的综合分数
   */
  getScore(proxyName: string): number {
    const stats = this.scores.get(proxyName);
    return stats ? stats.score : DEFAULT_SCORE;
  }

  /**
   * 获取代理的详细统计信息
   */
  getStats(proxyName: string): ProxyScoreStats | undefined {
    return this.scores.get(proxyName);
  }

  /**
   * 获取所有代理的评分摘要（用于调试）
   */
  getAllScoresSummary(): { name: string; score: number; successRate: number; avgTime: number; requests: number }[] {
    const result: { name: string; score: number; successRate: number; avgTime: number; requests: number }[] = [];

    for (const [name, stats] of this.scores) {
      result.push({
        name,
        score: stats.score,
        successRate: stats.successRate,
        avgTime: stats.avgResponseTime,
        requests: stats.records.length
      });
    }

    // 为没有记录的代理添加默认值
    for (const proxy of PROXY_LIST) {
      if (!this.scores.has(proxy.name)) {
        result.push({
          name: proxy.name,
          score: DEFAULT_SCORE,
          successRate: DEFAULT_SCORE,
          avgTime: 3000,
          requests: 0
        });
      }
    }

    return result.sort((a, b) => b.score - a.score);
  }

  /**
   * 重新计算统计数据
   */
  private recalculateStats(stats: ProxyScoreStats): void {
    const records = stats.records;

    if (records.length === 0) {
      stats.successRate = DEFAULT_SCORE;
      stats.avgResponseTime = 3000;
      stats.score = DEFAULT_SCORE;
      return;
    }

    // 计算成功率和平均响应时间
    const successfulRecords = records.filter(r => r.success);
    const successCount = successfulRecords.length;
    stats.successRate = successCount / records.length;

    if (successfulRecords.length > 0) {
      stats.avgResponseTime = successfulRecords.reduce((sum, r) => sum + r.responseTime, 0) / successfulRecords.length;
    } else {
      stats.avgResponseTime = PROXY_TIMEOUT_MS;
    }

    // 综合分数公式：成功率(70%) + 响应速度(30%)
    const speedScore = Math.max(0, 1 - stats.avgResponseTime / PROXY_TIMEOUT_MS);
    stats.score = stats.successRate * 0.7 + speedScore * 0.3;

    // 小样本时混合默认分数，避免过度惩罚
    if (records.length < 3) {
      stats.score = stats.score * 0.6 + DEFAULT_SCORE * 0.4;
    }
  }

  /**
   * 重置所有评分记录（用于测试）
   */
  reset(): void {
    this.scores.clear();
  }
}

// 全局评分管理器实例
const scoreManager = new ProxyScoreManager();

/**
 * 代理列表：按优先级排列
 * - r.jina.ai: 将 HTML 转为 Markdown，表格解析更方便
 * - law-ai: 简单代理，原样返回，速度快
 * - allorigins: 备选代理
 * - corsproxy: 备选代理
 */
export const PROXY_LIST: ProxyConfig[] = [
  { name: 'r.jina.ai', buildUrl: (url) => `https://r.jina.ai/${url}`, format: 'markdown' },
  { name: 'law-ai', buildUrl: (url) => `https://law-ai.top:9000/proxy?target=${url}`, format: 'raw' },
  { name: 'allorigins', buildUrl: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, format: 'raw' },
  { name: 'corsproxy', buildUrl: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`, format: 'raw' },
  { name: 'txtify', buildUrl: (url) => `https://txtify.it/${url}`, format: 'markdown' },
];

export interface FetchWithProxyOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;          // POST/PUT 的请求体（JSON 字符串）
  timeout?: number;       // 超时时间（毫秒），默认 8000
  preferFormat?: 'raw' | 'markdown';  // 代理选择倾向，默认按评分排序
}

export interface FetchResult {
  content: string;
  format: 'raw' | 'markdown';
  proxyName: string;
}

/**
 * 基于 response content-type 验证内容
 * @param content 响应内容
 * @param contentType HTTP content-type header 值
 * @param proxyFormat 代理格式（raw 时才验证 HTML）
 * @returns 验证是否通过
 */
function validateContentByContentType(
  content: string,
  contentType: string | null,
  proxyFormat: 'raw' | 'markdown'
): { valid: boolean; error?: string } {
  // 基本检查：非空
  if (!content) {
    return { valid: false, error: '返回内容为空' };
  }

  const contentTypeLower = contentType?.toLowerCase() || '';

  // JSON 验证：尝试解析（不要求最小长度）
  if (contentTypeLower.includes('application/json')) {
    try {
      JSON.parse(content);
      return { valid: true };
    } catch {
      return { valid: false, error: '返回内容不是有效的 JSON 格式' };
    }
  }

  // 非 JSON 响应需要最小长度检查
  if (content.length < 100) {
    return { valid: false, error: '返回内容过短' };
  }

  // HTML 验证：仅 raw 格式代理需要检查
  if (contentTypeLower.includes('text/html') && proxyFormat === 'raw') {
    const isValidHtml = content.includes('<!DOCTYPE') || content.includes('<html') || content.includes('<body');
    if (!isValidHtml) {
      return { valid: false, error: '返回内容不是有效的 HTML 格式' };
    }
  }

  return { valid: true };
}

/**
 * 通过代理发送请求
 * @param targetUrl 目标 URL
 * @param options 可选参数，包括 HTTP 方法、headers、body、格式偏好
 * @returns FetchResult 包含内容、格式和成功的代理名称
 * @throws Error 当所有代理都失败时抛出异常
 */
export async function fetchWithProxy(
  targetUrl: string,
  options?: FetchWithProxyOptions
): Promise<FetchResult> {
  const method = options?.method || 'GET';
  const customHeaders = options?.headers;
  const body = options?.body;
  const timeout = options?.timeout || PROXY_TIMEOUT_MS;
  const preferFormat = options?.preferFormat;

  const errors: { proxy: string; error: Error }[] = [];

  // 根据评分和 preferFormat 排序代理
  const orderedProxies = orderProxiesByPreference(PROXY_LIST, preferFormat);

  for (const proxy of orderedProxies) {
    const proxyUrl = proxy.buildUrl(targetUrl);

    // 使用 AbortController 实现超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const startTime = Date.now();

    try {
      // 构建 fetch options
      const fetchOptions: RequestInit = {
        method,
        signal: controller.signal,
      };

      // 添加 headers（如果有）
      if (customHeaders) {
        fetchOptions.headers = customHeaders;
      }

      // 添加 body（如果有）
      if (body) {
        fetchOptions.body = body;
      }

      const response = await fetch(proxyUrl, fetchOptions);
      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        scoreManager.record(proxy.name, false, responseTime);
        throw new Error(`HTTP ${response.status}`);
      }

      const content = await response.text();
      const totalTime = Date.now() - startTime;

      // 基于 content-type 验证内容
      const contentType = response.headers.get('content-type');
      const validation = validateContentByContentType(content, contentType, proxy.format);

      if (!validation.valid) {
        scoreManager.record(proxy.name, false, totalTime);
        throw new Error(validation.error || '内容验证失败');
      }

      scoreManager.record(proxy.name, true, totalTime);
      return {
        content,
        format: proxy.format,
        proxyName: proxy.name,
      };
    } catch (e: any) {
      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;
      const errorMsg = e.name === 'AbortError' ? `超时(${timeout}ms)` : e.message;
      scoreManager.record(proxy.name, false, responseTime);
      errors.push({ proxy: proxy.name, error: new Error(errorMsg) });
    }
  }

  // 所有代理都失败，抛出异常
  const errorMessages = errors.map(e => `${e.proxy}: ${e.error.message}`).join('; ');
  throw new Error(`所有代理均失败: ${errorMessages}`);
}

/**
 * 根据评分和 preferFormat 排序代理列表
 * - 指定 preferFormat 时：匹配格式的代理优先（组内按评分），其他次之（组内按评分）
 * - 不指定 preferFormat 时：全部按评分排序
 * 导出供测试使用
 */
export function orderProxiesByPreference(
  proxies: ProxyConfig[],
  preferFormat?: 'raw' | 'markdown'
): ProxyConfig[] {
  // 先按评分排序
  const sortedByScore = [...proxies].sort(
    (a, b) => scoreManager.getScore(b.name) - scoreManager.getScore(a.name)
  );

  // 指定 preferFormat 时：匹配格式优先，其他次之（组内保持评分排序）
  if (preferFormat !== undefined) {
    const matchingProxies = sortedByScore.filter(p => p.format === preferFormat);
    const otherProxies = sortedByScore.filter(p => p.format !== preferFormat);
    return [...matchingProxies, ...otherProxies];
  }

  return sortedByScore;
}

/**
 * 获取所有代理的评分摘要（用于调试和监控）
 */
export function getProxyScoresSummary(): { name: string; score: number; successRate: number; avgTime: number; requests: number }[] {
  return scoreManager.getAllScoresSummary();
}

/**
 * 重置所有评分记录（用于测试）
 */
export function resetProxyScores(): void {
  scoreManager.reset();
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

/**
 * @DEBUG 测试代理是否支持 POST API 请求
 * 用于验证 CORS preflight 是否通过
 */
export async function testProxyPostApi(proxyName: string): Promise<{ success: boolean; error?: string; data?: any }> {
  const proxy = PROXY_LIST.find(p => p.name === proxyName);
  if (!proxy) {
    return { success: false, error: `代理 ${proxyName} 不存在` };
  }

  // 使用 httpbin.org 测试 POST
  const testUrl = 'https://httpbin.org/post';
  const proxyUrl = proxy.buildUrl(testUrl);
  const testBody = { test: 'hello', timestamp: Date.now() };

  console.log(`[ProxyTest] 测试 ${proxyName} POST: ${proxyUrl}`);

  try {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testBody),
    });

    console.log(`[ProxyTest] ${proxyName} 响应状态: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    console.log(`[ProxyTest] ${proxyName} 成功! 响应数据:`, JSON.stringify(data).substring(0, 200));
    return { success: true, data };
  } catch (error: any) {
    console.log(`[ProxyTest] ${proxyName} 失败: ${error.message}`);
    return { success: false, error: error.message };
  }
}