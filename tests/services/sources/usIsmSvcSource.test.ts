// tests/services/sources/usIsmSvcSource.test.ts

import { UsIsmSvcSource } from '../../../services/sources/usIsmSvcSource';
import { ImportantDataEventInfo } from '../../../services/importantDataSourceBase';

describe('UsIsmSvcSource', () => {
  let source: UsIsmSvcSource;

  beforeEach(() => {
    source = new UsIsmSvcSource();
  });

  describe('getSourceUrl', () => {
    it('应返回正确的 ISM PMI 日历页面 URL', () => {
      const url = source.getSourceUrl();
      expect(url).toBe('https://www.ismworld.org/supply-management-news-and-reports/reports/rob-report-calendar/');
    });
  });

  describe('parseHtml', () => {
    it('应正确解析标准表格格式（解析第三列 Services PMI）', () => {
      const currentYear = new Date().getFullYear();
      // ISM 页面实际格式：<tr><th scope="row">Month Year</th><td>Manufacturing day</td><td>Services day</td></tr>
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
      <th scope="row">January ${currentYear}</th>
      <td>5</td>
      <td>7</td>
    </tr>
    <tr>
      <th scope="row">February ${currentYear}</th>
      <td>2</td>
      <td>4</td>
    </tr>
  </tbody>
</table>
`;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        date: `${currentYear}-01-07`,  // 服务业 PMI 是第三列的日期
        releaseTime: '23:00',  // 1 月是冬令时
        reportPeriod: `${currentYear - 1}年12月`  // 1 月发布的是去年 12 月数据
      });
      expect(events[1]).toEqual({
        date: `${currentYear}-02-04`,  // 服务业 PMI 是第三列的日期
        releaseTime: '23:00',  // 2 月是冬令时
        reportPeriod: `${currentYear}年1月`  // 2 月发布的是当年 1 月数据
      });
    });

    it('应正确计算夏令时和冬令时的发布时间', () => {
      const currentYear = new Date().getFullYear();
      const html = `
<table>
  <tbody>
    <tr>
      <th scope="row">January ${currentYear}</th>
      <td>5</td>
      <td>7</td>
    </tr>
    <tr>
      <th scope="row">July ${currentYear}</th>
      <td>1</td>
      <td>3</td>
    </tr>
    <tr>
      <th scope="row">November ${currentYear}</th>
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
      <th scope="row">January ${currentYear}</th>
      <td>5</td>
      <td>7</td>
    </tr>
    <tr>
      <th scope="row">December ${currentYear}</th>
      <td>2</td>
      <td>4</td>
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
      <th scope="row">November ${currentYear - 1}</th>
      <td>2</td>
      <td>4</td>
    </tr>
    <tr>
      <th scope="row">February ${currentYear}</th>
      <td>3</td>
      <td>4</td>
    </tr>
    <tr>
      <th scope="row">March ${currentYear + 1}</th>
      <td>1</td>
      <td>5</td>
    </tr>
  </tbody>
</table>
`;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(1);
      expect(events[0].date).toBe(`${currentYear}-02-04`);
    });

    it('应对空内容返回空数组', () => {
      expect(source.parseHtml('')).toEqual([]);
      expect(source.parseHtml('<html></html>')).toEqual([]);
    });

    it('应跳过非标准格式的行（如 ISM Supply Chain Planning Forecast）', () => {
      const currentYear = new Date().getFullYear();
      const html = `
<table>
  <tbody>
    <tr>
      <th scope="row">ISM Supply Chain Planning Forecast</th>
      <td>N/A</td>
      <td>N/A</td>
    </tr>
    <tr>
      <th scope="row">March ${currentYear}</th>
      <td>1</td>
      <td>5</td>
    </tr>
  </tbody>
</table>
`;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(1);
      expect(events[0].date).toBe(`${currentYear}-03-05`);
    });

    it('应处理带星号等标记的日期', () => {
      const currentYear = new Date().getFullYear();
      const html = `
<table>
  <tbody>
    <tr>
      <th scope="row">July ${currentYear}</th>
      <td>1*</td>
      <td>6*</td>
    </tr>
  </tbody>
</table>
`;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(1);
      expect(events[0].date).toBe(`${currentYear}-07-06`);
    });

    it('应正确区分制造业和服务业 PMI 的发布日期', () => {
      const currentYear = new Date().getFullYear();
      const html = `
<table>
  <tbody>
    <tr>
      <th scope="row">April ${currentYear}</th>
      <td>1</td>
      <td>6</td>
    </tr>
    <tr>
      <th scope="row">May ${currentYear}</th>
      <td>2</td>
      <td>5</td>
    </tr>
  </tbody>
</table>
`;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(2);
      // 服务业 PMI 应使用第三列的日期
      expect(events[0].date).toBe(`${currentYear}-04-06`);
      expect(events[1].date).toBe(`${currentYear}-05-05`);
    });
  });

  describe('配置', () => {
    it('应配置正确的事件类型', () => {
      expect(source['config'].eventType).toBe('important_data_us_ism_svc');
    });

    it('应配置正确的事件名称', () => {
      expect(source['config'].eventName).toBe('ISM服务业PMI公布');
    });

    it('应配置为需要代理访问', () => {
      expect(source['config'].useProxy).toBe(true);
    });

    it('应配置优先使用raw格式代理', () => {
      expect(source['config'].preferProxyFormat).toBe('raw');
    });
  });

  describe('继承自基类的辅助方法', () => {
    it('generateDescription应正确生成描述', () => {
      const eventInfo: ImportantDataEventInfo = {
        date: '2026-01-07',
        releaseTime: '23:00',
        reportPeriod: '2025年12月'
      };

      const desc = source.generateDescription(eventInfo);

      expect(desc).toBe('ISM服务业PMI公布，北京时间 23:00，报告期：2025年12月');
    });
  });

  describe('日期格式验证', () => {
    it('应生成正确格式的日期字符串', () => {
      const currentYear = new Date().getFullYear();
      const html = `
<table>
  <tbody>
    <tr>
      <th scope="row">March ${currentYear}</th>
      <td>1</td>
      <td>4</td>
    </tr>
    <tr>
      <th scope="row">October ${currentYear}</th>
      <td>2</td>
      <td>6</td>
    </tr>
  </tbody>
</table>
`;

      const events = source.parseHtml(html);

      expect(events[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(events[1].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // 验证月份补零
      expect(events[0].date).toBe(`${currentYear}-03-04`);
      expect(events[1].date).toBe(`${currentYear}-10-06`);
    });

    it('应生成正确格式的报告期', () => {
      const currentYear = new Date().getFullYear();
      const html = `
<table>
  <tbody>
    <tr>
      <th scope="row">January ${currentYear}</th>
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
      <th scope="row">February ${currentYear}</th>
      <td>30</td>
      <td>30</td>
    </tr>
    <tr>
      <th scope="row">March ${currentYear}</th>
      <td>1</td>
      <td>4</td>
    </tr>
  </tbody>
</table>
`;

      const events = source.parseHtml(html);

      // 2 月 30 日无效，应被跳过
      expect(events).toHaveLength(1);
      expect(events[0].date).toBe(`${currentYear}-03-04`);
    });

    it('应正确处理夏令时边界日期', () => {
      const currentYear = new Date().getFullYear();
      const html = `
<table>
  <tbody>
    <tr>
      <th scope="row">March ${currentYear}</th>
      <td>1</td>
      <td>5</td>
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