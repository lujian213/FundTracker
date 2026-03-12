import { runVirtualTrade } from '../../services/virtualTradeEngine';
import { trendFollowingStrategy } from '../../services/virtualTradeStrategies/trendFollowing';

function makePoint(dateStr: string, value: number) {
  const ts = new Date(dateStr + 'T00:00:00').getTime();
  return { date: ts, value, equityReturn: 0 };
}

const noopStrategy = {
  name: 'noop',
  description: 'noop',
  decide: () => ({ action: 'hold' as const, shares: 0 })
} as any;

describe('runVirtualTrade', () => {
  test('fills default reason for hold when strategy returns none', () => {
    const hist = [
      makePoint('2026-01-01', 1.0),
      makePoint('2026-01-02', 1.0),
      makePoint('2026-01-03', 1.0),
    ];

    const result = runVirtualTrade(noopStrategy, hist as any, { startDate: '2026-01-01', initialCash: 1000, initialShares: 0 });
    expect(result.timeline.length).toBeGreaterThan(0);
    result.timeline.forEach(r => {
      expect(r.reason).toBeDefined();
      expect(r.reason!.text).toBeDefined();
    });
    expect(result.todayTip).toBeDefined();
    if (result.todayTip) {
      expect(result.todayTip.reason).toBeDefined();
      expect(result.todayTip.reason!.text).toBeDefined();
    }
  });

  test('uses today valuation for the final row total when history has no next-day NAV', () => {
    const hist = [
      makePoint('2026-01-01', 1.0),
      makePoint('2026-01-02', 1.1),
    ];

    const result = runVirtualTrade(noopStrategy, hist as any, {
      startDate: '2026-01-01',
      initialCash: 0,
      initialShares: 10,
      currentPrice: 1.2,
      realtimeDate: '2026-01-03',
    });

    expect(result.timeline).toHaveLength(2);
    expect(result.timeline[0].totalAfter).toBe(11);
    expect(result.timeline[1].totalAfter).toBe(12);
    expect(result.summary.finalTotal).toBe(12);
    expect(result.summary.totalProfit).toBe(2);
  });

  test('falls back to the last historical NAV for the final row when no later valuation is available', () => {
    const hist = [
      makePoint('2026-01-01', 1.0),
      makePoint('2026-01-02', 1.1),
    ];

    const result = runVirtualTrade(noopStrategy, hist as any, {
      startDate: '2026-01-01',
      initialCash: 0,
      initialShares: 10,
      currentPrice: 0,
      realtimeDate: '2026-01-03',
    });

    expect(result.timeline).toHaveLength(2);
    expect(result.timeline[1].totalAfter).toBe(11);
    expect(result.summary.finalTotal).toBe(11);
    expect(result.summary.totalProfit).toBe(1);
  });

  test('integration with trendFollowingStrategy produces buy with MA info if golden cross', () => {
    const values = [
      1,1,1,1,1,1,1,1,1,1,
      1,1,1,1,1,1,1,1,1,1,
      2,1
    ];
    const hist = values.map((v, i) => makePoint(`2026-01-${String(i+1).padStart(2,'0')}`, v));
    const res = runVirtualTrade(trendFollowingStrategy as any, hist as any, { startDate: '2026-01-01', initialCash: 10000, initialShares: 0 });
    expect(res.timeline.length).toBeGreaterThan(0);
    const buyRows = res.timeline.filter(r => r.action === 'buy');
    expect(buyRows.length).toBeGreaterThan(0);
    expect(buyRows[0].reason).toBeDefined();
    expect(buyRows[0].reason!.text).toMatch(/MA5 上穿 MA20/);
    expect(buyRows[0].reason!.ma).toBeDefined();
    expect(typeof buyRows[0].reason!.ma!.shortYesterday).toBe('number');
    expect(typeof buyRows[0].reason!.ma!.longYesterday).toBe('number');
  });
});
