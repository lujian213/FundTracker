/**
 * 日历公共逻辑
 * 提供日历组件共享的工具函数
 */

import { formatMoneyWithSeparators } from './format';

/**
 * 获取盈利金额的颜色类名
 * @param profit 盈利金额
 * @returns Tailwind CSS 类名
 */
export function getProfitColorClass(profit: number): string {
  if (profit > 0) return 'text-red-600';
  if (profit < 0) return 'text-green-600';
  return 'text-gray-700';
}

/**
 * 获取日历格子的背景颜色类名
 * @param profit 盈利金额
 * @param isInRange 是否在期间范围内
 * @returns Tailwind CSS 类名
 */
export function getProfitBgClass(profit: number, isInRange: boolean): string {
  if (!isInRange) return 'bg-gray-100 border-gray-200';

  if (profit > 0) return 'bg-red-50 border-red-100';
  if (profit < 0) return 'bg-green-50 border-green-100';
  return 'bg-white border-gray-200';
}

/**
 * 格式化盈利金额显示
 * @param profit 盈利金额
 * @returns 格式化后的字符串（如 '+1,234.56' 或 '-'）
 */
export function formatProfitDisplay(profit: number): string {
  if (profit === 0) return '-';
  return (profit > 0 ? '+' : '') + formatMoneyWithSeparators(profit);
}

/**
 * 获取导航按钮的样式类名
 * @param canNavigate 是否可以导航
 * @returns Tailwind CSS 类名
 */
export function getNavigationButtonClass(canNavigate: boolean): string {
  return canNavigate
    ? 'text-gray-600 hover:bg-gray-200'
    : 'text-gray-300 cursor-not-allowed';
}

/**
 * 找出盈利数据中的最赚和最亏的索引
 * @param items 盈利数组，包含profit和可选的isInRange
 * @returns 最赚和最亏的索引，如果所有值相同则minIndex为null
 */
export function findExtremeProfitIndexes(
  items: Array<{ profit: number; isInRange?: boolean }>
): { maxIndex: number | null; minIndex: number | null } {
  if (items.length === 0) {
    return { maxIndex: null, minIndex: null };
  }

  // 找出第一个有效项作为初始值
  let firstValidIndex = -1;
  for (let i = 0; i < items.length; i++) {
    if (items[i].isInRange !== false) {
      firstValidIndex = i;
      break;
    }
  }

  // 如果没有有效项
  if (firstValidIndex === -1) {
    return { maxIndex: null, minIndex: null };
  }

  // 初始化最大和最小值
  let maxProfit = items[firstValidIndex].profit;
  let minProfit = items[firstValidIndex].profit;
  let maxIndex = firstValidIndex;
  let minIndex = firstValidIndex;

  // 遍历所有项
  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // 跳过无效项
    if (item.isInRange === false) {
      continue;
    }

    // 更新最大值索引（第一个达到最大值的）
    if (item.profit > maxProfit) {
      maxProfit = item.profit;
      maxIndex = i;
    }

    // 更新最小值索引（第一个达到最小值的）
    if (item.profit < minProfit) {
      minProfit = item.profit;
      minIndex = i;
    }
  }

  // 如果所有值相同，minIndex返回null
  if (maxProfit === minProfit) {
    return { maxIndex, minIndex: null };
  }

  return { maxIndex, minIndex };
}