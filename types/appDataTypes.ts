/**
 * types/appDataTypes.ts
 *
 * 应用数据类型定义
 */

import { CalendarEvent, CalendarData, ComboTrade } from '../types';

export type { CalendarData };

/**
 * AppData - 内存中的统一数据结构
 * 注意：localStorage 存储时使用独立的 key，但内存中统一管理
 */
export interface AppData {
  calendar: CalendarData;
  investmentDrafts: InvestmentDrafts;
  comboTrades: ComboTrades;
}

export interface InvestmentDrafts {
  [date: string]: Record<string, DraftEntry>;
}

export interface DraftEntry {
  fundSymbol: string;
  operation: '买入' | '卖出' | '不操作';
  amount: string;
  note: string;
  // AI 建议相关字段（可选）
  aiReason?: string;
  aiScore?: number;
  // 数据失准告警状态（可选，默认 false）
  dataAlertEnabled?: boolean;
}

export interface ComboTrades {
  [id: string]: ComboTrade;
}

export const DEFAULT_APP_DATA: AppData = {
  calendar: {},
  investmentDrafts: {},
  comboTrades: {},
};