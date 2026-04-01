import { TradeRecord, VolumeBar } from '../types';
import { toLocalDateKey } from './priceResolver';

/**
 * 将交易记录按日期聚合为买入/卖出份额
 * @internal
 */
function aggregateTradesToMap(trades: TradeRecord[]): Map<string, { buyShares: number; sellShares: number }> {
  const tradeMap = new Map<string, { buyShares: number; sellShares: number }>();
  for (const t of trades) {
    const dateKey = toLocalDateKey(t.date);
    if (!tradeMap.has(dateKey)) {
      tradeMap.set(dateKey, { buyShares: 0, sellShares: 0 });
    }
    const entry = tradeMap.get(dateKey)!;
    if (t.type === 'buy') {
      entry.buyShares += t.shares;
    } else {
      entry.sellShares += t.shares;
    }
  }
  return tradeMap;
}

/**
 * 计算每个日期的持仓份额（累积）
 *
 * @param initialShares 初始份额
 * @param trades 交易记录数组
 * @param dates 日期列表（YYYY-MM-DD，升序排列）
 * @returns Map<日期, 持仓份额>
 */
export function computePositionSharesByDate(
  initialShares: number,
  trades: TradeRecord[],
  dates: string[]
): Map<string, number> {
  if (dates.length === 0) return new Map();

  const tradeMap = aggregateTradesToMap(trades);

  const result = new Map<string, number>();
  let cumulative = initialShares;

  for (const date of dates) {
    const trade = tradeMap.get(date);
    if (trade) {
      cumulative += trade.buyShares - trade.sellShares;
    }
    result.set(date, cumulative);
  }

  return result;
}

/**
 * 准备交易量柱状图数据
 *
 * @param trades 交易记录数组
 * @param dateToX 日期到 SVG X 坐标的映射
 * @returns VolumeBar 数组（仅包含有交易的日期），并包含 maxBarShares
 */
export function prepareVolumeBars(
  trades: TradeRecord[],
  dateToX: Map<string, number>
): { bars: VolumeBar[]; maxBarShares: number } {
  if (trades.length === 0 || dateToX.size === 0) return { bars: [], maxBarShares: 1 };

  const tradeMap = aggregateTradesToMap(trades);

  const bars: VolumeBar[] = [];
  let maxBarShares = 1;

  for (const [date, { buyShares, sellShares }] of tradeMap) {
    const x = dateToX.get(date);
    if (x === undefined) continue;

    const netShares = buyShares - sellShares;
    if (netShares === 0) continue;

    const shares = Math.abs(netShares);
    bars.push({
      date,
      x,
      type: netShares > 0 ? 'buy' : 'sell',
      shares,
    });
    if (shares > maxBarShares) maxBarShares = shares;
  }

  bars.sort((a, b) => a.date.localeCompare(b.date));

  return { bars, maxBarShares };
}