import { TradeRecord, VolumeBar } from '../types';
import { toLocalDateKey } from './priceResolver';

/**
 * 交易聚合数据结构
 */
interface TradeAggregate {
  buyShares: number;
  sellShares: number;
  buyAmount: number;  // 买入金额（含手续费）= price * shares + fee
  sellAmount: number; // 卖出金额（减手续费）= price * shares - fee
  dividendAmount: number; // 分红金额
}

/**
 * 将交易记录按日期聚合为买入/卖出份额和金额
 * @internal
 */
function aggregateTradesToMap(trades: TradeRecord[]): Map<string, TradeAggregate> {
  const tradeMap = new Map<string, TradeAggregate>();
  for (const t of trades) {
    const dateKey = toLocalDateKey(t.date);
    if (!tradeMap.has(dateKey)) {
      tradeMap.set(dateKey, {
        buyShares: 0,
        sellShares: 0,
        buyAmount: 0,
        sellAmount: 0,
        dividendAmount: 0,
      });
    }

    const entry = tradeMap.get(dateKey)!;
    if (t.type === 'dividend') {
      // 分红：记录金额，不影响份额
      entry.dividendAmount += t.total || 0;
    } else if (t.type === 'buy') {
      entry.buyShares += t.shares;
      entry.buyAmount += t.price * t.shares + (t.fee || 0);
    } else { // sell
      entry.sellShares += t.shares;
      entry.sellAmount += t.price * t.shares - (t.fee || 0);
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
 * 计算每个日期的成本价
 * 公式：成本价 = (初始成本 + 累计买入金额 - 累计卖出金额 - 累计分红金额) ÷ 累计份额
 *
 * @param initialPosition 初始份额
 * @param initialPrice 初始价格（单价），null 时使用 0
 * @param startDate 建仓日期（YYYY-MM-DD），之前的日期返回 null（曲线不显示）
 * @param trades 交易记录数组
 * @param dates 日期列表（YYYY-MM-DD，升序排列）
 * @returns Map<日期, 成本价 | null>
 */
export function computeCostPricesByDate(
  initialPosition: number,
  initialPrice: number | null,
  startDate: string | null,
  trades: TradeRecord[],
  dates: string[]
): Map<string, number | null> {
  if (dates.length === 0) return new Map();

  const tradeMap = aggregateTradesToMap(trades);

  const result = new Map<string, number | null>();

  // 初始成本 = 初始份额 × 初始价格（和 computeAvgCostPrice 一致，null 时使用 0）
  const effectiveInitialPrice = initialPrice || 0;
  const initialCost = initialPosition * effectiveInitialPrice;

  // 累计变量
  let cumulativeShares = initialPosition;
  let cumulativeBuyAmount = 0;
  let cumulativeSellAmount = 0;
  let cumulativeDividendAmount = 0;  // 累计分红

  // 先累加 displayData 第一个日期之前的所有交易
  // startDate 用于决定曲线显示起点，不影响交易累加
  // 所有交易都应该计入成本价，不管它们的日期是否在 startDate 之前
  const firstDisplayDate = dates[0];
  for (const [tradeDate, trade] of tradeMap) {
    if (tradeDate < firstDisplayDate) {
      cumulativeShares += trade.buyShares - trade.sellShares;
      cumulativeBuyAmount += trade.buyAmount;
      cumulativeSellAmount += trade.sellAmount;
      cumulativeDividendAmount += trade.dividendAmount;  // 累加分红
    }
  }

  for (const date of dates) {
    // 处理当日交易（所有日期的交易都要累加，不管是否在 startDate 之前）
    const trade = tradeMap.get(date);
    if (trade) {
      cumulativeShares += trade.buyShares - trade.sellShares;
      cumulativeBuyAmount += trade.buyAmount;
      cumulativeSellAmount += trade.sellAmount;
      cumulativeDividendAmount += trade.dividendAmount;  // 累加分红
    }

    // 在 startDate 之前返回 null（曲线不显示），但交易已累加
    if (startDate && date < startDate) {
      result.set(date, null);
      continue;
    }

    // 累计份额 <= 0 时返回 null（已清仓）
    if (cumulativeShares <= 0) {
      result.set(date, null);
      continue;
    }

    // 计算成本价（分红减少成本）
    const totalCost = initialCost + cumulativeBuyAmount - cumulativeSellAmount - cumulativeDividendAmount;
    const costPrice = totalCost / cumulativeShares;

    result.set(date, costPrice);
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