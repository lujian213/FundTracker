/**
 * 图表Y轴范围计算工具
 */

export const DEFAULT_MIN_PERCENT_RANGE = 0.05;

export interface YAxisRangeResult {
  min: number;
  max: number;
  range: number;
}

/**
 * 计算图表Y轴范围
 *
 * 策略：确保Y轴范围至少占当前净值的一定百分比，保证相对变化的视觉清晰度
 * - 基金投资中，相对变化率（百分比）才是投资者真正关心的指标
 * - 避免大净值小波动的基金趋势图过于平缓
 *
 * @param values 数据值数组
 * @param costPrices 成本价数组（可选，用于确保成本价线可见）
 * @param minPercentRange 最小百分比范围，默认0.05（5%）
 */
export function calculateYAxisRange(
  values: number[],
  costPrices?: (number | null | undefined)[],
  minPercentRange: number = 0.05
): YAxisRangeResult {
  if (!values?.length) {
    return { min: 0, max: 1, range: 1 };
  }

  // 单次遍历计算最小最大值
  let min = values[0];
  let max = values[0];
  for (let i = 1; i < values.length; i++) {
    if (values[i] < min) min = values[i];
    if (values[i] > max) max = values[i];
  }

  // 扩展范围以包含成本价
  if (costPrices) {
    for (const c of costPrices) {
      if (c != null && Number.isFinite(c)) {
        if (c < min) min = c;
        if (c > max) max = c;
      }
    }
  }

  const dataRange = max - min;
  const currentPrice = values[values.length - 1];
  const range = Math.max(dataRange, currentPrice * minPercentRange);

  // 从数据范围中心向两侧扩展
  const padding = (range - dataRange) / 2;
  return { min: min - padding, max: max + padding, range };
}