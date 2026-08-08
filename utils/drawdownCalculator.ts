import { DrawdownResult, DrawdownMethod } from '../types';
import {
  calculateMaxDrawdownDetailsFromNav,
  calculateCurrentDrawdownDetails,
} from './performanceAttribution';

/**
 * 创建空的回撤结果
 */
function createEmptyDrawdownResult(): DrawdownResult {
  return {
    method: 'nav',
    currentDrawdown: 0,
    currentDrawdownDays: 0,
    currentPeakDate: null,
    currentPeakValue: 0,
    currentTroughDate: null,
    currentTroughValue: 0,
    currentValue: 0,
    maxDrawdown: 0,
    maxDrawdownDays: 0,
    maxPeakDate: null,
    maxTroughDate: null,
    maxPeakValue: 0,
    maxTroughValue: 0,
  };
}

/**
 * 找到累计盈亏的峰值
 */
function findMaxProfit(
  cumulativeProfits: { date: string; profit: number }[]
): { date: string; profit: number } {
  if (!cumulativeProfits || cumulativeProfits.length === 0) {
    return { date: '', profit: 0 };
  }

  let maxPoint = cumulativeProfits[0];
  for (const point of cumulativeProfits) {
    if (point.profit > maxPoint.profit) {
      maxPoint = point;
    }
  }
  return maxPoint;
}

/**
 * 基于累计盈亏计算回撤
 */
function calculateDrawdownFromProfit(
  cumulativeProfits: { date: string; profit: number }[]
): DrawdownResult {
  if (!cumulativeProfits || cumulativeProfits.length === 0) {
    return createEmptyDrawdownResult();
  }

  const peak = findMaxProfit(cumulativeProfits);
  const current = cumulativeProfits[cumulativeProfits.length - 1];

  // 计算当前回撤
  const currentDrawdown = peak.profit > 0
    ? ((peak.profit - current.profit) / peak.profit) * 100
    : 0;

  // 计算最大回撤
  let maxDrawdown = 0;
  let maxPeak = cumulativeProfits[0];
  let maxTrough = cumulativeProfits[0];

  for (let i = 0; i < cumulativeProfits.length; i++) {
    const point = cumulativeProfits[i];

    // 更新峰值
    if (point.profit > maxPeak.profit) {
      maxPeak = point;
    }

    // 计算回撤
    if (maxPeak.profit > 0) {
      const drawdown = ((maxPeak.profit - point.profit) / maxPeak.profit) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxTrough = point;
      }
    }
  }

  // 计算天数
  const currentDrawdownDays = peak.date && current.date
    ? Math.round((new Date(current.date).getTime() - new Date(peak.date).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const maxDrawdownDays = maxPeak.date && maxTrough.date
    ? Math.round((new Date(maxTrough.date).getTime() - new Date(maxPeak.date).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return {
    method: 'profit',
    currentDrawdown,
    currentDrawdownDays,
    currentPeakDate: peak.date || null,
    currentPeakValue: peak.profit,
    currentTroughDate: null,
    currentTroughValue: 0,
    currentValue: current.profit,
    maxDrawdown,
    maxDrawdownDays,
    maxPeakDate: maxPeak.date || null,
    maxTroughDate: maxTrough.date || null,
    maxPeakValue: maxPeak.profit,
    maxTroughValue: maxTrough.profit,
  };
}

/**
 * 基于净值计算回撤（复用现有函数）
 */
function calculateDrawdownFromNav(
  navCurve: { date: string; nav: number }[]
): DrawdownResult {
  if (!navCurve || navCurve.length === 0) {
    return createEmptyDrawdownResult();
  }

  // 调用现有的净值回撤计算函数
  const currentDetails = calculateCurrentDrawdownDetails(navCurve);
  const maxDetails = calculateMaxDrawdownDetailsFromNav(navCurve.map(p => ({ date: p.date, value: p.nav })));

  return {
    method: 'nav',
    currentDrawdown: currentDetails.currentDrawdown,
    currentDrawdownDays: currentDetails.drawdownDays,
    currentPeakDate: currentDetails.peakDate || null,
    currentPeakValue: currentDetails.peakNav,
    currentTroughDate: currentDetails.troughDate || null,
    currentTroughValue: currentDetails.troughNav,
    currentValue: currentDetails.currentNav,
    maxDrawdown: maxDetails.maxDrawdown,
    maxDrawdownDays: maxDetails.drawdownDays,
    maxPeakDate: maxDetails.peakDate || null,
    maxTroughDate: maxDetails.troughDate || null,
    maxPeakValue: maxDetails.peakNav,
    maxTroughValue: maxDetails.troughNav,
  };
}

/**
 * 混合方案：基于累计盈亏计算回撤，峰值≤0时回退到净值法
 */
export function calculateDrawdownWithFallback(
  cumulativeProfits: { date: string; profit: number }[],
  navCurve: { date: string; nav: number }[]
): DrawdownResult {
  // 1. 累计盈亏数据为空，回退到净值法
  if (!cumulativeProfits || cumulativeProfits.length === 0) {
    return calculateDrawdownFromNav(navCurve);
  }

  // 2. 找到累计盈亏的峰值
  const peak = findMaxProfit(cumulativeProfits);

  // 3. 判断是否使用累计盈亏法
  if (peak.profit > 0) {
    // 基于累计盈亏计算回撤
    return calculateDrawdownFromProfit(cumulativeProfits);
  } else {
    // 峰值≤0，回退到净值法
    return calculateDrawdownFromNav(navCurve);
  }
}