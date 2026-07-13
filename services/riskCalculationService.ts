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
} from '../utils/performanceAttribution';
import { computePositions } from '../utils/positionHelper';
import { computePositionTrend, PositionTrendPoint, Trade, ValuationPoint } from '../utils/positionTrend';
import { computeOverallProfit } from './fundService';
import { formatDateISO } from '../utils/dateFormat';

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

  // 1. 使用整体盈亏的计算逻辑获取累计盈利数据
  const symbols = portfolio.map(t => t.symbol);
  const summary = await computeOverallProfit({ symbols });

  if (!summary || !summary.timeline || summary.timeline.length === 0) {
    return createEmptySnapshot(now);
  }

  // 2. 计算持仓趋势数据（用于年化收益率和净值计算）
  const positionTrendData = await computePositionTrendData(symbols);

  // 3. 计算净值曲线和最大回撤详细信息
  const navCurve = calculateNavCurve(positionTrendData);
  const drawdownDetails = calculateMaxDrawdownDetailsFromNav(positionTrendData);
  const maxDrawdown = drawdownDetails.maxDrawdown;
  const maxDrawdownPeakDate = drawdownDetails.peakDate;
  const maxDrawdownPeakNav = drawdownDetails.peakNav;
  const maxDrawdownTroughDate = drawdownDetails.troughDate;
  const maxDrawdownTroughNav = drawdownDetails.troughNav;
  const maxDrawdownDays = drawdownDetails.drawdownDays;

  // 4. 从净值曲线计算当前回撤详细信息（使用新函数）
  const currentDrawdownDetails = calculateCurrentDrawdownDetails(navCurve);
  const currentDrawdown = currentDrawdownDetails.currentDrawdown;
  const currentDrawdownPeakDate = currentDrawdownDetails.peakDate;
  const currentDrawdownPeakNav = currentDrawdownDetails.peakNav;
  const currentDrawdownTroughDate = currentDrawdownDetails.troughDate;
  const currentDrawdownTroughNav = currentDrawdownDetails.troughNav;
  const currentNav = currentDrawdownDetails.currentNav;
  const currentDate = currentDrawdownDetails.currentDate;
  const currentDrawdownDays = currentDrawdownDetails.drawdownDays;

  // 5. 计算历史最长恢复天数（使用公共函数）
  const maxRecoveryDetails = calculateMaxRecoveryDaysDetails(navCurve);
  const maxRecoveryDays = maxRecoveryDetails.maxRecoveryDays;

  // 6. 检测回撤持续天数（连续下跌）
  const continuousDecline = detectContinuousDeclineFromNav(navCurve);

  // 7. 计算集中度（HHI）
  const hhi = computeHHI(portfolio, marketData);

  // 8. 计算各基金个人回撤（基于个人收益率曲线）
  const fundDrawdowns = computeFundDrawdownsFromPersonalReturn(portfolio);

  // 9. 计算波动率（从净值数据估算）
  const volatility = estimateVolatilityFromNav(navCurve);

  // 10. 计算夏普比率和卡玛比率（使用持仓趋势数据计算年化收益率）
  const annualizedReturn = calculateAnnualizedReturnFromPositionTrend(positionTrendData);
  const sharpeRatio = volatility > 0 && annualizedReturn !== null
    ? (annualizedReturn - 3) / volatility  // 无风险利率3%
    : null;
  const calmarRatio = maxDrawdown > 0 && annualizedReturn !== null
    ? annualizedReturn / maxDrawdown
    : null;

  // 11. 生成预警
  const alerts = generateAlerts(
    portfolio,
    marketData,
    {
      maxDrawdown,
      volatility,
      hhi,
      continuousDecline,
      fundDrawdowns,
    },
    thresholds
  );

  // 12. 计算综合风险评分
  const score = computeRiskScore(
    { maxDrawdown, volatility, hhi, sharpeRatio },
    thresholds
  );

  return {
    score,
    maxDrawdown,
    maxDrawdownPeakDate,
    maxDrawdownPeakProfit: maxDrawdownPeakNav,
    maxDrawdownTroughDate,
    maxDrawdownTroughProfit: maxDrawdownTroughNav,
    maxDrawdownDays,
    currentDrawdown,
    currentDrawdownPeakDate,
    currentDrawdownPeakNav,
    currentDrawdownTroughDate,
    currentDrawdownTroughNav,
    currentNav,
    currentDate,
    currentDrawdownDays,
    maxRecoveryDays,
    maxRecoveryPeakDate: maxRecoveryDetails.peakDate,
    maxRecoveryTroughDate: maxRecoveryDetails.troughDate,
    maxRecoveryRecoveryDate: maxRecoveryDetails.recoveryDate,
    maxRecoveryInProgress: maxRecoveryDetails.isInProgress,
    volatility,
    sharpeRatio,
    calmarRatio,
    hhi,
    continuousDecline,
    alerts,
    fundDrawdowns,
    computedAt: now,
  };
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
 * 从个人收益率曲线计算各基金回撤
 * 使用加权平均成本法计算用户的持仓成本价，然后基于个人收益率曲线计算回撤
 */
function computeFundDrawdownsFromPersonalReturn(
  portfolio: Ticker[]
): FundDrawdown[] {
  const fundDrawdowns: FundDrawdown[] = [];

  for (const ticker of portfolio) {
    const symbol = ticker.symbol;
    try {
      // 获取持仓信息
      const position = getPosition(symbol);
      const initialShares = position?.initialPosition || 0;
      const initialPrice = position?.initialPrice || 0;

      // 获取历史净值数据
      const history = getHistory(symbol) || [];
      if (history.length === 0) continue;

      // 转换为 { date, nav } 格式
      const navHistory = history.map(h => {
        const d = new Date(h.date);
        return { date: formatDateISO(d), nav: h.value };
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

      // 使用个人持仓回撤计算方法
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
        effectiveInitialPrice
      );

      // 如果个人回撤计算失败（如成本已收回），回退到基金净值回撤
      if (!personalResult) {
        // 使用基金净值回撤方法
        const maxDrawdown = navHistory.length > 1
          ? calculateMaxDrawdownFromNav(navHistory)
          : 0;

        // 计算历史最大回撤的详细信息（需要转换为 value 格式）
        const navHistoryForMaxDrawdown = navHistory.map(p => ({ date: p.date, value: p.nav }));
        const maxDrawdownDetails = calculateMaxDrawdownDetailsFromNav(navHistoryForMaxDrawdown);
        const maxPeakNav = maxDrawdownDetails.peakNav;
        const maxPeakDate = maxDrawdownDetails.peakDate || '';
        const maxTroughNav = maxDrawdownDetails.troughNav;
        const maxTroughDate = maxDrawdownDetails.troughDate || '';

        // 计算最大回撤持续天数（使用日历天数）
        const maxDrawdownDays = calculateCalendarDays(maxPeakDate, maxTroughDate);

        // 使用公共函数计算当前回撤信息
        const currentDrawdownDetails = calculateCurrentDrawdownDetails(navHistory);
        const currentDrawdown = currentDrawdownDetails.currentDrawdown;
        const currentPeakDate = currentDrawdownDetails.peakDate || '';
        const currentPeakNav = currentDrawdownDetails.peakNav;
        const currentTroughDate = currentDrawdownDetails.troughDate || '';
        const currentTroughNav = currentDrawdownDetails.troughNav;
        const currentNav = currentDrawdownDetails.currentNav;
        const currentDateNav = currentDrawdownDetails.currentDate || '';

        // 计算当前回撤持续天数（使用日历天数）
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
        });
        continue;
      }

      // 使用公共函数计算当前回撤信息（基于个人收益率）
      // 将个人收益率转换为"净值"形式：returnRate +20% → nav 120
      // 这样可以复用 calculateCurrentDrawdownDetails 函数
      const returnRateCurve = personalResult.returnCurve.map(p => ({
        date: p.date,
        nav: 100 + p.returnRate,  // +20% → 120
      }));
      const currentDrawdownDetails = calculateCurrentDrawdownDetails(returnRateCurve);
      const currentDrawdown = currentDrawdownDetails.currentDrawdown;
      const currentPeakDate = currentDrawdownDetails.peakDate || '';
      const currentTroughDate = currentDrawdownDetails.troughDate || '';
      const currentDateReturn = currentDrawdownDetails.currentDate || '';

      // 计算当前回撤持续天数（使用日历天数）
      const currentDrawdownDays = calculateCalendarDays(currentPeakDate, currentDateReturn);

      // 从原始 returnCurve 获取峰值、当前的净值、收益率
      const peakPoint = personalResult.returnCurve.find(p => p.date === currentPeakDate);
      const currentPoint = personalResult.returnCurve[personalResult.returnCurve.length - 1];
      const currentPeakNav = peakPoint?.nav || 0;
      const currentNav = currentPoint?.nav || 0;
      const peakReturnRate = peakPoint?.returnRate;
      const currentReturnRate = currentPoint?.returnRate;

      // 低点信息：从原始 returnCurve 获取低点的净值和收益率
      const troughPoint = currentTroughDate ? personalResult.returnCurve.find(p => p.date === currentTroughDate) : undefined;
      const currentTroughNav = troughPoint?.nav ?? undefined;
      const troughReturnRate = troughPoint?.returnRate;

      // 计算历史最大回撤的详细信息（基于收益率）
      let maxPeakReturn = personalResult.returnCurve[0]?.returnRate || 0;
      let maxPeakDate = personalResult.returnCurve[0]?.date || '';
      let maxTroughReturn = maxPeakReturn;
      let maxTroughDate = personalResult.returnCurve[0]?.date || '';
      let tempPeakReturn = maxPeakReturn;
      let tempPeakDate = maxPeakDate;

      for (const point of personalResult.returnCurve) {
        if (point.returnRate > tempPeakReturn) {
          tempPeakReturn = point.returnRate;
          tempPeakDate = point.date;
        }
        const drawdown = tempPeakReturn > 0
          ? Math.abs((point.returnRate - tempPeakReturn) / (100 + tempPeakReturn) * 100)
          : 0;
        if (drawdown >= personalResult.maxDrawdown - 0.01) { // 允许小误差
          maxPeakReturn = tempPeakReturn;
          maxPeakDate = tempPeakDate;
          maxTroughReturn = point.returnRate;
          maxTroughDate = point.date;
        }
      }

      // 获取历史最大回撤波峰和波谷时的净值
      const maxPeakPoint = personalResult.returnCurve.find(p => p.date === maxPeakDate);
      const maxTroughPoint = personalResult.returnCurve.find(p => p.date === maxTroughDate);
      const maxDrawdownPeakNav = maxPeakPoint?.nav;
      const maxDrawdownTroughNav = maxTroughPoint?.nav;

      // 最大回撤持续天数（使用日历天数）
      const maxDrawdownDays = calculateCalendarDays(maxPeakDate, maxTroughDate);

      fundDrawdowns.push({
        symbol,
        name: ticker.name,
        currentDrawdown,
        currentDrawdownDays,
        maxDrawdown: personalResult.maxDrawdown,
        maxDrawdownPeakDate: maxPeakDate,
        maxDrawdownTroughDate: maxTroughDate,
        maxDrawdownDays,
        maxDrawdownPeakNav,
        maxDrawdownTroughNav,
        maxDrawdownPeakReturnRate: maxPeakReturn,
        maxDrawdownTroughReturnRate: maxTroughReturn,
        peakDate: currentPeakDate,
        peakValue: currentPeakNav,
        peakReturnRate,
        troughDate: currentTroughDate,
        troughValue: currentTroughNav,
        troughReturnRate,
        currentValue: currentNav,
        currentReturnRate,
      });
    } catch (e) {
      // 单个基金计算失败，跳过
      console.warn(`计算基金 ${symbol} 个人回撤失败:`, e);
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

    // 获取估值数据
    try {
      const hist = getHistory(sym) || [];
      valuationMap[sym] = hist.map(h => {
        const d = new Date(h.date);
        return { date: formatDateISO(d), price: h.value };
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
    maxDrawdown: number;
    volatility: number;
    hhi: number;
    continuousDecline: number;
    fundDrawdowns: FundDrawdown[];
  },
  thresholds: RiskThresholds
): RiskAlert[] {
  const alerts: RiskAlert[] = [];
  const now = new Date().toISOString();

  // 1. 回撤预警
  if (metrics.maxDrawdown >= thresholds.drawdown.high) {
    alerts.push(createAlert(
      'drawdown',
      'high',
      'PORTFOLIO',
      '整体组合',
      metrics.maxDrawdown,
      thresholds.drawdown.high,
      '%',
      now,
      `整体组合回撤${metrics.maxDrawdown.toFixed(2)}%，超过重度预警阈值${thresholds.drawdown.high}%`
    ));
  } else if (metrics.maxDrawdown >= thresholds.drawdown.medium) {
    alerts.push(createAlert(
      'drawdown',
      'medium',
      'PORTFOLIO',
      '整体组合',
      metrics.maxDrawdown,
      thresholds.drawdown.medium,
      '%',
      now,
      `整体组合回撤${metrics.maxDrawdown.toFixed(2)}%，超过中度预警阈值${thresholds.drawdown.medium}%`
    ));
  } else if (metrics.maxDrawdown >= thresholds.drawdown.low) {
    alerts.push(createAlert(
      'drawdown',
      'low',
      'PORTFOLIO',
      '整体组合',
      metrics.maxDrawdown,
      thresholds.drawdown.low,
      '%',
      now,
      `整体组合回撤${metrics.maxDrawdown.toFixed(2)}%，超过轻度预警阈值${thresholds.drawdown.low}%`
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