import { ValuationData } from '../types';
import { AIConfiguration, getAIConfig } from './aiConfigService';

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

/**
 * 加载提示词模板
 */
export async function loadPromptTemplates(): Promise<PromptTemplate[]> {
  try {
    const response = await fetch('./assets/config/ai-prompt-templates.json', { cache: 'no-store' });

    if (!response.ok) {
      console.error(`Failed to load templates: HTTP ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();

    if (data && data.templates && Array.isArray(data.templates)) {
      return data.templates;
    } else {
      console.error('Invalid template data structure:', data);
      return [];
    }
  } catch (error) {
    console.error('Failed to load prompt templates:', error);
    return [];
  }
}

/**
 * 根据ID获取启用的提示词模板
 */
export async function getEnabledPromptTemplate(templateId?: string): Promise<PromptTemplate | null> {
  const templates = await loadPromptTemplates();

  if (templateId) {
    // 查找特定ID的模板
    const template = templates.find(t => t.id === templateId && t.enabled);
    return template || null;
  } else {
    // 返回第一个启用的模板
    return templates.find(t => t.enabled) || null;
  }
}

/**
 * 填充提示词模板中的变量
 */
export function fillTemplateVariables(template: string, context: AIQueryContext): string {
  let filledTemplate = template;

  if (context.fundName) {
    filledTemplate = filledTemplate.replace(/\{name\}/g, context.fundName);
  }

  if (context.fundSymbol) {
    filledTemplate = filledTemplate.replace(/\{code\}/g, context.fundSymbol);
  }

  if (context.tradeHistory) {
    // 将交易历史转换为字符串
    const historyString = JSON.stringify(context.tradeHistory, null, 2);
    filledTemplate = filledTemplate.replace(/\{history\}/g, historyString);
  } else {
    // 如果没有交易历史，用空数组替换
    filledTemplate = filledTemplate.replace(/\{history\}/g, "[]");
  }

  // 添加新的变量支持
  // fullCapacity: 当值为 undefined 或 0 时显示"未设置"
  if (context.fullCapacity !== undefined && context.fullCapacity > 0) {
    filledTemplate = filledTemplate.replace(/\{fullCapacity\}/g, String(context.fullCapacity));
  } else {
    filledTemplate = filledTemplate.replace(/\{fullCapacity\}/g, "未设置");
  }

  // initialCapacity: 当值为 undefined 或 0 时显示"未设置"
  if (context.initialCapacity !== undefined && context.initialCapacity > 0) {
    filledTemplate = filledTemplate.replace(/\{initialCapacity\}/g, String(context.initialCapacity));
  } else {
    filledTemplate = filledTemplate.replace(/\{initialCapacity\}/g, "未设置");
  }

  // initialDate: 当值为 undefined、null 或空字符串时显示"未设置"
  if (context.initialDate) {
    filledTemplate = filledTemplate.replace(/\{initialDate\}/g, context.initialDate);
  } else {
    filledTemplate = filledTemplate.replace(/\{initialDate\}/g, "未设置");
  }

  // initialPrice: 当值为 undefined 或 null 时显示"未设置"
  if (context.initialPrice !== undefined && context.initialPrice !== null) {
    filledTemplate = filledTemplate.replace(/\{initialPrice\}/g, String(context.initialPrice));
  } else {
    filledTemplate = filledTemplate.replace(/\{initialPrice\}/g, "未设置");
  }

  // currentPrice: 当前估值/净值
  if (context.valuationData?.currentPrice !== undefined && context.valuationData.currentPrice !== null) {
    filledTemplate = filledTemplate.replace(/\{currentPrice\}/g, context.valuationData.currentPrice.toFixed(4));
  } else {
    filledTemplate = filledTemplate.replace(/\{currentPrice\}/g, "未设置");
  }

  // currentDate: 当前日期（估值日期）
  if (context.valuationData?.realtimeDate) {
    filledTemplate = filledTemplate.replace(/\{currentDate\}/g, context.valuationData.realtimeDate);
  } else {
    filledTemplate = filledTemplate.replace(/\{currentDate\}/g, "未设置");
  }

  // previousPrice: 前值（上一交易日净值）
  if (context.valuationData?.previousPrice !== undefined && context.valuationData.previousPrice !== null) {
    filledTemplate = filledTemplate.replace(/\{previousPrice\}/g, context.valuationData.previousPrice.toFixed(4));
  } else {
    filledTemplate = filledTemplate.replace(/\{previousPrice\}/g, "未设置");
  }

  // previousDate: 前值日期
  if (context.valuationData?.netWorthDate) {
    filledTemplate = filledTemplate.replace(/\{previousDate\}/g, context.valuationData.netWorthDate);
  } else {
    filledTemplate = filledTemplate.replace(/\{previousDate\}/g, "未设置");
  }

  // rate: 涨跌幅
  if (context.valuationData?.changePercentage !== undefined && context.valuationData.changePercentage !== null) {
    const rate = context.valuationData.changePercentage;
    filledTemplate = filledTemplate.replace(/\{rate\}/g, `${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%`);
  } else {
    filledTemplate = filledTemplate.replace(/\{rate\}/g, "未设置");
  }

  // marketValue: 当前基金的市场价值
  if (context.marketValue !== undefined && context.marketValue !== null) {
    filledTemplate = filledTemplate.replace(/\{marketValue\}/g, context.marketValue.toFixed(2));
  } else {
    filledTemplate = filledTemplate.replace(/\{marketValue\}/g, "未设置");
  }

  // position: 当前基金的仓位（份）
  if (context.position !== undefined && context.position !== null) {
    filledTemplate = filledTemplate.replace(/\{position\}/g, context.position.toFixed(2));
  } else {
    filledTemplate = filledTemplate.replace(/\{position\}/g, "未设置");
  }

  // positionRate: 当前基金的仓位占比（百分比）
  if (context.positionRate !== undefined && context.positionRate !== null) {
    filledTemplate = filledTemplate.replace(/\{positionRate\}/g, `${context.positionRate.toFixed(2)}%`);
  } else {
    filledTemplate = filledTemplate.replace(/\{positionRate\}/g, "未设置");
  }

  // profit: 当前基金的整体盈利
  if (context.profit !== undefined && context.profit !== null) {
    const profit = context.profit;
    filledTemplate = filledTemplate.replace(/\{profit\}/g, `${profit >= 0 ? '+' : ''}${profit.toFixed(2)}`);
  } else {
    filledTemplate = filledTemplate.replace(/\{profit\}/g, "未设置");
  }

  // avgCostPrice: 当前基金的平均成本价
  if (context.avgCostPrice !== undefined && context.avgCostPrice !== null) {
    filledTemplate = filledTemplate.replace(/\{avgCostPrice\}/g, context.avgCostPrice.toFixed(4));
  } else {
    filledTemplate = filledTemplate.replace(/\{avgCostPrice\}/g, "未设置");
  }

  return filledTemplate;
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

  console.log('[AI Debug] 发送请求到:', url);

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

      console.log('[AI Debug] 响应收到:', {
        status: response.status,
        elapsed: elapsed + 'ms'
      });

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

      console.error('[AI Debug] 请求失败:', {
        attempt: attempt + 1,
        errorName: error.name,
        errorMessage: error.message
      });

      const isRetryable =
        error.name === 'TypeError' ||
        error.name === 'AbortError' ||
        error.message?.includes('ERR_HTTP2') ||
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('NetworkError');

      if (isRetryable && attempt < maxRetries) {
        console.warn(`[AI Debug] 将在 ${retryDelay * (attempt + 1)}ms 后重试...`);
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

    // DEBUG: 打印完整请求体，便于在控制台手动测试
    console.log('[AI Debug] 请求体大小:', JSON.stringify(requestBody).length, '字节');

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
      console.error('[AI Debug] 流读取错误:', streamError);
      // 如果已有部分内容，返回它
      if (fullContent) {
        return {
          content: fullContent,
          success: true
        };
      }
      throw streamError;
    }

    console.log('[AI Debug] 响应内容长度:', fullContent.length);

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
  const template = await getEnabledPromptTemplate(templateId);

  if (!template) {
    const templates = await loadPromptTemplates();
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

  const filledPrompt = fillTemplateVariables(template.template, context || {});

  return queryAI(config, filledPrompt, context, onChunk);
}