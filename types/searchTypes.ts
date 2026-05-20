/**
 * types/searchTypes.ts
 *
 * 搜索服务类型定义
 */

/**
 * 搜索 Provider 参数定义
 */
export interface SearchProviderParam {
  name: string;           // 参数名（英文key）
  type: 'string' | 'number' | 'bool';
  description: string;    // 参数描述
  value: string | number | boolean;  // 默认值
  isSensitive?: boolean;  // 是否为敏感信息（如API密钥）
}

/**
 * 搜索 Provider 元信息（用于 UI 配置展示）
 */
export interface SearchProviderMeta {
  key: string;            // Provider唯一标识
  name: string;           // 显示名称
  description: string;    // Provider描述
  params: Record<string, SearchProviderParam>;  // 参数定义
}

/**
 * 搜索 Provider 执行接口
 * 每个 provider 实现此接口，内部自由决定调用方式
 */
export interface SearchProvider {
  key: string;  // 对应 SearchProviderMeta.key

  /**
   * 执行搜索
   * @param query 查询文本
   * @param params 用户配置的参数（已合并默认值）
   * @param maxResults 最大结果数
   */
  search(query: string, params: Record<string, string | number | boolean>, maxResults: number): Promise<SearchResult[]>;
}

/**
 * 搜索请求
 */
export interface SearchRequest {
  query: string;        // 查询文本
  maxResults?: number;  // 结果数量限制（可选，默认为 10）
}

/**
 * 搜索结果
 */
export interface SearchResult {
  title: string;    // 结果标题
  url: string;      // 结果链接
  snippet: string;  // 结果摘要
}

/**
 * 搜索响应
 */
export interface SearchResponse {
  success: boolean;     // 是否成功
  results: SearchResult[];  // 搜索结果列表
  error?: string;       // 所有 provider 都失败时的错误信息
}

/**
 * 用户配置的 Provider 参数
 */
export interface SearchProviderUserConfig {
  enabled: boolean;       // 是否启用
  order: number;          // 排序优先级（数值越小优先级越高）
  params: {               // 用户设置的参数值（覆盖默认值）
    [paramKey: string]: string | number | boolean;
  };
}

/**
 * 搜索服务配置节
 */
export interface SearchProvidersSection {
  providers: Record<string, SearchProviderUserConfig>;
}