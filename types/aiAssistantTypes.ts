// types/aiAssistantTypes.ts

export interface AIAssistantMessage {
  id: string;
  content: string;           // 显示内容（常用问题的名称）
  actualContent?: string;    // 实际内容（完整提示词，用于 AI 上下文）
  role: 'user' | 'assistant';
  timestamp: Date;
}

export interface AIAssistantState {
  historyContent: AIAssistantMessage[];
  newContent: AIAssistantMessage[];
  summaryContent: string;
  hasBeenInitialized: boolean;
  lastAccessed: Date;
  initializationDate: Date; // 记录初始化日期，用于实现按天时效
}