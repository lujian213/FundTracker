import { ProfitPoint } from '../../types';
import { adjustProfitTimelineForDisplay } from '../../utils/profitAdjustment';

describe('profitAdjustment', () => {
  describe('adjustProfitTimelineForDisplay', () => {
    it('should return empty array if input timeline is empty', () => {
      const result = adjustProfitTimelineForDisplay([], null);
      expect(result).toEqual([]);
    });

    it('should return original timeline if fromDate is null', () => {
      const originalTimeline: ProfitPoint[] = [
        { date: '2023-01-01', netValue: 1.0, shares: 100, cumulativeProfit: 10, dailyProfit: 5 },
        { date: '2023-01-02', netValue: 1.1, shares: 100, cumulativeProfit: 15, dailyProfit: 5 },
      ];

      const result = adjustProfitTimelineForDisplay(originalTimeline, null);
      expect(result).toEqual(originalTimeline);
    });

    it('should set first day\'s daily profit to 0, keep cumulative profit unchanged', () => {
      const originalTimeline: ProfitPoint[] = [
        { date: '2023-01-01', netValue: 1.0, shares: 100, cumulativeProfit: 10, dailyProfit: 5 },
        { date: '2023-01-02', netValue: 1.1, shares: 100, cumulativeProfit: 15, dailyProfit: 5 },
        { date: '2023-01-03', netValue: 1.2, shares: 100, cumulativeProfit: 20, dailyProfit: 5 },
      ];

      const result = adjustProfitTimelineForDisplay(originalTimeline, '2023-01-01');

      // 第一天：当日盈亏为0，累计盈亏保持原值
      expect(result[0]).toEqual({
        date: '2023-01-01',
        netValue: 1.0,
        shares: 100,
        cumulativeProfit: 10, // 保持原值
        dailyProfit: 0,       // 设为0
      });

      // 后续日期保持原值不变
      expect(result[1].dailyProfit).toBe(5);
      expect(result[1].cumulativeProfit).toBe(15);
      expect(result[2].dailyProfit).toBe(5);
      expect(result[2].cumulativeProfit).toBe(20);
    });

    it('should handle a single day timeline', () => {
      const originalTimeline: ProfitPoint[] = [
        { date: '2023-01-01', netValue: 1.0, shares: 100, cumulativeProfit: 10, dailyProfit: 5 },
      ];

      const result = adjustProfitTimelineForDisplay(originalTimeline, '2023-01-01');

      expect(result[0]).toEqual({
        date: '2023-01-01',
        netValue: 1.0,
        shares: 100,
        cumulativeProfit: 10, // 保持原值
        dailyProfit: 0,       // 设为0
      });
    });

    it('should handle timeline with negative profits', () => {
      const originalTimeline: ProfitPoint[] = [
        { date: '2023-01-01', netValue: 1.0, shares: 100, cumulativeProfit: -10, dailyProfit: -5 },
        { date: '2023-01-02', netValue: 0.9, shares: 100, cumulativeProfit: -5, dailyProfit: 5 },
        { date: '2023-01-03', netValue: 0.8, shares: 100, cumulativeProfit: -15, dailyProfit: -10 },
      ];

      const result = adjustProfitTimelineForDisplay(originalTimeline, '2023-01-01');

      // 第一天：当日盈亏为0，累计盈亏保持原值
      expect(result[0].dailyProfit).toBe(0);
      expect(result[0].cumulativeProfit).toBe(-10);

      // 后续天数保持原值
      expect(result[1].dailyProfit).toBe(5);
      expect(result[1].cumulativeProfit).toBe(-5);
      expect(result[2].dailyProfit).toBe(-10);
      expect(result[2].cumulativeProfit).toBe(-15);
    });

    it('should handle timeline where first date does not match fromDate', () => {
      const originalTimeline: ProfitPoint[] = [
        { date: '2023-01-01', netValue: 1.0, shares: 100, cumulativeProfit: 10, dailyProfit: 5 },
        { date: '2023-01-02', netValue: 1.1, shares: 100, cumulativeProfit: 15, dailyProfit: 5 },
        { date: '2023-01-03', netValue: 1.2, shares: 100, cumulativeProfit: 20, dailyProfit: 5 },
      ];

      // 当fromDate与timeline第一个日期不匹配时，不应进行调整
      const result = adjustProfitTimelineForDisplay(originalTimeline, '2023-01-02');

      // 因为fromDate不是timeline的第一天，所以返回原始timeline
      expect(result).toEqual(originalTimeline);
    });
  });
});