// services/calendarService.ts
import { CalendarEvent } from '../types';
import { toLocalDateKey } from '../utils/priceResolver';
import { loadCalendarData, saveCalendarData as saveCalendarDataToStorage } from './appDataService';
import { CalendarData } from '../types/appDataTypes';

// Re-export CalendarData for consumers
export type { CalendarData };

// ============================================================
// 公共类型定义和辅助函数 - 集中管理所有Calendar事件类型
// ============================================================

export const HOLIDAY_TYPES = ['holiday_china', 'holiday_hk', 'holiday_us', 'holiday_sg'] as const;
export type HolidayType = typeof HOLIDAY_TYPES[number];

export const DELIVERY_TYPES = ['delivery_china', 'delivery_hk', 'delivery_us'] as const;
export type DeliveryType = typeof DELIVERY_TYPES[number];

export const SUPPORTED_CALENDAR_TYPES = [...HOLIDAY_TYPES, ...DELIVERY_TYPES] as const;
export type CalendarEventType = typeof SUPPORTED_CALENDAR_TYPES[number];

export function isHolidayType(type: string): type is HolidayType {
  return HOLIDAY_TYPES.includes(type as HolidayType);
}

export function isDeliveryType(type: string): type is DeliveryType {
  return DELIVERY_TYPES.includes(type as DeliveryType);
}

// ============================================================
// 数据访问接口
// ============================================================

export { loadCalendarData };

export function saveCalendarData(data: CalendarData): void {
  saveCalendarDataToStorage(data);
}

export function getEventsForDate(date: string): Array<{ date: string; content: string; description: string; type: string; market?: string }> {
  const data = loadCalendarData();
  const events = data[date] || [];
  return events.map(event => ({
    date,
    content: event.content,
    description: event.description || '',
    type: event.type,
    market: event.market
  }));
}

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

export function updateCalendarData(
  type: HolidayType | DeliveryType,
  newEvents: Array<{ date: string; content: string; description: string; market?: string }>
): void {
  const data = loadCalendarData();

  const supportedTypes = [...SUPPORTED_CALENDAR_TYPES] as string[];
  const typesToDelete = [type];
  for (const date of Object.keys(data)) {
    data[date] = data[date].filter(event =>
      !typesToDelete.includes(event.type) && supportedTypes.includes(event.type)
    );
  }

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

  for (const date of Object.keys(data)) {
    if (data[date].length === 0) {
      delete data[date];
    }
  }

  saveCalendarData(data);
}

export function clearCalendarData(): void {
  saveCalendarData({});
}

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

export function getUpcomingEvents(days: number = 3): Array<{ date: string; content: string; description: string; type: string; market?: string }> {
  const alerts: Array<{ date: string; content: string; description: string; type: string; market?: string }> = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const data = loadCalendarData();

  let found = 0;
  for (let i = 0; i <= 10 && found < days; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + i);
    const dayOfWeek = checkDate.getDay();

    if (i > 0 && (dayOfWeek === 0 || dayOfWeek === 6)) continue;

    const dateStr = toLocalDateKey(checkDate);
    const events = data[dateStr] || [];

    for (const event of events) {
      alerts.push({
        date: dateStr,
        content: event.content,
        description: event.description || '',
        type: event.type,
        market: event.market
      });
    }
    found++;
  }

  return alerts;
}

export function getFirstEventInWorkdays(workdays: number = 4): Array<{ date: string; content: string; description: string; type: string; market?: string }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const data = loadCalendarData();

  let foundDays = 0;
  for (let i = 0; i <= 14 && foundDays < workdays; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + i);
    const dayOfWeek = checkDate.getDay();

    if (i > 0 && (dayOfWeek === 0 || dayOfWeek === 6)) continue;

    const dateStr = toLocalDateKey(checkDate);
    const events = data[dateStr] || [];

    if (events.length > 0) {
      return events.map(event => ({
        date: dateStr,
        content: event.content,
        description: event.description || '',
        type: event.type,
        market: event.market
      }));
    }
    foundDays++;
  }

  return [];
}