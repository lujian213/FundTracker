/**
 * riskCalculationService.ts
 *
 * 风险计算服务（核心）
 * 提供风险快照的计算、增量更新和预警生成功能
 */

import {
  Ticker,
  ValuationData,
  RiskSnapshot,
  RiskAlert,
  RiskAlertLevel,
  RiskThresholds,
  FundDrawdown,
  RiskIncrementalState,
  HistoricalPoint,
  TradeRecord,
  DrawdownMethod,
} from '../types';
import { getRiskThresholds, DEFAULT_RISK_THRESHOLDS } from './riskThresholdService';
import { getHistory } from './marketFundService';
import { getTradesForSymbol } from '../hooks/useTrades';
import { getPosition, getValuation } from './marketFundService';
import {
  calculateMaxDrawdownFromValue,
  calculateVolatilityFromValueWithTrades,
  calculateKPIs,
  calculatePortfolioTWR,
  calculateMaxDrawdownFromProfit,
  calculateMaxDrawdownDetails,
  calculateAnnualizedReturnFromPositionTrend,
  calculateNavCurve,
  calculateMaxDrawdownFromNav,
  calculateMaxDrawdownDetailsFromNav,
  calculatePersonalReturnCurve,
  calculateCurrentDrawdown,
  calculateCurrentDrawdownDetails,
  calculateMaxRecoveryDays,
  calculateMaxRecoveryDaysDetails,
  estimateVolatilityFromNav,
  calculateDrawdownGeneric,
  calculateMaxRecoveryGeneric,
  percentDrawdownStrategy,
  amountDrawdownStrategy,
} from '../utils/performanceAttribution';
import { computePositions } from '../utils/positionHelper';
import { computePositionTrend, PositionTrendPoint, Trade, ValuationPoint } from '../utils/positionTrend';
import { computeOverallProfit, prepareHistoryForProfitCalculation } from './fundService';
import { formatDateISO } from '../utils/dateFormat';
import { toLocalDateKey } from '../utils/priceResolver';
import { calculateDrawdownWithFallback } from '../utils/drawdownCalculator';

/**
 * 计算两个日期字符串之间的日历天数差
 * @param startDate 开始日期 (YYYY-MM-DD)
 * @param endDate 结束日期 (YYYY-MM-DD)
 * @returns 日历天数差（如果任一日期无效返回0）
 */
function calculateCalendarDays(startDate: string | null, endDate: string | null): number {
  if (!startDate || !endDate) {
    return 0;
  }
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * 组装回撤快照结果（公共函数）
 * 新老版本使用统一的回撤结果组装逻辑
 */
function buildDrawdownSnapshot(
  drawdownResult: {
    maxDrawdown: number;
    maxDrawdownPeakDate: string;
    maxDrawdownPeakValue: number;
    maxDrawdownTroughDate: string;
    maxDrawdownTroughValue: number;
    currentDrawdown: number;
    peakDate: string;
    peakValue: number;
    troughDate: string;
    troughValue: number;
    currentValue: number;
  },
  maxRecoveryDetails: {
    maxRecoveryDays: number;
    peakDate: string | null;
    troughDate: string | null;
    recoveryDate: string | null;
    isInProgress: boolean;
  },
  fundDrawdowns: FundDrawdown[],
  now: string,
  drawdownMethod: DrawdownMethod
): RiskSnapshot {
  const today = now.slice(0, 10);

  return {
    // 回撤相关字段（统一计算）
    maxDrawdown: drawdownResult.maxDrawdown,
    maxDrawdownPeakDate: drawdownResult.maxDrawdownPeakDate || null,
    maxDrawdownPeakProfit: drawdownResult.maxDrawdownPeakValue,
    maxDrawdownTroughDate: drawdownResult.maxDrawdownTroughDate || null,
    maxDrawdownTroughProfit: drawdownResult.maxDrawdownTroughValue,
    maxDrawdownDays: calculateCalendarDays(drawdownResult.maxDrawdownPeakDate, drawdownResult.maxDrawdownTroughDate),

    currentDrawdown: drawdownResult.currentDrawdown,
    currentDrawdownPeakDate: drawdownResult.peakDate || null,
    currentDrawdownPeakNav: drawdownResult.peakValue,
    currentDrawdownTroughDate: drawdownResult.troughDate || null,
    currentDrawdownTroughNav: drawdownResult.troughValue,
    currentNav: drawdownResult.currentValue,
    currentDate: today,
    currentDrawdownDays: calculateCalendarDays(drawdownResult.peakDate, today),

    maxRecoveryDays: calculateCalendarDays(maxRecoveryDetails.troughDate, maxRecoveryDetails.recoveryDate),
    maxRecoveryPeakDate: maxRecoveryDetails.peakDate,
    maxRecoveryTroughDate: maxRecoveryDetails.troughDate,
    maxRecoveryRecoveryDate: maxRecoveryDetails.recoveryDate,
    maxRecoveryInProgress: maxRecoveryDetails.isInProgress,

    fundDrawdowns,
    computedAt: now,
    drawdownMethod,

    // 非回撤字段（默认值，老版本会覆盖）
    score: 0,
    volatility: 0,
    sharpeRatio: null,
    calmarRatio: null,
    hhi: 0,
    continuousDecline: 0,
    alerts: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 服务状态（内存缓存）
// ═══════════════════════════════════════════════════════════════════════════════

let cachedState: RiskIncrementalState | null = null;

/**
 * 清除风险计算缓存（用于测试）
 */
export function clearRiskCache(): void {
  cachedState = null;
}

/**
 * 获取缓存状态（用于测试）
 */
export function getRiskCacheState(): RiskIncrementalState | null {
  return cachedState;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 公共接口
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 计算风险快照（异步版本）
 * - 复用整体盈亏的累计盈利计算逻辑
 * - 首次调用：全量计算
 * - 后续调用：增量计算（如果数据有变化）
 */
export async function computeRiskSnapshot(
  portfolio: Ticker[],
  marketData: Record<string, ValuationData>
): Promise<RiskSnapshot> {
  const thresholds = getRiskThresholds();
  const now = new Date().toISOString();

  // 1. 并行获取累计盈利数据和持仓趋势数据
  const symbols = portfolio.map(t => t.symbol);
  const [summary, positionTrendData] = await Promise.all([
    computeOverallProfit({ symbols }),
    computePositionTrendData(symbols)
  ]);

  if (!summary || !summary.timeline || summary.timeline.length === 0) {
    return createEmptySnapshot(now);
  }

  // 2. 计算净值曲线和回撤信息（使用统一的通用函数）
  const navCurve = calculateNavCurve(positionTrendData);
  const values = navCurve.map(p => ({ date: p.date, value: p.nav }));
  const drawdownResult = calculateDrawdownGeneric(values, percentDrawdownStrategy);
  const maxRecoveryDetails = calculateMaxRecoveryGeneric(values, percentDrawdownStrategy);

  // 3. 计算各基金回撤（老版本使用单位盈利法）
  const fundDrawdowns = computeFundDrawdownsFromPersonalReturn(portfolio);

  // 4. 使用公共函数组装回撤部分
  const snapshot = buildDrawdownSnapshot(
    drawdownResult,
    maxRecoveryDetails,
    fundDrawdowns,
    now,
    'nav'
  );

  // 5. 补充其他风险指标（仅老版本需要）
  const volatility = estimateVolatilityFromNav(navCurve);
  const annualizedReturn = calculateAnnualizedReturnFromPositionTrend(positionTrendData);
  const sharpeRatio = volatility > 0 && annualizedReturn !== null
    ? (annualizedReturn - 3) / volatility  // 无风险利率3%
    : null;
  const calmarRatio = snapshot.maxDrawdown > 0 && annualizedReturn !== null
    ? annualizedReturn / snapshot.maxDrawdown
    : null;
  const hhi = computeHHI(portfolio, marketData);
  const continuousDecline = detectContinuousDeclineFromNav(navCurve);

  // 6. 生成预警和风险评分
  const alerts = generateAlerts(
    portfolio,
    marketData,
    {
      currentDrawdown: snapshot.currentDrawdown,
      volatility,
      hhi,
      continuousDecline,
      fundDrawdowns,
    },
    thresholds
  );

  const score = computeRiskScore(
    { maxDrawdown: snapshot.maxDrawdown, volatility, hhi, sharpeRatio },
    thresholds
  );

  // 7. 更新 snapshot 中的非回撤字段
  snapshot.score = score;
  snapshot.volatility = volatility;
  snapshot.sharpeRatio = sharpeRatio;
  snapshot.calmarRatio = calmarRatio;
  snapshot.hhi = hhi;
  snapshot.continuousDecline = continuousDecline;
  snapshot.alerts = alerts;

  return snapshot;
}

/**
 * 计算风险快照（Beta版本）
 * - 基于累计盈亏计算回撤
 */
export async function computeRiskSnapshotBeta(
  portfolio: Ticker[],
  marketData: Record<string, ValuationData>
): Promise<RiskSnapshot> {
  const now = new Date().toISOString();

  // 1. 获取累计盈利数据
  const symbols = portfolio.map(t => t.symbol);
  const summary = await computeOverallProfit({ symbols });

  if (!summary || !summary.timeline || summary.timeline.length === 0) {
    return createEmptySnapshot(now);
  }

  // 2. 使用累计盈亏计算回撤
  const profitValues = summary.timeline.map(p => ({
    date: p.date,
    value: p.cumulativeProfit
  }));
  const drawdownResult = calculateDrawdownGeneric(profitValues, amountDrawdownStrategy);
  const maxRecoveryDetails = calculateMaxRecoveryGeneric(profitValues, amountDrawdownStrategy);

  // 3. 计算各基金回撤（使用统一函数）
  const fundDrawdowns = computeFundDrawdowns(portfolio, {
    perFundTimelines: summary.perFundTimelines || {},
    method: 'profit'
  });

  // 4. 使用公共函数组装结果
  return buildDrawdownSnapshot(
    drawdownResult,
    maxRecoveryDetails,
    fundDrawdowns,
    now,
    'profit'
  );
}

/**
 * 创建空的风险快照
 */
function createEmptySnapshot(now: string): RiskSnapshot {
  return {
    score: 0,
    maxDrawdown: 0,
    maxDrawdownPeakDate: null,
    maxDrawdownPeakProfit: 0,
    maxDrawdownTroughDate: null,
    maxDrawdownTroughProfit: 0,
    maxDrawdownDays: 0,
    currentDrawdown: 0,
    currentDrawdownPeakDate: null,
    currentDrawdownPeakNav: 0,
    currentDrawdownTroughDate: null,
    currentDrawdownTroughNav: 0,
    currentNav: 0,
    currentDate: null,
    currentDrawdownDays: 0,
    maxRecoveryDays: 0,
    maxRecoveryPeakDate: null,
    maxRecoveryTroughDate: null,
    maxRecoveryRecoveryDate: null,
    maxRecoveryInProgress: false,
    volatility: 0,
    sharpeRatio: null,
    calmarRatio: null,
    hhi: 0,
    continuousDecline: 0,
    alerts: [],
    fundDrawdowns: [],
    computedAt: now,
  };
}

/**
 * 从累计盈利时间线检测连续下跌天数
 */
function detectContinuousDeclineFromTimeline(
  cumulativeProfits: { date: string; profit: number }[]
): number {
  if (!cumulativeProfits || cumulativeProfits.length < 2) {
    return 0;
  }

  // 找到累计盈利的最高点
  let peakIndex = 0;
  let peakProfit = cumulativeProfits[0].profit;
  for (let i = 1; i < cumulativeProfits.length; i++) {
    if (cumulativeProfits[i].profit > peakProfit) {
      peakProfit = cumulativeProfits[i].profit;
      peakIndex = i;
    }
  }

  // 如果最高点是最后一天，没有回撤
  if (peakIndex === cumulativeProfits.length - 1) {
    return 0;
  }

  // 回撤持续天数 = 从高点到当前的天数
  return cumulativeProfits.length - 1 - peakIndex;
}

/**
 * 计算各基金回撤（统一函数）
 * 根据 method 参数选择计算策略
 * - 'nav': 老版本，使用净值法
 * - 'profit': 新版本，使用累计盈亏法
 */
function computeFundDrawdowns(
  portfolio: Ticker[],
  options: {
    perFundTimelines?: Record<string, { date: string; cumulativeProfit: number }[]>;
    method: 'nav' | 'profit';
  }
): FundDrawdown[] {
  const fundDrawdowns: FundDrawdown[] = [];
  const today = new Date();
  const todayStr = formatDateISO(today);

  for (const ticker of portfolio) {
    const symbol = ticker.symbol;
    try {
      const position = getPosition(symbol);
      const history = getHistory(symbol) || [];
      const valuation = getValuation(symbol);

      if (history.length === 0) continue;

      // 准备净值历史
      const preparedHist = prepareHistoryForProfitCalculation({
        history,
        targetDate: todayStr,
        todayDate: todayStr,
        currentPrice: valuation?.currentPrice,
        realtimeDate: valuation?.realtimeDate,
        previousPrice: valuation?.previousPrice,
        netWorthDate: valuation?.netWorthDate,
      });

      const navHistory = preparedHist.map(h => ({
        date: formatDateISO(new Date(h.date)),
        nav: h.value
      })).sort((a, b) => a.date.localeCompare(b.date));

      // 根据 method 选择数据源
      let drawdownResult;
      let drawdownMethod: 'profit' | 'nav';

      if (options.method === 'profit' && options.perFundTimelines?.[symbol]) {
        // 新版本逻辑：使用累计盈亏
        const profitValues = options.perFundTimelines[symbol].map(p => ({
          date: p.date,
          value: p.cumulativeProfit
        }));
        drawdownResult = calculateDrawdownGeneric(profitValues, amountDrawdownStrategy);
        drawdownMethod = 'profit';
      } else {
        // 老版本逻辑：使用净值
        const navValues = navHistory.map(p => ({ date: p.date, value: p.nav }));
        drawdownResult = calculateDrawdownGeneric(navValues, percentDrawdownStrategy);
        drawdownMethod = 'nav';
      }

      // 统一组装结果（使用日历天数）
      fundDrawdowns.push({
        symbol,
        name: ticker.name,
        currentDrawdown: drawdownResult.currentDrawdown,
        currentDrawdownDays: calculateCalendarDays(drawdownResult.peakDate, todayStr),
        maxDrawdown: drawdownResult.maxDrawdown,
        maxDrawdownPeakDate: drawdownResult.maxDrawdownPeakDate || '',
        maxDrawdownTroughDate: drawdownResult.maxDrawdownTroughDate || '',
        maxDrawdownDays: calculateCalendarDays(drawdownResult.maxDrawdownPeakDate, drawdownResult.maxDrawdownTroughDate),
        maxDrawdownPeakNav: drawdownResult.maxDrawdownPeakValue,
        maxDrawdownTroughNav: drawdownResult.maxDrawdownTroughValue,
        peakDate: drawdownResult.peakDate || '',
        peakValue: drawdownResult.peakValue,
        troughDate: drawdownResult.troughDate || '',
        troughValue: drawdownResult.troughValue,
        currentValue: drawdownResult.currentValue,
        drawdownMethod,
      });
    } catch (e) {
      console.warn(`计算基金 ${symbol} 回撤失败:`, e);
    }
  }

  return fundDrawdowns;
}

/**
 * 从个人收益率曲线计算各基金回撤
 * 使用单位盈利法计算：单位盈利 = 净值 - 成本价
 */
function computeFundDrawdownsFromPersonalReturn(
  portfolio: Ticker[]
): FundDrawdown[] {
  const fundDrawdowns: FundDrawdown[] = [];
  const today = new Date();
  const todayStr = formatDateISO(today);

  for (const ticker of portfolio) {
    const symbol = ticker.symbol;
    try {
      // 获取持仓信息
      const position = getPosition(symbol);
      const initialShares = position?.initialPosition || 0;
      const initialPrice = position?.initialPrice || 0;

      // 获取历史净值数据和当前估值
      const history = getHistory(symbol) || [];
      const valuation = getValuation(symbol);
      if (history.length === 0) continue;

      // 使用 prepareHistoryForProfitCalculation 合并历史数据和当前估值
      const preparedHist = prepareHistoryForProfitCalculation({
        history,
        targetDate: todayStr,
        todayDate: todayStr,
        currentPrice: valuation?.currentPrice,
        realtimeDate: valuation?.realtimeDate,
        previousPrice: valuation?.previousPrice,
        netWorthDate: valuation?.netWorthDate,
      });

      // 转换为 { date, nav } 格式
      const navHistory = preparedHist.map(h => {
        return { date: formatDateISO(new Date(h.date)), nav: h.value };
      }).sort((a, b) => a.date.localeCompare(b.date));

      // 获取交易记录
      const trades = getTradesForSymbol(symbol) || [];

      // 确定有效的初始份额和价格
      let effectiveInitialShares = initialShares;
      let effectiveInitialPrice = initialPrice;

      // 如果没有初始持仓，从第一笔买入交易获取
      if (initialShares === 0) {
        const firstBuy = trades.find(t => t.type === 'buy');
        if (!firstBuy) continue; // 没有买入记录，跳过
        effectiveInitialShares = firstBuy.shares;
        effectiveInitialPrice = firstBuy.price || 0;
      }

      // 使用单位盈利法计算回撤
      const personalResult = calculatePersonalReturnCurve(
        navHistory,
        trades.map(t => ({
          date: t.date,
          type: t.type as 'buy' | 'sell' | 'initial',
          shares: t.shares,
          price: t.price || 0,
          fee: t.fee || 0,
        })),
        effectiveInitialShares,
        effectiveInitialPrice,
        position?.startDate  // 传递建仓日期
      );

      // 如果计算失败，回退到基金净值回撤
      if (!personalResult) {
        // 使用基金净值回撤方法
        const maxDrawdown = navHistory.length > 1
          ? calculateMaxDrawdownFromNav(navHistory)
          : 0;

        // 计算历史最大回撤的详细信息
        const navHistoryForMaxDrawdown = navHistory.map(p => ({ date: p.date, value: p.nav }));
        const maxDrawdownDetails = calculateMaxDrawdownDetailsFromNav(navHistoryForMaxDrawdown);
        const maxPeakNav = maxDrawdownDetails.peakNav;
        const maxPeakDate = maxDrawdownDetails.peakDate || '';
        const maxTroughNav = maxDrawdownDetails.troughNav;
        const maxTroughDate = maxDrawdownDetails.troughDate || '';

        const maxDrawdownDays = calculateCalendarDays(maxPeakDate, maxTroughDate);

        const currentDrawdownDetails = calculateCurrentDrawdownDetails(navHistory);
        const currentDrawdown = currentDrawdownDetails.currentDrawdown;
        const currentPeakDate = currentDrawdownDetails.peakDate || '';
        const currentPeakNav = currentDrawdownDetails.peakNav;
        const currentTroughDate = currentDrawdownDetails.troughDate || '';
        const currentTroughNav = currentDrawdownDetails.troughNav;
        const currentNav = currentDrawdownDetails.currentNav;
        const currentDateNav = currentDrawdownDetails.currentDate || '';

        const currentDrawdownDays = calculateCalendarDays(currentPeakDate, currentDateNav);

        fundDrawdowns.push({
          symbol,
          name: ticker.name,
          currentDrawdown,
          currentDrawdownDays,
          maxDrawdown,
          maxDrawdownPeakDate: maxPeakDate,
          maxDrawdownTroughDate: maxTroughDate,
          maxDrawdownDays,
          maxDrawdownPeakNav: maxPeakNav,
          maxDrawdownTroughNav: maxTroughNav,
          peakDate: currentPeakDate,
          peakValue: currentPeakNav,
          troughDate: currentTroughDate,
          troughValue: currentTroughNav,
          currentValue: currentNav,
          drawdownMethod: 'nav',  // 老版本使用净值法
        });
        continue;
      }

      // 使用单位盈利法的结果
      const currentDrawdown = personalResult.currentDrawdown;
      const maxDrawdown = personalResult.maxDrawdown;

      // 计算持续天数
      const maxDrawdownDays = calculateCalendarDays(personalResult.peakDate || '', personalResult.troughDate || '');
      const currentDrawdownDays = calculateCalendarDays(personalResult.peakDate || '', todayStr);

      // 当前单位盈利
      const currentPoint = personalResult.returnCurve[personalResult.returnCurve.length - 1];

      fundDrawdowns.push({
        symbol,
        name: ticker.name,
        currentDrawdown,
        currentDrawdownDays,
        maxDrawdown,
        maxDrawdownPeakDate: personalResult.peakDate || '',
        maxDrawdownTroughDate: personalResult.troughDate || '',
        maxDrawdownDays,
        maxDrawdownPeakNav: personalResult.peakNav,
        maxDrawdownTroughNav: personalResult.troughNav,
        maxDrawdownPeakCostPrice: personalResult.peakCostPrice,
        maxDrawdownTroughCostPrice: personalResult.troughCostPrice,
        maxDrawdownPeakUnitProfit: personalResult.peakUnitProfit,
        maxDrawdownTroughUnitProfit: personalResult.troughUnitProfit,
        peakDate: personalResult.peakDate || '',
        peakValue: personalResult.peakNav,
        peakCostPrice: personalResult.peakCostPrice,
        peakUnitProfit: personalResult.peakUnitProfit,
        troughDate: personalResult.troughDate || '',
        troughValue: personalResult.troughNav,
        troughCostPrice: personalResult.troughCostPrice,
        troughUnitProfit: personalResult.troughUnitProfit,
        currentValue: currentPoint?.nav || 0,
        currentCostPrice: currentPoint?.costPrice,
        currentUnitProfit: currentPoint?.unitProfit,
        drawdownMethod: 'nav',  // 老版本使用净值法
      });
    } catch (e) {
      // 单个基金计算失败，跳过
      console.warn(`计算基金 ${symbol} 回撤失败:`, e);
    }
  }

  return fundDrawdowns;
}

/**
 * 从累计盈利时间线估算波动率
 */
function estimateVolatilityFromTimeline(
  cumulativeProfits: { date: string; profit: number }[]
): number {
  if (!cumulativeProfits || cumulativeProfits.length < 2) {
    return 0;
  }

  // 计算日收益率
  const dailyReturns: number[] = [];
  for (let i = 1; i < cumulativeProfits.length; i++) {
    const prev = cumulativeProfits[i - 1].profit;
    const curr = cumulativeProfits[i].profit;
    if (prev !== 0) {
      dailyReturns.push((curr - prev) / Math.abs(prev));
    }
  }

  if (dailyReturns.length === 0) return 0;

  // 计算标准差
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / dailyReturns.length;
  const stdDev = Math.sqrt(variance);

  // 年化波动率 = 日标准差 * sqrt(252)
  return stdDev * Math.sqrt(252) * 100;
}

/**
 * 从净值曲线检测连续下跌天数
 * 定义：从高点开始，连续下跌的天数（每天净值都比前一天低），遇到上涨就停止
 */
function detectContinuousDeclineFromNav(
  navCurve: { date: string; nav: number }[]
): number {
  if (!navCurve || navCurve.length < 2) {
    return 0;
  }

  // 找到净值的最高点
  let peakIndex = 0;
  let peakNav = navCurve[0].nav;
  for (let i = 1; i < navCurve.length; i++) {
    if (navCurve[i].nav > peakNav) {
      peakNav = navCurve[i].nav;
      peakIndex = i;
    }
  }

  // 如果最高点是最后一天，没有回撤
  if (peakIndex === navCurve.length - 1) {
    return 0;
  }

  // 从高点开始，计算连续下跌的天数（遇到上涨就停止）
  let continuousDays = 0;
  for (let i = peakIndex + 1; i < navCurve.length; i++) {
    if (navCurve[i].nav < navCurve[i - 1].nav) {
      continuousDays++;
    } else {
      // 遇到上涨或持平，停止计数
      break;
    }
  }

  return continuousDays;
}

/**
 * 计算持仓趋势数据（完整数据，用于波动率计算）
 */
export async function computePositionTrendData(
  symbols: string[]
): Promise<{ date: string; value: number; netInvestment?: number }[]> {
  const today = new Date();
  const todayStr = formatDateISO(today);

  // 确定起始日期（从所有基金的startDate中找最早的）
  let earliest: string | null = null;
  for (const sym of symbols) {
    const pos = getPosition(sym);
    if (pos && pos.startDate) {
      if (!earliest || pos.startDate < earliest) {
        earliest = pos.startDate;
      }
    }
  }

  if (!earliest) {
    return [];
  }

  // 准备持仓趋势计算所需的输入数据
  const tradesMap: Record<string, Trade[]> = {};
  const valuationMap: Record<string, ValuationPoint[]> = {};
  const initialPositions: Record<string, number> = {};

  for (const sym of symbols) {
    // 获取交易记录
    try {
      const arr = getTradesForSymbol(sym) || [];
      tradesMap[sym] = arr.map(t => ({
        id: t.id,
        date: t.date,
        type: t.type as any,
        shares: t.shares,
        price: t.price,
        fee: t.fee || 0
      }));
    } catch (e) { tradesMap[sym] = []; }

    // 获取估值数据（使用 prepareHistoryForProfitCalculation 包含当日估值）
    try {
      const hist = getHistory(sym) || [];
      const val = getValuation(sym);

      // 使用与整体盈亏相同的逻辑，把当日估值也计算进去
      const preparedHist = prepareHistoryForProfitCalculation({
        history: hist,
        targetDate: todayStr,
        todayDate: todayStr,
        currentPrice: val?.currentPrice,
        realtimeDate: val?.realtimeDate,
        previousPrice: val?.previousPrice,
        netWorthDate: val?.netWorthDate,
      });

      valuationMap[sym] = preparedHist.map(h => {
        return { date: formatDateISO(new Date(h.date)), price: h.value };
      });
    } catch (e) { valuationMap[sym] = []; }

    // 获取初始持仓
    try {
      const pos = getPosition(sym);
      initialPositions[sym] = pos?.initialPosition || 0;

      // 添加建仓记录到tradesMap（用于净投入计算）
      if (pos && pos.initialPosition > 0 && pos.initialPrice && pos.startDate) {
        const initialTrade = {
          id: '__initial__',
          date: pos.startDate,
          type: 'initial' as const,
          shares: pos.initialPosition,
          price: pos.initialPrice,
          fee: 0
        };
        tradesMap[sym] = [...(tradesMap[sym] || []), initialTrade];
      }
    } catch (e) { initialPositions[sym] = 0; }
  }

  // 计算持仓趋势
  const input = {
    symbols,
    initialPositions,
    trades: tradesMap,
    valuationHistory: valuationMap,
    startDate: earliest,
    endDate: todayStr
  };

  return computePositionTrend(input);
}

/**
 * 计算HHI集中度指数
 * HHI = Σ(占比²)，范围0-1，越低越分散
 */
function computeHHI(
  portfolio: Ticker[],
  marketData: Record<string, ValuationData>
): number {
  const positions = computePositions(
    portfolio.filter((t) => {
      const pos = getPosition(t.symbol);
      return pos && pos.fullCapacity > 0;
    }),
    marketData
  );

  if (positions.entries.length === 0) {
    return 0;
  }

  // HHI = Σ(ratio²)，ratio是0-1之间的小数
  return positions.entries.reduce((sum, entry) => {
    const ratio = entry.ratio;
    return sum + ratio * ratio;
  }, 0);
}

/**
 * 生成预警列表
 */
function generateAlerts(
  portfolio: Ticker[],
  marketData: Record<string, ValuationData>,
  metrics: {
    currentDrawdown: number;
    volatility: number;
    hhi: number;
    continuousDecline: number;
    fundDrawdowns: FundDrawdown[];
  },
  thresholds: RiskThresholds
): RiskAlert[] {
  const alerts: RiskAlert[] = [];
  const now = new Date().toISOString();

  // 1. 回撤预警（使用当前回撤）
  if (metrics.currentDrawdown >= thresholds.drawdown.high) {
    alerts.push(createAlert(
      'drawdown',
      'high',
      'PORTFOLIO',
      '整体组合',
      metrics.currentDrawdown,
      thresholds.drawdown.high,
      '%',
      now,
      `整体组合当前回撤${metrics.currentDrawdown.toFixed(2)}%，超过重度预警阈值${thresholds.drawdown.high}%`
    ));
  } else if (metrics.currentDrawdown >= thresholds.drawdown.medium) {
    alerts.push(createAlert(
      'drawdown',
      'medium',
      'PORTFOLIO',
      '整体组合',
      metrics.currentDrawdown,
      thresholds.drawdown.medium,
      '%',
      now,
      `整体组合当前回撤${metrics.currentDrawdown.toFixed(2)}%，超过中度预警阈值${thresholds.drawdown.medium}%`
    ));
  } else if (metrics.currentDrawdown >= thresholds.drawdown.low) {
    alerts.push(createAlert(
      'drawdown',
      'low',
      'PORTFOLIO',
      '整体组合',
      metrics.currentDrawdown,
      thresholds.drawdown.low,
      '%',
      now,
      `整体组合当前回撤${metrics.currentDrawdown.toFixed(2)}%，超过轻度预警阈值${thresholds.drawdown.low}%`
    ));
  }

  // 2. 波动率预警
  if (metrics.volatility >= thresholds.volatility.high) {
    alerts.push(createAlert(
      'volatility',
      'high',
      'PORTFOLIO',
      '整体组合',
      metrics.volatility,
      thresholds.volatility.high,
      '%',
      now,
      `整体组合波动率${metrics.volatility.toFixed(2)}%，超过高波动阈值${thresholds.volatility.high}%`
    ));
  }

  // 3. 集中度预警
  const positions = computePositions(
    portfolio.filter((t) => {
      const pos = getPosition(t.symbol);
      return pos && pos.fullCapacity > 0;
    }),
    marketData
  );

  if (positions.entries.length > 0) {
    const topFund = positions.entries[0];
    if (topFund.ratio * 100 >= thresholds.concentration.singleFund) {
      alerts.push(createAlert(
        'concentration',
        'medium',
        topFund.symbol,
        topFund.name,
        topFund.ratio * 100,
        thresholds.concentration.singleFund,
        '%',
        now,
        `${topFund.name}占比${(topFund.ratio * 100).toFixed(2)}%，超过单基金上限${thresholds.concentration.singleFund}%`
      ));
    }

    const topThreeRatio = positions.entries.slice(0, 3).reduce((sum, e) => sum + e.ratio, 0) * 100;
    if (topThreeRatio >= thresholds.concentration.topThree) {
      alerts.push(createAlert(
        'concentration',
        'medium',
        'PORTFOLIO',
        '整体组合',
        topThreeRatio,
        thresholds.concentration.topThree,
        '%',
        now,
        `前三基金合计占比${topThreeRatio.toFixed(2)}%，超过上限${thresholds.concentration.topThree}%`
      ));
    }
  }

  // 4. 连续下跌预警
  if (metrics.continuousDecline >= thresholds.continuousDecline.high) {
    alerts.push(createAlert(
      'continuous_decline',
      'high',
      'PORTFOLIO',
      '整体组合',
      metrics.continuousDecline,
      thresholds.continuousDecline.high,
      '天',
      now,
      `整体组合连续下跌${metrics.continuousDecline}天，达到高度关注阈值`
    ));
  } else if (metrics.continuousDecline >= thresholds.continuousDecline.low) {
    alerts.push(createAlert(
      'continuous_decline',
      'low',
      'PORTFOLIO',
      '整体组合',
      metrics.continuousDecline,
      thresholds.continuousDecline.low,
      '天',
      now,
      `整体组合连续下跌${metrics.continuousDecline}天，达到轻度关注阈值`
    ));
  }

  return alerts;
}

/**
 * 创建预警对象
 */
function createAlert(
  type: RiskAlert['type'],
  level: RiskAlertLevel,
  target: string,
  targetName: string,
  currentValue: number,
  threshold: number,
  unit: string,
  triggeredAt: string,
  message: string
): RiskAlert {
  return {
    id: `${type}-${target}-${triggeredAt}`,
    type,
    level,
    target,
    targetName,
    currentValue,
    threshold,
    unit,
    triggeredAt,
    message,
  };
}

/**
 * 计算综合风险评分
 * 评分范围0-100，越高越安全
 */
function computeRiskScore(
  metrics: {
    maxDrawdown: number;
    volatility: number;
    hhi: number;
    sharpeRatio: number | null;
  },
  thresholds: RiskThresholds
): number {
  // 各分项得分（0-100）
  // 1. 回撤得分：回撤越低，得分越高
  const drawdownScore = Math.max(0, 100 - (metrics.maxDrawdown / thresholds.drawdown.high) * 100);

  // 2. 波动得分：波动越低，得分越高
  const volatilityScore = Math.max(0, 100 - (metrics.volatility / thresholds.volatility.high) * 100);

  // 3. 集中度得分：HHI越低，得分越高（HHI范围0-1）
  const concentrationScore = Math.max(0, 100 - metrics.hhi * 200);

  // 4. 夏普比率得分：夏普越高，得分越高
  // 夏普比率标准：<0不佳(0分), 0-1一般(50分), 1-2良好(75分), >2优秀(100分)
  // 当夏普比率不可用时（空持仓），跳过该项，重新分配权重
  let sharpeScore = 0;
  let sharpeWeight = 0.15;

  if (metrics.sharpeRatio !== null) {
    if (metrics.sharpeRatio >= 2) {
      sharpeScore = 100;
    } else if (metrics.sharpeRatio >= 1) {
      sharpeScore = 50 + (metrics.sharpeRatio - 1) * 25; // 1-2之间映射到50-100
    } else if (metrics.sharpeRatio >= 0) {
      sharpeScore = metrics.sharpeRatio * 50; // 0-1之间映射到0-50
    }
    // 夏普比率<0时，得分=0
  } else {
    // 夏普比率不可用（如空持仓），将该权重分配给其他三项
    sharpeWeight = 0;
  }

  // 基础权重
  const baseWeights = { drawdown: 0.4, volatility: 0.25, concentration: 0.2 };

  // 当夏普比率不可用时，重新分配权重
  const totalBaseWeight = baseWeights.drawdown + baseWeights.volatility + baseWeights.concentration + sharpeWeight;
  const adjustedDrawdownWeight = baseWeights.drawdown / totalBaseWeight;
  const adjustedVolatilityWeight = baseWeights.volatility / totalBaseWeight;
  const adjustedConcentrationWeight = baseWeights.concentration / totalBaseWeight;
  const adjustedSharpeWeight = sharpeWeight / totalBaseWeight;

  // 加权平均
  const weightedScore =
    drawdownScore * adjustedDrawdownWeight +
    volatilityScore * adjustedVolatilityWeight +
    concentrationScore * adjustedConcentrationWeight +
    sharpeScore * adjustedSharpeWeight;

  return Math.round(weightedScore);
}

/**
 * 计算投资组合数据指纹
 */
function computePortfolioHash(portfolio: Ticker[]): string {
  const symbols = portfolio.map((t) => t.symbol).sort();
  return symbols.join(',');
}

/**
 * 计算历史数据指纹
 */
function computeHistoryHash(portfolio: Ticker[]): string {
  const hashes: string[] = [];

  for (const ticker of portfolio) {
    const history = getHistory(ticker.symbol);
    if (history && history.length > 0) {
      // 使用最后一条数据的日期作为指纹
      const lastDate = history[history.length - 1].date;
      hashes.push(`${ticker.symbol}:${lastDate}`);
    }
  }

  return hashes.join('|');
}