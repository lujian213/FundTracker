// types/commonQuestionsTypes.ts

export interface CommonQuestion {
  id: string;           // 唯一标识
  name: string;         // 显示名称（用户可见）
  template: string;     // 问题模板（支持变量替换）
  enabled?: boolean;    // 是否启用，默认 true
}

export interface CommonQuestionsConfig {
  questions: CommonQuestion[];
}