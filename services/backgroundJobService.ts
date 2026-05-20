import { Ticker, TickerAlert } from '../types';
import { queryAI, AIResponse } from './aiService';
import { getAIConfig } from './aiConfigService';
import { formatDateDisplay } from '../utils/dateFormat';
import { getById, TEMPLATE_IDS, PromptTemplate } from './promptTemplateService';

export interface BackgroundJobPrompt {
  id: string;
  name: string;
  type: 'holiday' | 'delivery' | 'strategy' | 'calendar_holiday_china' | 'calendar_holiday_hk' | 'calendar_holiday_us' | 'calendar_holiday_sg' | 'calendar_delivery';
  template: string;
  maxTokens?: number;
  temperature?: number;
  enableWebSearch?: boolean;
}

/** 旧 type 到新 id 的映射 */
const TYPE_TO_ID_MAP: Record<string, string> = {
  'holiday': TEMPLATE_IDS.BG_HOLIDAY,
  'delivery': TEMPLATE_IDS.BG_DELIVERY,
  'strategy': TEMPLATE_IDS.BG_STRATEGY,
  'calendar_holiday_china': TEMPLATE_IDS.BG_CALENDAR_HOLIDAY_CHINA,
  'calendar_holiday_hk': TEMPLATE_IDS.BG_CALENDAR_HOLIDAY_HK,
  'calendar_holiday_us': TEMPLATE_IDS.BG_CALENDAR_HOLIDAY_US,
  'calendar_holiday_sg': TEMPLATE_IDS.BG_CALENDAR_HOLIDAY_SG,
  'calendar_delivery': TEMPLATE_IDS.BG_CALENDAR_DELIVERY,
};

/** 新 id 到旧 type 的映射 */
const ID_TO_TYPE_MAP: Record<string, BackgroundJobPrompt['type']> = {
  [TEMPLATE_IDS.BG_HOLIDAY]: 'holiday',
  [TEMPLATE_IDS.BG_DELIVERY]: 'delivery',
  [TEMPLATE_IDS.BG_STRATEGY]: 'strategy',
  [TEMPLATE_IDS.BG_CALENDAR_HOLIDAY_CHINA]: 'calendar_holiday_china',
  [TEMPLATE_IDS.BG_CALENDAR_HOLIDAY_HK]: 'calendar_holiday_hk',
  [TEMPLATE_IDS.BG_CALENDAR_HOLIDAY_US]: 'calendar_holiday_us',
  [TEMPLATE_IDS.BG_CALENDAR_HOLIDAY_SG]: 'calendar_holiday_sg',
  [TEMPLATE_IDS.BG_CALENDAR_DELIVERY]: 'calendar_delivery',
};

/**
 * 根据旧 type 获取后台任务模板
 */
export function getBackgroundJobPromptByType(type: BackgroundJobPrompt['type']): BackgroundJobPrompt | null {
  const id = TYPE_TO_ID_MAP[type];
  if (!id) return null;

  const template = getById(id);
  if (!template) return null;

  return {
    id: template.id,
    name: template.name,
    type: ID_TO_TYPE_MAP[template.id] || type,
    template: template.template,
    maxTokens: template.maxTokens,
    temperature: template.temperature,
    enableWebSearch: template.enableWebSearch,
  };
}

/**
 * 获取所有后台任务模板
 * @deprecated 使用 getBackgroundJobPromptByType 按类型获取
 */
export function loadBackgroundJobPrompts(): BackgroundJobPrompt[] {
  const types: BackgroundJobPrompt['type'][] = [
    'holiday', 'delivery', 'strategy',
    'calendar_holiday_china', 'calendar_holiday_hk', 'calendar_holiday_us', 'calendar_holiday_sg',
    'calendar_delivery'
  ];

  const result: BackgroundJobPrompt[] = [];
  for (const type of types) {
    const prompt = getBackgroundJobPromptByType(type);
    if (prompt) {
      result.push(prompt);
    }
  }
  return result;
}

export interface BackgroundJobResult {
  code: string;
  date: string | null;
  content: string | null;
}

/**
 * 格式化基金列表为提示词变量
 * 格式: "{symbol} {name}"，每行一个
 */
export function formatCodeList(portfolio: Ticker[]): string {
  return portfolio
    .map(t => t.name ? `${t.symbol} ${t.name}` : t.symbol)
    .join('\n');
}

/**
 * AI 响应项的类型定义
 */
interface AIResponseItem {
  code?: unknown;
  holiday_date_start?: unknown;
  holiday_date_end?: unknown;
  holiday_name?: unknown;
  delivery_date?: unknown;
  explanation?: unknown;
}

/**
 * 解析 AI 响应为结构化结果
 */
export function parseAIResponse(response: string, type: 'holiday' | 'delivery'): BackgroundJobResult[] {
  try {
    // 移除可能的 markdown 代码块标记（如 ```json ... ```）
    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith('```')) {
      // 移除开头的 ```json 或 ```
      const firstNewline = cleanedResponse.indexOf('\n');
      if (firstNewline !== -1) {
        cleanedResponse = cleanedResponse.slice(firstNewline + 1);
      }
      // 移除结尾的 ```
      if (cleanedResponse.endsWith('```')) {
        cleanedResponse = cleanedResponse.slice(0, -3).trim();
      }
    }

    const parsed = JSON.parse(cleanedResponse);
    if (!Array.isArray(parsed)) {
      console.warn('[BackgroundJob] AI response is not an array');
      return [];
    }

    return parsed.map((item: AIResponseItem) => {
      const code = typeof item.code === 'string' ? item.code : String(item.code ?? '');
      if (type === 'holiday') {
        return {
          code,
          date: typeof item.holiday_date_start === 'string' ? item.holiday_date_start : null,
          content: typeof item.explanation === 'string' ? item.explanation : null
        };
      } else {
        return {
          code,
          date: typeof item.delivery_date === 'string' ? item.delivery_date : null,
          content: typeof item.explanation === 'string' ? item.explanation : null
        };
      }
    });
  } catch (e) {
    console.error('[BackgroundJob] Failed to parse AI response:', e);
    return [];
  }
}

/**
 * 从多条记录中选择每个基金日期最近的一条
 * AI 可能针对同一基金返回多条记录（如不同市场的节假日），但 alert_list 每个 type 只保留一条
 */
function selectNearestAlert(results: BackgroundJobResult[]): BackgroundJobResult[] {
  const grouped = new Map<string, BackgroundJobResult>();
  for (const result of results) {
    const existing = grouped.get(result.code);
    // 日期字符串格式为 yyyy/MM/dd，可直接字符串比较（越早的日期越小）
    if (!existing || (result.date && (!existing.date || result.date < existing.date))) {
      grouped.set(result.code, result);
    }
  }
  return Array.from(grouped.values());
}

/**
 * 更新单个 Ticker 的 alert_list
 * 返回新的 portfolio 引用（用于 React 状态更新）
 */
export function updateTickerAlerts(
  portfolio: Ticker[],
  symbol: string,
  type: 'holiday' | 'delivery',
  date: string | null,
  content: string | null
): Ticker[] {
  return portfolio.map(ticker => {
    if (ticker.symbol !== symbol) return ticker;

    const currentAlerts = ticker.alert_list || [];
    const existingIndex = currentAlerts.findIndex(a => a.type === type);

    let newAlerts: TickerAlert[];

    // 使用显式的 null/undefined 检查，避免空字符串被当作 falsy 值处理
    if (date !== null && date !== undefined && content !== null && content !== undefined) {
      // 更新或新增
      const newAlert: TickerAlert = { type, date, content };
      if (existingIndex >= 0) {
        newAlerts = [...currentAlerts];
        newAlerts[existingIndex] = newAlert;
      } else {
        newAlerts = [...currentAlerts, newAlert];
      }
    } else {
      // 删除
      if (existingIndex >= 0) {
        newAlerts = currentAlerts.filter((_, i) => i !== existingIndex);
      } else {
        newAlerts = currentAlerts;
      }
    }

    return { ...ticker, alert_list: newAlerts };
  });
}

/**
 * 刷新指定类型的提示信息
 * @param type 信息类型
 * @param getPortfolio 获取当前 portfolio 的函数（支持函数式更新，避免竞争条件）
 * @param onPortfolioUpdate 更新 portfolio 的回调（用于触发 React 重渲染）
 * @returns Promise<void>
 */
export async function refreshTickerAlerts(
  type: 'holiday' | 'delivery',
  getPortfolio: () => Ticker[],
  onPortfolioUpdate: (newPortfolio: Ticker[]) => void
): Promise<void> {
  const aiConfig = getAIConfig();
  if (!aiConfig || !aiConfig.apiKey) {
    throw new Error('未配置 AI API Key');
  }

  // 获取提示词模板
  const prompt = getBackgroundJobPromptByType(type);
  if (!prompt) {
    throw new Error(`未找到类型为 ${type} 的提示词模板`);
  }

  // 获取当前 portfolio（用于生成代码列表）
  const portfolio = getPortfolio();

  // 填充变量
  const codeList = formatCodeList(portfolio);
  const current_date = formatDateDisplay(new Date());

  const filledPrompt = prompt.template
    .replace(/{current_date}/g, current_date)
    .replace('{code_list}', codeList);

  const response: AIResponse = await queryAI(
    aiConfig,
    {
      messages: [{ role: 'user', content: filledPrompt }],
      enableWebSearch: prompt.enableWebSearch,
      maxTokens: prompt.maxTokens,
      temperature: prompt.temperature
    }
  );

  if (!response.success) {
    throw new Error(response.error || 'AI 请求失败');
  }

  // 解析响应
  const results = parseAIResponse(response.content, type);

  // 过滤掉无效结果（date 或 content 为 null/undefined），确保类型安全
  const validResults = results.filter(
    result => result.date !== null && result.date !== undefined &&
              result.content !== null && result.content !== undefined
  ) as Array<{ code: string; date: string; content: string }>;

  // 对于同一基金的多条记录，只保留日期最近的一条
  const uniqueResults = selectNearestAlert(validResults);

  // 再次获取最新的 portfolio（确保不覆盖其他任务的更新）
  const latestPortfolio = getPortfolio();

  // 更新 portfolio
  let updatedPortfolio = [...latestPortfolio];
  for (const result of uniqueResults) {
    updatedPortfolio = updateTickerAlerts(
      updatedPortfolio,
      result.code,
      type,
      result.date,
      result.content
    );
  }

  // 通过回调更新 React 状态
  onPortfolioUpdate(updatedPortfolio);
}