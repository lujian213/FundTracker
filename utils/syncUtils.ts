import { TradeRecord, TradeType } from '../types';
import { EggfundTradeRecord } from '../types/syncTypes';

/**
 * 将 eggfund 的交易记录转换为 FundTracker 内部的 TradeRecord 格式
 */
export function transformEggfundData(externalData: EggfundTradeRecord[], fundCode: string): TradeRecord[] {
  return externalData
    .filter(record => record.code === fundCode) // 确保只处理指定基金的记录
    .map(record => {
      // 根据 share 的正负值确定交易类型
      const type: TradeType = record.share >= 0 ? 'buy' : 'sell';

      // 取绝对值作为份额
      const shares = Math.abs(record.share);

      return {
        id: record.id,                    // 使用 eggfund 提供的唯一ID
        date: record.day,                 // 交易日期
        type,                            // 交易类型 (buy/sell)
        shares,                          // 交易份额
        price: record.unitPrice,          // 交易价格
        fee: record.fee || 0,             // 交易手续费，默认为0
      };
    });
}

/**
 * 计算按日期和基金分组的交易汇总信息
 */
export function calculateDateTradeGroup(trades: TradeRecord[], fundCode: string) {
  if (trades.length === 0) {
    return null;
  }

  // 假设同一组的交易都发生在同一天且属于同一基金
  const date = trades[0].date;
  const netShares = trades.reduce((sum, trade) => {
    return trade.type === 'buy' ? sum + trade.shares : sum - trade.shares;
  }, 0);

  const netDirection: 'buy' | 'sell' | 'hold' = netShares > 0 ? 'buy' : netShares < 0 ? 'sell' : 'hold';

  const totalFees = trades.reduce((sum, trade) => sum + trade.fee, 0);

  return {
    date,
    symbol: fundCode, // 使用传入的基金代码参数
    netDirection,
    netShares: Math.abs(netShares),
    totalFees,
    trades
  };
}