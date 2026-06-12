// tests/services/sources/usBeaPceSource.test.ts

import { UsBeaPceSource } from '../../../services/sources/usBeaPceSource';
import { ImportantDataEventInfo } from '../../../services/importantDataSourceBase';

describe('UsBeaPceSource', () => {
  let source: UsBeaPceSource;

  beforeEach(() => {
    source = new UsBeaPceSource();
  });

  describe('getSourceUrl', () => {
    it('应返回正确的 BEA 日程页面 URL', () => {
      const url = source.getSourceUrl();
      expect(url).toBe('https://www.bea.gov/news/schedule');
    });
  });

  describe('parseHtml', () => {
    it('应正确解析标准 HTML 格式', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        Year ${currentYear}
        <table>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">June 25</div>
              <small class="text-muted">8:30 AM</small>
            </td>
            <td class="release-title">Personal Income and Outlays, May ${currentYear}</td>
          </tr>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">July 30</div>
              <small class="text-muted">8:30 AM</small>
            </td>
            <td class="release-title">Personal Income and Outlays, June ${currentYear}</td>
          </tr>
        </table>
      `;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        date: `${currentYear}-06-25`,
        releaseTime: '20:30', // 6月是夏令时
        reportPeriod: `${currentYear}年5月`
      });
      expect(events[1]).toEqual({
        date: `${currentYear}-07-30`,
        releaseTime: '20:30', // 7月是夏令时
        reportPeriod: `${currentYear}年6月`
      });
    });

    it('应正确计算夏令时和冬令时的北京时间', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        Year ${currentYear}
        <table>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">January 28</div>
              <small class="text-muted">8:30 AM</small>
            </td>
            <td class="release-title">Personal Income and Outlays, December ${currentYear - 1}</td>
          </tr>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">July 30</div>
              <small class="text-muted">8:30 AM</small>
            </td>
            <td class="release-title">Personal Income and Outlays, June ${currentYear}</td>
          </tr>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">November 25</div>
              <small class="text-muted">8:30 AM</small>
            </td>
            <td class="release-title">Personal Income and Outlays, October ${currentYear}</td>
          </tr>
        </table>
      `;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(3);
      // 1月：冬令时 -> 21:30
      expect(events[0].releaseTime).toBe('21:30');
      // 7月：夏令时 -> 20:30
      expect(events[1].releaseTime).toBe('20:30');
      // 11月：冬令时 -> 21:30
      expect(events[2].releaseTime).toBe('21:30');
    });

    it('应过滤掉非当前年份的事件', () => {
      const currentYear = new Date().getFullYear();
      // 测试年份过滤：页面年份为当前年份-1，发布日期会被解析为该年份
      // 因此所有事件的发布日期年份都会与当前年份不匹配
      const html = `
        Year ${currentYear - 1}
        <table>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">June 25</div>
              <small class="text-muted">8:30 AM</small>
            </td>
            <td class="release-title">Personal Income and Outlays, May ${currentYear - 1}</td>
          </tr>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">July 30</div>
              <small class="text-muted">8:30 AM</small>
            </td>
            <td class="release-title">Personal Income and Outlays, June ${currentYear - 1}</td>
          </tr>
        </table>
      `;

      const events = source.parseHtml(html);

      // 所有事件都是上一年的，应该被过滤掉
      expect(events).toHaveLength(0);
    });

    it('应忽略非 PCE 数据行', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        Year ${currentYear}
        <table>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">June 25</div>
              <small class="text-muted">8:30 AM</small>
            </td>
            <td class="release-title">GDP (Third Estimate), 1st Quarter ${currentYear}</td>
          </tr>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">June 25</div>
              <small class="text-muted">8:30 AM</small>
            </td>
            <td class="release-title">Personal Income and Outlays, May ${currentYear}</td>
          </tr>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">July 7</div>
              <small class="text-muted">8:30 AM</small>
            </td>
            <td class="release-title">U.S. International Trade in Goods and Services, May ${currentYear}</td>
          </tr>
        </table>
      `;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(1);
      expect(events[0].reportPeriod).toBe(`${currentYear}年5月`);
    });

    it('应对空内容返回空数组', () => {
      expect(source.parseHtml('')).toEqual([]);
      expect(source.parseHtml('<html></html>')).toEqual([]);
    });

    it('应处理月份缩写', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        Year ${currentYear}
        <table>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">Sep 30</div>
              <small class="text-muted">8:30 AM</small>
            </td>
            <td class="release-title">Personal Income and Outlays, Aug ${currentYear}</td>
          </tr>
        </table>
      `;

      const events = source.parseHtml(html);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        date: `${currentYear}-09-30`,
        releaseTime: '20:30', // 9月是夏令时
        reportPeriod: `${currentYear}年8月`
      });
    });
  });

  describe('parseMarkdown', () => {
    it('应抛出错误', () => {
      expect(() => source.parseMarkdown('some markdown')).toThrow(
        'PCE数据源不支持Markdown格式解析'
      );
    });
  });

  describe('继承自基类的辅助方法', () => {
    it('generateDescription应正确生成描述', () => {
      const eventInfo: ImportantDataEventInfo = {
        date: '2026-06-25',
        releaseTime: '20:30',
        reportPeriod: '2026年5月'
      };

      const desc = source.generateDescription(eventInfo);

      expect(desc).toBe('PCE数据公布，北京时间 20:30，报告期：2026年5月');
    });

    it('应正确识别事件类型配置', () => {
      // 通过getSourceUrl间接验证构造函数配置正确
      expect(source.getSourceUrl()).toContain('bea.gov');
    });
  });

  describe('日期格式验证', () => {
    it('应生成正确格式的日期字符串', () => {
      const currentYear = new Date().getFullYear();
      const html = `
        Year ${currentYear}
        <table>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">March 5</div>
              <small class="text-muted">8:30 AM</small>
            </td>
            <td class="release-title">Personal Income and Outlays, February ${currentYear}</td>
          </tr>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">December 15</div>
              <small class="text-muted">8:30 AM</small>
            </td>
            <td class="release-title">Personal Income and Outlays, November ${currentYear}</td>
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
        Year ${currentYear}
        <table>
          <tr class="scheduled-releases-type-press">
            <td class="scheduled-date no-wrap">
              <div class="release-date">January 28</div>
              <small class="text-muted">8:30 AM</small>
            </td>
            <td class="release-title">Personal Income and Outlays, December ${currentYear - 1}</td>
          </tr>
        </table>
      `;

      const events = source.parseHtml(html);

      expect(events[0].reportPeriod).toBe(`${currentYear - 1}年12月`);
    });
  });
});