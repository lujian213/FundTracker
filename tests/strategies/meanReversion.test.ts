import { meanReversionStrategy } from '../../services/virtualTradeStrategies/meanReversion';
import { VirtualStrategyContext } from '../../types';

function makePoint(dateStr: string, value: number) {
  const ts = new Date(dateStr + 'T00:00:00').getTime();
  return { date: ts, value, equityReturn: 0 };
}

describe('meanReversionStrategy', () => {
  test('returns insufficient when history too short', () => {
    const ctx: VirtualStrategyContext = { history: [], cash: 10000, shares: 0, baseUnit: 1, startNav: 1 };
    const res = meanReversionStrategy.decide(ctx) as any;
    expect(res.action).toBe('hold');
    expect(res.reason).toBeDefined();
    expect(res.reason.type).toBe('insufficient');
  });

  test('detect buy when price below lower band', () => {
    // construct history of 20 points where last value is low (0.5) and previous are 1.0
    const start = new Date('2026-01-01T00:00:00');
    const hist: any[] = [];
    for (let i = 0; i < 20; i++) {
      const d = new Date(start.getTime());
      d.setDate(start.getDate() + i);
      hist.push(makePoint(d.toISOString().slice(0,10), i === 19 ? 0.5 : 1.0));
    }
    const ctx: VirtualStrategyContext = { history: hist, cash: 10000, shares: 0, baseUnit: 1000, startNav: 1 };
    const res = meanReversionStrategy.decide(ctx) as any;
    expect(res.action).toBe('buy');
    expect(res.shares).toBeGreaterThanOrEqual(0);
    expect(res.reason).toBeDefined();
    expect(res.reason.text).toMatch(/低于下轨/);
  });

  test('detect sell when price above upper band', () => {
    const start = new Date('2026-01-01T00:00:00');
    const hist: any[] = [];
    for (let i = 0; i < 20; i++) {
      const d = new Date(start.getTime());
      d.setDate(start.getDate() + i);
      hist.push(makePoint(d.toISOString().slice(0,10), i === 19 ? 2.0 : 1.0));
    }
    const ctx: VirtualStrategyContext = { history: hist, cash: 10000, shares: 100, baseUnit: 1000, startNav: 1 };
    const res = meanReversionStrategy.decide(ctx) as any;
    expect(res.action).toBe('sell');
    expect(res.shares).toBeGreaterThanOrEqual(0);
    expect(res.reason).toBeDefined();
    expect(res.reason.text).toMatch(/高于上轨/);
  });

  test('returns hold when price within bands', () => {
    const start = new Date('2026-01-01T00:00:00');
    const hist: any[] = [];
    for (let i = 0; i < 20; i++) {
      const d = new Date(start.getTime());
      d.setDate(start.getDate() + i);
      hist.push(makePoint(d.toISOString().slice(0,10), 1.0));
    }
    const ctx: VirtualStrategyContext = { history: hist, cash: 10000, shares: 10, baseUnit: 1000, startNav: 1 };
    const res = meanReversionStrategy.decide(ctx) as any;
    expect(res.action).toBe('hold');
    expect(res.shares).toBe(0);
    expect(res.reason).toBeDefined();
    expect(res.reason.text).toMatch(/观望|保持/);
  });
});
