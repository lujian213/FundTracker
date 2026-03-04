import { computeProfitTimeline } from '../../utils/profitCalculator';
import { HistoricalPoint } from '../../types';
import { TradeRecord } from '../../hooks/useTrades';

describe('profitCalculator', () => {
  test('computes profit timeline basic scenario', () => {
    const history: HistoricalPoint[] = [
      { date: new Date('2026-02-20').getTime(), value: 10, equityReturn: 0 },
      { date: new Date('2026-02-21').getTime(), value: 12, equityReturn: 0 },
      { date: new Date('2026-02-22').getTime(), value: 11, equityReturn: 0 }
    ];
    const trades: TradeRecord[] = [
      { id: 't1', date: '2026-02-21', type: 'buy', shares: 50, price: 11, fee: 0 }
    ];
    const timeline = computeProfitTimeline({ history, trades, initialPosition: 100, initialPrice: 9 });
    expect(timeline[0].date).toBe('2026-02-20');
    expect(timeline[0].shares).toBe(100);
    expect(timeline[0].cumulativeProfit).toBeCloseTo(100);
    expect(timeline[1].date).toBe('2026-02-21');
    expect(timeline[1].shares).toBe(150);
    expect(timeline[1].cumulativeProfit).toBeCloseTo(350);
    expect(timeline[0].dailyProfit).toBeCloseTo(100);
    expect(timeline[1].dailyProfit).toBeCloseTo(250);
    expect(timeline[2].dailyProfit).toBeCloseTo(-150);
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
    expect(timeline.length).toBe(2);
    expect(timeline[0].shares).toBe(30);
  });

  // ── Regression: duplicate history points must not cause double trade application ──

  test('does not double-count trades when history has two points on the same date', () => {
    // Simulate the scenario seen with 023832:
    // The original history API returns a point at 00:00 UTC on 2026-03-03,
    // and computeOverallProfit appends a synthetic point at 15:00 on the same day
    // (from fd.netWorthDate / fd.previousPrice).  The two timestamps map to the
    // same local date "2026-03-03".  Before the fix, the sell trade on 2026-03-03
    // was applied twice — once per history point — causing shares and cumulative
    // profit to be wrong by exactly the fee amount.

    const ts = (iso: string, hour = 0) =>
      new Date(`${iso}T${String(hour).padStart(2,'0')}:00:00+08:00`).getTime();

    const history: HistoricalPoint[] = [
      // 2026-03-02: original history point
      { date: ts('2026-03-02', 15), value: 1.5956, equityReturn: 0 },
      // 2026-03-03: original history point (e.g. from API at midnight UTC = 08:00 CST)
      { date: ts('2026-03-03', 0),  value: 1.66,   equityReturn: 0 },
      // 2026-03-03: synthetic point appended by computeOverallProfit at 15:00 local
      { date: ts('2026-03-03', 15), value: 1.66,   equityReturn: 0 },
    ];

    const trades: TradeRecord[] = [
      // sell 7000 shares on 2026-03-03 with fee 11.62
      { id: 's1', date: '2026-03-03', type: 'sell', shares: 7000, price: 1.66, fee: 11.62 },
    ];

    const initialPosition = 13831.32;
    const initialPrice    = 1.3737;

    const timeline = computeProfitTimeline({
      history,
      trades,
      initialPosition,
      initialPrice,
      fromDate: null,
      toDate:   null,
    });

    // Find the 2026-03-03 entries.
    // computeProfitTimeline outputs one row per input history point, so two same-date points
    // → two output rows. What must NOT happen is trades being applied twice.
    const entries0303 = timeline.filter(p => p.date === '2026-03-03');
    expect(entries0303.length).toBe(2); // one row per input history point

    // Both rows must reflect the sell having been applied ONCE:
    // remaining shares = initialPosition - 7000 = 6831.32
    const expectedShares = initialPosition - 7000;
    for (const entry of entries0303) {
      expect(entry.shares).toBeCloseTo(expectedShares, 4);
    }

    // sellAmount applied once = 1.66 * 7000 - 11.62 = 11608.38
    const sellAmount  = 1.66 * 7000 - 11.62;
    const initCost    = initialPosition * initialPrice;
    const expectedCum = expectedShares * 1.66 - initCost + sellAmount;

    for (const entry of entries0303) {
      expect(entry.cumulativeProfit).toBeCloseTo(expectedCum, 2);
    }

    // The 2026-03-02 entry should have full initialPosition shares (no trades yet)
    const entry0302 = timeline.find(p => p.date === '2026-03-02');
    expect(entry0302).toBeDefined();
    expect(entry0302!.shares).toBeCloseTo(initialPosition, 4);
  });

  test('sells on a date that appears twice in history: shares only decrease once', () => {
    // Simplified version: only check that runningSellShares is not doubled.
    const mkTs = (iso: string, h: number) =>
      new Date(`${iso}T${String(h).padStart(2,'0')}:00:00Z`).getTime();

    const history: HistoricalPoint[] = [
      { date: mkTs('2026-03-03', 0),  value: 2.0, equityReturn: 0 }, // first point
      { date: mkTs('2026-03-03', 7),  value: 2.0, equityReturn: 0 }, // synthetic duplicate
    ];
    const trades: TradeRecord[] = [
      { id: 'x1', date: '2026-03-03', type: 'sell', shares: 500, price: 2.0, fee: 1.0 },
    ];

    const timeline = computeProfitTimeline({
      history,
      trades,
      initialPosition: 1000,
      initialPrice: 1.5,
    });

    // Two history points → two output rows
    expect(timeline.filter(p => p.date === '2026-03-03').length).toBe(2);

    // Both rows must reflect a single sell application: shares = 1000 - 500 = 500 (NOT 0)
    for (const row of timeline.filter(p => p.date === '2026-03-03')) {
      expect(row.shares).toBe(500);
    }

    // cumulativeProfit = 500*2 - 1000*1.5 + (2*500 - 1) = 1000 - 1500 + 999 = 499
    for (const row of timeline.filter(p => p.date === '2026-03-03')) {
      expect(row.cumulativeProfit).toBeCloseTo(499, 4);
    }
  });
});
