// services/sources/usBeaGdpSource.ts

import {
  ImportantDataSourceBase,
  ImportantDataSourceConfig,
  ImportantDataEventInfo
} from '../importantDataSourceBase';

/**
 * GDP 估算类型
 */
type GdpEstimateType = 'Advance' | 'Second' | 'Third';

/**
 * BEA GDP 数据源
 * 从美国经济分析局（BEA）官网获取 GDP 数据发布日程
 *
 * 数据源页面：https://www.bea.gov/news/schedule
 *
 * GDP 数据每季度发布三次：
 * - Advance Estimate（初值）：季度结束后约一个月
 * - Second Estimate（第二次估算）：季度结束后约两个月
 * - Third Estimate（第三次估算）：季度结束后约三个月
 */
export class UsBeaGdpSource extends ImportantDataSourceBase {
  constructor() {
    const config: ImportantDataSourceConfig = {
      eventType: 'important_data_us_gdp',
      eventName: 'GDP数据公布',
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
   *     <div class="release-date">July 30</div>
   *     <small class="text-muted">8:30 AM</small>
   *   </td>
   *   ...
   *   <td class="release-title ...">GDP (Advance Estimate), 2nd Quarter 2026</td>
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
    while ((rowMatch = rowPattern.exec(html)) !== null) {
      const rowContent = rowMatch[1];

      // 提取日期
      const dateMatch = rowContent.match(/<div class="release-date">([^<]+)<\/div>/i);
      if (!dateMatch) continue;

      const dateStr = dateMatch[1].trim();

      // 提取标题
      const titleMatch = rowContent.match(/<td[^>]*class="[^"]*release-title[^"]*"[^>]*>([^<]+)<\/td>/i);
      if (!titleMatch) continue;

      const title = titleMatch[1].trim();

      // 检查是否是 GDP 相关的发布
      if (!title.includes('GDP')) continue;

      // 解析 GDP 估算类型和季度
      const gdpInfo = this.parseGdpTitle(title);
      if (!gdpInfo) continue;

      // 解析发布日期
      const releaseDate = this.parseReleaseDate(dateStr, pageYear);
      if (!releaseDate) continue;

      // 年份过滤：只保留当前年份的事件
      if (releaseDate.getFullYear() !== currentYear) continue;

      // 生成描述，包含估算类型
      const estimateTypeCN = this.getEstimateTypeCN(gdpInfo.estimateType);
      const reportPeriod = `${gdpInfo.year}年Q${gdpInfo.quarter}`;

      events.push({
        date: this.formatDate(releaseDate),
        releaseTime: this.calculateBeijingTime(releaseDate),
        reportPeriod: `${reportPeriod} (${estimateTypeCN})`
      });
    }

    return events;
  }

  /**
   * 解析 GDP 标题，提取估算类型和季度信息
   * 例如："GDP (Advance Estimate), 2nd Quarter 2026"
   * 例如："GDP (Second Estimate) and Corporate Profits, 2nd Quarter 2026"
   * 例如："GDP (Third Estimate), Industries, Corporate Profits, ..., 1st Quarter 2026"
   */
  private parseGdpTitle(title: string): { estimateType: GdpEstimateType; quarter: number; year: number } | null {
    // 匹配估算类型
    const estimateMatch = title.match(/GDP\s*\((Advance|Second|Third)\s+Estimate\)/i);
    if (!estimateMatch) return null;

    const estimateType = estimateMatch[1] as GdpEstimateType;

    // 匹配季度和年份（如 "1st Quarter 2026", "2nd Quarter 2026"）
    const quarterMatch = title.match(/(\d)(?:st|nd|rd|th)\s+Quarter\s+(\d{4})/i);
    if (!quarterMatch) return null;

    const quarter = parseInt(quarterMatch[1], 10);
    const year = parseInt(quarterMatch[2], 10);

    if (quarter < 1 || quarter > 4) return null;

    return { estimateType, quarter, year };
  }

  /**
   * 解析发布日期字符串
   * 支持格式: "July 30", "June 25", "December 23" 等
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
   * 获取估算类型的中文翻译
   */
  private getEstimateTypeCN(type: GdpEstimateType): string {
    const typeMap: Record<GdpEstimateType, string> = {
      'Advance': '初值',
      'Second': '第二估算',
      'Third': '第三估算'
    };
    return typeMap[type];
  }

  /**
   * 解析 Markdown 格式（不支持）
   */
  parseMarkdown(_markdown: string): ImportantDataEventInfo[] {
    throw new Error('GDP数据源不支持Markdown格式解析');
  }
}