/**
 * 颜色梯度工具函数
 * 用于根据涨跌幅计算颜色，参照基金卡片的色彩梯度方案
 */

/**
 * 涨跌幅阈值常量
 */
export const COLOR_THRESHOLDS = {
  LIGHT: 1,    // <1%: 浅色区域
  MEDIUM: 3,   // <3%: 中浅色区域，同时也是白色文字阈值
  DARK: 5      // <5%: 中深色区域
} as const;

/**
 * 涨幅区域颜色（参照 Tailwind red-100/200/500/700）
 */
export const GAINER_COLORS = {
  LIGHT: 'rgb(254, 226, 226)',       // red-100: <1%
  MEDIUM_LIGHT: 'rgb(254, 202, 202)', // red-200: 1-3%
  MEDIUM: 'rgb(239, 68, 68)',        // red-500: 3-5%
  DARK: 'rgb(185, 28, 28)'           // red-700: >=5%
} as const;

/**
 * 跌幅区域颜色（参照 Tailwind green-100/200/500/700）
 */
export const LOSER_COLORS = {
  LIGHT: 'rgb(209, 250, 229)',       // green-100: <1%
  MEDIUM_LIGHT: 'rgb(187, 247, 208)', // green-200: 1-3%
  MEDIUM: 'rgb(16, 185, 129)',       // green-500: 3-5%
  DARK: 'rgb(5, 150, 105)'           // green-700: >=5%
} as const;

/**
 * 根据涨跌幅判断是否使用白色文字（深色背景）
 */
export function shouldUseWhiteText(changePercent: number): boolean {
  if (!Number.isFinite(changePercent)) {
    return false;
  }
  const absChange = Math.abs(changePercent);
  // 涨跌幅 >= 3% 使用深色背景，需要白色文字
  return absChange >= COLOR_THRESHOLDS.MEDIUM;
}

/**
 * 根据涨跌幅计算颜色
 * @param changePercent 涨跌幅（百分比）
 * @param isGainer 是否为涨幅区
 * @returns RGB颜色字符串
 */
export function getChangePercentColor(changePercent: number, isGainer: boolean): string {
  // 安全检查：如果 changePercent 不是有效数字，使用默认值
  if (!Number.isFinite(changePercent)) {
    changePercent = 0;
  }

  const absChange = Math.abs(changePercent);
  const colors = isGainer ? GAINER_COLORS : LOSER_COLORS;

  if (absChange < COLOR_THRESHOLDS.LIGHT) {
    return colors.LIGHT;
  } else if (absChange < COLOR_THRESHOLDS.MEDIUM) {
    return colors.MEDIUM_LIGHT;
  } else if (absChange < COLOR_THRESHOLDS.DARK) {
    return colors.MEDIUM;
  } else {
    return colors.DARK;
  }
}