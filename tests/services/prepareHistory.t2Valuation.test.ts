/**
 * prepareHistoryForProfitCalculation T+2估值包含测试
 *
 * 测试目的：验证T+2基金估值在正确时机被包含
 */

import { prepareHistoryForProfitCalculation } from '../../services/fundService';
import { HistoricalPoint, FundNavDateInfo } from '../../types';

const mkTs = (date: string) => new Date(`${date} 15:00`).getTime();

describe('T+2基金估值包含逻辑', () => {
  /**
   * 场景：站在8/9（周日）看
   * - T+2基金有8/8（周六）的估值
   * - T+1基金只有8/7（周五）的净值
   * - 结果：T+2的8/8估值不应该出现（没有对应的T+1估值）
   */
  it('当没有对应的T+1估值时，T+2基金的估值应被跳过', () => {
    const history: HistoricalPoint[] = [
      { date: mkTs('2026-08-06'), value: 2.2611, equityReturn: 0 },
    ];

    const allFundNavDates: FundNavDateInfo[] = [
      { symbol: '000001', navType: 'T+1', netWorthDate: '2026-08-07', realtimeDate: null },
    ];

    const result = prepareHistoryForProfitCalculation({
      history,
      targetDate: '2026-08-09', // 站在8/9看
      todayDate: '2026-08-09',
      currentPrice: 2.2597, // 8/8的估值
      realtimeDate: '2026-08-08',
      netWorthDate: '2026-08-06',
      navType: 'T+2',
      allFundNavDates,
    });

    // 只包含历史净值，不包含估值
    expect(result.length).toBe(1);
    expect(result[0].value).toBe(2.2611);
  });

  /**
   * 场景：站在8/10（周一）看
   * - T+2基金有8/8（周六）的估值
   * - T+1基金有了8/10（周一）的估值
   * - 结果：T+2的8/8估值应该出现（有对应的T+1估值）
   */
  it('当有对应的T+1估值时，T+2基金的估值应被包含并校准', () => {
    const history: HistoricalPoint[] = [
      { date: mkTs('2026-08-05'), value: 2.2701, equityReturn: 0 },
      { date: mkTs('2026-08-06'), value: 2.2611, equityReturn: 0 }, // 8/6的历史净值
    ];

    const allFundNavDates: FundNavDateInfo[] = [
      { symbol: '000001', navType: 'T+1', netWorthDate: '2026-08-07', realtimeDate: '2026-08-10' },
    ];

    const result = prepareHistoryForProfitCalculation({
      history,
      targetDate: '2026-08-10', // 站在8/10看
      todayDate: '2026-08-10',
      currentPrice: 2.2597, // 8/8的估值
      realtimeDate: '2026-08-08',
      netWorthDate: '2026-08-06',
      navType: 'T+2',
      allFundNavDates,
    });

    // 应包含3个点：2个历史净值 + 1个校准后的估值
    expect(result.length).toBe(3);

    // 第1个点：历史净值校准到8/6
    expect(new Date(result[0].date).getDate()).toBe(6);
    expect(result[0].value).toBe(2.2701);

    // 第2个点：历史净值校准到8/7
    expect(new Date(result[1].date).getDate()).toBe(7);
    expect(result[1].value).toBe(2.2611);

    // 第3个点：估值校准到8/10（对应T+1的估值日期）
    expect(new Date(result[2].date).getDate()).toBe(10);
    expect(result[2].value).toBe(2.2597);
  });

  /**
   * 场景：T+1基金只有净值（8/7），没有估值
   * - T+2基金的估值日期（8/8）没有对应的T+1日期（8/7 < 8/8）
   * - 结果：估值应该被跳过
   */
  it('当T+1日期早于T+2估值日期时，估值应被跳过', () => {
    const history: HistoricalPoint[] = [
      { date: mkTs('2026-08-04'), value: 2.2800, equityReturn: 0 },
      { date: mkTs('2026-08-05'), value: 2.2701, equityReturn: 0 },
    ];

    const allFundNavDates: FundNavDateInfo[] = [
      { symbol: '000001', navType: 'T+1', netWorthDate: '2026-08-07', realtimeDate: null },
    ];

    const result = prepareHistoryForProfitCalculation({
      history,
      targetDate: '2026-08-10',
      todayDate: '2026-08-10',
      currentPrice: 2.2597, // 8/8的估值
      realtimeDate: '2026-08-08',
      netWorthDate: '2026-08-05',
      navType: 'T+2',
      allFundNavDates,
    });

    // 只包含历史净值，不包含估值
    expect(result.length).toBe(2);
  });

  /**
   * 场景：T+2基金估值无法找到晚于的T+1数据，但能找到同日的T+1估值
   * - T+2基金有8/8的估值
   * - T+1基金净值日期是8/7，估值日期是8/8
   * - 无法找到 > 8/8 的T+1日期（现有逻辑失败）
   * - 但能找到 = 8/8 的T+1估值（同日对齐）
   * - 结果：T+2的8/8估值应该校准到8/8（同日）
   */
  it('当找不到晚于的T+1日期但找到同日T+1估值时，估值应对齐到同日', () => {
    const history: HistoricalPoint[] = [
      { date: mkTs('2026-08-05'), value: 2.2701, equityReturn: 0 },
      { date: mkTs('2026-08-06'), value: 2.2611, equityReturn: 0 },
    ];

    const allFundNavDates: FundNavDateInfo[] = [
      // T+1基金：净值日期8/7，估值日期8/8
      { symbol: '000001', navType: 'T+1', netWorthDate: '2026-08-07', realtimeDate: '2026-08-08' },
    ];

    const result = prepareHistoryForProfitCalculation({
      history,
      targetDate: '2026-08-09', // 站在8/9看
      todayDate: '2026-08-09',
      currentPrice: 2.2597, // T+2基金的8/8估值
      realtimeDate: '2026-08-08',
      netWorthDate: '2026-08-06',
      navType: 'T+2',
      allFundNavDates,
    });

    // 应包含3个点：2个历史净值 + 1个校准后的估值
    expect(result.length).toBe(3);

    // 第1个点：历史净值校准到8/6
    expect(new Date(result[0].date).getDate()).toBe(6);
    expect(result[0].value).toBe(2.2701);

    // 第2个点：历史净值校准到8/7
    expect(new Date(result[1].date).getDate()).toBe(7);
    expect(result[1].value).toBe(2.2611);

    // 第3个点：估值校准到8/8（同日对齐，对应T+1的估值日期）
    expect(new Date(result[2].date).getDate()).toBe(8);
    expect(result[2].value).toBe(2.2597);
  });
});