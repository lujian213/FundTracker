// services/sources/usIsmSvcSource.ts

import {
  ImportantDataSourceBase,
  ImportantDataSourceConfig,
  ImportantDataEventInfo
} from '../importantDataSourceBase';

/**
 * ISM 服务业 PMI 数据源
 * 从 ISM 官网获取服务业 PMI 发布日程
 *
 * 数据源页面：https://www.ismworld.org/supply-management-news-and-reports/reports/rob-report-calendar/
 *
 * 特点：
 * - 每月第三个工作日发布
 * - 发布时间：美国东部时间上午 10:00（北京时间：夏令时 22:00，冬令时 23:00）
 * - 报告期：发布月前一个月（如 1 月发布 12 月数据）
 */
export class UsIsmSvcSource extends ImportantDataSourceBase {
  constructor() {
    const config: ImportantDataSourceConfig = {
      eventType: 'important_data_us_ism_svc',
      eventName: 'ISM服务业PMI公布',
      market: '美股',
      useProxy: true,  // ISM 需要代理访问
      preferProxyFormat: 'raw'  // 优先使用 raw 格式代理，因为 r.jina.ai 无法正确解析 ISM 网站
    };
    super(config);
  }

  /**
   * 获取 ISM PMI 发布日程页面 URL
   */
  getSourceUrl(): string {
    return 'https://www.ismworld.org/supply-management-news-and-reports/reports/rob-report-calendar/';
  }

  /**
   * 解析 ISM PMI 日程页面的 HTML
   *
   * 页面格式示例（表格结构）：
   * <table>
   *   <thead>
   *     <tr>
   *       <th>Month</th>
   *       <th>Manufacturing PMI®</th>
   *       <th>Services PMI®</th>
   *     </tr>
   *   </thead>
   *   <tbody>
   *     <tr>
   *       <td>January 2026</td>
   *       <td>5</td>
   *       <td>7</td>
   *     </tr>
   *     <tr>
   *       <td>February 2026</td>
   *       <td>2</td>
   *       <td>4</td>
   *     </tr>
   *     ...
   *   </tbody>
   * </table>
   *
   * 解析逻辑：
   * 1. 找到表格中的 "Month" 和 "Services PMI" 列
   * 2. 提取月份（如 "January 2026"）和服务业发布日期（如 "7"）
   * 3. 构建完整日期：月份 + 日期数字
   * 4. 计算报告期：月份 - 1 个月
   */
  parseHtml(html: string): ImportantDataEventInfo[] {
    const events: ImportantDataEventInfo[] = [];
    const currentYear = this.getCurrentYear();

    // 匹配表格行：月份 | 制造业日期 | 服务业日期
    // 实际页面结构：<tr><th scope="row">Month Year</th><td>day</td><td>day</td></tr>
    const rowPattern = /<tr[^>]*>\s*<th[^>]*>([^<]+)<\/th>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<\/tr>/gi;

    let match;
    while ((match = rowPattern.exec(html)) !== null) {
      const monthYearStr = match[1].trim();
      const svcDayStr = match[3].trim(); // 第三列是 Services PMI

      // 跳过非数据行并解析月份年份（如 "January 2026"）
      const monthYearMatch = monthYearStr.match(/^(\w+)\s+(\d{4})$/i);
      if (!monthYearMatch) continue;

      const monthStr = monthYearMatch[1];
      const year = parseInt(monthYearMatch[2], 10);

      // 年份过滤：只保留当前年份
      if (year !== currentYear) continue;

      const month = this.parseMonthName(monthStr);
      if (month === -1) continue;

      // 解析发布日期（可能只是数字，也可能有星号等标记）
      const dayMatch = svcDayStr.match(/^(\d+)/);
      if (!dayMatch) continue;

      const day = parseInt(dayMatch[1], 10);
      if (isNaN(day) || day < 1 || day > 31) continue;

      // 构建发布日期
      const releaseDate = new Date(year, month, day);

      // 验证日期有效性
      if (releaseDate.getMonth() !== month) continue;

      // 计算报告期：发布月前一个月
      // 例如：1 月发布的报告是 12 月的数据
      const reportPeriod = this.calculateReportPeriod(year, month);

      events.push({
        date: this.formatDate(releaseDate),
        releaseTime: this.calculateIsmReleaseTime(releaseDate),
        reportPeriod: reportPeriod
      });
    }

    return events;
  }

  /**
   * 计算报告期
   * ISM 服务业 PMI 在某月发布的是上个月的数据
   * 例如：2026 年 1 月发布的报告期是 "2025年12月"
   */
  private calculateReportPeriod(year: number, month: number): string {
    // 上一个月
    let reportYear = year;
    let reportMonth = month - 1;

    // 处理跨年：1 月的发布日，报告期是去年 12 月
    if (reportMonth < 0) {
      reportMonth = 11; // 12 月
      reportYear = year - 1;
    }

    return `${reportYear}年${this.getMonthNameCN(reportMonth)}`;
  }

  /**
   * 解析 Markdown 格式（r.jina.ai 返回的格式）
   * 表格格式示例：
   * | Month | Manufacturing PMI® | Services PMI® |
   * |---|---|---|
   * | January 2026 | 5 | 7 |
   * | February 2026 | 2 | 4 |
   */
  parseMarkdown(markdown: string): ImportantDataEventInfo[] {
    const events: ImportantDataEventInfo[] = [];
    const currentYear = this.getCurrentYear();


    // 匹配表格行：| Month | Manufacturing PMI® | Services PMI® |
    // Markdown表格格式：| January 2026 | 5 | 7 |
    const rowPattern = /\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/g;

    let match;
    while ((match = rowPattern.exec(markdown)) !== null) {
      const monthYearStr = match[1].trim();
      const svcDayStr = match[3].trim(); // 第三列是 Services PMI


      // 跳过表头或非数据行
      if (monthYearStr.toLowerCase().includes('month') ||
          monthYearStr.toLowerCase().includes('supply chain') ||
          svcDayStr.toLowerCase().includes('services') ||
          monthYearStr.includes('---')) {
        continue;
      }

      // 解析月份和年份（如 "January 2026"）
      const monthYearMatch = monthYearStr.match(/^(\w+)\s+(\d{4})$/i);
      if (!monthYearMatch) {
        continue;
      }

      const monthStr = monthYearMatch[1];
      const year = parseInt(monthYearMatch[2], 10);

      // 年份过滤：只保留当前年份
      if (year !== currentYear) {
        continue;
      }

      const month = this.parseMonthName(monthStr);
      if (month === -1) {
        continue;
      }

      // 解析发布日期（可能只是数字，也可能有星号等标记）
      const dayMatch = svcDayStr.match(/^(\d+)/);
      if (!dayMatch) {
        continue;
      }

      const day = parseInt(dayMatch[1], 10);
      if (isNaN(day) || day < 1 || day > 31) {
        continue;
      }

      // 构建发布日期
      const releaseDate = new Date(year, month, day);

      // 验证日期有效性
      if (releaseDate.getMonth() !== month) {
        continue;
      }

      // 计算报告期：发布月前一个月
      const reportPeriod = this.calculateReportPeriod(year, month);

      const eventInfo = {
        date: this.formatDate(releaseDate),
        releaseTime: this.calculateIsmReleaseTime(releaseDate),
        reportPeriod: reportPeriod
      };

      events.push(eventInfo);
    }

    return events;
  }
}