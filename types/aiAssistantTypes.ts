// types/aiAssistantTypes.ts

export interface AIAssistantMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
}

export interface AIAssistantState {
  messages: AIAssistantMessage[];
  hasBeenInitialized: boolean;
  lastAccessed: Date;
  initializationDate: Date; // 记录初始化日期，用于实现按天时效
}