// tests/services/aiInvestmentDraftService.test.ts
import {
  formatInvestmentDraftData,
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
        { name: '上证指数', symbol: 'sh000001', current: 3250, change: 10, changePercent: 0.31,
          lastUpdated: '2026-04-03 15:00', volume: 123456789 }
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
});