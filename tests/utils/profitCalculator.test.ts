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
    // The original history API returns a point for 2026-03-03, and computeOverallProfit
    // appends a synthetic point at 15:00 local on the same day (from fd.netWorthDate).
    // Both timestamps map to the same local date "2026-03-03".
    // Before the fix, the sell trade was applied twice — once per history point.

    // Use Date.UTC so the timestamps are timezone-independent: tsToISODate uses new Date(ts)
    // which formats in local time, so we pick UTC hours that stay on 2026-03-03 in any timezone
    // (UTC+0 to UTC+14): use 12:00 UTC and 07:00 UTC — both are 2026-03-03 in UTC+0..+14.
    const d0302 = Date.UTC(2026, 2, 2, 12, 0, 0);   // 2026-03-02 12:00 UTC
    const d0303a = Date.UTC(2026, 2, 3, 7, 0, 0);   // 2026-03-03 07:00 UTC  (original history point)
    const d0303b = Date.UTC(2026, 2, 3, 12, 0, 0);  // 2026-03-03 12:00 UTC  (synthetic duplicate)

    const history: HistoricalPoint[] = [
      { date: d0302,  value: 1.5956, equityReturn: 0 },
      { date: d0303a, value: 1.66,   equityReturn: 0 },
      { date: d0303b, value: 1.66,   equityReturn: 0 },
    ];

    // Verify our timestamps actually map to the expected local dates via tsToISODate logic
    const toISO = (ts: number) => {
      const d = new Date(ts);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    };
    expect(toISO(d0302)).toBe('2026-03-02');
    expect(toISO(d0303a)).toBe('2026-03-03');
    expect(toISO(d0303b)).toBe('2026-03-03');

    const trades: TradeRecord[] = [
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
    // Both points at UTC hours that stay on 2026-03-03 in any timezone (UTC+0..+14)
    const d0303a = Date.UTC(2026, 2, 3, 7, 0, 0);
    const d0303b = Date.UTC(2026, 2, 3, 12, 0, 0);

    const history: HistoricalPoint[] = [
      { date: d0303a, value: 2.0, equityReturn: 0 },
      { date: d0303b, value: 2.0, equityReturn: 0 },
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
