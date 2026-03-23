import { ProfitPoint } from '../types';

/**
 * 修正盈亏时间线，将指定开始日期的当日盈亏设为0
 * 适用于用户选择任意日期作为开始日期的场景
 *
 * @param timeline - 原始盈亏时间线数据
 * @param fromDate - 用户选择的开始日期 (YYYY-MM-DD)
 * @returns 修正后的时间线数据
 */
export function adjustProfitTimelineForDisplay(timeline: ProfitPoint[], fromDate: string | null): ProfitPoint[] {
  if (!timeline || timeline.length === 0 || !fromDate) {
    return timeline || [];
  }

  // 确保第一条记录是所选的开始日期
  if (timeline[0].date === fromDate) {
    // 只将第一天的当日盈亏设为0，累计盈亏保持原值
    return timeline.map((item, index) => {
      if (index === 0) {
        return {
          ...item,
          dailyProfit: 0
        };
      }
      return item;
    });
  }

  return timeline;
}