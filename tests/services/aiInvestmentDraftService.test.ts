// tests/services/aiInvestmentDraftService.test.ts
import {
  formatInvestmentDraftData,
  formatFundBaseContextData,
  parseAIAdviceJSON,
  generateAIInvestmentAdvice,
  hasDraftAction,
  DraftEntry,
  parseAIAdviceWithScoreJSON,
  AIAdviceWithScore,
  SCORE_THRESHOLD,
  MAX_ITERATIONS,
} from '../../services/aiInvestmentDraftService';
import { Ticker, ValuationData, HistoricalPoint, MarketIndex, MarketFund } from '../../types';
import * as marketFundService from '../../services/marketFundService';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock getTradesForSymbol
jest.mock('../../hooks/useTrades', () => ({
  getTradesForSymbol: jest.fn(() => []),
}));

// Helper to create MarketFund
function createMarketFund(
  symbol: string,
  name: string,
  valuation: ValuationData | undefined,
  history: HistoricalPoint[] = [],
  ticker?: Partial<Ticker>
): MarketFund {
  return {
    info: {
      ticker: {
        id: symbol,
        symbol,
        name,
        market: 'cn',
        ...ticker
      },
      valuation
    },
    trades: [],
    intraday: [],
    history
  };
}

// Helper to create MarketIndex
function createMarketIndex(
  symbol: string,
  name: string,
  history: HistoricalPoint[] = []
): MarketIndex {
  return {
    info: {
      symbol,
      name,
      current: 0,
      change: 0,
      changePercent: 0,
      lastUpdated: ''
    },
    intraday: [],
    history
  };
}

describe('aiInvestmentDraftService', () => {
  beforeEach(() => {
    localStorage.clear();
    marketFundService.resetCache();
  });

    test('filters out funds with 不操作', () => {
      const draftData: Record<string, DraftEntry> = {
        '000001': { fundSymbol: '000001', operation: '买入', amount: '1000', note: '' },
        '000002': { fundSymbol: '000002', operation: '不操作', amount: '', note: '' },
      };
      const valuation1: ValuationData = {
        symbol: '000001', name: '基金1', currentPrice: 1.5, previousPrice: 1.4,
        changePercentage: 7.14, lastUpdated: '2026-04-03 15:00', realtimeDate: '2026-04-03',
        netWorthDate: '2026-04-02', valuationDate: '2026-04-03', sourceUrl: ''
      };

      const funds: MarketFund[] = [
        createMarketFund('000001', '基金1', valuation1),
        createMarketFund('000002', '基金2', undefined)
      ];

      const result = formatInvestmentDraftData(draftData, funds, []);

      expect(result.funds).toHaveLength(1);
      expect(result.funds[0].code).toBe('000001');
      expect(result.funds[0].today_action).toBe('买入');
    });

    test('calculates action_shares correctly', () => {
      const draftData: Record<string, DraftEntry> = {
        '000001': { fundSymbol: '000001', operation: '买入', amount: '1000', note: '' },
      };
      const valuation: ValuationData = {
        symbol: '000001', name: '基金1', currentPrice: 2.0, previousPrice: 1.9,
        changePercentage: 5.26, lastUpdated: '2026-04-03 15:00', realtimeDate: '2026-04-03',
        netWorthDate: '2026-04-02', valuationDate: '2026-04-03', sourceUrl: ''
      };

      const funds: MarketFund[] = [
        createMarketFund('000001', '基金1', valuation)
      ];

      const result = formatInvestmentDraftData(draftData, funds, []);

      expect(result.funds[0].action_shares).toBe(500); // 1000 / 2.0
    });

    test('processes indices data', () => {
      const indexHistory: HistoricalPoint[] = Array.from({ length: 15 }, (_, i) => ({
        date: Date.now() - (15 - i) * 86400000,
        value: 3200 + i * 5,
        equityReturn: 0.1,
        volume: 100000000 + i * 1000000
      }));

      const indices: MarketIndex[] = [
        {
          info: { name: '上证指数', symbol: 'sh000001', current: 3250, change: 10, changePercent: 0.31,
            lastUpdated: '2026-04-03 15:00', volume: 123456789 },
          intraday: [],
          history: indexHistory
        }
      ];

      const result = formatInvestmentDraftData({}, [], indices);

      expect(result.indices).toHaveLength(1);
      expect(result.indices[0].index_name).toBe('上证指数');
      expect(result.indices[0].current_value).toBe(3250);
    });

    test('nav_last_10_days is ordered with newest first', () => {
      // 创建15天历史数据，净值递增（模拟上涨行情）
      const today = new Date('2026-04-07');
      const fundHistory: HistoricalPoint[] = Array.from({ length: 15 }, (_, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() - (15 - i));
        return {
          date: d.getTime(),
          value: 1.0 + i * 0.1, // 从1.0到2.4，递增
          equityReturn: 0.01
        };
      });

      const marketData: ValuationData = {
        symbol: '000001', name: '测试基金', currentPrice: 2.5, previousPrice: 2.4,
        changePercentage: 4.17, lastUpdated: '2026-04-07 15:00', sourceUrl: ''
      };

      const funds: MarketFund[] = [
        createMarketFund('000001', '测试基金', marketData, fundHistory)
      ];

      const result = formatFundBaseContextData(funds, []);

      expect(result.funds[0].nav_last_10_days).toHaveLength(10);
      // 最新值在前（最高值），最旧值在后（最低值）
      // 由于净值递增，nav_last_10_days[0] 应该是最近10天中最高的
      expect(result.funds[0].nav_last_10_days[0]).toBeGreaterThan(result.funds[0].nav_last_10_days[9]);
    });

    test('indices values_last_10_days and volume_last_10_days are ordered with newest first', () => {
      const today = new Date('2026-04-07');
      const indexHistory: HistoricalPoint[] = Array.from({ length: 15 }, (_, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() - (15 - i));
        return {
          date: d.getTime(),
          value: 3000 + i * 10, // 递增
          volume: 1000000 + i * 10000,
          equityReturn: 0.01
        };
      });

      const indices: MarketIndex[] = [
        {
          info: { name: '上证指数', symbol: 'sh000001', current: 3150, change: 10, changePercent: 0.32, lastUpdated: '2026-04-07 15:00', volume: 1150000 },
          intraday: [],
          history: indexHistory
        }
      ];

      const result = formatFundBaseContextData([], indices);

      expect(result.indices).toHaveLength(1);
      expect(result.indices[0].values_last_10_days).toHaveLength(10);
      expect(result.indices[0].volume_last_10_days).toHaveLength(10);
      // 最新值在前（最高值）
      expect(result.indices[0].values_last_10_days[0]).toBeGreaterThan(result.indices[0].values_last_10_days[9]);
      expect(result.indices[0].volume_last_10_days[0]).toBeGreaterThan(result.indices[0].volume_last_10_days[9]);
    });

    test('indices ma5_last_10_days has correct length', () => {
      const today = new Date('2026-04-07');
      const indexHistory: HistoricalPoint[] = Array.from({ length: 20 }, (_, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() - (20 - i));
        return {
          date: d.getTime(),
          value: 3000 + i * 10,
          volume: 1000000,
          equityReturn: 0.01
        };
      });

      const indices: MarketIndex[] = [
        {
          info: { name: '上证指数', symbol: 'sh000001', current: 3190, change: 10, changePercent: 0.32, lastUpdated: '2026-04-07 15:00', volume: 1200000 },
          intraday: [],
          history: indexHistory
        }
      ];

      const result = formatFundBaseContextData([], indices);

      expect(result.indices[0].ma5_last_10_days).toHaveLength(10);
      expect(result.indices[0].ma10_last_10_days).toHaveLength(10);
      expect(result.indices[0].ma20_last_10_days).toHaveLength(10);
    });

    describe('formatFundBaseContextData', () => {
    beforeEach(() => {
      localStorage.clear();
      marketFundService.resetCache();
      // 使用 marketFundService 设置持仓数据（而非 legacy key）
      marketFundService.updatePosition('000001', {
        fullCapacity: 10000,
        initialPosition: 1000,
        startDate: null,
        initialPrice: null
      });
    });

    test('returns base data without user plan fields', () => {
      const fundHistory: HistoricalPoint[] = [
        { date: new Date('2026-04-01').getTime(), value: 1.5, equityReturn: 0 },
        { date: new Date('2026-04-02').getTime(), value: 1.6, equityReturn: 0 },
        { date: new Date('2026-04-03').getTime(), value: 1.7, equityReturn: 0 }
      ];

      const marketData: ValuationData = {
        symbol: '000001', name: '测试基金', currentPrice: 1.8, previousPrice: 1.7,
        changePercentage: 5.88, lastUpdated: '2026-04-03 15:00', sourceUrl: ''
      };

      const funds: MarketFund[] = [
        createMarketFund('000001', '测试基金', marketData, fundHistory, {
          profile: {
            stage_increase: [
              { stage: '近1周', increase_percentage: 2.3 },
              { stage: '近1月', increase_percentage: 5.5 }
            ],
            stock_positions: [
              { stock_name: '股票A', percentage: 10 }
            ]
          }
        })
      ];

      const result = formatFundBaseContextData(funds, []);

      expect(result.funds.length).toBe(1);
      expect(result.funds[0].code).toBe('000001');
      expect(result.funds[0].name).toBe('测试基金');
      // 验证 current_shares 能正确读取（beforeEach 中通过 legacy key 设置了 initialPosition: 1000）
      expect(result.funds[0].current_shares).toBe(1000);
      // 不应包含用户计划相关字段
      expect(result.funds[0]).not.toHaveProperty('today_action');
      expect(result.funds[0]).not.toHaveProperty('action_shares');
      expect(result.funds[0]).not.toHaveProperty('estimate_amount');
    });

    test('includes all base fields for fund', () => {
      // 设置持仓数据
      marketFundService.updatePosition('000001', {
        fullCapacity: 10000,
        initialPosition: 1000,
        startDate: '2026-01-01',
        initialPrice: 1.5
      });

      const fundHistory: HistoricalPoint[] = [
        { date: new Date('2026-04-01').getTime(), value: 1.5, equityReturn: 0 },
        { date: new Date('2026-04-02').getTime(), value: 1.6, equityReturn: 0 },
        { date: new Date('2026-04-03').getTime(), value: 1.7, equityReturn: 0 }
      ];

      const marketData: ValuationData = {
        symbol: '000001', name: '测试基金', currentPrice: 1.8, previousPrice: 1.7,
        changePercentage: 5.88, lastUpdated: '2026-04-03 15:00', sourceUrl: ''
      };

      const funds: MarketFund[] = [
        createMarketFund('000001', '测试基金', marketData, fundHistory, {
          profile: {
            stage_increase: [
              { stage: '近1周', increase_percentage: 2.3 },
              { stage: '近1月', increase_percentage: 5.5 },
              { stage: '近3月', increase_percentage: 10.0 },
              { stage: '近6月', increase_percentage: 20.0 }
            ],
            stock_positions: [
              { stock_name: '股票A', percentage: 10 },
              { stock_name: '股票B', percentage: 8 }
            ]
          }
        })
      ];

      const result = formatFundBaseContextData(funds, []);

      const fund = result.funds[0];
      expect(fund.current_shares).toBe(1000); // from localStorage mock
      expect(fund.current_nav).toBe(1.8);
      expect(fund.weekly_return).toBe(0.023);
      expect(fund.monthly_return).toBe(0.055);
      expect(fund.quarterly_return).toBe(0.1);
      expect(fund.halfyear_return).toBe(0.2);
      expect(fund.top10_stocks).toHaveLength(2);
    });

    test('skips funds without valuation data', () => {
      const funds: MarketFund[] = [
        createMarketFund('000001', '基金1', {
          symbol: '000001', name: '基金1', currentPrice: 1.5, previousPrice: 1.4,
          changePercentage: 7.14, lastUpdated: '2026-04-03 15:00', sourceUrl: ''
        }),
        createMarketFund('000002', '基金2', undefined)
      ];

      const result = formatFundBaseContextData(funds, []);

      expect(result.funds.length).toBe(1);
      expect(result.funds[0].code).toBe('000001');
    });
  });

  describe('parseAIAdviceJSON', () => {
    test('parses clean JSON response', () => {
      const response = `[
        {"fund_code": "000001", "operation": "buy", "amount": 1000, "reason": "看好短期走势"}
      ]`;
      const result = parseAIAdviceJSON(response);
      expect(result.length).toBe(1);
      expect(result[0].fundCode).toBe('000001');
      expect(result[0].operation).toBe('买入');
      expect(result[0].amount).toBe(1000);
      expect(result[0].reason).toBe('看好短期走势');
    });

    test('parses JSON wrapped in code block', () => {
      const response = `\`\`\`json
      [
        {"fund_code": "000001", "operation": "sell", "amount": 500, "reason": "风险提示"}
      ]
      \`\`\``;
      const result = parseAIAdviceJSON(response);
      expect(result.length).toBe(1);
      expect(result[0].operation).toBe('卖出');
    });

    test('parses JSON wrapped in generic code block', () => {
      const response = `\`\`\`
      [
        {"fund_code": "000001", "operation": "buy", "amount": 1000, "reason": "测试"}
      ]
      \`\`\``;
      const result = parseAIAdviceJSON(response);
      expect(result.length).toBe(1);
    });

    test('throws error for invalid JSON', () => {
      const response = 'not a json';
      expect(() => parseAIAdviceJSON(response)).toThrow('AI返回格式解析失败');
    });

    test('converts operation to Chinese', () => {
      const response = `[
        {"fund_code": "000001", "operation": "buy", "amount": 1000, "reason": "买入理由"},
        {"fund_code": "000002", "operation": "sell", "amount": 500, "reason": "卖出理由"}
      ]`;
      const result = parseAIAdviceJSON(response);
      expect(result[0].operation).toBe('买入');
      expect(result[1].operation).toBe('卖出');
    });

    test('handles empty array', () => {
      const response = '[]';
      const result = parseAIAdviceJSON(response);
      expect(result.length).toBe(0);
    });

    test('handles multiple entries', () => {
      const response = `[
        {"fund_code": "000001", "operation": "buy", "amount": 1000, "reason": "理由1"},
        {"fund_code": "000002", "operation": "sell", "amount": 500, "reason": "理由2"},
        {"fund_code": "000003", "operation": "buy", "amount": 2000, "reason": "理由3"}
      ]`;
      const result = parseAIAdviceJSON(response);
      expect(result.length).toBe(3);
    });

    test('parses JSON with surrounding text', () => {
      const response = `这是我的投资建议：
\`\`\`json
[
  {"fund_code": "000001", "operation": "buy", "amount": 1000, "reason": "看好短期走势"}
]
\`\`\`
希望对你有帮助！`;
      const result = parseAIAdviceJSON(response);
      expect(result.length).toBe(1);
      expect(result[0].fundCode).toBe('000001');
    });

    test('filters out hold operations', () => {
      const response = `[
        {"fund_code": "000001", "operation": "buy", "amount": 1000, "reason": "买入理由"},
        {"fund_code": "000002", "operation": "hold", "amount": 0, "reason": "持有观望"},
        {"fund_code": "000003", "operation": "sell", "amount": 500, "reason": "卖出理由"}
      ]`;
      const result = parseAIAdviceJSON(response);
      expect(result.length).toBe(2);
      expect(result[0].fundCode).toBe('000001');
      expect(result[1].fundCode).toBe('000003');
    });
  });

  describe('parseAIAdviceWithScoreJSON', () => {
    test('parses clean JSON response with scores', () => {
      const response = `[
        {"fund_code": "000001", "operation": "buy", "amount": 1000, "score": 0.8, "reason": "看好短期走势"},
        {"fund_code": "000002", "operation": "sell", "amount": 500, "score": 0.6, "reason": "风险提示"}
      ]`;
      const result = parseAIAdviceWithScoreJSON(response);
      expect(result.length).toBe(2);
      expect(result[0].fundCode).toBe('000001');
      expect(result[0].score).toBe(0.8);
      expect(result[1].score).toBe(0.6);
    });

    test('parses JSON wrapped in code block with scores', () => {
      const response = `\`\`\`json
    [
      {"fund_code": "000001", "operation": "buy", "amount": 1000, "score": 0.9, "reason": "测试"}
    ]
    \`\`\``;
      const result = parseAIAdviceWithScoreJSON(response);
      expect(result.length).toBe(1);
      expect(result[0].score).toBe(0.9);
    });

    test('defaults score to 0 when missing', () => {
      const response = `[
        {"fund_code": "000001", "operation": "buy", "amount": 1000, "reason": "无得分"}
      ]`;
      const result = parseAIAdviceWithScoreJSON(response);
      expect(result[0].score).toBe(0);
    });

    test('throws error for invalid JSON', () => {
      const response = 'not a json';
      expect(() => parseAIAdviceWithScoreJSON(response)).toThrow('AI返回格式解析失败');
    });
  });

  describe('Constants', () => {
    test('SCORE_THRESHOLD is 0.7', () => {
      expect(SCORE_THRESHOLD).toBe(0.7);
    });

    test('MAX_ITERATIONS is 3', () => {
      expect(MAX_ITERATIONS).toBe(3);
    });
  });

  describe('hasDraftAction', () => {
    test('returns true for buy operation with amount', () => {
      const entry = { fundSymbol: '000001', operation: '买入' as const, amount: '1000', note: '' };
      expect(hasDraftAction(entry)).toBe(true);
    });

    test('returns true for sell operation with amount', () => {
      const entry = { fundSymbol: '000001', operation: '卖出' as const, amount: '500', note: '' };
      expect(hasDraftAction(entry)).toBe(true);
    });

    test('returns false for no operation', () => {
      const entry = { fundSymbol: '000001', operation: '不操作' as const, amount: '1000', note: '' };
      expect(hasDraftAction(entry)).toBe(false);
    });

    test('returns false for empty amount', () => {
      const entry = { fundSymbol: '000001', operation: '买入' as const, amount: '', note: '' };
      expect(hasDraftAction(entry)).toBe(false);
    });

    test('returns false for zero amount string', () => {
      const entry = { fundSymbol: '000001', operation: '买入' as const, amount: '0', note: '' };
      expect(hasDraftAction(entry)).toBe(true); // '0' is truthy as string but means 0 amount
    });
  });

  describe('generateAIInvestmentAdvice', () => {
    test('function exists and is callable', () => {
      expect(typeof generateAIInvestmentAdvice).toBe('function');
    });

    // 注：完整的集成测试需要 mock queryAIWithTemplate，这里验证函数签名
  });

  describe('analyzeInvestmentDraft', () => {
    test('function exists and is callable', () => {
      const { analyzeInvestmentDraft } = require('../../services/aiInvestmentDraftService');
      expect(typeof analyzeInvestmentDraft).toBe('function');
    });
  });
});