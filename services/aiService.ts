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
 * Queries the AI model with the provided query and context
 */
export async function queryAI(
  config: AIConfiguration,
  query: string,
  context?: AIQueryContext
): Promise<AIResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

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
      max_tokens: 4000  // 增加到4000以避免回复被截断
    };

    const response = await fetch(config.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // 根据HTTP状态码提供更详细的错误信息
      let errorMessage = `API request failed with status ${response.status}: ${response.statusText}`;

      if (response.status === 401) {
        errorMessage = 'API密钥无效或已过期，请检查您的AI配置';
      } else if (response.status === 403) {
        errorMessage = 'API访问被拒绝，请检查您的权限';
      } else if (response.status === 429) {
        errorMessage = 'API请求频率超限，请稍后再试';
      } else if (response.status === 404) {
        errorMessage = 'API端点未找到，请检查您的AI配置';
      } else if (response.status >= 500) {
        errorMessage = 'AI服务内部服务器错误，请稍后再试';
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();

    if (data.choices && data.choices.length > 0) {
      return {
        content: data.choices[0].message.content || 'No response content received',
        success: true
      };
    } else {
      return {
        content: 'Invalid response format from AI API',
        success: false,
        error: 'Invalid response format'
      };
    }
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      return {
        content: 'Request timed out. Please try again.',
        success: false,
        error: 'Timeout'
      };
    }

    return {
      content: `Error communicating with AI service: ${error.message}`,
      success: false,
      error: error.message
    };
  }
}

/**
 * 使用模板发送AI查询
 */
export async function queryAIWithTemplate(
  config: AIConfiguration,
  templateId?: string,
  context?: AIQueryContext
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

  return queryAI(config, filledPrompt, context);
}