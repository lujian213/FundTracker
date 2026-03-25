// services/commonQuestionsService.ts

import { fillTemplateVariables } from './promptTemplateService';
import { FundAIQueryContext, IndexAIQueryContext, MarketType } from '../types/aiServiceTypes';
import { CommonQuestion, CommonQuestionsConfig } from '../types/commonQuestionsTypes';

// 缓存变量（按市场类型分离）
const cachedQuestions: Record<MarketType, CommonQuestion[] | null> = {
  fund: null,
  index: null
};
const cacheTimestamp: Record<MarketType, number | null> = {
  fund: null,
  index: null
};
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

// 配置文件路径映射
const CONFIG_PATHS: Record<MarketType, string> = {
  fund: './assets/config/ai-fund-common-questions.json',
  index: './assets/config/ai-index-common-questions.json'
};

/**
 * 校验配置数据格式
 */
export function validateQuestions(data: unknown): CommonQuestion[] {
  if (!data || typeof data !== 'object') {
    return [];
  }

  const config = data as CommonQuestionsConfig;

  if (!Array.isArray(config.questions)) {
    return [];
  }

  // 过滤有效的问题项
  return config.questions.filter((q): q is CommonQuestion => {
    return (
      typeof q === 'object' &&
      typeof q.id === 'string' &&
      typeof q.name === 'string' &&
      typeof q.template === 'string' &&
      (q.enabled === undefined || typeof q.enabled === 'boolean')
    );
  });
}

/**
 * 从配置文件加载常用问题
 */
export async function loadCommonQuestions(marketType: MarketType = 'fund'): Promise<CommonQuestion[]> {
  try {
    const configPath = CONFIG_PATHS[marketType];
    const response = await fetch(configPath, { cache: 'no-store' });

    if (!response.ok) {
      console.warn(`加载常用问题配置失败 (${marketType}): HTTP ${response.status}`);
      return [];
    }

    const data = await response.json();
    const questions = validateQuestions(data);

    // 只返回启用的问题（enabled 为 true 或 undefined）
    return questions.filter(q => q.enabled === undefined || q.enabled === true);
  } catch (error) {
    console.warn(`加载常用问题配置失败 (${marketType}):`, error);
    return [];
  }
}

/**
 * 获取常用问题（带缓存）
 */
export async function getCommonQuestions(marketType: MarketType = 'fund'): Promise<CommonQuestion[]> {
  const now = Date.now();

  // 如果缓存存在且未过期，返回缓存
  if (cachedQuestions[marketType] && cacheTimestamp[marketType] && (now - cacheTimestamp[marketType]!) < CACHE_DURATION) {
    return cachedQuestions[marketType]!;
  }

  // 加载并缓存
  cachedQuestions[marketType] = await loadCommonQuestions(marketType);
  cacheTimestamp[marketType] = now;

  return cachedQuestions[marketType]!;
}

/**
 * 替换模板变量
 */
export function applyTemplateVariables(
  template: string,
  context: FundAIQueryContext | IndexAIQueryContext
): string {
  return fillTemplateVariables(template, context);
}

/**
 * 刷新缓存
 */
export async function refreshCommonQuestionsCache(marketType?: MarketType): Promise<CommonQuestion[]> {
  if (marketType) {
    cachedQuestions[marketType] = await loadCommonQuestions(marketType);
    cacheTimestamp[marketType] = Date.now();
    return cachedQuestions[marketType]!;
  } else {
    // 刷新所有
    for (const mt of ['fund', 'index'] as MarketType[]) {
      cachedQuestions[mt] = await loadCommonQuestions(mt);
      cacheTimestamp[mt] = Date.now();
    }
    return cachedQuestions.fund!;
  }
}