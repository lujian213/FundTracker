// services/promptTemplateService.ts

import { FundAIQueryContext, IndexAIQueryContext } from '../types/aiServiceTypes';
import { PromptTemplate } from '../types/promptTemplateTypes';

// Re-export PromptTemplate for convenience
export type { PromptTemplate } from '../types/promptTemplateTypes';

/** 模板ID常量（按id查询时使用） */
export const TEMPLATE_IDS = {
  // 基金分析
  FUND_ANALYSIS: 'fund-analysis',
  INDEX_ANALYSIS: 'index-analysis',

  // 投资计划
  INVESTMENT_DRAFT_ANALYSIS: 'investment-draft-analysis',
  AI_INVESTMENT_ADVICE: 'ai-investment-advice',
  AI_INVESTMENT_ADVICE_SCORE: 'ai-investment-advice-score',
  AI_INVESTMENT_ADVICE_REFINE: 'ai-investment-advice-refine',

  // 投资组合
  PORTFOLIO_ANALYSIS: 'portfolio-analysis',
  PORTFOLIO_RISK: 'portfolio-risk',

  // 后台任务
  BG_HOLIDAY: 'bg-holiday',
  BG_DELIVERY: 'bg-delivery',
  BG_STRATEGY: 'bg-strategy',
  BG_CALENDAR_HOLIDAY_CHINA: 'bg-calendar-holiday-china',
  BG_CALENDAR_HOLIDAY_HK: 'bg-calendar-holiday-hk',
  BG_CALENDAR_HOLIDAY_US: 'bg-calendar-holiday-us',
  BG_CALENDAR_HOLIDAY_SG: 'bg-calendar-holiday-sg',
  BG_CALENDAR_DELIVERY: 'bg-calendar-delivery',
} as const;

/** 模板TYPE常量（按type查询时使用） */
export const TEMPLATE_TYPES = {
  FUND_COMMON_QUESTION: 'fund-common-question',
  INDEX_COMMON_QUESTION: 'index-common-question',
} as const;

interface PromptTemplateGroup {
  id: string;
  name: string;
  description: string;
  templates: Array<{ enabled: boolean; template: string; enableWebSearch?: boolean; webSearchHint?: string }>;
}

interface TemplateConfigFile {
  templates?: PromptTemplate[];
  id?: string;
  name?: string;
  description?: string;
}

const templateCache = new Map<string, PromptTemplate>();
let loaded = false;

/** 加载所有模板配置文件（页面初始化时调用一次） */
export async function loadAllTemplates(): Promise<void> {
  if (loaded) return;

  const configFiles = [
    './assets/config/ai-fund-prompt-templates.json',
    './assets/config/ai-index-prompt-templates.json',
    './assets/config/ai-fund-common-questions.json',
    './assets/config/ai-index-common-questions.json',
    './assets/config/ai-investment-draft-templates.json',
    './assets/config/ai-portfolio-analysis-templates.json',
    './assets/config/background-job-prompts.json',
  ];

  await Promise.all(configFiles.map(path => loadConfigFile(path)));

  loaded = true;
}

/** 加载单个配置文件并解析 */
async function loadConfigFile(path: string): Promise<void> {
  try {
    const response = await fetch(path);
    const data: TemplateConfigFile = await response.json();

    // 判断是否为 PromptTemplateGroup 格式（fund/index prompt）
    if (data.id && Array.isArray((data as any).templates)) {
      const group = data as unknown as PromptTemplateGroup;
      const enabledTemplate = group.templates.find(t => t.enabled);
      if (enabledTemplate) {
        templateCache.set(group.id, {
          id: group.id,
          name: group.name,
          template: enabledTemplate.template,
          description: group.description,
          enabled: true,
          enableWebSearch: enabledTemplate.enableWebSearch,
          webSearchHint: enabledTemplate.webSearchHint,
        });
      }
    }
    // 标准 PromptTemplate 数组格式
    else if (data.templates && Array.isArray(data.templates)) {
      for (const t of data.templates) {
        if (t.enabled === undefined || t.enabled === true) {
          templateCache.set(t.id, { ...t, enabled: true });
        }
      }
    }
  } catch (e) {
    console.warn(`Failed to load template config: ${path}`, e);
  }
}

/** 按ID查询模板 */
export function getById(id: string): PromptTemplate | null {
  return templateCache.get(id) || null;
}

/** 按TYPE查询模板列表 */
export function getByType(type: string): PromptTemplate[] {
  const result: PromptTemplate[] = [];
  templateCache.forEach(t => {
    if (t.type === type) result.push(t);
  });
  return result;
}

/** 重置缓存（仅用于测试） */
export function resetCache(): void {
  templateCache.clear();
  loaded = false;
}

/** 通用变量填充 */
export function fillTemplate(
  template: string,
  variables: Record<string, string | number | object | undefined | null>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{${key}}`;
    const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    if (value === undefined || value === null) {
      result = result.replace(regex, '未设置');
    } else if (typeof value === 'object') {
      result = result.replace(regex, JSON.stringify(value));
    } else {
      result = result.replace(regex, String(value));
    }
  }
  return result;
}

/**
 * 填充基金模板变量
 * 从模板字符串中替换基金相关的变量占位符
 */
export function fillFundTemplateVariables(template: string, context: FundAIQueryContext): string {
  const variables: Record<string, string | number | object | undefined | null> = {
    name: context.fundName,
    code: context.fundSymbol,
    // 空数组显示"[]"，而不是"未设置"
    history: context.tradeHistory && context.tradeHistory.length > 0 ? context.tradeHistory : [],
    // 值为 0 时显示"未设置"
    fullCapacity: context.fullCapacity !== undefined && context.fullCapacity > 0 ? context.fullCapacity : undefined,
    initialCapacity: context.initialCapacity !== undefined && context.initialCapacity > 0 ? context.initialCapacity : undefined,
    initialDate: context.initialDate || undefined,
    initialPrice: context.initialPrice,
  };

  if (context.valuationData) {
    variables.currentPrice = context.valuationData.currentPrice !== undefined && context.valuationData.currentPrice !== null
      ? context.valuationData.currentPrice.toFixed(4)
      : undefined;
    variables.currentDate = context.valuationData.realtimeDate || undefined;
    variables.previousPrice = context.valuationData.previousPrice !== undefined && context.valuationData.previousPrice !== null
      ? context.valuationData.previousPrice.toFixed(4)
      : undefined;
    variables.previousDate = context.valuationData.netWorthDate || undefined;

    // 涨跌幅格式化带正负号
    if (context.valuationData.changePercentage !== undefined && context.valuationData.changePercentage !== null) {
      const rate = context.valuationData.changePercentage;
      variables.rate = `${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%`;
    } else {
      variables.rate = undefined;
    }
  } else {
    variables.currentPrice = undefined;
    variables.currentDate = undefined;
    variables.previousPrice = undefined;
    variables.previousDate = undefined;
    variables.rate = undefined;
  }

  variables.marketValue = context.marketValue !== undefined && context.marketValue !== null
    ? context.marketValue.toFixed(2)
    : undefined;
  variables.position = context.position !== undefined && context.position !== null
    ? context.position.toFixed(2)
    : undefined;
  variables.positionRate = context.positionRate !== undefined && context.positionRate !== null
    ? `${context.positionRate.toFixed(2)}%`
    : undefined;

  // 盈利格式化带正负号
  if (context.profit !== undefined && context.profit !== null) {
    const profit = context.profit;
    variables.profit = `${profit >= 0 ? '+' : ''}${profit.toFixed(2)}`;
  } else {
    variables.profit = undefined;
  }

  variables.avgCostPrice = context.avgCostPrice !== undefined && context.avgCostPrice !== null
    ? context.avgCostPrice.toFixed(4)
    : undefined;

  return fillTemplate(template, variables);
}

/**
 * 填充指数模板变量
 * 从模板字符串中替换指数相关的变量占位符
 */
export function fillIndexTemplateVariables(template: string, context: IndexAIQueryContext): string {
  const variables: Record<string, string | number | object | undefined | null> = {
    name: context.indexName,
    code: context.indexSymbol,
    datetime: context.datetime,
    // 空数组显示"[]"
    closing_prices: context.closingPrices && context.closingPrices.length > 0 ? context.closingPrices : [],
    ma5: context.ma5 && context.ma5.length > 0 ? context.ma5 : [],
    ma10: context.ma10 && context.ma10.length > 0 ? context.ma10 : [],
    ma20: context.ma20 && context.ma20.length > 0 ? context.ma20 : [],
    volumes: context.volumes && context.volumes.length > 0 ? context.volumes : [],
    realtime_prices: context.realtimePrices && context.realtimePrices.length > 0 ? context.realtimePrices : [],
    realtime_volume: context.realtimeVolume,
  };

  return fillTemplate(template, variables);
}

/** 统一入口：根据 marketType 选择填充函数 */
export function fillTemplateVariables(
  template: string,
  context: FundAIQueryContext | IndexAIQueryContext
): string {
  if (context.marketType === 'fund') {
    return fillFundTemplateVariables(template, context);
  } else {
    return fillIndexTemplateVariables(template, context);
  }
}