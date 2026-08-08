/**
 * 收益归因计算模块
 *
 * 用于计算各个基金对总收益的贡献占比
 */

import { OverallFundRow, AttributionResult, FundAttributionData, OverallProfitPoint, KPIResult, TradeRecord, HistoricalPoint } from '../types';
import { computeCostPricesByDate } from './tradeVolumeHelper';

/**
 * TWR计算结果
 */
interface TWRResult {
  twr: number | null;           // 时间加权收益率
  dailyValues?: {                // 每日市值数据
    date: string;
    value: number;
  }[];
  dailyNav?: {                   // 每日净值数据
    date: string;
    nav: number;
  }[];
  cumulativeProfits?: {          // 每日累计盈利数据
    date: string;
    profit: number;
  }[];
}

/**
 * 计算组合的时间加权收益率（TWR）- Modified Dietz 方法
 *
 * 用于计算整体组合的收益率，考虑资金流入流出
 *
 * @param positionTrend - 持仓趋势数据（包含每日市值和净投入）
 * @returns TWR计算结果（包含收益率和每日市值）
 */
export function calculatePortfolioTWR(
  positionTrend: { date: string; value: number; netInvestment?: number }[]
): TWRResult {
  if (!positionTrend || positionTrend.length < 2) {
    return { twr: null };
  }

  // 提取数据
  const startValue = positionTrend[0].value;
  const endValue = positionTrend[positionTrend.length - 1].value;

  if (startValue <= 0) {
    return { twr: null };
  }

  // 计算总现金流
  let totalCashFlow = 0;
  let weightedCashFlow = 0;
  const totalDays = positionTrend.length;

  // 遍历每天的数据，计算现金流和时间权重
  for (let i = 0; i < positionTrend.length; i++) {
    const today = positionTrend[i];
    const yesterday = i > 0 ? positionTrend[i - 1] : null;

    // 计算当日现金流 = 今日净投入 - 昨日净投入
    // 如果第一天，使用今日净投入作为初始现金流
    let dailyCashFlow = 0;
    if (yesterday && today.netInvestment !== undefined && yesterday.netInvestment !== undefined) {
      dailyCashFlow = today.netInvestment - yesterday.netInvestment;
    } else if (i === 0 && today.netInvestment !== undefined) {
      dailyCashFlow = today.netInvestment;
    }

    totalCashFlow += dailyCashFlow;

    // 时间权重：现金流发生日距离期末的天数 / 总天数
    // 期初现金流权重=1，期末现金流权重≈0
    const weight = (totalDays - i - 1) / totalDays;
    weightedCashFlow += dailyCashFlow * weight;
  }

  // Modified Dietz 收益率
  const returnValue = (endValue - startValue - totalCashFlow) / (startValue + weightedCashFlow);

  // 返回收益率和每日市值数据
  return {
    twr: returnValue,
    dailyValues: positionTrend.map(p => ({
      date: p.date,
      value: p.value,
    })),
  };
}

/**
 * 从持仓趋势数据计算年化收益率
 * 使用盈利变化除以净投入的方法计算收益率
 *
 * 公式：收益率 = 期间盈利变化 / 平均净投入
 * 期间盈利变化 = 期末盈利 - 期初盈利
 * 平均净投入 = (期初净投入 + 期末净投入) / 2
 *
 * @param trendData - 持仓趋势数据（包含每日市值和净投入）
 * @returns 年化收益率百分比
 */
export function calculateAnnualizedReturnFromPositionTrend(
  trendData: { date: string; value: number; netInvestment?: number }[] | null
): number | null {
  if (!trendData || trendData.length < 2) {
    return null;
  }

  const firstPoint = trendData[0];
  const lastPoint = trendData[trendData.length - 1];

  // 获取期初和期末的市值与净投入
  const startValue = firstPoint.value;
  const endValue = lastPoint.value;
  const startNetInvestment = firstPoint.netInvestment || 0;
  const endNetInvestment = lastPoint.netInvestment || 0;

  // 计算期初和期末的盈利
  const startProfit = startValue - startNetInvestment;
  const endProfit = endValue - endNetInvestment;

  // 计算平均净投入
  const avgNetInvestment = (startNetInvestment + endNetInvestment) / 2;

  // 平均净投入必须大于0
  if (avgNetInvestment <= 0) {
    return null;
  }

  // 计算期间盈利变化
  const profitChange = endProfit - startProfit;

  // 计算期间收益率 = 盈利变化 / 平均净投入
  const periodReturn = profitChange / avgNetInvestment;

  // 持有天数
  const days = trendData.length;

  // 年化收益率 = (1 + 期间收益率)^(252/天数) - 1 * 100%
  return (Math.pow(1 + periodReturn, 252 / days) - 1) * 100;
}

/**
 * 计算时间加权收益率（TWR）- Modified Dietz 方法
 *
 * 考虑资金流入流出的准确收益率计算方法
 *
 * @param history - 历史净值数据
 * @param trades - 交易记录（申购/赎回）
 * @param initialShares - 初始份额
 * @param startDate - 开始日期
 * @param endDate - 结束日期
 * @returns TWR计算结果（包含收益率和每日市值）
 */
export function calculateTWR(
  history: HistoricalPoint[],
  trades: TradeRecord[],
  initialShares: number,
  startDate: string,
  endDate: string
): TWRResult {
  if (!history || history.length === 0) {
    return { twr: null };
  }

  // 过滤历史数据到时间范围内
  const startTime = new Date(`${startDate} 00:00:00`).getTime();
  const endTime = new Date(`${endDate} 23:59:59`).getTime();
  const filteredHistory = history
    .filter(h => (h.date as number) >= startTime && (h.date as number) <= endTime)
    .sort((a, b) => (a.date as number) - (b.date as number));

  if (filteredHistory.length === 0) {
    return { twr: null };
  }

  // 按日期分组交易记录
  const tradesByDate: Record<string, TradeRecord[]> = {};
  for (const trade of trades) {
    if (!tradesByDate[trade.date]) {
      tradesByDate[trade.date] = [];
    }
    tradesByDate[trade.date].push(trade);
  }

  // 计算每个交易日的市值和现金流
  interface DailyData {
    date: string;
    nav: number;
    shares: number;
    value: number;
    cashFlow: number; // 申购为正，赎回为负
  }

  const dailyData: DailyData[] = [];
  let currentShares = initialShares;

  for (let i = 0; i < filteredHistory.length; i++) {
    const point = filteredHistory[i];
    const dateObj = new Date(point.date as number);
    const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;

    const nav = point.value;
    const dayTrades = tradesByDate[dateStr] || [];

    // 计算当日现金流（申购为正，赎回为负）
    let cashFlow = 0;
    for (const trade of dayTrades) {
      if (trade.type === 'buy') {
        cashFlow += trade.shares * trade.price + trade.fee;
        currentShares += trade.shares;
      } else {
        cashFlow -= trade.shares * trade.price - trade.fee;
        currentShares -= trade.shares;
      }
    }

    dailyData.push({
      date: dateStr,
      nav,
      shares: currentShares,
      value: currentShares * nav,
      cashFlow
    });
  }

  if (dailyData.length < 2) {
    return { twr: null, dailyValues: dailyData.map(d => ({ date: d.date, value: d.value })) };
  }

  // 使用 Modified Dietz 方法计算收益率
  // 公式: R = (V_e - V_b - ΣC) / (V_b + Σ(C × W))
  // 其中：V_e = 期末市值, V_b = 期初市值, C = 现金流, W = 时间权重

  const startValue = dailyData[0].value;
  const endValue = dailyData[dailyData.length - 1].value;

  if (startValue <= 0) {
    return { twr: null, dailyValues: dailyData.map(d => ({ date: d.date, value: d.value })) };
  }

  // 计算总现金流
  let totalCashFlow = 0;
  let weightedCashFlow = 0;
  const totalDays = dailyData.length;

  for (let i = 0; i < dailyData.length; i++) {
    const data = dailyData[i];
    totalCashFlow += data.cashFlow;

    // 时间权重：现金流发生日距离期末的天数 / 总天数
    // 期初现金流权重=1，期末现金流权重≈0
    const weight = (totalDays - i - 1) / totalDays;
    weightedCashFlow += data.cashFlow * weight;
  }

  // Modified Dietz 收益率
  const returnValue = (endValue - startValue - totalCashFlow) / (startValue + weightedCashFlow);

  // 计算累计盈利序列：市值 - 累计净投入
  let cumulativeNetInvestment = 0;
  const cumulativeProfits: { date: string; profit: number }[] = [];
  for (const data of dailyData) {
    cumulativeNetInvestment += data.cashFlow;
    cumulativeProfits.push({
      date: data.date,
      profit: data.value - cumulativeNetInvestment,
    });
  }

  // 返回收益率、市值、净值和累计盈利数据
  return {
    twr: returnValue,
    dailyValues: dailyData.map(d => ({ date: d.date, value: d.value })),
    dailyNav: dailyData.map(d => ({ date: d.date, nav: d.nav })),
    cumulativeProfits,
  };
}

/**
 * 计算基金收益归因
 *
 * @param fundRows - 基金收益数据数组
 * @returns 收益归因结果，包含各基金的贡献占比和总绝对收益
 */
export function calculateProfitAttribution(fundRows: OverallFundRow[]): AttributionResult {
  // 处理空数组或无效输入
  if (!fundRows || fundRows.length === 0) {
    return { funds: [], totalAbsoluteProfit: 0 };
  }

  // 计算总绝对收益：sum of |profitDiff| for all funds
  const totalAbsoluteProfit = fundRows.reduce((sum, row) => {
    const profitDiff = row.profitDiff ?? 0;
    return sum + Math.abs(profitDiff);
  }, 0);

  // 为每个基金计算收益占比
  const funds: FundAttributionData[] = fundRows.map(row => {
    const profit = row.profitDiff ?? 0;
    const absoluteProfit = Math.abs(profit);
    const profitShare = totalAbsoluteProfit > 0
      ? (absoluteProfit / totalAbsoluteProfit) * 100
      : 0;

    return {
      symbol: row.symbol,
      name: row.name,
      profit: profit,
      profitShare: Number(profitShare.toFixed(2)),
      isProfit: profit > 0,
    };
  });

  return { funds, totalAbsoluteProfit };
}

/**
 * 计算最大回撤（基于市值）
 *
 * @param dailyValues - 每日市值数据
 * @returns 最大回撤百分比（正值）
 */
export function calculateMaxDrawdownFromValue(
  dailyValues: { date: string; value: number }[]
): number {
  if (!dailyValues || dailyValues.length === 0) {
    return 0;
  }

  let maxPeak = dailyValues[0].value;
  let maxDrawdown = 0;

  for (const point of dailyValues) {
    const currentValue = point.value;

    // 更新峰值
    if (currentValue > maxPeak) {
      maxPeak = currentValue;
    }

    // 计算当前回撤（只有当峰值 > 0 时才计算）
    if (maxPeak > 0) {
      const drawdown = (maxPeak - currentValue) / maxPeak * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
  }

  return maxDrawdown;
}

/**
 * 计算最大回撤（基于累计盈利）
 * 使用累计盈利而非市值，避免卖出操作影响回撤计算
 *
 * @param cumulativeProfits - 累计盈利数据（市值 - 净投入）
 * @returns 最大回撤百分比（正值）
 */
export function calculateMaxDrawdownFromProfit(
  cumulativeProfits: { date: string; profit: number }[]
): number {
  if (!cumulativeProfits || cumulativeProfits.length === 0) {
    return 0;
  }

  let maxPeak = cumulativeProfits[0].profit;
  let maxDrawdown = 0;

  for (const point of cumulativeProfits) {
    // 更新峰值
    if (point.profit > maxPeak) {
      maxPeak = point.profit;
    }

    // 只有当峰值 > 0 时才计算回撤（累计盈利为负时，回撤没有意义）
    if (maxPeak > 0) {
      const drawdown = (maxPeak - point.profit) / maxPeak * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
  }

  return maxDrawdown;
}

/**
 * 计算单位净值曲线
 *
 * 核心逻辑：
 * 1. 初始净值 = 1.0，初始份额 = 初始市值
 * 2. 每日净值 = 当日市值 / 总份额
 * 3. 有现金流时：新增份额 = 现金流 / 昨日净值，更新总份额
 * 4. 入金/出金只影响份额，不影响净值
 *
 * @param positionTrend - 持仓趋势数据（包含每日市值和净投入）
 * @returns 单位净值曲线
 */
export function calculateNavCurve(
  positionTrend: { date: string; value: number; netInvestment?: number }[]
): { date: string; nav: number }[] {
  if (!positionTrend || positionTrend.length === 0) {
    return [];
  }

  const navCurve: { date: string; nav: number }[] = [];

  // 初始净值 = 1.0
  const initialNav = 1.0;

  // 初始份额 = 初始市值 / 初始净值
  const startValue = positionTrend[0].value;
  let totalShares = startValue / initialNav;

  for (let i = 0; i < positionTrend.length; i++) {
    const today = positionTrend[i];
    const yesterday = i > 0 ? positionTrend[i - 1] : null;

    // 计算当日现金流 = 今日净投入 - 昨日净投入
    let cashFlow = 0;
    if (yesterday && today.netInvestment !== undefined && yesterday.netInvestment !== undefined) {
      cashFlow = today.netInvestment - yesterday.netInvestment;
    }

    // 如果有现金流，先用昨日净值计算新增份额，再更新总份额
    if (i > 0 && cashFlow !== 0) {
      const yesterdayNav = navCurve[i - 1].nav;
      if (yesterdayNav > 0) {
        // 新增份额 = 现金流 / 昨日净值（入金为正，出金为负）
        const newShares = cashFlow / yesterdayNav;
        totalShares += newShares;
      }
    }

    // 计算当日净值 = 当日市值 / 总份额
    const nav = totalShares > 0 ? today.value / totalShares : 0;
    navCurve.push({ date: today.date, nav });
  }

  return navCurve;
}

/**
 * 基于单位净值计算最大回撤
 *
 * 核心逻辑：
 * 1. 寻找到当前为止的历史最高净值
 * 2. 当前回撤 = (当前净值 - 历史最高净值) / 历史最高净值
 * 3. 最大回撤 = 所有当前回撤的最小值（负得最多的）
 *
 * @param navCurve - 单位净值曲线
 * @returns 最大回撤百分比（正值）
 */
export function calculateMaxDrawdownFromNav(
  navCurve: { date: string; nav: number }[]
): number {
  if (!navCurve || navCurve.length === 0) {
    return 0;
  }

  let maxPeakNav = navCurve[0].nav;
  let maxDrawdown = 0;

  for (const point of navCurve) {
    // 更新历史最高净值
    if (point.nav > maxPeakNav) {
      maxPeakNav = point.nav;
    }

    // 计算当前回撤 = (当前净值 - 历史最高净值) / 历史最高净值
    if (maxPeakNav > 0) {
      const drawdown = (maxPeakNav - point.nav) / maxPeakNav * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
  }

  return maxDrawdown;
}

/**
 * 基于单位净值计算最大回撤详细信息
 *
 * @param positionTrend - 持仓趋势数据（包含每日市值和净投入）
 * @returns 最大回撤详细信息（包括峰值和谷值的日期和净值，以及持续天数）
 */
export function calculateMaxDrawdownDetailsFromNav(
  positionTrend: { date: string; value: number; netInvestment?: number }[]
): {
  maxDrawdown: number;
  peakDate: string | null;
  peakNav: number;
  troughDate: string | null;
  troughNav: number;
  drawdownDays: number; // 从峰值到低点的天数
} {
  const defaultResult = {
    maxDrawdown: 0,
    peakDate: null as string | null,
    peakNav: 0,
    troughDate: null as string | null,
    troughNav: 0,
    drawdownDays: 0,
  };

  if (!positionTrend || positionTrend.length === 0) {
    return defaultResult;
  }

  // 先计算净值曲线
  const navCurve = calculateNavCurve(positionTrend);

  if (navCurve.length === 0) {
    return defaultResult;
  }

  let maxPeakNav = navCurve[0].nav;
  let maxPeakDate = navCurve[0].date;
  let maxPeakIndex = 0;
  let maxDrawdown = 0;
  let troughDate = navCurve[0].date;
  let troughNav = navCurve[0].nav;
  let troughIndex = 0;

  // 用于记录最大回撤时的峰值信息
  let drawdownPeakDate = navCurve[0].date;
  let drawdownPeakNav = navCurve[0].nav;
  let drawdownPeakIndex = 0;

  for (let i = 0; i < navCurve.length; i++) {
    const point = navCurve[i];
    // 更新历史最高净值
    if (point.nav > maxPeakNav) {
      maxPeakNav = point.nav;
      maxPeakDate = point.date;
      maxPeakIndex = i;
    }

    // 计算当前回撤
    if (maxPeakNav > 0) {
      const drawdown = (maxPeakNav - point.nav) / maxPeakNav * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        troughDate = point.date;
        troughNav = point.nav;
        troughIndex = i;
        // 记录产生最大回撤时的峰值
        drawdownPeakDate = maxPeakDate;
        drawdownPeakNav = maxPeakNav;
        drawdownPeakIndex = maxPeakIndex;
      }
    }
  }

  // 计算持续天数（从峰值到低点的天数）
  const drawdownDays = maxDrawdown > 0 ? troughIndex - drawdownPeakIndex : 0;

  return {
    maxDrawdown,
    peakDate: maxDrawdown > 0 ? drawdownPeakDate : null,
    peakNav: maxDrawdown > 0 ? drawdownPeakNav : 0,
    troughDate: maxDrawdown > 0 ? troughDate : null,
    troughNav: maxDrawdown > 0 ? troughNav : 0,
    drawdownDays,
  };
}

/**
 * 最大回撤详细信息
 */
export interface MaxDrawdownDetails {
  maxDrawdown: number;      // 最大回撤百分比（正值）
  peakDate: string | null;  // 波峰日期
  peakProfit: number;       // 波峰累计盈利值
  troughDate: string | null; // 波谷日期
  troughProfit: number;     // 波谷累计盈利值
}

/**
 * 计算最大回撤详细信息（包括波峰和波谷）
 *
 * @param cumulativeProfits - 累计盈利数据（市值 - 净投入）
 * @returns 最大回撤详细信息
 */
export function calculateMaxDrawdownDetails(
  cumulativeProfits: { date: string; profit: number }[]
): MaxDrawdownDetails {
  const defaultResult: MaxDrawdownDetails = {
    maxDrawdown: 0,
    peakDate: null,
    peakProfit: 0,
    troughDate: null,
    troughProfit: 0,
  };

  if (!cumulativeProfits || cumulativeProfits.length === 0) {
    return defaultResult;
  }

  let maxPeak = cumulativeProfits[0].profit;
  let maxPeakDate = cumulativeProfits[0].date;
  let maxDrawdown = 0;
  let troughDate = cumulativeProfits[0].date;
  let troughProfit = cumulativeProfits[0].profit;

  // 用于记录最大回撤时的波峰信息
  let drawdownPeakDate = cumulativeProfits[0].date;
  let drawdownPeakProfit = cumulativeProfits[0].profit;

  for (const point of cumulativeProfits) {
    // 更新峰值
    if (point.profit > maxPeak) {
      maxPeak = point.profit;
      maxPeakDate = point.date;
    }

    // 只有当峰值 > 0 时才计算回撤（累计盈利为负时，回撤没有意义）
    if (maxPeak > 0) {
      const drawdown = (maxPeak - point.profit) / maxPeak * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        troughDate = point.date;
        troughProfit = point.profit;
        // 记录产生最大回撤时的波峰
        drawdownPeakDate = maxPeakDate;
        drawdownPeakProfit = maxPeak;
      }
    }
  }

  return {
    maxDrawdown,
    peakDate: maxDrawdown > 0 ? drawdownPeakDate : null,
    peakProfit: maxDrawdown > 0 ? drawdownPeakProfit : 0,
    troughDate: maxDrawdown > 0 ? troughDate : null,
    troughProfit: maxDrawdown > 0 ? troughProfit : 0,
  };
}

/**
 * 计算最大回撤
 *
 * @param timeline - 时间线数据
 * @returns 最大回撤百分比（正值）
 */
export function calculateMaxDrawdown(timeline: OverallProfitPoint[]): number {
  if (!timeline || timeline.length === 0) {
    return 0;
  }

  let maxPeak = timeline[0].cumulativeProfit;
  let maxDrawdown = 0;

  for (const point of timeline) {
    const currentProfit = point.cumulativeProfit;

    // 更新峰值
    if (currentProfit > maxPeak) {
      maxPeak = currentProfit;
    }

    // 计算当前回撤
    if (maxPeak > 0) {
      const drawdown = (maxPeak - currentProfit) / maxPeak * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
  }

  return maxDrawdown;
}

/**
 * 从市值数据和交易记录计算年化波动率（考虑现金流影响）
 *
 * 使用简化的Modified Dietz方法计算每日真实收益率
 * 真实收益率 = (今日市值 - 昨日市值 - 当日现金流) / 昨日市值
 *
 * @param dailyValues - 每日市值数据
 * @param trades - 交易记录数组（可选）
 * @param fundIdentifier - 基金标识（可选，用于调试）
 * @returns 年化波动率百分比
 */
export function calculateVolatilityFromValueWithTrades(
  dailyValues: { date: string; value: number }[],
  trades?: TradeRecord[],
  fundIdentifier?: string
): number {
  if (!dailyValues || dailyValues.length < 2) {
    return 0;
  }

  // 构建交易记录映射：date -> TradeRecord[]
  const tradesByDate: Record<string, TradeRecord[]> = {};
  if (trades && trades.length > 0) {
    for (const trade of trades) {
      if (!tradesByDate[trade.date]) {
        tradesByDate[trade.date] = [];
      }
      tradesByDate[trade.date].push(trade);
    }
  }

  // 计算每日真实收益率序列（考虑现金流）
  const dailyReturns: number[] = [];

  for (let i = 1; i < dailyValues.length; i++) {
    const todayValue = dailyValues[i].value;
    const yesterdayValue = dailyValues[i - 1].value;
    const todayDate = dailyValues[i].date;

    // 只有当昨日市值 > 0 时才计算收益率
    if (yesterdayValue > 0) {
      // 计算当日现金流：买入为正（资金投入组合），卖出为负（资金从组合取出）
      const dayTrades = tradesByDate[todayDate] || [];
      let cashFlow = 0;
      for (const trade of dayTrades) {
        if (trade.type === 'buy') {
          // 买入：投资者把钱投入组合 = 正现金流
          cashFlow += trade.shares * (trade.price || 0) + (trade.fee || 0);
        } else {
          // 卖出：投资者把钱从组合取走 = 负现金流
          cashFlow -= trade.shares * (trade.price || 0) - (trade.fee || 0);
        }
      }

      // 计算真实收益率 = (市值变化 - 现金流) / 昨日市值
      // 市值变化 = 今日市值 - 昨日市值 = 投资收益 + 现金流
      // 所以 投资收益 = 市值变化 - 现金流
      const dailyReturn = (todayValue - yesterdayValue - cashFlow) / yesterdayValue;

      // 过滤异常收益率：日收益率绝对值超过30%视为异常
      // 正常的基金日收益率通常在-10%到+10%之间，考虑误差放大到30%
      if (Math.abs(dailyReturn) <= 0.3) {
        dailyReturns.push(dailyReturn);
      }
    }
  }

  if (dailyReturns.length === 0) {
    return 0;
  }

  // 计算日收益率的标准差
  const mean = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / dailyReturns.length;
  const stdDev = Math.sqrt(variance);

  // 年化波动率 = 日收益率标准差 × sqrt(252) × 100%
  const annualizedVolatility = stdDev * Math.sqrt(252) * 100;

  return annualizedVolatility;
}

/**
 * 从市值数据计算年化波动率（不考虑现金流影响）
 *
 * 使用市值变化计算真实的日收益率，然后年化
 *
 * @param dailyValues - 每日市值数据
 * @param fundIdentifier - 基金标识（可选，用于调试）
 * @returns 年化波动率百分比
 * @deprecated 请使用 calculateVolatilityFromValueWithTrades
 */
export function calculateVolatilityFromValue(
  dailyValues: { date: string; value: number }[],
  fundIdentifier?: string
): number {
  if (!dailyValues || dailyValues.length < 2) {
    return 0;
  }

  // 计算日收益率序列：今日市值相对于昨日市值的变化率
  const dailyReturns: number[] = [];
  for (let i = 1; i < dailyValues.length; i++) {
    const todayValue = dailyValues[i].value;
    const yesterdayValue = dailyValues[i - 1].value;

    // 只有当昨日市值 > 0 时才计算收益率
    if (yesterdayValue > 0) {
      const dailyReturn = (todayValue - yesterdayValue) / yesterdayValue;

      // 过滤异常收益率：日收益率绝对值超过20%视为异常（可能是大额交易导致）
      // 正常的基金日收益率通常在-10%到+10%之间
      if (Math.abs(dailyReturn) <= 0.2) {
        dailyReturns.push(dailyReturn);
      }
    }
  }

  if (dailyReturns.length === 0) {
    return 0;
  }

  // 计算日收益率的标准差
  const mean = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / dailyReturns.length;
  const stdDev = Math.sqrt(variance);

  // 年化波动率 = 日收益率标准差 × sqrt(252) × 100%
  const annualizedVolatility = stdDev * Math.sqrt(252) * 100;

  return annualizedVolatility;
}

/**
 * 计算波动率（年化）- 使用累计盈利数据（旧方法，已废弃）
 *
 * 波动率计算基于日收益率序列的标准差
 * 对于累计盈利时间线，日收益率 = dailyProfit / initialCapital
 *
 * @param timeline - 时间线数据
 * @param initialCapital - 初始资金（用于计算收益率）
 * @returns 波动率百分比
 * @deprecated 请使用 calculateVolatilityFromValue
 */
export function calculateVolatility(timeline: OverallProfitPoint[], initialCapital?: number): number {
  if (!timeline || timeline.length < 2) {
    return 0;
  }

  // 使用默认初始资金10000（如果未提供）
  const capital = initialCapital ?? 10000;

  if (capital === 0) {
    return 0;
  }

  // 计算日收益率序列（基于dailyProfit相对于初始资金的比率）
  const dailyReturns: number[] = [];
  for (let i = 1; i < timeline.length; i++) {
    const dailyReturn = timeline[i].dailyProfit / capital;
    dailyReturns.push(dailyReturn);
  }

  // 第一个点的dailyProfit需要特殊处理（通常是基准点）
  if (timeline[0].dailyProfit !== 0) {
    dailyReturns.unshift(timeline[0].dailyProfit / capital);
  }

  if (dailyReturns.length === 0) {
    return 0;
  }

  // 计算标准差
  const mean = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / dailyReturns.length;
  const stdDev = Math.sqrt(variance);

  // 年化波动率 = 日收益率标准差 × sqrt(252) × 100%
  const annualizedVolatility = stdDev * Math.sqrt(252) * 100;

  return annualizedVolatility;
}

/**
 * 计算交易日数
 *
 * @param timeline - 时间线数据
 * @returns 交易日数
 */
export function countTradingDays(timeline: OverallProfitPoint[]): number {
  if (!timeline || timeline.length === 0) {
    return 0;
  }

  return timeline.length;
}

/**
 * 计算KPI指标
 *
 * @param timeline - 时间线数据
 * @param riskFreeRate - 无风险利率（年化，默认0.03）
 * @param initialCapital - 初始资金（默认10000）
 * @returns KPI计算结果
 */
export function calculateKPIs(
  timeline: OverallProfitPoint[],
  riskFreeRate?: number,
  initialCapital?: number
): KPIResult {
  // 设置默认值
  const rfRate = riskFreeRate ?? 0.03;
  const capital = initialCapital ?? 10000;

  // 处理空时间线
  if (!timeline || timeline.length === 0) {
    return {
      annualizedReturn: null,
      maxDrawdown: null,
      volatility: null,
      sharpeRatio: null,
      calmarRatio: null,
    };
  }

  // 处理单日时间线（无法计算年化收益率和波动率）
  if (timeline.length === 1) {
    const maxDrawdown = calculateMaxDrawdown(timeline);
    return {
      annualizedReturn: null,
      maxDrawdown: maxDrawdown > 0 ? maxDrawdown : null,
      volatility: null,
      sharpeRatio: null,
      calmarRatio: null,
    };
  }

  // 处理零初始资金
  if (capital === 0) {
    const maxDrawdown = calculateMaxDrawdown(timeline);
    const volatility = calculateVolatility(timeline);
    return {
      annualizedReturn: null,
      maxDrawdown: maxDrawdown > 0 ? maxDrawdown : null,
      volatility: volatility > 0 ? volatility : null,
      sharpeRatio: null,
      calmarRatio: null,
    };
  }

  // 计算总收益
  const startProfit = timeline[0].cumulativeProfit;
  const endProfit = timeline[timeline.length - 1].cumulativeProfit;
  const totalReturn = endProfit - startProfit;

  // 计算交易日数
  const tradingDays = countTradingDays(timeline);

  // 初始资金：使用起始累计盈利作为基准（代表该时间点的持仓市值）
  // 如果起始累计盈利为0或接近0，使用传入的initialCapital参数或默认值
  const effectiveCapital = Math.abs(startProfit) > 100 ? Math.abs(startProfit) : capital;

  // 处理零初始资金
  if (effectiveCapital === 0) {
    const maxDrawdown = calculateMaxDrawdown(timeline);
    const volatility = calculateVolatility(timeline, effectiveCapital);
    return {
      annualizedReturn: null,
      maxDrawdown: maxDrawdown > 0 ? maxDrawdown : null,
      volatility: volatility > 0 ? volatility : null,
      sharpeRatio: null,
      calmarRatio: null,
    };
  }

  // 计算年化收益率 = (总收益 / 初始资金) × (252 / 交易日数) × 100%
  const annualizedReturn = (totalReturn / effectiveCapital) * (252 / tradingDays) * 100;

  // 计算最大回撤
  const maxDrawdown = calculateMaxDrawdown(timeline);

  // 计算波动率（传入正确的初始资金参数）
  const volatility = calculateVolatility(timeline, effectiveCapital);

  // 计算夏普比率 = (年化收益率 - 无风险利率) / 波动率
  // 注意：年化收益率已经是百分比形式，无风险利率需要转换
  const sharpeRatio = volatility > 0 ? (annualizedReturn - rfRate * 100) / volatility : null;

  // 计算卡玛比率 = 年化收益率 / |最大回撤|
  const calmarRatio = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : null;

  return {
    annualizedReturn: annualizedReturn,
    maxDrawdown: maxDrawdown > 0 ? maxDrawdown : 0,
    volatility: volatility > 0 ? volatility : 0,
    sharpeRatio: sharpeRatio,
    calmarRatio: calmarRatio,
  };
}

/**
 * 历史最长恢复详细信息
 */
export interface MaxRecoveryDetails {
  maxRecoveryDays: number;           // 历史最长恢复天数（从低点到创新高）
  peakDate: string | null;           // 回撤峰值日期（回撤开始时间）
  troughDate: string | null;         // 回撤低点日期
  recoveryDate: string | null;       // 恢复日期（创新高日期，null表示未恢复）
  isInProgress: boolean;             // 当前是否有未恢复的回撤
}

/**
 * 计算历史最长恢复天数（基于净值）
 *
 * 恢复天数的定义：从回撤低点到创新高的天数
 * 即：从净值跌破前一个峰值开始，到再次创新高的天数
 *
 * @param navCurve - 单位净值曲线
 * @returns 历史最长恢复详细信息
 */
export function calculateMaxRecoveryDays(
  navCurve: { date: string; nav: number }[]
): number {
  const details = calculateMaxRecoveryDaysDetails(navCurve);
  return details.maxRecoveryDays;
}

/**
 * 计算历史最长恢复详细信息（策略模式）
 *
 * 恢复天数的定义：从回撤低点到创新高的天数
 * 同时追踪回撤的峰值日期、低点日期和恢复日期
 *
 * @param values 值数组 [{ date, value }]，按日期排序
 * @param strategy 回撤计算策略（用于判断是否创新高）
 * @returns 历史最长恢复详细信息
 */
export function calculateMaxRecoveryGeneric(
  values: { date: string; value: number }[],
  strategy: DrawdownStrategy
): MaxRecoveryDetails {
  const emptyResult: MaxRecoveryDetails = {
    maxRecoveryDays: 0,
    peakDate: null,
    troughDate: null,
    recoveryDate: null,
    isInProgress: false,
  };

  if (!values || values.length < 2) {
    return emptyResult;
  }

  // 计算历史最高值
  const historicalPeakValue = Math.max(...values.map(p => p.value));

  if (historicalPeakValue <= 0) {
    return emptyResult;
  }

  let maxRecoveryDays = 0;
  let currentPeak = values[0].value;
  let currentPeakIndex = 0;
  let inDrawdown = false;
  let troughIndex = 0;
  let drawdownStartPeakIndex = 0; // 回撤开始时的峰值索引

  // 追踪历史最长恢复的详细信息
  let maxRecoveryPeakIndex = 0;
  let maxRecoveryTroughIndex = 0;
  let maxRecoveryRecoveryIndex = 0;

  for (let i = 1; i < values.length; i++) {
    const value = values[i].value;

    // 使用策略判断是否创新高（回撤<=0表示创新高或回到峰值）
    const drawdown = strategy(currentPeak, value);

    if (drawdown <= 0 && value >= currentPeak) {
      // 创新高或回到峰值，如果之前处于回撤状态，则完成一个恢复周期
      if (inDrawdown) {
        const recoveryDays = i - troughIndex;
        if (recoveryDays > maxRecoveryDays) {
          maxRecoveryDays = recoveryDays;
          maxRecoveryPeakIndex = drawdownStartPeakIndex;
          maxRecoveryTroughIndex = troughIndex;
          maxRecoveryRecoveryIndex = i;
        }
        inDrawdown = false;
      }
      currentPeak = value;
      currentPeakIndex = i;
    } else if (drawdown > 0) {
      // 处于回撤状态
      if (!inDrawdown) {
        inDrawdown = true;
        troughIndex = i;
        drawdownStartPeakIndex = currentPeakIndex;
      } else {
        // 更新低点位置
        if (value < values[troughIndex].value) {
          troughIndex = i;
        }
      }
    }
  }

  // 判断当前是否有未恢复的回撤
  const isInProgress = inDrawdown;

  // 如果历史最长恢复天数为0，但当前有未恢复的回撤，则当前回撤可能成为历史最长
  if (maxRecoveryDays === 0 && isInProgress) {
    return {
      maxRecoveryDays: 0,
      peakDate: values[drawdownStartPeakIndex]?.date || null,
      troughDate: values[troughIndex]?.date || null,
      recoveryDate: null,
      isInProgress: true,
    };
  }

  // 如果有历史最长恢复记录
  if (maxRecoveryDays > 0) {
    return {
      maxRecoveryDays,
      peakDate: values[maxRecoveryPeakIndex]?.date || null,
      troughDate: values[maxRecoveryTroughIndex]?.date || null,
      recoveryDate: values[maxRecoveryRecoveryIndex]?.date || null,
      isInProgress,
    };
  }

  return emptyResult;
}

/**
 * 计算历史最长恢复详细信息（基于净值）
 *
 * 恢复天数的定义：从回撤低点到创新高的天数
 * 同时追踪回撤的峰值日期、低点日期和恢复日期
 *
 * @param navCurve - 单位净值曲线
 * @returns 历史最长恢复详细信息
 */
export function calculateMaxRecoveryDaysDetails(
  navCurve: { date: string; nav: number }[]
): MaxRecoveryDetails {
  const values = navCurve.map(p => ({ date: p.date, value: p.nav }));
  return calculateMaxRecoveryGeneric(values, percentDrawdownStrategy);
}

/**
 * 从净值曲线估算波动率
 *
 * 公式：
 * 1. 日收益率 = (今日净值 - 昨日净值) / 昨日净值
 * 2. 日标准差 = sqrt(sum((r - mean)^2) / n)
 * 3. 年化波动率 = 日标准差 × sqrt(252) × 100%
 *
 * @param navCurve - 单位净值曲线
 * @returns 年化波动率百分比
 */
export function estimateVolatilityFromNav(
  navCurve: { date: string; nav: number }[]
): number {
  if (!navCurve || navCurve.length < 2) {
    return 0;
  }

  // 计算日收益率
  const dailyReturns: number[] = [];
  for (let i = 1; i < navCurve.length; i++) {
    const prev = navCurve[i - 1].nav;
    const curr = navCurve[i].nav;
    if (prev > 0) {
      dailyReturns.push((curr - prev) / prev);
    }
  }

  if (dailyReturns.length === 0) return 0;

  // 计算标准差
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / dailyReturns.length;
  const stdDev = Math.sqrt(variance);

  // 年化波动率 = 日标准差 * sqrt(252) * 100%
  return stdDev * Math.sqrt(252) * 100;
}

/**
 * 从个人收益率曲线计算波动率
 *
 * 个人收益率是百分比形式（如 20 表示 20%），需要先转换为日收益率变化，
 * 然后计算标准差并年化。
 *
 * 日收益率变化公式（与最大回撤计算一致）：
 * 日收益率变化 = (今日收益率 - 昨日收益率) / (100 + 昨日收益率)
 *
 * @param returnRates - 个人收益率百分比序列（如 [0, 1, 2, 5, 10, ...]）
 * @returns 年化波动率百分比
 */
export function estimateVolatilityFromReturnRates(
  returnRates: number[]
): number {
  if (!returnRates || returnRates.length < 2) {
    return 0;
  }

  // 计算每日收益率变化（与最大回撤公式一致）
  // 日收益率变化 = (今日收益率 - 昨日收益率) / (100 + 昨日收益率)
  const dailyReturns: number[] = [];
  for (let i = 1; i < returnRates.length; i++) {
    const prev = returnRates[i - 1];
    const curr = returnRates[i];
    dailyReturns.push((curr - prev) / (100 + prev));
  }

  if (dailyReturns.length === 0) return 0;

  // 计算标准差
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / dailyReturns.length;
  const stdDev = Math.sqrt(variance);

  // 年化波动率 = 日标准差 * sqrt(252) * 100%
  return stdDev * Math.sqrt(252) * 100;
}

/**
 * 计算当前回撤（基于历史最高净值）
 *
 * 当前回撤 = (历史最高净值 - 当前净值) / 历史最高净值
 *
 * @param navCurve - 单位净值曲线
 * @returns 当前回撤百分比、峰值日期、峰值净值
 */
export function calculateCurrentDrawdown(
  navCurve: { date: string; nav: number }[]
): {
  currentDrawdown: number;
  peakDate: string | null;
  peakNav: number;
} {
  if (!navCurve || navCurve.length === 0) {
    return { currentDrawdown: 0, peakDate: null, peakNav: 0 };
  }

  const currentNav = navCurve[navCurve.length - 1].nav;

  // 找历史最高净值及其日期
  let peakNav = navCurve[0].nav;
  let peakDate = navCurve[0].date;

  for (const point of navCurve) {
    if (point.nav > peakNav) {
      peakNav = point.nav;
      peakDate = point.date;
    }
  }

  // 计算当前回撤（基于历史最高净值）
  const currentDrawdown = peakNav > 0 && currentNav < peakNav
    ? (peakNav - currentNav) / peakNav * 100
    : 0;

  return { currentDrawdown, peakDate, peakNav };
}

/**
 * 回撤计算策略
 * 定义如何计算回撤深度
 */
export type DrawdownStrategy = (peak: number, current: number) => number;

/**
 * 常用策略：百分比回撤
 * 用于净值法回撤计算
 */
export const percentDrawdownStrategy: DrawdownStrategy = (peak, current) =>
  peak > 0 ? (peak - current) / peak * 100 : 0;

/**
 * 常用策略：盈利回撤
 * 用于累计盈亏法回撤计算
 */
export const amountDrawdownStrategy: DrawdownStrategy = (peak, current) =>
  peak - current;

/**
 * 通用回撤计算核心函数（策略模式）
 *
 * 采用正确的回撤计算逻辑：
 * - 历史最大回撤：遍历所有点，记录相对于历史最高点的最大回撤
 * - 当前回撤：从最近的峰值（最后一个比后面所有点都高的点）开始计算
 *
 * 策略模式：调用方传入策略函数决定如何计算回撤深度
 * - 百分比策略：用于净值法，回撤值为百分比
 * - 金额策略：用于累计盈亏法，回撤值为金额
 *
 * @param values 值数组 [{ date, value }]，按日期排序
 * @param strategy 回撤计算策略
 * @returns 回撤信息（峰值、谷底、回撤值等）
 */
export function calculateDrawdownGeneric(
  values: { date: string; value: number }[],
  strategy: DrawdownStrategy
): {
  peakIndex: number;
  peakValue: number;
  peakDate: string;
  troughIndex: number;
  troughValue: number;
  troughDate: string;
  currentDrawdown: number;
  maxDrawdown: number;
  currentDrawdownDays: number;
  maxDrawdownDays: number;
  currentValue: number;
  currentDate: string;
  maxDrawdownPeakIndex: number;
  maxDrawdownPeakValue: number;
  maxDrawdownPeakDate: string;
  maxDrawdownTroughIndex: number;
  maxDrawdownTroughValue: number;
  maxDrawdownTroughDate: string;
} {
  const empty = {
    peakIndex: 0,
    peakValue: 0,
    peakDate: '',
    troughIndex: 0,
    troughValue: 0,
    troughDate: '',
    currentDrawdown: 0,
    maxDrawdown: 0,
    currentDrawdownDays: 0,
    maxDrawdownDays: 0,
    currentValue: 0,
    currentDate: '',
    maxDrawdownPeakIndex: 0,
    maxDrawdownPeakValue: 0,
    maxDrawdownPeakDate: '',
    maxDrawdownTroughIndex: 0,
    maxDrawdownTroughValue: 0,
    maxDrawdownTroughDate: '',
  };

  if (!values || values.length === 0) {
    return empty;
  }

  const lastIndex = values.length - 1;
  const currentValue = values[lastIndex].value;
  const currentDate = values[lastIndex].date;

  if (values.length === 1) {
    return {
      peakIndex: 0,
      peakValue: currentValue,
      peakDate: currentDate,
      troughIndex: 0,
      troughValue: currentValue,
      troughDate: currentDate,
      currentDrawdown: 0,
      maxDrawdown: 0,
      currentDrawdownDays: 0,
      maxDrawdownDays: 0,
      currentValue,
      currentDate,
      maxDrawdownPeakIndex: 0,
      maxDrawdownPeakValue: currentValue,
      maxDrawdownPeakDate: currentDate,
      maxDrawdownTroughIndex: 0,
      maxDrawdownTroughValue: currentValue,
      maxDrawdownTroughDate: currentDate,
    };
  }

  // ========================================
  // 计算历史最大回撤（采用老版本的正确逻辑）
  // ========================================
  let historicalMaxPeakValue = values[0].value;
  let historicalMaxPeakIndex = 0;
  let historicalMaxPeakDate = values[0].date;

  let maxDrawdown = 0;
  let maxDrawdownPeakIndex = 0;
  let maxDrawdownPeakValue = values[0].value;
  let maxDrawdownPeakDate = values[0].date;
  let maxDrawdownTroughIndex = 0;
  let maxDrawdownTroughValue = values[0].value;
  let maxDrawdownTroughDate = values[0].date;

  // 遍历所有点，跟踪历史最高值，计算最大回撤
  for (let i = 0; i < values.length; i++) {
    const pointValue = values[i].value;

    // 更新历史最高值
    if (pointValue > historicalMaxPeakValue) {
      historicalMaxPeakValue = pointValue;
      historicalMaxPeakIndex = i;
      historicalMaxPeakDate = values[i].date;
    }

    // 使用策略计算回撤
    const drawdown = strategy(historicalMaxPeakValue, pointValue);

    // 如果这个回撤更大，更新最大回撤记录
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownTroughIndex = i;
      maxDrawdownTroughValue = pointValue;
      maxDrawdownTroughDate = values[i].date;

      // 记录产生最大回撤时的峰值
      maxDrawdownPeakIndex = historicalMaxPeakIndex;
      maxDrawdownPeakValue = historicalMaxPeakValue;
      maxDrawdownPeakDate = historicalMaxPeakDate;
    }
  }

  // ========================================
  // 计算当前回撤（从最近的峰值开始）
  // ========================================
  // 找最近的峰值：从前往后找最后一个比它之后所有点都高的点
  const suffixMax: number[] = new Array(values.length);
  suffixMax[lastIndex] = values[lastIndex].value;
  for (let i = lastIndex - 1; i >= 0; i--) {
    suffixMax[i] = Math.max(values[i].value, suffixMax[i + 1]);
  }

  let currentPeakIndex = lastIndex;
  let currentPeakValue = currentValue;
  let currentPeakDate = currentDate;

  for (let i = 0; i < lastIndex; i++) {
    if (values[i].value > suffixMax[i + 1]) {
      currentPeakIndex = i;
      currentPeakValue = values[i].value;
      currentPeakDate = values[i].date;
      break;
    }
  }

  // 找谷底：峰值之后的最低点（如果有多个相同最低值，取最新的那个）
  let currentTroughIndex = currentPeakIndex;
  let currentTroughValue = currentPeakValue;
  let currentTroughDate = currentPeakDate;

  for (let i = currentPeakIndex + 1; i <= lastIndex; i++) {
    if (values[i].value < currentTroughValue) {
      currentTroughIndex = i;
      currentTroughValue = values[i].value;
      currentTroughDate = values[i].date;
    }
  }

  // 计算当前回撤
  const currentDrawdown = strategy(currentPeakValue, currentValue);

  // 如果没有回撤（当前值等于峰值），谷底应该是null
  // 注意：返回结构中null用空字符串表示，调用方需要转换
  if (currentDrawdown === 0) {
    currentTroughIndex = currentPeakIndex;
    currentTroughValue = 0;
    currentTroughDate = '';
  }

  // 计算回撤天数
  const currentDrawdownDays = currentDrawdown > 0 ? lastIndex - currentPeakIndex : 0;
  const maxDrawdownDays = maxDrawdown > 0 ? maxDrawdownTroughIndex - maxDrawdownPeakIndex : 0;

  return {
    peakIndex: currentPeakIndex,
    peakValue: currentPeakValue,
    peakDate: currentPeakDate,
    troughIndex: currentTroughIndex,
    troughValue: currentTroughValue,
    troughDate: currentTroughDate,
    currentDrawdown,
    maxDrawdown,
    currentDrawdownDays,
    maxDrawdownDays,
    currentValue,
    currentDate,
    // 历史最大回撤的峰值和谷底信息
    maxDrawdownPeakIndex,
    maxDrawdownPeakValue,
    maxDrawdownPeakDate,
    maxDrawdownTroughIndex,
    maxDrawdownTroughValue,
    maxDrawdownTroughDate,
  };
}

/**
 * 计算当前回撤详细信息（包括峰值和低点）
 *
 * 当前回撤的定义：从最近的峰值（未被后续数据超越的高点）到当前的状态
 * - 峰值：最后一个比它后面所有点都高的点
 * - 低点：峰值之后的最低点
 * - 当前：最新的净值
 *
 * 恢复进度 = (当前净值 - 低点净值) / (峰值净值 - 低点净值) * 100
 *
 * @param navCurve - 单位净值曲线（按日期排序）
 * @returns 当前回撤详细信息
 */
export function calculateCurrentDrawdownDetails(
  navCurve: { date: string; nav: number }[]
): {
  currentDrawdown: number;
  peakDate: string | null;
  peakNav: number;
  troughDate: string | null;
  troughNav: number;
  currentNav: number;
  currentDate: string | null;
  recoveryProgress: number;
  drawdownDays: number;
} {
  if (!navCurve || navCurve.length === 0) {
    return {
      currentDrawdown: 0,
      peakDate: null,
      peakNav: 0,
      troughDate: null,
      troughNav: 0,
      currentNav: 0,
      currentDate: null,
      recoveryProgress: 0,
      drawdownDays: 0,
    };
  }

  // 调用通用回撤计算函数（百分比策略）
  const values = navCurve.map(p => ({ date: p.date, value: p.nav }));
  const result = calculateDrawdownGeneric(values, percentDrawdownStrategy);

  // 计算恢复进度：从低点恢复了多少
  let recoveryProgress = 0;
  if (result.peakValue > result.troughValue) {
    recoveryProgress = (result.currentValue - result.troughValue) / (result.peakValue - result.troughValue) * 100;
    recoveryProgress = Math.max(0, Math.min(100, recoveryProgress));
  }

  return {
    currentDrawdown: result.currentDrawdown,
    peakDate: result.peakDate,
    peakNav: result.peakValue,
    troughDate: result.troughDate,
    troughNav: result.troughValue,
    currentNav: result.currentValue,
    currentDate: result.currentDate,
    recoveryProgress,
    drawdownDays: result.currentDrawdownDays,
  };
}

/**
 * 计算单个基金的个人持仓回撤（基于单位盈利）
 *
 * 核心概念：
 * 1. 成本价 = (初始成本 + 累计买入 - 累计卖出) / 累计份额（实际成本法）
 * 2. 单位盈利 = 净值 - 成本价（每份赚多少钱）
 * 3. 峰值 = 历史上单位盈利最大的那天
 * 4. 回撤 = (峰值单位盈利 - 当前单位盈利) / 峰值单位盈利
 *
 * @param history - 历史净值数据（按日期排序）
 * @param trades - 交易记录（申购/赎回）
 * @param initialShares - 初始份额
 * @param initialPrice - 初始价格（建仓价格）
 * @returns 单位盈利曲线、当前单位盈利、最大回撤等信息
 */
export interface PersonalReturnPoint {
  date: string;
  nav: number;           // 当日基金净值
  shares: number;        // 当日持有份额
  costPrice: number;     // 当日成本价
  unitProfit: number;    // 当日单位盈利（净值 - 成本价）
}

export interface PersonalReturnResult {
  returnCurve: PersonalReturnPoint[];
  currentUnitProfit: number;    // 当前单位盈利
  maxUnitProfit: number;        // 最高单位盈利
  maxDrawdown: number;          // 最大回撤 (%)
  currentDrawdown: number;      // 当前回撤 (%)
  // 波峰波谷详细信息
  peakDate: string | null;     // 波峰日期
  peakUnitProfit: number;      // 波峰单位盈利
  peakNav: number;             // 波峰时基金净值
  peakCostPrice: number;       // 波峰时成本价
  troughDate: string | null;   // 波谷日期
  troughUnitProfit: number;    // 波谷单位盈利
  troughNav: number;           // 波谷时基金净值
  troughCostPrice: number;     // 波谷时成本价
}

export function calculatePersonalReturnCurve(
  history: { date: string; nav: number }[],
  trades: { date: string; type: 'buy' | 'sell' | 'initial'; shares: number; price: number; fee?: number }[],
  initialShares: number,
  initialPrice: number,
  startDate?: string | null  // 可选：建仓日期（持仓记录中的 startDate）
): PersonalReturnResult | null {
  if (!history || history.length === 0) {
    return null;
  }

  // 按日期排序历史净值数据
  const sortedHistory = history.slice().sort((a, b) => a.date.localeCompare(b.date));

  // 确定建仓日期
  let positionStartDate: string | null = startDate || null;
  if (!positionStartDate) {
    const sortedTrades = trades.slice().sort((a, b) => a.date.localeCompare(b.date));
    const initialTrade = sortedTrades.find(t => t.type === 'initial');
    if (initialTrade) {
      positionStartDate = initialTrade.date;
    } else if (initialShares > 0) {
      positionStartDate = sortedHistory[0].date;
    } else {
      const firstBuy = sortedTrades.find(t => t.type === 'buy');
      if (firstBuy) {
        positionStartDate = firstBuy.date;
      }
    }
  }

  if (!positionStartDate) {
    return null;
  }

  // 验证建仓日期是否在历史数据范围内
  const firstHistoryDate = sortedHistory[0].date;
  const lastHistoryDate = sortedHistory[sortedHistory.length - 1].date;
  if (positionStartDate > lastHistoryDate) {
    return null;
  }
  if (positionStartDate < firstHistoryDate) {
    positionStartDate = firstHistoryDate;
  }

  // 获取所有日期列表（从 startDate 开始）
  const dates = sortedHistory.filter(h => h.date >= positionStartDate).map(h => h.date);

  // 过滤掉 initial 类型的交易（初始持仓已通过 initialShares 和 initialPrice 处理）
  const filteredTrades = trades.filter(t => t.type !== 'initial');

  // 使用 computeCostPricesByDate 计算每日成本价（实际成本法，与基金详情页面一致）
  const costPriceMap = computeCostPricesByDate(
    initialShares,
    initialPrice,
    positionStartDate,
    filteredTrades.map((t, index) => ({
      id: `trade-${index}`,
      date: t.date,
      type: t.type as 'buy' | 'sell',
      shares: t.shares,
      price: t.price,
      fee: t.fee || 0
    })),
    dates
  );

  // 构建交易记录映射：用于计算每日份额
  const tradesByDate: Record<string, typeof trades> = {};
  for (const trade of trades) {
    if (!tradesByDate[trade.date]) {
      tradesByDate[trade.date] = [];
    }
    tradesByDate[trade.date].push(trade);
  }

  // 计算每日份额
  let cumulativeShares = initialShares;
  const sharesMap = new Map<string, number>();
  for (const date of dates) {
    // 处理当日的交易
    const dayTrades = tradesByDate[date] || [];
    for (const trade of dayTrades) {
      if (trade.type === 'buy') {
        cumulativeShares += trade.shares;
      } else if (trade.type === 'sell') {
        cumulativeShares -= trade.shares;
      }
    }
    sharesMap.set(date, cumulativeShares);
  }

  // 构建每日单位盈利曲线
  const returnCurve: PersonalReturnPoint[] = [];

  for (const histPoint of sortedHistory) {
    const date = histPoint.date;
    const nav = histPoint.nav;

    // 跳过 startDate 之前的日期
    if (date < positionStartDate) {
      continue;
    }

    // 获取当日成本价
    const costPrice = costPriceMap.get(date);
    const shares = sharesMap.get(date) || 0;

    // 如果没有成本价，跳过
    if (costPrice === null || costPrice === undefined) {
      continue;
    }

    // 计算当日单位盈利
    const unitProfit = nav - costPrice;

    returnCurve.push({
      date,
      nav,
      shares,
      costPrice,
      unitProfit,
    });
  }

  if (returnCurve.length === 0) {
    return null;
  }

  // 获取单位盈利序列
  const unitProfits = returnCurve.map(p => p.unitProfit);
  const maxUnitProfit = Math.max(...unitProfits);
  const currentUnitProfit = unitProfits[unitProfits.length - 1];

  // 找峰值（单位盈利最大的那天）
  let peakIndex = 0;
  let peakUnitProfit = unitProfits[0];
  for (let i = 1; i < unitProfits.length; i++) {
    if (unitProfits[i] > peakUnitProfit) {
      peakUnitProfit = unitProfits[i];
      peakIndex = i;
    }
  }

  const peakPoint = returnCurve[peakIndex];

  // 找低点（峰值后单位盈利最小的那天）
  let troughIndex = peakIndex;
  let troughUnitProfit = peakUnitProfit;
  for (let i = peakIndex; i < unitProfits.length; i++) {
    if (unitProfits[i] < troughUnitProfit) {
      troughUnitProfit = unitProfits[i];
      troughIndex = i;
    }
  }

  const troughPoint = returnCurve[troughIndex];

  // 计算最大回撤（基于净值曲线）
  // 峰值净值 = 历史最高净值
  // 低点净值 = 峰值后最低净值
  // 回撤 = (峰值净值 - 低点净值) / 峰值净值 × 100%
  let peakNav = returnCurve[0].nav;
  let peakNavIndex = 0;
  for (let i = 1; i < returnCurve.length; i++) {
    if (returnCurve[i].nav > peakNav) {
      peakNav = returnCurve[i].nav;
      peakNavIndex = i;
    }
  }

  const peakNavPoint = returnCurve[peakNavIndex];

  // 找低点（峰值后净值最低点）
  let troughNav = peakNav;
  let troughNavIndex = peakNavIndex;
  for (let i = peakNavIndex; i < returnCurve.length; i++) {
    if (returnCurve[i].nav < troughNav) {
      troughNav = returnCurve[i].nav;
      troughNavIndex = i;
    }
  }

  const troughNavPoint = returnCurve[troughNavIndex];

  // 计算净值回撤百分比
  let maxDrawdown = 0;
  let currentDrawdown = 0;

  if (peakNav > 0) {
    maxDrawdown = (peakNav - troughNav) / peakNav * 100;
    const currentNav = returnCurve[returnCurve.length - 1].nav;
    currentDrawdown = (peakNav - currentNav) / peakNav * 100;
  }

  return {
    returnCurve,
    currentUnitProfit,
    maxUnitProfit,
    maxDrawdown,
    currentDrawdown,
    // 净值回撤详细信息
    peakDate: peakNavPoint?.date || null,
    peakNav: peakNav,
    peakUnitProfit: peakNavPoint?.unitProfit || 0,
    peakCostPrice: peakNavPoint?.costPrice || 0,
    troughDate: troughNavPoint?.date || null,
    troughNav: troughNav,
    troughUnitProfit: troughNavPoint?.unitProfit || 0,
    troughCostPrice: troughNavPoint?.costPrice || 0,
  };
}