import { HistoricalPoint, ValuationData } from '../types';
import { MA_WINDOWS, TOLERANCE } from './maConfig';
import { computeMultipleSMAs } from './movingAverage';
import { toLocalDateKey } from './priceResolver';

export type RiskBadge = '机会' | '偏多' | '观望' | '风险';

export interface RiskResult {
  rating: RiskBadge;
  color: string;
  action: string;
  summary: string;
  opportunitySignals: string[];
  riskSignals: string[];
  notes: string[];
  reasons: string[];
}

export interface AnalyzeFundRiskParams {
  price: number;
  values: number[];
  maValues?: Record<number, (number | null)[]>;
  index?: number;
  prevIndex?: number;
}

type WeightedSignal = { text: string; weight: number };

type HistPoint = Pick<HistoricalPoint, 'date' | 'value' | 'equityReturn'>;

const FALLBACK_MESSAGE = '历史数据不足，暂时只能进行有限的均线风险分析，建议继续观察。';

export function buildFallbackRiskResult(message = FALLBACK_MESSAGE): RiskResult {
  return {
    rating: '观望',
    color: '#f59e0b',
    action: '等待确认',
    summary: '当前可用信号不足，先观察后续均线与价格关系是否进一步明朗。',
    opportunitySignals: [],
    riskSignals: [],
    notes: [message],
    reasons: [message],
  };
}

function addSignal(target: WeightedSignal[], text: string, weight: number) {
  if (!text || target.some(item => item.text === text)) return;
  target.push({ text, weight });
}

function getVal(arr: (number | null)[] | undefined, idx: number) {
  return arr && idx >= 0 && arr[idx] !== null && arr[idx] !== undefined ? (arr[idx] as number) : null;
}

function isUp(curr: number | null, prev: number | null) {
  return curr !== null && prev !== null && curr > prev;
}

function isDown(curr: number | null, prev: number | null) {
  return curr !== null && prev !== null && curr < prev;
}

function isFlatOrDown(curr: number | null, prev: number | null) {
  return curr !== null && prev !== null && curr <= prev;
}

function localDateKey(ts: number) {
  return toLocalDateKey(ts);
}

function resolveValuationDateKey(data?: ValuationData) {
  if (!data) return null;
  if (data.realtimeDate && data.realtimeDate !== '---') return data.realtimeDate;
  if (data.lastUpdated) {
    const match = data.lastUpdated.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  return null;
}

function toSortedTexts(signals: WeightedSignal[]) {
  return [...signals].sort((a, b) => b.weight - a.weight).map(item => item.text);
}

function buildSummary(opportunityScore: number, riskScore: number, hasSevereRisk: boolean, hasStrongOpportunity: boolean): Pick<RiskResult, 'rating' | 'color' | 'action' | 'summary'> {
  if (hasSevereRisk || riskScore >= 7) {
    return {
      rating: '风险',
      color: '#ef4444',
      action: '控制仓位',
      summary: '中短期走弱信号占优，宜优先防守，等待趋势重新修复。',
    };
  }

  if (hasStrongOpportunity && riskScore <= 2) {
    return {
      rating: '机会',
      color: '#3b82f6',
      action: '关注低吸',
      summary: '多头结构与支撑信号形成共振，可重点跟踪回踩确认后的机会。',
    };
  }

  if (opportunityScore > riskScore) {
    return {
      rating: '偏多',
      color: '#10b981',
      action: '顺势跟踪',
      summary: '当前偏多信号略占优势，但仍需留意短线回撤与假突破。',
    };
  }

  return {
    rating: '观望',
    color: '#f59e0b',
    action: '等待确认',
    summary: '机会与风险信号交织，先等待更明确的方向确认更稳妥。',
  };
}

export function buildRiskSeriesFromHistory(history: HistPoint[] = [], data?: ValuationData): number[] {
  const points = Array.isArray(history) ? history : [];
  const values = points
    .map(point => Number(point.value))
    .filter(value => Number.isFinite(value) && value > 0);

  const currentPrice = Number(data?.currentPrice);
  const previousPrice = Number(data?.previousPrice);

  if (values.length === 0) {
    const fallbackValues: number[] = [];
    if (Number.isFinite(previousPrice) && previousPrice > 0) fallbackValues.push(previousPrice);
    if (Number.isFinite(currentPrice) && currentPrice > 0) fallbackValues.push(currentPrice);
    return fallbackValues;
  }

  if (!data || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    return values;
  }

  const valuationDateKey = resolveValuationDateKey(data);
  const lastHistoryPoint = points[points.length - 1];
  if (!lastHistoryPoint) {
    return values[values.length - 1] === currentPrice ? values : [...values, currentPrice];
  }

  if (!valuationDateKey) {
    return values[values.length - 1] === currentPrice ? values : [...values, currentPrice];
  }

  const lastHistoryDateKey = localDateKey(lastHistoryPoint.date);
  if (lastHistoryDateKey === valuationDateKey) {
    return [...values.slice(0, -1), currentPrice];
  }

  const valuationTs = new Date(`${valuationDateKey}T15:00:00`).getTime();
  if (Number.isFinite(valuationTs) && valuationTs > lastHistoryPoint.date) {
    return [...values, currentPrice];
  }

  return values;
}

export function analyzeFundRisk({ price, values, maValues, index, prevIndex }: AnalyzeFundRiskParams): RiskResult {
  const cleanValues = Array.isArray(values)
    ? values.map(value => Number(value)).filter(value => Number.isFinite(value) && value > 0)
    : [];

  if (cleanValues.length === 0 || !Number.isFinite(price) || price <= 0) {
    return buildFallbackRiskResult();
  }

  const ma = maValues ?? computeMultipleSMAs(cleanValues, MA_WINDOWS);
  const idx = typeof index === 'number' ? index : cleanValues.length - 1;
  if (idx < 0 || idx >= cleanValues.length) {
    return buildFallbackRiskResult();
  }

  const pIdx = typeof prevIndex === 'number' ? prevIndex : idx - 1;
  const ppIdx = pIdx - 1;

  const currentPrice = Number.isFinite(price) && price > 0 ? price : cleanValues[idx];
  const prevPrice = pIdx >= 0 ? cleanValues[pIdx] : null;

  const sma5 = getVal(ma[5], idx);
  const sma10 = getVal(ma[10], idx);
  const sma20 = getVal(ma[20], idx);
  const prevSma5 = getVal(ma[5], pIdx);
  const prevSma10 = getVal(ma[10], pIdx);
  const prevSma20 = getVal(ma[20], pIdx);
  const prevPrevSma5 = getVal(ma[5], ppIdx);
  const prevPrevSma10 = getVal(ma[10], ppIdx);

  const opportunitySignals: WeightedSignal[] = [];
  const riskSignals: WeightedSignal[] = [];
  const notes: string[] = [];

  const missingWindows = MA_WINDOWS.filter(window => getVal(ma[window], idx) === null);
  if (missingWindows.length > 0) {
    notes.push(`历史数据不足，${missingWindows.map(window => `MA${window}`).join(' / ')} 暂不可用。`);
  }

  const goldenCross = prevSma5 !== null && prevSma10 !== null && sma5 !== null && sma10 !== null && prevSma5 <= prevSma10 && sma5 > sma10 && currentPrice >= sma5;
  const deathCross = prevSma5 !== null && prevSma10 !== null && sma5 !== null && sma10 !== null && prevSma5 >= prevSma10 && sma5 < sma10;

  if (goldenCross) {
    addSignal(opportunitySignals, 'MA5 上穿 MA10，且当前价格位于 MA5 上方，出现短线金叉买点。', 3);
  }

  if (deathCross) {
    addSignal(riskSignals, 'MA5 下穿 MA10，短线趋势转弱，出现死叉风险。', 3);
  }

  if (sma5 !== null && prevSma5 !== null && prevPrice !== null && prevPrice > prevSma5 && currentPrice > sma5 && isUp(sma5, prevSma5)) {
    addSignal(opportunitySignals, '价格已连续 2 日站稳 MA5 上方，且 MA5 向上，短线强势延续。', 2);
  }

  if (sma5 !== null && prevSma5 !== null && isUp(sma5, prevSma5) && currentPrice >= sma5 * TOLERANCE && currentPrice <= sma5 * 1.01) {
    addSignal(opportunitySignals, '价格回踩 MA5 附近但未失守，短线支撑仍在。', 1);
  }

  if (sma5 !== null && currentPrice < sma5) {
    addSignal(riskSignals, `当前价格 ${currentPrice.toFixed(4)} 已跌破 MA5（${sma5.toFixed(4)}），短线需防回撤。`, 2);
  }

  if (sma5 !== null && prevSma5 !== null && isFlatOrDown(sma5, prevSma5)) {
    addSignal(riskSignals, 'MA5 走平或拐头向下，短线动能正在减弱。', 1);
  }

  if (sma5 !== null && (currentPrice / sma5) - 1 >= 0.07) {
    addSignal(riskSignals, `当前价格相对 MA5 偏离已超过 7%，短线追高风险升温。`, 1);
  }

  if (sma10 !== null && prevSma10 !== null && isUp(sma10, prevSma10) && currentPrice >= sma10 * TOLERANCE && currentPrice <= sma10 * 1.01) {
    addSignal(opportunitySignals, '价格回踩 MA10 附近后仍守住支撑，短线生命线有效。', 2);
  }

  if (sma5 !== null && sma10 !== null && sma20 !== null && currentPrice >= sma20 && sma5 > sma10 && sma10 > sma20 && isUp(sma5, prevSma5) && isUp(sma10, prevSma10) && isUp(sma20, prevSma20)) {
    addSignal(opportunitySignals, 'MA5 > MA10 > MA20 且三线同步向上，均线多头排列健康。', 3);
  }

  if (prevPrevSma5 !== null && prevPrevSma10 !== null && prevSma5 !== null && prevSma10 !== null && sma5 !== null && sma10 !== null) {
    const prevPrevSpread = prevPrevSma5 - prevPrevSma10;
    const prevSpread = prevSma5 - prevSma10;
    const currentSpread = sma5 - sma10;
    if (prevPrevSpread > 0 && prevSpread > 0 && currentSpread > 0 && prevSpread <= prevPrevSpread && currentSpread > prevSpread) {
      addSignal(opportunitySignals, 'MA5 接近 MA10 后重新向上发散，出现“拒绝死叉”的再度走强迹象。', 1);
    }
  }

  if (sma10 !== null && prevSma10 !== null && prevPrice !== null && prevPrice < prevSma10 && currentPrice < sma10) {
    addSignal(riskSignals, `价格已连续 2 日收在 MA10 下方，短线波段强度明显走弱。`, 3);
  } else if (sma10 !== null && prevPrice !== null && ((currentPrice - prevPrice) / prevPrice) <= -0.03 && currentPrice < sma10) {
    addSignal(riskSignals, `单日跌幅超过 3% 且击穿 MA10，波段风险快速放大。`, 2);
  }

  if (sma20 !== null && prevSma20 !== null && currentPrice >= sma20 && isUp(sma20, prevSma20)) {
    addSignal(opportunitySignals, '价格运行在 MA20 上方，且 MA20 继续向上，中期趋势仍偏多。', 2);
  }

  if (sma20 !== null && prevSma20 !== null && currentPrice >= sma20 * TOLERANCE && currentPrice <= sma20 * 1.015 && sma5 !== null && sma10 !== null && sma5 > sma10 && sma10 > sma20) {
    addSignal(opportunitySignals, '多头趋势中首次回踩 MA20 附近，存在中线观察型加仓机会。', 2);
  }

  if (sma5 !== null && sma10 !== null && sma20 !== null && prevSma10 !== null && prevSma20 !== null && prevSma10 <= prevSma20 && sma5 > sma10 && sma5 > sma20 && sma10 > sma20) {
    addSignal(opportunitySignals, 'MA5 与 MA10/MA20 形成向上突破，银山谷雏形开始显现。', 3);
  }

  if (sma20 !== null && prevSma20 !== null && prevPrice !== null && prevSma20 !== null && currentPrice < sma20 && prevPrice < prevSma20) {
    addSignal(riskSignals, `价格已连续 2 日位于 MA20 下方，中期趋势有转弱迹象。`, 4);
  } else if (sma20 !== null && currentPrice < sma20) {
    addSignal(riskSignals, `当前价格 ${currentPrice.toFixed(4)} 已跌破 MA20（${sma20.toFixed(4)}），中期风险抬升。`, 3);
  }

  if (sma20 !== null && prevSma20 !== null && isFlatOrDown(sma20, prevSma20)) {
    addSignal(riskSignals, 'MA20 走平或拐头向下，中期趋势正在走弱。', 2);
  }

  if (sma5 !== null && sma10 !== null && sma20 !== null && sma5 < sma10 && sma10 < sma20 && isDown(sma5, prevSma5) && isDown(sma10, prevSma10) && isDown(sma20, prevSma20)) {
    addSignal(riskSignals, 'MA5 < MA10 < MA20 且三线同步向下，已进入空头排列区。', 4);
  }

  if (deathCross && sma20 !== null && currentPrice < sma20 && prevSma20 !== null && isFlatOrDown(sma20, prevSma20)) {
    addSignal(riskSignals, 'MA5 下穿 MA10、价格跌破 MA20 且 MA20 走弱，出现趋势终结型共振卖点。', 5);
  }

  if (goldenCross && sma20 !== null && currentPrice > sma20 && prevSma20 !== null && isUp(sma20, prevSma20)) {
    addSignal(opportunitySignals, 'MA5 上穿 MA10、价格站上 MA20 且 MA20 向上，形成偏强共振买点。', 4);
  }

  if (opportunitySignals.length === 0 && riskSignals.length === 0) {
    notes.push('当前价格与均线关系尚未形成明确共振信号。');
  }

  notes.push('本次自动分析仅基于价格与 MA5 / MA10 / MA20 关系，不包含成交量、RSI 与盘中形态。');

  const sortedOpportunitySignals = toSortedTexts(opportunitySignals);
  const sortedRiskSignals = toSortedTexts(riskSignals);
  const opportunityScore = opportunitySignals.reduce((sum, signal) => sum + signal.weight, 0);
  const riskScore = riskSignals.reduce((sum, signal) => sum + signal.weight, 0);
  const hasSevereRisk = riskSignals.some(signal => signal.weight >= 4);
  const hasStrongOpportunity = opportunitySignals.some(signal => signal.weight >= 4) || opportunityScore >= 6;
  const summary = buildSummary(opportunityScore, riskScore, hasSevereRisk, hasStrongOpportunity);
  const reasons = [...sortedOpportunitySignals, ...sortedRiskSignals, ...notes];

  return {
    ...summary,
    opportunitySignals: sortedOpportunitySignals,
    riskSignals: sortedRiskSignals,
    notes,
    reasons,
  };
}

export function computeRiskFromHistory(history: HistPoint[] = [], data?: ValuationData): RiskResult {
  const values = buildRiskSeriesFromHistory(history, data);
  if (values.length === 0) {
    return buildFallbackRiskResult();
  }

  const maValues = computeMultipleSMAs(values, MA_WINDOWS);
  const index = values.length - 1;
  const price = Number.isFinite(Number(data?.currentPrice)) && Number(data?.currentPrice) > 0
    ? Number(data?.currentPrice)
    : values[index];

  return analyzeFundRisk({
    price,
    values,
    maValues,
    index,
    prevIndex: index - 1,
  });
}
