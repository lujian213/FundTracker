import { Ticker, RecommendedStrategy } from '../types';
import { queryAI, AIResponse } from './aiService';
import { getAIConfig } from './aiConfigService';
import { getAvailableStrategiesInfo } from './strategyRegistry';
import { formatDateDisplay } from '../utils/dateFormat';
import { loadBackgroundJobPrompts } from './backgroundJobService';

export interface StrategyRecommendationResult {
  code: string;
  strategy_id: string | null;
  reason: string | null;
}

/**
 * 格式化策略列表为提示词变量
 */
export function formatStrategyListForPrompt(): string {
  const strategies = getAvailableStrategiesInfo();
  return strategies.map(s =>
    `${s.key} - ${s.name}\n  描述：${s.description}`
  ).join('\n\n');
}

/**
 * 获取策略 key 列表（用于 AI 校验）
 */
export function getStrategyKeysForPrompt(): string {
  const strategies = getAvailableStrategiesInfo();
  return strategies.map(s => s.key).join(', ');
}

/**
 * 解析策略推荐 AI 响应
 */
export function parseStrategyRecommendationResponse(response: string): StrategyRecommendationResult[] {
  try {
    // 移除可能的 markdown 代码块标记
    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith('```')) {
      const firstNewline = cleanedResponse.indexOf('\n');
      if (firstNewline !== -1) {
        cleanedResponse = cleanedResponse.slice(firstNewline + 1);
      }
      if (cleanedResponse.endsWith('```')) {
        cleanedResponse = cleanedResponse.slice(0, -3).trim();
      }
    }

    const parsed = JSON.parse(cleanedResponse);
    if (!Array.isArray(parsed)) {
      console.warn('[StrategyRecommendation] AI response is not an array');
      return [];
    }

    return parsed.map((item: any) => ({
      code: typeof item.code === 'string' ? item.code : String(item.code ?? ''),
      strategy_id: typeof item.strategy_id === 'string' ? item.strategy_id : null,
      reason: typeof item.reason === 'string' ? item.reason : null
    }));
  } catch (e) {
    console.error('[StrategyRecommendation] Failed to parse AI response:', e);
    return [];
  }
}

/**
 * 更新 portfolio 中指定基金的推荐策略
 */
export function updateTickerRecommendedStrategy(
  portfolio: Ticker[],
  symbol: string,
  strategyId: string | null,
  reason: string | null
): Ticker[] {
  return portfolio.map(ticker => {
    if (ticker.symbol !== symbol) return ticker;

    if (strategyId !== null && strategyId !== undefined &&
        reason !== null && reason !== undefined) {
      return {
        ...ticker,
        recommended_strategy: {
          strategy_id: strategyId,
          reason: reason
        } as RecommendedStrategy
      };
    } else {
      // 清空推荐策略
      const { recommended_strategy, ...rest } = ticker;
      return rest;
    }
  });
}

/**
 * 刷新策略推荐
 * @param getPortfolio 获取当前 portfolio 的函数
 * @param onPortfolioUpdate 更新 portfolio 的回调
 */
export async function refreshStrategyRecommendations(
  getPortfolio: () => Ticker[],
  onPortfolioUpdate: (newPortfolio: Ticker[]) => void
): Promise<void> {
  const aiConfig = getAIConfig();
  if (!aiConfig || !aiConfig.apiKey) {
    throw new Error('未配置 AI API Key');
  }

  // 加载提示词模板
  const prompts = await loadBackgroundJobPrompts();
  const prompt = prompts.find(p => p.type === 'strategy');
  if (!prompt) {
    throw new Error('未找到策略推荐的提示词模板');
  }

  // 获取当前 portfolio
  const portfolio = getPortfolio();

  // 格式化基金列表
  const codeList = portfolio
    .map(t => t.name ? `${t.symbol} ${t.name}` : t.symbol)
    .join('\n');

  // 填充变量
  const current_date = formatDateDisplay(new Date());
  const filledPrompt = prompt.template
    .replace(/{current_date}/g, current_date)
    .replace('{code_list}', codeList)
    .replace('{strategy_list}', formatStrategyListForPrompt())
    .replace('{strategy_keys}', getStrategyKeysForPrompt());

  console.log(`[StrategyRecommendation] Starting refresh for ${portfolio.length} funds`);

  // 调用 AI
  const response: AIResponse = await queryAI(aiConfig, filledPrompt);
  if (!response.success) {
    throw new Error(response.error || 'AI 请求失败');
  }

  // 解析响应
  const results = parseStrategyRecommendationResponse(response.content);

  // 再次获取最新的 portfolio
  const latestPortfolio = getPortfolio();

  // 更新 portfolio
  let updatedPortfolio = [...latestPortfolio];
  for (const result of results) {
    updatedPortfolio = updateTickerRecommendedStrategy(
      updatedPortfolio,
      result.code,
      result.strategy_id,
      result.reason
    );
  }

  onPortfolioUpdate(updatedPortfolio);
  console.log(`[StrategyRecommendation] Refresh completed, updated ${results.length} funds`);
}