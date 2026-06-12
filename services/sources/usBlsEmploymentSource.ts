// services/sources/usBlsEmploymentSource.ts

import {
  ImportantDataSourceBase,
  ImportantDataSourceConfig,
  ImportantDataEventInfo
} from '../importantDataSourceBase';

/**
 * BLS Employment Situation（非农就业）数据源
 * 从美国劳工统计局（BLS）官网获取就业报告发布日程
 *
 * 数据源页面：https://www.bls.gov/schedule/news_release/empsit.htm
 */
export class UsBlsEmploymentSource extends ImportantDataSourceBase {
  constructor() {
    const config: ImportantDataSourceConfig = {
      eventType: 'important_data_us_nonfarm',
      eventName: '非农数据公布',
      market: '美股',
      useProxy: true  // BLS 不支持 CORS，需要代理访问
    };
    super(config);
  }

  /**
   * 获取 BLS Employment Situation 发布日程页面 URL
   */
  getSourceUrl(): string {
    return 'https://www.bls.gov/schedule/news_release/empsit.htm';
  }

  /**
   * 解析 BLS 发布日程页面的 HTML
   * 与 CPI/PPI 页面格式相同
   */
  parseHtml(html: string): ImportantDataEventInfo[] {
    const events: ImportantDataEventInfo[] = [];
    const currentYear = this.getCurrentYear();


    // 表格格式
    const tablePattern = /<tr[^>]*>\s*<td[^>]*>(\w+)\s+(\d{4})<\/td>\s*<td[^>]*>(\w+)\s+(\d{1,2}),\s+(\d{4})<\/td>\s*<td[^>]*>(\d{1,2}:\d{2}\s*(?:A\.M\.|P\.M\.))<\/td>/gi;

    let match;
    while ((match = tablePattern.exec(html)) !== null) {
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

    // 列表格式
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
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 解析 Markdown 格式（r.jina.ai 返回的格式）
   * BLS 页面实际表格格式：
   * ## Schedule of Releases for the Employment Situation
   * | Reference Month | Release Date | Release Time |
   * | --- | --- | --- |
   * | November 2025 | Dec. 18, 2025 | 08:30 AM |
   * | January 2026 | Feb. 13, 2026 | 08:30 AM |
   */
  parseMarkdown(markdown: string): ImportantDataEventInfo[] {
    const events: ImportantDataEventInfo[] = [];
    const currentYear = this.getCurrentYear();


    // 定位到数据表格区域：查找 "Schedule of Releases" 标题
    const scheduleMarker = '## Schedule of Releases';
    const scheduleIndex = markdown.indexOf(scheduleMarker);
    if (scheduleIndex === -1) {
      return events;
    }

    // 从标题位置开始解析，跳过前面的导航菜单等内容
    const tableContent = markdown.substring(scheduleIndex);

    // 匹配表格行：| 报告期 | 发布日期 | 时间 |
    const rowPattern = /\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/g;

    let match;
    while ((match = rowPattern.exec(tableContent)) !== null) {
      const reportPeriodStr = match[1].trim();
      const releaseDateStr = match[2].trim();


      // 跳过表头或分隔行
      if (reportPeriodStr.toLowerCase().includes('reference') ||
          reportPeriodStr.includes('---')) {
        continue;
      }

      // 解析报告期（如 "November 2025"）
      const reportMatch = reportPeriodStr.match(/^(\w+)\s+(\d{4})$/i);
      if (!reportMatch) {
        continue;
      }

      const reportMonthStr = reportMatch[1];
      const reportYear = parseInt(reportMatch[2], 10);

      // 解析发布日期（如 "Dec. 18, 2025" 或 "Jan. 13, 2026"）
      const releaseMatch = releaseDateStr.match(/^(\w+)\.?\s+(\d{1,2}),?\s+(\d{4})$/i);
      if (!releaseMatch) {
        continue;
      }

      const releaseMonthStr = releaseMatch[1].replace(/\.$/, ''); // 去掉可能的点号后缀
      const releaseDay = parseInt(releaseMatch[2], 10);
      const releaseYear = parseInt(releaseMatch[3], 10);

      // 年份过滤
      if (releaseYear !== currentYear) {
        continue;
      }

      const releaseMonth = this.parseMonthName(releaseMonthStr);
      if (releaseMonth === -1) continue;

      const releaseDate = new Date(releaseYear, releaseMonth, releaseDay);
      if (isNaN(releaseDate.getTime())) continue;

      const reportMonth = this.parseMonthName(reportMonthStr);
      if (reportMonth === -1) continue;

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