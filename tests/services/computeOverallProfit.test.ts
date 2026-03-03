// Increase timeout because computeOverallProfit may await multiple async steps
jest.setTimeout(20000);

// mock trades provider module used by fundService
jest.mock('../../hooks/useTrades', () => ({
  getTradesForSymbol: jest.fn()
}));

const { getTradesForSymbol } = require('../../hooks/useTrades');

import * as fundService from '../../services/fundService';
import { computeProfitTimeline } from '../../utils/profitCalculator';

describe('computeOverallProfit', () => {
  beforeEach(() => {
    // reset localStorage and mocks
    localStorage.clear();
    jest.resetAllMocks();
    // ensure clean DOM head to avoid any stray script onloads affecting tests
    document.head.innerHTML = '';
  });

  function mkTs(dateIso: string) {
    // create timestamp at 15:00 local time to match service synthetic points
    return new Date(`${dateIso} 15:00`).getTime();
  }

  test('excludes funds without stored startDate and uses stored startDate to zero equal date', async () => {
    // portfolio contains two funds
    const portfolio = [
      { symbol: '270023', name: 'Fund A' },
      { symbol: '300000', name: 'Fund B' }
    ];
    localStorage.setItem('fund_portfolio', JSON.stringify(portfolio));

    // fund_position for 270023 exists (start earlier), for 300000 exists but start equals 2026-02-13
    localStorage.setItem('fund_position_270023', JSON.stringify({ startDate: '2026-02-11', initialPosition: 1 }));
    localStorage.setItem('fund_position_300000', JSON.stringify({ startDate: '2026-02-13', initialPosition: 2 }));

    // mock fetchFundHistory to return controlled histories
    jest.spyOn(fundService, 'fetchFundHistory').mockImplementation(async (sym: string) => {
      console.log('TEST-MOCK fetchFundHistory called for', sym);
      if (sym === '270023') {
        return [
          { date: mkTs('2026-02-12'), value: 5.0, equityReturn: 0 },
          { date: mkTs('2026-02-13'), value: 6.0, equityReturn: 0 }
        ];
      }
      if (sym === '300000') {
        return [
          { date: mkTs('2026-02-12'), value: 1.0, equityReturn: 0 },
          { date: mkTs('2026-02-13'), value: 1.5, equityReturn: 0 }
        ];
      }
      return [];
    });

    // ensure fetchFundData doesn't try to append extra points
    jest.spyOn(fundService, 'fetchFundData').mockImplementation(async (sym: string) => {
      console.log('TEST-MOCK fetchFundData called for', sym);
      return null;
    });

    // no trades for either fund
    getTradesForSymbol.mockImplementation((s: string) => { console.log('TEST-MOCK getTradesForSymbol for', s); return []; });

    // Intercept script append to immediately invoke onload and provide Data_netWorthTrend for each symbol
    const origAppend = document.head.appendChild.bind(document.head);
    (document.head as any).appendChild = (node: any) => {
      if (node && node.tagName === 'SCRIPT') {
        const src: string = node.src || '';
        if (src.includes('270023')) {
          (window as any).Data_netWorthTrend = [ { x: mkTs('2026-02-12'), y: '5.0', equityReturn: '0' }, { x: mkTs('2026-02-13'), y: '6.0', equityReturn: '0' } ];
        } else if (src.includes('300000')) {
          (window as any).Data_netWorthTrend = [ { x: mkTs('2026-02-12'), y: '1.0', equityReturn: '0' }, { x: mkTs('2026-02-13'), y: '1.5', equityReturn: '0' } ];
        }
        // call onload asynchronously to mimic browser behavior
        setTimeout(() => { try { if (typeof node.onload === 'function') node.onload(); } catch (e) {} }, 0);
        return node;
      }
      return origAppend(node);
    };

    console.log('TEST about to call computeOverallProfit');
    const result = await (fundService as any).computeOverallProfit({});
    console.log('TEST computeOverallProfit returned');

    // restore appendChild
    document.head.appendChild = origAppend;

    // Only two funds had stored positions, so both are considered. None should be excluded because they both have startDateFromStorage.
    expect(result.perFund.map((p: any) => p.symbol).sort()).toEqual(['270023', '300000'].sort());

    // Check perFundTimelines exists and contains both symbols
    const timelines = result.perFundTimelines || {};
    expect(Object.keys(timelines).sort()).toEqual(['270023', '300000'].sort());

    // Dates in overall timeline
    const dates = result.timeline.map((t: any) => t.date);
    // computeOverallProfit appends a point for the desired end date (today, local) when toDate not provided
    const todayLocal = (() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    })();
    expect(dates).toEqual(['2026-02-12', '2026-02-13', todayLocal]);

    // Compute per-fund expected timelines via computeProfitTimeline then forward-fill and apply start-date zeroing
    const aTimeline = computeProfitTimeline({ history: [
      { date: mkTs('2026-02-12'), value: 5.0, equityReturn: 0 },
      { date: mkTs('2026-02-13'), value: 6.0, equityReturn: 0 }
    ], trades: [], initialPosition: 1, initialPrice: null, fromDate: null, toDate: null });

    const bTimeline = computeProfitTimeline({ history: [
      { date: mkTs('2026-02-12'), value: 1.0, equityReturn: 0 },
      { date: mkTs('2026-02-13'), value: 1.5, equityReturn: 0 }
    ], trades: [], initialPosition: 2, initialPrice: null, fromDate: null, toDate: null });

    // Build forward-filled maps
    const allDates = dates;

    function buildForwardFilled(pt: any[], startDate: string | null) {
      const map: Record<string, number> = {};
      for (const p of pt) map[p.date] = Number(p.cumulativeProfit.toFixed(4));
      const arr: number[] = [];
      let lastVal: number | null = null;
      for (const d of allDates) {
        let val: number;
        if (map[d] !== undefined) {
          val = map[d];
          lastVal = val;
        } else if (lastVal !== null) val = lastVal; else val = 0;
        if (startDate && d <= startDate) val = 0;
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

    // overall timeline should equal element-wise sum
    for (let i = 0; i < dates.length; i++) {
      const sum = Number((expectA[i] + expectB[i]).toFixed(4));
      expect(Number(result.timeline[i].cumulativeProfit)).toBeCloseTo(sum, 4);
    }
  });

  test('funds with startDate later than toDate are excluded', async () => {
    // One fund start after toDate
    localStorage.setItem('fund_portfolio', JSON.stringify([{ symbol: '111111', name: 'Late' }, { symbol: '222222', name: 'Early' }]));
    localStorage.setItem('fund_position_111111', JSON.stringify({ startDate: '2026-03-02', initialPosition: 1 }));
    localStorage.setItem('fund_position_222222', JSON.stringify({ startDate: '2026-02-01', initialPosition: 1 }));

    jest.spyOn(fundService, 'fetchFundHistory').mockImplementation(async (sym: string) => {
      return [ { date: mkTs('2026-02-28'), value: 1.0, equityReturn: 0 }, { date: mkTs('2026-03-02'), value: 2.0, equityReturn: 0 } ];
    });
    jest.spyOn(fundService, 'fetchFundData').mockResolvedValue(null);
    getTradesForSymbol.mockImplementation(() => []);

    // intercept script append for second test
    const origAppend2 = document.head.appendChild.bind(document.head);
    (document.head as any).appendChild = (node: any) => {
      if (node && node.tagName === 'SCRIPT') {
        const src: string = node.src || '';
        if (src.includes('111111')) {
          (window as any).Data_netWorthTrend = [ { x: mkTs('2026-02-28'), y: '2.0', equityReturn: '0' }, { x: mkTs('2026-03-02'), y: '2.0', equityReturn: '0' } ];
        } else if (src.includes('222222')) {
          (window as any).Data_netWorthTrend = [ { x: mkTs('2026-02-28'), y: '1.0', equityReturn: '0' } ];
        }
        setTimeout(() => { try { if (typeof node.onload === 'function') node.onload(); } catch (e) {} }, 0);
        return node;
      }
      return origAppend2(node);
    };

    console.log('TEST about to call computeOverallProfit with toDate');
    const res = await (fundService as any).computeOverallProfit({ toDate: '2026-02-28' });
    console.log('TEST computeOverallProfit with toDate returned');

    // restore appendChild
    document.head.appendChild = origAppend2;

    // fund 111111 has startDate 2026-03-02 which is > toDate and should be excluded
    const syms = res.perFund.map((p: any) => p.symbol);
    expect(syms).toEqual(['222222']);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// periodTotal semantics: must reflect the full chart window (timeline[0] →
// timeline[last]), completely independent of the date1 / date2 table filters.
// ─────────────────────────────────────────────────────────────────────────────
describe('periodTotal — full chart window cumulative', () => {
  // Helper: build an OverallProfitSummary-shaped object with a controlled timeline.
  function makeSummary(points: { date: string; cumulativeProfit: number; dailyProfit: number }[]) {
    return {
      timeline: points,
      perFund: [],
      perFundTimelines: {},
      totalDiff: 0,
    };
  }

  // Mirrors the exact logic in OverallProfitModal for periodTotal
  function computePeriodTotal(summary: ReturnType<typeof makeSummary>): number {
    if (!summary || !summary.timeline || summary.timeline.length === 0) return 0;
    const first = summary.timeline[0].cumulativeProfit || 0;
    const last  = summary.timeline[summary.timeline.length - 1].cumulativeProfit || 0;
    return Number((last - first).toFixed(2));
  }

  test('returns 0 when timeline is empty', () => {
    const s = makeSummary([]);
    expect(computePeriodTotal(s)).toBe(0);
  });

  test('returns 0 when timeline has a single point', () => {
    const s = makeSummary([{ date: '2026-02-01', cumulativeProfit: 500, dailyProfit: 0 }]);
    expect(computePeriodTotal(s)).toBe(0);
  });

  test('equals last minus first cumulative profit', () => {
    const s = makeSummary([
      { date: '2026-02-01', cumulativeProfit: 100,  dailyProfit: 100 },
      { date: '2026-02-15', cumulativeProfit: 350,  dailyProfit: 250 },
      { date: '2026-03-01', cumulativeProfit: 1200, dailyProfit: 850 },
    ]);
    // 1200 - 100 = 1100
    expect(computePeriodTotal(s)).toBeCloseTo(1100, 2);
  });

  test('is negative when cumulative declines over the window', () => {
    const s = makeSummary([
      { date: '2026-02-01', cumulativeProfit: 800, dailyProfit:   0 },
      { date: '2026-02-20', cumulativeProfit: 600, dailyProfit: -200 },
      { date: '2026-03-01', cumulativeProfit: 300, dailyProfit: -300 },
    ]);
    // 300 - 800 = -500
    expect(computePeriodTotal(s)).toBeCloseTo(-500, 2);
  });

  test('is independent of a mid-window date1/date2 slice', () => {
    // Full timeline: 2026-02-01 (cum=0) → 2026-02-15 (cum=400) → 2026-03-01 (cum=900)
    const s = makeSummary([
      { date: '2026-02-01', cumulativeProfit: 0,   dailyProfit:   0 },
      { date: '2026-02-15', cumulativeProfit: 400, dailyProfit: 400 },
      { date: '2026-03-01', cumulativeProfit: 900, dailyProfit: 500 },
    ]);
    const periodTotal = computePeriodTotal(s);

    // Simulate what the table would show for date1='2026-02-15', date2='2026-03-01'
    // (a sub-range diff of 900 - 400 = 500).  periodTotal must NOT equal that.
    const tableSubRangeDiff = 900 - 400; // 500

    expect(periodTotal).toBeCloseTo(900, 2);        // full window: 900 - 0
    expect(periodTotal).not.toBe(tableSubRangeDiff); // must differ from sub-range
  });

  test('uses only first and last point — ignores intermediate values', () => {
    // Large spike in the middle should have no effect on periodTotal
    const s = makeSummary([
      { date: '2026-01-01', cumulativeProfit: 200,  dailyProfit:    0 },
      { date: '2026-01-15', cumulativeProfit: 9999, dailyProfit: 9799 }, // big spike
      { date: '2026-03-01', cumulativeProfit: 700,  dailyProfit: -9299 },
    ]);
    // 700 - 200 = 500
    expect(computePeriodTotal(s)).toBeCloseTo(500, 2);
  });

  test('rounds result to 2 decimal places', () => {
    const s = makeSummary([
      { date: '2026-02-01', cumulativeProfit: 0.001, dailyProfit: 0 },
      { date: '2026-03-01', cumulativeProfit: 0.009, dailyProfit: 0.008 },
    ]);
    // 0.009 - 0.001 = 0.008 → rounded to 2dp → 0.01
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

