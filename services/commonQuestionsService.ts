// services/commonQuestionsService.ts

import { AIQueryContext, fillTemplateVariables } from './aiService';
import { CommonQuestion, CommonQuestionsConfig } from '../types/commonQuestionsTypes';

// 缓存变量
let cachedQuestions: CommonQuestion[] | null = null;
let cacheTimestamp: number | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

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
export async function loadCommonQuestions(): Promise<CommonQuestion[]> {
  try {
    const response = await fetch('./assets/config/ai-common-questions.json', { cache: 'no-store' });

    if (!response.ok) {
      console.warn(`加载常用问题配置失败: HTTP ${response.status}`);
      return [];
    }

    const data = await response.json();
    const questions = validateQuestions(data);

    // 只返回启用的问题（enabled 为 true 或 undefined）
    return questions.filter(q => q.enabled === undefined || q.enabled === true);
  } catch (error) {
    console.warn('加载常用问题配置失败:', error);
    return [];
  }
}

/**
 * 获取常用问题（带缓存）
 */
export async function getCommonQuestions(): Promise<CommonQuestion[]> {
  const now = Date.now();

  // 如果缓存存在且未过期，返回缓存
  if (cachedQuestions && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedQuestions;
  }

  // 加载并缓存
  cachedQuestions = await loadCommonQuestions();
  cacheTimestamp = now;

  return cachedQuestions;
}

/**
 * 替换模板变量
 * 复用 aiService 中的 fillTemplateVariables 函数
 */
export function applyTemplateVariables(
  template: string,
  context: AIQueryContext
): string {
  return fillTemplateVariables(template, context);
}

/**
 * 刷新缓存
 */
export async function refreshCommonQuestionsCache(): Promise<CommonQuestion[]> {
  cachedQuestions = await loadCommonQuestions();
  cacheTimestamp = Date.now();
  return cachedQuestions;
}