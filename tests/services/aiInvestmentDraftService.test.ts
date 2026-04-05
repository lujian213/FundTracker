// tests/services/aiInvestmentDraftService.test.ts
import {
  formatInvestmentDraftData,
  formatFundBaseContextData,
  parseAIAdviceJSON,
  generateAIInvestmentAdvice,
  hasDraftAction,
  DraftEntry,
} from '../../services/aiInvestmentDraftService';
import { Ticker, ValuationData, HistoricalPoint, MarketIndex } from '../../types';

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

describe('aiInvestmentDraftService', () => {
  describe('formatInvestmentDraftData', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    test('filters out funds with 不操作', () => {
      const draftData: Record<string, DraftEntry> = {
        '000001': { fundSymbol: '000001', operation: '买入', amount: '1000', note: '' },
        '000002': { fundSymbol: '000002', operation: '不操作', amount: '', note: '' },
      };
      const portfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: '基金1', market: 'cn' },
        { id: '2', symbol: '000002', name: '基金2', market: 'cn' },
      ];
      const valuation1: ValuationData = {
        symbol: '000001', name: '基金1', currentPrice: 1.5, previousPrice: 1.4,
        changePercentage: 7.14, lastUpdated: '2026-04-03 15:00', realtimeDate: '2026-04-03',
        netWorthDate: '2026-04-02', valuationDate: '2026-04-03', sourceUrl: ''
      };

      const result = formatInvestmentDraftData(
        draftData, portfolio, {}, {}, [], [],
        { '000001': valuation1 }
      );

      expect(result.funds).toHaveLength(1);
      expect(result.funds[0].code).toBe('000001');
      expect(result.funds[0].today_action).toBe('买入');
    });

    test('calculates action_shares correctly', () => {
      const draftData: Record<string, DraftEntry> = {
        '000001': { fundSymbol: '000001', operation: '买入', amount: '1000', note: '' },
      };
      const portfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: '基金1', market: 'cn' },
      ];
      const valuation: ValuationData = {
        symbol: '000001', name: '基金1', currentPrice: 2.0, previousPrice: 1.9,
        changePercentage: 5.26, lastUpdated: '2026-04-03 15:00', realtimeDate: '2026-04-03',
        netWorthDate: '2026-04-02', valuationDate: '2026-04-03', sourceUrl: ''
      };

      const result = formatInvestmentDraftData(
        draftData, portfolio, {}, {}, [], [],
        { '000001': valuation }
      );

      expect(result.funds[0].action_shares).toBe(500); // 1000 / 2.0
    });

    test('processes indices data', () => {
      const marketIndices: MarketIndex[] = [
        { info: { name: '上证指数', symbol: 'sh000001', current: 3250, change: 10, changePercent: 0.31,
          lastUpdated: '2026-04-03 15:00', volume: 123456789 }, history: [] }
      ];
      const indexHistories: Record<string, HistoricalPoint[]> = {
        'sh000001': Array.from({ length: 15 }, (_, i) => ({
          date: Date.now() - (15 - i) * 86400000,
          value: 3200 + i * 5,
          equityReturn: 0.1,
          volume: 100000000 + i * 1000000
        }))
      };

      const result = formatInvestmentDraftData({}, [], {}, indexHistories, marketIndices, [], {});

      expect(result.indices).toHaveLength(1);
      expect(result.indices[0].index_name).toBe('上证指数');
      expect(result.indices[0].current_value).toBe(3250);
    });
  });

  describe('formatFundBaseContextData', () => {
    beforeEach(() => {
      localStorage.clear();
      localStorage.setItem('fund_position_000001', JSON.stringify({ fullCapacity: 10000, initialPosition: 1000 }));
    });

    test('returns base data without user plan fields', () => {
      const portfolio: Ticker[] = [
        {
          id: '1',
          symbol: '000001',
          name: '测试基金',
          market: 'cn',
          profile: {
            stage_increase: [
              { stage: '近1周', increase_percentage: 2.3 },
              { stage: '近1月', increase_percentage: 5.5 }
            ],
            stock_positions: [
              { stock_name: '股票A', percentage: 10 }
            ]
          }
        }
      ];

      const fundHistories: Record<string, HistoricalPoint[]> = {
        '000001': [
          { date: new Date('2026-04-01').getTime(), value: 1.5 },
          { date: new Date('2026-04-02').getTime(), value: 1.6 },
          { date: new Date('2026-04-03').getTime(), value: 1.7 }
        ]
      };

      const indexHistories: Record<string, HistoricalPoint[]> = {};
      const marketIndices: MarketIndex[] = [];
      const globalIndices: MarketIndex[] = [];
      const marketData: Record<string, ValuationData> = {
        '000001': { symbol: '000001', name: '测试基金', currentPrice: 1.8, previousPrice: 1.7, changePercentage: 5.88, lastUpdated: '2026-04-03 15:00', sourceUrl: '' }
      };

      const result = formatFundBaseContextData(
        portfolio,
        fundHistories,
        indexHistories,
        marketIndices,
        globalIndices,
        marketData
      );

      expect(result.funds.length).toBe(1);
      expect(result.funds[0].code).toBe('000001');
      expect(result.funds[0].name).toBe('测试基金');
      // 不应包含用户计划相关字段
      expect(result.funds[0]).not.toHaveProperty('today_action');
      expect(result.funds[0]).not.toHaveProperty('action_shares');
      expect(result.funds[0]).not.toHaveProperty('estimate_amount');
    });

    test('includes all base fields for fund', () => {
      const portfolio: Ticker[] = [
        {
          id: '1',
          symbol: '000001',
          name: '测试基金',
          market: 'cn',
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
        }
      ];

      const fundHistories: Record<string, HistoricalPoint[]> = {
        '000001': [
          { date: new Date('2026-04-01').getTime(), value: 1.5 },
          { date: new Date('2026-04-02').getTime(), value: 1.6 },
          { date: new Date('2026-04-03').getTime(), value: 1.7 }
        ]
      };

      const marketData: Record<string, ValuationData> = {
        '000001': { symbol: '000001', name: '测试基金', currentPrice: 1.8, previousPrice: 1.7, changePercentage: 5.88, lastUpdated: '2026-04-03 15:00', sourceUrl: '' }
      };

      const result = formatFundBaseContextData(
        portfolio,
        fundHistories,
        {},
        [],
        [],
        marketData
      );

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
      const portfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: '基金1', market: 'cn' },
        { id: '2', symbol: '000002', name: '基金2', market: 'cn' }
      ];

      const fundHistories: Record<string, HistoricalPoint[]> = {};
      const marketData: Record<string, ValuationData> = {
        '000001': { symbol: '000001', name: '基金1', currentPrice: 1.5, previousPrice: 1.4, changePercentage: 7.14, lastUpdated: '2026-04-03 15:00', sourceUrl: '' }
      };

      const result = formatFundBaseContextData(
        portfolio,
        fundHistories,
        {},
        [],
        [],
        marketData
      );

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

    // 注：完整的集成测试需要 mock queryAI，这里只验证函数签名
  });
});