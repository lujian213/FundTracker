import { calculateRealProfit, calculateRealProfitSync, getStoredPosition, getTradesForFund } from '../../utils/realProfitCalculator';
import { HistoricalPoint } from '../../types';
import { TradeRecord } from '../../hooks/useTrades';

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
  });

  describe('getStoredPosition', () => {
    it('should return null when no stored position exists', () => {
      const result = getStoredPosition('TEST001');
      expect(result).toBeNull();
    });

    it('should return stored position data when available', () => {
      const testData = {
        startDate: '2026-01-01',
        initialPosition: 100,
        initialPrice: 1.5
      };
      global.localStorage.setItem('fund_position_TEST001', JSON.stringify(testData));

      const result = getStoredPosition('TEST001');
      expect(result).toEqual(testData);
    });

    it('should handle padded fund symbols correctly', () => {
      const testData = {
        startDate: '2026-01-01',
        initialPosition: 100,
        initialPrice: 1.5
      };
      global.localStorage.setItem('fund_position_000001', JSON.stringify(testData));

      const result = getStoredPosition('1');
      expect(result).toEqual(testData);
    });

    it('should return null for invalid JSON', () => {
      global.localStorage.setItem('fund_position_TEST002', 'invalid json');

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

      global.localStorage.setItem('fund_trades', JSON.stringify({ 'TEST001': testTrades }));

      const result = getTradesForFund('TEST001');
      expect(result).toEqual(testTrades);
    });

    it('should return empty array for invalid JSON', () => {
      global.localStorage.setItem('fund_trades', 'invalid json');

      const result = getTradesForFund('TEST001');
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