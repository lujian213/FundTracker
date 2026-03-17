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
}