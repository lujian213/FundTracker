// tests/services/sources/usCpiSource.test.ts

import { UsBlsCpiSource } from '../../../services/sources/usCpiSource';
import { ImportantDataEventInfo } from '../../../services/importantDataSourceBase';

describe('UsBlsCpiSource', () => {
  let source: UsBlsCpiSource;

  beforeEach(() => {
    source = new UsBlsCpiSource();
  });

  describe('getSourceUrl', () => {
    it('应返回正确的 CPI 发布日程页面 URL', () => {
      const url = source.getSourceUrl();
      expect(url).toBe('https://cpiinflationcalculator.com/cpi-release-schedule/');
    });
  });

  describe('parseMarkdown', () => {
    it('应正确解析标准Markdown表格格式', () => {
      const currentYear = new Date().getFullYear();
      const markdown = `
| Reference Month | Release Date | Release Time (ET) |
|---|---|---|
| January ${currentYear} | February 11, ${currentYear} | 08:30 AM |
| February ${currentYear} | March 12, ${currentYear} | 08:30 AM |
| March ${currentYear} | April 10, ${currentYear} | 08:30 AM |
`;

      const events = source.parseMarkdown(markdown);

      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({
        date: `${currentYear}-02-11`,
        releaseTime: '21:30', // 2月是冬令时
        reportPeriod: `${currentYear}年1月`
      });
      expect(events[1]).toEqual({
        date: `${currentYear}-03-12`,
        releaseTime: '20:30', // 3月12日在夏令时期间
        reportPeriod: `${currentYear}年2月`
      });
      expect(events[2]).toEqual({
        date: `${currentYear}-04-10`,
        releaseTime: '20:30', // 4月是夏令时
        reportPeriod: `${currentYear}年3月`
      });
    });

    it('应正确计算夏令时和冬令时的北京时间', () => {
      const currentYear = new Date().getFullYear();
      const markdown = `
| Reference Month | Release Date | Release Time (ET) |
|---|---|---|
| January ${currentYear} | February 13, ${currentYear} | 08:30 AM |
| July ${currentYear} | August 12, ${currentYear} | 08:30 AM |
| November ${currentYear} | December 10, ${currentYear} | 08:30 AM |
`;

      const events = source.parseMarkdown(markdown);

      expect(events).toHaveLength(3);
      // 2月：冬令时 -> 21:30
      expect(events[0].releaseTime).toBe('21:30');
      // 8月：夏令时 -> 20:30
      expect(events[1].releaseTime).toBe('20:30');
      // 12月：冬令时 -> 21:30
      expect(events[2].releaseTime).toBe('21:30');
    });

    it('应过滤掉非当前年份的事件', () => {
      const currentYear = new Date().getFullYear();
      const markdown = `
| Reference Month | Release Date | Release Time (ET) |
|---|---|---|
| November ${currentYear - 1} | December 15, ${currentYear - 1} | 08:30 AM |
| January ${currentYear} | February 11, ${currentYear} | 08:30 AM |
| March ${currentYear + 1} | April 10, ${currentYear + 1} | 08:30 AM |
`;

      const events = source.parseMarkdown(markdown);

      expect(events).toHaveLength(1);
      expect(events[0].date).toBe(`${currentYear}-02-11`);
      expect(events[0].reportPeriod).toBe(`${currentYear}年1月`);
    });

    it('应跳过表头和分隔行', () => {
      const currentYear = new Date().getFullYear();
      const markdown = `
| Reference Month | Release Date | Release Time (ET) |
|---|---|---|
| January ${currentYear} | February 11, ${currentYear} | 08:30 AM |
`;

      const events = source.parseMarkdown(markdown);

      expect(events).toHaveLength(1);
      expect(events[0].date).toBe(`${currentYear}-02-11`);
    });

    it('应对空内容返回空数组', () => {
      expect(source.parseMarkdown('')).toEqual([]);
    });

    it('应处理月份缩写和完整名称', () => {
      const currentYear = new Date().getFullYear();
      const markdown = `
| Reference Month | Release Date | Release Time (ET) |
|---|---|---|
| September ${currentYear} | October 14, ${currentYear} | 08:30 AM |
| November ${currentYear} | December 10, ${currentYear} | 08:30 AM |
`;

      const events = source.parseMarkdown(markdown);

      expect(events).toHaveLength(2);
      expect(events[0].date).toBe(`${currentYear}-10-14`);
      expect(events[0].reportPeriod).toBe(`${currentYear}年9月`);
      expect(events[1].date).toBe(`${currentYear}-12-10`);
      expect(events[1].reportPeriod).toBe(`${currentYear}年11月`);
    });
  });

  describe('parseHtml', () => {
    it('应正确解析标准表格格式', () => {
      const currentYear = new Date().getFullYear();
      const html = `
<table>
  <thead>
    <tr>
      <th>Reference Month</th>
      <th>Release Date</th>
      <th>Release Time (ET)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>January ${currentYear}</td>
      <td>February 11, ${currentYear}</td>
      <td>08:30 AM</td>
    </tr>
    <tr>
      <td>February ${currentYear}</td>
      <td>March 12, ${currentYear}</td>
      <td>08:30 AM</td>
    </tr>
    <tr>
      <td>March ${currentYear}</td>
      <td>April 10, ${currentYear}</td>
      <td>08:30 AM</td>
    </tr>
  </tbody>
</table>
`;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({
        date: `${currentYear}-02-11`,
        releaseTime: '21:30', // 2月是冬令时
        reportPeriod: `${currentYear}年1月`
      });
      expect(events[1]).toEqual({
        date: `${currentYear}-03-12`,
        releaseTime: '20:30', // 3月12日在夏令时开始后（2026年夏令时从3月8日开始）
        reportPeriod: `${currentYear}年2月`
      });
      expect(events[2]).toEqual({
        date: `${currentYear}-04-10`,
        releaseTime: '20:30', // 4月是夏令时
        reportPeriod: `${currentYear}年3月`
      });
    });

    it('应正确计算夏令时和冬令时的北京时间', () => {
      const currentYear = new Date().getFullYear();
      const html = `
<table>
  <tbody>
    <tr>
      <td>January ${currentYear}</td>
      <td>February 13, ${currentYear}</td>
      <td>08:30 AM</td>
    </tr>
    <tr>
      <td>July ${currentYear}</td>
      <td>August 12, ${currentYear}</td>
      <td>08:30 AM</td>
    </tr>
    <tr>
      <td>November ${currentYear}</td>
      <td>December 10, ${currentYear}</td>
      <td>08:30 AM</td>
    </tr>
  </tbody>
</table>
`;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(3);
      // 2月：冬令时 -> 21:30
      expect(events[0].releaseTime).toBe('21:30');
      // 8月：夏令时 -> 20:30
      expect(events[1].releaseTime).toBe('20:30');
      // 12月：冬令时 -> 21:30
      expect(events[2].releaseTime).toBe('21:30');
    });

    it('应过滤掉非当前年份的事件（关键要求：只提取本年度数据）', () => {
      const currentYear = new Date().getFullYear();
      const html = `
<table>
  <tbody>
    <tr>
      <td>November ${currentYear - 1}</td>
      <td>December 15, ${currentYear - 1}</td>
      <td>08:30 AM</td>
    </tr>
    <tr>
      <td>January ${currentYear}</td>
      <td>February 11, ${currentYear}</td>
      <td>08:30 AM</td>
    </tr>
    <tr>
      <td>March ${currentYear + 1}</td>
      <td>April 10, ${currentYear + 1}</td>
      <td>08:30 AM</td>
    </tr>
  </tbody>
</table>
`;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(1);
      expect(events[0].date).toBe(`${currentYear}-02-11`);
      expect(events[0].reportPeriod).toBe(`${currentYear}年1月`);
    });

    it('应处理月份缩写和完整名称', () => {
      const currentYear = new Date().getFullYear();
      const html = `
<table>
  <tbody>
    <tr>
      <td>September ${currentYear}</td>
      <td>October 14, ${currentYear}</td>
      <td>08:30 AM</td>
    </tr>
    <tr>
      <td>November ${currentYear}</td>
      <td>December 10, ${currentYear}</td>
      <td>08:30 AM</td>
    </tr>
  </tbody>
</table>
`;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(2);
      expect(events[0].date).toBe(`${currentYear}-10-14`);
      expect(events[0].reportPeriod).toBe(`${currentYear}年9月`);
      expect(events[1].date).toBe(`${currentYear}-12-10`);
      expect(events[1].reportPeriod).toBe(`${currentYear}年11月`);
    });

    it('应对空内容返回空数组', () => {
      expect(source.parseHtml('')).toEqual([]);
      expect(source.parseHtml('<html></html>')).toEqual([]);
    });

    it('应在找不到tbody时返回空数组', () => {
      const html = `
<table>
  <thead>
    <tr>
      <th>Reference Month</th>
      <th>Release Date</th>
    </tr>
  </thead>
</table>
`;
      expect(source.parseHtml(html)).toEqual([]);
    });

    it('应跳过格式错误的行', () => {
      const currentYear = new Date().getFullYear();
      const html = `
<table>
  <tbody>
    <tr>
      <td>Invalid Format</td>
      <td>Another Invalid</td>
      <td>No Time</td>
    </tr>
    <tr>
      <td>January ${currentYear}</td>
      <td>February 11, ${currentYear}</td>
      <td>08:30 AM</td>
    </tr>
  </tbody>
</table>
`;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(1);
      expect(events[0].date).toBe(`${currentYear}-02-11`);
    });
  });

  describe('配置', () => {
    it('应配置为需要代理访问（浏览器环境CORS限制）', () => {
      // 新数据源在浏览器环境下需要代理（CORS限制）
      expect(source['config'].useProxy).toBe(true);
    });

    it('应配置正确的事件类型', () => {
      expect(source['config'].eventType).toBe('important_data_us_cpi');
    });

    it('应配置正确的事件名称', () => {
      expect(source['config'].eventName).toBe('CPI数据公布');
    });
  });

  describe('继承自基类的辅助方法', () => {
    it('generateDescription应正确生成描述', () => {
      const eventInfo: ImportantDataEventInfo = {
        date: '2026-02-11',
        releaseTime: '21:30',
        reportPeriod: '2026年1月'
      };

      const desc = source.generateDescription(eventInfo);

      expect(desc).toBe('CPI数据公布，北京时间 21:30，报告期：2026年1月');
    });
  });
});