import { ValuationData } from '../types';
import { AIConfiguration, getAIConfig } from './aiConfigService';
import { FundAIQueryContext, IndexAIQueryContext } from '../types/aiServiceTypes';
import { fillTemplateVariables as fillMarketTemplateVariables, getById, TEMPLATE_IDS } from './promptTemplateService';
import { fillTemplate, TemplateContext, FillTemplateResult } from '../utils/templateFiller';
import { PromptTemplate } from '../types/promptTemplateTypes';

// Re-export PromptTemplate for backward compatibility
export type { PromptTemplate } from '../types/promptTemplateTypes';

/**
 * 扩展的 AI 配置（包含联网搜索能力）
 */
export interface AIConfigurationWithWebSearch extends AIConfiguration {
  webSearch?: {
    params: Record<string, any>;
  };
}

export interface AIQueryContext {
  fundName?: string;
  fundSymbol?: string;
  valuationData?: ValuationData;
  tradeHistory?: any[]; // 用户交易历史
  fullCapacity?: number; // 基金满仓份额
  initialCapacity?: number; // 用户投资该基金的初始份额
  initialDate?: string; // 用户投资该基金的起始日期
  initialPrice?: number; // 用户投资该基金的初始价格
  marketValue?: number; // 当前基金的市场价值
  position?: number; // 当前基金的仓位（份）
  positionRate?: number; // 当前基金的仓位占比（百分比，如 50.5 表示 50.5%）
  profit?: number; // 当前基金的整体盈利
  avgCostPrice?: number; // 当前基金的平均成本价
}

export interface AIResponse {
  content: string;
  success: boolean;
  error?: string;
}

/**
 * 带重试的 fetch 请求，处理 HTTP/2 协议错误等网络问题
 * 返回 Response 对象，由调用方处理流式响应
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 2,
  retryDelay: number = 1000,
  timeout: number = 60000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const startTime = Date.now();
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      const elapsed = Date.now() - startTime;

      if (!response.ok) {
        clearTimeout(timeoutId);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // 清除超时，返回 Response 对象让调用方处理流
      clearTimeout(timeoutId);
      return response;
    } catch (error: any) {
      clearTimeout(timeoutId);
      lastError = error;

      const isRetryable =
        error.name === 'TypeError' ||
        error.name === 'AbortError' ||
        error.message?.includes('ERR_HTTP2') ||
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('NetworkError');

      if (isRetryable && attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

/**
 * 流式响应回调类型
 * @param chunk 新接收到的内容片段
 * @param fullContent 到目前为止的完整内容
 */
export type StreamCallback = (chunk: string, fullContent: string) => void;

/**
 * 对话消息类型
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 处理流式响应的私有辅助函数
 * 负责读取流、解析SSE格式、调用回调并返回结果
 */
async function processStreamResponse(
  response: Response,
  onChunk?: StreamCallback
): Promise<AIResponse> {
  const reader = response.body?.getReader();
  if (!reader) {
    return {
      content: 'Failed to get response stream',
      success: false,
      error: 'No stream'
    };
  }

  const decoder = new TextDecoder();
  let fullContent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      // 解析 SSE 格式: data: {...}\n\n
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
              // 调用流式回调
              if (onChunk) {
                onChunk(content, fullContent);
              }
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }
  } catch (streamError: any) {
    // 如果已有部分内容，返回它
    if (fullContent) {
      return {
        content: fullContent,
        success: true
      };
    }
    throw streamError;
  }

  if (fullContent) {
    return {
      content: fullContent,
      success: true
    };
  } else {
    return {
      content: 'No response content received',
      success: false,
      error: 'Empty response'
    };
  }
}

/**
 * Queries the AI model with the provided query and context
 * @param onChunk 可选的流式回调，每次收到新内容时调用
 * @param maxTokens 可选的最大token数，默认2000
 * @param temperature 可选的温度参数，默认0.7
 */
export async function queryAI(
  config: AIConfiguration,
  query: string,
  context?: AIQueryContext,
  onChunk?: StreamCallback,
  maxTokens?: number,
  temperature?: number
): Promise<AIResponse> {
  try {
    // Construct the full prompt with context
    let fullPrompt = query;

    if (context) {
      const contextInfo = [];

      if (context.fundName) {
        contextInfo.push(`Fund Name: ${context.fundName}`);
      }

      if (context.fundSymbol) {
        contextInfo.push(`Fund Symbol: ${context.fundSymbol}`);
      }

      if (context.valuationData) {
        const valuation = context.valuationData;
        contextInfo.push(
          `Current Price: ${valuation.currentPrice}`,
          `Previous Price: ${valuation.previousPrice}`,
          `Change Percentage: ${valuation.changePercentage}%`,
          `Last Updated: ${valuation.lastUpdated}`,
          `Net Worth Date: ${valuation.netWorthDate}`
        );
      }

      if (contextInfo.length > 0) {
        fullPrompt = `Context information:\n${contextInfo.join('\n')}\n\nUser Query: ${query}`;
      }
    }

    const requestBody = {
      model: config.model || 'gpt-4',
      messages: [
        { role: 'system', content: 'You are an investment assistant that provides analysis and information about investment funds. Be concise and informative.' },
        { role: 'user', content: fullPrompt }
      ],
      temperature: temperature ?? 0.7,
      max_tokens: maxTokens || 2000,
      stream: true  // 使用流式响应，避免 HTTP/2 长连接中断
    };

    // 使用流式响应
    const response = await fetchWithRetry(config.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody)
    });

    // 处理流式响应
    return processStreamResponse(response, onChunk);
  } catch (error: any) {
    return {
      content: `Error communicating with AI service: ${error.message}`,
      success: false,
      error: error.message
    };
  }
}

/**
 * 使用消息历史查询AI模型
 * @param config AI配置
 * @param messages 对话消息历史
 * @param onChunk 可选的流式回调
 * @param maxTokens 最大token数
 */
export async function queryAIWithMessages(
  config: AIConfiguration,
  messages: ChatMessage[],
  onChunk?: StreamCallback,
  maxTokens: number = 4000
): Promise<AIResponse> {
  try {
    const requestBody = {
      model: config.model || 'gpt-4',
      messages: messages,
      temperature: 0.7,
      max_tokens: maxTokens,
      stream: true
    };

    const response = await fetchWithRetry(config.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody)
    });

    // 处理流式响应
    return processStreamResponse(response, onChunk);
  } catch (error: any) {
    return {
      content: `Error communicating with AI service: ${error.message}`,
      success: false,
      error: error.message
    };
  }
}

/**
 * 使用模板发送AI查询（自动使用模板的 maxTokens 和 temperature）
 * @param templateId 模板ID，默认使用 FUND_ANALYSIS
 * @param filledPrompt 已填充变量的提示词（如果为空则使用模板原始内容）
 * @param onChunk 可选的流式回调
 * @returns AI响应
 */
export async function queryAIWithTemplate(
  config: AIConfiguration,
  templateId: string,
  filledPrompt?: string,
  onChunk?: StreamCallback
): Promise<AIResponse> {
  const template = getById(templateId);

  if (!template) {
    const errorMsg = `模板 "${templateId}" 未找到`;
    console.error(errorMsg);
    return {
      content: errorMsg,
      success: false,
      error: 'No template'
    };
  }

  const prompt = filledPrompt || template.template;

  return queryAI(
    config,
    prompt,
    undefined,
    onChunk,
    template.maxTokens,
    template.temperature
  );
}

/**
 * 使用模板ID发送AI查询（填充基金上下文变量）
 * @deprecated 建议使用 queryAIWithTemplate 并自行填充变量
 * @param onChunk 可选的流式回调
 */
export async function queryAIWithTemplateById(
  config: AIConfiguration,
  templateId?: string,
  context?: AIQueryContext,
  onChunk?: StreamCallback
): Promise<AIResponse> {
  const template = getById(templateId || TEMPLATE_IDS.FUND_ANALYSIS);

  if (!template) {
    const errorMsg = templateId
      ? `模板 "${templateId}" 未找到`
      : `没有找到基金分析模板`;
    console.error(errorMsg);
    return {
      content: errorMsg,
      success: false,
      error: 'No template'
    };
  }

  const filledPrompt = fillMarketTemplateVariables(template.template, {
    marketType: 'fund',
    fundName: context?.fundName || '',
    fundSymbol: context?.fundSymbol || '',
    ...context
  } as FundAIQueryContext);

  return queryAI(config, filledPrompt, context, onChunk, template.maxTokens, template.temperature);
}

/**
 * 使用市场类型特定的模板发送AI查询
 * @param marketType 市场类型 ('fund' 或 'index')
 * @param onChunk 可选的流式回调
 */
export async function queryAIWithMarketTemplate(
  config: AIConfiguration,
  marketType: 'fund' | 'index',
  context?: FundAIQueryContext | IndexAIQueryContext,
  onChunk?: StreamCallback
): Promise<AIResponse> {
  const templateId = marketType === 'fund' ? TEMPLATE_IDS.FUND_ANALYSIS : TEMPLATE_IDS.INDEX_ANALYSIS;
  const template = getById(templateId);

  if (!template) {
    const errorMsg = `没有找到${marketType === 'index' ? '指数' : '基金'}分析模板`;
    console.error(errorMsg);
    return {
      content: errorMsg,
      success: false,
      error: 'No template'
    };
  }

  // 如果没有提供 context，使用最小化的上下文
  const effectiveContext = context || (marketType === 'fund'
    ? { marketType: 'fund' as const, fundName: '', fundSymbol: '' }
    : { marketType: 'index' as const, indexName: '', indexSymbol: '', datetime: '' });

  const filledPrompt = fillMarketTemplateVariables(template.template, effectiveContext);

  return queryAI(config, filledPrompt, context as AIQueryContext, onChunk, template.maxTokens, template.temperature);
}

/**
 * 判断是否启用联网搜索
 * 规则：AI配置有webSearch && 模板要求enableWebSearch
 */
function shouldEnableWebSearch(
  config: AIConfigurationWithWebSearch,
  template: PromptTemplate
): boolean {
  return !!config.webSearch && !!template.enableWebSearch;
}

/**
 * 使用模板和联网搜索发送AI查询
 * @param config AI配置
 * @param template 提示词模板
 * @param context 模板上下文（占位符值）
 * @param onChunk 可选的流式回调
 * @returns AI响应
 */
export async function queryAIWithWebSearch(
  config: AIConfigurationWithWebSearch,
  template: PromptTemplate,
  context: TemplateContext,
  onChunk?: StreamCallback
): Promise<AIResponse> {
  try {
    const promptResult = fillTemplate(template.template, context);
    if (!promptResult.success) {
      console.warn(`提示词模板 "${template.name}" ${promptResult.error}`);
    }
    const prompt = promptResult.success ? promptResult.content : template.template;

    const enableWebSearch = shouldEnableWebSearch(config, template);

    const requestBody: {
      model: string;
      messages: Array<{ role: string; content: string }>;
      stream: boolean;
      temperature: number;
      max_tokens: number;
      tools?: Array<{ type: string; web_search: Record<string, any> }>;
    } = {
      model: config.model || 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      temperature: template.temperature ?? 0.7,
      max_tokens: template.maxTokens ?? 2000,
    };

    if (enableWebSearch && config.webSearch) {
      requestBody.tools = [{
        type: 'web_search',
        web_search: {
          enable: true,
          ...config.webSearch.params
        }
      }];
    }

    const response = await fetchWithRetry(config.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody)
    });

    return processStreamResponse(response, onChunk);
  } catch (error: any) {
    return {
      content: `Error communicating with AI service: ${error.message}`,
      success: false,
      error: error.message
    };
  }
}