import { toLocalDateKey } from './priceResolver';

export const OVERALL_PROFIT_DATE_PRESETS = [
  { key: 'today', label: '今天' },
  { key: 'yesterday', label: '昨天' },
  { key: 'thisMonth', label: '本月' },
  { key: 'lastMonth', label: '上月' },
  { key: 'thisYear', label: '本年' },
  { key: 'lastYear', label: '去年' },
] as const;

export type OverallProfitDatePresetKey = typeof OVERALL_PROFIT_DATE_PRESETS[number]['key'];

export interface OverallProfitPresetRange {
  fromDate: string;
  toDate: string;
  wasClipped: boolean;
}

function endOfPreviousMonth(baseDate: Date): Date {
  return new Date(baseDate.getFullYear(), baseDate.getMonth(), 0);
}

function endOfMonthBeforePrevious(baseDate: Date): Date {
  return new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 0);
}

function endOfPreviousYear(baseDate: Date): Date {
  return new Date(baseDate.getFullYear(), 0, 0);
}

function endOfYearBeforePrevious(baseDate: Date): Date {
  return new Date(baseDate.getFullYear() - 1, 0, 0);
}

export function getOverallProfitPresetRange(
  preset: OverallProfitDatePresetKey,
  options?: {
    now?: Date;
    maxToDate?: string | null;
  },
): OverallProfitPresetRange {
  const baseDate = options?.now ? new Date(options.now) : new Date();

  let fromDate = '';
  let naturalToDate = '';

  switch (preset) {
    case 'today':
      // 日期1 = 前一天，日期2 = 今天
      const prevDay = new Date(baseDate);
      prevDay.setDate(prevDay.getDate() - 1);
      fromDate = toLocalDateKey(prevDay);
      naturalToDate = toLocalDateKey(baseDate);
      break;
    case 'yesterday':
      // 日期1 = 前天，日期2 = 昨天
      const twoDaysAgo = new Date(baseDate);
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      fromDate = toLocalDateKey(twoDaysAgo);
      const yesterday = new Date(baseDate);
      yesterday.setDate(yesterday.getDate() - 1);
      naturalToDate = toLocalDateKey(yesterday);
      break;
    case 'thisMonth':
      fromDate = toLocalDateKey(endOfPreviousMonth(baseDate));
      naturalToDate = toLocalDateKey(baseDate);
      break;
    case 'lastMonth':
      fromDate = toLocalDateKey(endOfMonthBeforePrevious(baseDate));
      naturalToDate = toLocalDateKey(endOfPreviousMonth(baseDate));
      break;
    case 'thisYear':
      fromDate = toLocalDateKey(endOfPreviousYear(baseDate));
      naturalToDate = toLocalDateKey(baseDate);
      break;
    case 'lastYear':
      fromDate = toLocalDateKey(endOfYearBeforePrevious(baseDate));
      naturalToDate = toLocalDateKey(endOfPreviousYear(baseDate));
      break;
    default:
      return { fromDate: '', toDate: '', wasClipped: false };
  }

  const clippedToDate = options?.maxToDate && naturalToDate > options.maxToDate
    ? options.maxToDate
    : naturalToDate;

  return {
    fromDate,
    toDate: clippedToDate,
    wasClipped: clippedToDate !== naturalToDate,
  };
}

