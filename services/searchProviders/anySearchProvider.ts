/**
 * services/searchProviders/anySearchProvider.ts
 *
 * AnySearch 搜索 Provider 实现
 */

import { SearchProvider, SearchResult } from '../../types/searchTypes';
import { fetchWithProxy } from '../proxyService';

/**
 * AnySearch Provider
 * 使用 proxyService 自动代理轮换和评分系统
 */
export class AnySearchProvider implements SearchProvider {
  key = 'anySearch';

  async search(
    query: string,
    params: Record<string, string | number | boolean>,
    maxResults: number
  ): Promise<SearchResult[]> {
    const apiKey = params.apiKey as string;

    if (!apiKey) {
      throw new Error('API 密钥未配置');
    }

    const domains = (params.domains as string || 'finance')
      .split(',')
      .map(d => d.trim())
      .filter(Boolean);

    const actualMaxResults = Math.min(
      (params.maxResults as number) || maxResults,
      maxResults
    );

    const requestBody = {
      query,
      domains,
      max_results: actualMaxResults,
    };

    const apiUrl = 'https://api.anysearch.com/v1/search';

    // 使用 proxyService 发送请求（自动代理轮换和评分）
    const { content } = await fetchWithProxy(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data = JSON.parse(content);

    // AnySearch 返回格式: {"code":0,"message":"success","data":{"results":[...]}}
    const results = data.data?.results || data.results;

    if (!results || !Array.isArray(results)) {
      return [];
    }

    return results.map((item: any) => ({
      title: item.title || '',
      url: item.url || '',
      snippet: item.snippet || item.content || item.description || '',
    }));
  }
}