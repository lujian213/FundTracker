/**
 * prepareValuationHistory 单元测试
 *
 * 测试目的：验证持仓趋势估值历史数据的准备工作
 * - T+2基金不包含估值日期
 * - 数据正确校准到T+1基金的净值日期
 */

import { prepareValuationHistory } from '../../hooks/usePositionTrend';
import { HistoricalPoint, FundNavDateInfo } from '../../types';

describe('prepareValuationHistory', () => {
  // Helper to create timestamp for a date at 15:00
  const mkTs = (date: string) => new Date(`${date} 15:00`).getTime();

  describe('T+2基金估值历史', () => {
    it('不应包含估值日期，只返回校准后的历史数据', () => {
      // 场景：T+2基金的历史净值到8/6，估值数据到8/9（今天）
      const history: HistoricalPoint[] = [
        { date: mkTs('2026-08-05'), value: 2.2701, equityReturn: 0 },
        { date: mkTs('2026-08-06'), value: 2.2611, equityReturn: 0 },
      ];

      const valuation = {
        currentPrice: 2.2597,      // 8/9的估值价格
        realtimeDate: '2026-08-09', // 估值日期是今天
        previousPrice: 2.2611,
        netWorthDate: '2026-08-06',
      };

      const position = {
        navType: 'T+2' as const,
      };

      const allFundNavDates: FundNavDateInfo[] = [
        { symbol: '000001', navType: 'T+1', netWorthDate: '2026-08-07', realtimeDate: '2026-08-07' },
      ];

      const result = prepareValuationHistory(
        history,
        valuation,
        position,
        '2026-08-09', // targetDate是今天
        allFundNavDates
      );

      // 验证：不包含估值日期（8/9）
      const dates = result.map(p => p.date);
      expect(dates).not.toContain('2026-08-09');

      // 验证：只包含校准后的历史数据（到8/7）
      expect(result.length).toBe(2);
      expect(dates).toContain('2026-08-06');
      expect(dates).toContain('2026-08-07');

      // 验证：使用历史净值，不使用估值价格
      expect(result[0].price).toBe(2.2701);
      expect(result[1].price).toBe(2.2611);
    });

    it('当没有T+1基金参考时，使用下一个交易日', () => {
      const history: HistoricalPoint[] = [
        { date: mkTs('2026-08-05'), value: 2.2701, equityReturn: 0 },
        { date: mkTs('2026-08-06'), value: 2.2611, equityReturn: 0 },
      ];

      const valuation = {
        currentPrice: 2.2597,
        realtimeDate: '2026-08-09',
        previousPrice: 2.2611,
        netWorthDate: '2026-08-06',
      };

      const position = {
        navType: 'T+2' as const,
      };

      // 没有T+1基金作为参考
      const allFundNavDates: FundNavDateInfo[] = [];

      const result = prepareValuationHistory(
        history,
        valuation,
        position,
        '2026-08-09',
        allFundNavDates
      );

      // 验证：不包含估值日期
      const dates = result.map(p => p.date);
      expect(dates).not.toContain('2026-08-09');
    });
  });

  describe('T+1基金估值历史', () => {
    it('可以包含估值日期', () => {
      const history: HistoricalPoint[] = [
        { date: mkTs('2026-08-06'), value: 1.5, equityReturn: 0 },
      ];

      const valuation = {
        currentPrice: 1.6,
        realtimeDate: '2026-08-09',
        previousPrice: 1.5,
        netWorthDate: '2026-08-08',
      };

      const position = {
        navType: 'T+1' as const,
      };

      const allFundNavDates: FundNavDateInfo[] = [];

      const result = prepareValuationHistory(
        history,
        valuation,
        position,
        '2026-08-09',
        allFundNavDates
      );

      // T+1基金的行为由prepareHistoryForProfitCalculation决定
      // 这里只验证函数能正常处理T+1基金
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('边界情况', () => {
    it('空历史数据应返回空数组', () => {
      const result = prepareValuationHistory(
        [],
        null,
        null,
        '2026-08-09',
        []
      );

      expect(result).toEqual([]);
    });

    it('缺少估值数据时应使用历史数据', () => {
      const history: HistoricalPoint[] = [
        { date: mkTs('2026-08-05'), value: 2.2701, equityReturn: 0 },
      ];

      const result = prepareValuationHistory(
        history,
        null,
        { navType: 'T+1' },
        '2026-08-09',
        []
      );

      expect(result.length).toBe(1);
      expect(result[0].date).toBe('2026-08-05');
      expect(result[0].price).toBe(2.2701);
    });
  });
});