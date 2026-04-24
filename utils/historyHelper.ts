import { HistoricalPoint } from '../types';
import { toLocalDateKey } from './priceResolver';

/**
 * 获取前一交易日涨跌幅
 *
 * @param history 历史净值数据数组（按日期排序）
 * @param realtimeDate 估值日期（YYYY-MM-DD 格式）
 * @returns 前一交易日涨跌幅，无数据时返回 undefined
 */
export function getPreviousDayChange(
  history: HistoricalPoint[] | undefined,
  realtimeDate: string | undefined
): number | undefined {
  if (!history || history.length < 1) return undefined;

  if (!realtimeDate) {
    return history[history.length - 1]?.equityReturn;
  }

  const valuationIndex = history.findIndex(h => toLocalDateKey(h.date) === realtimeDate);

  if (valuationIndex > 0) {
    return history[valuationIndex - 1]?.equityReturn;
  }

  return history[history.length - 1]?.equityReturn;
}