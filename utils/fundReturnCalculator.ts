/**
 * 计算单个基金的年化收益率
 *
 * 使用现金流方法计算，与基金详情页的累计收益率计算逻辑一致
 */

import { buildCashFlows, computeSimpleAnnualizedReturn } from './xirrHelper';
import { TradeRecord } from '../types';

/**
 * 计算单个基金年化收益率的参数
 */
export interface CalculateFundAnnualizedReturnParams {
  /** 初始份额 */
  initialPosition: number;
  /** 初始价格 */
  initialPrice: number;
  /** 建仓日期 (YYYY-MM-DD) */
  startDate: string;
  /** 交易记录 */
  trades: TradeRecord[];
  /** 当前份额 */
  currentShares: number;
  /** 当前净值 */
  currentPrice: number;
  /** 当前日期 (YYYY-MM-DD) */
  currentDate: string;
}

/**
 * 计算单个基金的年化收益率
 *
 * @param params 计算参数
 * @returns 年化收益率百分比，如果无法计算则返回 null
 */
export function calculateFundAnnualizedReturn(
  params: CalculateFundAnnualizedReturnParams
): number | null {
  const {
    initialPosition,
    initialPrice,
    startDate,
    trades,
    currentShares,
    currentPrice,
    currentDate
  } = params;

  // 构建现金流
  const cashFlows = buildCashFlows({
    initialPosition,
    initialPrice,
    startDate,
    trades,
    currentShares,
    currentPrice,
    currentDate
  });

  // 现金流少于 2 笔，无法计算
  if (!cashFlows || cashFlows.length < 2) {
    return null;
  }

  // 计算年化收益率
  return computeSimpleAnnualizedReturn(cashFlows);
}