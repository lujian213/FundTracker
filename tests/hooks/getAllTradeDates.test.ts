import { getAllTradeDates, readAll, setTradesForSymbol, addTradeForSymbol } from '../../hooks/useTrades';
import { resetCache as resetMarketFundCache } from '../../services/marketFundService';

describe('getAllTradeDates', () => {
  beforeEach(() => {
    localStorage.clear();
    resetMarketFundCache();
  });

  test('returns empty array when no trades exist', () => {
    expect(getAllTradeDates()).toEqual([]);
  });

  test('returns unique dates from a single symbol, descending', () => {
    setTradesForSymbol('F001', [
      { id: '1', date: '2026-01-10', type: 'buy', shares: 100, price: 1.0, fee: 0 },
      { id: '2', date: '2026-01-15', type: 'sell', shares: 50, price: 1.1, fee: 0 },
      { id: '3', date: '2026-01-10', type: 'buy', shares: 200, price: 1.0, fee: 0 }, // duplicate date
    ] as any);

    const dates = getAllTradeDates();
    expect(dates).toEqual(['2026-01-15', '2026-01-10']); // deduplicated, descending
  });

  test('merges dates across multiple symbols and deduplicates', () => {
    setTradesForSymbol('F001', [
      { id: 'a', date: '2026-02-01', type: 'buy', shares: 100, price: 1.0, fee: 0 },
    ] as any);
    setTradesForSymbol('F002', [
      { id: 'b', date: '2026-02-01', type: 'buy', shares: 200, price: 2.0, fee: 0 }, // same date as F001
      { id: 'c', date: '2026-02-20', type: 'sell', shares: 100, price: 2.1, fee: 1 },
    ] as any);

    const dates = getAllTradeDates();
    expect(dates).toEqual(['2026-02-20', '2026-02-01']); // merged & deduplicated, descending
  });

  test('sorts descending (most recent first)', () => {
    setTradesForSymbol('F001', [
      { id: 'x', date: '2025-12-31', type: 'buy', shares: 10, price: 1.0, fee: 0 },
      { id: 'y', date: '2026-03-01', type: 'buy', shares: 10, price: 1.0, fee: 0 },
      { id: 'z', date: '2026-01-15', type: 'sell', shares: 5, price: 1.1, fee: 0 },
    ] as any);

    const dates = getAllTradeDates();
    expect(dates[0]).toBe('2026-03-01');
    expect(dates[dates.length - 1]).toBe('2025-12-31');
    // verify strictly descending
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i] > dates[i + 1]).toBe(true);
    }
  });
});

describe('readAll', () => {
  beforeEach(() => {
    localStorage.clear();
    resetMarketFundCache();
  });

  test('returns empty object when localStorage is empty', () => {
    expect(readAll()).toEqual({});
  });

  test('returns all trades grouped by symbol', () => {
    addTradeForSymbol('S1', { id: 'r1', date: '2026-01-01', type: 'buy', shares: 10, price: 1.0, fee: 0 } as any);
    addTradeForSymbol('S2', { id: 'r2', date: '2026-01-02', type: 'sell', shares: 5, price: 1.5, fee: 0.5 } as any);

    const all = readAll();
    expect(Object.keys(all)).toContain('S1');
    expect(Object.keys(all)).toContain('S2');
    expect(all['S1'][0].id).toBe('r1');
    expect(all['S2'][0].id).toBe('r2');
  });
});

