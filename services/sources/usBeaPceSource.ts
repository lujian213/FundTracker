// services/sources/usBeaPceSource.ts

import {
  ImportantDataSourceBase,
  ImportantDataSourceConfig,
  ImportantDataEventInfo
} from '../importantDataSourceBase';

/**
 * BEA PCE 数据源
 * 从美国经济分析局（BEA）官网获取 PCE 数据发布日程
 * PCE 数据包含在 "Personal Income and Outlays" 报告中
 *
 * 数据源页面：https://www.bea.gov/news/schedule
 */
export class UsBeaPceSource extends ImportantDataSourceBase {
  constructor() {
    const config: ImportantDataSourceConfig = {
      eventType: 'important_data_us_pce',
      eventName: 'PCE数据公布',
      market: '美股',
      useProxy: false  // BEA 支持 CORS，直接访问
    };
    super(config);
  }

  /**
   * 获取 BEA 发布日程页面 URL
   */
  getSourceUrl(): string {
    return 'https://www.bea.gov/news/schedule';
  }

  /**
   * 解析 BEA 发布日程页面的 HTML
   * 页面格式示例：
   * <tr class="scheduled-releases-type-press">
   *   <td class="scheduled-date no-wrap">
   *     <div class="release-date">June 27</div>
   *     <small class="text-muted">8:30 AM</small>
   *   </td>
   *   ...
   *   <td class="release-title ...">Personal Income and Outlays, May 2026</td>
   * </tr>
   */
  parseHtml(html: string): ImportantDataEventInfo[] {
    const events: ImportantDataEventInfo[] = [];
    const currentYear = this.getCurrentYear();


    // 从页面提取年份（如 "Year 2026"）
    const yearMatch = html.match(/Year\s+(\d{4})/i);
    const pageYear = yearMatch ? parseInt(yearMatch[1], 10) : currentYear;

    // 匹配所有表格行
    // 使用正则匹配日期和标题
    const rowPattern = /<tr[^>]*class="[^"]*scheduled-releases-type[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;

    let rowMatch;
    let rowCount = 0;
    while ((rowMatch = rowPattern.exec(html)) !== null) {
      rowCount++;
      const rowContent = rowMatch[1];

      // 提取日期
      const dateMatch = rowContent.match(/<div class="release-date">([^<]+)<\/div>/i);
      if (!dateMatch) {
        continue;
      }

      const dateStr = dateMatch[1].trim();

      // 提取标题
      const titleMatch = rowContent.match(/<td[^>]*class="[^"]*release-title[^"]*"[^>]*>([^<]+)<\/td>/i);
      if (!titleMatch) {
        continue;
      }

      const title = titleMatch[1].trim();

      // 检查是否是 PCE 相关的发布（Personal Income and Outlays）
      if (!title.includes('Personal Income and Outlays')) {
        continue;
      }

      // 解析 PCE 标题，提取报告期月份和年份
      const pceInfo = this.parsePceTitle(title);
      if (!pceInfo) {
        continue;
      }


      // 解析发布日期
      const releaseDate = this.parseReleaseDate(dateStr, pageYear);
      if (!releaseDate) {
        continue;
      }

      // 年份过滤：只保留当前年份的事件
      if (releaseDate.getFullYear() !== currentYear) {
        continue;
      }

      events.push({
        date: this.formatDate(releaseDate),
        releaseTime: this.calculateBeijingTime(releaseDate),
        reportPeriod: `${pceInfo.year}年${this.getMonthNameCN(pceInfo.month)}`
      });
    }

    return events;
  }

  /**
   * 解析 PCE 标题，提取报告期月份和年份
   * 例如："Personal Income and Outlays, May 2026"
   */
  private parsePceTitle(title: string): { month: number; year: number } | null {
    // 匹配月份和年份（如 "May 2026", "December 2025"）
    const monthYearMatch = title.match(/Personal Income and Outlays,\s*(\w+)\s+(\d{4})$/i);
    if (!monthYearMatch) return null;

    const monthStr = monthYearMatch[1];
    const year = parseInt(monthYearMatch[2], 10);

    const month = this.parseMonthName(monthStr);
    if (month === -1) return null;

    return { month, year };
  }

  /**
   * 解析发布日期字符串
   * 支持格式: "June 27", "July 30", "December 23" 等
   * 年份从页面年份获取
   */
  private parseReleaseDate(dateStr: string, year: number): Date | null {
    // 匹配 "Month Day" 格式
    const datePattern = /^(\w+)\s+(\d{1,2})$/i;
    const match = dateStr.match(datePattern);

    if (!match) return null;

    const monthStr = match[1];
    const day = parseInt(match[2], 10);

    const month = this.parseMonthName(monthStr);
    if (month === -1) return null;

    // 验证日期有效性
    if (isNaN(day) || day < 1 || day > 31) return null;

    return new Date(year, month, day);
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
   * 解析 Markdown 格式（不支持）
   */
  parseMarkdown(_markdown: string): ImportantDataEventInfo[] {
    throw new Error('PCE数据源不支持Markdown格式解析');
  }
}