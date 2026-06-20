// services/sources/usCpiSource.ts

import {
  ImportantDataSourceBase,
  ImportantDataSourceConfig,
  ImportantDataEventInfo
} from '../importantDataSourceBase';

/**
 * CPI 数据源
 * 从 cpiinflationcalculator.com 获取 CPI 发布日程
 *
 * 数据源页面：https://cpiinflationcalculator.com/cpi-release-schedule/
 *
 * 优势：
 * - 无需代理访问（直接curl可获取）
 * - 清晰的HTML表格格式，解析简单可靠
 * - 数据来源于BLS官方，完整准确
 */
export class UsBlsCpiSource extends ImportantDataSourceBase {
  constructor() {
    const config: ImportantDataSourceConfig = {
      eventType: 'important_data_us_cpi',
      eventName: 'CPI数据公布',
      market: '美股',
      useProxy: true  // 需要使用代理访问（浏览器环境CORS限制）
    };
    super(config);
  }

  /**
   * 获取 CPI 发布日程页面 URL
   */
  getSourceUrl(): string {
    return 'https://cpiinflationcalculator.com/cpi-release-schedule/';
  }

  /**
   * 解析 cpiinflationcalculator.com 的 HTML 表格
   * 页面格式示例：
   * <table>
   *   <thead>
   *     <tr>
   *       <th>Reference Month</th>
   *       <th>Release Date</th>
   *       <th>Release Time (ET)</th>
   *     </tr>
   *   </thead>
   *   <tbody>
   *     <tr>
   *       <td>January 2026</td>
   *       <td>February 11, 2026</td>
   *       <td>08:30 AM</td>
   *     </tr>
   *   </tbody>
   * </table>
   */
  parseHtml(html: string): ImportantDataEventInfo[] {
    const events: ImportantDataEventInfo[] = [];
    const currentYear = this.getCurrentYear();

    // 匹配表格行：<tr><td>January 2026</td><td>February 11, 2026</td><td>08:30 AM</td></tr>
    // 表格在 <tbody> 内，需要提取 tbody 部分
    // 使用更宽松的匹配，允许换行符
    const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    if (!tbodyMatch) {
      return [];
    }

    const tbodyContent = tbodyMatch[1];

    // 匹配行：Reference Month | Release Date | Release Time
    // 使用 [\s\S]* 来匹配任意字符（包括换行符）
    const rowPattern = /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;

    let match;
    while ((match = rowPattern.exec(tbodyContent)) !== null) {
      const reportPeriodStr = match[1].trim();  // "January 2026"
      const releaseDateStr = match[2].trim();    // "February 11, 2026"
      const releaseTimeStr = match[3].trim();    // "08:30 AM"

      // 解析报告期（如 "January 2026"）
      const reportMatch = reportPeriodStr.match(/^(\w+)\s+(\d{4})$/i);
      if (!reportMatch) continue;

      const reportMonthStr = reportMatch[1];
      const reportYear = parseInt(reportMatch[2], 10);

      // 解析发布日期（如 "February 11, 2026"）
      const releaseMatch = releaseDateStr.match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/i);
      if (!releaseMatch) continue;

      const releaseMonthStr = releaseMatch[1];
      const releaseDay = parseInt(releaseMatch[2], 10);
      const releaseYear = parseInt(releaseMatch[3], 10);

      // ⚠️ 关键要求：只保留当前年份的发布
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

    return events;
  }

  /**
   * 解析 cpiinflationcalculator.com 的 Markdown 表格（通过代理返回）
   * Markdown表格格式示例：
   * | Reference Month | Release Date | Release Time (ET) |
   * |---|---|---|
   * | January 2026 | February 11, 2026 | 08:30 AM |
   * | February 2026 | March 11, 2026 | 08:30 AM |
   */
  parseMarkdown(markdown: string): ImportantDataEventInfo[] {
    const events: ImportantDataEventInfo[] = [];
    const currentYear = this.getCurrentYear();

    // 匹配表格行：| Reference Month | Release Date | Release Time |
    const rowPattern = /^\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|$/gm;

    let match;
    while ((match = rowPattern.exec(markdown)) !== null) {
      const reportPeriodStr = match[1].trim();  // "January 2026"
      const releaseDateStr = match[2].trim();    // "February 11, 2026"
      const releaseTimeStr = match[3].trim();    // "08:30 AM"

      // 跳过表头或分隔行
      if (reportPeriodStr.toLowerCase().includes('reference') ||
          reportPeriodStr.includes('---') ||
          releaseDateStr.toLowerCase().includes('release')) {
        continue;
      }

      // 解析报告期（如 "January 2026"）
      const reportMatch = reportPeriodStr.match(/^(\w+)\s+(\d{4})$/i);
      if (!reportMatch) continue;

      const reportMonthStr = reportMatch[1];
      const reportYear = parseInt(reportMatch[2], 10);

      // 解析发布日期（如 "February 11, 2026"）
      const releaseMatch = releaseDateStr.match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/i);
      if (!releaseMatch) continue;

      const releaseMonthStr = releaseMatch[1];
      const releaseDay = parseInt(releaseMatch[2], 10);
      const releaseYear = parseInt(releaseMatch[3], 10);

      // ⚠️ 关键要求：只保留当前年份的发布
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

    return events;
  }
}