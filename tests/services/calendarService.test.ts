// tests/services/calendarService.test.ts
import {
  loadCalendarData,
  saveCalendarData,
  getEventsForDate,
  getEventsForMonth,
  getEventsForYear,
  getUpcomingEvents,
  updateCalendarData,
  clearCalendarData,
  getFirstEventInWorkdays,
} from '../../services/calendarService';
import { resetCache } from '../../services/appDataService';
import { CalendarEvent } from '../../types';
import { STORAGE_KEYS } from '../../services/localStorageService';

describe('calendarService', () => {
  beforeEach(() => {
    localStorage.clear();
    resetCache();
  });

  describe('loadCalendarData', () => {
    test('returns empty object when no data exists', () => {
      const result = loadCalendarData();
      expect(result).toEqual({});
    });

    test('parses existing calendar data', () => {
      const testData = {
        '2026-04-04': [
          { type: 'holiday' as const, content: '清明节', description: '清明节放假' },
        ],
      };
      saveCalendarData(testData);

      const result = loadCalendarData();
      expect(result).toEqual(testData);
    });

    test('returns empty object on invalid JSON', () => {
      localStorage.setItem(STORAGE_KEYS.CALENDAR, 'invalid json');

      const result = loadCalendarData();
      expect(result).toEqual({});
    });
  });

  describe('saveCalendarData', () => {
    test('saves data to localStorage', () => {
      const testData: Record<string, CalendarEvent[]> = {
        '2026-04-04': [{ type: 'holiday', content: '清明节' }],
      };

      saveCalendarData(testData);

      expect(localStorage.getItem(STORAGE_KEYS.CALENDAR)).toEqual(JSON.stringify(testData));
    });
  });

  describe('getEventsForDate', () => {
    test('returns events for specific date', () => {
      const testData = {
        '2026-04-04': [
          { type: 'holiday' as const, content: '清明节', description: '清明节放假' },
        ],
      };
      saveCalendarData(testData);

      const result = getEventsForDate('2026-04-04');
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('清明节');
    });

    test('returns empty array for date without events', () => {
      const testData = {
        '2026-04-04': [{ type: 'holiday' as const, content: '清明节' }],
      };
      saveCalendarData(testData);

      const result = getEventsForDate('2026-04-05');
      expect(result).toEqual([]);
    });
  });

  describe('getEventsForMonth', () => {
    test('returns events for specific month', () => {
      const testData = {
        '2026-04-04': [{ type: 'holiday' as const, content: '清明节' }],
        '2026-04-15': [{ type: 'delivery' as const, content: '期权交割日' }],
        '2026-05-01': [{ type: 'holiday' as const, content: '劳动节' }],
      };
      saveCalendarData(testData);

      const result = getEventsForMonth(2026, 3); // April is month 3 (0-indexed)
      expect(Object.keys(result)).toHaveLength(2);
      expect(result['2026-04-04']).toBeDefined();
      expect(result['2026-04-15']).toBeDefined();
      expect(result['2026-05-01']).toBeUndefined();
    });
  });

  describe('getEventsForYear', () => {
    test('returns events for specific year', () => {
      const testData = {
        '2026-04-04': [{ type: 'holiday' as const, content: '清明节' }],
        '2026-12-25': [{ type: 'holiday' as const, content: '圣诞节' }],
        '2027-01-01': [{ type: 'holiday' as const, content: '元旦' }],
      };
      saveCalendarData(testData);

      const result = getEventsForYear(2026);
      expect(Object.keys(result)).toHaveLength(2);
      expect(result['2026-04-04']).toBeDefined();
      expect(result['2027-01-01']).toBeUndefined();
    });
  });

  describe('updateCalendarData', () => {
    test('adds new holiday events', () => {
      const newEvents = [
        { date: '2026-04-04', content: '清明节', description: '清明节放假', market: 'A股' },
      ];

      updateCalendarData('holiday_china', newEvents);

      const result = loadCalendarData();
      expect(result['2026-04-04']).toHaveLength(1);
      expect(result['2026-04-04'][0].type).toBe('holiday_china');
      expect(result['2026-04-04'][0].content).toBe('清明节');
    });

    test('adds new delivery events', () => {
      const newEvents = [
        { date: '2026-04-15', content: '期权交割日', description: 'ETF期权交割', market: 'A股' },
      ];

      updateCalendarData('delivery', newEvents);

      const result = loadCalendarData();
      expect(result['2026-04-15']).toHaveLength(1);
      expect(result['2026-04-15'][0].type).toBe('delivery');
    });

    test('replaces existing holiday events with new ones', () => {
      // First add some data
      const existingData = {
        '2026-04-04': [
          { type: 'holiday_china' as const, content: '旧节假日', description: '旧' },
          { type: 'delivery' as const, content: '交割日', description: '交割' },
        ],
      };
      saveCalendarData(existingData);

      // Update with new holiday - should replace holiday, keep delivery
      const newEvents = [
        { date: '2026-04-04', content: '新节假日', description: '新', market: 'A股' },
      ];
      updateCalendarData('holiday_china', newEvents);

      const result = loadCalendarData();
      // Should keep delivery, replace holiday with new one - so 2 events
      expect(result['2026-04-04']).toHaveLength(2);
      expect(result['2026-04-04'][0].type).toBe('delivery');
      expect(result['2026-04-04'][1].type).toBe('holiday_china');
      expect(result['2026-04-04'][1].content).toBe('新节假日');
    });

    test('removes dates with no events after update', () => {
      const existingData = {
        '2026-04-04': [{ type: 'holiday_china' as const, content: '清明节' }],
      };
      saveCalendarData(existingData);

      // Update with new events for different date
      const newEvents = [
        { date: '2026-05-01', content: '劳动节', description: '放假' },
      ];
      updateCalendarData('holiday_china', newEvents);

      const result = loadCalendarData();
      // Old date should be removed, new date added
      expect(result['2026-04-04']).toBeUndefined();
      expect(result['2026-05-01']).toBeDefined();
    });

    test('handles empty events array', () => {
      const existingData = {
        '2026-04-04': [{ type: 'holiday_china' as const, content: '清明节' }],
      };
      saveCalendarData(existingData);

      // Update with empty events - should remove existing
      updateCalendarData('holiday_china', []);

      const result = loadCalendarData();
      expect(result['2026-04-04']).toBeUndefined();
    });
  });

  describe('clearCalendarData', () => {
    test('clears calendar data', () => {
      const testData = {
        '2026-04-04': [{ type: 'holiday' as const, content: '清明节' }],
      };
      saveCalendarData(testData);

      clearCalendarData();

      const stored = localStorage.getItem(STORAGE_KEYS.CALENDAR);
      expect(stored).toBe('{}');
    });
  });

  describe('getUpcomingEvents', () => {
    test('returns empty array when no events', () => {
      // 显式清除日历数据，确保干净状态
      saveCalendarData({});
      const result = getUpcomingEvents(3);
      expect(result).toEqual([]);
    });

    test('returns events within specified days', () => {
      // Set up events for today
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      const testData = {
        [todayStr]: [{ type: 'holiday_china' as const, content: '今日节假日' }],
      };
      saveCalendarData(testData);

      const result = getUpcomingEvents(3);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].content).toBe('今日节假日');
    });

    test('returns events with correct type', () => {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      const testData = {
        [todayStr]: [
          { type: 'holiday_china' as const, content: 'A股节假日' },
          { type: 'delivery' as const, content: '交割日' },
        ],
      };
      saveCalendarData(testData);

      const result = getUpcomingEvents(3);
      expect(result.length).toBe(2);
      expect(result.some(e => e.type === 'holiday_china')).toBe(true);
      expect(result.some(e => e.type === 'delivery')).toBe(true);
    });
  });

  describe('getFirstEventInWorkdays', () => {
    test('returns empty array when no events in range', () => {
      // 显式清除日历数据，确保干净状态
      saveCalendarData({});
      const result = getFirstEventInWorkdays(4);
      expect(result).toEqual([]);
    });

    test('returns today events when today has events', () => {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      const testData = {
        [todayStr]: [{ type: 'holiday_china' as const, content: '今日节假日', description: '放假' }],
      };
      saveCalendarData(testData);

      const result = getFirstEventInWorkdays(4);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('今日节假日');
      expect(result[0].date).toBe(todayStr);
    });

    test('returns multiple events for same date', () => {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      const testData = {
        [todayStr]: [
          { type: 'holiday_china' as const, content: '节假日', description: '放假' },
          { type: 'delivery' as const, content: '交割日', description: '期权交割' },
        ],
      };
      saveCalendarData(testData);

      const result = getFirstEventInWorkdays(4);
      expect(result).toHaveLength(2);
      expect(result[0].date).toBe(todayStr);
      expect(result[1].date).toBe(todayStr);
    });

    test('includes today even if today is weekend', () => {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      const testData = {
        [todayStr]: [{ type: 'holiday_china' as const, content: '今日事件' }],
      };
      saveCalendarData(testData);

      const result = getFirstEventInWorkdays(4);
      // 今天有事件就应该返回，即使是周末
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('今日事件');
    });
  });
});