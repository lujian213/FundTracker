// tests/services/nonfarmPayrollsService.test.ts
import {
  isDaylightSavingTime,
  calculateReleaseTime,
  parseTradingCalendarData,
} from '../../services/nonfarmPayrollsService';

describe('nonfarmPayrollsService', () => {

  describe('isDaylightSavingTime', () => {
    it('应正确判断夏令时期间的日期', () => {
      // 2026年夏令时：3月第二个周日（3月8日）~ 11月第一个周日（11月1日）
      const summerDate = new Date(2026, 5, 15); // 6月15日
      expect(isDaylightSavingTime(summerDate)).toBe(true);
    });

    it('应正确判断冬令时期间的日期', () => {
      const winterDate = new Date(2026, 0, 15); // 1月15日
      expect(isDaylightSavingTime(winterDate)).toBe(false);
    });

    it('应正确判断夏令时开始边界', () => {
      const dstStart = new Date(2026, 2, 8, 3, 0, 0); // 3月8日 3:00（夏令时开始后）
      expect(isDaylightSavingTime(dstStart)).toBe(true);

      const beforeDstStart = new Date(2026, 2, 8, 1, 0, 0); // 3月8日 1:00（夏令时开始前）
      expect(isDaylightSavingTime(beforeDstStart)).toBe(false);
    });

    it('应正确判断夏令时结束边界', () => {
      const beforeDstEnd = new Date(2026, 10, 1, 1, 0, 0); // 11月1日 1:00（夏令时结束前）
      expect(isDaylightSavingTime(beforeDstEnd)).toBe(true);

      const afterDstEnd = new Date(2026, 10, 1, 3, 0, 0); // 11月1日 3:00（夏令时结束后）
      expect(isDaylightSavingTime(afterDstEnd)).toBe(false);
    });
  });

  describe('calculateReleaseTime', () => {
    it('夏令时应返回 20:30', () => {
      const summerDate = new Date(2026, 5, 5); // 6月5日
      expect(calculateReleaseTime(summerDate)).toBe('20:30');
    });

    it('冬令时应返回 21:30', () => {
      const winterDate = new Date(2026, 0, 9); // 1月9日
      expect(calculateReleaseTime(winterDate)).toBe('21:30');
    });
  });

  describe('parseTradingCalendarData', () => {
    it('应正确解析正常日期格式', () => {
      const html = `
        Non-Farm Payrolls (NFP) Calendar 2026
        January 9
        February 6
        March 6
      `;

      const events = parseTradingCalendarData(html, 2026);

      expect(events.length).toBe(3);
      expect(events[0].date).toBe('2026-01-09');
      expect(events[0].content).toBe('非农数据公布');
      expect(events[0].market).toBe('美股');
      expect(events[0].description).toContain('北京时间 21:30');
      expect(events[0].description).toContain('报告期：2025年12月');
    });

    it('应正确解析调整后的日期', () => {
      const html = `
        Non-Farm Payrolls (NFP) Calendar 2026
        February 6 (Rescheduled to Feb 11)
      `;

      const events = parseTradingCalendarData(html, 2026);

      expect(events.length).toBe(1);
      expect(events[0].date).toBe('2026-02-11');
    });

    it('应正确计算报告期月份', () => {
      const html = `
        Non-Farm Payrolls (NFP) Calendar 2026
        January 9
        June 5
      `;

      const events = parseTradingCalendarData(html, 2026);

      // 1月公布，报告期是12月
      expect(events[0].description).toContain('报告期：2025年12月');

      // 6月公布，报告期是5月
      expect(events[1].description).toContain('报告期：2026年5月');
    });

    it('未找到 NFP Calendar 部分时应返回空数组', () => {
      const html = 'Some other content without NFP calendar';
      const events = parseTradingCalendarData(html, 2026);
      expect(events.length).toBe(0);
    });
  });
});