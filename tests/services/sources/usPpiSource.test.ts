// tests/services/sources/usPpiSource.test.ts

import { UsBlsPpiSource } from '../../../services/sources/usPpiSource';
import { ImportantDataEventInfo } from '../../../services/importantDataSourceBase';

describe('UsBlsPpiSource', () => {
  let source: UsBlsPpiSource;

  beforeEach(() => {
    source = new UsBlsPpiSource();
  });

  describe('getSourceUrl', () => {
    it('应返回正确的 BLS PPI 日程页面 URL', () => {
      const url = source.getSourceUrl();
      expect(url).toBe('https://www.bls.gov/schedule/news_release/ppi.htm');
    });
  });

  describe('parseMarkdown', () => {
    it('应正确解析标准表格格式（从Schedule of Releases区域开始）', () => {
      const currentYear = new Date().getFullYear();
      const markdown = `
## Other Navigation Content
| Subscribe | Release Calendar | ...
| --- | --- | --- |

## Schedule of Releases for the Producer Price Index

| Reference Month | Release Date | Release Time |
| --- | --- | --- |
| December ${currentYear - 1} | Jan. 15, ${currentYear} | 08:30 AM |
| January ${currentYear} | Feb. 13, ${currentYear} | 08:30 AM |
| February ${currentYear} | Mar. 12, ${currentYear} | 08:30 AM |
`;

      const events = source.parseMarkdown(markdown);

      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({
        date: `${currentYear}-01-15`,
        releaseTime: '21:30', // 1 月是冬令时
        reportPeriod: `${currentYear - 1}年12月`
      });
      expect(events[1]).toEqual({
        date: `${currentYear}-02-13`,
        releaseTime: '21:30', // 2 月是冬令时
        reportPeriod: `${currentYear}年1月`
      });
    });

    it('应正确计算夏令时和冬令时的北京时间', () => {
      const currentYear = new Date().getFullYear();
      const markdown = `
## Schedule of Releases for the Producer Price Index

| Reference Month | Release Date | Release Time |
| --- | --- | --- |
| January ${currentYear} | Feb. 13, ${currentYear} | 08:30 AM |
| July ${currentYear} | Aug. 12, ${currentYear} | 08:30 AM |
| November ${currentYear} | Dec. 10, ${currentYear} | 08:30 AM |
`;

      const events = source.parseMarkdown(markdown);

      expect(events).toHaveLength(3);
      // 2 月：冬令时 -> 21:30
      expect(events[0].releaseTime).toBe('21:30');
      // 8 月：夏令时 -> 20:30
      expect(events[1].releaseTime).toBe('20:30');
      // 12 月：冬令时 -> 21:30
      expect(events[2].releaseTime).toBe('21:30');
    });

    it('应过滤掉非当前年份的事件', () => {
      const currentYear = new Date().getFullYear();
      const markdown = `
## Schedule of Releases for the Producer Price Index

| Reference Month | Release Date | Release Time |
| --- | --- | --- |
| November ${currentYear - 1} | Dec. 15, ${currentYear - 1} | 08:30 AM |
| January ${currentYear} | Feb. 13, ${currentYear} | 08:30 AM |
| March ${currentYear + 1} | Apr. 10, ${currentYear + 1} | 08:30 AM |
`;

      const events = source.parseMarkdown(markdown);

      expect(events).toHaveLength(1);
      expect(events[0].date).toBe(`${currentYear}-02-13`);
    });

    it('应跳过导航菜单等无关表格（定位到Schedule of Releases后才开始解析）', () => {
      const currentYear = new Date().getFullYear();
      const markdown = `
| Subscribe | Release Calendar |
| --- | --- |
| Link 1 | Link 2 |

## Schedule of Releases for the Producer Price Index

| Reference Month | Release Date | Release Time |
| --- | --- | --- |
| January ${currentYear} | Feb. 13, ${currentYear} | 08:30 AM |
`;

      const events = source.parseMarkdown(markdown);

      // 只解析数据表格，导航菜单被跳过
      expect(events).toHaveLength(1);
      expect(events[0].reportPeriod).toBe(`${currentYear}年1月`);
    });

    it('应对空内容返回空数组', () => {
      expect(source.parseMarkdown('')).toEqual([]);
      expect(source.parseMarkdown('<html></html>')).toEqual([]);
    });

    it('未找到表格起始标记时应返回空数组', () => {
      const markdown = `
| Reference Month | Release Date | Release Time |
| --- | --- | --- |
| January 2026 | Feb. 13, 2026 | 08:30 AM |
`;
      expect(source.parseMarkdown(markdown)).toEqual([]);
    });

    it('应处理月份缩写和点号', () => {
      const currentYear = new Date().getFullYear();
      const markdown = `
## Schedule of Releases for the Producer Price Index

| Reference Month | Release Date | Release Time |
| --- | --- | --- |
| January ${currentYear} | Feb. 13, ${currentYear} | 08:30 AM |
| September ${currentYear} | Oct. 14, ${currentYear} | 08:30 AM |
`;

      const events = source.parseMarkdown(markdown);

      expect(events).toHaveLength(2);
      expect(events[0].date).toBe(`${currentYear}-02-13`);
      expect(events[1].date).toBe(`${currentYear}-10-14`);
    });
  });

  describe('parseHtml', () => {
    it('应正确解析标准表格格式', () => {
      const currentYear = new Date().getFullYear();
      // BLS HTML表格格式：<td>月份 年份</td><td>月 日, 年份</td><td>时间</td>
      const html = `
<table>
  <tr>
    <td>January ${currentYear}</td>
    <td>February 13, ${currentYear}</td>
    <td>8:30 A.M.</td>
  </tr>
  <tr>
    <td>February ${currentYear}</td>
    <td>March 12, ${currentYear}</td>
    <td>8:30 A.M.</td>
  </tr>
</table>
`;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(2);
      expect(events[0].date).toBe(`${currentYear}-02-13`);
      expect(events[1].date).toBe(`${currentYear}-03-12`);
    });

    it('应对空内容返回空数组', () => {
      expect(source.parseHtml('')).toEqual([]);
      expect(source.parseHtml('<html></html>')).toEqual([]);
    });
  });

  describe('继承自基类的辅助方法', () => {
    it('generateDescription应正确生成描述', () => {
      const eventInfo: ImportantDataEventInfo = {
        date: '2026-02-13',
        releaseTime: '21:30',
        reportPeriod: '2026年1月'
      };

      const desc = source.generateDescription(eventInfo);

      expect(desc).toBe('PPI数据公布，北京时间 21:30，报告期：2026年1月');
    });
  });
});