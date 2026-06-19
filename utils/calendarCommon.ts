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