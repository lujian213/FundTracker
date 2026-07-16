import { TradeRecord, HistoricalPoint, BehaviorAnalysis, BehaviorScore, TimingScore } from '../types';
import { formatDateISO } from './dateFormat';

// ═══════════════════════════════════════════════════════════════════════════════
// 净值索引（用于快速查找）
// ═══════════════════════════════════════════════════════════════════════════════

interface NavIndex {
  dateToNav: Map<string, number>;        // 日期 -> 净值
  dateToReturn: Map<string, number>;     // 日期 -> 涨跌幅
  sortedDates: string[];                 // 排序后的日期列表
}

/**
 * 构建净值索引（一次性遍历，后续查找O(1)）
 * 导出用于测试
 */
export function buildNavIndex(navHistory: HistoricalPoint[]): NavIndex {
  const dateToNav = new Map<string, number>();
  const dateToReturn = new Map<string, number>();
  const sortedDates: string[] = [];

  // 一次性遍历，建立索引
  for (let i = 0; i < navHistory.length; i++) {
    const h = navHistory[i];
    const dateStr = timestampToLocalDate(h.date as number);

    dateToNav.set(dateStr, h.value);
    sortedDates.push(dateStr);

    // 计算涨跌幅（与前一天相比）
    if (i > 0 && navHistory[i - 1].value !== 0) {
      const prevValue = navHistory[i - 1].value;
      const returnPercent = ((h.value - prevValue) / prevValue) * 100;
      dateToReturn.set(dateStr, returnPercent);
    }
  }

  return { dateToNav, dateToReturn, sortedDates };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 计算两个日期之间的天数差
 */
function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * 将timestamp转换为本地日期字符串（YYYY-MM-DD）
 * 使用已有的 formatDateISO 工具函数
 */
function timestampToLocalDate(timestamp: number): string {
  return formatDateISO(new Date(timestamp));
}

/**
 * 获取指定日期前N天的净值数据
 */
function getNavBeforeDate(navHistory: HistoricalPoint[], date: string, days: number): number[] {
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  const startDate = new Date(targetDate);
  startDate.setDate(startDate.getDate() - days);

  return navHistory
    .filter(h => {
      const hDate = new Date(h.date as number);
      hDate.setHours(0, 0, 0, 0);
      return hDate >= startDate && hDate <= targetDate;
    })
    .map(h => h.value);
}

/**
 * 获取指定日期的净值
 */
function getNavOnDate(navHistory: HistoricalPoint[], date: string): number | null {
  const targetDateStr = date; // YYYY-MM-DD

  // 尝试日期字符串匹配
  for (const h of navHistory) {
    const hDateStr = timestampToLocalDate(h.date as number);
    if (hDateStr === targetDateStr) {
      return h.value;
    }
  }

  return null;
}

/**
 * 获取指定日期的涨跌幅（百分比）
 */
function getReturnOnDate(navHistory: HistoricalPoint[], date: string): number {
  // 先找到该日期对应的净值
  const targetDateStr = date;
  let idx = -1;

  for (let i = 0; i < navHistory.length; i++) {
    const hDateStr = timestampToLocalDate(navHistory[i].date as number);
    if (hDateStr === targetDateStr) {
      idx = i;
      break;
    }
  }

  if (idx <= 0) return 0;

  const current = navHistory[idx].value;
  const previous = navHistory[idx - 1].value;

  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

export {
  daysBetween,
  getNavBeforeDate,
  getNavOnDate,
  getReturnOnDate
};

// ═══════════════════════════════════════════════════════════════════════════════
// 时机评分计算
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 计算单笔交易的时机评分（使用索引优化）
 */
export function calculateTradeTimingScore(
  trade: TradeRecord,
  navIndex: NavIndex
): TimingScore {
  // 获取交易日前30天的净值数据
  const navBeforeTrade = getNavBeforeDateByIndex(navIndex, trade.date, 30);

  if (navBeforeTrade.length < 10) {
    return {
      trade,
      score: 60,
      percentile: 50,
      reason: "历史数据不足"
    };
  }

  // 获取交易日的净值（从索引中直接获取）
  const tradeNav = navIndex.dateToNav.get(trade.date);
  if (!tradeNav) {
    return {
      trade,
      score: 60,
      percentile: 50,
      reason: "无法获取交易日净值"
    };
  }

  // 计算交易净值在30天净值中的百分位
  const sortedNavs = [...navBeforeTrade].sort((a, b) => a - b);
  const percentile = sortedNavs.filter(nav => nav < tradeNav).length
                    / sortedNavs.length * 100;

  // 根据交易类型和百分位评分
  let score: number;
  let reason: string;

  if (trade.type === 'buy') {
    // 买入：低位好，高位差
    if (percentile < 30) {
      score = 90;
      reason = "低位买入";
    } else if (percentile <= 70) {
      score = 60;
      reason = "中位买入";
    } else {
      score = 30;
      reason = "高位追涨";
    }
  } else {
    // 卖出：高位好，低位差
    if (percentile > 70) {
      score = 90;
      reason = "高位卖出";
    } else if (percentile >= 30) {
      score = 60;
      reason = "中位卖出";
    } else {
      score = 30;
      reason = "低位杀跌";
    }
  }

  return { trade, score, percentile, reason };
}

/**
 * 获取指定日期前N天的净值数据（使用索引优化）
 */
function getNavBeforeDateByIndex(index: NavIndex, date: string, days: number): number[] {
  const targetDate = new Date(date);
  const startDate = new Date(targetDate);
  startDate.setDate(startDate.getDate() - days);

  const result: number[] = [];

  // 使用二分查找找到起始位置
  let startIdx = 0;
  for (let i = 0; i < index.sortedDates.length; i++) {
    if (index.sortedDates[i] >= date) {
      // 找到大于等于目标日期的位置，往前找
      let checkIdx = i - 1;
      while (checkIdx >= 0) {
        const d = new Date(index.sortedDates[checkIdx]);
        const daysDiff = Math.floor((targetDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff <= days) {
          const nav = index.dateToNav.get(index.sortedDates[checkIdx]);
          if (nav !== undefined) {
            result.push(nav);
          }
        } else {
          break;
        }
        checkIdx--;
      }
      break;
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 情绪化交易识别
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 识别追涨杀跌交易（使用索引优化）
 * 追涨：上涨>3%后买入 且 买入价格高于最近卖出价格（LIFO匹配，追高买入）
 * 杀跌：下跌>3%后卖出 且 卖出价格低于买入价格（LIFO匹配，亏损杀跌）
 */
export function identifyChaseHighSellLow(
  trades: TradeRecord[],
  navIndex: NavIndex
): Array<TradeRecord & { reason: string }> {
  const result: Array<TradeRecord & { reason: string }> = [];

  // 用于匹配买入记录（LIFO：后进先出）
  const buyStack: { date: string; price: number; shares: number }[] = [];
  // 用于匹配卖出记录（LIFO：后进先出）- 判断追涨时使用
  const sellStack: { date: string; price: number; shares: number }[] = [];

  for (const trade of trades) {
    // 从索引中直接获取涨跌幅（O(1)）
    const returnOnDay = navIndex.dateToReturn.get(trade.date) || 0;

    if (trade.type === 'buy') {
      // 加入买入栈（后进先出）
      buyStack.push({
        date: trade.date,
        price: trade.price,
        shares: trade.shares
      });

      // 追涨买入：当天涨幅>3%
      if (returnOnDay > 3) {
        // 检查买入价格是否高于最近的卖出价格（LIFO匹配）
        let isChaseHigh = false;
        let reason = '';

        if (sellStack.length === 0) {
          // 没有卖出记录，算追涨（首次买入在涨幅>3%时）
          isChaseHigh = true;
          reason = `当天涨幅${returnOnDay.toFixed(1)}% > 3%，首次买入`;
        } else {
          // 检查买入价格是否高于栈顶卖出价格
          const lastSell = sellStack[sellStack.length - 1];
          if (trade.price > lastSell.price) {
            isChaseHigh = true;
            reason = `当天涨幅${returnOnDay.toFixed(1)}% > 3%，买入价${trade.price.toFixed(4)} > 最近卖出价${lastSell.price.toFixed(4)}`;
          }
        }

        if (isChaseHigh) {
          result.push({ ...trade, reason });
        }
      }
    } else {
      // 加入卖出栈（后进先出）
      sellStack.push({
        date: trade.date,
        price: trade.price,
        shares: trade.shares
      });

      // 卖出：检查是否为杀跌
      let remaining = trade.shares;
      let isLossSell = false;
      let matchedBuyPrice = 0;

      // 从栈顶（最新买入）开始匹配（LIFO）
      while (remaining > 0 && buyStack.length > 0) {
        const buy = buyStack[buyStack.length - 1]; // 取栈顶（最新）
        const matchedShares = Math.min(remaining, buy.shares);

        // 检查卖出价格是否低于买入价格
        if (trade.price < buy.price) {
          isLossSell = true;
          matchedBuyPrice = buy.price;
          break;
        }

        remaining -= matchedShares;
        buy.shares -= matchedShares;
        if (buy.shares <= 0) buyStack.pop(); // 移除栈顶
      }

      // 杀跌卖出：当天跌幅>3%且亏损卖出
      if (returnOnDay < -3 && isLossSell) {
        const reason = `当天跌幅${Math.abs(returnOnDay).toFixed(1)}% > 3%，卖出价${trade.price.toFixed(4)} < 买入价${matchedBuyPrice.toFixed(4)}`;
        result.push({ ...trade, reason });
      }
    }
  }

  return result;
}

/**
 * 识别亏损的频繁调仓
 * 定义：买入后持有<7天卖出，且卖出价格<买入价格
 * 使用LIFO匹配买入和卖出（后进先出，匹配最近的买入）
 */
export function identifyFrequentLossTrade(
  trades: TradeRecord[]
): Array<TradeRecord & { reason: string }> {
  const result: Array<TradeRecord & { reason: string }> = [];
  const buyStack: { date: string; price: number; shares: number }[] = [];

  for (const trade of trades) {
    if (trade.type === 'buy') {
      buyStack.push({
        date: trade.date,
        price: trade.price,
        shares: trade.shares
      });
    } else {
      // 卖出：从栈顶（最新买入）开始匹配（LIFO）
      const totalSellShares = trade.shares;
      let remaining = trade.shares;

      // 记录匹配的盈亏情况
      let profitShares = 0;  // 盈利匹配的份额
      let lossShares = 0;    // 亏损匹配的份额
      let lossHoldingDays = 0;  // 亏损部分的持有天数
      let lossPercent = '';     // 亏损比例

      const tempBuyStack = [...buyStack]; // 复制栈用于匹配

      while (remaining > 0 && tempBuyStack.length > 0) {
        const buy = tempBuyStack[tempBuyStack.length - 1]; // 栈顶
        const matchedShares = Math.min(remaining, buy.shares);
        const holdingDays = daysBetween(buy.date, trade.date);

        // 只有持有<7天才计入频繁调仓判断
        if (holdingDays < 7) {
          if (trade.price < buy.price) {
            // 亏损匹配
            lossShares += matchedShares;
            lossHoldingDays = holdingDays;
            lossPercent = ((buy.price - trade.price) / buy.price * 100).toFixed(2);
          } else {
            // 盈利匹配
            profitShares += matchedShares;
          }
        }

        remaining -= matchedShares;
        buy.shares -= matchedShares;
        if (buy.shares <= 0) tempBuyStack.pop();
      }

      // 如果有亏损匹配，识别为频繁调仓
      if (lossShares > 0) {
        let reason: string;
        if (profitShares > 0) {
          // 部分亏损卖出
          reason = `持有${lossHoldingDays}天<7天，部分亏损卖出：共${totalSellShares.toFixed(0)}份中${lossShares.toFixed(0)}份亏损${lossPercent}%（其余${profitShares.toFixed(0)}份盈利）`;
        } else {
          // 全部亏损卖出
          reason = `持有${lossHoldingDays}天<7天，亏损${lossPercent}%卖出`;
        }
        result.push({ ...trade, reason });
      }

      // 更新实际的买入栈（完成匹配）
      remaining = trade.shares;
      while (remaining > 0 && buyStack.length > 0) {
        const buy = buyStack[buyStack.length - 1];
        const matchedShares = Math.min(remaining, buy.shares);
        remaining -= matchedShares;
        buy.shares -= matchedShares;
        if (buy.shares <= 0) buyStack.pop();
      }
    }
  }

  return result;
}

/**
 * 识别FOMO买入（使用索引优化）
 * 定义：上涨>5%后买入
 */
export function identifyFOMOBuy(
  trades: TradeRecord[],
  navIndex: NavIndex
): Array<TradeRecord & { reason: string }> {
  return trades.filter(trade => {
    if (trade.type !== 'buy') return false;
    // 从索引中直接获取涨跌幅（O(1)）
    const returnOnDay = navIndex.dateToReturn.get(trade.date) || 0;
    return returnOnDay > 5;
  }).map(trade => {
    const returnOnDay = navIndex.dateToReturn.get(trade.date) || 0;
    const reason = `当天涨幅${returnOnDay.toFixed(1)}% > 5%，FOMO追涨买入`;
    return { ...trade, reason };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 交易纪律评分
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 检测定投模式：每月/每周固定日期买入
 */
function hasRegularInvestment(trades: TradeRecord[]): boolean {
  const buyTrades = trades.filter(t => t.type === 'buy');
  if (buyTrades.length < 3) return false;

  const dates = buyTrades.map(t => new Date(t.date)).sort((a, b) => a.getTime() - b.getTime());

  const intervals: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const days = Math.round((dates[i].getTime() - dates[i-1].getTime()) / (1000 * 60 * 60 * 24));
    intervals.push(days);
  }

  // 检查是否有规律的间隔（月定投或周定投）
  const regularIntervals = intervals.filter(d =>
    (d >= 25 && d <= 35) || (d >= 6 && d <= 8)
  );

  return regularIntervals.length >= intervals.length * 0.6;
}

/**
 * 检测规律的仓位管理：在特定净值位置买入/卖出
 */
function hasRegularPositionManagement(trades: TradeRecord[]): boolean {
  const priceGroups: Map<number, number> = new Map();

  for (const trade of trades) {
    const priceGroup = Math.round(trade.price * 10) / 10;
    priceGroups.set(priceGroup, (priceGroups.get(priceGroup) || 0) + 1);
  }

  for (const count of priceGroups.values()) {
    if (count >= 3) return true;
  }

  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 行为评分计算
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 计算时机选择分（50分）
 */
function calculateTimingScore(avgTimingScore: number): number {
  return Math.round(avgTimingScore * 0.5);
}

/**
 * 计算情绪控制分（30分）
 */
function calculateEmotionScore(
  chaseHighSellLowCount: number,
  frequentLossCount: number,
  fomoCount: number
): number {
  let penalty = 0;

  // 追涨杀跌：每次扣5分，最多扣15分
  penalty += Math.min(15, chaseHighSellLowCount * 5);

  // 亏损的频繁调仓：每次扣3分，最多扣9分
  penalty += Math.min(9, frequentLossCount * 3);

  // FOMO买入：每次扣3分，最多扣6分
  penalty += Math.min(6, fomoCount * 3);

  return Math.max(0, 30 - penalty);
}

/**
 * 计算交易纪律分（20分）
 */
function calculateDisciplineScore(trades: TradeRecord[]): number {
  if (hasRegularInvestment(trades)) return 20;
  if (hasRegularPositionManagement(trades)) return 15;
  return 5;
}

/**
 * 计算行为评分（总分100分）
 */
export function calculateBehaviorScore(
  avgTimingScore: number,
  chaseHighSellLowCount: number,
  frequentLossCount: number,
  fomoCount: number,
  trades: TradeRecord[]
): BehaviorScore {
  const timing = calculateTimingScore(avgTimingScore);
  const emotion = calculateEmotionScore(chaseHighSellLowCount, frequentLossCount, fomoCount);
  const discipline = calculateDisciplineScore(trades);

  return {
    total: timing + emotion + discipline,
    timing,
    emotion,
    discipline
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 主计算函数
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 计算行为分析结果
 */
export function calculateBehaviorAnalysis(
  trades: TradeRecord[],
  navHistory: HistoricalPoint[],
  dateRange?: { from: string; to: string }
): BehaviorAnalysis {
  // 筛选时间范围内的交易（日期1是开区间，日期2是闭区间）
  let filteredTrades = trades;
  if (dateRange) {
    filteredTrades = trades.filter(t =>
      t.date > dateRange.from && t.date <= dateRange.to
    );
  }

  // 按日期排序
  const sortedTrades = [...filteredTrades].sort((a, b) => a.date.localeCompare(b.date));

  // 构建净值索引（一次性遍历，后续查找O(1)）
  const navIndex = buildNavIndex(navHistory);

  // 计算时机评分（使用索引）
  const timingDetails: TimingScore[] = sortedTrades.map(trade =>
    calculateTradeTimingScore(trade, navIndex)
  );

  const avgTimingScore = timingDetails.length > 0
    ? timingDetails.reduce((sum, t) => sum + t.score, 0) / timingDetails.length
    : 60;

  const goodTiming = timingDetails.filter(t => t.score >= 80).map(t => t.trade);
  const normalTiming = timingDetails.filter(t => t.score >= 40 && t.score < 80).map(t => t.trade);
  const badTiming = timingDetails.filter(t => t.score < 40).map(t => t.trade);

  // 识别情绪化交易（使用索引）
  const chaseHighSellLow = identifyChaseHighSellLow(sortedTrades, navIndex);
  const frequentLossTrade = identifyFrequentLossTrade(sortedTrades);
  const fomoBuy = identifyFOMOBuy(sortedTrades, navIndex);

  // 计算行为评分
  const score = calculateBehaviorScore(
    avgTimingScore,
    chaseHighSellLow.length,
    frequentLossTrade.length,
    fomoBuy.length,
    sortedTrades
  );

  // 计算交易频率
  const buyTrades = sortedTrades.filter(t => t.type === 'buy');
  const sellTrades = sortedTrades.filter(t => t.type === 'sell');

  const totalFee = sortedTrades.reduce((sum, t) => sum + (t.fee || 0), 0);
  const totalAmount = sortedTrades.reduce((sum, t) => sum + t.price * t.shares, 0);
  const feeRate = totalAmount > 0 ? (totalFee / totalAmount) * 100 : 0;

  // 计算平均持仓天数（简化：使用所有持仓时间的平均值）
  const avgHoldingDays = 0; // TODO: 需要更复杂的计算

  return {
    score,
    frequency: {
      buyCount: buyTrades.length,
      sellCount: sellTrades.length,
      avgHoldingDays,
      feeRate: Math.round(feeRate * 100) / 100,
      trades: sortedTrades
    },
    emotion: {
      chaseHighSellLow,
      frequentLossTrade,
      fomoBuy
    },
    timing: {
      avgScore: Math.round(avgTimingScore),
      good: goodTiming,
      normal: normalTiming,
      bad: badTiming,
      details: timingDetails
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 行为评分历史对比
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 按时间段筛选交易并计算行为分析
 */
export function calculateBehaviorAnalysisByPeriod(
  trades: TradeRecord[],
  navHistory: HistoricalPoint[],
  startDate: string,
  endDate: string
): BehaviorAnalysis {
  // 按日期范围筛选交易
  const periodTrades = trades.filter(t => t.date >= startDate && t.date <= endDate);

  // 如果没有交易，返回空结果
  if (periodTrades.length === 0) {
    return {
      score: { total: 0, timing: 0, emotion: 0, discipline: 0 },
      frequency: {
        buyCount: 0,
        sellCount: 0,
        avgHoldingDays: 0,
        feeRate: 0,
        trades: []
      },
      emotion: {
        chaseHighSellLow: [],
        frequentLossTrade: [],
        fomoBuy: []
      },
      timing: {
        avgScore: 0,
        good: [],
        normal: [],
        bad: [],
        details: []
      }
    };
  }

  // 使用现有函数计算分析结果
  return calculateBehaviorAnalysis(periodTrades, navHistory, undefined);
}

/**
 * 计算两个时间段的行为评分对比
 */
export function compareBehaviorScores(
  current: BehaviorScore,
  previous: BehaviorScore
): {
  total: number;
  timing: number;
  emotion: number;
  discipline: number;
  improved: boolean;
} {
  const total = current.total - previous.total;
  const timing = current.timing - previous.timing;
  const emotion = current.emotion - previous.emotion;
  const discipline = current.discipline - previous.discipline;

  return {
    total,
    timing,
    emotion,
    discipline,
    improved: total > 0
  };
}