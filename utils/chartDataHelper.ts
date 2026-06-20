import { HistoricalPoint } from '../types';
import { computeSMAsForLast, computeMultipleSMAs } from './movingAverage';
import { MA_WINDOWS } from './maConfig';
import { toLocalDateKey } from './priceResolver';

// 默认的 MA lookback，取 MA_WINDOWS 最大值，确保第一个显示点有完整的 MA 值
const DEFAULT_MA_LOOKBACK = Math.max(...MA_WINDOWS);

export interface ChartDataPrepareOptions {
  displayCount?: number;   // 显示的数据点数量，默认90
  maLookback?: number;     // MA计算需要的额外数据点，默认取MA_WINDOWS最大值
  maWindows?: number[];    // MA窗口列表，默认 [5, 10, 20]
}

export interface ChartDataPrepareResult {
  displayData: HistoricalPoint[];                              // 用于显示的数据
  calcData: HistoricalPoint[];                                 // 用于计算的数据（包含额外数据点）
  maValues: Record<number, (number | null)[]>;                 // MA值（已截取到displayData长度）
}

/**
 * 为图表准备数据：截取数据、计算MA值
 *
 * @param data 原始历史数据
 * @param options 配置选项
 * @returns 处理后的数据，包含displayData、calcData和maValues
 */
export function prepareChartData(
  data: HistoricalPoint[],
  options: ChartDataPrepareOptions = {}
): ChartDataPrepareResult {
  const {
    displayCount = 90,
    maLookback = DEFAULT_MA_LOOKBACK,
    maWindows = MA_WINDOWS
  } = options;

  // 安全检查：确保数据有效
  if (!data || data.length === 0) {
    return {
      displayData: [],
      calcData: [],
      maValues: Object.fromEntries(maWindows.map(w => [w, []]))
    };
  }

  // 计算需要的数据总量
  const totalNeeded = displayCount + maLookback;

  // 截取用于计算的数据（包含额外数据点用于MA计算）
  const calcData = data.length > totalNeeded
    ? data.slice(-totalNeeded)
    : data;

  // 截取用于显示的数据
  const displayData = calcData.length > displayCount
    ? calcData.slice(-displayCount)
    : calcData;

  // 使用优化函数计算MA值
  const allValues = data.map(p => p.value);
  const maValues = computeSMAsForLast(allValues, displayCount, maWindows);

  return {
    displayData,
    calcData,
    maValues
  };
}

/**
 * 智能准备图表数据
 *
 * 策略：
 * - 最近 displayCount 个点：全部保留（保证趋势清晰）
 * - 早期数据：只保留交易日 + 转折点 + 首尾（简化历史）
 *
 * @param fullData 全量历史净值数据
 * @param options 配置选项
 */
export interface SmartPrepareOptions {
  displayCount?: number;      // 最近保留的点数，默认 90
  preserveDates?: string[];   // 强制保留的日期（交易日 + 建仓日期）
  maWindows?: number[];       // MA 窗口，默认 [5, 10, 20]
  turningThreshold?: number;  // 转折点阈值，默认 0.01（1%变化）
}

export interface SmartPrepareResult {
  displayData: HistoricalPoint[];
  maValues: Record<number, (number | null)[]>;
  keptTradeDates: string[];   // 实际保留的交易日期（用于验证）
  earlyDataStats: {
    totalPoints: number;      // 早期数据总点数
    keptPoints: number;       // 早期保留的点数
    tradePoints: number;      // 早期交易日点数
    turningPoints: number;    // 早期转折点数
  };
}

/**
 * 智能准备图表数据
 *
 * 策略：
 * 1. 数据显示起点 = min(第一笔交易日期, displayCount范围的最早日期)
 * 2. 数据截取起点 = 数据显示起点 - maxWindow（用于MA计算）
 * 3. 在截取后的数据集内计算 MA
 * 4. 在截取后的数据集内做合并/简化：
 *    - displayCount 范围内的点：全部保留
 *    - 早期数据（显示起点到displayCount范围起点之间）：只保留交易日 + 转折点
 *
 * @param fullData 全量历史净值数据
 * @param options 配置选项
 */
export function smartPrepareChartData(
  fullData: HistoricalPoint[],
  options: SmartPrepareOptions = {}
): SmartPrepareResult {
  const {
    displayCount = 90,
    preserveDates = [],
    maWindows = [5, 10, 20],
    turningThreshold = 0.01
  } = options;

  // 空数据处理
  if (!fullData || fullData.length === 0) {
    return {
      displayData: [],
      maValues: Object.fromEntries(maWindows.map(w => [w, []])),
      keptTradeDates: [],
      earlyDataStats: { totalPoints: 0, keptPoints: 0, tradePoints: 0, turningPoints: 0 }
    };
  }

  const maxWindow = Math.max(...maWindows);

  // Step 1: 确定两个候选起点日期
  // 1.1 displayCount 范围的最早日期
  const displayCountStartIdx = fullData.length > displayCount
    ? fullData.length - displayCount
    : 0;
  const displayCountStartDate = toLocalDateKey(fullData[displayCountStartIdx].date);

  // 1.2 第一笔交易日期（最早的）
  const firstTradeDate = preserveDates.length > 0
    ? preserveDates.reduce((min, d) => d < min ? d : min, preserveDates[0])
    : null;

  // Step 2: 数据显示起点 = min(displayCount范围最早日期, 第一笔交易日期)
  let displayStartIdx: number;
  if (firstTradeDate && firstTradeDate < displayCountStartDate) {
    // 第一笔交易日期比 displayCount 范围更早，需要找到其索引
    const tradeIdx = fullData.findIndex(p => toLocalDateKey(p.date) >= firstTradeDate);
    displayStartIdx = tradeIdx >= 0 ? tradeIdx : displayCountStartIdx;
  } else {
    // 第一笔交易在 displayCount 范围内，或无交易记录
    displayStartIdx = displayCountStartIdx;
  }

  // Step 3: 数据截取起点 = 数据显示起点 - maxWindow
  const truncateStartIdx = Math.max(0, displayStartIdx - maxWindow);
  const truncatedData = fullData.slice(truncateStartIdx);

  // Step 4: 在截取后的数据中计算 MA（基于截取数据，但显示从 displayStartIdx 开始）
  const fullMaValues = computeMultipleSMAs(truncatedData.map(p => p.value), maWindows);

  // Step 5: 确定显示数据的分割位置
  // - 数据显示起点在截取数据中的相对位置
  // - displayCount 范围在截取数据中的相对位置
  const displayStartRelativeIdx = displayStartIdx - truncateStartIdx;
  const displayCountRelativeIdx = displayCountStartIdx - truncateStartIdx;

  // recentData = displayCount 范围内的点（全部保留）
  const recentData = truncatedData.length > displayCount
    ? truncatedData.slice(-displayCount)
    : truncatedData.slice(displayStartRelativeIdx);

  // earlyData = 从数据显示起点到 displayCount 范围起点之间的数据（只保留交易日+转折点）
  // 注意：截取起点到显示起点之间的数据只用于MA计算，不显示
  const earlyData = (displayCountRelativeIdx > displayStartRelativeIdx)
    ? truncatedData.slice(displayStartRelativeIdx, displayCountRelativeIdx)
    : [];

  // Step 6: 从早期数据中筛选要保留的点（交易日 + 转折点）- 单次遍历合并两步
  const preserveSet = new Set(preserveDates);
  const earlyKeepIndices = new Set<number>();
  let tradePointCount = 0;
  let turningPointCount = 0;

  for (let i = 0; i < earlyData.length; i++) {
    // 6.1 保留有交易的日期
    if (preserveSet.has(toLocalDateKey(earlyData[i].date))) {
      earlyKeepIndices.add(i);
      tradePointCount++;
    } else if (i >= 1 && i < earlyData.length - 1) {
      // 6.2 保留转折点（净值变化超过阈值）- 仅检查中间点
      const prevVal = earlyData[i - 1].value;
      const currVal = earlyData[i].value;
      const nextVal = earlyData[i + 1].value;

      if (prevVal > 0 && currVal > 0 && nextVal > 0) {
        const isLocalMax = currVal > prevVal && currVal > nextVal;
        const isLocalMin = currVal < prevVal && currVal < nextVal;

        if (isLocalMax || isLocalMin) {
          const changeFromPrev = Math.abs((currVal - prevVal) / prevVal);
          const changeToNext = Math.abs((nextVal - currVal) / currVal);

          if (changeFromPrev >= turningThreshold || changeToNext >= turningThreshold) {
            earlyKeepIndices.add(i);
            turningPointCount++;
          }
        }
      }
    }
  }

  // Step 7: 合并显示数据（只显示从 displayStartIdx 开始的数据）
  const sortedEarlyIndices = Array.from(earlyKeepIndices).sort((a, b) => a - b);
  const earlyDisplay = sortedEarlyIndices.map(i => earlyData[i]);
  const displayData = earlyData.length > 0
    ? [...earlyDisplay, ...recentData]
    : recentData;

  // Step 8: 映射 MA 值到显示数据（使用 Map 避免 O(n²) findIndex）
  const dateToIndex = new Map(truncatedData.map((tp, i) => [tp.date, i]));
  const maValues: Record<number, (number | null)[]> = {};
  for (const w of maWindows) {
    maValues[w] = displayData.map(p => {
      const idx = dateToIndex.get(p.date);
      return idx !== undefined ? fullMaValues[w][idx] : null;
    });
  }

  // Step 9: 统计实际保留的交易日期
  const keptTradeDates = preserveDates.filter(d =>
    displayData.some(p => toLocalDateKey(p.date) === d)
  );

  return {
    displayData,
    maValues,
    keptTradeDates,
    earlyDataStats: {
      totalPoints: earlyData.length,
      keptPoints: earlyKeepIndices.size,
      tradePoints: tradePointCount,
      turningPoints: turningPointCount
    }
  };
}