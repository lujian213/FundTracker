/**
 * marketNewsService.ts
 *
 * 市场热点数据管理服务
 * - 管理市场热点的内存缓存（不持久化）
 * - 提供从 API 获取市场热点的功能
 */

import { JobResult } from '../types';
import { FastNewsItem, FastNewsApiResponse } from '../types/fastNewsTypes';
import { fetchWithProxy } from './proxyService';

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
 * 同时触发事件通知 UI 更新
 */
export function setNews(items: NewsItem[]): void {
  newsCache = items;
  // 触发事件通知 NewsContext 更新
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('news-cache-updated'));
  }
}

/**
 * 重置缓存（测试用）
 */
export function resetCache(): void {
  newsCache = [];
}

/**
 * fetch 方式 - 用于获取 JSON 数据
 * 导出以便其他服务复用
 */
export async function fetchJson<T>(url: string, timeout: number = 10000): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      mode: 'cors',
      headers: {
        'Origin': 'https://quote.eastmoney.com',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 获取市场热点新闻（领涨板块或热门个股）
 *
 * 成功获取后会自动更新缓存。
 * 返回 JobResult 结构，包含成功/失败状态和数据
 */
export async function fetchMarketNews(): Promise<JobResult<NewsItem[]>> {
  // 获取领涨板块或热门个股，作为"市场动态"展示
  const ut = 'fa1a66105171779fbdd067425f38a7c2';
  // push2delay.eastmoney.com 可直接访问，使用 fetch
  const url = `https://push2delay.eastmoney.com/api/qt/clist/get?pn=1&pz=10&po=1&np=1&ut=${ut}&fltt=2&invt=2&fid=f3&fs=m:90+t:2&type=90&fields=f12,f14,f2,f3,f4&_=${Date.now()}`;

  try {
    // 使用 fetchJson 直接获取（push2delay 返回普通 JSON）
    const response: any = await fetchJson(url);

    if (response?.data?.diff) {
      const diff = response.data.diff;
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      const newsItems: NewsItem[] = Object.values(diff).map((item: any, idx: number) => {
        const code = item.f12;
        // build candidate links and altUrls
        const alt: { label: string; url: string }[] = [];
        let candidate = 'https://quote.eastmoney.com/';

        if (code && typeof code === 'string') {
          const trimmed = code.trim();
          if (/^\d{6}$/.test(trimmed)) {
            candidate = `https://fund.eastmoney.com/${trimmed}.html`;
            alt.push({ label: '基金页', url: candidate });
            alt.push({ label: '统一行情页', url: `https://quote.eastmoney.com/unify/grid.html?fixed=1&kind=2&type=90&code=${encodeURIComponent(trimmed)}` });
          } else if (/^BK\w+/i.test(trimmed)) {
            candidate = `https://quote.eastmoney.com/unify/grid.html?fixed=1&kind=2&type=90&code=${encodeURIComponent(trimmed)}`;
            alt.push({ label: '统一页', url: candidate });
            alt.push({ label: '板块页', url: `https://quote.eastmoney.com/bk/${trimmed}.html` });
          } else if (/^\d+\.\d+$/.test(trimmed)) {
            const parts = trimmed.split('.');
            const suffix = parts[1];
            if (/^\d{6}$/.test(suffix)) {
              candidate = `https://quote.eastmoney.com/zs${suffix}.html`;
              alt.push({ label: '指数页', url: candidate });
              alt.push({ label: '统一页', url: `https://quote.eastmoney.com/unify/grid.html?fixed=1&kind=2&type=90&code=${encodeURIComponent(trimmed)}` });
            } else {
              candidate = `https://quote.eastmoney.com/unify/grid.html?fixed=1&kind=2&type=90&code=${encodeURIComponent(trimmed)}`;
              alt.push({ label: '统一页', url: candidate });
            }
          } else {
            candidate = `https://quote.eastmoney.com/unify/grid.html?fixed=1&kind=2&type=90&code=${encodeURIComponent(trimmed)}`;
            alt.push({ label: '统一页', url: candidate });
          }
        }

        // fallback search if candidate is default or missing
        const searchFallback = `https://so.eastmoney.com/web/s?keyword=${encodeURIComponent(code || '')}`;
        if (!candidate || candidate === 'https://quote.eastmoney.com/') {
          candidate = searchFallback;
          alt.unshift({ label: '搜索结果', url: candidate });
        }

        // ensure primary search URL is first (per requirement)
        const primary = code ? searchFallback : candidate;
        // prefer primary as the returned url, keep altUrls for picker
        // ensure alt includes primary as first option
        const altUrls = [{ label: '搜索', url: primary }, ...alt.filter(a => a.url !== primary)];

        return {
          id: `news-${item.f12}-${idx}`,
          title: `🔥 热门领涨: ${item.f14} 涨幅 ${item.f3}%`,
          time: timeStr,
          url: primary,
          altUrls
        };
      });

      // 更新缓存
      setNews(newsItems);

      return { success: true, data: newsItems };
    }

    // API 返回空数据
    return { success: false, message: 'API返回空数据' };
  } catch (e) {
    // 所有 API 都失败
    return { success: false, message: (e as Error).message || '未知错误' };
  }
}

/**
 * 获取财经快讯（全球直播分类）
 *
 * @param pageSize 获取数量，默认 20
 * @returns 快讯列表
 */
export async function fetchFastNews(pageSize: number = 20): Promise<FastNewsItem[]> {
  const timestamp = Date.now();
  const url = `https://np-weblist.eastmoney.com/comm/web/getFastNewsList?client=web&biz=web_724&fastColumn=102&pageSize=${pageSize}&sortEnd=0&req_trace=${timestamp}`;

  try {
    // 使用代理服务解决 CORS 问题
    const result = await fetchWithProxy(url, {
      preferFormat: 'raw',  // 需要原始 JSON，不需要 markdown 转换
      timeout: 10000,
      // 业务验证：检查 API 返回的 code 是否为 '1'
      validateContent: (content, format) => {
        try {
          // 对于 markdown 格式，需要先提取 JSON 部分
          let jsonContent: string;
          if (format === 'markdown') {
            const markdownMarker = 'Markdown Content:';
            const markerIndex = content.indexOf(markdownMarker);
            if (markerIndex !== -1) {
              jsonContent = content.substring(markerIndex + markdownMarker.length).trim();
            } else {
              jsonContent = content;
            }
          } else {
            jsonContent = content;
          }

          const data = JSON.parse(jsonContent);
          // 东方财富财经快讯 API 成功标志：code === '1'
          if (data.code !== '1') {
            return { valid: false, error: `API返回错误: ${data.message || '未知错误'}` };
          }
          return true;
        } catch (e) {
          return { valid: false, error: 'JSON解析失败' };
        }
      },
    });

    // 根据代理格式提取 JSON 内容
    let jsonContent: string;
    if (result.format === 'markdown') {
      // r.jina.ai 等 markdown 代理会添加头部，需要提取实际 JSON
      // 格式: "Title: ...\n\nURL Source: ...\n\nMarkdown Content:\n{JSON数据}"
      const markdownMarker = 'Markdown Content:';
      const markerIndex = result.content.indexOf(markdownMarker);
      if (markerIndex !== -1) {
        jsonContent = result.content.substring(markerIndex + markdownMarker.length).trim();
      } else {
        // 找不到标记，尝试直接解析（可能是纯 JSON）
        jsonContent = result.content;
      }
    } else {
      // raw 格式直接使用
      jsonContent = result.content;
    }

    const data: FastNewsApiResponse = JSON.parse(jsonContent);

    if (data.code !== '1' || !data.data?.fastNewsList) {
      console.error('fetchFastNews API returned invalid data', data);
      return [];
    }

    return data.data.fastNewsList.map(item => ({
      code: item.code,
      title: item.title,
      summary: item.summary,
      showTime: item.showTime,
      titleColor: item.titleColor,
      url: `https://finance.eastmoney.com/a/${item.code}.html`,
    }));
  } catch (error) {
    console.error('fetchFastNews error:', error);
    return [];
  }
}

// ============================================
// 快讯缓存（与市场热点缓存分开）
// ============================================

// 财经快讯独立缓存（与市场热点缓存分开）
let fastNewsCache: FastNewsItem[] = [];
let lastImportantNewsCodes: Set<string> = new Set(); // 记录上次的重要快讯code

/**
 * 获取快讯缓存
 */
export function getFastNews(): FastNewsItem[] {
  return fastNewsCache;
}

/**
 * 设置快讯缓存
 * 同时触发事件通知 UI 更新
 */
export function setFastNews(items: FastNewsItem[]): void {
  fastNewsCache = items;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('fast-news-cache-updated'));
  }
}

/**
 * 获取上次重要快讯的code集合
 */
export function getLastImportantNewsCodes(): Set<string> {
  return lastImportantNewsCodes;
}

/**
 * 设置上次重要快讯的code集合
 */
export function setLastImportantNewsCodes(codes: Set<string>): void {
  lastImportantNewsCodes = codes;
}

/**
 * 重置快讯缓存（测试用）
 */
export function resetFastNewsCache(): void {
  fastNewsCache = [];
  lastImportantNewsCodes = new Set();
}