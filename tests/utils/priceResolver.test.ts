import { resolvePreferredPrice } from '../../utils/priceResolver';

describe('priceResolver', () => {
  test('today prefers valuation over confirmed when both are same-day', () => {
    const result = resolvePreferredPrice({
      targetDate: '2026-03-06',
      todayDate: '2026-03-06',
      currentPrice: 1.55,
      realtimeDate: '2026-03-06',
      previousPrice: 1.5,
      netWorthDate: '2026-03-06',
      history: [{ date: new Date('2026-03-05 15:00').getTime(), value: 1.48, equityReturn: 0 }],
    });

    expect(result).toEqual({ price: 1.55, source: 'valuation', date: '2026-03-06' });
  });

  test('today falls back to today confirmed when valuation missing', () => {
    const result = resolvePreferredPrice({
      targetDate: '2026-03-06',
      todayDate: '2026-03-06',
      currentPrice: 0,
      realtimeDate: '---',
      previousPrice: 1.5,
      netWorthDate: '2026-03-06',
      history: [{ date: new Date('2026-03-05 15:00').getTime(), value: 1.48, equityReturn: 0 }],
    });

    expect(result).toEqual({ price: 1.5, source: 'confirmed', date: '2026-03-06' });
  });

  test('today with no same-day values falls back to latest available date', () => {
    const result = resolvePreferredPrice({
      targetDate: '2026-03-06',
      todayDate: '2026-03-06',
      currentPrice: 1.52,
      realtimeDate: '2026-03-04',
      previousPrice: 1.5,
      netWorthDate: '2026-03-05',
      history: [{ date: new Date('2026-03-03 15:00').getTime(), value: 1.47, equityReturn: 0 }],
    });

    expect(result).toEqual({ price: 1.5, source: 'confirmed', date: '2026-03-05' });
  });

  test('non-today keeps historical nearest-previous behavior', () => {
    const result = resolvePreferredPrice({
      targetDate: '2026-03-02',
      todayDate: '2026-03-06',
      currentPrice: 9.9,
      realtimeDate: '2026-03-06',
      previousPrice: 9.8,
      netWorthDate: '2026-03-06',
      history: [
        { date: new Date('2026-03-01 15:00').getTime(), value: 1.4, equityReturn: 0 },
        { date: new Date('2026-03-03 15:00').getTime(), value: 1.6, equityReturn: 0 },
      ],
    });

    expect(result).toEqual({ price: 1.4, source: 'history', date: '2026-03-01' });
  });
});

