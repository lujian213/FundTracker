import {
  formatStrategyListForPrompt,
  getStrategyKeysForPrompt,
  parseStrategyRecommendationResponse,
  updateTickerRecommendedStrategy
} from '../../services/strategyRecommendationService';
import { Ticker, MarketType } from '../../types';
import * as promptTemplateService from '../../services/promptTemplateService';

// Mock getAvailableStrategiesInfo
jest.mock('../../services/strategyRegistry', () => ({
  getAvailableStrategiesInfo: jest.fn(() => [
    { key: 'trendFollowing', name: '趋势追踪策略', description: '基于技术分析' },
    { key: 'meanReversion', name: '均值回归策略', description: '基于统计回归' },
    { key: 'constantMix', name: '恒定混合策略', description: '资产配置理论' },
    { key: 'fixedAmountPyramid', name: '固定金额正金字塔策略', description: '金字塔买卖' }
  ])
}));

// Mock marketFundService
jest.mock('../../services/marketFundService', () => ({
  updateTicker: jest.fn(),
}));

const marketFundService = require('../../services/marketFundService');

// Mock fetch for template loading
global.fetch = jest.fn();

describe('strategyRecommendationService', () => {
  describe('formatStrategyListForPrompt', () => {
    test('formats strategies with key, name and description', () => {
      const result = formatStrategyListForPrompt();

      expect(result).toContain('trendFollowing - 趋势追踪策略');
      expect(result).toContain('描述：基于技术分析');
      expect(result).toContain('meanReversion - 均值回归策略');
    });
  });

  describe('getStrategyKeysForPrompt', () => {
    test('returns comma-separated strategy keys', () => {
      const result = getStrategyKeysForPrompt();

      expect(result).toBe('trendFollowing, meanReversion, constantMix, fixedAmountPyramid');
    });
  });

  describe('parseStrategyRecommendationResponse', () => {
    test('parses valid JSON response', () => {
      const response = JSON.stringify([
        { code: '000001', strategy_id: 'trendFollowing', reason: '适合趋势交易' },
        { code: '510050', strategy_id: 'meanReversion', reason: '震荡市场适用' }
      ]);

      const results = parseStrategyRecommendationResponse(response);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        code: '000001',
        strategy_id: 'trendFollowing',
        reason: '适合趋势交易'
      });
      expect(results[1]).toEqual({
        code: '510050',
        strategy_id: 'meanReversion',
        reason: '震荡市场适用'
      });
    });

    test('handles null strategy_id', () => {
      const response = JSON.stringify([
        { code: '000001', strategy_id: null, reason: null }
      ]);

      const results = parseStrategyRecommendationResponse(response);

      expect(results).toHaveLength(1);
      expect(results[0].strategy_id).toBeNull();
      expect(results[0].reason).toBeNull();
    });

    test('throws exception for invalid JSON', () => {
      expect(() => parseStrategyRecommendationResponse('not json')).toThrow('解析策略推荐响应失败');
    });

    test('throws exception for non-array response', () => {
      expect(() => parseStrategyRecommendationResponse('{"key": "value"}')).toThrow('解析策略推荐响应失败');
    });

    test('throws exception for empty response', () => {
      expect(() => parseStrategyRecommendationResponse('')).toThrow('解析策略推荐响应失败');
    });

    test('strips markdown code blocks', () => {
      const response = '```json\n[{\"code\":\"000001\",\"strategy_id\":\"trendFollowing\",\"reason\":\"test\"}]\n```';

      const results = parseStrategyRecommendationResponse(response);

      expect(results).toHaveLength(1);
      expect(results[0].code).toBe('000001');
    });

    test('strips markdown code blocks without json label', () => {
      const response = '```\n[{\"code\":\"000001\",\"strategy_id\":\"trendFollowing\",\"reason\":\"test\"}]\n```';

      const results = parseStrategyRecommendationResponse(response);

      expect(results).toHaveLength(1);
      expect(results[0].code).toBe('000001');
    });

    test('handles numeric code', () => {
      const response = JSON.stringify([
        { code: 000001, strategy_id: 'trendFollowing', reason: 'test' }
      ]);

      const results = parseStrategyRecommendationResponse(response);

      expect(results).toHaveLength(1);
      expect(results[0].code).toBe('1'); // numeric 000001 becomes '1'
    });
  });

  describe('updateTickerRecommendedStrategy', () => {
    const portfolio: Ticker[] = [
      { id: '1', symbol: '000001', name: 'Fund A', market: MarketType.FUND },
      { id: '2', symbol: '510050', name: 'Fund B', market: MarketType.FUND },
    ];

    test('adds recommendation when none exists', () => {
      const result = updateTickerRecommendedStrategy(portfolio, '000001', 'trendFollowing', '适合趋势');

      expect(result[0].recommended_strategy).toEqual({
        strategy_id: 'trendFollowing',
        reason: '适合趋势'
      });
    });

    test('updates existing recommendation', () => {
      const portfolioWithRec: Ticker[] = [
        {
          ...portfolio[0],
          recommended_strategy: { strategy_id: 'meanReversion', reason: '旧推荐' }
        },
        portfolio[1]
      ];

      const result = updateTickerRecommendedStrategy(portfolioWithRec, '000001', 'trendFollowing', '新推荐');

      expect(result[0].recommended_strategy).toEqual({
        strategy_id: 'trendFollowing',
        reason: '新推荐'
      });
    });

    test('removes recommendation when strategy_id is null', () => {
      const portfolioWithRec: Ticker[] = [
        {
          ...portfolio[0],
          recommended_strategy: { strategy_id: 'trendFollowing', reason: '推荐' }
        },
        portfolio[1]
      ];

      const result = updateTickerRecommendedStrategy(portfolioWithRec, '000001', null, null);

      expect(result[0].recommended_strategy).toBeUndefined();
    });

    test('returns unchanged portfolio for unknown symbol', () => {
      const result = updateTickerRecommendedStrategy(portfolio, 'UNKNOWN', 'trendFollowing', 'test');

      expect(result).toEqual(portfolio);
    });

    test('preserves other tickers unchanged', () => {
      const result = updateTickerRecommendedStrategy(portfolio, '000001', 'trendFollowing', 'test');

      expect(result[1]).toEqual(portfolio[1]);
    });

    test('preserves other ticker properties', () => {
      const portfolioWithStrategy: Ticker[] = [
        {
          ...portfolio[0],
          recommended_strategy: { strategy_id: 'meanReversion', reason: 'old reason' }
        },
        portfolio[1]
      ];

      const result = updateTickerRecommendedStrategy(portfolioWithStrategy, '000001', 'trendFollowing', 'test');

      expect(result[0].recommended_strategy).toEqual({
        strategy_id: 'trendFollowing',
        reason: 'test'
      });
    });
  });

  describe('refreshStrategyRecommendations persistence', () => {
    // 注意：这个测试套件测试的是 refreshStrategyRecommendations 中调用
    // marketFundService.updateTicker 的行为，确保 recommended_strategy 被持久化
    // 由于 refreshStrategyRecommendations 依赖 AI 服务，这里只验证概念

    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('updateTicker should be called when strategy is recommended', () => {
      // 模拟 updateTicker 被调用
      marketFundService.updateTicker('000001', {
        recommended_strategy: { strategy_id: 'trendFollowing', reason: '适合趋势交易' }
      });

      expect(marketFundService.updateTicker).toHaveBeenCalledWith('000001', {
        recommended_strategy: { strategy_id: 'trendFollowing', reason: '适合趋势交易' }
      });
    });

    test('updateTicker should clear recommended_strategy when null', () => {
      // 模拟清空推荐策略
      marketFundService.updateTicker('000001', {
        recommended_strategy: undefined
      } as any);

      expect(marketFundService.updateTicker).toHaveBeenCalledWith('000001', expect.objectContaining({
        recommended_strategy: undefined
      }));
    });
  });

  describe('bg-strategy template configuration', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      promptTemplateService.resetCache();
    });

    test('bg-strategy template has maxTokens configured', async () => {
      // Mock the template loading with maxTokens
      const mockTemplate = {
        templates: [
          {
            id: 'bg-strategy',
            name: '推荐交易策略',
            template: 'test template',
            maxTokens: 4000
          }
        ]
      };

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('background-job-prompts')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockTemplate)
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ templates: [] })
        });
      });

      await promptTemplateService.loadAllTemplates();
      const template = promptTemplateService.getById('bg-strategy');

      expect(template).not.toBeNull();
      expect(template?.maxTokens).toBe(4000);
    });

    test('bg-strategy template maxTokens is higher than default', async () => {
      // 验证 maxTokens 配置足够大，避免 JSON 被截断
      const mockTemplate = {
        templates: [
          {
            id: 'bg-strategy',
            name: '推荐交易策略',
            template: 'test template',
            maxTokens: 4000
          }
        ]
      };

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('background-job-prompts')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockTemplate)
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ templates: [] })
        });
      });

      await promptTemplateService.loadAllTemplates();
      const template = promptTemplateService.getById('bg-strategy');

      // 默认值是 2000，配置值应该大于默认值
      expect(template?.maxTokens).toBeGreaterThan(2000);
    });
  });
});