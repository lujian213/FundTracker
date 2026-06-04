// services/calendarHolidayService.ts
/**
 * 日历节假日服务
 * 处理节假日AI响应解析和更新
 */

import { HolidayType } from './calendarService';
import { getAIConfig } from './aiConfigService';
import { queryAIWithTemplate, AIResponse } from './aiService';
import { formatDateDisplay } from '../utils/dateFormat';
import { getById, TEMPLATE_IDS } from './promptTemplateService';
import { fetchWithProxy } from './proxyService';
import { updateCalendarData } from './calendarService';
import { parseAIJsonResponse } from '../utils/jsonParseUtils';
import { withRetry, isJsonTruncationError } from '../utils/retryUtils';

interface CalendarAIResponse {
  date?: string;
  content?: string;
  description?: string;
  market?: string;
}

export interface CalendarEventInput {
  date: string;
  content: string;
  description: string;
  market?: string;
}

/**
 * 解析日历AI响应
 * 使用 jsonParseUtils 统一处理 JSON 解析
 * calendar 服务需要额外的格式修复（注释移除、属性名修复等）
 */
export function parseCalendarAIResponse(response: string, logPrefix: string = 'Calendar'): CalendarEventInput[] {
  const parsed = parseAIJsonResponse(response, {
    logPrefix,
    errorContext: '日历AI响应',
    removeComments: true,
    fixUnquotedProps: true,
    fixUnquotedValues: true,
    valuePropsToFix: ['market', 'content', 'description', 'date'],
  });

  // 过滤并转换有效项
  const results = (parsed as CalendarAIResponse[]).filter((item) =>
    item.date && item.content
  ).map((item) => ({
    market: typeof item.market === 'string' ? item.market : '',
    date: String(item.date),
    content: typeof item.content === 'string' ? item.content : '',
    description: typeof item.description === 'string' ? item.description : '',
  }));

  // 检查是否有有效结果
  if (results.length === 0) {
    throw new Error('解析日历AI响应失败: 没有有效的日历事件数据');
  }

  return results;
}

/**
 * 从网站获取内容（通过统一代理服务抓取）
 */
export async function fetchWebContent(url: string, logPrefix: string): Promise<string> {
  try {
    const { content } = await fetchWithProxy(url);
    return content;
  } catch (e) {
    throw new Error(`无法获取网站内容: ${url}，任务失败`);
  }
}

/**
 * 处理Calendar节假日AI请求（带自动重试）
 */
export async function processCalendarHoliday(
  promptType: string,
  url: string,
  logPrefix: string,
  calendarType: HolidayType,
  maxRetries: number = 2
): Promise<void> {
  const aiConfig = getAIConfig();
  if (!aiConfig || !aiConfig.apiKey) {
    throw new Error('未配置 AI API Key');
  }

  // 获取网站内容
  const webContent = await fetchWebContent(url, logPrefix);

  // 检查内容是否包含年份（基本验证）
  const currentYear = new Date().getFullYear().toString();
  if (!webContent.includes(currentYear) && !webContent.includes(String(parseInt(currentYear) + 1))) {
    console.warn(`[Calendar] ${logPrefix}网站内容可能不包含有效年份信息`);
  }

  // 获取提示词模板
  const prompt = getById(promptType);
  if (!prompt) {
    throw new Error(`未找到 ${promptType} 提示词模板`);
  }

  // 使用 queryAIWithTemplate 统一处理模板和联网搜索
  const current_date = formatDateDisplay(new Date());
  const current_year = new Date().getFullYear().toString();

  // 使用 withRetry 统一处理重试逻辑
  await withRetry(
    async () => {
      const response: AIResponse = await queryAIWithTemplate(aiConfig, prompt, {
        web_content: webContent,
        current_date,
        year: current_year
      });

      if (!response.success) {
        throw new Error(response.error || 'AI 请求失败');
      }

      // 解析响应
      const results = parseCalendarAIResponse(response.content, logPrefix);

      // 更新 calendar 数据
      updateCalendarData(calendarType, results);
    },
    {
      maxRetries,
      isRetryable: (error) => {
        // calendar 服务的截断检测略有不同
        const msg = error.message;
        return msg.includes('JSON解析错误') || msg.includes('末尾未正确闭合');
      },
      operationName: logPrefix,
      onRetry: (attempt) => {
        console.warn(`[${logPrefix}] 第 ${attempt} 次尝试失败（JSON截断），将重试...`);
      },
    }
  );
}