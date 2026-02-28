import { computeProfitTimeline } from '../../utils/profitCalculator';
import { HistoricalPoint } from '../../types';
import { TradeRecord } from '../../hooks/useTrades';

describe('profitCalculator', () => {
  test('computes profit timeline basic scenario', () => {
    // history: three days net values
    const history: HistoricalPoint[] = [
      { date: new Date('2026-02-20').getTime(), value: 10, equityReturn: 0 },
      { date: new Date('2026-02-21').getTime(), value: 12, equityReturn: 0 },
      { date: new Date('2026-02-22').getTime(), value: 11, equityReturn: 0 }
    ];
    // trades: initial position 100 shares at price 9; buy 50 on 2026-02-21 at price 11 with fee 0
    const trades: TradeRecord[] = [
      { id: 't1', date: '2026-02-21', type: 'buy', shares: 50, price: 11, fee: 0 }
    ];
    const timeline = computeProfitTimeline({ history, trades, initialPosition: 100, initialPrice: 9 });
    // check first day: shares=100, netValue=10, initCost=900, cumulative = 100*10 - 900 = 100
    expect(timeline[0].date).toBe('2026-02-20');
    expect(timeline[0].shares).toBe(100);
    expect(timeline[0].cumulativeProfit).toBeCloseTo(100);
    // second day: after buy shares=150, netValue=12, cumulative = 150*12 - 900 - buyAmount(50*11)=150*12 -900 -550 = 1800 - 1450 = 350
    expect(timeline[1].date).toBe('2026-02-21');
    expect(timeline[1].shares).toBe(150);
    expect(timeline[1].cumulativeProfit).toBeCloseTo(350);
    // daily profits
    expect(timeline[0].dailyProfit).toBeCloseTo(100); // first day relative to previous (0)
    expect(timeline[1].dailyProfit).toBeCloseTo(250); // 350 - 100
    expect(timeline[2].dailyProfit).toBeCloseTo(-150); // 3rd day: shares=150, net=11 => cumulative=150*11 - 900 - 550 = 1650 - 1450 = 200 => daily=200-350=-150
    expect(timeline[2].cumulativeProfit).toBeCloseTo(200);
  });

  test('honors fromDate and toDate and accumulates earlier trades', () => {
    const history: HistoricalPoint[] = [
      { date: new Date('2026-02-18').getTime(), value: 9, equityReturn: 0 },
      { date: new Date('2026-02-19').getTime(), value: 9.5, equityReturn: 0 },
      { date: new Date('2026-02-20').getTime(), value: 10, equityReturn: 0 },
      { date: new Date('2026-02-21').getTime(), value: 11, equityReturn: 0 }
    ];
    const trades: TradeRecord[] = [
      { id: 't0', date: '2026-02-19', type: 'buy', shares: 10, price: 9.5, fee: 0 },
      { id: 't1', date: '2026-02-21', type: 'sell', shares: 5, price: 11, fee: 0 }
    ];
    const timeline = computeProfitTimeline({ history, trades, initialPosition: 20, initialPrice: 9, fromDate: '2026-02-20', toDate: '2026-02-21' });
    // timeline should have two entries only
    expect(timeline.length).toBe(2);
    // ensure earlier buy on 19th is counted into holdings on 20th
    expect(timeline[0].shares).toBe(30); // initial 20 + buy 10
  });
});
