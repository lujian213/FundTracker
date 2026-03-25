import { ValuationData } from '../types';
import { AIConfiguration, getAIConfig } from './aiConfigService';
import { FundAIQueryContext, IndexAIQueryContext } from '../types/aiServiceTypes';
import { fillTemplateVariables as fillMarketTemplateVariables } from './promptTemplateService';

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

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  template: string;
}

// 模板配置文件路径映射
const TEMPLATE_CONFIG_PATHS: Record<'fund' | 'index', string> = {
  fund: './assets/config/ai-fund-prompt-templates.json',
  index: './assets/config/ai-index-prompt-templates.json'
};

// 模板缓存
const templateCache: Map<'fund' | 'index', PromptTemplate[]> = new Map();

/**
 * 通用模板加载函数（带缓存）
 * @param marketType 市场类型 ('fund' 或 'index')
 */
async function loadTemplatesByMarketType(marketType: 'fund' | 'index'): Promise<PromptTemplate[]> {
  // 检查缓存
  const cached = templateCache.get(marketType);
  if (cached) {
    return cached;
  }

  const configPath = TEMPLATE_CONFIG_PATHS[marketType];
  const typeName = marketType === 'index' ? '指数' : '基金';

  try {
    const response = await fetch(configPath);

    if (!response.ok) {
      console.error(`加载${typeName}模板失败: HTTP ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();

    if (data && data.templates && Array.isArray(data.templates)) {
      // 存入缓存
      templateCache.set(marketType, data.templates);
      return data.templates;
    } else {
      console.error(`无效的${typeName}模板数据结构:`, data);
      return [];
    }
  } catch (error) {
    console.error(`加载${typeName}提示词模板失败:`, error);
    return [];
  }
}

/**
 * 通用模板获取函数
 * @param marketType 市场类型
 * @param templateId 可选的模板ID
 */
export async function getEnabledTemplateByMarketType(
  marketType: 'fund' | 'index',
  templateId?: string
): Promise<PromptTemplate | null> {
  const templates = await loadTemplatesByMarketType(marketType);

  if (templateId) {
    const template = templates.find(t => t.id === templateId && t.enabled);
    return template || null;
  } else {
    return templates.find(t => t.enabled) || null;
  }
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
 * Queries the AI model with the provided query and context
 * @param onChunk 可选的流式回调，每次收到新内容时调用
 */
export async function queryAI(
  config: AIConfiguration,
  query: string,
  context?: AIQueryContext,
  onChunk?: StreamCallback
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
      temperature: 0.7,
      max_tokens: 2000,
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

    // 读取流式响应
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
  } catch (error: any) {
    return {
      content: `Error communicating with AI service: ${error.message}`,
      success: false,
      error: error.message
    };
  }
}

/**
 * 使用模板发送AI查询
 * @param onChunk 可选的流式回调
 */
export async function queryAIWithTemplate(
  config: AIConfiguration,
  templateId?: string,
  context?: AIQueryContext,
  onChunk?: StreamCallback
): Promise<AIResponse> {
  const template = await getEnabledTemplateByMarketType('fund', templateId);

  if (!template) {
    const templates = await loadTemplatesByMarketType('fund');
    const enabledCount = templates.filter(t => t.enabled).length;
    const errorMsg = templateId
      ? `模板 "${templateId}" 未找到或未启用`
      : `没有启用的模板 (共${templates.length}个模板, ${enabledCount}个已启用)`;
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

  return queryAI(config, filledPrompt, context, onChunk);
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
  const template = await getEnabledTemplateByMarketType(marketType);

  if (!template) {
    const errorMsg = `没有启用的${marketType === 'index' ? '指数' : '基金'}模板`;
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

  return queryAI(config, filledPrompt, context as AIQueryContext, onChunk);
}