// services/nonfarmPayrollsService.ts
/**
 * 非农数据公布日服务
 * 从 Trading Calendar 网站获取非农数据公布日期
 */

import { fetchWithProxy } from './proxyService';
import { updateCalendarData } from './calendarService';
import { JobResult } from '../types';
import { getNthWeekdayOfMonth } from './deliveryDateService';
import { formatDateISO } from '../utils/dateFormat';

export interface NonfarmPayrollsEvent {
  date: string;           // YYYY-MM-DD
  content: string;        // "非农数据公布"
  description: string;    // 包含公布时间和报告期
  market: string;         // "美股"
}

const TRADING_CALENDAR_URL = 'https://www.tradingcalendar.com/zh/nfp';
const LOG_PREFIX = 'NonfarmPayrolls';

// 月份名称映射
const MONTH_MAP: Record<string, number> = {
  'January': 0, 'February': 1, 'March': 2, 'April': 3,
  'May': 4, 'June': 5, 'July': 6, 'August': 7,
  'September': 8, 'October': 9, 'November': 10, 'December': 11,
  'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3,
  'Jun': 5, 'Jul': 6, 'Aug': 7,
  'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
};

// 中文月份名称
const MONTH_NAMES_CN = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

/**
 * 判断是否为美国夏令时
 * 夏令时：3月第二个周日 2:00 AM ~ 11月第一个周日 2:00 AM
 */
export function isDaylightSavingTime(date: Date): boolean {
  const year = date.getFullYear();

  // 使用 getNthWeekdayOfMonth 计算夏令时边界日期，然后设置时间为 2:00 AM
  // 参数：year, month (0-indexed), weekday (0=周日), n (第几个)
  const secondSundayInMarch = getNthWeekdayOfMonth(year, 2, 0, 2);
  secondSundayInMarch.setHours(2, 0, 0, 0);  // 设置为 2:00 AM

  const firstSundayInNovember = getNthWeekdayOfMonth(year, 10, 0, 1);
  firstSundayInNovember.setHours(2, 0, 0, 0);  // 设置为 2:00 AM

  // 判断日期是否在夏令时期间
  return date >= secondSundayInMarch && date < firstSundayInNovember;
}

/**
 * 计算非农公布时间（北京时间）
 * 夏令时：20:30，冬令时：21:30
 */
export function calculateReleaseTime(date: Date): string {
  return isDaylightSavingTime(date) ? '20:30' : '21:30';
}

/**
 * 解析 Trading Calendar 页面数据
 */
export function parseTradingCalendarData(html: string, year: number): NonfarmPayrollsEvent[] {
  const events: NonfarmPayrollsEvent[] = [];

  // 定位 NFP Calendar 部分
  const calendarRegex = new RegExp(`Non-Farm Payrolls \\(NFP\\) Calendar ${year}`, 'i');
  const calendarMatch = html.match(calendarRegex);

  if (!calendarMatch) {
    console.warn(`[${LOG_PREFIX}] 未找到 ${year} 年 NFP Calendar 部分`);
    return events;
  }

  // 从匹配位置开始提取后续内容
  const startIndex = html.indexOf(calendarMatch[0]);

  // 找到下一个年份的日历作为结束边界
  const nextYearRegex = new RegExp(`Non-Farm Payrolls \\(NFP\\) Calendar (?!${year})\\d{4}`, 'i');
  const nextYearMatch = html.substring(startIndex).match(nextYearRegex);

  // 确定提取范围：到下一个年份日历开始，或最多 3000 字符
  let endIndex = startIndex + 3000;
  if (nextYearMatch && nextYearMatch.index !== undefined) {
    endIndex = startIndex + nextYearMatch.index;
  }

  const relevantContent = html.substring(startIndex, endIndex);

  // 解析日期行
  // 格式：January 9, February 6 (Rescheduled to Feb 11), March 6
  const datePattern = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:\s*\(\s*Rescheduled to\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s*\))?/gi;

  let match;
  while ((match = datePattern.exec(relevantContent)) !== null) {
    let monthName = match[1];
    let day = parseInt(match[2]);

    // 如果有调整日期，使用调整后的日期
    if (match[3] && match[4]) {
      monthName = match[3];
      day = parseInt(match[4]);
    }

    const month = MONTH_MAP[monthName];
    if (month === undefined) continue;

    // 生成日期
    const eventDate = new Date(year, month, day);
    const dateStr = formatDateISO(eventDate);

    // 计算公布时间
    const releaseTime = calculateReleaseTime(eventDate);

    // 计算报告期月份（公布月份的前一个月）
    const reportMonth = month === 0 ? 11 : month - 1;
    const reportYear = month === 0 ? year - 1 : year;

    events.push({
      date: dateStr,
      content: '非农数据公布',
      description: `美国非农就业人数公布，北京时间 ${releaseTime}，报告期：${reportYear}年${MONTH_NAMES_CN[reportMonth]}`,
      market: '美股'
    });
  }

  return events;
}

/**
 * 获取非农数据公布日信息
 */
export async function fetchNonfarmPayrolls(): Promise<NonfarmPayrollsEvent[]> {
  console.log(`[${LOG_PREFIX}] 开始获取非农数据公布日信息`);

  try {
    const { content } = await fetchWithProxy(TRADING_CALENDAR_URL);

    const currentYear = new Date().getFullYear();
    const events = parseTradingCalendarData(content, currentYear);

    if (events.length === 0) {
      throw new Error('未解析到任何非农数据公布日');
    }

    console.log(`[${LOG_PREFIX}] 成功获取 ${events.length} 条非农数据公布日信息`);
    return events;
  } catch (e) {
    console.error(`[${LOG_PREFIX}] 获取失败:`, e);
    throw e;
  }
}

/**
 * 刷新非农数据公布日信息（后台任务入口）
 */
export async function refreshNonfarmPayrolls(): Promise<JobResult> {
  try {
    const events = await fetchNonfarmPayrolls();

    // 转换为 updateCalendarData 需要的格式
    const calendarEvents = events.map(e => ({
      date: e.date,
      content: e.content,
      description: e.description,
      market: e.market
    }));

    // 更新 calendar 数据
    updateCalendarData('nonfarm_payrolls_release', calendarEvents);

    return { success: true, message: `成功更新 ${events.length} 条非农数据公布日信息` };
  } catch (e) {
    const errorMsg = `非农数据刷新失败: ${(e as Error).message}`;
    console.error(`[${LOG_PREFIX}] ${errorMsg}`);
    return { success: false, message: errorMsg };
  }
}

