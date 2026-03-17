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
    // 如果没有初始化日期，设置为今天
    const initializationDate = state.initializationDate || new Date();
    this.states.set(fundSymbol, {
      ...state,
      lastAccessed: new Date(),
      initializationDate
    });
  }

  /**
   * 检查特定基金的 AI 助手是否在今天已初始化
   * 根据功能要求：AI助手窗口有使用时效，当天内用户第一次打开这个窗口时，系统会记录一个时间戳。
   * 之后这个窗口的使用时效截止为第二天的0点。
   */
  isInitializedToday(fundSymbol: string): boolean {
    const state = this.states.get(fundSymbol);
    if (!state || !state.hasBeenInitialized) {
      return false;
    }

    // 检查是否是同一天（年月日相同）
    const today = new Date();
    const initDate = new Date(state.initializationDate);

    return (
      today.getFullYear() === initDate.getFullYear() &&
      today.getMonth() === initDate.getMonth() &&
      today.getDate() === initDate.getDate()
    );
  }

  /**
   * 重置特定基金的 AI 助手状态（例如当用户手动关闭时）
   */
  resetState(fundSymbol: string): void {
    this.states.set(fundSymbol, {
      messages: [],
      hasBeenInitialized: false,
      lastAccessed: new Date(),
      initializationDate: new Date() // 重置时也要更新初始化日期
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