import { AIAssistantMessage, AIAssistantState } from '../types/aiAssistantTypes';

// 全局状态管理器
class AIAssistantStateManager {
  private states: Map<string, AIAssistantState> = new Map();

  /**
   * 获取特定基金的 AI 助手状态
   */
  getState(fundSymbol: string): AIAssistantState | null {
    const state = this.states.get(fundSymbol);
    return state ? { ...state } : null; // 返回副本以防止意外修改
  }

  /**
   * 设置特定基金的 AI 助手状态
   */
  setState(fundSymbol: string, state: AIAssistantState): void {
    this.states.set(fundSymbol, { ...state, lastAccessed: new Date() });
  }

  /**
   * 检查特定基金的 AI 助手是否已初始化
   */
  isInitialized(fundSymbol: string): boolean {
    const state = this.states.get(fundSymbol);
    return state ? state.hasBeenInitialized : false;
  }

  /**
   * 重置特定基金的 AI 助手状态（例如当用户手动关闭时）
   */
  resetState(fundSymbol: string): void {
    this.states.set(fundSymbol, {
      messages: [],
      hasBeenInitialized: false,
      lastAccessed: new Date()
    });
  }

  /**
   * 清除特定基金的状态（例如用户明确要求清除对话）
   */
  clearState(fundSymbol: string): void {
    this.states.delete(fundSymbol);
  }

  /**
   * 获取所有状态（用于调试）
   */
  getAllStates(): Map<string, AIAssistantState> {
    // 返回副本以防止意外修改
    const copy = new Map();
    this.states.forEach((value, key) => {
      copy.set(key, { ...value });
    });
    return copy;
  }

  /**
   * 清理过期状态（可选功能）
   */
  cleanupExpired(maxAgeHours: number = 24): void {
    const now = new Date();
    for (const [fundSymbol, state] of this.states.entries()) {
      const ageHours = (now.getTime() - state.lastAccessed.getTime()) / (1000 * 60 * 60);
      if (ageHours > maxAgeHours) {
        this.states.delete(fundSymbol);
      }
    }
  }
}

// 创建全局实例
export const aiAssistantStateManager = new AIAssistantStateManager();

// 导出类型以便其他文件使用
export type { AIAssistantState };