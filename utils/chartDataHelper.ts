import { HistoricalPoint } from '../types';
import { computeSMAsForLast } from './movingAverage';
import { MA_WINDOWS } from './maConfig';

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