// services/sources/usFomcSource.ts

import {
  ImportantDataSourceBase,
  ImportantDataSourceConfig,
  ImportantDataEventInfo
} from '../importantDataSourceBase';

/**
 * Chicago Fed FOMC 会议数据源
 * 从芝加哥联储官网获取 FOMC 会议日程
 *
 * 数据源页面：https://www.chicagofed.org/utilities/about-us/federal-reserve-calendars
 *
 * 特点：
 * - 支持 CORS，可直接跨域访问
 * - 包含 FOMC 会议日程和 blackout periods
 * - 带星号(*)的会议表示有 SEP（经济预测摘要）
 */
export class ChicagoFedFomcSource extends ImportantDataSourceBase {
  constructor() {
    const config: ImportantDataSourceConfig = {
      eventType: 'important_data_us_fomc',
      eventName: 'FOMC议息会议',
      market: '美股',
      useProxy: false  // Chicago Fed 支持 CORS
    };
    super(config);
  }

  /**
   * 获取 Chicago Fed 日历页面 URL
   */
  getSourceUrl(): string {
    return 'https://www.chicagofed.org/utilities/about-us/federal-reserve-calendars';
  }

  /**
   * 解析 Chicago Fed 页面的 HTML
   * 页面格式示例（FOMC Meetings 部分）：
   *
   * <h2>FOMC Meetings</h2>
   * <table>
   *   <td>January 27&ndash;28</td>
   *   <td>March 17&ndash;18*</td>
   *   <td>April 28&ndash;29</td>
   *   <td>June 16&ndash;17*</td>
   *   ...
   * </table>
   *
   * * 表示有 SEP（经济预测摘要）
   */
  parseHtml(html: string): ImportantDataEventInfo[] {
    const events: ImportantDataEventInfo[] = [];
    const currentYear = this.getCurrentYear();

    // 定位 FOMC Meetings 部分
    const fomcSectionStart = html.indexOf('FOMC Meetings');
    if (fomcSectionStart === -1) {
      console.warn('[ChicagoFedFomcSource] 未找到 FOMC Meetings 部分');
      return events;
    }

    // 从 FOMC Meetings 位置开始提取内容（到 blackout periods 或下一个标题）
    const nextSectionIndex = html.indexOf('FOMC Blackout', fomcSectionStart);
    const fomcSection = html.substring(
      fomcSectionStart,
      nextSectionIndex !== -1 ? nextSectionIndex : fomcSectionStart + 3000
    );

    // 匹配会议日期
    // 格式1: "January 27&ndash;28" 或 "January 27–28"
    // 格式2: "March 17&ndash;18*" (带星号表示有 SEP)
    const meetingPattern = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:&ndash;|–|-)(\d{1,2})(\*?)/gi;

    let match;
    while ((match = meetingPattern.exec(fomcSection)) !== null) {
      const monthStr = match[1];
      const startDay = parseInt(match[2], 10);
      const endDay = parseInt(match[3], 10);
      const hasSEP = match[4] === '*';

      const month = this.parseMonthName(monthStr);
      if (month === -1) continue;

      // FOMC 决议通常在会议最后一天公布，美东时间下午 14:00
      const eventDate = new Date(currentYear, month, endDay);

      // 验证日期有效性
      if (eventDate.getMonth() !== month) continue;

      // 生成事件信息
      const reportPeriod = `${currentYear}年${this.getMonthNameCN(month)}`;
      // FOMC 结果发布时间：美东时间下午 14:00，根据夏令时转换为北京时间
      const releaseTime = this.calculateFomcBeijingTime(eventDate);

      const eventInfo: ImportantDataEventInfo = {
        date: this.formatDate(eventDate),
        releaseTime: releaseTime,
        reportPeriod: reportPeriod
      };

      // 添加 SEP 信息作为扩展属性
      if (hasSEP) {
        (eventInfo as any).hasSEP = true;
      }

      events.push(eventInfo);
    }

    return events;
  }

  /**
   * 重写生成描述方法，包含 SEP 信息
   */
  generateDescription(eventInfo: ImportantDataEventInfo): string {
    const baseDesc = `${this.config.eventName}，北京时间 ${eventInfo.releaseTime}，报告期：${eventInfo.reportPeriod}`;

    // 如果有 SEP，添加额外说明
    if ((eventInfo as any).hasSEP) {
      return `${baseDesc}（含经济预测摘要SEP）`;
    }

    return baseDesc;
  }

  /**
   * 计算 FOMC 发布的北京时间
   * FOMC 发布时间：美东时间下午 14:00
   * 夏令时：次日02:00
   * 冬令时：次日03:00
   */
  private calculateFomcBeijingTime(date: Date): string {
    return this.isDaylightSavingTime(date) ? '02:00' : '03:00';
  }

  /**
   * Markdown 解析（不使用）
   */
  parseMarkdown(_markdown: string): ImportantDataEventInfo[] {
    throw new Error('Chicago Fed FOMC 数据源不支持 Markdown 解析');
  }

  /**
   * PDF 解析（不使用）
   */
  parsePdf(_pdfBuffer: ArrayBuffer): ImportantDataEventInfo[] {
    throw new Error('Chicago Fed FOMC 数据源不支持 PDF 解析');
  }
}