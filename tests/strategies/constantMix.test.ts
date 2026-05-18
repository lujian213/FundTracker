import { constantMixStrategy } from '../../services/virtualTradeStrategies/constantMix';
import { VirtualStrategyContext } from '../../types';

function makePoint(dateStr: string, value: number) {
  const ts = new Date(dateStr + 'T00:00:00').getTime();
  return { date: ts, value, equityReturn: 0 };
}

describe('constantMixStrategy', () => {
  test('returns insufficient when history empty', () => {
    const ctx: VirtualStrategyContext = { history: [], cash: 10000, shares: 0, baseUnit: 1, startNav: 1 };
    const res = constantMixStrategy.decide(ctx) as any;
    expect(res.action).toBe('hold');
    expect(res.reason).toBeDefined();
    expect(res.reason.type).toBe('insufficient');
  });

  test('returns hold when within threshold', () => {
    const hist = [makePoint('2026-01-01', 1.0)];
    // holding value 52, cash 48 -> ratio 0.52, target 0.5, deviation 0.02 < 0.05
    const ctx: VirtualStrategyContext = { history: hist as any, cash: 48, shares: 52, baseUnit: 1, startNav: 1 };
    const res = constantMixStrategy.decide(ctx) as any;
    expect(res.action).toBe('hold');
    expect(res.shares).toBe(0);
    expect(res.reason).toBeDefined();
    expect(res.reason.text).toMatch(/偏离/);
  });

  test('buys to rebalance when below target beyond threshold', () => {
    const hist = [makePoint('2026-01-01', 1.0)];
    // cash 600, shares 400 -> holding 400, total 1000, current_ratio 0.4 -> need buy 100 (>= min_unit 100)
    const ctx: VirtualStrategyContext = { history: hist as any, cash: 600, shares: 400, baseUnit: 1, startNav: 1 };
    const res = constantMixStrategy.decide(ctx) as any;
    expect(res.action).toBe('buy');
    expect(res.shares).toBe(100);
    expect(res.reason).toBeDefined();
    expect(res.reason.text).toMatch(/买入/);
  });

  test('sells to rebalance when above target beyond threshold', () => {
    const hist = [makePoint('2026-01-01', 1.0)];
    // cash 400, shares 600 -> holding 600, total 1000, current_ratio 0.6 -> need sell 100 (>= min_unit 100)
    const ctx: VirtualStrategyContext = { history: hist as any, cash: 400, shares: 600, baseUnit: 1, startNav: 1 };
    const res = constantMixStrategy.decide(ctx) as any;
    expect(res.action).toBe('sell');
    expect(res.shares).toBe(100);
    expect(res.reason).toBeDefined();
    expect(res.reason.text).toMatch(/卖出/);
  });

  test('does not act when required delta smaller than min_unit', () => {
    const hist = [makePoint('2026-01-01', 1.0)];
    // cash 60, shares 40 -> holding 40, total 100, current_ratio 0.4 -> need buy 10 (< min_unit 100)
    const ctx: VirtualStrategyContext = { history: hist as any, cash: 60, shares: 40, baseUnit: 1, startNav: 1 };
    const res = constantMixStrategy.decide(ctx) as any;
    // Implementation returns hold with informative text when computed desired < min_unit
    expect(res.action).toBe('hold');
    expect(res.shares).toBe(0);
    expect(res.reason).toBeDefined();
    expect(res.reason.text).toMatch(/小于最小交易单位/);
  });
});
