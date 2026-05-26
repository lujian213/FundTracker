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
 * 如果解析失败或结果无效，抛出异常而不是返回空数组
 * 这样可以防止原有数据被错误清空
 */
export function parseCalendarAIResponse(response: string, logPrefix: string = 'Calendar'): CalendarEventInput[] {
  let cleanedResponse = response.trim();

  // 检查空响应
  if (!cleanedResponse) {
    throw new Error('解析日历AI响应失败: 响应为空');
  }

  // 尝试从代码块中提取JSON（新格式：AI输出包含思考过程 + ```json ... ```代码块）
  const codeBlockMatch = cleanedResponse.match(/```json\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    cleanedResponse = codeBlockMatch[1].trim();
  } else if (cleanedResponse.startsWith('```')) {
    // 旧格式：从开头开始
    const firstNewline = cleanedResponse.indexOf('\n');
    if (firstNewline !== -1) {
      cleanedResponse = cleanedResponse.slice(firstNewline + 1);
    }
    if (cleanedResponse.endsWith('```')) {
      cleanedResponse = cleanedResponse.slice(0, -3).trim();
    }
  }

  // 尝试修复常见的 JSON 格式错误：

  // 1. 移除 JavaScript 风格的注释（单行和多行）
  cleanedResponse = cleanedResponse.replace(/\/\/[^\n\r]*$/gm, '');  // 单行注释
  cleanedResponse = cleanedResponse.replace(/\/\*[\s\S]*?\*\//g, '');  // 多行注释

  // 2. 移除尾随逗号（对象和数组中的）
  cleanedResponse = cleanedResponse.replace(/,(\s*[}\]])/g, '$1');

  // 3. 修复属性名缺少引号（如 market: "美股" -> "market": "美股"）
  // 匹配格式：identifier: value，其中 identifier 不是已有引号的字符串
  cleanedResponse = cleanedResponse.replace(
    /([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g,
    (match, prefix, propName, colon) => {
      // 如果属性名已经被引号包裹，不处理
      if (prefix.endsWith('"') || prefix.endsWith("'")) {
        return match;
      }
      return `${prefix}"${propName}"${colon}`;
    }
  );

  // 4. 修复字符串值缺少引号（如 "description":香港 -> "description":"香港"）
  cleanedResponse = cleanedResponse.replace(
    /"(?:market|content|description|date)":([^,\[\]{}\n\r]+)([,}\]\n\r])/g,
    (match, value, suffix) => {
      // 如果值已经被引号包裹，不处理
      if (value.trim().startsWith('"') || value.trim().startsWith("'")) {
        return match;
      }
      // 将未加引号的值加上引号
      return match.replace(value, `"${value.trim()}"`);
    }
  );

  // 5. 移除多余的空白和换行（保持JSON结构）
  cleanedResponse = cleanedResponse.trim();

  // 解析JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanedResponse);
  } catch (e) {
    // 记录详细错误信息，帮助诊断截断或格式问题
    const errorMsg = (e as Error).message;
    const responseEnd = cleanedResponse.slice(-100);
    console.error(`[${logPrefix}] JSON解析失败，错误: ${errorMsg}`);
    console.error(`[${logPrefix}] 响应末尾100字符: ...${responseEnd}`);
    console.error(`[${logPrefix}] 响应总长度: ${cleanedResponse.length}字符`);

    // 检查是否可能是截断（末尾不完整）
    if (!cleanedResponse.endsWith(']') && !cleanedResponse.endsWith('}')) {
      console.error(`[${logPrefix}] 可能是截断问题：JSON末尾未正确闭合`);
    }

    throw new Error(`解析日历AI响应失败: JSON解析错误 - ${errorMsg}`);
  }

  // 检查是否为数组
  if (!Array.isArray(parsed)) {
    throw new Error('解析日历AI响应失败: AI返回的不是数组格式');
  }

  // 过滤并转换有效项
  const results = parsed.filter((item: CalendarAIResponse) =>
    item.date && item.content
  ).map((item: CalendarAIResponse) => ({
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
 * 处理Calendar节假日AI请求
 */
export async function processCalendarHoliday(
  promptType: string,
  url: string,
  logPrefix: string,
  calendarType: HolidayType
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
  const response: AIResponse = await queryAIWithTemplate(aiConfig, prompt, {
    web_content: webContent,
    current_date,
    year: current_year
  });

  if (!response.success) {
    throw new Error(response.error || 'AI 请求失败');
  }

  // 解析响应 - 现在解析失败会抛出异常，不会返回空数组
  const results = parseCalendarAIResponse(response.content, logPrefix);

  // 更新 calendar 数据
  updateCalendarData(calendarType, results);
}