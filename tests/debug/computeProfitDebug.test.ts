import { computeProfitTimeline } from '../../utils/profitCalculator';
import { HistoricalPoint } from '../../types';

describe('computeProfitDebug', () => {
  test('keeps trade application single when the same local date appears twice in history', () => {
    const d0303a = Date.UTC(2026, 2, 3, 7, 0, 0);
    const d0303b = Date.UTC(2026, 2, 3, 12, 0, 0);

    const history: HistoricalPoint[] = [
      { date: d0303a, value: 2.0, equityReturn: 0 },
      { date: d0303b, value: 2.0, equityReturn: 0 },
    ];

    const timeline = computeProfitTimeline({
      history,
      trades: [
        { id: 'sell-1', date: '2026-03-03', type: 'sell', shares: 500, price: 2.0, fee: 1.0 },
      ],
      initialPosition: 1000,
      initialPrice: 1.5,
    });

    const sameDayRows = timeline.filter((row) => row.date === '2026-03-03');
    expect(sameDayRows).toHaveLength(2);

    // 新逻辑：交易不影响当天的份额和累计盈利
    // 因此当天份额仍为初始份额 1000，交易会在下一天生效
    for (const row of sameDayRows) {
      expect(row.shares).toBe(1000); // 交易尚未应用，份额仍为 1000
      // cumulativeProfit = 1000 * 2.0 - 1000 * 1.5 = 500
      expect(row.cumulativeProfit).toBeCloseTo(500, 4);
    }
  });
});
