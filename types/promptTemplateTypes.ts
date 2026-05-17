// types/promptTemplateTypes.ts

/**
 * 提示词模板统一类型
 */
export interface PromptTemplate {
  id: string;           // 必须，唯一标识
  name: string;         // 必须，显示名称
  template: string;     // 必须，模板内容
  type?: string;        // 可选，仅common-questions使用
  description?: string; // 可选，描述
  enabled?: boolean;    // 可选，默认true
  maxTokens?: number;   // 可选，默认使用系统默认值
  temperature?: number; // 可选，默认使用系统默认值
  // 联网搜索配置
  enableWebSearch?: boolean;  // 可选，是否需要联网搜索，默认false
  webSearchHint?: string;     // 可选，联网搜索提示词（用于两段式搜索场景）
}