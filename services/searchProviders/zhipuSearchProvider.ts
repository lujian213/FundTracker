/**
 * services/searchProviders/zhipuSearchProvider.ts
 *
 * 智谱 Web Search API Provider 实现
 * 支持多种搜索引擎：search_std、search_pro、search_pro_sogou、search_pro_quark
 */

import { SearchProvider, SearchResult } from '../../types/searchTypes';

/**
 * 搜索引擎类型
 */
type SearchEngine = 'search_std' | 'search_pro' | 'search_pro_sogou' | 'search_pro_quark';

/**
 * 时间过滤类型
 */
type SearchRecencyFilter = 'oneDay' | 'oneWeek' | 'oneMonth' | 'oneYear' | 'noLimit';

/**
 * 内容长度类型
 */
type ContentSize = 'medium' | 'high';

/**
 * 智谱搜索请求参数
 */
interface ZhipuSearchRequest {
  search_query: string;
  search_engine: SearchEngine;
  search_intent: boolean;
  count?: number;
  search_domain_filter?: string;
  search_recency_filter?: SearchRecencyFilter;
  content_size?: ContentSize;
  request_id?: string;
  user_id?: string;
}

/**
 * 智谱搜索结果项
 */
interface ZhipuSearchResultItem {
  title: string;
  link: string;  // URL 字段名为 link
  content?: string;  // 摘要字段名为 content
  icon?: string;
  media?: string;
  publish_date?: string;
  refer?: string;
}

/**
 * 智谱搜索响应
 */
interface ZhipuSearchResponse {
  created?: number;
  id?: string;
  request_id?: string;
  search_intent?: any[];
  search_result?: ZhipuSearchResultItem[];  // 主要结果字段
  data?: {
    search_result?: ZhipuSearchResultItem[];
    search_results?: ZhipuSearchResultItem[];
    web_pages?: ZhipuSearchResultItem[];
  };
  // 兼容其他可能的格式
  search_results?: ZhipuSearchResultItem[];
  web_pages?: ZhipuSearchResultItem[];
}

/**
 * 智谱搜索 Provider
 * 使用智谱 Web Search API 进行搜索（直连）
 */
export class ZhipuSearchProvider implements SearchProvider {
  key = 'zhipuSearch';

  async search(
    query: string,
    params: Record<string, string | number | boolean>,
    maxResults: number
  ): Promise<SearchResult[]> {
    const apiKey = params.apiKey as string;

    if (!apiKey) {
      throw new Error('智谱 API 密钥未配置');
    }

    const searchEngine = (params.searchEngine as SearchEngine) || 'search_std';
    const count = this.getValidCount(params.count as number, searchEngine, maxResults);

    const requestBody: ZhipuSearchRequest = {
      search_query: query,
      search_engine: searchEngine,
      search_intent: (params.searchIntent as boolean) ?? false,
      count,
    };

    if (params.searchDomainFilter) {
      requestBody.search_domain_filter = params.searchDomainFilter as string;
    }
    if (params.searchRecencyFilter) {
      requestBody.search_recency_filter = params.searchRecencyFilter as SearchRecencyFilter;
    }
    if (params.contentSize) {
      requestBody.content_size = params.contentSize as ContentSize;
    }

    requestBody.request_id = `zhipu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const apiUrl = 'https://open.bigmodel.cn/api/paas/v4/web_search';
    const timeout = 15000; // 15秒超时

    // 使用 AbortController 实现超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`智谱搜索请求失败: HTTP ${response.status} - ${errorText}`);
      }

      const data: ZhipuSearchResponse = await response.json();
      const results = this.extractResults(data);

      if (!results || !Array.isArray(results)) {
        return [];
      }

      return results.map((item: ZhipuSearchResultItem) => ({
        title: item.title || '',
        url: item.link || '',
        snippet: item.content || '',
      }));
    } catch (e: any) {
      clearTimeout(timeoutId);
      const errorMsg = e.name === 'AbortError' ? `智谱搜索超时(${timeout}ms)` : e.message;
      throw new Error(errorMsg);
    }
  }

  /**
   * 根据搜索引擎类型获取有效的结果数量
   */
  private getValidCount(
    requestedCount: number | undefined,
    searchEngine: SearchEngine,
    maxResults: number
  ): number {
    // 搜索狗引擎只支持特定的数量值
    if (searchEngine === 'search_pro_sogou') {
      const validCounts = [10, 20, 30, 40, 50];
      const desired = requestedCount || maxResults;
      // 找到最接近且不小于期望值的有效数量
      const validCount = validCounts.find(c => c >= desired) || validCounts[validCounts.length - 1];
      return Math.min(validCount, 50);
    }

    // 其他引擎支持 1-50
    const count = requestedCount || maxResults;
    return Math.min(Math.max(count, 1), 50);
  }

  /**
   * 从响应中提取搜索结果（兼容多种响应格式）
   */
  private extractResults(data: ZhipuSearchResponse): ZhipuSearchResultItem[] | undefined {
    return data.search_result ?? data.data?.search_result ?? data.data?.search_results
      ?? data.data?.web_pages ?? data.search_results ?? data.web_pages;
  }
}