// mock trades provider module used by fundService
jest.mock('../../hooks/useTrades', () => ({
  getTradesForSymbol: jest.fn()
}));

const { getTradesForSymbol } = require('../../hooks/useTrades');

import * as fundService from '../../services/fundService';
import { _deps } from '../../services/fundService';
import { computeProfitTimeline } from '../../utils/profitCalculator';

describe('computeOverallProfit', () => {
  // Save and restore _deps so each test gets a clean slate
  let origFetchHistory: typeof _deps.fetchFundHistory;
  let origFetchData:    typeof _deps.fetchFundData;

  beforeEach(() => {
    origFetchHistory = _deps.fetchFundHistory;
    origFetchData    = _deps.fetchFundData;
    localStorage.clear();
    jest.resetAllMocks();
    document.head.innerHTML = '';
  });

  afterEach(() => {
    _deps.fetchFundHistory = origFetchHistory;
    _deps.fetchFundData    = origFetchData;
  });

  function mkTs(dateIso: string) {
    return new Date(`${dateIso} 15:00`).getTime();
  }

  test('excludes funds without stored startDate and uses stored startDate to zero equal date', async () => {
    const portfolio = [
      { symbol: '270023', name: 'Fund A' },
      { symbol: '300000', name: 'Fund B' }
    ];
    localStorage.setItem('fund_portfolio', JSON.stringify(portfolio));
    localStorage.setItem('fund_position_270023', JSON.stringify({ startDate: '2026-02-11', initialPosition: 1 }));
    localStorage.setItem('fund_position_300000', JSON.stringify({ startDate: '2026-02-13', initialPosition: 2 }));

    // Replace _deps directly — zero RequestQueue delay, no timers needed
    _deps.fetchFundHistory = jest.fn().mockImplementation(async (sym: string) => {
      if (sym === '270023') return [
        { date: mkTs('2026-02-12'), value: 5.0, equityReturn: 0 },
        { date: mkTs('2026-02-13'), value: 6.0, equityReturn: 0 }
      ];
      if (sym === '300000') return [
        { date: mkTs('2026-02-12'), value: 1.0, equityReturn: 0 },
        { date: mkTs('2026-02-13'), value: 1.5, equityReturn: 0 }
      ];
      return [];
    });
    _deps.fetchFundData = jest.fn().mockResolvedValue(null);
    getTradesForSymbol.mockReturnValue([]);

    const result = await (fundService as any).computeOverallProfit({});

    expect(result.perFund.map((p: any) => p.symbol).sort()).toEqual(['270023', '300000'].sort());

    const timelines = result.perFundTimelines || {};
    expect(Object.keys(timelines).sort()).toEqual(['270023', '300000'].sort());

    const dates = result.timeline.map((t: any) => t.date);
    const todayLocal = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    expect(dates).toEqual(['2026-02-12', '2026-02-13', todayLocal]);

    const aTimeline = computeProfitTimeline({ history: [
      { date: mkTs('2026-02-12'), value: 5.0, equityReturn: 0 },
      { date: mkTs('2026-02-13'), value: 6.0, equityReturn: 0 }
    ], trades: [], initialPosition: 1, initialPrice: null, fromDate: null, toDate: null });

    const bTimeline = computeProfitTimeline({ history: [
      { date: mkTs('2026-02-12'), value: 1.0, equityReturn: 0 },
      { date: mkTs('2026-02-13'), value: 1.5, equityReturn: 0 }
    ], trades: [], initialPosition: 2, initialPrice: null, fromDate: null, toDate: null });

    const allDates = dates;
    function buildForwardFilled(pt: any[], startDate: string | null) {
      const map: Record<string, number> = {};
      for (const p of pt) map[p.date] = Number(p.cumulativeProfit.toFixed(4));
      // First pass: raw forward-fill values
      const rawVals: number[] = [];
      let lastVal: number | null = null;
      for (const d of allDates) {
        let val: number;
        if (map[d] !== undefined) { val = map[d]; lastVal = val; }
        else if (lastVal !== null) val = lastVal;
        else val = 0;
        rawVals.push(val);
      }
      // Compute baseline: raw cumulative at startDate (last date <= startDate)
      let baseline = 0;
      if (startDate) {
        for (let i = 0; i < allDates.length; i++) {
          if (allDates[i] <= startDate) baseline = rawVals[i];
          else break;
        }
      }
      // Second pass: apply baseline offset
      const arr: number[] = [];
      for (let i = 0; i < allDates.length; i++) {
        const d = allDates[i];
        let val: number;
        if (startDate && d <= startDate) val = 0;
        else val = rawVals[i] - baseline;
        arr.push(Number(val.toFixed(4)));
      }
      return arr;
    }

    const expectA = buildForwardFilled(aTimeline, '2026-02-11');
    const expectB = buildForwardFilled(bTimeline, '2026-02-13');
    const actualA = timelines['270023'].map((e: any) => Number(e.cumulativeProfit));
    const actualB = timelines['300000'].map((e: any) => Number(e.cumulativeProfit));

    expect(actualA).toEqual(expectA);
    expect(actualB).toEqual(expectB);

    for (let i = 0; i < dates.length; i++) {
      const sum = Number((expectA[i] + expectB[i]).toFixed(4));
      expect(Number(result.timeline[i].cumulativeProfit)).toBeCloseTo(sum, 4);
    }
  });

  test('funds with startDate later than toDate are excluded', async () => {
    localStorage.setItem('fund_portfolio', JSON.stringify([
      { symbol: '111111', name: 'Late' },
      { symbol: '222222', name: 'Early' }
    ]));
    localStorage.setItem('fund_position_111111', JSON.stringify({ startDate: '2026-03-02', initialPosition: 1 }));
    localStorage.setItem('fund_position_222222', JSON.stringify({ startDate: '2026-02-01', initialPosition: 1 }));

    _deps.fetchFundHistory = jest.fn().mockResolvedValue([
      { date: mkTs('2026-02-28'), value: 1.0, equityReturn: 0 },
      { date: mkTs('2026-03-02'), value: 2.0, equityReturn: 0 }
    ]);
    _deps.fetchFundData = jest.fn().mockResolvedValue(null);
    getTradesForSymbol.mockReturnValue([]);

    const res = await (fundService as any).computeOverallProfit({ toDate: '2026-02-28' });

    expect(res.perFund.map((p: any) => p.symbol)).toEqual(['222222']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// periodTotal semantics
// ─────────────────────────────────────────────────────────────────────────────
describe('periodTotal — full chart window cumulative', () => {
  function makeSummary(points: { date: string; cumulativeProfit: number; dailyProfit: number }[]) {
    return { timeline: points, perFund: [], perFundTimelines: {}, totalDiff: 0 };
  }

  function computePeriodTotal(summary: ReturnType<typeof makeSummary>): number {
    if (!summary || !summary.timeline || summary.timeline.length === 0) return 0;
    const first = summary.timeline[0].cumulativeProfit || 0;
    const last  = summary.timeline[summary.timeline.length - 1].cumulativeProfit || 0;
    return Number((last - first).toFixed(2));
  }

  test('returns 0 when timeline is empty', () => { expect(computePeriodTotal(makeSummary([]))).toBe(0); });
  test('returns 0 when timeline has a single point', () => {
    expect(computePeriodTotal(makeSummary([{ date: '2026-02-01', cumulativeProfit: 500, dailyProfit: 0 }]))).toBe(0);
  });
  test('equals last minus first cumulative profit', () => {
    const s = makeSummary([
      { date: '2026-02-01', cumulativeProfit: 100,  dailyProfit: 100 },
      { date: '2026-02-15', cumulativeProfit: 350,  dailyProfit: 250 },
      { date: '2026-03-01', cumulativeProfit: 1200, dailyProfit: 850 },
    ]);
    expect(computePeriodTotal(s)).toBeCloseTo(1100, 2);
  });
  test('is negative when cumulative declines over the window', () => {
    const s = makeSummary([
      { date: '2026-02-01', cumulativeProfit: 800, dailyProfit:    0 },
      { date: '2026-02-20', cumulativeProfit: 600, dailyProfit: -200 },
      { date: '2026-03-01', cumulativeProfit: 300, dailyProfit: -300 },
    ]);
    expect(computePeriodTotal(s)).toBeCloseTo(-500, 2);
  });
  test('is independent of a mid-window date1/date2 slice', () => {
    const s = makeSummary([
      { date: '2026-02-01', cumulativeProfit: 0,   dailyProfit:   0 },
      { date: '2026-02-15', cumulativeProfit: 400, dailyProfit: 400 },
      { date: '2026-03-01', cumulativeProfit: 900, dailyProfit: 500 },
    ]);
    const periodTotal = computePeriodTotal(s);
    const tableSubRangeDiff = 900 - 400;
    expect(periodTotal).toBeCloseTo(900, 2);
    expect(periodTotal).not.toBe(tableSubRangeDiff);
  });
  test('uses only first and last point — ignores intermediate values', () => {
    const s = makeSummary([
      { date: '2026-01-01', cumulativeProfit: 200,  dailyProfit:    0 },
      { date: '2026-01-15', cumulativeProfit: 9999, dailyProfit: 9799 },
      { date: '2026-03-01', cumulativeProfit: 700,  dailyProfit: -9299 },
    ]);
    expect(computePeriodTotal(s)).toBeCloseTo(500, 2);
  });
  test('rounds result to 2 decimal places', () => {
    const s = makeSummary([
      { date: '2026-02-01', cumulativeProfit: 0.001, dailyProfit: 0 },
      { date: '2026-03-01', cumulativeProfit: 0.009, dailyProfit: 0.008 },
    ]);
    expect(computePeriodTotal(s)).toBeCloseTo(0.01, 2);
  });
  test('handles first cumulativeProfit of 0 correctly (no subtraction artefact)', () => {
    const s = makeSummary([
      { date: '2026-02-01', cumulativeProfit: 0,   dailyProfit:   0 },
      { date: '2026-02-10', cumulativeProfit: 150, dailyProfit: 150 },
      { date: '2026-03-01', cumulativeProfit: 350, dailyProfit: 200 },
    ]);
    expect(computePeriodTotal(s)).toBeCloseTo(350, 2);
  });
});
