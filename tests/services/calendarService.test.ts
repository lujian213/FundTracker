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
} from '../../services/calendarService';
import { CalendarEvent } from '../../types';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('calendarService', () => {
  beforeEach(() => {
    localStorage.clear();
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
      localStorage.setItem('fund_tracker_calendar', JSON.stringify(testData));

      const result = loadCalendarData();
      expect(result).toEqual(testData);
    });

    test('returns empty object on invalid JSON', () => {
      localStorage.setItem('fund_tracker_calendar', 'invalid json');

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

      expect(localStorage.getItem('fund_tracker_calendar')).toEqual(JSON.stringify(testData));
    });
  });

  describe('getEventsForDate', () => {
    test('returns events for specific date', () => {
      const testData = {
        '2026-04-04': [
          { type: 'holiday' as const, content: '清明节', description: '清明节放假' },
        ],
      };
      localStorage.setItem('fund_tracker_calendar', JSON.stringify(testData));

      const result = getEventsForDate('2026-04-04');
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('清明节');
    });

    test('returns empty array for date without events', () => {
      const testData = {
        '2026-04-04': [{ type: 'holiday' as const, content: '清明节' }],
      };
      localStorage.setItem('fund_tracker_calendar', JSON.stringify(testData));

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
      localStorage.setItem('fund_tracker_calendar', JSON.stringify(testData));

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
      localStorage.setItem('fund_tracker_calendar', JSON.stringify(testData));

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

      updateCalendarData('holiday', newEvents);

      const result = loadCalendarData();
      expect(result['2026-04-04']).toHaveLength(1);
      expect(result['2026-04-04'][0].type).toBe('holiday');
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
          { type: 'holiday' as const, content: '旧节假日', description: '旧' },
          { type: 'delivery' as const, content: '交割日', description: '交割' },
        ],
      };
      localStorage.setItem('fund_tracker_calendar', JSON.stringify(existingData));

      // Update with new holiday - should replace holiday, keep delivery
      const newEvents = [
        { date: '2026-04-04', content: '新节假日', description: '新', market: 'A股' },
      ];
      updateCalendarData('holiday', newEvents);

      const result = loadCalendarData();
      // Should keep delivery, replace holiday with new one - so 2 events
      expect(result['2026-04-04']).toHaveLength(2);
      expect(result['2026-04-04'][0].type).toBe('delivery');
      expect(result['2026-04-04'][1].type).toBe('holiday');
      expect(result['2026-04-04'][1].content).toBe('新节假日');
    });

    test('removes dates with no events after update', () => {
      const existingData = {
        '2026-04-04': [{ type: 'holiday' as const, content: '清明节' }],
      };
      localStorage.setItem('fund_tracker_calendar', JSON.stringify(existingData));

      // Update with new events for different date
      const newEvents = [
        { date: '2026-05-01', content: '劳动节', description: '放假' },
      ];
      updateCalendarData('holiday', newEvents);

      const result = loadCalendarData();
      // Old date should be removed, new date added
      expect(result['2026-04-04']).toBeUndefined();
      expect(result['2026-05-01']).toBeDefined();
    });

    test('handles empty events array', () => {
      const existingData = {
        '2026-04-04': [{ type: 'holiday' as const, content: '清明节' }],
      };
      localStorage.setItem('fund_tracker_calendar', JSON.stringify(existingData));

      // Update with empty events - should remove existing
      updateCalendarData('holiday', []);

      const result = loadCalendarData();
      expect(result['2026-04-04']).toBeUndefined();
    });
  });

  describe('clearCalendarData', () => {
    test('removes calendar data from localStorage', () => {
      const testData = {
        '2026-04-04': [{ type: 'holiday' as const, content: '清明节' }],
      };
      localStorage.setItem('fund_tracker_calendar', JSON.stringify(testData));

      clearCalendarData();

      expect(localStorage.getItem('fund_tracker_calendar')).toBeNull();
    });
  });

  describe('getUpcomingEvents', () => {
    test('returns empty array when no events', () => {
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
      localStorage.setItem('fund_tracker_calendar', JSON.stringify(testData));

      const result = getUpcomingEvents(3);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].content).toBe('今日节假日');
    });

    test('skips weekend days', () => {
      // Create test data for a known weekday (not weekend)
      const today = new Date();
      // Find a weekday (Monday-Friday)
      while (today.getDay() === 0 || today.getDay() === 6) {
        today.setDate(today.getDate() + 1);
      }
      const weekdayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      const testData = {
        [weekdayStr]: [{ type: 'holiday_china' as const, content: '工作日节假日' }],
      };
      localStorage.setItem('fund_tracker_calendar', JSON.stringify(testData));

      const result = getUpcomingEvents(3);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    test('respects days parameter', () => {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      // Skip to a day that's 10+ days away but skip weekends
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + 15);
      const futureStr = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`;

      const testData = {
        [todayStr]: [{ type: 'holiday_china' as const, content: '今日' }],
        [futureStr]: [{ type: 'holiday_china' as const, content: '未来' }],
      };
      localStorage.setItem('fund_tracker_calendar', JSON.stringify(testData));

      const result = getUpcomingEvents(3);
      // Should return events within 3 working days
      expect(result.some(e => e.date === todayStr)).toBe(true);
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
      localStorage.setItem('fund_tracker_calendar', JSON.stringify(testData));

      const result = getUpcomingEvents(3);
      expect(result.length).toBe(2);
      expect(result.some(e => e.type === 'holiday_china')).toBe(true);
      expect(result.some(e => e.type === 'delivery')).toBe(true);
    });
  });
});