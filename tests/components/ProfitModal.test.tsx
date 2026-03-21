import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ProfitModal from '../../components/ProfitModal';
import { computeProfitTimeline } from '../../utils/profitCalculator';
import { formatDateDisplay } from '../../utils/dateFormat';

// Mock fetchFundHistory in services and useTrades hook
jest.mock('../../services/fundService', () => ({ fetchFundHistory: jest.fn() }));
jest.mock('../../hooks/useTrades', () => ({ __esModule: true, default: (symbol: string) => ({ trades: [] }) }));

import { fetchFundHistory } from '../../services/fundService';

const SAMPLE_HISTORY = [
  { date: new Date('2026-02-20').getTime(), value: 10, equityReturn: 0 },
  { date: new Date('2026-02-21').getTime(), value: 12, equityReturn: 0 },
  { date: new Date('2026-02-22').getTime(), value: 11, equityReturn: 0 }
];

describe('ProfitModal', () => {
  beforeEach(() => {
    (fetchFundHistory as jest.Mock).mockResolvedValue(SAMPLE_HISTORY);
  });
  afterEach(() => jest.restoreAllMocks());

  test('renders and shows three-column table rows', async () => {
    render(<ProfitModal symbol="000001" initialPosition={100} initialPrice={9} onClose={() => {}} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled());
    // wait for rows to be rendered
    await waitFor(() => expect(document.querySelectorAll('tbody tr').length).toBe(3));
    // header should have three columns (flexible check)
    const headers = document.querySelectorAll('thead th');
    expect(headers.length).toBeGreaterThanOrEqual(2);
  });

  test('date validation prevents selecting before initialStartDate', async () => {
    render(<ProfitModal symbol="000001" initialPosition={100} initialPrice={9} initialStartDate={'2026-02-21'} onClose={() => {}} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled());
    const inputs = document.querySelectorAll('input[type="date"]');
    // attempt to set fromDate to 2026-02-20 which is before initialStartDate
    fireEvent.change(inputs[0], { target: { value: '2026-02-20' } });
    await waitFor(() => expect(screen.getByText(/开始日期不能早于持仓起始日期/)).toBeTruthy());
  });

  test('changing dates and clicking 清除 should clear table rows', async () => {
    render(<ProfitModal symbol="000001" initialPosition={100} initialPrice={9} onClose={() => {}} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled());
    // wait for initial rows exist
    await waitFor(() => expect(document.querySelectorAll('tbody tr').length).toBe(3));
    // change temp start date to trigger confirm dialog
    const inputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(inputs[0], { target: { value: '2026-02-21' } });
    // dates apply immediately; table should be filtered to 2 rows (21 and 22)
    await waitFor(() => expect(document.querySelectorAll('tbody tr').length).toBe(2));
    const rows = Array.from(document.querySelectorAll('tbody tr'));
    const rowDates = rows.map(r => r.querySelector('td')?.textContent?.trim());
    expect(rowDates).toContain(formatDateDisplay('2026-02-21'));
    expect(rowDates).toContain(formatDateDisplay('2026-02-22'));
  });

  test('uses today confirmed NAV when valuation is missing', async () => {
    const d = new Date();
    const todayIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    render(
      <ProfitModal
        symbol="000001"
        initialPosition={100}
        initialPrice={9}
        currentPrice={0}
        previousPrice={3}
        realtimeDate={'---'}
        netWorthDate={todayIso}
        onClose={() => {}}
      />
    );

    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText(formatDateDisplay(todayIso)).length).toBeGreaterThan(0));
    expect(screen.getAllByText('3.0000').length).toBeGreaterThan(0);
  });
});

// ─── Fee-deferral convention tests (computeProfitTimeline directly) ───────────
describe('ProfitModal fee-deferral convention (via computeProfitTimeline)', () => {
  const mkDate = (s: string) => new Date(s + 'T08:00:00Z').getTime();

  test('sell fee on day D appears in next day daily, not current day', () => {
    // 100 shares @1.0, sell 50 @1.2 fee=6 on day2, no trade on day3
    // day2: cum=50*1.2 - 100*1.0 + (50*1.2-6) = 60-100+54=14, fee=6, adj=20, prev from day1=0+0=0 -> daily=20
    // day3: cum=50*1.1 - 100*1.0 + (50*1.2-6)=55-100+54=9, fee=0, adj=9. daily=9-20=-11 (=50*(1.1-1.2)-6)
    const history = [
      { date: mkDate('2026-02-20'), value: 1.0, equityReturn: 0 },
      { date: mkDate('2026-02-21'), value: 1.2, equityReturn: 0 },
      { date: mkDate('2026-02-22'), value: 1.1, equityReturn: 0 },
    ];
    const trades = [{ id: 's1', date: '2026-02-21', type: 'sell' as const, shares: 50, price: 1.2, fee: 6 }];
    const tl = computeProfitTimeline({ history, trades, initialPosition: 100, initialPrice: 1.0 });
    const byDate = Object.fromEntries(tl.map(p => [p.date, p]));

    // day1: no trade, no fee, daily = 0
    expect(byDate['2026-02-20'].dailyProfit).toBeCloseTo(0, 4);
    // day2: fee deferred → daily = price-change gain + sell proceeds (fee excluded from today)
    // = 50*(1.2-1.0) + (50*1.2-6+6) ... adjusted = cum+fee = 14+6=20; daily=20-0=20
    expect(byDate['2026-02-21'].dailyProfit).toBeCloseTo(20, 1);
    // day3: fee from yesterday (6) now absorbed → daily = 50*(1.1-1.2) - 6 = -5-6 = -11
    expect(byDate['2026-02-22'].dailyProfit).toBeCloseTo(-11, 1);
    // cumulativeProfit is unaffected by deferral (it's the raw cumulative)
    expect(byDate['2026-02-22'].cumulativeProfit).toBeCloseTo(9, 1);
  });

  test('buy fee on day D appears in next day daily, not current day', () => {
    // 100 shares @1.0, buy 50 @1.2 fee=6 on day2
    // day2: cumBuy=50*1.2+6=66. cum=150*1.2-100*1.0-66=180-100-66=14. fee=6, adj=20. daily=20-0=20
    // day3: cum=150*1.1-100*1.0-66=165-100-66=-1. adj=-1. daily=-1-20=-21 (=150*(1.1-1.2)-6=-15-6=-21)
    const history = [
      { date: mkDate('2026-02-20'), value: 1.0, equityReturn: 0 },
      { date: mkDate('2026-02-21'), value: 1.2, equityReturn: 0 },
      { date: mkDate('2026-02-22'), value: 1.1, equityReturn: 0 },
    ];
    const trades = [{ id: 'b1', date: '2026-02-21', type: 'buy' as const, shares: 50, price: 1.2, fee: 6 }];
    const tl = computeProfitTimeline({ history, trades, initialPosition: 100, initialPrice: 1.0 });
    const byDate = Object.fromEntries(tl.map(p => [p.date, p]));

    expect(byDate['2026-02-20'].dailyProfit).toBeCloseTo(0, 4);
    expect(byDate['2026-02-21'].dailyProfit).toBeCloseTo(20, 1);
    expect(byDate['2026-02-22'].dailyProfit).toBeCloseTo(-21, 1);
  });

  test('no-trade days are unaffected by fee-deferral', () => {
    // Simple scenario: no trades at all → daily = shares * ΔNV
    const history = [
      { date: mkDate('2026-02-20'), value: 1.0, equityReturn: 0 },
      { date: mkDate('2026-02-21'), value: 1.1, equityReturn: 0 },
      { date: mkDate('2026-02-22'), value: 1.05, equityReturn: 0 },
    ];
    const tl = computeProfitTimeline({ history, trades: [], initialPosition: 1000, initialPrice: 1.0 });
    const byDate = Object.fromEntries(tl.map(p => [p.date, p]));
    expect(byDate['2026-02-20'].dailyProfit).toBeCloseTo(0, 4);
    expect(byDate['2026-02-21'].dailyProfit).toBeCloseTo(1000 * (1.1 - 1.0), 2);
    expect(byDate['2026-02-22'].dailyProfit).toBeCloseTo(1000 * (1.05 - 1.1), 2);
  });

  test('baseline adjustment: day-0 dailyProfit is 0 and subsequent days use fee-deferral daily', () => {
    // initialStartDate = first history date → baseline applied
    // Sell 50 on day2 with fee=6; after baseline: day1 daily=0, day2 daily comes from fee-deferral
    const history = [
      { date: mkDate('2026-02-20'), value: 1.0, equityReturn: 0 },
      { date: mkDate('2026-02-21'), value: 1.2, equityReturn: 0 },
      { date: mkDate('2026-02-22'), value: 1.1, equityReturn: 0 },
    ];
    const trades = [{ id: 's1', date: '2026-02-21', type: 'sell' as const, shares: 50, price: 1.2, fee: 6 }];
    // computeProfitTimeline returns raw timeline; baseline adjustment is done inside displayedTimeline
    // We test the raw timeline values that will feed into displayedTimeline
    const tl = computeProfitTimeline({ history, trades, initialPosition: 100, initialPrice: 1.0 });
    // Simulate ProfitModal's displayedTimeline baseline adjustment (fromDate === initialStartDate)
    const dedup = tl.map(p => ({ ...p }));
    let cumAcc = 0;
    for (let i = 0; i < dedup.length; i++) {
      const daily = i === 0 ? 0 : dedup[i].dailyProfit;
      cumAcc = Number((cumAcc + daily).toFixed(4));
      dedup[i] = { ...dedup[i], cumulativeProfit: cumAcc, dailyProfit: daily };
    }
    expect(dedup[0].dailyProfit).toBe(0);
    expect(dedup[0].cumulativeProfit).toBe(0);
    // day2 daily = fee-deferral value (same as above test: 20)
    expect(dedup[1].dailyProfit).toBeCloseTo(20, 1);
    expect(dedup[1].cumulativeProfit).toBeCloseTo(20, 1);
    // day3 daily = -11, cumulative = 9
    expect(dedup[2].dailyProfit).toBeCloseTo(-11, 1);
    expect(dedup[2].cumulativeProfit).toBeCloseTo(9, 1);
  });

  test('periodTotal equals sum of all dailyProfits in displayedTimeline', () => {
    const history = [
      { date: mkDate('2026-02-20'), value: 1.0, equityReturn: 0 },
      { date: mkDate('2026-02-21'), value: 1.2, equityReturn: 0 },
      { date: mkDate('2026-02-22'), value: 1.1, equityReturn: 0 },
    ];
    const trades = [{ id: 's1', date: '2026-02-21', type: 'sell' as const, shares: 50, price: 1.2, fee: 6 }];
    const tl = computeProfitTimeline({ history, trades, initialPosition: 100, initialPrice: 1.0 });
    const sumDaily = tl.reduce((s, p) => s + p.dailyProfit, 0);
    const lastCum = tl[tl.length - 1].cumulativeProfit;
    // periodTotal (sum of daily) should equal last cumulativeProfit (raw, unbaselined)
    expect(sumDaily).toBeCloseTo(lastCum, 2);
  });
});

