import {
  formatStrategyListForPrompt,
  getStrategyKeysForPrompt,
  parseStrategyRecommendationResponse,
  updateTickerRecommendedStrategy
} from '../../services/strategyRecommendationService';
import { Ticker, MarketType } from '../../types';

// Mock getAvailableStrategiesInfo
jest.mock('../../services/strategyRegistry', () => ({
  getAvailableStrategiesInfo: jest.fn(() => [
    { key: 'trendFollowing', name: '趋势追踪策略', description: '基于技术分析' },
    { key: 'meanReversion', name: '均值回归策略', description: '基于统计回归' },
    { key: 'constantMix', name: '恒定混合策略', description: '资产配置理论' },
    { key: 'fixedAmountPyramid', name: '固定金额正金字塔策略', description: '金字塔买卖' }
  ])
}));

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

    test('returns empty array for invalid JSON', () => {
      expect(parseStrategyRecommendationResponse('not json')).toEqual([]);
    });

    test('returns empty array for non-array response', () => {
      expect(parseStrategyRecommendationResponse('{"key": "value"}')).toEqual([]);
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
      const portfolioWithAlerts: Ticker[] = [
        {
          ...portfolio[0],
          alert_list: [{ type: 'holiday', date: '2024/01/15', content: 'test' }]
        },
        portfolio[1]
      ];

      const result = updateTickerRecommendedStrategy(portfolioWithAlerts, '000001', 'trendFollowing', 'test');

      expect(result[0].alert_list).toEqual([{ type: 'holiday', date: '2024/01/15', content: 'test' }]);
      expect(result[0].recommended_strategy).toEqual({
        strategy_id: 'trendFollowing',
        reason: 'test'
      });
    });
  });
});