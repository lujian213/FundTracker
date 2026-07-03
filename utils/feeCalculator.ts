import { TradeRecord } from '../types';

/**
 * 检查交易是否在指定日期的3个月以内
 */
function isWithinThreeMonths(tradeDate: string, currentDate: string): boolean {
  const current = new Date(currentDate);
  const trade = new Date(tradeDate);

  // 计算三个月前的日期
  const threeMonthsAgo = new Date(current);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  // 交易日期必须在三个月以内，且不超过当前日期
  return trade >= threeMonthsAgo && trade <= current;
}

/**
 * 查找精确匹配的历史交易记录
 * - 买入：查找3个月以内、交易总额相同的记录
 * - 卖出：查找3个月以内、份额相同的记录
 */
export function findExactMatchTrade(params: {
  historicalTrades: TradeRecord[];
  type: 'buy' | 'sell';
  currentDate: string;
  total?: number; // 买入时使用
  shares?: number; // 卖出时使用
}): TradeRecord | null {
  const { historicalTrades, type, currentDate, total, shares } = params;

  let latest: TradeRecord | null = null;

  for (const trade of historicalTrades) {
    // 交易类型必须相同
    if (trade.type !== type) continue;

    // 必须在3个月以内（已包含"不超过当前日期"的检查）
    if (!isWithinThreeMonths(trade.date, currentDate)) continue;

    // 检查匹配条件
    let matches = false;
    if (type === 'buy') {
      const tradeTotal = trade.shares * trade.price + trade.fee;
      // 允许0.02的误差（考虑到 JavaScript 浮点数精度问题）
      matches = Math.abs(tradeTotal - (total || 0)) <= 0.02;
    } else {
      // 卖出：比较份额
      matches = Math.abs(trade.shares - (shares || 0)) <= 0.02;
    }

    if (matches) {
      // 更新最新记录（日期最大的）
      if (!latest || trade.date > latest.date) {
        latest = trade;
      }
    }
  }

  return latest;
}

/**
 * 查找最近一条指定类型的交易记录（用于费率计算的兜底逻辑）
 */
export function findRecentTradeByType(
  trades: TradeRecord[],
  type: 'buy' | 'sell'
): TradeRecord | null {
  let recentTrade: TradeRecord | null = null;

  for (const trade of trades) {
    if (trade.type === type) {
      if (!recentTrade || trade.date > recentTrade.date) {
        recentTrade = trade;
      }
    }
  }

  return recentTrade;
}

/**
 * 计算历史交易的手续费率
 */
export function calculateFeeRate(trade: TradeRecord): number {
  if (trade.fee === 0) return 0;

  if (trade.type === 'buy') {
    // 买入：手续费率 = 手续费 / 交易总额（份额×价格 + 手续费）
    const totalAmount = trade.shares * trade.price + trade.fee;
    return totalAmount > 0 ? trade.fee / totalAmount : 0;
  } else {
    // 卖出：手续费率 = 手续费 / (价格 × 份额)
    const baseAmount = trade.price * trade.shares;
    return baseAmount > 0 ? trade.fee / baseAmount : 0;
  }
}

/**
 * 根据历史交易计算当前交易的手续费
 *
 * 计算策略：
 * 1. 首先查找3个月以内、金额/份额相同的记录，直接使用其手续费（避免计算误差）
 * 2. 如果找不到精确匹配，则使用费率计算（原逻辑）
 */
export function calculateFee(params: {
  historicalTrades: TradeRecord[];
  type: 'buy' | 'sell';
  currentDate: string; // 当前交易日期，用于判断3个月范围
  price: number;
  total?: number;
  shares?: number;
}): number {
  const { historicalTrades, type, currentDate, price, total, shares } = params;

  // 1. 尝试查找精确匹配的历史记录
  const exactMatch = findExactMatchTrade({
    historicalTrades,
    type,
    currentDate,
    total,
    shares,
  });

  // 2. 如果找到精确匹配，直接使用其手续费（无需计算）
  if (exactMatch) {
    return exactMatch.fee;
  }

  // 3. 没有精确匹配，使用原逻辑（费率计算）
  // 3.1 查找最近一条相同类型的交易
  const recentTrade = findRecentTradeByType(historicalTrades, type);

  // 3.2 如果没有历史记录，返回0
  if (!recentTrade) {
    return 0;
  }

  // 3.3 如果历史手续费为0，返回0
  if (recentTrade.fee === 0) {
    return 0;
  }

  // 3.4 计算手续费率
  const feeRate = calculateFeeRate(recentTrade);

  // 3.5 根据交易类型计算手续费
  let calculatedFee = 0;

  if (type === 'buy') {
    // 买入：手续费 = 交易总额 × 手续费率
    calculatedFee = (total || 0) * feeRate;
  } else {
    // 卖出：手续费 = 价格 × 份额 × 手续费率
    calculatedFee = price * (shares || 0) * feeRate;
  }

  // 3.6 保留两位小数
  return Math.round(calculatedFee * 100) / 100;
}