import { TradeRecord, getTradeAmount } from '../types';
import xirr from '@webcarrot/xirr';

/** 一年的毫秒数 */
const YEAR_IN_MS = 365 * 24 * 60 * 60 * 1000;
/** 一天的毫秒数 */
const DAY_IN_MS = 1000 * 60 * 60 * 24;

export interface CashFlow {
  date: Date;
  amount: number;
}

export interface BuildCashFlowsParams {
  initialPosition: number;
  initialPrice: number | null;
  startDate: string | null;
  trades: TradeRecord[];
  currentShares: number;
  currentPrice: number;
  currentDate: string;
}

/**
 * 构建现金流数组用于收益率计算
 */
export function buildCashFlows(params: BuildCashFlowsParams): CashFlow[] {
  const { initialPosition, initialPrice, startDate, trades, currentShares, currentPrice, currentDate } = params;
  const cashFlows: CashFlow[] = [];

  // 1. 初始投入
  // 仅当 initialPrice > 0 时添加初始现金流
  // initialPrice <= 0 表示成本已归零（本金已回收），属于特殊情况
  // 此时数据缺失（初始价格是估算值），无法计算收益率
  if (initialPosition > 0 && initialPrice !== null && initialPrice > 0 && startDate) {
    cashFlows.push({
      date: new Date(startDate),
      amount: -initialPosition * initialPrice // 负数，钱流出
    });
  }

  // 2. 交易记录
  for (const trade of trades) {
    const amount = getTradeAmount(trade);
    // 买入：负数（钱流出），卖出和分红：正数（钱流入）
    const cashFlowAmount = trade.type === 'buy' ? -amount : amount;
    cashFlows.push({
      date: new Date(trade.date),
      amount: cashFlowAmount
    });
  }

  // 3. 最终市值（正数，视为最终卖出回款）
  // 仅当 currentShares > 0 时添加最终市值，清仓情况不需要添加
  if (currentShares > 0 && currentPrice > 0) {
    cashFlows.push({
      date: new Date(currentDate),
      amount: currentShares * currentPrice
    });
  }

  // 按日期排序
  cashFlows.sort((a, b) => a.date.getTime() - b.date.getTime());

  return cashFlows;
}

/**
 * 手动计算两个现金流的 XIRR
 * 对于两个现金流：PV = FV / (1 + r)^t
 * 解方程得：r = (FV / PV)^(1/t) - 1
 */
function calculateTwoCashFlowsXIRR(cashFlows: CashFlow[]): number | null {
  if (cashFlows.length !== 2) return null;

  const sorted = [...cashFlows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const first = sorted[0];
  const second = sorted[1];

  // 计算时间间隔（以年为单位）
  const daysDiff = (second.date.getTime() - first.date.getTime()) / DAY_IN_MS;
  const years = daysDiff / 365;

  if (years <= 0) return null;

  // 确定 PV（负数）和 FV（正数）
  // 如果第一个是流出（负数），第二个是流入（正数）
  if (first.amount < 0 && second.amount > 0) {
    const pv = Math.abs(first.amount);
    const fv = second.amount;
    // r = (FV / PV)^(1/t) - 1
    const rate = Math.pow(fv / pv, 1 / years) - 1;
    return rate * 100;
  }
  // 如果第一个是流入（正数），第二个是流出（负数）
  if (first.amount > 0 && second.amount < 0) {
    const pv = Math.abs(second.amount);
    const fv = first.amount;
    const rate = Math.pow(fv / pv, 1 / years) - 1;
    return rate * 100;
  }

  // 两个都是同符号，无法计算有效的 XIRR
  return null;
}

/**
 * 二分法 + 牛顿法混合求解 XIRR（鲁棒保底方案）
 * 对于负收益率等复杂情况，比纯牛顿迭代更稳定
 */
function xirrRobust(cashFlows: CashFlow[], guess: number = 0.1): number | null {
  // 按日期排序
  const sorted = [...cashFlows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const startDate = sorted[0].date;
  const years = sorted.map(cf => (cf.date.getTime() - startDate.getTime()) / YEAR_IN_MS);

  const npv = (rate: number) =>
    sorted.reduce((sum, cf, i) => sum + cf.amount / Math.pow(1 + rate, years[i]), 0);

  const npvPrime = (rate: number) =>
    sorted.reduce((sum, cf, i) => sum - years[i] * cf.amount / Math.pow(1 + rate, years[i] + 1), 0);

  // 先用二分法找到一个符号相反的区间
  let low = -0.99, high = 10.0;
  let fLow = npv(low), fHigh = npv(high);

  // 如果两端同号，扩展区间直到异号
  let expandCount = 0;
  const maxExpand = 50;
  while (fLow * fHigh > 0 && expandCount < maxExpand) {
    if (Math.abs(fLow) < Math.abs(fHigh)) {
      low = low * 2 - 0.5;  // 向左扩展
      if (low <= -1) {
        low = -0.9999;
        fLow = npv(low);
        break;
      }
      fLow = npv(low);
    } else {
      high = high * 2 + 0.5; // 向右扩展
      fHigh = npv(high);
    }
    expandCount++;
  }

  if (fLow * fHigh >= 0) {
    // 仍然同号，可能无实数解或全为正/负，尝试从 guess 开始牛顿法
    let rate = guess;
    for (let i = 0; i < 100; i++) {
      const f = npv(rate);
      const fPrime = npvPrime(rate);
      if (Math.abs(fPrime) < 1e-12) break; // 防止除零
      const newRate = rate - f / fPrime;
      if (Math.abs(newRate - rate) < 1e-7) return newRate * 100;
      rate = newRate;
      if (rate <= -1 || rate > 1e6) break; // 超出合理范围
    }
    return null; // 无解
  }

  // 二分法找到接近根的值作为牛顿法初值
  let rate = (low + high) / 2;
  for (let i = 0; i < 60; i++) {
    const f = npv(rate);
    if (Math.abs(f) < 1e-7) break;
    if (f * fLow > 0) {
      low = rate;
      fLow = f;
    } else {
      high = rate;
      fHigh = f;
    }
    rate = (low + high) / 2;
  }

  // 牛顿法精确求解
  for (let i = 0; i < 100; i++) {
    const f = npv(rate);
    const fPrime = npvPrime(rate);
    if (Math.abs(fPrime) < 1e-12) break; // 防止除零
    const newRate = rate - f / fPrime;
    if (Math.abs(newRate - rate) < 1e-7) return newRate * 100;
    rate = newRate;
    if (rate <= -1 || rate > 1e6) break; // 超出合理范围
  }
  return rate * 100;
}

/**
 * 计算简单年化收益率
 * 基于总投入和总回收，不考虑中间现金流的时间分布
 * 公式：((总流入 - 总投入) / 总投入) × (365 / 投资天数) × 100
 */
export function computeSimpleAnnualizedReturn(cashFlows: CashFlow[]): number | null {
  // 过滤掉金额为 0 的现金流
  const filteredCashFlows = cashFlows.filter(cf => cf.amount !== 0);

  if (filteredCashFlows.length < 2) {
    return null;
  }

  // 按日期排序
  const sorted = [...filteredCashFlows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const startDate = sorted[0].date;
  const endDate = sorted[sorted.length - 1].date;

  // 计算投资天数
  const days = (endDate.getTime() - startDate.getTime()) / DAY_IN_MS;
  if (days <= 0) {
    return null;
  }

  // 计算总投入（流出）和总回收（流入）
  const totalOutflow = Math.abs(sorted.filter(cf => cf.amount < 0).reduce((sum, cf) => sum + cf.amount, 0));
  const totalInflow = sorted.filter(cf => cf.amount > 0).reduce((sum, cf) => sum + cf.amount, 0);

  if (totalOutflow === 0) {
    return null;
  }

  // 简单收益率 = (总回收 - 总投入) / 总投入
  const simpleReturn = (totalInflow - totalOutflow) / totalOutflow;

  // 年化收益率 = 简单收益率 × (365 / 投资天数)
  const annualizedReturn = simpleReturn * (365 / days) * 100;

  return annualizedReturn;
}

/**
 * 计算 XIRR 或简单收益率
 * - cashFlows.length < 2 → null
 * - 所有现金流同一天 → 简单收益率
 * - 否则 → XIRR（动态 guess + 鲁棒保底）
 */
export function computeXIRR(cashFlows: CashFlow[]): number | null {
  // 过滤掉金额为 0 的现金流（它们不影响 XIRR 计算）
  const filteredCashFlows = cashFlows.filter(cf => cf.amount !== 0);

  if (filteredCashFlows.length < 2) {
    return null;
  }

  // 检查是否所有现金流都在同一天
  const firstDate = filteredCashFlows[0].date.getTime();
  const allSameDay = filteredCashFlows.every(cf => cf.date.getTime() === firstDate);

  if (allSameDay) {
    // 计算简单收益率：(总流入 - 总投入) / 总投入 * 100
    const totalInflow = filteredCashFlows.filter(cf => cf.amount > 0).reduce((sum, cf) => sum + cf.amount, 0);
    const totalOutflow = Math.abs(filteredCashFlows.filter(cf => cf.amount < 0).reduce((sum, cf) => sum + cf.amount, 0));
    if (totalOutflow === 0) {
      return null;
    }
    return ((totalInflow - totalOutflow) / totalOutflow) * 100;
  }

  // 对于两个现金流的情况，尝试手动计算（可以处理库无法收敛的情况）
  if (filteredCashFlows.length === 2) {
    const manualResult = calculateTwoCashFlowsXIRR(filteredCashFlows);
    if (manualResult !== null) {
      return manualResult;
    }
  }

  // 使用 @webcarrot/xirr 计算
  try {
    const xirrInput = filteredCashFlows.map(cf => ({
      date: cf.date,
      amount: cf.amount
    }));

    // 动态设置初始猜测值：根据净收益方向选择正或负
    // 正收益用正猜测，负收益用负猜测，避免牛顿迭代发散
    const totalIn = filteredCashFlows.filter(c => c.amount > 0).reduce((s, c) => s + c.amount, 0);
    const totalOut = Math.abs(filteredCashFlows.filter(c => c.amount < 0).reduce((s, c) => s + c.amount, 0));
    const netProfit = totalIn - totalOut;
    const dynamicGuess = netProfit >= 0 ? 0.1 : -0.3;

    // 使用动态 guess 和放宽的参数
    const rate = xirr(xirrInput, dynamicGuess, 1e-6, 500, 50);
    // xirr 返回的是年化利率（如 0.1 表示 10%），转换为百分比
    return rate * 100;
  } catch (e) {
    // XIRR 计算失败（如数值收敛问题），尝试使用鲁棒的混合保底方案
    return xirrRobust(filteredCashFlows);
  }
}