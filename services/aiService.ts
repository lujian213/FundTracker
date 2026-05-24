import { AIConfiguration } from './aiConfigService';
import { FundAIQueryContext, IndexAIQueryContext } from '../types/aiServiceTypes';
import { fillTemplateVariables, getById, TEMPLATE_IDS, FillTemplateResult } from './promptTemplateService';
import { fillTemplate, TemplateContext } from '../utils/templateFiller';
import { PromptTemplate } from '../types/promptTemplateTypes';
import { searchService } from './searchService';

// Re-export for convenience
export type { PromptTemplate } from '../types/promptTemplateTypes';

/**
 * 扩展的 AI 配置（包含联网搜索能力）
 */
export interface AIConfigurationWithWebSearch extends AIConfiguration {
  webSearch?: {
    params: Record<string, any>;
  };
}

export interface AIResponse {
  content: string;
  success: boolean;
  error?: string;
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
 * 统一的 AI 查询请求
 */
export interface AIRequest {
  messages: ChatMessage[];       // 完整消息数组
  enableWebSearch?: boolean;     // 是否联网搜索
  webSearchQuery?: string;       // 自定义搜索关键词（可选）
  temperature?: number;          // 默认 0.7
  maxTokens?: number;            // 默认 2000
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
 * 统一的 AI 查询方法
 * @param config AI配置
 * @param request 查询请求（messages + 可选参数）
 * @param onChunk 可选的流式回调
 */
export async function queryAI(
  config: AIConfiguration | AIConfigurationWithWebSearch,
  request: AIRequest,
  onChunk?: StreamCallback
): Promise<AIResponse> {
  try {
    const temperature = request.temperature ?? 0.7;
    const maxTokens = request.maxTokens ?? 2000;
    const enableWebSearch = request.enableWebSearch ?? false;

    // 情况1：AI 模型支持内置联网搜索（如智谱 GLM-4）
    if (enableWebSearch && (config as AIConfigurationWithWebSearch).webSearch) {
      const webSearchConfig = config as AIConfigurationWithWebSearch;
      const requestBody: {
        model: string;
        messages: ChatMessage[];
        stream: boolean;
        temperature: number;
        max_tokens: number;
        tools?: Array<{ type: string; web_search: Record<string, any> }>;
      } = {
        model: config.model || 'gpt-4',
        messages: request.messages,
        stream: true,
        temperature,
        max_tokens: maxTokens,
      };

      const webSearchParams = webSearchConfig.webSearch?.params || {};
      requestBody.tools = [{
        type: 'web_search',
        web_search: {
          enable: true,
          ...webSearchParams
        }
      }];

      const response = await fetchWithRetry(config.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(requestBody)
      });

      return processStreamResponse(response, onChunk);
    }

    // 情况2：启用联网搜索但模型不支持，使用搜索服务注入
    if (enableWebSearch && request.webSearchQuery) {
      // 调用搜索服务
      const searchResponse = await searchService.search({
        query: request.webSearchQuery,
        maxResults: 5
      });

      // 如果搜索成功，将结果注入到第一条 user 消息
      if (searchResponse.success && searchResponse.results.length > 0) {
        const searchContext = searchService.formatResultsForAI(searchResponse.results);
        const enhancedMessages = request.messages.map((msg, idx) => {
          // 只增强第一条 user 消息
          if (idx === 0 && msg.role === 'user') {
            return { ...msg, content: `参考资料：\n${searchContext}\n\n${msg.content}` };
          }
          return msg;
        });

        const requestBody = {
          model: config.model || 'gpt-4',
          messages: enhancedMessages,
          stream: true,
          temperature,
          max_tokens: maxTokens,
        };

        const response = await fetchWithRetry(config.apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(requestBody)
        });

        return processStreamResponse(response, onChunk);
      }

      // 搜索失败则降级为普通请求
      console.warn('搜索服务失败或无结果，降级为普通请求', searchResponse.error);
    }

    // 情况3：普通请求（无联网搜索或搜索失败降级）
    const requestBody = {
      model: config.model || 'gpt-4',
      messages: request.messages,
      stream: true,
      temperature,
      max_tokens: maxTokens,
    };

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

/**
 * 使用市场类型特定的模板发送AI查询
 * 自动读取模板、填充变量、启用联网搜索
 * @param config AI配置
 * @param marketType 市场类型 ('fund' 或 'index')
 * @param context 基金/指数上下文数据
 * @param onChunk 可选的流式回调
 */
export async function queryAIWithMarketTemplate(
  config: AIConfiguration | AIConfigurationWithWebSearch,
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

  // 填充模板变量（使用 fillTemplateVariables 进行变量名映射）
  const promptResult = fillTemplateVariables(template.template, effectiveContext);
  if (!promptResult.success) {
    const errorMsg = promptResult.error || '模板填充失败';
    console.error(errorMsg);
    return {
      content: errorMsg,
      success: false,
      error: errorMsg
    };
  }

  // 判断是否启用联网搜索
  const enableWebSearch = template.enableWebSearch && !!promptResult.content;

  // 填充 webSearchHint（同样使用 fillTemplateVariables 进行变量名映射）
  let webSearchQuery: string | undefined;
  if (template.webSearchHint) {
    const searchHintResult = fillTemplateVariables(template.webSearchHint, effectiveContext);
    webSearchQuery = searchHintResult.success ? searchHintResult.content : undefined;
  }

  // 构建请求
  const request: AIRequest = {
    messages: [{ role: 'user', content: promptResult.content }],
    enableWebSearch,
    webSearchQuery,
    temperature: template.temperature ?? 0.7,
    maxTokens: template.maxTokens ?? 2000,
  };

  return queryAI(config, request, onChunk);
}

/**
 * 使用模板发送AI查询（自动启用联网搜索）
 * @param config AI配置
 * @param template 提示词模板
 * @param variables 模板变量
 * @param onChunk 可选的流式回调
 */
export async function queryAIWithTemplate(
  config: AIConfiguration | AIConfigurationWithWebSearch,
  template: PromptTemplate,
  variables: TemplateContext,
  onChunk?: StreamCallback
): Promise<AIResponse> {
  // 填充模板变量
  const promptResult = fillTemplate(template.template, variables);
  if (!promptResult.success) {
    const errorMsg = promptResult.error || '模板填充失败';
    console.error(errorMsg);
    return {
      content: errorMsg,
      success: false,
      error: errorMsg
    };
  }

  // 判断是否启用联网搜索
  const enableWebSearch = template.enableWebSearch;

  // 处理 webSearchHint（检查填充是否成功）
  let webSearchQuery: string | undefined;
  if (template.webSearchHint) {
    const webSearchHintResult = fillTemplate(template.webSearchHint, variables);
    webSearchQuery = webSearchHintResult.success ? webSearchHintResult.content : undefined;
  }

  // 构建请求
  const request: AIRequest = {
    messages: [{ role: 'user', content: promptResult.content }],
    enableWebSearch,
    webSearchQuery,
    temperature: template.temperature ?? 0.7,
    maxTokens: template.maxTokens ?? 2000,
  };

  return queryAI(config, request, onChunk);
}