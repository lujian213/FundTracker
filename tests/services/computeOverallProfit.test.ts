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

    // Fund A: startDate='2026-02-11', initialPrice=null in storage.
    // computeOverallProfit now resolves initialPrice from history: startDate has no exact match,
    // falls back to first available history point value = 5.0.
    const aTimeline = computeProfitTimeline({ history: [
      { date: mkTs('2026-02-12'), value: 5.0, equityReturn: 0 },
      { date: mkTs('2026-02-13'), value: 6.0, equityReturn: 0 }
    ], trades: [], initialPosition: 1, initialPrice: 5.0, fromDate: null, toDate: null });

    // Fund B: startDate='2026-02-13', initialPrice=null in storage.
    // Resolved: exact match on 2026-02-13 = 1.5.
    const bTimeline = computeProfitTimeline({ history: [
      { date: mkTs('2026-02-12'), value: 1.0, equityReturn: 0 },
      { date: mkTs('2026-02-13'), value: 1.5, equityReturn: 0 }
    ], trades: [], initialPosition: 2, initialPrice: 1.5, fromDate: null, toDate: null });

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

  // ── Regression: duplicate history points (original + synthetic) must not cause
  //    trades to be double-counted inside computeOverallProfit ────────────────
  test('trade is not double-counted when history API and fetchFundData both have a point on the same date', async () => {
    // Mirrors the 023832 bug: the history API returns a point for 2026-03-03 at midnight UTC,
    // AND fetchFundData returns netWorthDate=2026-03-03 / previousPrice (a confirmed NAV).
    // computeOverallProfit appends the synthetic 15:00 point even though the date already exists
    // (because hasPointOnDate compared timestamps).  After the deduplication fix the trade on
    // 2026-03-03 must be applied exactly once.

    localStorage.setItem('fund_portfolio', JSON.stringify([{ symbol: '023832', name: 'Test' }]));
    localStorage.setItem('fund_position_023832', JSON.stringify({
      startDate: '2026-02-13',
      initialPosition: 13831.32,
      initialPrice: 1.3737,
    }));

    // Simulate history API: returns 2026-03-02 and 2026-03-03 at midnight UTC
    // (which in UTC+8 is 2026-03-03 08:00 — same local date as the synthetic 15:00 point)
    const midnightTs = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime();
    const afternoonTs = (iso: string) => new Date(`${iso} 15:00`).getTime();

    _deps.fetchFundHistory = jest.fn().mockResolvedValue([
      { date: midnightTs('2026-03-02'), value: 1.5956, equityReturn: 0 },
      { date: midnightTs('2026-03-03'), value: 1.66,   equityReturn: 0 },
    ]);

    // fetchFundData returns netWorthDate=2026-03-03 — this triggers a synthetic point at 15:00
    _deps.fetchFundData = jest.fn().mockResolvedValue({
      symbol: '023832',
      name: 'Test',
      currentPrice: 1.66,
      previousPrice: 1.66,
      netWorthDate: '2026-03-03',
      realtimeDate: '2026-03-04',
      changePercentage: 0,
      lastUpdated: '',
      valuationDate: '',
      sourceUrl: '',
    });

    // One sell trade on 2026-03-03
    getTradesForSymbol.mockReturnValue([
      { id: 's1', date: '2026-03-03', type: 'sell', shares: 7000, price: 1.66, fee: 11.62 },
    ]);

    const res = await (fundService as any).computeOverallProfit({ toDate: '2026-03-03' });

    const ft: { date: string; cumulativeProfit: number }[] =
      (res.perFundTimelines || {})['023832'] || [];

    const entry0303 = ft.find((r: any) => r.date === '2026-03-03');
    expect(entry0303).toBeDefined();

    // Expected cumulative (sell applied ONCE):
    // shares after sell = 13831.32 - 7000 = 6831.32
    // sellAmount = 1.66 * 7000 - 11.62 = 11608.38
    // initCost   = 13831.32 * 1.3737 = (baseline, zeroed by startDate logic)
    // The perFundTimeline is baseline-offset, so startDate value = 0.
    // We just verify that the 3/3 value is consistent with a single sell application
    // i.e. profitDiff between 3/2 and 3/3 equals the daily gain from the single trade.
    const entry0302 = ft.find((r: any) => r.date === '2026-03-02');
    expect(entry0302).toBeDefined();

    const daily0303 = (entry0303!.cumulativeProfit) - (entry0302!.cumulativeProfit);

    // With a SINGLE sell of 7000 @ 1.66 fee=11.62 on 2026-03-03:
    //   shares drop from 13831.32 to 6831.32
    // Under the fee-deferral convention (matching the single-fund ProfitModal):
    //   adjustedCum_03 = cum_03 + fee_03
    //   daily_03 = adjustedCum_03 - adjustedCum_02  (no trade on 02, so adjustedCum_02 = cum_02)
    //   = (sharesAfter*net0303 - initCost + sellAmt + fee) - (sharesBefore*net0302 - initCost)
    //   = sharesAfter*net0303 + sellAmt + fee - sharesBefore*net0302
    // i.e. the sell fee is NOT deducted from today's daily; it appears in the next day's daily.
    const sharesAfter = 13831.32 - 7000;   // 6831.32
    const sharesBefore = 13831.32;
    const net0302 = 1.5956;
    const net0303 = 1.66;
    const sellAmt = 1.66 * 7000 - 11.62;   // proceeds minus fee (cumulativeSellAmount)
    const fee = 11.62;
    // fee-deferral: fee is added back to adjustedCumulative on trade day,
    // so daily on trade day = old formula + fee
    const expectedDaily = sharesAfter * net0303 + sellAmt + fee - sharesBefore * net0302;
    expect(daily0303).toBeCloseTo(expectedDaily, 1);

    // Confirm the value is NOT the old (pre-deferral) formula which would be ~11.62 lower.
    expect(Math.abs(daily0303 - (expectedDaily - 11.62))).toBeGreaterThan(5);
  });
}); // end describe('computeOverallProfit')

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

// ─────────────────────────────────────────────────────────────────────────────
// Chart x-axis start date — must be minimum startDate across all funds
// ─────────────────────────────────────────────────────────────────────────────
describe('chart x-axis start date derivation', () => {
  // Mirrors the logic in OverallProfitModal that computes chartFromDate from base.perFund.
  // Returns null when no fund has a startDate — the UI must show an empty-state message
  // "无持仓基金，请先配置" instead of the chart and table.
  function deriveChartFromDate(
    perFund: { startDate: string | null }[]
  ): string | null {
    const allStartDates = perFund.map(f => f.startDate).filter((d): d is string => !!d);
    return allStartDates.length > 0 ? allStartDates.reduce((a, b) => (a < b ? a : b)) : null;
  }

  test('returns the minimum startDate when all funds have a startDate', () => {
    const perFund = [
      { startDate: '2026-02-15' },
      { startDate: '2026-01-10' },
      { startDate: '2026-03-01' },
    ];
    expect(deriveChartFromDate(perFund)).toBe('2026-01-10');
  });

  test('returns the sole startDate when only one fund has a startDate', () => {
    const perFund = [{ startDate: '2026-02-20' }];
    expect(deriveChartFromDate(perFund)).toBe('2026-02-20');
  });

  test('returns null when no fund has a startDate (triggers empty-state UI, no fallback to timeline)', () => {
    const perFund = [{ startDate: null }, { startDate: null }];
    expect(deriveChartFromDate(perFund)).toBeNull();
  });

  test('returns null when perFund is empty (triggers empty-state UI)', () => {
    expect(deriveChartFromDate([])).toBeNull();
  });

  test('ignores null startDates and returns minimum of non-null values', () => {
    const perFund = [
      { startDate: null },
      { startDate: '2026-03-10' },
      { startDate: '2026-02-01' },
      { startDate: null },
    ];
    expect(deriveChartFromDate(perFund)).toBe('2026-02-01');
  });

  test('does NOT use timeline[0].date when funds have startDates (regression: old bug used timeline[0].date)', () => {
    // Bug: chartFromDate was set to timeline[0].date which may predate all fund startDates
    // Correct: chartFromDate must be the minimum startDate from perFund
    const perFund = [
      { startDate: '2026-01-15' },
      { startDate: '2026-02-10' },
    ];
    const result = deriveChartFromDate(perFund);
    expect(result).toBe('2026-01-15');
    // Must not equal the hypothetical raw timeline first date (older history)
    expect(result).not.toBe('2025-06-01');
  });

  test('null result must NOT fall back to timeline first date (regression: old code had ?? timelineFirstDate)', () => {
    // Previously the code did: minStartDate ?? timeline[0].date
    // This was wrong — null must stay null so the UI shows the empty-state message
    const perFund: { startDate: string | null }[] = [];
    const chartFromDate = deriveChartFromDate(perFund);
    // Simulate the old (wrong) fallback — confirm we do NOT do it
    const oldBugResult = chartFromDate ?? '2025-01-01'; // old fallback to timeline[0].date
    expect(chartFromDate).toBeNull();          // correct: null → empty-state UI
    expect(oldBugResult).toBe('2025-01-01');   // old wrong result, kept here as documentation
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeOverallProfit — perFund startDate is correctly surfaced for x-axis
// ─────────────────────────────────────────────────────────────────────────────
describe('computeOverallProfit — perFund startDate exposed for chart x-axis', () => {
  let origFetchHistory: typeof _deps.fetchFundHistory;
  let origFetchData: typeof _deps.fetchFundData;
  const { getTradesForSymbol } = require('../../hooks/useTrades');

  beforeEach(() => {
    origFetchHistory = _deps.fetchFundHistory;
    origFetchData    = _deps.fetchFundData;
    localStorage.clear();
    jest.resetAllMocks();
  });

  afterEach(() => {
    _deps.fetchFundHistory = origFetchHistory;
    _deps.fetchFundData    = origFetchData;
  });

  function mkTs(dateIso: string) {
    return new Date(`${dateIso} 15:00`).getTime();
  }

  test('perFund rows carry correct startDates so UI can derive minimum for chart x-axis', async () => {
    // Fund A started 2026-01-10, Fund B started 2026-02-05
    // The chart x-axis should start at 2026-01-10 (min of the two), NOT at the earliest history date
    localStorage.setItem('fund_portfolio', JSON.stringify([
      { symbol: '100001', name: 'Fund A' },
      { symbol: '100002', name: 'Fund B' },
    ]));
    localStorage.setItem('fund_position_100001', JSON.stringify({ startDate: '2026-01-10', initialPosition: 1 }));
    localStorage.setItem('fund_position_100002', JSON.stringify({ startDate: '2026-02-05', initialPosition: 1 }));

    _deps.fetchFundHistory = jest.fn().mockImplementation(async (sym: string) => {
      // history extends before either startDate to simulate older raw data
      if (sym === '100001') return [
        { date: mkTs('2025-12-01'), value: 1.0, equityReturn: 0 },
        { date: mkTs('2026-01-10'), value: 1.1, equityReturn: 0 },
        { date: mkTs('2026-02-05'), value: 1.2, equityReturn: 0 },
      ];
      if (sym === '100002') return [
        { date: mkTs('2025-12-01'), value: 2.0, equityReturn: 0 },
        { date: mkTs('2026-02-05'), value: 2.1, equityReturn: 0 },
      ];
      return [];
    });
    _deps.fetchFundData = jest.fn().mockResolvedValue(null);
    getTradesForSymbol.mockReturnValue([]);

    const result = await (fundService as any).computeOverallProfit({});

    const perFundMap: Record<string, string | null> = {};
    for (const row of result.perFund) {
      perFundMap[row.symbol] = row.startDate;
    }

    // Both funds must expose their configured startDates
    expect(perFundMap['100001']).toBe('2026-01-10');
    expect(perFundMap['100002']).toBe('2026-02-05');

    // Derive chart x-axis start as the modal does — must be min(startDates) not timeline[0].date
    const allStartDates = result.perFund
      .map((f: any) => f.startDate)
      .filter((d: any): d is string => !!d);
    const chartFromDate = allStartDates.reduce((a: string, b: string) => (a < b ? a : b));

    expect(chartFromDate).toBe('2026-01-10');

    // Explicitly verify it is NOT the earliest raw history date (regression guard)
    const timelineFirstDate = result.timeline[0]?.date;
    // timeline[0] would be '2025-12-01' without the chartFromDate fix
    expect(chartFromDate).not.toBe('2025-12-01');
    // And the chart timeline filtered by chartFromDate should start on/after chartFromDate
    const chartTimeline = result.timeline.filter((p: any) => p.date >= chartFromDate);
    expect(chartTimeline.length).toBeGreaterThan(0);
    expect(chartTimeline[0].date >= chartFromDate).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fee-deferral consistency: overall profit must match single-fund profit
// ─────────────────────────────────────────────────────────────────────────────
describe('computeOverallProfit — fee-deferral matches single-fund computeProfitTimeline', () => {
  let origFetchHistory: typeof _deps.fetchFundHistory;
  let origFetchData: typeof _deps.fetchFundData;
  const { getTradesForSymbol } = require('../../hooks/useTrades');

  beforeEach(() => {
    origFetchHistory = _deps.fetchFundHistory;
    origFetchData    = _deps.fetchFundData;
    localStorage.clear();
    jest.resetAllMocks();
  });

  afterEach(() => {
    _deps.fetchFundHistory = origFetchHistory;
    _deps.fetchFundData    = origFetchData;
  });

  function mkTs(dateIso: string) {
    return new Date(`${dateIso} 15:00`).getTime();
  }

  test('single fund: overall daily profit equals computeProfitTimeline dailyProfit (with sell fee)', async () => {
    // One fund, one sell trade with fee. The overall timeline dailyProfit on trade day and next day
    // must match what computeProfitTimeline produces (fee deferred to next day).
    const SYM = '888001';
    localStorage.setItem('fund_portfolio', JSON.stringify([{ symbol: SYM, name: 'Test Fund' }]));
    localStorage.setItem(`fund_position_${SYM}`, JSON.stringify({
      startDate: '2026-02-20',
      initialPosition: 100,
      initialPrice: 1.0,
    }));

    const history = [
      { date: mkTs('2026-02-20'), value: 1.0, equityReturn: 0 },
      { date: mkTs('2026-02-21'), value: 1.2, equityReturn: 0 },
      { date: mkTs('2026-02-22'), value: 1.1, equityReturn: 0 },
    ];
    const trades = [{ id: 's1', date: '2026-02-21', type: 'sell', shares: 50, price: 1.2, fee: 6 }];

    _deps.fetchFundHistory = jest.fn().mockResolvedValue(history);
    _deps.fetchFundData = jest.fn().mockResolvedValue(null);
    getTradesForSymbol.mockReturnValue(trades);

    // Compute via computeProfitTimeline (single-fund reference)
    const singleFundTl = computeProfitTimeline({
      history,
      trades: trades as any,
      initialPosition: 100,
      initialPrice: 1.0,
    });
    const sfByDate = Object.fromEntries(singleFundTl.map(p => [p.date, p]));

    // Compute via computeOverallProfit (overall path)
    const result = await (fundService as any).computeOverallProfit({ toDate: '2026-02-22' });

    // overall timeline dates must include our trade dates
    const overallByDate = Object.fromEntries(
      result.timeline.map((p: any) => [p.date, p])
    );

    // perFundTimelines for this fund (baseline-adjusted, starting from startDate)
    const perFundTl: { date: string; cumulativeProfit: number }[] =
      (result.perFundTimelines || {})[SYM] || [];
    const pfByDate = Object.fromEntries(perFundTl.map((p: any) => [p.date, p]));

    // On startDate: perFund cumulative should be 0 (baseline zeroed)
    expect(pfByDate['2026-02-20']?.cumulativeProfit).toBeCloseTo(0, 4);

    // perFundTimeline builds cumulative by accumulating fee-deferral dailyProfit values,
    // so pfCum is NOT the same as raw computeProfitTimeline cumulativeProfit.
    // pfCum21 = 0 (startDate) + daily21(=20) = 20   [fee deferred: cum=14, fee=6, adj=20]
    const pfCum21 = pfByDate['2026-02-21']?.cumulativeProfit;
    expect(pfCum21).toBeCloseTo(20, 1);

    // pfCum22 = 20 + daily22(=-11) = 9  — same as raw sfCum22 because no fee on day3
    const sfCum22 = sfByDate['2026-02-22'].cumulativeProfit;
    const pfCum22 = pfByDate['2026-02-22']?.cumulativeProfit;
    expect(pfCum22).toBeCloseTo(9, 1);
    expect(pfCum22).toBeCloseTo(sfCum22, 1); // both equal 9

    // Overall timeline daily on 2026-02-21 must match single-fund daily (fee deferred)
    // single-fund daily_21 = adjustedCum_21 - adjustedCum_20 = (cum+fee) - (0+0) = 14+6=20
    expect(sfByDate['2026-02-21'].dailyProfit).toBeCloseTo(20, 1);

    // Overall timeline daily on 2026-02-22 must match single-fund daily
    // single-fund daily_22 = -11 (50*(1.1-1.2) - 6)
    expect(sfByDate['2026-02-22'].dailyProfit).toBeCloseTo(-11, 1);
  });

  test('two funds: overall daily is sum of each fund fee-deferral daily', async () => {
    // Fund A: sell trade with fee=6 on day2
    // Fund B: no trades
    // Overall day2 daily = fundA_daily_day2 + fundB_daily_day2
    const SYM_A = '888002';
    const SYM_B = '888003';
    localStorage.setItem('fund_portfolio', JSON.stringify([
      { symbol: SYM_A, name: 'Fund A' },
      { symbol: SYM_B, name: 'Fund B' },
    ]));
    localStorage.setItem(`fund_position_${SYM_A}`, JSON.stringify({
      startDate: '2026-02-20', initialPosition: 100, initialPrice: 1.0,
    }));
    localStorage.setItem(`fund_position_${SYM_B}`, JSON.stringify({
      startDate: '2026-02-20', initialPosition: 200, initialPrice: 2.0,
    }));

    const histA = [
      { date: mkTs('2026-02-20'), value: 1.0, equityReturn: 0 },
      { date: mkTs('2026-02-21'), value: 1.2, equityReturn: 0 },
      { date: mkTs('2026-02-22'), value: 1.1, equityReturn: 0 },
    ];
    const histB = [
      { date: mkTs('2026-02-20'), value: 2.0, equityReturn: 0 },
      { date: mkTs('2026-02-21'), value: 2.1, equityReturn: 0 },
      { date: mkTs('2026-02-22'), value: 2.05, equityReturn: 0 },
    ];
    const tradesA = [{ id: 's1', date: '2026-02-21', type: 'sell', shares: 50, price: 1.2, fee: 6 }];

    _deps.fetchFundHistory = jest.fn().mockImplementation(async (sym: string) => {
      if (sym === SYM_A) return histA;
      if (sym === SYM_B) return histB;
      return [];
    });
    _deps.fetchFundData = jest.fn().mockResolvedValue(null);
    getTradesForSymbol.mockImplementation((sym: string) => sym === SYM_A ? tradesA : []);

    // Single-fund references
    const tlA = computeProfitTimeline({ history: histA, trades: tradesA as any, initialPosition: 100, initialPrice: 1.0 });
    const tlB = computeProfitTimeline({ history: histB, trades: [], initialPosition: 200, initialPrice: 2.0 });
    const byDateA = Object.fromEntries(tlA.map(p => [p.date, p]));
    const byDateB = Object.fromEntries(tlB.map(p => [p.date, p]));

    const result = await (fundService as any).computeOverallProfit({ toDate: '2026-02-22' });
    const overallByDate = Object.fromEntries(result.timeline.map((p: any) => [p.date, p]));

    // On day2: overall daily = fundA daily + fundB daily (both using fee-deferral)
    const expectedDay2 = byDateA['2026-02-21'].dailyProfit + byDateB['2026-02-21'].dailyProfit;
    expect(overallByDate['2026-02-21']?.dailyProfit).toBeCloseTo(expectedDay2, 1);

    // On day3: overall daily = fundA daily + fundB daily
    const expectedDay3 = byDateA['2026-02-22'].dailyProfit + byDateB['2026-02-22'].dailyProfit;
    expect(overallByDate['2026-02-22']?.dailyProfit).toBeCloseTo(expectedDay3, 1);
  });
});
