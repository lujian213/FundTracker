// tests/services/sources/usBeaGdpSource.test.ts

import { UsBeaGdpSource } from '../../../services/sources/usBeaGdpSource';
import { ImportantDataEventInfo } from '../../../services/importantDataSourceBase';

describe('UsBeaGdpSource', () => {
  let source: UsBeaGdpSource;

  beforeEach(() => {
    source = new UsBeaGdpSource();
  });

  describe('getSourceUrl', () => {
    it('应返回正确的 BEA 发布日程页面 URL', () => {
      const url = source.getSourceUrl();
      expect(url).toBe('https://www.bea.gov/news/schedule');
    });
  });

  describe('parseHtml', () => {
    it('应正确解析三种 GDP 估算类型的 HTML 格式', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <table>
          <th id="view-field-scheduled-release-date-1-table-column">Year ${currentYear}</th>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">July 30</div>
              <small class="text-muted">8:30 AM</small>
            </td>
            <td class="release-title views-field views-field-field-scheduled-releases-type">GDP (Advance Estimate), 2nd Quarter ${currentYear}</td>
          </tr>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">August 26</div>
              <small class="text-muted">8:30 AM</small>
            </td>
            <td class="release-title views-field views-field-field-scheduled-releases-type">GDP (Second Estimate) and Corporate Profits, 2nd Quarter ${currentYear}</td>
          </tr>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">September 30</div>
              <small class="text-muted">8:30 AM</small>
            </td>
            <td class="release-title views-field views-field-field-scheduled-releases-type">GDP (Third Estimate), Industries, Corporate Profits, State GDP, and State Personal Income, 2nd Quarter ${currentYear}</td>
          </tr>
        </table>
      `;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({
        date: `${currentYear}-07-30`,
        releaseTime: '20:30', // 7月是夏令时
        reportPeriod: `${currentYear}年Q2 (初值)`
      });
      expect(events[1]).toEqual({
        date: `${currentYear}-08-26`,
        releaseTime: '20:30', // 8月是夏令时
        reportPeriod: `${currentYear}年Q2 (第二估算)`
      });
      expect(events[2]).toEqual({
        date: `${currentYear}-09-30`,
        releaseTime: '20:30', // 9月是夏令时
        reportPeriod: `${currentYear}年Q2 (第三估算)`
      });
    });

    it('应正确计算夏令时和冬令时的北京时间', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <table>
          <th id="view-field-scheduled-release-date-1-table-column">Year ${currentYear}</th>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">January 25</div>
            </td>
            <td class="release-title views-field views-field-field-scheduled-releases-type">GDP (Advance Estimate), 4th Quarter ${currentYear - 1}</td>
          </tr>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">July 30</div>
            </td>
            <td class="release-title views-field views-field-field-scheduled-releases-type">GDP (Advance Estimate), 2nd Quarter ${currentYear}</td>
          </tr>
        </table>
      `;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(2);
      // 1月：冬令时 -> 21:30
      expect(events[0].releaseTime).toBe('21:30');
      // 7月：夏令时 -> 20:30
      expect(events[1].releaseTime).toBe('20:30');
    });

    it('应过滤掉非当前年份的事件（根据发布日期年份）', () => {
      const currentYear = new Date().getFullYear();
      // 页面年份设置为 currentYear - 1，会导致日期解析为前一年
      const html = `
        <table>
          <th id="view-field-scheduled-release-date-1-table-column">Year ${currentYear - 1}</th>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">July 30</div>
            </td>
            <td class="release-title views-field views-field-field-scheduled-releases-type">GDP (Advance Estimate), 2nd Quarter ${currentYear - 1}</td>
          </tr>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">July 30</div>
            </td>
            <td class="release-title views-field views-field-field-scheduled-releases-type">GDP (Advance Estimate), 2nd Quarter ${currentYear + 1}</td>
          </tr>
        </table>
      `;

      const events = source.parseHtml(html);

      // 页面年份是 currentYear - 1，所以所有日期都被解析为 currentYear - 1
      // 年份过滤会把这些事件过滤掉
      expect(events).toHaveLength(0);
    });

    it('应跳过非 GDP 相关的发布', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <table>
          <th id="view-field-scheduled-release-date-1-table-column">Year ${currentYear}</th>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">July 30</div>
            </td>
            <td class="release-title views-field views-field-field-scheduled-releases-type">Personal Income and Outlays, June ${currentYear}</td>
          </tr>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">August 26</div>
            </td>
            <td class="release-title views-field views-field-field-scheduled-releases-type">GDP (Advance Estimate), 2nd Quarter ${currentYear}</td>
          </tr>
        </table>
      `;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(1);
      expect(events[0].reportPeriod).toBe(`${currentYear}年Q2 (初值)`);
    });

    it('应对空内容返回空数组', () => {
      expect(source.parseHtml('')).toEqual([]);
      expect(source.parseHtml('<html></html>')).toEqual([]);
    });

    it('应处理不规则格式的日期', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <table>
          <th id="view-field-scheduled-release-date-1-table-column">Year ${currentYear}</th>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">Invalid Date</div>
            </td>
            <td class="release-title views-field views-field-field-scheduled-releases-type">GDP (Advance Estimate), 2nd Quarter ${currentYear}</td>
          </tr>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">July 30</div>
            </td>
            <td class="release-title views-field views-field-field-scheduled-releases-type">Invalid Title</td>
          </tr>
        </table>
      `;

      const events = source.parseHtml(html);

      // 无效日期或无效标题的行应被跳过
      expect(events).toHaveLength(0);
    });

    it('应正确解析包含多个季度的数据', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <table>
          <th id="view-field-scheduled-release-date-1-table-column">Year ${currentYear}</th>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">January 29</div>
            </td>
            <td class="release-title views-field views-field-field-scheduled-releases-type">GDP (Advance Estimate), 4th Quarter ${currentYear - 1}</td>
          </tr>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">April 30</div>
            </td>
            <td class="release-title views-field views-field-field-scheduled-releases-type">GDP (Advance Estimate), 1st Quarter ${currentYear}</td>
          </tr>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">July 30</div>
            </td>
            <td class="release-title views-field views-field-field-scheduled-releases-type">GDP (Advance Estimate), 2nd Quarter ${currentYear}</td>
          </tr>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">October 30</div>
            </td>
            <td class="release-title views-field views-field-field-scheduled-releases-type">GDP (Advance Estimate), 3rd Quarter ${currentYear}</td>
          </tr>
        </table>
      `;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(4);
      expect(events[0].reportPeriod).toBe(`${currentYear - 1}年Q4 (初值)`);
      expect(events[1].reportPeriod).toBe(`${currentYear}年Q1 (初值)`);
      expect(events[2].reportPeriod).toBe(`${currentYear}年Q2 (初值)`);
      expect(events[3].reportPeriod).toBe(`${currentYear}年Q3 (初值)`);
    });
  });

  describe('parseMarkdown', () => {
    it('应抛出错误', () => {
      expect(() => source.parseMarkdown('some markdown')).toThrow(
        'GDP数据源不支持Markdown格式解析'
      );
    });
  });

  describe('继承自基类的辅助方法', () => {
    it('generateDescription应正确生成描述', () => {
      const eventInfo: ImportantDataEventInfo = {
        date: '2026-07-30',
        releaseTime: '20:30',
        reportPeriod: '2026年Q2 (初值)'
      };

      const desc = source.generateDescription(eventInfo);

      expect(desc).toBe('GDP数据公布，北京时间 20:30，报告期：2026年Q2 (初值)');
    });

    it('应正确识别事件类型配置', () => {
      // 通过 getSourceUrl 间接验证构造函数配置正确
      expect(source.getSourceUrl()).toContain('bea.gov');
    });
  });

  describe('日期格式验证', () => {
    it('应生成正确格式的日期字符串', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <table>
          <th id="view-field-scheduled-release-date-1-table-column">Year ${currentYear}</th>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">March 5</div>
            </td>
            <td class="release-title views-field views-field-field-scheduled-releases-type">GDP (Advance Estimate), 1st Quarter ${currentYear}</td>
          </tr>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">December 15</div>
            </td>
            <td class="release-title views-field views-field-field-scheduled-releases-type">GDP (Advance Estimate), 4th Quarter ${currentYear}</td>
          </tr>
        </table>
      `;

      const events = source.parseHtml(html);

      expect(events[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(events[1].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // 验证月份补零
      expect(events[0].date).toBe(`${currentYear}-03-05`);
      // 验证两位数日期
      expect(events[1].date).toBe(`${currentYear}-12-15`);
    });

    it('应生成正确格式的报告期', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <table>
          <th id="view-field-scheduled-release-date-1-table-column">Year ${currentYear}</th>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">July 30</div>
            </td>
            <td class="release-title views-field views-field-field-scheduled-releases-type">GDP (Advance Estimate), 2nd Quarter ${currentYear}</td>
          </tr>
        </table>
      `;

      const events = source.parseHtml(html);

      expect(events[0].reportPeriod).toBe(`${currentYear}年Q2 (初值)`);
    });
  });

  describe('季度解析验证', () => {
    it('应正确解析所有四种季度格式', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        <table>
          <th id="view-field-scheduled-release-date-1-table-column">Year ${currentYear}</th>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap"><div class="release-date">January 1</div></td>
            <td class="release-title views-field views-field-field-scheduled-releases-type">GDP (Advance Estimate), 1st Quarter ${currentYear}</td>
          </tr>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap"><div class="release-date">February 1</div></td>
            <td class="release-title views-field views-field-field-scheduled-releases-type">GDP (Advance Estimate), 2nd Quarter ${currentYear}</td>
          </tr>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap"><div class="release-date">March 1</div></td>
            <td class="release-title views-field views-field-field-scheduled-releases-type">GDP (Advance Estimate), 3rd Quarter ${currentYear}</td>
          </tr>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap"><div class="release-date">April 1</div></td>
            <td class="release-title views-field views-field-field-scheduled-releases-type">GDP (Advance Estimate), 4th Quarter ${currentYear}</td>
          </tr>
        </table>
      `;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(4);
      expect(events[0].reportPeriod).toContain('Q1');
      expect(events[1].reportPeriod).toContain('Q2');
      expect(events[2].reportPeriod).toContain('Q3');
      expect(events[3].reportPeriod).toContain('Q4');
    });
  });
});