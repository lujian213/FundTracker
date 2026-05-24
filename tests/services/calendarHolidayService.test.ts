// tests/services/calendarHolidayService.test.ts
import { parseCalendarAIResponse } from '../../services/calendarHolidayService';

describe('parseCalendarAIResponse', () => {
  describe('正常解析', () => {
    test('解析有效的JSON数组', () => {
      const response = JSON.stringify([
        { date: '2026-01-01', content: '元旦', description: '新年第一天', market: 'A股' }
      ]);
      const result = parseCalendarAIResponse(response);
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2026-01-01');
      expect(result[0].content).toBe('元旦');
    });

    test('解析带markdown代码块的JSON', () => {
      const response = '```json\n[{\"date\":\"2026-01-01\",\"content\":\"元旦\"}]\n```';
      const result = parseCalendarAIResponse(response);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('元旦');
    });

    test('过滤掉缺少必要字段的项', () => {
      const response = JSON.stringify([
        { date: '2026-01-01', content: '元旦' },
        { date: '2026-01-02' }  // 缺少content
      ]);
      const result = parseCalendarAIResponse(response);
      expect(result).toHaveLength(1);
    });
  });

  describe('解析失败时抛出异常', () => {
    test('无效JSON时抛出异常', () => {
      const response = '这不是有效的JSON';
      expect(() => parseCalendarAIResponse(response)).toThrow('解析日历AI响应失败');
    });

    test('JSON不是数组时抛出异常', () => {
      const response = JSON.stringify({ date: '2026-01-01', content: '元旦' });
      expect(() => parseCalendarAIResponse(response)).toThrow('解析日历AI响应失败');
    });

    test('空字符串时抛出异常', () => {
      expect(() => parseCalendarAIResponse('')).toThrow('解析日历AI响应失败');
    });

    test('空数组时抛出异常（无有效数据）', () => {
      const response = JSON.stringify([]);
      expect(() => parseCalendarAIResponse(response)).toThrow('解析日历AI响应失败');
    });
  });
});