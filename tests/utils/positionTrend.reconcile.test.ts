import { computePositionTrend, PositionTrendInput } from '../../utils/positionTrend';

describe('computePositionTrend reconciliation', () => {
  test('last point equals sum of per-symbol last shares * last price', () => {
    const input: PositionTrendInput = {
      symbols: ['X', 'Y'],
      initialPositions: { X: 10, Y: 5 },
      trades: {
        X: [ { id: 't1', date: '2026-01-02', type: 'buy', shares: 5 } ],
        Y: [ { id: 't2', date: '2026-01-03', type: 'buy', shares: 5 } ]
      },
      valuationHistory: {
        X: [ { date: '2026-01-01', price: 2.0 }, { date: '2026-01-04', price: 2.5 } ],
        Y: [ { date: '2026-01-02', price: 10.0 }, { date: '2026-01-04', price: 12.0 } ]
      },
      startDate: '2026-01-01',
      endDate: '2026-01-04'
    };

    const series = computePositionTrend(input);
    expect(series.length).toBeGreaterThan(0);
    const last = series[series.length - 1];
    // compute expected: X shares = 10+5=15, last price 2.5 => 37.5; Y shares = 5+5=10, last price 12 => 120; total = 157.5
    expect(last.value).toBeCloseTo(157.5);
  });
});

