// services/calendarService.ts
import { CalendarEvent } from '../types';

const CALENDAR_STORAGE_KEY = 'fund_tracker_calendar';

// ============================================================
// 公共类型定义和辅助函数 - 集中管理所有Calendar事件类型
// ============================================================

/**
 * 所有支持的节假日类型
 */
export const HOLIDAY_TYPES = ['holiday_china', 'holiday_hk', 'holiday_us', 'holiday_sg'] as const;
export type HolidayType = typeof HOLIDAY_TYPES[number];

/**
 * 所有支持的Calendar事件类型（包括节假日和交割日）
 */
export const SUPPORTED_CALENDAR_TYPES = [...HOLIDAY_TYPES, 'delivery'] as const;
export type CalendarEventType = typeof SUPPORTED_CALENDAR_TYPES[number];

/**
 * 判断事件类型是否为节假日类型
 */
export function isHolidayType(type: string): type is HolidayType {
  return HOLIDAY_TYPES.includes(type as HolidayType);
}

/**
 * 判断事件类型是否为交割日类型
 */
export function isDeliveryType(type: string): type is 'delivery' {
  return type === 'delivery';
}

/**
 * Calendar 数据的类型定义
 */
export interface CalendarData {
  [date: string]: CalendarEvent[];
}

/**
 * 从 localStorage 加载 calendar 数据
 */
export function loadCalendarData(): CalendarData {
  try {
    const data = localStorage.getItem(CALENDAR_STORAGE_KEY);
    if (!data) return {};
    return JSON.parse(data) as CalendarData;
  } catch (e) {
    console.error('[Calendar] Failed to load calendar data:', e);
    return {};
  }
}

/**
 * 保存 calendar 数据到 localStorage
 */
export function saveCalendarData(data: CalendarData): void {
  try {
    localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('[Calendar] Failed to save calendar data:', e);
  }
}

/**
 * 获取指定日期的事件列表
 */
export function getEventsForDate(date: string): CalendarEvent[] {
  const data = loadCalendarData();
  return data[date] || [];
}

/**
 * 获取指定月份的事件（用于月历显示）
 */
export function getEventsForMonth(year: number, month: number): CalendarData {
  const data = loadCalendarData();
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
  const result: CalendarData = {};

  for (const [date, events] of Object.entries(data)) {
    if (date.startsWith(monthStr)) {
      result[date] = events;
    }
  }

  return result;
}

/**
 * 更新 calendar 数据（用于后台任务）
 * @param type 事件类型 'holiday_china' | 'holiday_hk' | 'holiday_us' | 'holiday_sg' | 'delivery'
 * @param newEvents AI 返回的新事件列表
 */
export function updateCalendarData(
  type: 'holiday_china' | 'holiday_hk' | 'holiday_us' | 'holiday_sg' | 'delivery',
  newEvents: Array<{ date: string; content: string; description: string; market?: string }>
): void {
  const data = loadCalendarData();

  // 第一步：删除所有现有 type 为指定类型的事件
  // 以及删除所有目前不支持的类型的事件（如旧的 'holiday' 类型）
  const supportedTypes = [...SUPPORTED_CALENDAR_TYPES] as string[];
  const typesToDelete = [type];
  for (const date of Object.keys(data)) {
    // 保留：不在typesToDelete中 且 是supportedTypes中的类型
    data[date] = data[date].filter(event =>
      !typesToDelete.includes(event.type) && supportedTypes.includes(event.type)
    );
  }

  // 第二步：添加新事件
  for (const event of newEvents) {
    const calendarEvent: CalendarEvent = {
      type,
      content: event.content,
      description: event.description,
      market: event.market,
    };

    if (!data[event.date]) {
      data[event.date] = [];
    }
    data[event.date].push(calendarEvent);
  }

  // 第三步：删除没有任何事件的日期
  for (const date of Object.keys(data)) {
    if (data[date].length === 0) {
      delete data[date];
    }
  }

  saveCalendarData(data);
}

/**
 * 清除所有 calendar 数据
 */
export function clearCalendarData(): void {
  localStorage.removeItem(CALENDAR_STORAGE_KEY);
}

/**
 * 获取本年的所有事件（用于Calendar显示）
 */
export function getEventsForYear(year: number): CalendarData {
  const data = loadCalendarData();
  const yearStr = String(year);
  const result: CalendarData = {};

  for (const [date, events] of Object.entries(data)) {
    if (date.startsWith(yearStr)) {
      result[date] = events;
    }
  }

  return result;
}

/**
 * 获取未来n个工作日内的事件（跳过周末）
 * @param days 查询天数
 * @returns 事件列表，每条包含日期、内容和类型
 */
export function getUpcomingEvents(days: number = 3): Array<{ date: string; content: string; type: string }> {
  const alerts: Array<{ date: string; content: string; type: string }> = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let found = 0;
  for (let i = 0; i <= 10 && found < days; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + i);
    const dayOfWeek = checkDate.getDay();

    // 跳过周末（但包含今天，即使是周末也显示）
    if (i > 0 && (dayOfWeek === 0 || dayOfWeek === 6)) continue;

    const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
    const data = loadCalendarData();
    const events = data[dateStr] || [];

    for (const event of events) {
      alerts.push({
        date: dateStr,
        content: event.content,
        type: event.type
      });
    }
    found++;
  }

  return alerts;
}