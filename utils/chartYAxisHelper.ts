/**
 * 图表Y轴范围计算工具
 *
 * 用于计算历史趋势图的Y轴范围，采用基于百分比变化的动态Y轴策略
 */

/**
 * 默认的最小百分比范围（5%）
 * 确保Y轴范围至少占当前净值的5%，让相对变化清晰可见
 */
export const DEFAULT_MIN_PERCENT_RANGE = 0.05;

export interface YAxisRangeResult {
  min: number;      // Y轴最小值
  max: number;      // Y轴最大值
  range: number;    // Y轴范围 (max - min)
}

/**
 * 计算图表Y轴范围
 *
 * 策略：确保Y轴范围至少占当前净值的一定百分比，保证相对变化的视觉清晰度
 *
 * 核心思想：
 * - 基金投资中，相对变化率（百分比）才是投资者真正关心的指标
 * - 避免大净值小波动的基金趋势图过于平缓
 *
 * 算法：
 * 1. 计算数据实际范围（包含成本价）
 * 2. 计算最小百分比范围（当前净值 * minPercentRange）
 * 3. Y轴范围 = max(数据实际范围, 最小百分比范围)
 * 4. 以数据中点为中心，向两侧扩展
 *
 * @param values 数据值数组
 * @param costPrices 成本价数组（可选，用于确保成本价线可见）
 * @param minPercentRange 最小百分比范围，默认0.05（5%）
 * @returns Y轴范围结果
 */
export function calculateYAxisRange(
  values: number[],
  costPrices?: (number | null | undefined)[],
  minPercentRange: number = 0.05
): YAxisRangeResult {
  // 空数据处理
  if (!values || values.length === 0) {
    return {
      min: 0,
      max: 1,
      range: 1
    };
  }

  // 单次遍历计算values的最小最大值
  let rawMin = values[0];
  let rawMax = values[0];
  for (let i = 1; i < values.length; i++) {
    if (values[i] < rawMin) rawMin = values[i];
    if (values[i] > rawMax) rawMax = values[i];
  }

  // 单次遍历扩展最小最大值（包含成本价，不创建新数组）
  if (costPrices) {
    for (const c of costPrices) {
      if (c !== null && c !== undefined && Number.isFinite(c)) {
        if (c < rawMin) rawMin = c;
        if (c > rawMax) rawMax = c;
      }
    }
  }

  const dataRange = rawMax - rawMin;

  // 计算当前净值（使用最新值）
  const currentPrice = values[values.length - 1];

  // 计算最小百分比范围
  const minRange = currentPrice * minPercentRange;

  // Y轴范围 = max(数据实际范围, 最小百分比范围)
  const range = Math.max(dataRange, minRange);

  // 从数据范围的中心向两侧扩展
  // 如果range > dataRange，则需要扩展；否则保持不变
  const expansion = (range - dataRange) / 2;
  const min = rawMin - expansion;
  const max = rawMax + expansion;

  return {
    min,
    max,
    range
  };
}