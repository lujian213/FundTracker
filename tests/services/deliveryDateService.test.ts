// tests/services/deliveryDateService.test.ts
import {
  getNthWeekdayOfMonth,
  getLastDayOfMonth,
  getNextBusinessDay,
  getPrevBusinessDay,
  getPrevBusinessDayForHK,
  isChinaHoliday,
  isHKHoliday,
  calculateDeliveryDatesForYear,
} from '../../services/deliveryDateService';
import { saveCalendarData, resetCache } from '../../services/appDataService';
import { loadCalendarData } from '../../services/calendarService';

describe('deliveryDateService', () => {
  beforeEach(() => {
    localStorage.clear();
    resetCache();
  });

  describe('getNthWeekdayOfMonth', () => {
    test('returns the correct nth weekday of a month', () => {
      // 2026年5月 (month=4, 0-indexed)
      // 第一个周五: 5月1日
      expect(getNthWeekdayOfMonth(2026, 4, 5, 1).getDate()).toBe(1);
      // 第二个周五: 5月8日
      expect(getNthWeekdayOfMonth(2026, 4, 5, 2).getDate()).toBe(8);
      // 第三个周五: 5月15日
      expect(getNthWeekdayOfMonth(2026, 4, 5, 3).getDate()).toBe(15);
      // 第四个周五: 5月22日
      expect(getNthWeekdayOfMonth(2026, 4, 5, 4).getDate()).toBe(22);

      // 2026年5月的星期三
      // 第一个周三: 5月6日
      expect(getNthWeekdayOfMonth(2026, 4, 3, 1).getDate()).toBe(6);
      // 第四个周三: 5月27日
      expect(getNthWeekdayOfMonth(2026, 4, 3, 4).getDate()).toBe(27);
    });

    test('handles different months correctly', () => {
      // 2026年6月 (month=5)
      // 第三个周五: 6月19日
      expect(getNthWeekdayOfMonth(2026, 5, 5, 3).getDate()).toBe(19);
    });
  });

  describe('getLastDayOfMonth', () => {
    test('returns the last day of each month', () => {
      // 2026年各月最后一天
      expect(getLastDayOfMonth(2026, 0)).toEqual(new Date(2026, 1, 0)); // 1月31日
      expect(getLastDayOfMonth(2026, 1)).toEqual(new Date(2026, 2, 0)); // 2月28日 (非闰年)
      expect(getLastDayOfMonth(2026, 2)).toEqual(new Date(2026, 3, 0)); // 3月31日
      expect(getLastDayOfMonth(2026, 3)).toEqual(new Date(2026, 4, 0)); // 4月30日
      expect(getLastDayOfMonth(2026, 4)).toEqual(new Date(2026, 5, 0)); // 5月31日
      expect(getLastDayOfMonth(2026, 5)).toEqual(new Date(2026, 6, 0)); // 6月30日
      expect(getLastDayOfMonth(2026, 6)).toEqual(new Date(2026, 7, 0)); // 7月31日
      expect(getLastDayOfMonth(2026, 7)).toEqual(new Date(2026, 8, 0)); // 8月31日
      expect(getLastDayOfMonth(2026, 8)).toEqual(new Date(2026, 9, 0)); // 9月30日
      expect(getLastDayOfMonth(2026, 9)).toEqual(new Date(2026, 10, 0)); // 10月31日
      expect(getLastDayOfMonth(2026, 10)).toEqual(new Date(2026, 11, 0)); // 11月30日
      expect(getLastDayOfMonth(2026, 11)).toEqual(new Date(2026, 12, 0)); // 12月31日
    });

    test('BUG: original code used month+2 instead of month+1', () => {
      // 這個測試用例重現bug：原代码使用 new Date(year, month + 2, 0)
      // 对于5月 (month=4)，错误代码得到:
      // new Date(2026, 4 + 2, 0) = new Date(2026, 6, 0) = 6月30日
      const buggyLastDay = new Date(2026, 4 + 2, 0);
      expect(buggyLastDay.getMonth()).toBe(5); // 6月!
      expect(buggyLastDay.getDate()).toBe(30); // 6月30日

      // 正确代码应该得到5月31日
      const correctLastDay = getLastDayOfMonth(2026, 4);
      expect(correctLastDay.getMonth()).toBe(4); // 5月
      expect(correctLastDay.getDate()).toBe(31); // 5月31日
    });
  });

  describe('isChinaHoliday', () => {
    test('returns true for dates marked as China holiday', () => {
      saveCalendarData({
        '2026-05-01': [{ type: 'holiday_china', content: '劳动节' }],
        '2026-05-02': [{ type: 'holiday_china', content: '劳动节' }],
        '2026-05-03': [{ type: 'holiday_hk', content: '香港节假日' }],
      });

      const may1 = new Date(2026, 4, 1);
      const may2 = new Date(2026, 4, 2);
      const may3 = new Date(2026, 4, 3);
      const normalDay = new Date(2026, 4, 4);

      expect(isChinaHoliday(may1, loadCalendarData())).toBe(true);
      expect(isChinaHoliday(may2, loadCalendarData())).toBe(true);
      expect(isChinaHoliday(may3, loadCalendarData())).toBe(false); // 港股节假日不算A股节假日
      expect(isChinaHoliday(normalDay, loadCalendarData())).toBe(false);
    });
  });

  describe('isHKHoliday', () => {
    test('returns true for dates marked as HK holiday', () => {
      saveCalendarData({
        '2026-05-01': [{ type: 'holiday_china', content: '劳动节' }],
        '2026-05-02': [{ type: 'holiday_hk', content: '佛诞' }],
      });

      const may1 = new Date(2026, 4, 1);
      const may2 = new Date(2026, 4, 2);

      expect(isHKHoliday(may1, loadCalendarData())).toBe(false); // A股节假日不算港股节假日
      expect(isHKHoliday(may2, loadCalendarData())).toBe(true);
    });
  });

  describe('getPrevBusinessDay', () => {
    test('skips weekends', () => {
      // 2026年5月31日是周日，5月30日是周六，5月29日是周五
      const sunday = new Date(2026, 4, 31); // 5月31日周日

      // 从周日往前找，应该跳过周日(31)、周六(30)，到达周五5月29日
      const prev = getPrevBusinessDay(sunday, {});
      expect(prev.getDay()).toBe(5); // 周五
      expect(prev.getDate()).toBe(29); // 5月29日
    });

    test('skips holidays', () => {
      saveCalendarData({
        '2026-05-29': [{ type: 'holiday_china', content: '节假日' }],
      });

      // 2026年5月31日周日，往前找:
      // 跳过周日(5/31)、周六(5/30)、节假日(5/29)，到达周四(5/28)
      const sunday = new Date(2026, 4, 31);
      const prev = getPrevBusinessDay(sunday, loadCalendarData());
      expect(prev.getDate()).toBe(28); // 5月28日周四
    });

    test('BUG reproduction: May 2026 delivery date should be correct', () => {
      // 2026年5月：最后一天是5月31日（周日）
      // 倒数第一个营业日：5月29日周五
      // 倒数第二个营业日：5月28日周四

      // 正确计算：
      const lastDay = getLastDayOfMonth(2026, 4); // 5月31日
      expect(lastDay.getMonth()).toBe(4); // 确认是5月
      expect(lastDay.getDate()).toBe(31); // 确认是31日
      expect(lastDay.getDay()).toBe(0); // 周日

      // getPrevBusinessDay从lastDay的前一天开始检查
      // lastDay是5/31周日，前一天是5/30周六→跳过→5/29周五营业日
      const lastBusinessDay = getPrevBusinessDay(lastDay, {});
      expect(lastBusinessDay.getDate()).toBe(29); // 5月29日周五
      expect(lastBusinessDay.getDay()).toBe(5); // 周五

      // 再往前找倒数第二个营业日
      // 从5/29周五前一天开始：5/28周四营业日
      const secondLastBusinessDay = getPrevBusinessDay(lastBusinessDay, {});
      expect(secondLastBusinessDay.getDate()).toBe(28); // 5月28日周四
    });
  });

  describe('getNextBusinessDay', () => {
    test('skips weekends and holidays', () => {
      saveCalendarData({
        '2026-05-01': [{ type: 'holiday_china', content: '劳动节' }],
      });

      // 2026年5月2日是周六，下一个营业日应该是5月4日周一
      const saturday = new Date(2026, 4, 2); // 5月2日周六
      const next = getNextBusinessDay(saturday, {});
      expect(next.getDate()).toBe(4); // 下一个营业日是5月4日周一
      expect(next.getDay()).toBe(1); // 确认是周一
    });
  });

  describe('getPrevBusinessDayForHK', () => {
    test('skips weekends and HK holidays', () => {
      // 港股节假日不同于A股
      saveCalendarData({
        '2026-05-29': [{ type: 'holiday_hk', content: '港股节假日' }],
      });

      // 2026年5月31日是周日
      const sunday = new Date(2026, 4, 31);
      const prev = getPrevBusinessDayForHK(sunday, loadCalendarData());

      // 跳过周日(5/31)、周六(5/30)、港股节假日(5/29)，到达周四(5/28)
      expect(prev.getDate()).toBe(28);
      expect(prev.getDay()).toBe(4); // 周四
    });

    test('ignores China holidays for HK market', () => {
      // A股节假日不影响港股
      saveCalendarData({
        '2026-05-29': [{ type: 'holiday_china', content: 'A股节假日' }],
      });

      // 2026年5月31日是周日
      const sunday = new Date(2026, 4, 31);
      const prev = getPrevBusinessDayForHK(sunday, loadCalendarData());

      // 跳过周日(5/31)、周六(5/30)，A股节假日(5/29)对港股来说是营业日
      expect(prev.getDate()).toBe(29);
      expect(prev.getDay()).toBe(5); // 周五
    });

    test('HK delivery date differs from A股 when holidays differ', () => {
      // 设置5月29日为A股节假日但港股正常营业
      saveCalendarData({
        '2026-05-29': [{ type: 'holiday_china', content: 'A股节假日' }],
      });
      const calendarData = loadCalendarData();

      // A股倒数第二个营业日：
      // 5/31周日→前一天5/30周六跳过→5/29A股节假日跳过→5/28周四营业日（倒数第一个）
      // 再往前：5/28前一天是5/27周三营业日（倒数第二个）
      const aLastDay = getLastDayOfMonth(2026, 4);
      const aLastBusinessDay = getPrevBusinessDay(aLastDay, calendarData);
      const aSecondLastBusinessDay = getPrevBusinessDay(aLastBusinessDay, calendarData);
      expect(aLastBusinessDay.getDate()).toBe(28); // 倒数第一个
      expect(aSecondLastBusinessDay.getDate()).toBe(27); // 倒数第二个

      // 港股倒数第二个营业日：
      // 5/31周日→前一天5/30周六跳过→5/29港股营业日（倒数第一个）
      // 再往前：5/29前一天是5/28周四营业日（倒数第二个）
      const hkLastDay = getLastDayOfMonth(2026, 4);
      const hkLastBusinessDay = getPrevBusinessDayForHK(hkLastDay, calendarData);
      const hkSecondLastBusinessDay = getPrevBusinessDayForHK(hkLastBusinessDay, calendarData);
      expect(hkLastBusinessDay.getDate()).toBe(29); // 港股倒数第一个营业日是5/29
      expect(hkSecondLastBusinessDay.getDate()).toBe(28); // 港股倒数第二个营业日是5/28
    });
  });

  describe('calculateDeliveryDatesForYear', () => {
    test('calculates correct delivery dates for May 2026 (BUG fix verification)', () => {
      // 空日历数据，无节假日
      saveCalendarData({});
      const calendarData = loadCalendarData();

      const results = calculateDeliveryDatesForYear(2026, calendarData);

      // 找到5月（month=4）的富时A50交割日
      const a50May = results.find(r =>
        r.date.startsWith('2026-05') &&
        r.content.includes('富时中国A50')
      );

      expect(a50May).toBeDefined();

      // 验证日期格式正确
      expect(a50May!.date).toMatch(/^2026-05-\d{2}$/);

      // 验证日期不是周末（倒数第二个营业日应该是营业日）
      const dayOfMonth = parseInt(a50May!.date.split('-')[2]);
      const dateObj = new Date(2026, 4, dayOfMonth);
      const dayOfWeek = dateObj.getDay();

      // 必须是营业日（周一到周五）
      expect(dayOfWeek).toBeGreaterThanOrEqual(1);
      expect(dayOfWeek).toBeLessThanOrEqual(5);

      // 2026年5月：最后一天是5月31日周日
      // 倒数第二个营业日应该是5月28日周四
      expect(a50May!.date).toBe('2026-05-28');
    });

    test('calculates correct delivery dates for June 2026', () => {
      saveCalendarData({});
      const calendarData = loadCalendarData();

      const results = calculateDeliveryDatesForYear(2026, calendarData);

      // 找到6月（month=5）的富时A50交割日
      const a50June = results.find(r =>
        r.date.startsWith('2026-06') &&
        r.content.includes('富时中国A50')
      );

      expect(a50June).toBeDefined();

      // 2026年6月：
      // - 6月30日周二（营业日）→ 倒数第1个营业日
      // - 往前推一天 → 6月29日周一（营业日）→ 倒数第2个营业日
      expect(a50June!.date).toBe('2026-06-29');
    });

    test('calculates third Friday delivery dates correctly', () => {
      saveCalendarData({});
      const calendarData = loadCalendarData();

      const results = calculateDeliveryDatesForYear(2026, calendarData);

      // 验证5月第三个周五是15日
      const cffexMay = results.find(r =>
        r.date.startsWith('2026-05') &&
        r.content.includes('中金所股指期货')
      );
      expect(cffexMay!.date).toBe('2026-05-15');

      // 验证6月第三个周五是19日
      const cffexJune = results.find(r =>
        r.date.startsWith('2026-06') &&
        r.content.includes('中金所股指期货')
      );
      expect(cffexJune!.date).toBe('2026-06-19');
    });

    test('calculates fourth Wednesday delivery dates correctly', () => {
      saveCalendarData({});
      const calendarData = loadCalendarData();

      const results = calculateDeliveryDatesForYear(2026, calendarData);

      // 验证5月第四个周三
      // 2026年5月：周三分别是6, 13, 20, 27日
      // 第四个周三应该是27日
      const etfMay = results.find(r =>
        r.date.startsWith('2026-05') &&
        r.content.includes('ETF期权')
      );
      expect(etfMay!.date).toBe('2026-05-27');
    });

    test('adjusts delivery date when holiday falls on scheduled date', () => {
      // 设置5月15日（第三个周五）为节假日
      saveCalendarData({
        '2026-05-15': [{ type: 'holiday_china', content: '测试节假日' }],
      });
      const calendarData = loadCalendarData();

      const results = calculateDeliveryDatesForYear(2026, calendarData);

      // 中金所交割日应该顺延
      const cffexMay = results.find(r =>
        r.date.startsWith('2026-05') &&
        r.content.includes('中金所股指期货')
      );

      // 5月15日是节假日，应该顺延到下一个营业日
      // 5月16日是周六，5月17日是周日，5月18日周一
      expect(cffexMay!.date).toBe('2026-05-18');
    });

    test('generates correct number of results for full year', () => {
      saveCalendarData({});
      const calendarData = loadCalendarData();

      const results = calculateDeliveryDatesForYear(2026, calendarData);

      // 每月有:
      // - 1个中金所股指期货/期权交割日
      // - 1个ETF期权交割日
      // - 1个富时A50交割日
      // - 1个港股交割日
      // - 1个月度期权到期日
      // - 三巫日(仅3,6,9,12月有)
      // 每月基础: 5条 × 12月 = 60条
      // 三巫日额外: 4条
      // 总共: 64条
      expect(results.length).toBe(64);
    });

    test('delivery dates are always business days (not weekends)', () => {
      saveCalendarData({});
      const calendarData = loadCalendarData();

      const results = calculateDeliveryDatesForYear(2026, calendarData);

      for (const result of results) {
        const [year, month, day] = result.date.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day);
        const dayOfWeek = dateObj.getDay();

        // A股和港股交割日必须是营业日
        if (result.content.includes('A股') || result.content.includes('港股')) {
          expect(dayOfWeek).toBeGreaterThanOrEqual(1);
          expect(dayOfWeek).toBeLessThanOrEqual(5);
        }
      }
    });

    test('HK delivery dates use HK holidays not China holidays', () => {
      // 设置5月29日为A股节假日，港股正常营业
      saveCalendarData({
        '2026-05-29': [{ type: 'holiday_china', content: 'A股节假日' }],
      });
      const calendarData = loadCalendarData();

      const results = calculateDeliveryDatesForYear(2026, calendarData);

      // 找到5月的A股富时A50交割日
      const a50May = results.find(r =>
        r.date.startsWith('2026-05') &&
        r.content.includes('富时中国A50')
      );

      // 找到5月的港股交割日
      const hkMay = results.find(r =>
        r.date.startsWith('2026-05') &&
        r.content.includes('港股')
      );

      // A股：跳过5/29节假日
      // 倒数第一个营业日是5/28周四，倒数第二个是5/27周三
      expect(a50May!.date).toBe('2026-05-27');

      // 港股：5/29是港股营业日
      // 倒数第一个营业日是5/29周五，倒数第二个是5/28周四
      expect(hkMay!.date).toBe('2026-05-28');
    });

    test('HK delivery dates differ from A股 when HK has holiday', () => {
      // 设置5月29日为港股节假日，A股正常营业
      saveCalendarData({
        '2026-05-29': [{ type: 'holiday_hk', content: '港股节假日' }],
      });
      const calendarData = loadCalendarData();

      const results = calculateDeliveryDatesForYear(2026, calendarData);

      // 找到5月的A股富时A50交割日
      const a50May = results.find(r =>
        r.date.startsWith('2026-05') &&
        r.content.includes('富时中国A50')
      );

      // 找到5月的港股交割日
      const hkMay = results.find(r =>
        r.date.startsWith('2026-05') &&
        r.content.includes('港股')
      );

      // A股：5/29是营业日
      // 倒数第一个营业日是5/29周五，倒数第二个是5/28周四
      expect(a50May!.date).toBe('2026-05-28');

      // 港股：跳过5/29港股节假日
      // 倒数第一个营业日是5/28周四，倒数第二个是5/27周三
      expect(hkMay!.date).toBe('2026-05-27');
    });
  });
});