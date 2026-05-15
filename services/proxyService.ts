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

export interface FetchOptions {
  preferFormat?: 'raw' | 'markdown';  // 已弃用：评分系统决定优先级，格式偏好不再影响排序
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

  // 根据评分排序代理
  const orderedProxies = orderProxiesByPreference(PROXY_LIST);

  for (const proxy of orderedProxies) {
    const proxyUrl = proxy.buildUrl(targetUrl);

    // 使用 AbortController 实现超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
    const startTime = Date.now();

    try {
      const response = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        scoreManager.record(proxy.name, false, responseTime);
        throw new Error(`HTTP ${response.status}`);
      }

      const content = await response.text();
      const totalTime = Date.now() - startTime;

      // 基本内容验证
      if (!content || content.length < 100) {
        scoreManager.record(proxy.name, false, totalTime);
        throw new Error('返回内容过短或为空');
      }

      // raw 格式代理需要验证是否返回了有效 HTML
      const isValidHtml = content.includes('<!DOCTYPE') || content.includes('<html') || content.includes('<body');
      if (proxy.format === 'raw' && !isValidHtml) {
        scoreManager.record(proxy.name, false, totalTime);
        throw new Error('返回内容不是有效的 HTML 格式');
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
      const errorMsg = e.name === 'AbortError' ? `超时(${PROXY_TIMEOUT_MS}ms)` : e.message;
      scoreManager.record(proxy.name, false, responseTime);
      errors.push({ proxy: proxy.name, error: new Error(errorMsg) });
    }
  }

  // 所有代理都失败，抛出异常
  const errorMessages = errors.map(e => `${e.proxy}: ${e.error.message}`).join('; ');
  throw new Error(`所有代理均失败: ${errorMessages}`);
}

/**
 * 根据评分排序代理列表（分数高的优先）
 * 导出供测试使用
 */
export function orderProxiesByPreference(
  proxies: ProxyConfig[]
): ProxyConfig[] {
  return [...proxies].sort((a, b) => scoreManager.getScore(b.name) - scoreManager.getScore(a.name));
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