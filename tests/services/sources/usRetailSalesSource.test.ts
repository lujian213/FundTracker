// tests/services/sources/usRetailSalesSource.test.ts

import { CensusRetailSalesSource } from '../../../services/sources/usRetailSalesSource';
import { ImportantDataEventInfo } from '../../../services/importantDataSourceBase';

describe('CensusRetailSalesSource', () => {
  let source: CensusRetailSalesSource;

  beforeEach(() => {
    source = new CensusRetailSalesSource();
  });

  describe('getSourceUrl', () => {
    it('应返回正确的 Census Bureau 零售销售日程页面 URL', () => {
      const url = source.getSourceUrl();
      expect(url).toBe('https://www.census.gov/retail/release_schedule.html');
    });
  });

  describe('parseMarkdown', () => {
    it('应正确解析列表格式（r.jina.ai实际返回格式）', () => {
      const currentYear = new Date().getFullYear();
      // r.jina.ai实际返回格式：列表而非表格
      const markdown = `
## **Advance Monthly Retail Trade Report**

**Data Month****Release Date at 8:30 am**
November ${currentYear - 1} January 14, ${currentYear}
December ${currentYear - 1} February 10, ${currentYear}
January ${currentYear} March 6, ${currentYear}
`;

      const events = source.parseMarkdown(markdown);

      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({
        date: `${currentYear}-01-14`,
        releaseTime: '21:30', // 1 月是冬令时
        reportPeriod: `${currentYear - 1}年11月`
      });
      expect(events[1]).toEqual({
        date: `${currentYear}-02-10`,
        releaseTime: '21:30', // 2 月是冬令时
        reportPeriod: `${currentYear - 1}年12月`
      });
      expect(events[2]).toEqual({
        date: `${currentYear}-03-06`,
        releaseTime: '21:30', // 3 月是冬令时
        reportPeriod: `${currentYear}年1月`
      });
    });

    it('应正确计算夏令时和冬令时的北京时间（固定8:30 AM发布）', () => {
      const currentYear = new Date().getFullYear();
      const markdown = `
## **Advance Monthly Retail Trade Report**

**Data Month****Release Date at 8:30 am**
January ${currentYear} February 10, ${currentYear}
July ${currentYear} August 14, ${currentYear}
November ${currentYear} December 16, ${currentYear}
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
## **Advance Monthly Retail Trade Report**

**Data Month****Release Date at 8:30 am**
October ${currentYear - 1} December 16, ${currentYear - 1}
January ${currentYear} March 6, ${currentYear}
March ${currentYear + 1} May 14, ${currentYear + 1}
`;

      const events = source.parseMarkdown(markdown);

      expect(events).toHaveLength(1);
      expect(events[0].date).toBe(`${currentYear}-03-06`);
    });

    it('应跳过导航菜单等无关内容（定位到Advance Monthly后才开始解析）', () => {
      const currentYear = new Date().getFullYear();
      const markdown = `
## Other Content
Some irrelevant text

## **Advance Monthly Retail Trade Report**

**Data Month****Release Date at 8:30 am**
January ${currentYear} March 6, ${currentYear}
`;

      const events = source.parseMarkdown(markdown);

      // 只解析数据区域
      expect(events).toHaveLength(1);
      expect(events[0].reportPeriod).toBe(`${currentYear}年1月`);
    });

    it('应对空内容返回空数组', () => {
      expect(source.parseMarkdown('')).toEqual([]);
      expect(source.parseMarkdown('<html></html>')).toEqual([]);
    });

    it('未找到起始标记时应返回空数组', () => {
      const markdown = `
**Data Month****Release Date at 8:30 am**
January 2026 March 6, 2026
`;
      expect(source.parseMarkdown(markdown)).toEqual([]);
    });
  });

  describe('parseHtml', () => {
    it('应正确解析表格格式', () => {
      const currentYear = new Date().getFullYear();
      const html = `
<table>
  <tr>
    <td>January ${currentYear}</td>
    <td>March 6, ${currentYear}</td>
    <td>8:30 A.M.</td>
  </tr>
  <tr>
    <td>February ${currentYear}</td>
    <td>April 1, ${currentYear}</td>
    <td>8:30 A.M.</td>
  </tr>
</table>
`;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(2);
      expect(events[0].date).toBe(`${currentYear}-03-06`);
      expect(events[1].date).toBe(`${currentYear}-04-01`);
    });

    it('应对空内容返回空数组', () => {
      expect(source.parseHtml('')).toEqual([]);
      expect(source.parseHtml('<html></html>')).toEqual([]);
    });
  });

  describe('继承自基类的辅助方法', () => {
    it('generateDescription应正确生成描述', () => {
      const eventInfo: ImportantDataEventInfo = {
        date: '2026-03-06',
        releaseTime: '21:30',
        reportPeriod: '2026年1月'
      };

      const desc = source.generateDescription(eventInfo);

      expect(desc).toBe('零售销售数据公布，北京时间 21:30，报告期：2026年1月');
    });
  });
});