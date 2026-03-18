import { AIAssistantMessage, AIAssistantState } from '../types/aiAssistantTypes';
import { AIConfiguration, getAIConfig } from './aiConfigService';
import { queryAI } from './aiService';

// 默认字符数阈值
const DEFAULT_THRESHOLD = 10000; // 10K字符

export interface CompressionResult {
  success: boolean;
  summary?: string;
  error?: string;
}

export class ContextCompressionService {
  private threshold: number;

  constructor(threshold: number = DEFAULT_THRESHOLD) {
    this.threshold = threshold;
  }

  /**
   * 检查是否需要进行上下文压缩
   */
  public needsCompression(state: AIAssistantState): boolean {
    // 使用完整的上下文长度（摘要+新内容）来进行压缩判断
    const fullContextLength = this.getContextLength(state);
    return fullContextLength >= this.threshold;
  }

  /**
   * 执行上下文压缩
   */
  public async compressContext(
    state: AIAssistantState,
    config?: AIConfiguration | null
  ): Promise<CompressionResult> {
    try {
      // 如果没有提供配置，或提供的配置为null，则尝试获取
      let effectiveConfig: AIConfiguration | null | undefined = config;
      if (!effectiveConfig) {
        effectiveConfig = getAIConfig();
        if (!effectiveConfig) {
          return {
            success: false,
            error: 'No AI configuration available for compression'
          };
        }
      }

      // 确保我们有一个有效的配置
      if (!effectiveConfig) {
        return {
          success: false,
          error: 'No AI configuration available for compression'
        };
      }

      // 合并当前上下文内容（摘要内容和新内容）
      const summaryPart = state.summaryContent ? `[摘要] ${state.summaryContent}\n\n` : '';
      const newContentPart = this.serializeMessages(state.newContent);
      const currentContextContent = summaryPart + newContentPart;

      // 请求AI生成摘要
      const summaryPrompt = `
请帮我总结以下对话内容，提取出关键信息，并将内容压缩到原来的三分之一左右：

${currentContextContent}

请将压缩后的摘要内容返回给我。
`;

      const result = await queryAI(effectiveConfig, summaryPrompt);

      if (result.success && result.content) {
        return {
          success: true,
          summary: result.content
        };
      } else {
        return {
          success: false,
          error: result.error || 'Unknown error occurred during compression'
        };
      }
    } catch (error: any) {
      console.error('Error during context compression:', error);
      return {
        success: false,
        error: error.message || 'Error occurred during compression'
      };
    }
  }

  /**
   * 序列化消息数组为字符串
   */
  public serializeMessages(messages: AIAssistantMessage[]): string {
    return messages
      .map(msg => `[${msg.role.toUpperCase()}] ${msg.content}`)
      .join('\n\n');
  }

  /**
   * 获取用于AI交互的上下文内容
   */
  public getContextForAI(state: AIAssistantState): string {
    const summaryContext = state.summaryContent ? `[摘要] ${state.summaryContent}\n\n` : '';
    const newContext = this.serializeMessages(state.newContent);
    return summaryContext + newContext;
  }

  /**
   * 获取用于显示的完整消息列表
   */
  public getMessagesForDisplay(state: AIAssistantState): AIAssistantMessage[] {
    return [...state.historyContent, ...state.newContent];
  }

  /**
   * 计算当前上下文长度
   */
  public getContextLength(state: AIAssistantState): number {
    return this.getContextForAI(state).length;
  }

  /**
   * 计算新内容长度
   */
  public getNewContentLength(state: AIAssistantState): number {
    return this.serializeMessages(state.newContent).length;
  }
}