import { TOLERANCE } from './maConfig';

export type Rating = '危险' | '谨慎' | '安全' | '机会';

export interface RiskResult {
  rating: Rating;
  color: string;
  action?: string;
  reasons: string[];
}

interface ComputeParams {
  price: number;
  maValues: Record<number, (number | null)[]>; // keyed by window size, e.g. 5,10,20
  index: number; // current index in the arrays
  prevIndex?: number; // previous index (optional)
}

export function computeRiskRating({ price, maValues, index, prevIndex }: ComputeParams): RiskResult {
  const getVal = (arr: (number | null)[] | undefined, idx: number) => (arr && arr[idx] !== null) ? (arr[idx] as number) : null;

  const sma5 = getVal(maValues[5], index);
  const sma10 = getVal(maValues[10], index);
  const sma20 = getVal(maValues[20], index);

  const pIdx = (typeof prevIndex === 'number') ? prevIndex : Math.max(0, index - 1);
  const prev_sma5 = getVal(maValues[5], pIdx);
  const prev_sma10 = getVal(maValues[10], pIdx);

  const reasons: string[] = [];
  let rating: Rating = '谨慎';
  let color = '#f59e0b';
  let action = '观望';

  // Pre-detect crosses so they are included in the tooltip regardless of later early returns
  const isGoldenCross = prev_sma5 !== null && prev_sma10 !== null && prev_sma5 <= prev_sma10 && sma5 !== null && sma10 !== null && sma5 > sma10 && (sma20 !== null && sma5 > sma10 && sma10 > sma20);
  const isDeathCross = prev_sma5 !== null && prev_sma10 !== null && prev_sma5 >= prev_sma10 && sma5 !== null && sma10 !== null && sma5 < sma10 && (sma20 !== null && sma5 < sma10 && sma10 < sma20);

  if (isGoldenCross) {
    reasons.push('最近发生 5 日均线向上突破 10 日均线（黄金交叉）');
  }
  if (isDeathCross) {
    reasons.push('最近发生 5 日均线向下跌破 10 日均线（死亡交叉）');
  }

  // If we have sma20 and price broke below it -> danger (keep cross reason present)
  if (sma20 !== null && price < sma20) {
    rating = '危险';
    color = '#ef4444';
    action = '撤离';
    reasons.push(`当前价格 ${price.toFixed(4)} 已跌破 20 日均线 (${sma20.toFixed(4)})，进入阶段性风险期`);
    return { rating, color, action, reasons };
  }

  // bullish case when sma5 > sma10
  if (sma5 !== null && sma10 !== null && sma5 > sma10) {
    reasons.push('5 日均线位于 10 日均线之上，表明短期上升趋势');

    // If golden cross was detected earlier, we already pushed its reason.
    if (isGoldenCross) {
      // if price hasn't broken 5-day
      if (price >= (sma5 * TOLERANCE)) {
        rating = '机会'; color = '#3b82f6'; action = '进场';
        reasons.push('股价回踩触及 5 日均线但未跌破，短期可作为入场机会');
        return { rating, color, action, reasons };
      } else {
        rating = '安全'; color = '#10b981'; action = '进场';
        reasons.push('黄金交叉后走势稳健，建议关注回踩机会');
        return { rating, color, action, reasons };
      }
    }

    // No recent golden cross, but still sma5 > sma10
    if (price >= (sma5 * TOLERANCE)) {
      rating = '机会'; color = '#3b82f6'; action = '进场';
      reasons.push('股价回踩触及 5 日均线但未跌破，短期可考虑入场');
      return { rating, color, action, reasons };
    }

    rating = '安全'; color = '#10b981'; action = '进场';
    reasons.push('5 日均线上行，处于相对安全的上升趋势');
    return { rating, color, action, reasons };
  }

  // bearish or cross-down scenario
  if (sma5 !== null && sma10 !== null && sma5 <= sma10) {
    reasons.push('5 日均线位于或下穿 10 日均线，短期弱势');

    // If death cross detected earlier, reason was already pushed.
    if (sma10 !== null && price < sma10) {
      reasons.push(`当前价格 ${price.toFixed(4)} 已跌破 10 日均线 (${sma10.toFixed(4)})，短线风险增加`);
      rating = '谨慎'; color = '#f59e0b'; action = '观望';
      return { rating, color, action, reasons };
    }

    rating = '谨慎'; color = '#f59e0b'; action = '观望';
    return { rating, color, action, reasons };
  }

  // Default fallback
  reasons.push('数据不足或均线关系不明确，建议观望');
  rating = '谨慎'; color = '#f59e0b'; action = '观望';
  return { rating, color, action, reasons };
}
