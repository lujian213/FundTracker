import { computeMultipleSMAs } from './movingAverage';
import { MA_WINDOWS } from './maConfig';
import { computeRiskRating, RiskResult } from './riskTooltip';
import { ValuationData } from '../types';

type HistPoint = { date: number; value: number; equityReturn: number };

export function computeRatingFromHistory(history: HistPoint[], data?: ValuationData): RiskResult {
  // Build values array from history; if realtime data is available and newer than last history point,
  // append the currentPrice so SMA/MA calculations include today's realtime valuation — same logic used in UI.
  let values: number[] = [];

  if (history && history.length > 0) {
    values = history.map(h => h.value);

    if (data) {
      const dateStr = data.realtimeDate && data.realtimeDate !== '---' ? data.realtimeDate : new Date().toISOString().split('T')[0];
      const valuationTs = new Date(dateStr + ' 15:00').getTime();
      const lastHistDate = history[history.length - 1].date;
      if (!isNaN(valuationTs) && valuationTs > lastHistDate) {
        values = [...values, data.currentPrice];
      }
    }
  } else if (data) {
    // fallback when no history: include previousPrice and currentPrice so MA windows can be computed minimally
    values = [data.previousPrice, data.currentPrice];
  }

  if (values.length === 0) {
    // Default fallback: return a cautious rating
    return { rating: '谨慎', color: '#f59e0b', action: '观望', reasons: ['数据不足或均线关系不明确，建议观望'] };
  }

  const ma = computeMultipleSMAs(values, MA_WINDOWS);
  const idx = values.length - 1;
  const price = data ? data.currentPrice : values[idx];
  const prevIndex = Math.max(0, idx - 1);

  try {
    return computeRiskRating({ price, maValues: ma, index: idx, prevIndex });
  } catch (e) {
    return { rating: '谨慎', color: '#f59e0b', action: '观望', reasons: ['数据不足或均线关系不明确，建议观望'] };
  }
}

