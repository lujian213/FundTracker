import { toLocalDateKey } from './priceResolver';

export const OVERALL_PROFIT_DATE_PRESETS = [
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

