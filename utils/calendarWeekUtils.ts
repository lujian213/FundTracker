import { formatDateShort } from './dateFormat';
import { toLocalDateKey } from './priceResolver';

export interface WeekData {
  startDate: string;           // YYYY-MM-DD
  endDate: string;             // YYYY-MM-DD
  startDateDisplay: string;    // MM-DD
  endDateDisplay: string;      // MM-DD
}

/**
 * 计算指定月份的所有周数据
 * @param year 年份
 * @param month 月份（1-12）
 * @returns 周数据数组
 */
export function getWeeksOfMonth(year: number, month: number): WeekData[] {
  const weeks: WeekData[] = [];

  const firstDayOfMonth = new Date(year, month - 1, 1);
  const lastDayOfMonth = new Date(year, month, 0);

  // 从本月第一天所在的周开始
  let currentWeekStart = getMondayOfWeek(firstDayOfMonth);

  while (true) {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // 只包含"至少有一天在本月"的周
    // 如果周的结束日期（周日）< 本月第一天，说明整个周在上个月，跳过
    if (weekEnd >= firstDayOfMonth) {
      const weekData: WeekData = {
        startDate: toLocalDateKey(currentWeekStart),
        endDate: toLocalDateKey(weekEnd),
        startDateDisplay: formatDateShort(currentWeekStart),
        endDateDisplay: formatDateShort(weekEnd),
      };

      weeks.push(weekData);
    }

    const nextWeekStart = new Date(currentWeekStart);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);

    // 如果下一周的周一 > 本月最后一天，说明整个周在下个月，停止
    if (nextWeekStart > lastDayOfMonth) break;
    currentWeekStart = nextWeekStart;
  }

  return weeks;
}

/**
 * 获取某日期所在周的周一
 */
function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const dayOfWeek = d.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + diff);
  return d;
}

/**
 * 计算一周的盈利总和（考虑期间范围）
 * @param weekStart 周开始日期（YYYY-MM-DD）
 * @param weekEnd 周结束日期（YYYY-MM-DD）
 * @param profitMap 日期→盈利映射
 * @param chartFromDate 期间起始日期
 * @param chartEndDate 期间结束日期
 * @returns 盈利总和和是否在范围内的标志
 */
export function calculateWeekProfit(
  weekStart: string,
  weekEnd: string,
  profitMap: Record<string, number>,
  chartFromDate: string | null,
  chartEndDate: string | null
): { profit: number; isInRange: boolean } {

  let profit = 0;
  let hasInRangeDay = false;

  const startDate = new Date(weekStart);
  for (let i = 0; i < 7; i++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + i);
    const dateKey = toLocalDateKey(currentDate);

    const inRange = chartFromDate && chartEndDate
      ? dateKey >= chartFromDate && dateKey <= chartEndDate
      : false;

    if (inRange) {
      hasInRangeDay = true;
      profit += profitMap[dateKey] || 0;
    }
  }

  return {
    profit,
    isInRange: hasInRangeDay
  };
}