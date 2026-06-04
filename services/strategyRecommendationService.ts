import { Ticker, RecommendedStrategy } from '../types';
import { queryAIWithTemplate, AIResponse } from './aiService';
import { getAIConfig } from './aiConfigService';
import { getAvailableStrategiesInfo } from './strategyRegistry';
import { formatDateDisplay } from '../utils/dateFormat';
import { getById, TEMPLATE_IDS } from './promptTemplateService';
import * as marketFundService from './marketFundService';
import { parseAIJsonResponse } from '../utils/jsonParseUtils';
import { withRetry, isJsonTruncationError } from '../utils/retryUtils';

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
 * 使用 jsonParseUtils 统一处理 JSON 解析
 */
export function parseStrategyRecommendationResponse(response: string): StrategyRecommendationResult[] {
  const parsed = parseAIJsonResponse(response, {
    logPrefix: 'StrategyRecommendation',
    errorContext: '策略推荐响应',
  });

  return (parsed as any[]).map((item) => ({
    code: typeof item.code === 'string' ? item.code : String(item.code ?? ''),
    strategy_id: typeof item.strategy_id === 'string' ? item.strategy_id : null,
    reason: typeof item.reason === 'string' ? item.reason : null
  }));
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
 * 刷新策略推荐（带自动重试）
 * @param getPortfolio 获取当前 portfolio 的函数
 * @param onPortfolioUpdate 更新 portfolio 的回调
 * @param maxRetries 最大重试次数（默认2次）
 */
export async function refreshStrategyRecommendations(
  getPortfolio: () => Ticker[],
  onPortfolioUpdate: (newPortfolio: Ticker[]) => void,
  maxRetries: number = 2
): Promise<void> {
  const aiConfig = getAIConfig();
  if (!aiConfig || !aiConfig.apiKey) {
    throw new Error('未配置 AI API Key');
  }

  // 获取提示词模板
  const prompt = getById(TEMPLATE_IDS.BG_STRATEGY);
  if (!prompt) {
    throw new Error('未找到策略推荐的提示词模板');
  }

  // 获取当前 portfolio
  const portfolio = getPortfolio();

  // 格式化基金列表
  const codeList = portfolio
    .map(t => t.name ? `${t.symbol} ${t.name}` : t.symbol)
    .join('\n');

  // 使用 queryAIWithTemplate 统一处理模板和联网搜索
  const current_date = formatDateDisplay(new Date());

  // 格式化策略列表（在重试循环外预先计算）
  const strategyList = formatStrategyListForPrompt();
  const strategyKeys = getStrategyKeysForPrompt();

  // 使用 withRetry 统一处理重试逻辑
  await withRetry(
    async () => {
      const response: AIResponse = await queryAIWithTemplate(aiConfig, prompt, {
        current_date,
        code_list: codeList,
        strategy_list: strategyList,
        strategy_keys: strategyKeys
      });

      if (!response.success) {
        throw new Error(response.error || 'AI 请求失败');
      }

      // 解析响应
      const results = parseStrategyRecommendationResponse(response.content);

      // 检查是否有有效结果
      if (results.length === 0 && portfolio.length > 0) {
        throw new Error('解析策略推荐响应失败: 没有有效的策略推荐数据');
      }

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

        // 持久化更新到 marketFundService
        if (result.strategy_id && result.reason) {
          marketFundService.updateTicker(result.code, {
            recommended_strategy: {
              strategy_id: result.strategy_id,
              reason: result.reason,
            },
          });
        } else {
          // 清空推荐策略
          marketFundService.updateTicker(result.code, {
            recommended_strategy: undefined,
          } as any);
        }
      }

      onPortfolioUpdate(updatedPortfolio);
    },
    {
      maxRetries,
      isRetryable: isJsonTruncationError,
      operationName: 'StrategyRecommendation',
      onRetry: (attempt) => {
        console.warn(`[StrategyRecommendation] 第 ${attempt} 次尝试失败（JSON问题），将重试...`);
      },
    }
  );
}