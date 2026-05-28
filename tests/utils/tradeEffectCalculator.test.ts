import { findNextValidTradeDate, calculateTradeEffect, calculateDateTradeEffect } from '../../utils/tradeEffectCalculator';
import { HistoricalPoint, ValuationData } from '../../types';

// Helper: create noon timestamp for a date (timezone-safe)
// Using noon (12:00 local) ensures getDate() returns correct day in any timezone
function noonTs(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day, 12, 0, 0).getTime();
}

describe('findNextValidTradeDate', () => {
  test('returns next date with higher net value', () => {
    // 历史净值：2026-05-20=1.0, 2026-05-22=1.1
    const history: HistoricalPoint[] = [
      { date: noonTs(2026, 5, 20), value: 1.0, equityReturn: 0 },
      { date: noonTs(2026, 5, 22), value: 1.1, equityReturn: 0 },
    ];
    const result = findNextValidTradeDate(history, '2026-05-20');
    expect(result).not.toBeNull();
    expect(result!.date).toBe('2026-05-22');
    expect(result!.netValue).toBe(1.1);
  });

  test('returns null when no future date in history', () => {
    const history: HistoricalPoint[] = [
      { date: noonTs(2026, 5, 20), value: 1.0, equityReturn: 0 },
    ];
    const result = findNextValidTradeDate(history, '2026-05-20');
    expect(result).toBeNull();
  });

  test('uses valuation when no future history and valuation date is later', () => {
    const history: HistoricalPoint[] = [
      { date: noonTs(2026, 5, 20), value: 1.0, equityReturn: 0 },
    ];
    const valuation: ValuationData = {
      symbol: 'test',
      name: 'test',
      currentPrice: 1.2,
      previousPrice: 1.0,
      changePercentage: 20,
      lastUpdated: '2026-05-22 15:00',
      realtimeDate: '2026-05-22',
      netWorthDate: '2026-05-20',
      valuationDate: '2026-05-22',
      sourceUrl: '',
    };
    const result = findNextValidTradeDate(history, '2026-05-20', valuation);
    expect(result).not.toBeNull();
    expect(result!.date).toBe('2026-05-22');
    expect(result!.netValue).toBe(1.2);
  });

  test('returns null when valuation date equals current date', () => {
    const history: HistoricalPoint[] = [];
    const valuation: ValuationData = {
      symbol: 'test',
      name: 'test',
      currentPrice: 1.2,
      previousPrice: 1.0,
      changePercentage: 20,
      lastUpdated: '2026-05-20 15:00',
      realtimeDate: '2026-05-20',
      netWorthDate: '2026-05-19',
      valuationDate: '2026-05-20',
      sourceUrl: '',
    };
    const result = findNextValidTradeDate(history, '2026-05-20', valuation);
    expect(result).toBeNull();
  });

  test('returns null when valuation date is earlier than current', () => {
    const history: HistoricalPoint[] = [];
    const valuation: ValuationData = {
      symbol: 'test',
      name: 'test',
      currentPrice: 1.2,
      previousPrice: 1.0,
      changePercentage: 20,
      lastUpdated: '2026-05-19 15:00',
      realtimeDate: '2026-05-19',
      netWorthDate: '2026-05-18',
      valuationDate: '2026-05-19',
      sourceUrl: '',
    };
    const result = findNextValidTradeDate(history, '2026-05-20', valuation);
    expect(result).toBeNull();
  });
});

describe('calculateTradeEffect', () => {
  test('buy with positive effect (NAV rises)', () => {
    // 买入100份，当日净值1.0，下日净值1.1，手续费5
    // 盈亏 = (1.1 - 1.0) * 100 - 5 = 10 - 5 = 5
    const trade = { type: 'buy' as const, shares: 100, fee: 5 };
    const currentNav = 1.0;
    const nextValidDate = { date: '2026-05-22', netValue: 1.1 };
    const result = calculateTradeEffect(trade, currentNav, nextValidDate);
    expect(result).toBeCloseTo(5);
  });

  test('buy with negative effect (NAV falls)', () => {
    // 买入100份，当日净值1.1，下日净值1.0，手续费5
    // 盈亏 = (1.0 - 1.1) * 100 - 5 = -10 - 5 = -15
    const trade = { type: 'buy' as const, shares: 100, fee: 5 };
    const currentNav = 1.1;
    const nextValidDate = { date: '2026-05-22', netValue: 1.0 };
    const result = calculateTradeEffect(trade, currentNav, nextValidDate);
    expect(result).toBeCloseTo(-15);
  });

  test('sell with negative effect (NAV rises)', () => {
    // 卖出100份，当日净值1.0，下日净值1.1，手续费5
    // 净交易份额 = -100
    // 盈亏 = (1.1 - 1.0) * (-100) - 5 = -10 - 5 = -15
    const trade = { type: 'sell' as const, shares: 100, fee: 5 };
    const currentNav = 1.0;
    const nextValidDate = { date: '2026-05-22', netValue: 1.1 };
    const result = calculateTradeEffect(trade, currentNav, nextValidDate);
    expect(result).toBeCloseTo(-15);
  });

  test('sell with positive effect (NAV falls)', () => {
    // 卖出100份，当日净值1.1，下日净值1.0，手续费5
    // 净交易份额 = -100
    // 盈亏 = (1.0 - 1.1) * (-100) - 5 = 10 - 5 = 5
    const trade = { type: 'sell' as const, shares: 100, fee: 5 };
    const currentNav = 1.1;
    const nextValidDate = { date: '2026-05-22', netValue: 1.0 };
    const result = calculateTradeEffect(trade, currentNav, nextValidDate);
    expect(result).toBeCloseTo(5);
  });

  test('returns null when nextValidDate is null', () => {
    const trade = { type: 'buy' as const, shares: 100, fee: 5 };
    const currentNav = 1.0;
    const result = calculateTradeEffect(trade, currentNav, null);
    expect(result).toBeNull();
  });

  test('returns 0 when NAV unchanged and no fee', () => {
    const trade = { type: 'buy' as const, shares: 100, fee: 0 };
    const currentNav = 1.0;
    const nextValidDate = { date: '2026-05-22', netValue: 1.0 };
    const result = calculateTradeEffect(trade, currentNav, nextValidDate);
    expect(result).toBe(0);
  });
});

describe('calculateDateTradeEffect', () => {
  test('sums multiple trade effects', () => {
    const tradesWithNav = [
      { trade: { type: 'buy' as const, shares: 100, fee: 5 }, currentNav: 1.0, nextValidDate: { date: '2026-05-22', netValue: 1.1 } },
      { trade: { type: 'sell' as const, shares: 50, fee: 3 }, currentNav: 1.0, nextValidDate: { date: '2026-05-22', netValue: 1.1 } },
    ];
    const result = calculateDateTradeEffect(tradesWithNav);
    expect(result).toBeCloseTo(-3);
  });

  test('returns null when all trades have null effect', () => {
    const tradesWithNav = [
      { trade: { type: 'buy' as const, shares: 100, fee: 5 }, currentNav: 1.0, nextValidDate: null },
      { trade: { type: 'sell' as const, shares: 50, fee: 3 }, currentNav: 1.0, nextValidDate: null },
    ];
    const result = calculateDateTradeEffect(tradesWithNav);
    expect(result).toBeNull();
  });

  test('sums only valid effects when some are null', () => {
    const tradesWithNav = [
      { trade: { type: 'buy' as const, shares: 100, fee: 5 }, currentNav: 1.0, nextValidDate: { date: '2026-05-22', netValue: 1.1 } },
      { trade: { type: 'sell' as const, shares: 50, fee: 3 }, currentNav: 1.0, nextValidDate: null },
    ];
    const result = calculateDateTradeEffect(tradesWithNav);
    expect(result).toBeCloseTo(5);
  });

  test('returns 0 when sum is exactly 0', () => {
    const tradesWithNav = [
      { trade: { type: 'buy' as const, shares: 100, fee: 0 }, currentNav: 1.0, nextValidDate: { date: '2026-05-22', netValue: 1.0 } },
    ];
    const result = calculateDateTradeEffect(tradesWithNav);
    expect(result).toBe(0);
  });
});