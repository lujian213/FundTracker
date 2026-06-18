import { TradeRecord } from '../types';

/**
 * 查找最近一条指定类型的交易记录
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
 */
export function calculateFee(params: {
  historicalTrades: TradeRecord[];
  type: 'buy' | 'sell';
  price: number;
  total?: number;
  shares?: number;
}): number {
  const { historicalTrades, type, price, total, shares } = params;

  // 1. 查找最近一条相同类型的交易
  const recentTrade = findRecentTradeByType(historicalTrades, type);

  // 2. 如果没有历史记录，返回0
  if (!recentTrade) {
    return 0;
  }

  // 3. 如果历史手续费为0，返回0
  if (recentTrade.fee === 0) {
    return 0;
  }

  // 4. 计算手续费率
  const feeRate = calculateFeeRate(recentTrade);

  // 5. 根据交易类型计算手续费
  let calculatedFee = 0;

  if (type === 'buy') {
    // 买入：手续费 = 交易总额 × 手续费率
    calculatedFee = (total || 0) * feeRate;
  } else {
    // 卖出：手续费 = 价格 × 份额 × 手续费率
    calculatedFee = price * (shares || 0) * feeRate;
  }

  // 6. 保留两位小数
  return Math.round(calculatedFee * 100) / 100;
}