/**
 * 收益归因计算模块
 *
 * 用于计算各个基金对总收益的贡献占比
 */

import { OverallFundRow, AttributionResult, FundAttributionData, OverallProfitPoint, KPIResult, TradeRecord, HistoricalPoint } from '../types';

/**
 * TWR计算结果
 */
interface TWRResult {
  twr: number | null;           // 时间加权收益率
  dailyValues?: {                // 每日市值数据（用于计算最大回撤）
    date: string;
    value: number;
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

  // 返回收益率和每日市值数据
  return {
    twr: returnValue,
    dailyValues: dailyData.map(d => ({ date: d.date, value: d.value })),
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
 * 从市值数据计算最大回撤
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