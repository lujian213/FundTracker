/**
 * services/searchProviders/index.ts
 *
 * 搜索 Provider 实例导出
 */

import { SearchProvider } from '../../types/searchTypes';
import { AnySearchProvider } from './anySearchProvider';

/**
 * 所有注册的 Provider 实例
 */
export const searchProviders: SearchProvider[] = [
  new AnySearchProvider(),
  // 未来可添加更多 provider:
  // new GoogleSearchProvider(),
  // new DuckDuckGoProvider(),
];

/**
 * 按 key 获取 Provider 实例
 */
export function getProviderByKey(key: string): SearchProvider | undefined {
  return searchProviders.find(p => p.key === key);
}