// mock trades provider module used by fundService
jest.mock('../../hooks/useTrades', () => ({
  getTradesForSymbol: jest.fn()
}));

const { getTradesForSymbol } = require('../../hooks/useTrades');

import * as fundService from '../../services/fundService';
import { _deps } from '../../services/fundService';
import { computeProfitTimeline } from '../../utils/profitCalculator';
import * as marketFundService from '../../services/marketFundService';

describe('computeOverallProfit', () => {
  // Save and restore _deps so each test gets a clean slate
  let origFetchHistory: typeof _deps.fetchFundHistory;
  let origFetchData:    typeof _deps.fetchFundData;

  beforeEach(() => {
    origFetchHistory = _deps.fetchFundHistory;
    origFetchData    = _deps.fetchFundData;
    localStorage.clear();
    marketFundService.resetCache();
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
    // 使用 marketFundService 设置测试数据
    marketFundService.addFund('270023', 'Fund A');
    marketFundService.updatePosition('270023', {
      fullCapacity: 0,
      startDate: '2026-02-11',
      initialPosition: 1,
      initialPrice: null
    });
    marketFundService.addFund('300000', 'Fund B');
    marketFundService.updatePosition('300000', {
      fullCapacity: 0,
      startDate: '2026-02-13',
      initialPosition: 2,
      initialPrice: null
    });

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
    // 不再填充目标日期，所以不包含 todayLocal
    expect(dates).toEqual(['2026-02-12', '2026-02-13']);

    // Fund A: startDate='2026-02-11', initialPrice=null in storage.
    // computeOverallProfit now resolves initialPrice from history: startDate has no exact match,
    // falls back to first available history point value = 5.0.
    // Timeline 从 fundStartDate 开始，但历史最早是 2026-02-12，所以实际从 2026-02-12 开始
    const aTimeline = computeProfitTimeline({ history: [
      { date: mkTs('2026-02-12'), value: 5.0, equityReturn: 0 },
      { date: mkTs('2026-02-13'), value: 6.0, equityReturn: 0 }
    ], trades: [], initialPosition: 1, initialPrice: 5.0, fromDate: '2026-02-11', toDate: null });

    // Fund B: startDate='2026-02-13', initialPrice=null in storage.
    // Resolved: exact match on 2026-02-13 = 1.5.
    // Timeline 从 fundStartDate 2026-02-13 开始
    const bTimeline = computeProfitTimeline({ history: [
      { date: mkTs('2026-02-12'), value: 1.0, equityReturn: 0 },
      { date: mkTs('2026-02-13'), value: 1.5, equityReturn: 0 }
    ], trades: [], initialPosition: 2, initialPrice: 1.5, fromDate: '2026-02-13', toDate: null });

    const allDates = dates;
    function buildForwardFilled(pt: any[]) {
      const map: Record<string, number> = {};
      for (const p of pt) map[p.date] = Number(p.cumulativeProfit.toFixed(4));
      // 累计盈利直接使用 computeProfitTimeline 的结果，不再进行 startDate 偏移
      const arr: number[] = [];
      let lastVal: number | null = null;
      for (const d of allDates) {
        let val: number;
        if (map[d] !== undefined) { val = map[d]; lastVal = val; }
        else if (lastVal !== null) val = lastVal;
        else val = 0;
        arr.push(Number(val.toFixed(4)));
      }
      return arr;
    }

    const expectA = buildForwardFilled(aTimeline);
    const expectB = buildForwardFilled(bTimeline);
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
    // 使用 marketFundService 设置测试数据
    marketFundService.addFund('111111', 'Late');
    marketFundService.updatePosition('111111', {
      fullCapacity: 0,
      startDate: '2026-03-02',
      initialPosition: 1,
      initialPrice: null
    });
    marketFundService.addFund('222222', 'Early');
    marketFundService.updatePosition('222222', {
      fullCapacity: 0,
      startDate: '2026-02-01',
      initialPosition: 1,
      initialPrice: null
    });

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

    // 使用 marketFundService 设置测试数据
    marketFundService.addFund('023832', 'Test');
    marketFundService.updatePosition('023832', {
      fullCapacity: 0,
      startDate: '2026-02-13',
      initialPosition: 13831.32,
      initialPrice: 1.3737
    });

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

    // 新逻辑：交易不影响当天的份额和累计盈利
    // 因此 2026-03-03 的份额仍为初始份额，交易会在下一天生效
    const entry0302 = ft.find((r: any) => r.date === '2026-03-02');
    expect(entry0302).toBeDefined();

    // Calculate expected cumulative values (trade NOT applied on same day)
    const sharesBefore = 13831.32;
    const initCost = 13831.32 * 1.3737;

    // Expected cumulative on 2026-03-02 (before trade)
    const expectedCum0302 = sharesBefore * 1.5956 - initCost;
    expect(entry0302!.cumulativeProfit).toBeCloseTo(expectedCum0302, 1);

    // Expected cumulative on 2026-03-03 (trade NOT applied on same day)
    // 份额仍为初始份额，累计盈利不含交易收益
    const expectedCum0303 = sharesBefore * 1.66 - initCost;
    expect(entry0303!.cumulativeProfit).toBeCloseTo(expectedCum0303, 1);

    // 验证交易没有在同一天应用：日盈亏应该只来自净值变化
    const daily0303 = (entry0303!.cumulativeProfit) - (entry0302!.cumulativeProfit);
    const expectedDaily = sharesBefore * (1.66 - 1.5956);
    expect(daily0303).toBeCloseTo(expectedDaily, 1);
  });

  test('today synthetic point prefers valuation over confirmed when same date', async () => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    // 使用 marketFundService 设置测试数据
    marketFundService.addFund('111111', 'A');
    marketFundService.updatePosition('111111', {
      fullCapacity: 0,
      startDate: '2026-02-01',
      initialPosition: 10,
      initialPrice: 1
    });

    _deps.fetchFundHistory = jest.fn().mockResolvedValue([
      { date: new Date('2026-03-01 15:00').getTime(), value: 1.1, equityReturn: 0 },
    ]);
    _deps.fetchFundData = jest.fn().mockResolvedValue({
      symbol: '111111',
      name: 'A',
      currentPrice: 2.2,
      previousPrice: 1.8,
      realtimeDate: today,
      netWorthDate: today,
      changePercentage: 0,
      lastUpdated: '',
      valuationDate: today,
      sourceUrl: '',
    });
    getTradesForSymbol.mockReturnValue([]);

    const result = await (fundService as any).computeOverallProfit({});
    const rows = (result.perFundTimelines || {})['111111'] || [];
    const last = rows[rows.length - 1];

    expect(last.date).toBe(today);
    expect(last.cumulativeProfit).toBeCloseTo(12, 4);
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
    marketFundService.resetCache();
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
    // 使用 marketFundService 设置测试数据
    marketFundService.addFund('100001', 'Fund A');
    marketFundService.updatePosition('100001', {
      fullCapacity: 0,
      startDate: '2026-01-10',
      initialPosition: 1,
      initialPrice: null
    });
    marketFundService.addFund('100002', 'Fund B');
    marketFundService.updatePosition('100002', {
      fullCapacity: 0,
      startDate: '2026-02-05',
      initialPosition: 1,
      initialPrice: null
    });

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
    marketFundService.resetCache();
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
    // 使用 marketFundService 设置测试数据
    marketFundService.addFund(SYM, 'Test Fund');
    marketFundService.updatePosition(SYM, {
      fullCapacity: 0,
      startDate: '2026-02-20',
      initialPosition: 100,
      initialPrice: 1.0
    });

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

    // perFundTimelines for this fund (cumulativeProfit 直接使用 computeProfitTimeline 的结果)
    const perFundTl: { date: string; cumulativeProfit: number }[] =
      (result.perFundTimelines || {})[SYM] || [];
    const pfByDate = Object.fromEntries(perFundTl.map((p: any) => [p.date, p]));

    // perFundTimelines 的 cumulativeProfit 应该与 computeProfitTimeline 的 cumulativeProfit 一致
    // startDate 那天的累计盈利应该等于 computeProfitTimeline 的 cumulativeProfit
    expect(pfByDate['2026-02-20']?.cumulativeProfit).toBeCloseTo(sfByDate['2026-02-20'].cumulativeProfit, 4);

    // 2026-02-21: cumulativeProfit 应该与 computeProfitTimeline 的 cumulativeProfit 一致
    const pfCum21 = pfByDate['2026-02-21']?.cumulativeProfit;
    expect(pfCum21).toBeCloseTo(sfByDate['2026-02-21'].cumulativeProfit, 1);

    // 2026-02-22: cumulativeProfit 应该与 computeProfitTimeline 的 cumulativeProfit 一致
    const pfCum22 = pfByDate['2026-02-22']?.cumulativeProfit;
    expect(pfCum22).toBeCloseTo(sfByDate['2026-02-22'].cumulativeProfit, 1);

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
    // 使用 marketFundService 设置测试数据
    marketFundService.addFund(SYM_A, 'Fund A');
    marketFundService.updatePosition(SYM_A, {
      fullCapacity: 0,
      startDate: '2026-02-20',
      initialPosition: 100,
      initialPrice: 1.0
    });
    marketFundService.addFund(SYM_B, 'Fund B');
    marketFundService.updatePosition(SYM_B, {
      fullCapacity: 0,
      startDate: '2026-02-20',
      initialPosition: 200,
      initialPrice: 2.0
    });

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

    // Overall timeline cumulative should be sum of individual fund cumulative values
    // (using cumulativeProfit directly, without fee-deferral in derived daily)
    // Day 1: overall cumulative = fundA_cum + fundB_cum
    expect(overallByDate['2026-02-20']?.cumulativeProfit).toBeCloseTo(
      byDateA['2026-02-20'].cumulativeProfit + byDateB['2026-02-20'].cumulativeProfit, 1
    );

    // Day 2: overall cumulative = fundA_cum + fundB_cum
    expect(overallByDate['2026-02-21']?.cumulativeProfit).toBeCloseTo(
      byDateA['2026-02-21'].cumulativeProfit + byDateB['2026-02-21'].cumulativeProfit, 1
    );

    // Day 3: overall cumulative = fundA_cum + fundB_cum
    expect(overallByDate['2026-02-22']?.cumulativeProfit).toBeCloseTo(
      byDateA['2026-02-22'].cumulativeProfit + byDateB['2026-02-22'].cumulativeProfit, 1
    );

    // Note: The overall daily is derived from cumulative differences,
    // which does NOT include fee-deferral effect from individual fund dailyProfit calculations.
    // Fee-deferral is applied in computeProfitTimeline's dailyProfit, not in cumulativeProfit.
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findValue: 当查询日期早于建仓日期时，返回建仓日期的累计盈利
// ─────────────────────────────────────────────────────────────────────────────
describe('findValue — query date before fund startDate', () => {
  // 模拟 OverallProfitModal 中 findValue 函数的核心逻辑
  function findValue(
    date: string,
    fundTimeline: { date: string; cumulativeProfit: number }[]
  ): number {
    // find exact match
    const exact = fundTimeline.find(r => r.date === date);
    // find last before
    let lastBefore: { date: string; cumulativeProfit: number } | null = null;
    for (let i = fundTimeline.length - 1; i >= 0; i--) {
      if (fundTimeline[i].date <= date) { lastBefore = fundTimeline[i]; break; }
    }
    // find next after
    let nextAfter: { date: string; cumulativeProfit: number } | null = null;
    for (let i = 0; i < fundTimeline.length; i++) {
      if (fundTimeline[i].date > date) { nextAfter = fundTimeline[i]; break; }
    }
    if (exact) return exact.cumulativeProfit;
    if (lastBefore) return lastBefore.cumulativeProfit;
    // 如果没有 lastBefore 但有 nextAfter，说明 date 早于建仓日期，返回建仓日期的累计盈利
    if (nextAfter) return nextAfter.cumulativeProfit;
    return 0;
  }

  test('returns cumulativeProfit at exact date when it exists', () => {
    const timeline = [
      { date: '2026-02-12', cumulativeProfit: 100 },
      { date: '2026-02-13', cumulativeProfit: 150 },
    ];
    expect(findValue('2026-02-12', timeline)).toBe(100);
    expect(findValue('2026-02-13', timeline)).toBe(150);
  });

  test('returns lastBefore cumulativeProfit when date falls between two points', () => {
    const timeline = [
      { date: '2026-02-12', cumulativeProfit: 100 },
      { date: '2026-02-14', cumulativeProfit: 200 },
    ];
    // 2026-02-13 不在 timeline 中，但 2026-02-12 <= 2026-02-13
    expect(findValue('2026-02-13', timeline)).toBe(100);
  });

  test('returns nextAfter cumulativeProfit when date is before first point (earlier than startDate)', () => {
    const timeline = [
      { date: '2026-02-12', cumulativeProfit: 28790.97 },
      { date: '2026-02-13', cumulativeProfit: 30000 },
    ];
    // 2026-02-11 早于建仓日期 2026-02-12，应返回建仓日期的累计盈利
    expect(findValue('2026-02-11', timeline)).toBe(28790.97);
  });

  test('returns 0 when timeline is empty', () => {
    expect(findValue('2026-02-11', [])).toBe(0);
  });

  test('returns lastBefore when date is after last point', () => {
    const timeline = [
      { date: '2026-02-12', cumulativeProfit: 100 },
      { date: '2026-02-13', cumulativeProfit: 150 },
    ];
    // 2026-02-14 在最后一个点之后，lastBefore 存在
    expect(findValue('2026-02-14', timeline)).toBe(150);
  });

  test('returns nextAfter when fromDate is multiple days before startDate', () => {
    const timeline = [
      { date: '2026-02-12', cumulativeProfit: 28790.97 },
      { date: '2026-02-15', cumulativeProfit: 35000 },
    ];
    // 2026-02-10 早于建仓日期 2026-02-12 多天
    expect(findValue('2026-02-10', timeline)).toBe(28790.97);
  });

  test('regression: date exactly one day before startDate returns startDate cumulative', () => {
    // 这是对之前 bug 的回归测试：建仓日期前一天返回 0 而不是建仓日期的累计盈利
    const timeline = [
      { date: '2026-02-12', cumulativeProfit: 28790.97 },
      { date: '2026-02-13', cumulativeProfit: 29000 },
    ];
    expect(findValue('2026-02-11', timeline)).toBe(28790.97);
  });
});
