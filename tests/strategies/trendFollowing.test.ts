import { trendFollowingStrategy } from '../../services/virtualTradeStrategies/trendFollowing';
import { VirtualStrategyContext } from '../../types';

function makePoint(dateStr: string, value: number) {
  // create timestamp at 00:00 local
  const ts = new Date(dateStr + 'T00:00:00').getTime();
  return { date: ts, value, equityReturn: 0 };
}

describe('trendFollowingStrategy', () => {
  test('returns insufficient-data reason when history empty', () => {
    const ctx: VirtualStrategyContext = { history: [], cash: 100000, shares: 0, baseUnit: 1, startNav: 1 };
    const res = trendFollowingStrategy.decide(ctx) as any;
    expect(res.action).toBe('hold');
    expect(res.reason).toBeDefined();
    expect(res.reason.text).toMatch(/历史数据不足/);
    expect(res.reason.type).toBe('insufficient');
  });

  test('detects golden cross and includes MA values and date in reason', () => {
    // build 21 days history so MA5 and MA20 are computable
    const start = new Date('2026-01-01T00:00:00');
    const hist = [] as any[];
    // Create 21 values: first 20 mostly 1, last value is 2 to trigger MA5 > MA20
    const values: number[] = [
      1,1,1,1,1,1,1,1,1,1,
      1,1,1,1,1,1,1,1,1,1,
      2
    ];
    for (let i = 0; i < values.length; i++) {
      const d = new Date(start.getTime());
      d.setDate(start.getDate() + i);
      hist.push(makePoint(d.toISOString().slice(0,10), values[i]));
    }

    const ctx: VirtualStrategyContext = { history: hist, cash: 100000, shares: 0, baseUnit: 1, startNav: 1 };
    const res = trendFollowingStrategy.decide(ctx) as any;

    expect(res.action).toBe('buy');
    expect(typeof res.shares).toBe('number');
    expect(res.reason).toBeDefined();
    expect(res.reason.text).toMatch(/MA5 上穿 MA20/);
    // should include date of last point (YYYY-MM-DD)
    const lastDate = new Date(hist[hist.length-1].date);
    const y = lastDate.getFullYear();
    const m = String(lastDate.getMonth() + 1).padStart(2, '0');
    const d = String(lastDate.getDate()).padStart(2, '0');
    const dateKey = `${y}-${m}-${d}`;
    expect(res.reason.date).toBe(dateKey);
    // should include MA numeric values
    expect(res.reason.ma).toBeDefined();
    expect(typeof res.reason.ma.shortYesterday).toBe('number');
    expect(typeof res.reason.ma.longYesterday).toBe('number');
  });
});


