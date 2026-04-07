/**
 * marketNewsService.ts
 *
 * 市场热点数据管理服务
 * - 管理市场热点的内存缓存（不持久化）
 * - 提供从 API 获取市场热点的功能
 */

export interface NewsItem {
  id: string;
  title: string;
  time: string;
  url: string;
  altUrls?: { label: string; url: string }[];
}

// 内存缓存
let newsCache: NewsItem[] = [];

/**
 * 获取缓存的市场热点
 */
export function getNews(): NewsItem[] {
  return newsCache;
}

/**
 * 设置市场热点缓存
 */
export function setNews(items: NewsItem[]): void {
  newsCache = items;
}

/**
 * 重置缓存（测试用）
 */
export function resetCache(): void {
  newsCache = [];
}