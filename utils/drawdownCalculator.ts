import { DrawdownResult, DrawdownMethod } from '../types';
import {
  calculateDrawdownGeneric,
  percentDrawdownStrategy,
  amountDrawdownStrategy,
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
 * 基于累计盈亏计算回撤（复用通用函数）
 * 使用金额策略，回撤值为金额
 */
function calculateDrawdownFromProfit(
  cumulativeProfits: { date: string; profit: number }[]
): DrawdownResult {
  if (!cumulativeProfits || cumulativeProfits.length === 0) {
    return createEmptyDrawdownResult();
  }

  // 转换为通用格式并调用通用函数（金额策略）
  const values = cumulativeProfits.map(p => ({
    date: p.date,
    value: p.profit
  }));

  const result = calculateDrawdownGeneric(values, amountDrawdownStrategy);

  return {
    method: 'profit',
    currentDrawdown: result.currentDrawdown,  // 金额
    currentDrawdownDays: result.currentDrawdownDays,
    currentPeakDate: result.peakDate || null,
    currentPeakValue: result.peakValue,
    currentTroughDate: result.troughDate || null,
    currentTroughValue: result.troughValue,
    currentValue: result.currentValue,
    maxDrawdown: result.maxDrawdown,  // 金额
    maxDrawdownDays: result.maxDrawdownDays,
    maxPeakDate: result.maxDrawdownPeakDate || null,
    maxTroughDate: result.maxDrawdownTroughDate || null,
    maxPeakValue: result.maxDrawdownPeakValue || 0,
    maxTroughValue: result.maxDrawdownTroughValue || 0,
  };
}

/**
 * 基于净值计算回撤（复用通用函数）
 * 使用百分比策略，回撤值为百分比
 */
function calculateDrawdownFromNav(
  navCurve: { date: string; nav: number }[]
): DrawdownResult {
  if (!navCurve || navCurve.length === 0) {
    return createEmptyDrawdownResult();
  }

  // 转换为通用格式并调用通用函数（百分比策略）
  const values = navCurve.map(p => ({
    date: p.date,
    value: p.nav
  }));

  const result = calculateDrawdownGeneric(values, percentDrawdownStrategy);

  return {
    method: 'nav',
    currentDrawdown: result.currentDrawdown,  // 百分比
    currentDrawdownDays: result.currentDrawdownDays,
    currentPeakDate: result.peakDate || null,
    currentPeakValue: result.peakValue,
    currentTroughDate: result.troughDate || null,
    currentTroughValue: result.troughValue,
    currentValue: result.currentValue,
    maxDrawdown: result.maxDrawdown,  // 百分比
    maxDrawdownDays: result.maxDrawdownDays,
    maxPeakDate: result.maxDrawdownPeakDate || null,
    maxTroughDate: result.maxDrawdownTroughDate || null,
    maxPeakValue: result.maxDrawdownPeakValue || 0,
    maxTroughValue: result.maxDrawdownTroughValue || 0,
  };
}

/**
 * 混合方案：基于累计盈亏计算回撤，数据缺失时回退到净值法
 *
 * 简化后的逻辑：
 * - 有累计盈亏数据 → 用累计盈亏法（金额策略）
 * - 无累计盈亏数据 → 用净值法（百分比策略）
 *
 * 注意：不再需要判断峰值是否>0，因为金额策略在任何情况下都有意义
 */
export function calculateDrawdownWithFallback(
  cumulativeProfits: { date: string; profit: number }[],
  navCurve: { date: string; nav: number }[]
): DrawdownResult {
  // 累计盈亏数据为空，回退到净值法
  if (!cumulativeProfits || cumulativeProfits.length === 0) {
    return calculateDrawdownFromNav(navCurve);
  }

  // 有累计盈亏数据，用累计盈亏法（金额策略）
  return calculateDrawdownFromProfit(cumulativeProfits);
}