jest.mock('../../hooks/useTrades', () => ({
  getTradesForSymbol: jest.fn().mockReturnValue([]),
}));

import { resolvePreferredPrice } from '../../utils/priceResolver';
import { computeOverallProfit, _deps } from '../../services/fundService';

describe('price resolution contract', () => {
  let origFetchHistory: typeof _deps.fetchFundHistory;
  let origFetchData: typeof _deps.fetchFundData;

  beforeEach(() => {
    origFetchHistory = _deps.fetchFundHistory;
    origFetchData = _deps.fetchFundData;
    localStorage.clear();
  });

  afterEach(() => {
    _deps.fetchFundHistory = origFetchHistory;
    _deps.fetchFundData = origFetchData;
  });

  test('overall profit end-date valuation uses the same preferred price as resolver', async () => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const history = [{ date: new Date('2026-03-01 15:00').getTime(), value: 1.1, equityReturn: 0 }];
    const valuation = {
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
    };

    const resolved = resolvePreferredPrice({
      targetDate: today,
      todayDate: today,
      history,
      currentPrice: valuation.currentPrice,
      realtimeDate: valuation.realtimeDate,
      previousPrice: valuation.previousPrice,
      netWorthDate: valuation.netWorthDate,
    });

    expect(resolved).not.toBeNull();
    expect(resolved!.price).toBeCloseTo(2.2, 4);

    localStorage.setItem('fund_portfolio', JSON.stringify([{ symbol: '111111', name: 'A' }]));
    localStorage.setItem('fund_position_111111', JSON.stringify({ startDate: '2026-02-01', initialPosition: 10, initialPrice: 1 }));

    _deps.fetchFundHistory = jest.fn().mockResolvedValue(history);
    _deps.fetchFundData = jest.fn().mockResolvedValue(valuation as any);

    const summary = await computeOverallProfit({});
    const fundTimeline = summary.perFundTimelines?.['111111'] || [];
    expect(fundTimeline.length).toBeGreaterThan(0);

    const last = fundTimeline[fundTimeline.length - 1];
    expect(last.date).toBe(today);
    // (initialPosition * resolvedPrice) - (initialPosition * initialPrice) = 10*(2.2-1) = 12
    expect(last.cumulativeProfit).toBeCloseTo(12, 4);
  });
});

