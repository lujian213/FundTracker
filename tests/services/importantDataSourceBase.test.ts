// tests/services/importantDataSourceBase.test.ts

import { ImportantDataSourceBase, ImportantDataSourceConfig, ImportantDataEventInfo, MONTH_NAMES_CN } from '../../services/importantDataSourceBase';

// 创建测试用的模拟子类
class MockDataSource extends ImportantDataSourceBase {
  private mockEvents: ImportantDataEventInfo[];

  constructor(config: ImportantDataSourceConfig, mockEvents: ImportantDataEventInfo[] = []) {
    super(config);
    this.mockEvents = mockEvents;
  }

  getSourceUrl(): string {
    return 'https://test.example.com';
  }

  parseHtml(html: string): ImportantDataEventInfo[] {
    return this.mockEvents;
  }

  // 暴露 protected 方法供测试使用
  public testGetCurrentYear(): number {
    return this.getCurrentYear();
  }

  public testCalculateBeijingTime(date: Date): string {
    return this.calculateBeijingTime(date);
  }

  public testGetMonthNameCN(month: number): string {
    return this.getMonthNameCN(month);
  }

  public testParseMonthName(name: string): number {
    return this.parseMonthName(name);
  }
}

describe('ImportantDataSourceBase', () => {
  describe('generateDescription', () => {
    it('应生成标准格式的描述', () => {
      const config: ImportantDataSourceConfig = {
        eventType: 'important_data_us_cpi',
        eventName: 'CPI数据公布',
        market: '美股'
      };
      const source = new MockDataSource(config, []);
      const eventInfo: ImportantDataEventInfo = {
        date: '2026-05-14',
        releaseTime: '20:30',
        reportPeriod: '2026年4月'
      };

      const desc = source.generateDescription(eventInfo);
      expect(desc).toBe('CPI数据公布，北京时间 20:30，报告期：2026年4月');
    });

    it('应正确处理FOMC会议描述', () => {
      const config: ImportantDataSourceConfig = {
        eventType: 'important_data_us_fomc',
        eventName: 'FOMC议息会议',
        market: '美股'
      };
      const source = new MockDataSource(config, []);
      const eventInfo: ImportantDataEventInfo = {
        date: '2026-01-29',
        releaseTime: '03:00',
        reportPeriod: '2026年1月会议'
      };

      const desc = source.generateDescription(eventInfo);
      expect(desc).toBe('FOMC议息会议，北京时间 03:00，报告期：2026年1月会议');
    });
  });

  describe('parseData', () => {
    it('raw格式应调用parseHtml', () => {
      const mockEvents: ImportantDataEventInfo[] = [
        { date: '2026-01-14', releaseTime: '21:30', reportPeriod: '2025年12月' }
      ];
      const config: ImportantDataSourceConfig = {
        eventType: 'important_data_us_cpi',
        eventName: 'CPI',
        market: '美股'
      };
      const source = new MockDataSource(config, mockEvents);

      const events = source.parseData('some html', 'raw');
      expect(events).toEqual(mockEvents);
    });

    it('markdown格式应调用parseMarkdown（默认抛错）', () => {
      const config: ImportantDataSourceConfig = {
        eventType: 'important_data_us_cpi',
        eventName: 'CPI',
        market: '美股'
      };
      const source = new MockDataSource(config, []);

      expect(() => source.parseData('some markdown', 'markdown')).toThrow('Markdown解析未实现');
    });
  });

  describe('辅助方法', () => {
    it('getCurrentYear应返回当前年份', () => {
      const config: ImportantDataSourceConfig = {
        eventType: 'important_data_us_cpi',
        eventName: 'CPI',
        market: '美股'
      };
      const source = new MockDataSource(config, []);
      expect(source.testGetCurrentYear()).toBe(new Date().getFullYear());
    });

    it('getMonthNameCN应返回中文月份名称', () => {
      const config: ImportantDataSourceConfig = {
        eventType: 'important_data_us_cpi',
        eventName: 'CPI',
        market: '美股'
      };
      const source = new MockDataSource(config, []);
      expect(source.testGetMonthNameCN(0)).toBe('1月');
      expect(source.testGetMonthNameCN(5)).toBe('6月');
      expect(source.testGetMonthNameCN(11)).toBe('12月');
    });

    it('parseMonthName应解析英文月份全称', () => {
      const config: ImportantDataSourceConfig = {
        eventType: 'important_data_us_cpi',
        eventName: 'CPI',
        market: '美股'
      };
      const source = new MockDataSource(config, []);
      expect(source.testParseMonthName('January')).toBe(0);
      expect(source.testParseMonthName('February')).toBe(1);
      expect(source.testParseMonthName('December')).toBe(11);
    });

    it('parseMonthName应解析英文月份简称', () => {
      const config: ImportantDataSourceConfig = {
        eventType: 'important_data_us_cpi',
        eventName: 'CPI',
        market: '美股'
      };
      const source = new MockDataSource(config, []);
      expect(source.testParseMonthName('Jan')).toBe(0);
      expect(source.testParseMonthName('Feb')).toBe(1);
      expect(source.testParseMonthName('Dec')).toBe(11);
    });

    it('parseMonthName对未知月份应返回-1', () => {
      const config: ImportantDataSourceConfig = {
        eventType: 'important_data_us_cpi',
        eventName: 'CPI',
        market: '美股'
      };
      const source = new MockDataSource(config, []);
      expect(source.testParseMonthName('Unknown')).toBe(-1);
    });

    it('calculateBeijingTime夏令时应返回20:30', () => {
      const config: ImportantDataSourceConfig = {
        eventType: 'important_data_us_cpi',
        eventName: 'CPI',
        market: '美股'
      };
      const source = new MockDataSource(config, []);
      // 夏令时期间：2026年3月某日（3月第二个周日之后）
      const summerDate = new Date(2026, 5, 15); // 6月15日，应在夏令时期间
      expect(source.testCalculateBeijingTime(summerDate)).toBe('20:30');
    });

    it('calculateBeijingTime冬令时应返回21:30', () => {
      const config: ImportantDataSourceConfig = {
        eventType: 'important_data_us_cpi',
        eventName: 'CPI',
        market: '美股'
      };
      const source = new MockDataSource(config, []);
      // 冬令时期间：2026年1月某日（在3月第二个周日之前）
      const winterDate = new Date(2026, 1, 15); // 2月15日，应在冬令时期间
      expect(source.testCalculateBeijingTime(winterDate)).toBe('21:30');
    });
  });

  describe('MONTH_NAMES_CN 常量', () => {
    it('应包含12个月份', () => {
      expect(MONTH_NAMES_CN.length).toBe(12);
    });

    it('第一个月份应为1月', () => {
      expect(MONTH_NAMES_CN[0]).toBe('1月');
    });

    it('最后月份应为12月', () => {
      expect(MONTH_NAMES_CN[11]).toBe('12月');
    });
  });
});