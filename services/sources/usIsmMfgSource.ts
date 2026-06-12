// services/sources/usIsmMfgSource.ts

import {
  ImportantDataSourceBase,
  ImportantDataSourceConfig,
  ImportantDataEventInfo
} from '../importantDataSourceBase';

/**
 * ISM 制造业 PMI 数据源
 * 从 ISM 官网获取制造业 PMI 发布日程
 *
 * 数据源页面：https://www.ismworld.org/supply-management-news-and-reports/reports/rob-report-calendar/
 *
 * 特点：
 * - 每月第一个工作日发布
 * - 发布时间：美国东部时间上午 10:00（北京时间：夏令时 22:00，冬令时 23:00）
 * - 报告期：发布月前一个月（如 1 月发布 12 月数据）
 */
export class UsIsmMfgSource extends ImportantDataSourceBase {
  constructor() {
    const config: ImportantDataSourceConfig = {
      eventType: 'important_data_us_ism_mfg',
      eventName: 'ISM制造业PMI公布',
      market: '美股',
      useProxy: true  // ISM 需要代理访问
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
   * 1. 找到表格中的 "Month" 和 "Manufacturing PMI" 列
   * 2. 提取月份（如 "January 2026"）和制造业发布日期（如 "5"）
   * 3. 构建完整日期：月份 + 日期数字
   * 4. 计算报告期：月份 - 1 个月
   */
  parseHtml(html: string): ImportantDataEventInfo[] {
    const events: ImportantDataEventInfo[] = [];
    const currentYear = this.getCurrentYear();

    // 匹配表格行：月份 | 制造业日期 | 服务业日期
    // 模式：<tr><td>Month Year</td><td>day</td><td>day</td></tr>
    // 注意：页面可能有多个表格，需要找到包含 Manufacturing PMI 的表格
    const rowPattern = /<tr[^>]*>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<\/tr>/gi;

    let match;
    while ((match = rowPattern.exec(html)) !== null) {
      const monthYearStr = match[1].trim();
      const mfgDayStr = match[2].trim();

      // 跳过表头或非数据行
      if (monthYearStr.toLowerCase().includes('month') ||
          monthYearStr.toLowerCase().includes('supply chain') ||
          mfgDayStr.toLowerCase().includes('manufacturing')) {
        continue;
      }

      // 解析月份和年份（如 "January 2026"）
      const monthYearMatch = monthYearStr.match(/^(\w+)\s+(\d{4})$/i);
      if (!monthYearMatch) continue;

      const monthStr = monthYearMatch[1];
      const year = parseInt(monthYearMatch[2], 10);

      // 年份过滤：只保留当前年份
      if (year !== currentYear) continue;

      const month = this.parseMonthName(monthStr);
      if (month === -1) continue;

      // 解析发布日期（可能只是数字，也可能有星号等标记）
      const dayMatch = mfgDayStr.match(/^(\d+)/);
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
   * ISM 制造业 PMI 在某月发布的是上个月的数据
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
   * 计算 ISM 发布的北京时间
   * ISM 发布时间：美国东部时间上午 10:00
   * 北京时间：夏令时 22:00，冬令时 23:00
   */
  private calculateIsmReleaseTime(date: Date): string {
    return this.isDaylightSavingTime(date) ? '22:00' : '23:00';
  }

  /**
   * 判断是否为美国夏令时
   * 夏令时：3 月第二个周日 2:00 AM ~ 11 月第一个周日 2:00 AM
   */
  private isDaylightSavingTime(date: Date): boolean {
    const year = date.getFullYear();
    const month = date.getMonth();

    // 快速判断：4-10 月肯定是夏令时
    if (month >= 3 && month <= 9) {
      // 3 月和 10 月需要详细判断
      if (month > 3 && month < 10) {
        return true;
      }
    }

    // 11-2 月肯定不是夏令时
    if (month >= 10 || month <= 1) {
      if (month > 10 || month < 2) {
        return false;
      }
    }

    // 需要精确计算边界日期
    // 这里复用基类的方法（但基类方法不是 public，所以重新实现）
    const secondSundayInMarch = this.getNthWeekdayOfMonth(year, 2, 0, 2);
    secondSundayInMarch.setHours(2, 0, 0, 0);

    const firstSundayInNovember = this.getNthWeekdayOfMonth(year, 10, 0, 1);
    firstSundayInNovember.setHours(2, 0, 0, 0);

    return date >= secondSundayInMarch && date < firstSundayInNovember;
  }

  /**
   * 获取某月的第 n 个星期几
   */
  private getNthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
    const date = new Date(year, month, 1);
    let count = 0;

    while (count < n) {
      if (date.getDay() === weekday) {
        count++;
        if (count === n) break;
      }
      date.setDate(date.getDate() + 1);
    }

    return date;
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
      const mfgDayStr = match[2].trim();


      // 跳过表头或非数据行
      if (monthYearStr.toLowerCase().includes('month') ||
          monthYearStr.toLowerCase().includes('supply chain') ||
          mfgDayStr.toLowerCase().includes('manufacturing') ||
          mfgDayStr.includes('---')) {
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
      const dayMatch = mfgDayStr.match(/^(\d+)/);
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