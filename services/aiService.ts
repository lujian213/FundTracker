import { ValuationData } from '../types';
import { AIConfiguration, getAIConfig } from './aiConfigService';

export interface AIQueryContext {
  fundName?: string;
  fundSymbol?: string;
  valuationData?: ValuationData;
  tradeHistory?: any[]; // 用户交易历史
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
    const response = await fetch('/assets/config/ai-prompt-templates.json');

    if (!response.ok) {
      console.error(`Failed to load templates: HTTP ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();

    if (data && data.templates && Array.isArray(data.templates)) {
      console.log(`Loaded ${data.templates.length} prompt templates`);
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
      max_tokens: 1000
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