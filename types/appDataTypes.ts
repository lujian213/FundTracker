/**
 * types/appDataTypes.ts
 *
 * 应用数据类型定义
 */

import { CalendarEvent, CalendarData } from '../types';

export type { CalendarData };

/**
 * AppData - 内存中的统一数据结构
 * 注意：localStorage 存储时使用独立的 key，但内存中统一管理
 */
export interface AppData {
  calendar: CalendarData;
  investmentDrafts: InvestmentDrafts;
}

export interface InvestmentDrafts {
  [date: string]: Record<string, DraftEntry>;
}

export interface DraftEntry {
  fundSymbol: string;
  operation: '买入' | '卖出' | '不操作';
  amount: string;
  note: string;
}

export const DEFAULT_APP_DATA: AppData = {
  calendar: {},
  investmentDrafts: {},
};