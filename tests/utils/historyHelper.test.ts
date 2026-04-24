import { getPreviousDayChange } from '../../utils/historyHelper';
import { HistoricalPoint } from '../../types';

describe('getPreviousDayChange', () => {
  // 使用本地时区创建 timestamp
  const createTimestamp = (year: number, month: number, day: number): number => {
    return new Date(year, month - 1, day).getTime();
  };

  describe('估值日期不在 history 中（当日估值未确认）', () => {
    test('返回 history 最后一条的涨跌幅', () => {
      const history: HistoricalPoint[] = [
        { date: createTimestamp(2026, 3, 15), value: 1.0, equityReturn: 0.5 },
        { date: createTimestamp(2026, 3, 16), value: 1.1, equityReturn: 0.8 },
        { date: createTimestamp(2026, 3, 17), value: 1.2, equityReturn: 1.5 },
      ];
      const realtimeDate = '2026-03-18'; // 估值日期不在 history 中

      const result = getPreviousDayChange(history, realtimeDate);
      expect(result).toBe(1.5);
    });

    test('无估值日期时返回 history 最后一条', () => {
      const history: HistoricalPoint[] = [
        { date: createTimestamp(2026, 3, 15), value: 1.0, equityReturn: 0.5 },
        { date: createTimestamp(2026, 3, 17), value: 1.2, equityReturn: -2.5 },
      ];

      const result = getPreviousDayChange(history, undefined);
      expect(result).toBe(-2.5);
    });
  });

  describe('估值日期在 history 中存在', () => {
    test('返回估值日期前一条的涨跌幅', () => {
      const history: HistoricalPoint[] = [
        { date: createTimestamp(2026, 3, 15), value: 1.0, equityReturn: 0.5 },
        { date: createTimestamp(2026, 3, 16), value: 1.1, equityReturn: 1.2 }, // 前一交易日
        { date: createTimestamp(2026, 3, 17), value: 1.2, equityReturn: 4.17 }, // 估值日期
      ];
      const realtimeDate = '2026-03-17';

      const result = getPreviousDayChange(history, realtimeDate);
      expect(result).toBe(1.2);
    });

    test('估值日期是 history 最早一条时返回最后一条', () => {
      const history: HistoricalPoint[] = [
        { date: createTimestamp(2026, 3, 15), value: 1.0, equityReturn: 0.5 }, // 估值日期（最早）
        { date: createTimestamp(2026, 3, 16), value: 1.1, equityReturn: 1.2 },
        { date: createTimestamp(2026, 3, 17), value: 1.2, equityReturn: 4.17 },
      ];
      const realtimeDate = '2026-03-15';

      const result = getPreviousDayChange(history, realtimeDate);
      expect(result).toBe(4.17); // 估值日期是第一条，没有前一条，返回最后一条
    });
  });

  describe('边界情况', () => {
    test('history 为空数组时返回 undefined', () => {
      const result = getPreviousDayChange([], '2026-03-17');
      expect(result).toBeUndefined();
    });

    test('history 为 undefined 时返回 undefined', () => {
      const result = getPreviousDayChange(undefined, '2026-03-17');
      expect(result).toBeUndefined();
    });

    test('history 只有一条数据时返回该条数据的涨跌幅', () => {
      const history: HistoricalPoint[] = [
        { date: createTimestamp(2026, 3, 17), value: 1.2, equityReturn: 2.5 },
      ];
      const realtimeDate = '2026-03-18';

      const result = getPreviousDayChange(history, realtimeDate);
      expect(result).toBe(2.5);
    });

    test('涨跌幅为 0 时正确返回', () => {
      const history: HistoricalPoint[] = [
        { date: createTimestamp(2026, 3, 16), value: 1.1, equityReturn: 0 },
        { date: createTimestamp(2026, 3, 17), value: 1.2, equityReturn: 2.5 },
      ];
      const realtimeDate = '2026-03-18';

      const result = getPreviousDayChange(history, realtimeDate);
      expect(result).toBe(2.5);
    });
  });
});