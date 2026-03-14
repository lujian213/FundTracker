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
    // 获取第一天的原始累计盈亏作为基准
    const baselineCumulative = timeline[0].cumulativeProfit || 0;

    // 先创建所有相对累计盈亏的数组
    const relativeCumulatives = timeline.map(item => (item.cumulativeProfit || 0) - baselineCumulative);

    // 然后计算相对盈亏
    const adjustedTimeline: ProfitPoint[] = [];
    for (let i = 0; i < timeline.length; i++) {
      const original = timeline[i];

      if (i === 0) {
        // 第一天：当日盈亏为0，累计盈亏也为0（以自己为基准）
        adjustedTimeline.push({
          ...original,
          dailyProfit: 0,
          cumulativeProfit: 0
        });
      } else {
        // 后续天数：计算相对当日盈亏
        const currentRelativeCumulative = relativeCumulatives[i];
        const prevRelativeCumulative = relativeCumulatives[i - 1];
        const currentDailyProfit = currentRelativeCumulative - prevRelativeCumulative;

        adjustedTimeline.push({
          ...original,
          dailyProfit: Number(currentDailyProfit.toFixed(4)),
          cumulativeProfit: Number(currentRelativeCumulative.toFixed(4))
        });
      }
    }

    return adjustedTimeline;
  }

  return timeline;
}