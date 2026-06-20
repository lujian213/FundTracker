// services/sources/usRetailSalesSource.ts

import {
  ImportantDataSourceBase,
  ImportantDataSourceConfig,
  ImportantDataEventInfo
} from '../importantDataSourceBase';

/**
 * Census Bureau 零售销售数据源
 * 从美国人口普查局（Census Bureau）官网获取零售销售发布日程
 *
 * 数据源页面：https://www.census.gov/retail/release_schedule.html
 */
export class CensusRetailSalesSource extends ImportantDataSourceBase {
  constructor() {
    const config: ImportantDataSourceConfig = {
      eventType: 'important_data_us_retail',
      eventName: '零售销售数据公布',
      market: '美股',
      useProxy: true  // Census Bureau 不支持 CORS，需要代理访问
    };
    super(config);
  }

  /**
   * 获取 Census Bureau 零售销售发布日程页面 URL
   */
  getSourceUrl(): string {
    return 'https://www.census.gov/retail/release_schedule.html';
  }

  /**
   * 解析 Census Bureau 发布日程页面的 HTML
   * 页面格式示例：
   * <table>
   *   <tr>
   *     <td>June 2026</td>
   *     <td>June 17, 2026</td>  <!-- 发布日期 -->
   *     <td>8:30 A.M.</td>
   *   </tr>
   * </table>
   */
  parseHtml(html: string): ImportantDataEventInfo[] {
    const events: ImportantDataEventInfo[] = [];
    const currentYear = this.getCurrentYear();


    // Census Bureau 页面有多种格式，尝试匹配不同的模式

    // 格式1：表格形式，月份列 + 发布日期列 + 时间列
    const tablePattern1 = /<tr[^>]*>\s*<td[^>]*>(\w+)\s+(\d{4})<\/td>\s*<td[^>]*>(\w+)\s+(\d{1,2}),\s+(\d{4})<\/td>\s*<td[^>]*>(\d{1,2}:\d{2}\s*(?:A\.M\.|P\.M\.))<\/td>/gi;

    let match;
    while ((match = tablePattern1.exec(html)) !== null) {
      const reportMonthStr = match[1];
      const reportYear = parseInt(match[2], 10);
      const releaseMonthStr = match[3];
      const releaseDay = parseInt(match[4], 10);
      const releaseYear = parseInt(match[5], 10);


      if (releaseYear !== currentYear) continue;

      const releaseMonth = this.parseMonthName(releaseMonthStr);
      if (releaseMonth === -1) continue;

      const releaseDate = new Date(releaseYear, releaseMonth, releaseDay);
      if (isNaN(releaseDate.getTime())) continue;

      const reportMonth = this.parseMonthName(reportMonthStr);
      if (reportMonth === -1) continue;

      events.push({
        date: this.formatDate(releaseDate),
        releaseTime: this.calculateBeijingTime(releaseDate),
        reportPeriod: `${reportYear}年${this.getMonthNameCN(reportMonth)}`
      });
    }

    // 格式2：简化表格，只有发布日期
    if (events.length === 0) {

      // 匹配 "Release Date" 标题后的日期列表
      // <strong>June 17, 2026</strong> 或类似格式
      const simplePattern = /(?:Release\s+Date|Advance\s+Monthly)\s*[:\-]?\s*(\w+)\s+(\d{1,2}),\s+(\d{4})/gi;

      while ((match = simplePattern.exec(html)) !== null) {
        const releaseMonthStr = match[1];
        const releaseDay = parseInt(match[2], 10);
        const releaseYear = parseInt(match[3], 10);


        if (releaseYear !== currentYear) continue;

        const releaseMonth = this.parseMonthName(releaseMonthStr);
        if (releaseMonth === -1) continue;

        const releaseDate = new Date(releaseYear, releaseMonth, releaseDay);
        if (isNaN(releaseDate.getTime())) continue;

        // 零售销售报告期是发布月的前一个月
        let reportMonth = releaseMonth - 1;
        let reportYear = releaseYear;
        if (reportMonth < 0) {
          reportMonth = 11;
          reportYear = releaseYear - 1;
        }

        events.push({
          date: this.formatDate(releaseDate),
          releaseTime: this.calculateBeijingTime(releaseDate),
          reportPeriod: `${reportYear}年${this.getMonthNameCN(reportMonth)}`
        });
      }
    }

    // 格式3：列表格式
    if (events.length === 0) {

      const listPattern = /(\w+)\s+(\d{4})\s*[-–]\s*(\w+)\s+(\d{1,2}),\s+(\d{4})\s+at\s+(\d{1,2}:\d{2}\s*(?:A\.M\.|P\.M\.))/gi;

      while ((match = listPattern.exec(html)) !== null) {
        const reportMonthStr = match[1];
        const reportYear = parseInt(match[2], 10);
        const releaseMonthStr = match[3];
        const releaseDay = parseInt(match[4], 10);
        const releaseYear = parseInt(match[5], 10);


        if (releaseYear !== currentYear) continue;

        const releaseMonth = this.parseMonthName(releaseMonthStr);
        if (releaseMonth === -1) continue;

        const releaseDate = new Date(releaseYear, releaseMonth, releaseDay);
        if (isNaN(releaseDate.getTime())) continue;

        const reportMonth = this.parseMonthName(reportMonthStr);
        if (reportMonth === -1) continue;

        events.push({
          date: this.formatDate(releaseDate),
          releaseTime: this.calculateBeijingTime(releaseDate),
          reportPeriod: `${reportYear}年${this.getMonthNameCN(reportMonth)}`
        });
      }
    }

    return events;
  }

  /**
   * 格式化日期为 YYYY-MM-DD 格式
   */

  /**
   * 解析 Markdown 格式（r.jina.ai 返回的格式）
   * Census Bureau 页面实际格式（粗体标题 + 列表行）：
   * ## **Advance Monthly Retail Trade Report**
   * **Data Month****Release Date at 8:30 am**
   * September 2025 November 25, 2025
   * October 2025 December 16, 2025
   */
  parseMarkdown(markdown: string): ImportantDataEventInfo[] {
    const events: ImportantDataEventInfo[] = [];
    const currentYear = this.getCurrentYear();


    // 定位到数据区域：查找 "Advance Monthly Retail Trade Report" 标题
    const scheduleMarker = '## **Advance Monthly Retail Trade Report**';
    const scheduleIndex = markdown.indexOf(scheduleMarker);
    if (scheduleIndex === -1) {
      return events;
    }

    // 找到Advance部分的结束位置
    // Monthly部分没有独立标题，只是在"Historical Release Dates"后面用粗体行开始
    // 所以我们需要在Advance部分结束的"Historical Release Dates"处停止
    const endMarker = 'Historical Release Dates';
    const endMarkerIndex = markdown.indexOf(endMarker, scheduleIndex);

    // 如果找到了结束标记，只解析到那之前的内容
    let endIndex = endMarkerIndex !== -1 ? endMarkerIndex : markdown.length;

    // 只解析 Advance 部分的内容
    const content = markdown.substring(scheduleIndex, endIndex);

    // r.jina.ai 返回的不是表格格式，而是列表格式
    // 格式：月份 年份 发布月份 发布日期, 发布年份
    // 例如：September 2025 November 25, 2025
    // 使用正则匹配每行数据
    const rowPattern = /^(\w+)\s+(\d{4})\s+(\w+)\s+(\d{1,2}),\s+(\d{4})$/gm;

    let match;
    while ((match = rowPattern.exec(content)) !== null) {
      const reportMonthStr = match[1];
      const reportYear = parseInt(match[2], 10);
      const releaseMonthStr = match[3];
      const releaseDay = parseInt(match[4], 10);
      const releaseYear = parseInt(match[5], 10);


      // 年份过滤：只保留当前年份的发布
      if (releaseYear !== currentYear) {
        continue;
      }

      const releaseMonth = this.parseMonthName(releaseMonthStr);
      if (releaseMonth === -1) {
        continue;
      }

      const releaseDate = new Date(releaseYear, releaseMonth, releaseDay);
      if (isNaN(releaseDate.getTime())) {
        continue;
      }

      const reportMonth = this.parseMonthName(reportMonthStr);
      if (reportMonth === -1) {
        continue;
      }

      const eventInfo = {
        date: this.formatDate(releaseDate),
        releaseTime: this.calculateBeijingTime(releaseDate),
        reportPeriod: `${reportYear}年${this.getMonthNameCN(reportMonth)}`
      };

      events.push(eventInfo);
    }

    return events;
  }
}