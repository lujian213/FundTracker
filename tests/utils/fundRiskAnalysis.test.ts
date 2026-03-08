import { buildRiskSeriesFromHistory, computeRiskFromHistory } from '../../utils/fundRiskAnalysis';
import { ValuationData } from '../../types';

const baseData: ValuationData = {
  symbol: '000001',
  name: 'Sample Fund',
  currentPrice: 1.3,
  previousPrice: 1.2,
  changePercentage: 2.5,
  lastUpdated: '2026-03-08 14:35',
  realtimeDate: '2026-03-08',
  netWorthDate: '2026-03-07',
  valuationDate: '2026-03-08',
  sourceUrl: ''
};

describe('fundRiskAnalysis history merge', () => {
  test('replaces the last history point when valuation is on the same day', () => {
    const history = [
      { date: new Date('2026-03-07T15:00:00').getTime(), value: 1.2, equityReturn: 0 },
      { date: new Date('2026-03-08T15:00:00').getTime(), value: 1.21, equityReturn: 0 },
    ];

    const values = buildRiskSeriesFromHistory(history, baseData);

    expect(values).toEqual([1.2, 1.3]);
  });

  test('appends a newer valuation day to the history series', () => {
    const history = [
      { date: new Date('2026-03-06T15:00:00').getTime(), value: 1.18, equityReturn: 0 },
      { date: new Date('2026-03-07T15:00:00').getTime(), value: 1.2, equityReturn: 0 },
    ];

    const values = buildRiskSeriesFromHistory(history, baseData);

    expect(values).toEqual([1.18, 1.2, 1.3]);
  });
});

describe('computeRiskFromHistory', () => {
  test('returns grouped opportunity/risk signals and keeps valuation day included', () => {
    const history = Array.from({ length: 20 }).map((_, i) => ({
      date: new Date(`2026-02-${String(i + 1).padStart(2, '0')}T15:00:00`).getTime(),
      value: 1 + i * 0.01,
      equityReturn: 0,
    }));

    const result = computeRiskFromHistory(history, {
      ...baseData,
      realtimeDate: '2026-02-21',
      lastUpdated: '2026-02-21 14:35',
      currentPrice: 1.25,
    });

    expect(result.rating).toBeTruthy();
    expect(Array.isArray(result.opportunitySignals)).toBe(true);
    expect(Array.isArray(result.riskSignals)).toBe(true);
    expect(result.notes.some(note => note.includes('不包含成交量'))).toBe(true);
  });
});

