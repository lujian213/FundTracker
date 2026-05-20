/**
 * services/searchProvidersConfig.ts
 *
 * 搜索服务 Provider 配置定义
 */

import { SearchProviderMeta, SearchProviderParam } from '../types/searchTypes';

/**
 * AnySearch Provider 参数定义
 */
const anySearchParams: Record<string, SearchProviderParam> = {
  apiKey: {
    name: 'apiKey',
    type: 'string',
    description: 'AnySearch API 密钥',
    value: '',
    isSensitive: true,
  },
  maxResults: {
    name: 'maxResults',
    type: 'number',
    description: '最大返回结果数',
    value: 10,
  },
  domains: {
    name: 'domains',
    type: 'string',
    description: '支持的查询领域（逗号分隔，如 finance,academic）',
    value: 'finance',
  },
};

/**
 * 智谱搜索 Provider 参数定义
 */
const zhipuSearchParams: Record<string, SearchProviderParam> = {
  apiKey: {
    name: 'apiKey',
    type: 'string',
    description: '智谱 API 密钥',
    value: '',
    isSensitive: true,
  },
  searchEngine: {
    name: 'searchEngine',
    type: 'string',
    description: '搜索引擎类型：search_std（基础版）、search_pro（高阶版）、search_pro_sogou（搜狗）、search_pro_quark（夸克）',
    value: 'search_std',
  },
  searchIntent: {
    name: 'searchIntent',
    type: 'bool',
    description: '是否进行搜索意图识别',
    value: false,
  },
  count: {
    name: 'count',
    type: 'number',
    description: '返回结果数量（1-50，search_pro_sogou 仅支持10/20/30/40/50）',
    value: 10,
  },
  searchDomainFilter: {
    name: 'searchDomainFilter',
    type: 'string',
    description: '限定搜索域名（如 www.example.com）',
    value: '',
  },
  searchRecencyFilter: {
    name: 'searchRecencyFilter',
    type: 'string',
    description: '时间过滤：oneDay、oneWeek、oneMonth、oneYear、noLimit',
    value: 'noLimit',
  },
  contentSize: {
    name: 'contentSize',
    type: 'string',
    description: '内容长度：medium（摘要）、high（详细）',
    value: 'medium',
  },
};

/**
 * 搜索服务 Provider 配置
 * 静态定义所有可用的搜索服务 Provider
 */
export const searchProvidersConfig: Record<string, SearchProviderMeta> = {
  anySearch: {
    key: 'anySearch',
    name: 'AnySearch',
    description: '实时搜索引擎，支持多领域查询',
    params: anySearchParams,
  },
  zhipuSearch: {
    key: 'zhipuSearch',
    name: '智谱搜索',
    description: '智谱 Web Search API，专为大模型优化的搜索引擎',
    params: zhipuSearchParams,
  },
};

/**
 * 获取所有 Provider 的 key 列表
 */
export function getSearchProviderKeys(): string[] {
  return Object.keys(searchProvidersConfig);
}

/**
 * 获取 Provider 元信息
 */
export function getSearchProviderMeta(key: string): SearchProviderMeta | null {
  return searchProvidersConfig[key] || null;
}

/**
 * 获取所有 Provider 元信息列表
 */
export function getAllSearchProvidersMeta(): SearchProviderMeta[] {
  return Object.values(searchProvidersConfig);
}

/**
 * 获取 Provider 的默认参数值
 */
export function getSearchProviderDefaultParams(key: string): Record<string, string | number | boolean> {
  const meta = searchProvidersConfig[key];
  if (!meta) return {};

  const defaults: Record<string, string | number | boolean> = {};
  for (const [paramKey, param] of Object.entries(meta.params)) {
    defaults[paramKey] = param.value;
  }
  return defaults;
}

/**
 * 判断参数是否为敏感参数
 */
export function isSensitiveParam(providerKey: string, paramKey: string): boolean {
  const meta = searchProvidersConfig[providerKey];
  if (!meta || !meta.params[paramKey]) return false;
  return meta.params[paramKey].isSensitive === true;
}