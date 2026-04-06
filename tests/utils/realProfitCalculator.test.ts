import { calculateRealProfit, calculateRealProfitSync, getStoredPosition, getTradesForFund } from '../../utils/realProfitCalculator';
import { HistoricalPoint, TradeRecord, FundPosition } from '../../types';
import * as marketFundService from '../../services/marketFundService';

// Setup localStorage mock before running tests
const localStorageMock = (() => {
  let store: { [key: string]: string } = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => {
      return Object.keys(store)[index] || null;
    }
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

describe('realProfitCalculator', () => {
  beforeEach(() => {
    global.localStorage.clear();
    marketFundService.resetCache();
  });

  describe('getStoredPosition', () => {
    it('should return null when no stored position exists', () => {
      const result = getStoredPosition('TEST001');
      expect(result).toBeNull();
    });

    it('should return stored position data when available', () => {
      const testData: FundPosition = {
        startDate: '2026-01-01',
        initialPosition: 100,
        initialPrice: 1.5,
        fullCapacity: 0
      };
      marketFundService.updatePosition('TEST001', testData);

      const result = getStoredPosition('TEST001');
      expect(result).toEqual({
        startDate: testData.startDate,
        initialPosition: testData.initialPosition,
        initialPrice: testData.initialPrice
      });
    });

    it('should return null for fund without position', () => {
      // 添加一个没有 position 的基金
      marketFundService.addFund('TEST002', 'Test Fund');

      const result = getStoredPosition('TEST002');
      expect(result).toBeNull();
    });
  });

  describe('getTradesForFund', () => {
    it('should return empty array when no trades exist', () => {
      const result = getTradesForFund('TEST001');
      expect(result).toEqual([]);
    });

    it('should return stored trades for a fund', () => {
      const testTrades: TradeRecord[] = [
        { id: '1', date: '2026-01-01', type: 'buy', shares: 100, price: 1.5, fee: 0 },
        { id: '2', date: '2026-01-02', type: 'sell', shares: 50, price: 1.6, fee: 0 }
      ];

      marketFundService.updateTrades('TEST001', testTrades);

      const result = getTradesForFund('TEST001');
      expect(result).toEqual(testTrades);
    });

    it('should return empty array for fund without trades', () => {
      marketFundService.addFund('TEST002', 'Test Fund');

      const result = getTradesForFund('TEST002');
      expect(result).toEqual([]);
    });
  });

  describe('calculateRealProfit', () => {
    it('should return null when no stored position exists', async () => {
      const result = await calculateRealProfit(
        'TEST001',
        '2026-01-01',
        [],
        null,
        []
      );
      expect(result).toBeNull();
    });

    it('should return null when start date is before stored position start date', async () => {
      const storedPosition = {
        startDate: '2026-02-01',
        initialPosition: 100,
        initialPrice: 1.5
      };

      const result = await calculateRealProfit(
        'TEST001',
        '2026-01-01', // Before stored position start date
        [{ date: new Date('2026-02-01').getTime(), value: 1.5, equityReturn: 0 }],
        storedPosition,
        []
      );
      expect(result).toBeNull();
    });

    it('should calculate real profit with valid data', async () => {
      const storedPosition = {
        startDate: '2026-01-01',
        initialPosition: 100,
        initialPrice: 1.0
      };

      const history: HistoricalPoint[] = [
        { date: new Date('2026-01-01').getTime(), value: 1.0, equityReturn: 0 },
        { date: new Date('2026-01-02').getTime(), value: 1.1, equityReturn: 0 },
        { date: new Date('2026-01-03').getTime(), value: 1.2, equityReturn: 0 }
      ];

      const trades: TradeRecord[] = [];

      const result = await calculateRealProfit(
        'TEST001',
        '2026-01-01',
        history,
        storedPosition,
        trades
      );

      // With 100 shares bought at 1.0 and final value at 1.2, profit should be 100 * (1.2 - 1.0) = 20
      expect(result).toBeCloseTo(20, 2);
    });
  });

  describe('calculateRealProfitSync', () => {
    it('should return null when no stored position exists', () => {
      const result = calculateRealProfitSync(
        'TEST001',
        '2026-01-01',
        [],
        null,
        []
      );
      expect(result).toBeNull();
    });

    it('should return null when start date is before stored position start date', () => {
      const storedPosition = {
        startDate: '2026-02-01',
        initialPosition: 100,
        initialPrice: 1.5
      };

      const result = calculateRealProfitSync(
        'TEST001',
        '2026-01-01', // Before stored position start date
        [{ date: new Date('2026-02-01').getTime(), value: 1.5, equityReturn: 0 }],
        storedPosition,
        []
      );
      expect(result).toBeNull();
    });

    it('should calculate real profit with valid data', () => {
      const storedPosition = {
        startDate: '2026-01-01',
        initialPosition: 100,
        initialPrice: 1.0
      };

      const history: HistoricalPoint[] = [
        { date: new Date('2026-01-01').getTime(), value: 1.0, equityReturn: 0 },
        { date: new Date('2026-01-02').getTime(), value: 1.1, equityReturn: 0 },
        { date: new Date('2026-01-03').getTime(), value: 1.2, equityReturn: 0 }
      ];

      const trades: TradeRecord[] = [];

      const result = calculateRealProfitSync(
        'TEST001',
        '2026-01-01',
        history,
        storedPosition,
        trades
      );

      // With 100 shares bought at 1.0 and final value at 1.2, profit should be 100 * (1.2 - 1.0) = 20
      expect(result).toBeCloseTo(20, 2);
    });

    it('should handle trade data correctly', () => {
      const storedPosition = {
        startDate: '2026-01-01',
        initialPosition: 100,
        initialPrice: 1.0
      };

      const history: HistoricalPoint[] = [
        { date: new Date('2026-01-01').getTime(), value: 1.0, equityReturn: 0 },
        { date: new Date('2026-01-02').getTime(), value: 1.1, equityReturn: 0 },
        { date: new Date('2026-01-03').getTime(), value: 1.2, equityReturn: 0 }
      ];

      const trades: TradeRecord[] = [
        { id: '1', date: '2026-01-01', type: 'buy', shares: 100, price: 1.0, fee: 0 }
      ];

      const result = calculateRealProfitSync(
        'TEST001',
        '2026-01-01',
        history,
        storedPosition,
        trades
      );

      // With initial 100 shares at price 1.0 and final value at 1.2, plus trade of 100 shares at 1.0,
      // the profit calculation should account for the initial position and trades correctly
      // This test checks that the function can handle trade data without errors
      expect(result).toBeDefined();
      expect(typeof result).toBe('number');
    });
  });
});