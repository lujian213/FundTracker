import { computePositionTrend, downsampleLTTB, PositionTrendInput } from '../../utils/positionTrend';

describe('computePositionTrend', () => {
  test('happy path - basic aggregation', () => {
    const input: PositionTrendInput = {
      symbols: ['A'],
      initialPositions: { A: 100 },
      trades: {
        A: [
          { id: 't1', date: '2026-01-05', type: 'buy', shares: 50 },
          { id: 't2', date: '2026-01-10', type: 'sell', shares: 20 }
        ]
      },
      valuationHistory: {
        A: [
          { date: '2026-01-01', price: 1.0 },
          { date: '2026-01-08', price: 1.5 }
        ]
      },
      startDate: '2026-01-01',
      endDate: '2026-01-12'
    };

    const series = computePositionTrend(input);
    const find = (d: string) => series.find(p => p.date === d) as any;
    expect(find('2026-01-01').value).toBeCloseTo(100 * 1.0);
    expect(find('2026-01-06').value).toBeCloseTo(150 * 1.0);
    expect(find('2026-01-09').value).toBeCloseTo(150 * 1.5);
    expect(find('2026-01-11').value).toBeCloseTo(130 * 1.5);
  });

  test('edge - missing early valuation carry-forward absent', () => {
    const input: PositionTrendInput = {
      symbols: ['B'],
      initialPositions: { B: 50 },
      trades: {
        B: [
          { id: 't1', date: '2026-01-10', type: 'buy', shares: 50 }
        ]
      },
      valuationHistory: {
        B: [
          { date: '2026-02-01', price: 2.0 }
        ]
      },
      startDate: '2026-01-01',
      endDate: '2026-02-05'
    };

    const series = computePositionTrend(input);
    const find = (d: string) => series.find(p => p.date === d) as any;
    // dates before 2026-02-01 should have value 0 because no known price yet
    expect(find('2026-01-15').value).toBeCloseTo(0);
    // from 2026-02-01 onward should use price 2.0 and cumulative shares (50 initial + 50 buy)
    expect(find('2026-02-02').value).toBeCloseTo(100 * 2.0);
  });
});

describe('downsampleLTTB', () => {
  test('downsamples preserving endpoints', () => {
    const data = [] as any[];
    for (let i = 0; i < 1000; i++) {
      const date = `2026-01-${String(i + 1).padStart(2, '0')}`;
      data.push({ date, value: Math.sin(i / 10) * 100 + i });
    }
    const sampled = downsampleLTTB(data, 100);
    expect(sampled[0].date).toBe(data[0].date);
    expect(sampled[sampled.length - 1].date).toBe(data[data.length - 1].date);
    expect(sampled.length).toBe(100);
  });
});

