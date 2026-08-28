import { HistoricalPoint, ValuationData, TradeType } from '../types';
import { toLocalDateKey } from './priceResolver';

/**
 * 查找下一个有效交易日
 * @param history 历史净值数据（已按日期升序排列）
 * @param currentDate 当前交易日 (YYYY-MM-DD)
 * @param valuation 估值数据（可选，用于fallback）
 * @returns 下一个有效交易日的日期和净值，或 null
 */
export function findNextValidTradeDate(
  history: HistoricalPoint[],
  currentDate: string,
  valuation?: ValuationData
): { date: string; netValue: number } | null {
  if (!history || history.length === 0) return null;

  // 查找历史中 date > currentDate 的第一个日期
  for (const point of history) {
    const pointDate = toLocalDateKey(point.date);
    if (pointDate > currentDate) {
      return { date: pointDate, netValue: point.value };
    }
  }

  // 历史中找不到，检查估值
  if (valuation) {
    const valuationDate = valuation.valuationDate?.split(' ')[0] || valuation.realtimeDate;
    if (valuationDate && valuationDate > currentDate && valuation.currentPrice) {
      return { date: valuationDate, netValue: valuation.currentPrice };
    }
  }

  return null;
}

/**
 * 计算单笔交易盈亏
 * @param trade 交易信息
 * @param currentNav 当前交易日净值
 * @param nextValidDate 下一个有效交易日（日期和净值），或 null
 * @returns 盈亏金额，或 null（无法计算或分红交易）
 */
export function calculateTradeEffect(
  trade: { type: TradeType; shares: number; fee: number },
  currentNav: number,
  nextValidDate: { date: string; netValue: number } | null
): number | null {
  if (!nextValidDate) return null;

  // 分红交易不影响份额，不产生盈亏效果
  if (trade.type === 'dividend') return null;

  // 净交易份额：买入为正，卖出为负
  const netShares = trade.type === 'buy' ? trade.shares : -trade.shares;

  // 盈亏 = (下日净值 - 当日净值) * 净交易份额 - 手续费
  const effect = (nextValidDate.netValue - currentNav) * netShares - trade.fee;

  return effect;
}

/**
 * 计算当日交易汇总盈亏
 * @param tradesWithNav 交易及其净值信息数组
 * @returns 汇总盈亏金额，或 null（全部无法计算）
 */
export function calculateDateTradeEffect(
  tradesWithNav: Array<{
    trade: { type: TradeType; shares: number; fee: number };
    currentNav: number;
    nextValidDate: { date: string; netValue: number } | null;
  }>
): number | null {
  let sum = 0;
  let hasValidEffect = false;

  for (const item of tradesWithNav) {
    const effect = calculateTradeEffect(item.trade, item.currentNav, item.nextValidDate);
    if (effect !== null) {
      sum += effect;
      hasValidEffect = true;
    }
  }

  return hasValidEffect ? sum : null;
}