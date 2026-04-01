import { computePositionSharesByDate, prepareVolumeBars } from '../../utils/tradeVolumeHelper';
import { TradeRecord } from '../../types';

describe('computePositionSharesByDate', () => {
  test('calculates position shares for each date correctly', () => {
    const initialShares = 100;
    const trades: TradeRecord[] = [
      { id: '1', date: '2026-01-10', type: 'buy', shares: 50, price: 1.0, fee: 0 },
      { id: '2', date: '2026-01-15', type: 'sell', shares: 30, price: 1.2, fee: 0 },
      { id: '3', date: '2026-01-20', type: 'buy', shares: 20, price: 1.1, fee: 0 },
    ];
    const dates = ['2026-01-05', '2026-01-10', '2026-01-15', '2026-01-20', '2026-01-25'];

    const result = computePositionSharesByDate(initialShares, trades, dates);

    // 2026-01-05: 无交易，持仓 = 初始 100
    expect(result.get('2026-01-05')).toBe(100);
    // 2026-01-10: 买入 50，持仓 = 100 + 50 = 150
    expect(result.get('2026-01-10')).toBe(150);
    // 2026-01-15: 卖出 30，持仓 = 150 - 30 = 120
    expect(result.get('2026-01-15')).toBe(120);
    // 2026-01-20: 买入 20，持仓 = 120 + 20 = 140
    expect(result.get('2026-01-20')).toBe(140);
    // 2026-01-25: 无交易，持仓保持 140
    expect(result.get('2026-01-25')).toBe(140);
  });

  test('returns empty map for empty dates', () => {
    const result = computePositionSharesByDate(100, [], []);
    expect(result.size).toBe(0);
  });

  test('handles zero initial shares', () => {
    const trades: TradeRecord[] = [
      { id: '1', date: '2026-01-10', type: 'buy', shares: 50, price: 1.0, fee: 0 },
    ];
    const dates = ['2026-01-10'];

    const result = computePositionSharesByDate(0, trades, dates);
    expect(result.get('2026-01-10')).toBe(50);
  });

  test('sorts trades by date before processing', () => {
    const initialShares = 100;
    // 交易记录顺序颠倒
    const trades: TradeRecord[] = [
      { id: '3', date: '2026-01-20', type: 'buy', shares: 20, price: 1.1, fee: 0 },
      { id: '1', date: '2026-01-10', type: 'buy', shares: 50, price: 1.0, fee: 0 },
      { id: '2', date: '2026-01-15', type: 'sell', shares: 30, price: 1.2, fee: 0 },
    ];
    const dates = ['2026-01-10', '2026-01-15', '2026-01-20'];

    const result = computePositionSharesByDate(initialShares, trades, dates);
    expect(result.get('2026-01-10')).toBe(150);
    expect(result.get('2026-01-15')).toBe(120);
    expect(result.get('2026-01-20')).toBe(140);
  });
});

describe('prepareVolumeBars', () => {
  test('prepares volume bars from trades and date-to-x mapping', () => {
    const trades: TradeRecord[] = [
      { id: '1', date: '2026-01-10', type: 'buy', shares: 100, price: 1.0, fee: 0 },
      { id: '2', date: '2026-01-15', type: 'sell', shares: 50, price: 1.2, fee: 0 },
      { id: '3', date: '2026-01-15', type: 'buy', shares: 30, price: 1.1, fee: 0 }, // 同一天多笔交易
    ];
    const dateToX = new Map<string, number>();
    dateToX.set('2026-01-10', 100);
    dateToX.set('2026-01-15', 200);

    const { bars, maxBarShares } = prepareVolumeBars(trades, dateToX);

    expect(bars.length).toBe(2);
    // 2026-01-10: 只有买入 100
    expect(bars[0].date).toBe('2026-01-10');
    expect(bars[0].x).toBe(100);
    expect(bars[0].type).toBe('buy');
    expect(bars[0].shares).toBe(100);

    // 2026-01-15: 卖出 50 > 买入 30，净卖出，显示为卖出
    expect(bars[1].date).toBe('2026-01-15');
    expect(bars[1].x).toBe(200);
    expect(bars[1].type).toBe('sell');
    expect(bars[1].shares).toBe(20); // 50 - 30 = 20

    // maxBarShares 应该是最大值 100
    expect(maxBarShares).toBe(100);
  });

  test('aggregates multiple trades on same date', () => {
    const trades: TradeRecord[] = [
      { id: '1', date: '2026-01-10', type: 'buy', shares: 100, price: 1.0, fee: 0 },
      { id: '2', date: '2026-01-10', type: 'buy', shares: 50, price: 1.0, fee: 0 },
      { id: '3', date: '2026-01-10', type: 'sell', shares: 30, price: 1.0, fee: 0 },
    ];
    const dateToX = new Map<string, number>();
    dateToX.set('2026-01-10', 100);

    const { bars, maxBarShares } = prepareVolumeBars(trades, dateToX);

    expect(bars.length).toBe(1);
    expect(bars[0].shares).toBe(120); // 100 + 50 - 30 = 120 (净买入)
    expect(bars[0].type).toBe('buy');
    expect(maxBarShares).toBe(120);
  });

  test('skips trades with no x mapping', () => {
    const trades: TradeRecord[] = [
      { id: '1', date: '2026-01-10', type: 'buy', shares: 100, price: 1.0, fee: 0 },
      { id: '2', date: '2026-01-20', type: 'buy', shares: 50, price: 1.0, fee: 0 }, // 无 x 映射
    ];
    const dateToX = new Map<string, number>();
    dateToX.set('2026-01-10', 100);

    const { bars } = prepareVolumeBars(trades, dateToX);

    expect(bars.length).toBe(1);
    expect(bars[0].date).toBe('2026-01-10');
  });

  test('returns empty array for empty trades', () => {
    const { bars, maxBarShares } = prepareVolumeBars([], new Map());
    expect(bars.length).toBe(0);
    expect(maxBarShares).toBe(1);
  });

  test('handles zero net result (no bar created)', () => {
    const trades: TradeRecord[] = [
      { id: '1', date: '2026-01-10', type: 'buy', shares: 50, price: 1.0, fee: 0 },
      { id: '2', date: '2026-01-10', type: 'sell', shares: 50, price: 1.0, fee: 0 },
    ];
    const dateToX = new Map<string, number>();
    dateToX.set('2026-01-10', 100);

    const { bars } = prepareVolumeBars(trades, dateToX);

    expect(bars.length).toBe(0); // 买入=卖出，不显示柱子
  });
});