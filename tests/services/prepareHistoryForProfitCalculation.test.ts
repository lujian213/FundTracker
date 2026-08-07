import { HistoricalPoint } from '../../types';
import { prepareHistoryForProfitCalculation } from '../../services/fundService';

// Helper to create timestamp for a date at 15:00
const mkTs = (date: string) => new Date(`${date} 15:00`).getTime();
const mkTsMorning = (date: string) => new Date(`${date} 00:00`).getTime();

describe('prepareHistoryForProfitCalculation', () => {
  const todayDate = '2026-03-23';

  describe('basic functionality', () => {
    it('should return empty array for empty input', () => {
      const result = prepareHistoryForProfitCalculation({
        history: [],
        targetDate: todayDate,
        todayDate,
      });
      expect(result).toEqual([]);
    });

    it('should sort and deduplicate history by local date', () => {
      const history: HistoricalPoint[] = [
        { date: mkTs('2026-03-20'), value: 1.5, equityReturn: 0 },
        { date: mkTs('2026-03-19'), value: 1.4, equityReturn: 0 },
        { date: mkTsMorning('2026-03-20'), value: 1.45, equityReturn: 0 }, // same date, earlier time
      ];

      const result = prepareHistoryForProfitCalculation({
        history,
        targetDate: todayDate,
        todayDate,
      });

      // Should have 2 entries: 19, 20 (target date no longer auto-filled)
      expect(result.length).toBe(2);
      expect(result[0].date).toBe(mkTs('2026-03-19'));
      // For same date, higher timestamp wins (15:00 > 00:00)
      expect(result[1].value).toBe(1.5);
    });

    describe('preferred price handling', () => {
    it('should override history with valuation data when targetDate is today', () => {
      // When targetDate === todayDate, resolvePreferredPrice prioritizes valuation
      const history: HistoricalPoint[] = [
        { date: mkTsMorning('2026-03-23'), value: 1.4, equityReturn: 0 }, // history at 00:00
        { date: mkTs('2026-03-22'), value: 1.5, equityReturn: 0 },
      ];

      const result = prepareHistoryForProfitCalculation({
        history,
        targetDate: todayDate, // targetDate = todayDate
        todayDate,
        currentPrice: 1.45, // valuation price
        realtimeDate: todayDate, // valuation date is today
      });

      // Today should have valuation price, not history price
      const pointToday = result.find(p => {
        const d = new Date(p.date);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` === todayDate;
      });
      expect(pointToday?.value).toBe(1.45); // valuation price overrides history
    });

    it('should use confirmed NAV when targetDate is today and valuation is not available', () => {
      const history: HistoricalPoint[] = [
        { date: mkTs('2026-03-22'), value: 1.4, equityReturn: 0 },
      ];

      const result = prepareHistoryForProfitCalculation({
        history,
        targetDate: todayDate,
        todayDate,
        currentPrice: 0, // no valuation
        previousPrice: 1.42, // confirmed NAV
        netWorthDate: todayDate, // netWorthDate is today
      });

      // Today should have confirmed NAV price
      const pointToday = result.find(p => {
        const d = new Date(p.date);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` === todayDate;
      });
      expect(pointToday?.value).toBe(1.42);
    });

    it('should use history when targetDate is not today', () => {
      const targetDate = '2026-03-20';
      const history: HistoricalPoint[] = [
        { date: mkTsMorning('2026-03-20'), value: 1.4, equityReturn: 0 },
        { date: mkTs('2026-03-19'), value: 1.3, equityReturn: 0 },
      ];

      const result = prepareHistoryForProfitCalculation({
        history,
        targetDate,
        todayDate,
        currentPrice: 1.45, // valuation for different date
        realtimeDate: todayDate, // valuation date is today, not targetDate
      });

      // 2026-03-20 should have history price (deduplicated, higher timestamp wins)
      const point20 = result.find(p => {
        const d = new Date(p.date);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` === '2026-03-20';
      });
      // When targetDate is not today, resolvePreferredPrice returns history data first
      expect(point20?.value).toBe(1.4);
    });
  });

  describe('edge cases', () => {
    it('should handle history with future dates', () => {
      const history: HistoricalPoint[] = [
        { date: mkTs('2026-03-25'), value: 1.5, equityReturn: 0 },
        { date: mkTs('2026-03-20'), value: 1.4, equityReturn: 0 },
      ];

      const result = prepareHistoryForProfitCalculation({
        history,
        targetDate: todayDate,
        todayDate,
      });

      // Should be sorted by date
      expect(result[0].value).toBe(1.4);
      expect(result[1].value).toBe(1.5);
    });

    it('should handle multiple points on same date with different times', () => {
      const history: HistoricalPoint[] = [
        { date: mkTsMorning('2026-03-20'), value: 1.3, equityReturn: 0 }, // 00:00
        { date: mkTs('2026-03-20'), value: 1.5, equityReturn: 0 }, // 15:00 (higher)
        { date: new Date('2026-03-20 10:00').getTime(), value: 1.4, equityReturn: 0 }, // 10:00
      ];

      const result = prepareHistoryForProfitCalculation({
        history,
        targetDate: todayDate,
        todayDate,
      });

      // Only one entry per date, with highest timestamp value
      const date20Entries = result.filter(p => {
        const d = new Date(p.date);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` === '2026-03-20';
      });
      expect(date20Entries.length).toBe(1);
      expect(date20Entries[0].value).toBe(1.5); // 15:00 is highest timestamp
    });

    it('should not add target date if already exists', () => {
      const history: HistoricalPoint[] = [
        { date: mkTs('2026-03-23'), value: 1.5, equityReturn: 0 },
      ];

      const result = prepareHistoryForProfitCalculation({
        history,
        targetDate: '2026-03-23',
        todayDate: '2026-03-23',
      });

      // Should have exactly 1 entry
      expect(result.length).toBe(1);
      expect(result[0].value).toBe(1.5);
    });
  });

  describe('consistency with ProfitModal behavior', () => {
    it('should produce same result as ProfitModal for valuation override on today', () => {
      const history: HistoricalPoint[] = [
        { date: mkTsMorning('2026-03-23'), value: 1.6934, equityReturn: 0 }, // history value
        { date: mkTs('2026-03-22'), value: 1.7097, equityReturn: 0 },
      ];

      const result = prepareHistoryForProfitCalculation({
        history,
        targetDate: todayDate,
        todayDate,
        currentPrice: 1.6977, // valuation price for today
        realtimeDate: todayDate, // valuation date is today
        previousPrice: 1.7097,
        netWorthDate: '2026-03-22',
      });

      // Today should have valuation price (1.6977), not history price (1.6934)
      const pointToday = result.find(p => {
        const d = new Date(p.date);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` === todayDate;
      });
      expect(pointToday?.value).toBe(1.6977);
    });
  });

  describe('T+2 fund date calibration', () => {
    it('should calibrate T+2 fund dates using T+1 netWorthDate as reference', () => {
      const history: HistoricalPoint[] = [
        { date: mkTs('2026-08-04'), value: 2.2958, equityReturn: 0 },
        { date: mkTs('2026-08-05'), value: 2.2701, equityReturn: 0 },
        { date: mkTs('2026-08-06'), value: 2.2611, equityReturn: 0 },
      ];

      // T+1 基金的净值日期是 8/7，可以作为参考
      const allFundNavDates = [
        { symbol: '000001', navType: 'T+1' as const, netWorthDate: '2026-08-07', realtimeDate: '2026-08-07' },
      ];

      const result = prepareHistoryForProfitCalculation({
        history,
        targetDate: '2026-08-07',
        todayDate: '2026-08-07',
        navType: 'T+2',
        allFundNavDates,
      });

      // 验证：每个历史点使用下一个点的日期
      // 8/4 -> 8/5, 8/5 -> 8/6, 8/6 -> 8/7（校准到T+1的净值日期）
      expect(result.length).toBe(3);
      expect(new Date(result[0].date).getDate()).toBe(5); // 8/4 -> 8/5
      expect(new Date(result[1].date).getDate()).toBe(6); // 8/5 -> 8/6
      expect(new Date(result[2].date).getDate()).toBe(7); // 8/6 -> 8/7
      expect(result[0].value).toBe(2.2958);
      expect(result[1].value).toBe(2.2701);
      expect(result[2].value).toBe(2.2611);
    });

    it('should calibrate T+2 fund using T+1 realtimeDate when netWorthDate unavailable', () => {
      const history: HistoricalPoint[] = [
        { date: mkTs('2026-08-04'), value: 2.2958, equityReturn: 0 },
        { date: mkTs('2026-08-05'), value: 2.2701, equityReturn: 0 },
        { date: mkTs('2026-08-06'), value: 2.2611, equityReturn: 0 },
      ];

      // T+1 基金净值日期也是 8/6，但估值日期是 8/7
      const allFundNavDates = [
        { symbol: '000001', navType: 'T+1' as const, netWorthDate: '2026-08-06', realtimeDate: '2026-08-07' },
      ];

      const result = prepareHistoryForProfitCalculation({
        history,
        targetDate: '2026-08-07',
        todayDate: '2026-08-07',
        navType: 'T+2',
        allFundNavDates,
      });

      // 最后一个点应该校准到 8/7（使用T+1的估值日期）
      expect(result.length).toBe(3);
      expect(new Date(result[2].date).getDate()).toBe(7); // 8/6 -> 8/7
      expect(result[2].value).toBe(2.2611);
    });

    it('should use next trading day when no reference date available', () => {
      const history: HistoricalPoint[] = [
        { date: mkTs('2026-08-04'), value: 2.2958, equityReturn: 0 },
        { date: mkTs('2026-08-05'), value: 2.2701, equityReturn: 0 },
        { date: mkTs('2026-08-06'), value: 2.2611, equityReturn: 0 },
      ];

      // 没有 T+1 基金作为参考
      const allFundNavDates = [
        { symbol: '017437', navType: 'T+2' as const, netWorthDate: '2026-08-06', realtimeDate: null },
      ];

      const result = prepareHistoryForProfitCalculation({
        history,
        targetDate: '2026-08-07',
        todayDate: '2026-08-07',
        navType: 'T+2',
        allFundNavDates,
      });

      // 最后一个点应该校准到 8/7（下一个交易日）
      expect(result.length).toBe(3);
      expect(new Date(result[2].date).getDate()).toBe(7); // 8/6 -> 8/7
      expect(result[2].value).toBe(2.2611);
    });

    it('should not calibrate T+1 funds', () => {
      const history: HistoricalPoint[] = [
        { date: mkTs('2026-08-04'), value: 1.5, equityReturn: 0 },
        { date: mkTs('2026-08-05'), value: 1.6, equityReturn: 0 },
        { date: mkTs('2026-08-06'), value: 1.7, equityReturn: 0 },
      ];

      const result = prepareHistoryForProfitCalculation({
        history,
        targetDate: '2026-08-07',
        todayDate: '2026-08-07',
        navType: 'T+1',
        allFundNavDates: [],
      });

      // T+1 基金不校准，日期保持不变
      expect(result.length).toBe(3);
      expect(new Date(result[0].date).getDate()).toBe(4);
      expect(new Date(result[1].date).getDate()).toBe(5);
      expect(new Date(result[2].date).getDate()).toBe(6);
    });

    it('should skip valuation for T+2 funds to preserve calibrated data', () => {
      const history: HistoricalPoint[] = [
        { date: mkTs('2026-08-05'), value: 2.2701, equityReturn: 0 },
        { date: mkTs('2026-08-06'), value: 2.2611, equityReturn: 0 },
      ];

      const allFundNavDates = [
        { symbol: '000001', navType: 'T+1' as const, netWorthDate: '2026-08-07', realtimeDate: '2026-08-07' },
      ];

      const result = prepareHistoryForProfitCalculation({
        history,
        targetDate: '2026-08-07',
        todayDate: '2026-08-07',
        currentPrice: 2.2597, // 估值价格
        realtimeDate: '2026-08-07',
        navType: 'T+2',
        allFundNavDates,
      });

      // T+2 基金不使用估值覆盖，保持校准后的数据
      expect(result.length).toBe(2);
      expect(new Date(result[1].date).getDate()).toBe(7); // 校准到 8/7
      expect(result[1].value).toBe(2.2611); // 使用历史净值，不使用估值
    });
  });
});