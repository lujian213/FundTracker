// services/importantDataSourceBase.ts

import { fetchWithProxy } from './proxyService';
import { updateCalendarData, ImportantDataType } from './calendarService';
import { getNthWeekdayOfMonth } from './deliveryDateService';
import { formatDateISO } from '../utils/dateFormat';

/**
 * 重要数据事件信息
 */
export interface ImportantDataEventInfo {
  date: string;           // YYYY-MM-DD
  releaseTime: string;    // 北京时间 HH:MM
  reportPeriod: string;   // 报告期，如 "2026年5月"
}

/**
 * 重要数据源配置
 */
export interface ImportantDataSourceConfig {
  eventType: ImportantDataType;
  eventName: string;
  market: string;
  useProxy?: boolean;  // 是否需要使用代理，默认 false（直接访问）
}

// 中文月份名称
const MONTH_NAMES_CN = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

/**
 * 判断是否为美国夏令时
 * 夏令时：3月第二个周日 2:00 AM ~ 11月第一个周日 2:00 AM
 */
function isDaylightSavingTime(date: Date): boolean {
  const year = date.getFullYear();

  // 使用 getNthWeekdayOfMonth 计算夏令时边界日期，然后设置时间为 2:00 AM
  // 参数：year, month (0-indexed), weekday (0=周日), n (第几个)
  const secondSundayInMarch = getNthWeekdayOfMonth(year, 2, 0, 2);
  secondSundayInMarch.setHours(2, 0, 0, 0);  // 设置为 2:00 AM

  const firstSundayInNovember = getNthWeekdayOfMonth(year, 10, 0, 1);
  firstSundayInNovember.setHours(2, 0, 0, 0);  // 设置为 2:00 AM

  // 判断日期是否在夏令时期间
  return date >= secondSundayInMarch && date < firstSundayInNovember;
}

/**
 * 重要数据源抽象基类
 */
export abstract class ImportantDataSourceBase {
  protected config: ImportantDataSourceConfig;

  constructor(config: ImportantDataSourceConfig) {
    this.config = config;
  }

  // 抽象方法 - 子类必须实现
  abstract getSourceUrl(): string;
  abstract parseHtml(html: string): ImportantDataEventInfo[];

  // 可选重写 - 默认抛错
  parseMarkdown(markdown: string): ImportantDataEventInfo[] {
    throw new Error(`${this.config.eventName}的Markdown解析未实现`);
  }

  // 基类实现 - 获取数据
  async fetchData(): Promise<{ content: string | ArrayBuffer; format: 'raw' | 'markdown' | 'pdf'; success: boolean; error?: string }> {
    try {
      // 根据 useProxy 配置决定是否使用代理
      if (this.config.useProxy) {
        // 使用代理获取数据（fetchWithProxy 成功返回结果，失败抛出异常）
        const result = await fetchWithProxy(this.getSourceUrl());
        return { content: result.content, format: result.format, success: true };
      } else {
        // 直接访问（支持 CORS）
        const response = await fetch(this.getSourceUrl());
        if (!response.ok) {
          const error = `HTTP ${response.status}`;
          return { content: '', format: 'raw', success: false, error };
        }

        // 检查是否是 PDF
        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('application/pdf')) {
          // PDF 需要特殊处理，返回 ArrayBuffer
          const arrayBuffer = await response.arrayBuffer();
          return { content: arrayBuffer, format: 'pdf', success: true };
        }

        // 其他内容返回文本
        const content = await response.text();
        return { content, format: 'raw', success: true };
      }
    } catch (e) {
      const error = (e as Error).message;
      return { content: '', format: 'raw', success: false, error };
    }
  }

  // 基类实现 - 根据格式选择解析器
  parseData(content: string | ArrayBuffer, format: 'raw' | 'markdown' | 'pdf'): ImportantDataEventInfo[] {
    if (format === 'raw') {
      return this.parseHtml(content as string);
    } else if (format === 'markdown') {
      return this.parseMarkdown(content as string);
    } else if (format === 'pdf') {
      return this.parsePdf(content as ArrayBuffer);
    }
    return [];
  }

  // 可选重写 - PDF 解析（默认抛错）
  parsePdf(_pdfBuffer: ArrayBuffer): ImportantDataEventInfo[] {
    throw new Error(`${this.config.eventName}的PDF解析未实现`);
  }

  // 基类实现 - 生成描述
  generateDescription(eventInfo: ImportantDataEventInfo): string {
    return `${this.config.eventName}，北京时间 ${eventInfo.releaseTime}，报告期：${eventInfo.reportPeriod}`;
  }

  // 基类实现 - 更新日历
  updateCalendar(events: ImportantDataEventInfo[]): void {
    const calendarEvents = events.map(e => ({
      date: e.date,
      content: this.config.eventName,
      description: this.generateDescription(e),
      market: this.config.market
    }));
    updateCalendarData(this.config.eventType, calendarEvents);
  }

  // 基类实现 - 刷新流程
  async refresh(): Promise<{ success: boolean; count: number; error?: string }> {
    const { content, format, success, error } = await this.fetchData();
    if (!success) return { success: false, count: 0, error };

    try {
      const events = this.parseData(content, format);
      if (events.length === 0) return { success: false, count: 0, error: '未解析到任何数据' };
      this.updateCalendar(events);
      return { success: true, count: events.length };
    } catch (e) {
      return { success: false, count: 0, error: (e as Error).message };
    }
  }

  // 辅助方法 - 获取当前年份
  protected getCurrentYear(): number {
    return new Date().getFullYear();
  }

  // 辅助方法 - 计算北京时间（根据夏令时）
  protected calculateBeijingTime(date: Date): string {
    return isDaylightSavingTime(date) ? '20:30' : '21:30';
  }

  // 辅助方法 - 获取中文月份名称
  protected getMonthNameCN(month: number): string {
    return MONTH_NAMES_CN[month];
  }

  // 辅助方法 - 解析英文月份名称
  protected parseMonthName(name: string): number {
    const MONTH_MAP: Record<string, number> = {
      'January': 0, 'February': 1, 'March': 2, 'April': 3,
      'May': 4, 'June': 5, 'July': 6, 'August': 7,
      'September': 8, 'October': 9, 'November': 10, 'December': 11,
      'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3,
      'Jun': 5, 'Jul': 6, 'Aug': 7,
      'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
    };
    return MONTH_MAP[name] ?? -1;
  }
}

// 导出辅助常量供子类使用
export { MONTH_NAMES_CN };