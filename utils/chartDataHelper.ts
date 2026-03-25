import { HistoricalPoint } from '../types';
import { computeMultipleSMAs } from './movingAverage';
import { MA_WINDOWS } from './maConfig';

export interface ChartDataPrepareOptions {
  displayCount?: number;   // 显示的数据点数量，默认90
  maLookback?: number;     // MA计算需要的额外数据点，默认25
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
    maLookback = 25,
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

  // 使用 calcData 计算MA值，确保第一个显示点有完整的MA值
  const calcValues = calcData.map(p => p.value);
  const fullMaValues = computeMultipleSMAs(calcValues, maWindows);

  // 将MA值截取到与displayData相同的长度
  const maValues: Record<number, (number | null)[]> = {};
  for (const w of maWindows) {
    const smaArray = fullMaValues[w] || [];
    maValues[w] = smaArray.length > displayData.length
      ? smaArray.slice(-displayData.length)
      : smaArray;
  }

  return {
    displayData,
    calcData,
    maValues
  };
}