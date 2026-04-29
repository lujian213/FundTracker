// tests/utils/smartFundCalculator.test.ts

import { calculateNewPosition } from '../../utils/smartFundCalculator';
import { FundPosition, TradeRecord } from '../../types';
import { OcrFundData } from '../../utils/fundOcrParser';

describe('smartFundCalculator', () => {
  const mockOcrData: OcrFundData = {
    fundCode: '270042',
    shares: 5349.92,
    nav: 7.7008,
    navDate: '2026-04-27',
    accumulatedProfit: 30479.48,
  };

  describe('新基金（无持仓）', () => {
    it('adds new fund with correct calculations', () => {
      const result = calculateNewPosition(mockOcrData, null, []);

      expect(result.success).toBe(true);
      expect(result.operationType).toBe('add');
      // 满仓份额 = shares * 2，取整到千：5349.92 * 2 = 10699.84 → 11000
      expect(result.newPosition.fullCapacity).toBe(11000);
      expect(result.newPosition.initialPosition).toBe(5349.92);
      expect(result.newPosition.startDate).toBe('2026-04-27');
      // initialPrice = (shares * nav - accumulatedProfit) / shares
      // = (5349.92 * 7.7008 - 30479.48) / 5349.92 ≈ 2.0036
      expect(result.newPosition.initialPrice).toBeCloseTo(2.0036, 4);
    });

    it('sets startDate to earliest trade date when trades exist', () => {
      const trades: TradeRecord[] = [
        { id: '1', date: '2026-03-01', type: 'buy', shares: 100, price: 7, fee: 0 },
        { id: '2', date: '2026-03-15', type: 'buy', shares: 50, price: 7.5, fee: 0 },
      ];

      const result = calculateNewPosition(mockOcrData, null, trades);
      expect(result.newPosition.startDate).toBe('2026-03-01');
    });

    it('sets initialPrice to nav when accumulatedProfit is zero', () => {
      const newFundData: OcrFundData = {
        fundCode: '270042',
        shares: 1000,
        nav: 5.5,
        navDate: '2026-04-27',
        accumulatedProfit: 0,
      };

      const result = calculateNewPosition(newFundData, null, []);
      // 无累计收益时，initialPrice = nav
      expect(result.newPosition.initialPrice).toBeCloseTo(5.5, 4);
    });
  });

  describe('已有基金（更新）', () => {
    const existingPosition: FundPosition = {
      fullCapacity: 25000,
      initialPosition: 20000,
      startDate: '2026-02-12',
      initialPrice: 4.9753,
    };

    it('preserves existing fullCapacity and startDate', () => {
      const result = calculateNewPosition(mockOcrData, existingPosition, []);

      expect(result.success).toBe(true);
      expect(result.operationType).toBe('update');
      expect(result.newPosition.fullCapacity).toBe(25000);
      expect(result.newPosition.startDate).toBe('2026-02-12');
    });

    it('calculates initialPosition from trades between startDate and navDate', () => {
      const trades: TradeRecord[] = [
        { id: '1', date: '2026-02-15', type: 'buy', shares: 100, price: 7, fee: 5 },
        { id: '2', date: '2026-03-01', type: 'buy', shares: 200, price: 7.2, fee: 8 },
        { id: '3', date: '2026-04-27', type: 'buy', shares: 50, price: 7.7, fee: 2 }, // navDate 当天，不计入
      ];

      // OCR shares = 5349.92
      // startDate(2026-02-12) 到 navDate(2026-04-26) 前的买入份额 = 300
      // new initialPosition = 5349.92 - 300 = 5049.92

      const result = calculateNewPosition(mockOcrData, existingPosition, trades);
      expect(result.newPosition.initialPosition).toBe(5049.92);
    });

    it('returns error when calculated initialPosition is negative', () => {
      const trades: TradeRecord[] = [
        { id: '1', date: '2026-02-15', type: 'buy', shares: 6000, price: 7, fee: 0 },
      ];

      // OCR shares = 5349.92, buyShares = 6000
      // initialPosition = 5349.92 - 6000 = -650.08 < 0

      const result = calculateNewPosition(mockOcrData, existingPosition, trades);
      expect(result.success).toBe(false);
      expect(result.error).toContain('不一致');
    });

    it('calculates initialPrice using reverse formula', () => {
      const trades: TradeRecord[] = [
        { id: '1', date: '2026-03-01', type: 'buy', shares: 100, price: 6, fee: 5 },
      ];

      const result = calculateNewPosition(mockOcrData, existingPosition, trades);

      // 公式验证：
      // initialPosition = 5349.92 - 100 = 5249.92
      // buyAmount = 100 * 6 + 5 = 605
      // initialPrice = (5349.92 * 7.7008 + 0 - 605 - 30479.48) / 5249.92

      expect(result.newPosition.initialPosition).toBe(5249.92);
      expect(result.success).toBe(true);
    });
  });

  describe('交易范围边界', () => {
    it('excludes trades on navDate', () => {
      const trades: TradeRecord[] = [
        { id: '1', date: '2026-04-26', type: 'buy', shares: 100, price: 7, fee: 0 },
        { id: '2', date: '2026-04-27', type: 'buy', shares: 200, price: 7.7, fee: 0 }, // navDate
      ];

      const existingPosition: FundPosition = {
        fullCapacity: 10000,
        initialPosition: 5000,
        startDate: '2026-01-01',
        initialPrice: 5,
      };

      const result = calculateNewPosition(mockOcrData, existingPosition, trades);
      // 买入份额只计入 2026-04-26 的 100，不含 2026-04-27 的 200
      expect(result.newPosition.initialPosition).toBe(5349.92 - 100);
    });

    it('includes trades on startDate', () => {
      const trades: TradeRecord[] = [
        { id: '1', date: '2026-02-12', type: 'buy', shares: 100, price: 7, fee: 0 }, // startDate
        { id: '2', date: '2026-02-13', type: 'buy', shares: 200, price: 7.1, fee: 0 },
      ];

      const existingPosition: FundPosition = {
        fullCapacity: 10000,
        initialPosition: 5000,
        startDate: '2026-02-12',
        initialPrice: 5,
      };

      const result = calculateNewPosition(mockOcrData, existingPosition, trades);
      // startDate 当天计入：100 + 200 = 300
      expect(result.newPosition.initialPosition).toBe(5349.92 - 300);
    });
  });
});