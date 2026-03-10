import { aggregateTradesByDate } from '../../utils/tradeAggregation';
import { toLocalDateKey } from '../../utils/priceResolver';

describe('aggregateTradesByDate', () => {
  test('aggregates multiple trades on same date into single marker with correct sign and amounts', () => {
    const today = Date.now();
    const dateKey = toLocalDateKey(today);
    const trades = [
      { id: '1', date: dateKey, type: 'buy', shares: 10, price: 1.2, fee: 0 },
      { id: '2', date: dateKey, type: 'sell', shares: 5, price: 1.25, fee: 0 },
    ];
    const chartData = [ { date: today, value: 1.0 } ];
    const points = [ { x: 10, y: 20, data: chartData[0] } ];

    const markers = aggregateTradesByDate(trades as any, chartData as any, points as any);
    expect(markers.length).toBe(1);
    const m = markers[0];
    // sells - buys = -5 -> negative -> type 'buy'
    expect(m.type).toBe('buy');
    expect(m.shares).toBe(5);
    // amount = sellsAmt - buysAmt = (5*1.25) - (10*1.2) = 6.25 - 12 = -5.75 -> abs 5.75
    expect(Math.abs(m.amount - 5.75)).toBeLessThan(1e-6);
    expect(m.x).toBe(10);
    expect(m.y).toBe(20);
  });
});
