// utils/smartFundCalculator.ts

import { FundPosition, TradeRecord } from '../types';
import { OcrFundData } from './fundOcrParser';

export interface PositionCalcResult {
  success: boolean;
  operationType: 'add' | 'update';
  newPosition: FundPosition;
  previousPosition?: FundPosition;
  error?: string;
}

/**
 * 计算新的仓位配置
 *
 * @param ocrData OCR 识别的基金数据
 * @param existingPosition 现有持仓配置（null 表示新基金）
 * @param trades 该基金的交易记录
 * @returns PositionCalcResult
 */
export function calculateNewPosition(
  ocrData: OcrFundData,
  existingPosition: FundPosition | null,
  trades: TradeRecord[]
): PositionCalcResult {
  const isNewFund = !existingPosition || existingPosition.fullCapacity === 0;

  let newStartDate: string | null;
  if (existingPosition?.startDate) {
    newStartDate = existingPosition.startDate;
  } else if (trades.length > 0) {
    newStartDate = getEarliestTradeDate(trades);
  } else {
    newStartDate = ocrData.navDate;
  }

  let newFullCapacity: number;
  if (isNewFund) {
    const rawValue = ocrData.shares * 2;
    newFullCapacity = Math.round(rawValue / 1000) * 1000;
  } else {
    newFullCapacity = existingPosition!.fullCapacity;
  }

  let newInitialPosition: number;
  if (isNewFund) {
    newInitialPosition = ocrData.shares;
  } else {
    const { buyShares, sellShares } = sumTradesBetween(trades, newStartDate!, ocrData.navDate);
    newInitialPosition = ocrData.shares - buyShares + sellShares;

    if (newInitialPosition < 0) {
      return {
        success: false,
        operationType: 'update',
        newPosition: existingPosition!,
        previousPosition: existingPosition,
        error: `识别的持有份额(${ocrData.shares})与历史交易记录不一致，无法计算出合理的初始持仓`,
      };
    }
  }

  const { buyAmount, sellAmount } = sumTradeAmounts(trades, ocrData.navDate);

  let newInitialPrice: number | null;
  if (newInitialPosition === 0) {
    newInitialPrice = null;
  } else {
    newInitialPrice = (
      (ocrData.shares * ocrData.nav) + sellAmount - buyAmount - ocrData.accumulatedProfit
    ) / newInitialPosition;
  }

  return {
    success: true,
    operationType: isNewFund ? 'add' : 'update',
    newPosition: {
      fullCapacity: newFullCapacity,
      initialPosition: Math.round(newInitialPosition * 100) / 100,
      startDate: newStartDate,
      initialPrice: newInitialPrice !== null ? Math.round(newInitialPrice * 10000) / 10000 : null,
    },
    previousPosition: existingPosition ?? undefined,
  };
}

/**
 * 获取最早交易日期
 */
function getEarliestTradeDate(trades: TradeRecord[]): string | null {
  if (trades.length === 0) return null;
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  return sorted[0].date;
}

/**
 * 统计 startDate 到 navDate 前一天的交易份额
 * startDate <= trade.date < navDate（不含 navDate 当天）
 */
function sumTradesBetween(
  trades: TradeRecord[],
  startDate: string,
  navDate: string
): { buyShares: number; sellShares: number } {
  let buyShares = 0;
  let sellShares = 0;

  for (const t of trades) {
    if (t.date >= startDate && t.date < navDate) {
      if (t.type === 'buy') buyShares += t.shares;
      else sellShares += t.shares;
    }
  }

  return { buyShares, sellShares };
}

/**
 * 统计 navDate 之前的交易金额（不含 navDate 当天）
 */
function sumTradeAmounts(
  trades: TradeRecord[],
  navDate: string
): { buyAmount: number; sellAmount: number } {
  let buyAmount = 0;
  let sellAmount = 0;

  for (const t of trades) {
    if (t.date < navDate) {
      if (t.type === 'buy') {
        buyAmount += t.price * t.shares + t.fee;
      } else {
        sellAmount += t.price * t.shares - t.fee;
      }
    }
  }

  return { buyAmount, sellAmount };
}