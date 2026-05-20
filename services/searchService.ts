/**
 * services/searchService.ts
 *
 * 搜索服务 - 为 AI 辅助功能提供联网查询能力
 * 通用协调器，不包含具体 provider 逻辑
 */

import { SearchRequest, SearchResponse, SearchResult, SearchProviderMeta } from '../types/searchTypes';
import { searchProvidersConfig, getSearchProviderDefaultParams } from './searchProvidersConfig';
import { getSearchProvidersConfig } from './systemConfigService';
import { searchProviders, getProviderByKey } from './searchProviders';

/**
 * 搜索服务类
 * 通用协调器，负责：
 * 1. 确定启用的 provider 及优先级
 * 2. 获取参数配置
 * 3. 按优先级调用 provider 直到成功
 */
class SearchService {
  /**
   * 执行搜索（按优先级依次尝试 provider）
   */
  async search(request: SearchRequest): Promise<SearchResponse> {
    const activeProviders = this.getActiveProviders();

    if (activeProviders.length === 0) {
      return {
        success: false,
        results: [],
        error: '没有可用的搜索服务 Provider',
      };
    }

    const maxResults = request.maxResults ?? 10;
    const errors: string[] = [];

    // 按优先级依次尝试
    for (const providerMeta of activeProviders) {
      try {
        const provider = getProviderByKey(providerMeta.key);
        if (!provider) {
          console.warn(`Provider ${providerMeta.key} 未注册实现`);
          continue;
        }

        const params = this.getProviderParams(providerMeta.key);
        const results = await provider.search(request.query, params, maxResults);

        if (results.length > 0) {
          return {
            success: true,
            results,
          };
        }
      } catch (error: any) {
        errors.push(`${providerMeta.name}: ${error.message}`);
        console.warn(`搜索服务 ${providerMeta.name} 失败:`, error.message);
      }
    }

    // 所有 provider 都失败
    return {
      success: false,
      results: [],
      error: errors.length > 0 ? `所有搜索服务都失败: ${errors.join('; ')}` : '无搜索结果',
    };
  }

  /**
   * 获取当前可用的 Provider 列表（按优先级排序，仅返回启用的）
   */
  getActiveProviders(): SearchProviderMeta[] {
    const userConfig = getSearchProvidersConfig();
    const allProviders = Object.entries(searchProvidersConfig);

    // 过滤启用的 Provider 并按 order 排序
    const activeProviders = allProviders
      .filter(([key]) => {
        const config = userConfig.providers[key];
        // 如果没有配置，默认启用
        return config?.enabled ?? true;
      })
      .map(([key, meta]) => ({
        meta,
        order: userConfig.providers[key]?.order ?? 0,
      }))
      .sort((a, b) => a.order - b.order)
      .map(({ meta }) => meta);

    return activeProviders;
  }

  /**
   * 检查是否有可用 Provider（至少一个启用且有必需参数）
   */
  hasAvailableProvider(): boolean {
    const activeProviders = this.getActiveProviders();

    for (const providerMeta of activeProviders) {
      const params = this.getProviderParams(providerMeta.key);

      // 检查是否有 API 密钥（通用检查）
      if (params.apiKey) {
        return true;
      }
    }

    return false;
  }

  /**
   * 获取 Provider 的实际参数（合并默认值和用户配置）
   */
  private getProviderParams(providerKey: string): Record<string, string | number | boolean> {
    const defaults = getSearchProviderDefaultParams(providerKey);
    const userConfig = getSearchProvidersConfig();
    const userParams = userConfig.providers[providerKey]?.params || {};

    // 合并：用户配置覆盖默认值
    return { ...defaults, ...userParams };
  }

  /**
   * 格式化搜索结果为 AI 上下文
   */
  formatResultsForAI(results: SearchResult[]): string {
    if (results.length === 0) return '';

    return results.map(r => `【${r.title}】\n${r.snippet}\n来源：${r.url}`).join('\n\n');
  }
}

// 导出单例实例
export const searchService = new SearchService();

// 也导出类，方便测试
export { SearchService };