// services/sources/usWhitehousePdfSource.ts

import {
  ImportantDataSourceBase,
  ImportantDataSourceConfig,
  ImportantDataEventInfo
} from '../importantDataSourceBase';
import { ImportantDataType, updateCalendarData } from '../calendarService';

/**
 * Whitehouse PDF 数据源
 * 从白宫发布的 Principal Federal Economic Indicators PDF 中提取多种数据发布日程
 *
 * 数据源页面：https://www.whitehouse.gov/wp-content/uploads/2025/09/pfei_schedule_release_dates_cy2026.pdf
 *
 * 包含的数据类型：
 * - CPI (Consumer Price Index) - BLS
 * - PPI (Producer Price Index) - BLS
 * - Employment Situation (非农就业) - BLS
 * - Advance Monthly Sales for Retail and Food Services (零售销售) - Census
 */
export class WhitehousePdfSource extends ImportantDataSourceBase {
  // 支持的数据类型列表
  private static SUPPORTED_TYPES: ImportantDataType[] = [
    'important_data_us_cpi',
    'important_data_us_ppi',
    'important_data_us_nonfarm',
    'important_data_us_retail'
  ];

  // 当前年份
  private currentYear: number;

  constructor() {
    const config: ImportantDataSourceConfig = {
      eventType: 'important_data_us_cpi',  // 主类型（实际返回多种类型）
      eventName: 'Whitehouse PDF 经济指标',
      market: '美股',
      useProxy: false  // PDF 支持 CORS，直接访问
    };
    super(config);
    this.currentYear = this.getCurrentYear();
  }

  /**
   * 获取 Whitehouse PDF URL
   */
  getSourceUrl(): string {
    // PDF 文件名包含年份，需要动态获取
    // 当前使用 2026 年的 PDF
    return `https://www.whitehouse.gov/wp-content/uploads/2025/09/pfei_schedule_release_dates_cy${this.currentYear}.pdf`;
  }

  /**
   * 解析 PDF 内容
   * PDF 是一个表格，包含各指标的每月发布日期
   */
  parsePdf(pdfBuffer: ArrayBuffer): ImportantDataEventInfo[] {
    // 由于 pdf-parse 是 ES module，在运行时动态导入
    // 这里先实现一个简单的文本解析方案
    // PDF 解析需要在浏览器环境中使用 pdf.js

    // 将 ArrayBuffer 转换为字符串（简单方案）
    // 实际 PDF 解析需要使用 pdf-parse 或 pdf.js
    const text = this.extractTextFromPdf(pdfBuffer);

    // 解析文本内容
    return this.parsePdfText(text);
  }

  /**
   * 从 PDF ArrayBuffer 提取文本
   * 使用动态导入 pdf-parse
   */
  private async extractTextFromPdfAsync(pdfBuffer: ArrayBuffer): Promise<string> {
    try {
      // 动态导入 pdf-parse (ES module)
      const { PDFParse } = await import('pdf-parse');

      // 设置 worker 使用本地 public 目录下的文件
      // 文件已从 node_modules/pdf-parse/dist/worker/pdf.worker.mjs 复制到 public/assets/pdf-worker/
      PDFParse.setWorker('/assets/pdf-worker/pdf.worker.mjs');

      const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
      const textResult = await parser.getText();

      return textResult.text;
    } catch (e) {
      throw new Error(`PDF 解析失败: ${(e as Error).message}`);
    }
  }

  /**
   * 从 PDF ArrayBuffer 提取文本（简单方案）
   * PDF 文件中的文本可能以特定编码存储
   */
  private extractTextFromPdf(pdfBuffer: ArrayBuffer): string {
    // 将 ArrayBuffer 转换为 Uint8Array
    const uint8Array = new Uint8Array(pdfBuffer);

    // 尝试解码为文本（简单方案，可能不完全准确）
    // PDF 文件格式复杂，这里使用简单的字符提取
    let text = '';
    for (let i = 0; i < uint8Array.length; i++) {
      // 跳过 PDF 的控制字符和二进制数据
      if (uint8Array[i] >= 32 && uint8Array[i] <= 126) {
        text += String.fromCharCode(uint8Array[i]);
      } else if (uint8Array[i] === 10 || uint8Array[i] === 13) {
        text += '\n';
      }
    }

    return text;
  }

  /**
   * 解析 PDF 提取的文本内容
   * PDF 结构：按部门和指标排列的表格
   *
   * BLS (Bureau of Labor Statistics):
   * - Consumer Price Index (CPI)
   * - Producer Price Index (PPI)
   * - Employment Situation (非农就业)
   *
   * Census Bureau:
   * - Advance Monthly Sales for Retail and Food Services (零售)
   */
  private parsePdfText(text: string): ImportantDataEventInfo[] {
    const events: ImportantDataEventInfo[] = [];
    const lines = text.split('\n');


    // 查找 BLS 部分
    const blsSection = this.findSection(text, 'BLS', 'Bureau of Labor Statistics');

    // 解析 CPI 日期
    const cpiEvents = this.parseBlsIndicator(blsSection, 'Consumer Price Index', 'CPI');
    cpiEvents.forEach(e => console.log(`[WhitehousePdfSource] CPI: ${e.date} ${e.releaseTime}`));
    events.push(...cpiEvents.map(e => ({ ...e, eventType: 'important_data_us_cpi' })));

    // 解析 PPI 日期
    const ppiEvents = this.parseBlsIndicator(blsSection, 'Producer Price Index', 'PPI');
    ppiEvents.forEach(e => console.log(`[WhitehousePdfSource] PPI: ${e.date} ${e.releaseTime}`));
    events.push(...ppiEvents.map(e => ({ ...e, eventType: 'important_data_us_ppi' })));

    // 解析 Employment Situation (非农)
    const nonfarmEvents = this.parseBlsIndicator(blsSection, 'Employment Situation', 'Nonfarm');
    nonfarmEvents.forEach(e => console.log(`[WhitehousePdfSource] 非农: ${e.date} ${e.releaseTime}`));
    events.push(...nonfarmEvents.map(e => ({ ...e, eventType: 'important_data_us_nonfarm' })));

    // 查找 Census 部分
    const censusSection = this.findSection(text, 'Census', 'Census Bureau');

    // 解析零售销售
    const retailEvents = this.parseCensusIndicator(censusSection, 'Advance Monthly Sales', 'Retail');
    events.push(...retailEvents.map(e => ({ ...e, eventType: 'important_data_us_retail' })));

    return events;
  }

  /**
   * 查找 PDF 文本中的部门部分
   */
  private findSection(text: string, ...keywords: string[]): string {
    const lowerText = text.toLowerCase();
    for (const keyword of keywords) {
      const index = lowerText.indexOf(keyword.toLowerCase());
      if (index !== -1) {
        // 提取该部分的内容（假设下一个部门标题之前）
        return text.substring(index, index + 2000);
      }
    }
    return '';
  }

  /**
   * 解析 BLS 指标的发布日期
   */
  private parseBlsIndicator(section: string, indicatorName: string, shortName: string): ImportantDataEventInfo[] {
    const events: ImportantDataEventInfo[] = [];

    // 查找指标名称位置
    const lowerSection = section.toLowerCase();
    const indicatorIndex = lowerSection.indexOf(indicatorName.toLowerCase());
    if (indicatorIndex === -1) return events;

    // 从指标位置开始解析日期
    const indicatorSection = section.substring(indicatorIndex, indicatorIndex + 500);

    // 解析月份日期（格式：数字表示每个月的发布日期）
    // PDF 中可能是类似 "12 13 14 15 16..." 的格式，表示每月的发布日
    const datePattern = /(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})/g;

    const match = datePattern.exec(indicatorSection);
    if (match) {
      const months = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];

      for (let i = 0; i < 12; i++) {
        const day = parseInt(match[i + 1], 10);
        if (day > 0 && day <= 31) {
          const eventDate = new Date(this.currentYear, i, day);
          events.push({
            date: this.formatDate(eventDate),
            releaseTime: this.calculateBeijingTime(eventDate),
            reportPeriod: this.getReportPeriod(i, this.currentYear, shortName)
          } as ImportantDataEventInfo);
        }
      }
    }

    return events;
  }

  /**
   * 解析 Census 指标的发布日期
   */
  private parseCensusIndicator(section: string, indicatorName: string, shortName: string): ImportantDataEventInfo[] {
    // 类似 BLS 的解析逻辑
    return this.parseBlsIndicator(section, indicatorName, shortName);
  }

  /**
   * 获取报告期
   */
  private getReportPeriod(month: number, year: number, indicatorType: string): string {
    // 大多数经济数据报告期是发布月的前一个月
    let reportMonth = month - 1;
    let reportYear = year;

    if (reportMonth < 0) {
      reportMonth = 11;
      reportYear = year - 1;
    }

    return `${reportYear}年${this.getMonthNameCN(reportMonth)}`;
  }

  /**
   * 格式化日期
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 重写 refresh 方法以支持多类型返回
   */
  async refresh(): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      const response = await fetch(this.getSourceUrl());
      if (!response.ok) {
        return { success: false, count: 0, error: `HTTP ${response.status}` };
      }

      const pdfBuffer = await response.arrayBuffer();

      // 使用异步 PDF 解析
      const text = await this.extractTextFromPdfAsync(pdfBuffer);
      const events = this.parsePdfText(text);

      if (events.length === 0) {
        return { success: false, count: 0, error: '未从 PDF 解析到任何数据' };
      }

      // 按数据类型分组并更新日历
      this.updateMultipleCalendar(events);

      return { success: true, count: events.length };
    } catch (e) {
      return { success: false, count: 0, error: (e as Error).message };
    }
  }

  /**
   * 更新多种类型的日历数据
   */
  private updateMultipleCalendar(events: ImportantDataEventInfo[]): void {
    // 按类型分组
    const eventsByType = new Map<ImportantDataType, ImportantDataEventInfo[]>();

    for (const event of events) {
      const eventType = (event as any).eventType as ImportantDataType;
      if (!eventsByType.has(eventType)) {
        eventsByType.set(eventType, []);
      }
      eventsByType.get(eventType)!.push(event);
    }

    // 更新每种类型的日历
    for (const [eventType, typeEvents] of eventsByType) {
      this.updateCalendarWithType(typeEvents, eventType);
    }
  }

  /**
   * 更新指定类型的日历
   */
  private updateCalendarWithType(events: ImportantDataEventInfo[], eventType: ImportantDataType): void {
    const calendarEvents = events.map(e => ({
      date: e.date,
      content: this.getEventNameByType(eventType),
      description: this.generateDescriptionByType(e, eventType),
      market: this.config.market
    }));

    updateCalendarData(eventType, calendarEvents);
  }

  /**
   * 根据类型获取事件名称
   */
  private getEventNameByType(eventType: ImportantDataType): string {
    const nameMap: Record<ImportantDataType, string> = {
      'important_data_us_cpi': 'CPI数据公布',
      'important_data_us_ppi': 'PPI数据公布',
      'important_data_us_nonfarm': '非农数据公布',
      'important_data_us_gdp': 'GDP数据公布',
      'important_data_us_pce': 'PCE数据公布',
      'important_data_us_ism_mfg': 'ISM制造业PMI公布',
      'important_data_us_ism_svc': 'ISM服务业PMI公布',
      'important_data_us_retail': '零售销售数据公布',
      'important_data_us_fomc': 'FOMC议息会议'
    };
    return nameMap[eventType] || '重要数据公布';
  }

  /**
   * 根据类型生成描述
   */
  private generateDescriptionByType(eventInfo: ImportantDataEventInfo, eventType: ImportantDataType): string {
    return `${this.getEventNameByType(eventType)}，北京时间 ${eventInfo.releaseTime}，报告期：${eventInfo.reportPeriod}`;
  }

  /**
   * HTML 解析（不使用）
   */
  parseHtml(_html: string): ImportantDataEventInfo[] {
    throw new Error('Whitehouse PDF 数据源不支持 HTML 解析');
  }

  /**
   * Markdown 解析（不使用）
   */
  parseMarkdown(_markdown: string): ImportantDataEventInfo[] {
    throw new Error('Whitehouse PDF 数据源不支持 Markdown 解析');
  }
}