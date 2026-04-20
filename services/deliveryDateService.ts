// services/deliveryDateService.ts
import { loadCalendarData, updateCalendarData, CalendarData } from './calendarService';

export interface DeliveryDateResult {
  date: string;
  content: string;
  description: string;
  market?: string;
}

/**
 * 获取某月的第N个星期几
 * @param year 年份
 * @param month 月份 (0-indexed, 0=1月)
 * @param weekday 星期几 (0=周日, 1=周一, ..., 5=周五, 6=周六)
 * @param n 第几个 (1=第一个, 2=第二个, ...)
 */
export function getNthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const firstDay = new Date(year, month, 1);
  let count = 0;
  for (let d = 1; d <= 31; d++) {
    const date = new Date(year, month, d);
    if (date.getMonth() !== month) break;
    if (date.getDay() === weekday) {
      count++;
      if (count === n) return date;
    }
  }
  return new Date(year, month, 1);
}

/**
 * 格式化日期为 YYYY-MM-DD 字符串
 */
function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * 检查日期是否为A股节假日
 */
export function isChinaHoliday(date: Date, calendarData: CalendarData): boolean {
  const dateStr = formatDate(date);
  const events = calendarData[dateStr] || [];
  return events.some(e => e.type === 'holiday_china');
}

/**
 * 检查日期是否为港股节假日
 */
export function isHKHoliday(date: Date, calendarData: CalendarData): boolean {
  const dateStr = formatDate(date);
  const events = calendarData[dateStr] || [];
  return events.some(e => e.type === 'holiday_hk');
}

/**
 * 找到下一个营业日（跳过周末和A股节假日）
 * 注意：从传入日期的后一天开始查找，返回传入日期之后的最近营业日
 */
export function getNextBusinessDay(date: Date, calendarData: CalendarData): Date {
  let next = new Date(date);
  // 先往后移一天，确保找的是"之后"的营业日
  next.setDate(next.getDate() + 1);
  // 然后继续往后找直到遇到营业日
  while (next.getDay() === 0 || next.getDay() === 6 || isChinaHoliday(next, calendarData)) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

/**
 * 找到上一个营业日（跳过周末和A股节假日）
 * 注意：从传入日期的前一天开始查找，返回传入日期之前的最近营业日
 */
export function getPrevBusinessDay(date: Date, calendarData: CalendarData): Date {
  let prev = new Date(date);
  // 先往前移一天，确保找的是"之前"的营业日
  prev.setDate(prev.getDate() - 1);
  // 然后继续往前找直到遇到营业日
  while (prev.getDay() === 0 || prev.getDay() === 6 || isChinaHoliday(prev, calendarData)) {
    prev.setDate(prev.getDate() - 1);
  }
  return prev;
}

/**
 * 找到港股的上一个营业日（跳过周末和港股节假日）
 * 注意：从传入日期的前一天开始查找，返回传入日期之前的最近营业日
 */
export function getPrevBusinessDayForHK(date: Date, calendarData: CalendarData): Date {
  let prev = new Date(date);
  // 先往前移一天，确保找的是"之前"的营业日
  prev.setDate(prev.getDate() - 1);
  // 然后继续往前找直到遇到营业日
  while (prev.getDay() === 0 || prev.getDay() === 6 || isHKHoliday(prev, calendarData)) {
    prev.setDate(prev.getDate() - 1);
  }
  return prev;
}

/**
 * 获取某月的最后一天
 * @param year 年份
 * @param month 月份 (0-indexed)
 */
export function getLastDayOfMonth(year: number, month: number): Date {
  // month + 1 获取下个月的第0天，即当前月的最后一天
  return new Date(year, month + 1, 0);
}

/**
 * 计算指定年份的交割日信息
 * @param year 年份
 * @param calendarData 日历数据（用于判断节假日）
 * @returns 交割日结果数组
 */
export function calculateDeliveryDatesForYear(
  year: number,
  calendarData: CalendarData
): DeliveryDateResult[] {
  const results: DeliveryDateResult[] = [];

  // 月份遍历（0-11，即1月到12月）
  for (let month = 0; month < 12; month++) {
    // A股 - 中金所股指期货/期权交割日：每月第三个星期五
    const thirdFriday = getNthWeekdayOfMonth(year, month, 5, 3);
    let adjThirdFriday = thirdFriday;
    // 遇法定节假日顺延至下一交易日
    if (isChinaHoliday(thirdFriday, calendarData)) {
      adjThirdFriday = getNextBusinessDay(thirdFriday, calendarData);
    }
    results.push({
      date: formatDate(adjThirdFriday),
      content: 'A股-中金所股指期货/期权交割日',
      description: 'A股：每月第三个星期五，遇法定节假日顺延至下一交易日'
    });

    // A股 - 上交所/深交所ETF期权交割日：每月第四个星期三
    const fourthWednesday = getNthWeekdayOfMonth(year, month, 3, 4);
    let adjFourthWednesday = fourthWednesday;
    if (isChinaHoliday(fourthWednesday, calendarData)) {
      adjFourthWednesday = getNextBusinessDay(fourthWednesday, calendarData);
    }
    results.push({
      date: formatDate(adjFourthWednesday),
      content: 'A股-上交所/深交所ETF期权交割日',
      description: 'A股：每月第四个星期三，遇法定节假日顺延'
    });

    // A股 - 富时中国A50指数期货（SGX）：每月倒数第二个营业日
    const lastDay = getLastDayOfMonth(year, month);
    // 先找到倒数第一个营业日
    const lastBusinessDay = getPrevBusinessDay(lastDay, calendarData);
    // 再往前找倒数第二个营业日
    const secondLastBusinessDay = getPrevBusinessDay(lastBusinessDay, calendarData);
    results.push({
      date: formatDate(secondLastBusinessDay),
      content: 'A股-富时中国A50指数期货（SGX）交割日',
      description: 'A股：每月倒数第二个营业日，新加坡交易所规则'
    });

    // 港股 - 恒指期货及期权月度交割日：合约月份倒数第二个营业日
    // 使用港股节假日数据判断
    const hkLastDay = getLastDayOfMonth(year, month);
    const hkLastBusinessDay = getPrevBusinessDayForHK(hkLastDay, calendarData);
    const hkSecondLastBusinessDay = getPrevBusinessDayForHK(hkLastBusinessDay, calendarData);
    results.push({
      date: formatDate(hkSecondLastBusinessDay),
      content: '港股-恒指/国企股/科指期货及期权交割日',
      description: '港股：合约月份倒数第二个营业日'
    });

    // 美股 - 月度期权到期日：每月第三个星期五
    const usThirdFriday = getNthWeekdayOfMonth(year, month, 5, 3);
    results.push({
      date: formatDate(usThirdFriday),
      content: '美股-月度期权到期日',
      description: '美股：每月第三个星期五'
    });

    // 美股 - 三巫日：3,6,9,12月的第三个星期五
    if (month === 2 || month === 5 || month === 8 || month === 11) {
      results.push({
        date: formatDate(usThirdFriday),
        content: '美股-三巫日',
        description: '美股：股指期货+股指期权+个股期权同时到期'
      });
    }
  }

  return results;
}

/**
 * 计算交割日信息并更新到日历数据
 * 使用当前年份和已加载的日历数据
 */
export function calculateDeliveryDates(): void {
  const year = new Date().getFullYear();
  const calendarData = loadCalendarData();
  const results = calculateDeliveryDatesForYear(year, calendarData);
  updateCalendarData('delivery', results);
}