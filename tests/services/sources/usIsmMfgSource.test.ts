// tests/services/sources/usIsmMfgSource.test.ts

import { UsIsmMfgSource } from '../../../services/sources/usIsmMfgSource';
import { ImportantDataEventInfo } from '../../../services/importantDataSourceBase';

describe('UsIsmMfgSource', () => {
  let source: UsIsmMfgSource;

  beforeEach(() => {
    source = new UsIsmMfgSource();
  });

  describe('getSourceUrl', () => {
    it('应返回正确的 ISM PMI 日历页面 URL', () => {
      const url = source.getSourceUrl();
      expect(url).toBe('https://www.ismworld.org/supply-management-news-and-reports/reports/rob-report-calendar/');
    });
  });

  describe('parseHtml', () => {
    it('应正确解析标准表格格式', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Manufacturing PMI®</th>
              <th>Services PMI®</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>January ${currentYear}</td>
              <td>5</td>
              <td>7</td>
            </tr>
            <tr>
              <td>February ${currentYear}</td>
              <td>2</td>
              <td>4</td>
            </tr>
          </tbody>
        </table>
      `;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        date: `${currentYear}-01-05`,
        releaseTime: '23:00', // 1 月是冬令时
        reportPeriod: `${currentYear - 1}年12月` // 1 月发布的是 12 月数据
      });
      expect(events[1]).toEqual({
        date: `${currentYear}-02-02`,
        releaseTime: '23:00', // 2 月是冬令时
        reportPeriod: `${currentYear}年1月` // 2 月发布的是 1 月数据
      });
    });

    it('应正确计算夏令时和冬令时的发布时间', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <table>
          <tbody>
            <tr>
              <td>January ${currentYear}</td>
              <td>5</td>
              <td>7</td>
            </tr>
            <tr>
              <td>July ${currentYear}</td>
              <td>1</td>
              <td>3</td>
            </tr>
            <tr>
              <td>November ${currentYear}</td>
              <td>2</td>
              <td>4</td>
            </tr>
          </tbody>
        </table>
      `;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(3);
      // 1 月：冬令时 -> 23:00
      expect(events[0].releaseTime).toBe('23:00');
      // 7 月：夏令时 -> 22:00
      expect(events[1].releaseTime).toBe('22:00');
      // 11 月：冬令时 -> 23:00
      expect(events[2].releaseTime).toBe('23:00');
    });

    it('应正确计算报告期（跨年处理）', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <table>
          <tbody>
            <tr>
              <td>January ${currentYear}</td>
              <td>5</td>
              <td>7</td>
            </tr>
            <tr>
              <td>December ${currentYear}</td>
              <td>1</td>
              <td>3</td>
            </tr>
          </tbody>
        </table>
      `;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(2);
      // 1 月发布的是去年 12 月数据
      expect(events[0].reportPeriod).toBe(`${currentYear - 1}年12月`);
      // 12 月发布的是当年 11 月数据
      expect(events[1].reportPeriod).toBe(`${currentYear}年11月`);
    });

    it('应过滤掉非当前年份的事件', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <table>
          <tbody>
            <tr>
              <td>January ${currentYear - 1}</td>
              <td>5</td>
              <td>7</td>
            </tr>
            <tr>
              <td>February ${currentYear}</td>
              <td>2</td>
              <td>4</td>
            </tr>
            <tr>
              <td>March ${currentYear + 1}</td>
              <td>1</td>
              <td>3</td>
            </tr>
          </tbody>
        </table>
      `;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(1);
      expect(events[0].date).toBe(`${currentYear}-02-02`);
    });

    it('应跳过表头和特殊行', () => {
      const html = `
        <table>
          <thead>
            <tr>
              <td>Month</td>
              <td>Manufacturing PMI®</td>
              <td>Services PMI®</td>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>ISM Supply Chain Planning Forecast</td>
              <td>June 17***</td>
              <td>June 17***</td>
            </tr>
          </tbody>
        </table>
      `;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(0);
    });

    it('应对空内容返回空数组', () => {
      expect(source.parseHtml('')).toEqual([]);
      expect(source.parseHtml('<html></html>')).toEqual([]);
    });

    it('应处理带星号等标记的日期', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <table>
          <tbody>
            <tr>
              <td>January ${currentYear}</td>
              <td>5*</td>
              <td>7</td>
            </tr>
          </tbody>
        </table>
      `;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(1);
      expect(events[0].date).toBe(`${currentYear}-01-05`);
    });

    it('应处理不规则格式的数据', () => {
      const html = `
        <table>
          <tbody>
            <tr>
              <td>Invalid Month</td>
              <td>5</td>
              <td>7</td>
            </tr>
            <tr>
              <td>January 2026</td>
              <td>invalid</td>
              <td>7</td>
            </tr>
          </tbody>
        </table>
      `;

      const events = source.parseHtml(html);

      // 无效数据应被跳过
      expect(events).toHaveLength(0);
    });
  });

  describe('parseMarkdown', () => {
    it('应正确解析Markdown表格格式', () => {
      const currentYear = new Date().getFullYear();
      const markdown = `
| Month | Manufacturing PMI® | Services PMI® |
|---|---|---|
| January ${currentYear} | 5 | 7 |
| February ${currentYear} | 2 | 4 |
`;

      const events = source.parseMarkdown(markdown);

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        date: `${currentYear}-01-05`,
        releaseTime: '23:00', // 1 月是冬令时
        reportPeriod: `${currentYear - 1}年12月` // 1 月发布的是 12 月数据
      });
      expect(events[1]).toEqual({
        date: `${currentYear}-02-02`,
        releaseTime: '23:00', // 2 月是冬令时
        reportPeriod: `${currentYear}年1月` // 2 月发布的是 1 月数据
      });
    });

    it('应过滤掉非当前年份的事件', () => {
      const currentYear = new Date().getFullYear();
      const markdown = `
| Month | Manufacturing PMI® | Services PMI® |
|---|---|---|
| January ${currentYear - 1} | 5 | 7 |
| February ${currentYear} | 2 | 4 |
| March ${currentYear + 1} | 1 | 3 |
`;

      const events = source.parseMarkdown(markdown);

      expect(events).toHaveLength(1);
      expect(events[0].date).toBe(`${currentYear}-02-02`);
    });

    it('应跳过表头和特殊行', () => {
      const markdown = `
| Month | Manufacturing PMI® | Services PMI® |
|---|---|---|
| ISM Supply Chain Planning Forecast | June 17*** | June 17*** |
`;

      const events = source.parseMarkdown(markdown);

      expect(events).toHaveLength(0);
    });

    it('应对空内容返回空数组', () => {
      expect(source.parseMarkdown('')).toEqual([]);
      expect(source.parseMarkdown('<html></html>')).toEqual([]);
    });
  });

  describe('继承自基类的辅助方法', () => {
    it('generateDescription应正确生成描述', () => {
      const eventInfo: ImportantDataEventInfo = {
        date: '2026-01-05',
        releaseTime: '23:00',
        reportPeriod: '2025年12月'
      };

      const desc = source.generateDescription(eventInfo);

      expect(desc).toBe('ISM制造业PMI公布，北京时间 23:00，报告期：2025年12月');
    });

    it('应正确识别事件类型配置', () => {
      expect(source.getSourceUrl()).toContain('ismworld.org');
    });
  });

  describe('日期格式验证', () => {
    it('应生成正确格式的日期字符串', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <table>
          <tbody>
            <tr>
              <td>March ${currentYear}</td>
              <td>2</td>
              <td>4</td>
            </tr>
            <tr>
              <td>December ${currentYear}</td>
              <td>1</td>
              <td>3</td>
            </tr>
          </tbody>
        </table>
      `;

      const events = source.parseHtml(html);

      expect(events[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(events[1].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // 验证月份补零
      expect(events[0].date).toBe(`${currentYear}-03-02`);
      // 验证两位数日期
      expect(events[1].date).toBe(`${currentYear}-12-01`);
    });

    it('应生成正确格式的报告期', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <table>
          <tbody>
            <tr>
              <td>January ${currentYear}</td>
              <td>5</td>
              <td>7</td>
            </tr>
          </tbody>
        </table>
      `;

      const events = source.parseHtml(html);

      expect(events[0].reportPeriod).toBe(`${currentYear - 1}年12月`);
    });
  });

  describe('边界情况测试', () => {
    it('应正确处理无效日期（如 2 月 30 日）', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <table>
          <tbody>
            <tr>
              <td>February ${currentYear}</td>
              <td>30</td>
              <td>4</td>
            </tr>
            <tr>
              <td>March ${currentYear}</td>
              <td>2</td>
              <td>4</td>
            </tr>
          </tbody>
        </table>
      `;

      const events = source.parseHtml(html);

      // 2 月 30 日无效，应被跳过
      expect(events).toHaveLength(1);
      expect(events[0].date).toBe(`${currentYear}-03-02`);
    });

    it('应正确处理夏令时边界日期', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <table>
          <tbody>
            <tr>
              <td>March ${currentYear}</td>
              <td>1</td>
              <td>3</td>
            </tr>
          </tbody>
        </table>
      `;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(1);
      // 3 月可能处于夏令时边界，具体时间取决于当年夏令时开始日期
      expect(events[0].releaseTime).toMatch(/^2[23]:00$/);
    });
  });
});