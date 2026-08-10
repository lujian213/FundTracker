/**
 * 风险等级辅助函数
 * 用于风险评分的颜色和等级判断
 */

/**
 * 风险等级信息
 */
export interface RiskLevelInfo {
  text: string;
  icon: string;
  color: string;
}

/**
 * 根据风险评分获取背景颜色类名
 * @param score 风险评分 (0-100)
 * @returns Tailwind CSS 类名
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return 'bg-gradient-to-br from-green-500 to-green-600';
  if (score >= 60) return 'bg-gradient-to-br from-yellow-500 to-yellow-600';
  if (score >= 40) return 'bg-gradient-to-br from-orange-500 to-orange-600';
  return 'bg-gradient-to-br from-red-500 to-red-600';
}

/**
 * 根据风险评分获取风险等级信息
 * @param score 风险评分 (0-100)
 * @returns 风险等级信息（文字、图标、颜色）
 */
export function getRiskLevel(score: number): RiskLevelInfo {
  if (score >= 80) return { text: '低风险', icon: '🟢', color: 'text-green-600' };
  if (score >= 60) return { text: '中低风险', icon: '🟡', color: 'text-yellow-600' };
  if (score >= 40) return { text: '中等风险', icon: '🟠', color: 'text-orange-600' };
  return { text: '高风险', icon: '🔴', color: 'text-red-600' };
}

/**
 * 根据预警等级获取样式类名
 * @param level 预警等级 ('low' | 'medium' | 'high')
 * @returns 背景色和文字色的 Tailwind CSS 类名
 */
export function getAlertLevelStyle(level: 'low' | 'medium' | 'high'): string {
  switch (level) {
    case 'high':
      return 'bg-red-500 text-white';
    case 'medium':
      return 'bg-orange-500 text-white';
    case 'low':
      return 'bg-green-500 text-white';
  }
}

/**
 * 根据预警等级获取徽章样式
 * @param level 预警等级
 * @returns 徽章的 Tailwind CSS 类名
 */
export function getAlertBadgeStyle(level: 'low' | 'medium' | 'high'): string {
  switch (level) {
    case 'high':
      return 'bg-red-200 text-red-800';
    case 'medium':
      return 'bg-orange-200 text-orange-800';
    case 'low':
      return 'bg-green-200 text-green-800';
  }
}

/**
 * 回撤预警等级类型
 */
export type DrawdownLevel = 'normal' | 'low' | 'medium' | 'high';

/**
 * 回撤状态信息
 */
export interface DrawdownStatusInfo {
  level: DrawdownLevel;
  style: string;
  icon: string;
  text: string;
}

/**
 * 根据回撤值获取预警等级
 * @param drawdown 回撤值（百分比）
 * @param thresholds 阈值配置
 * @returns 预警等级
 */
export function getDrawdownLevel(
  drawdown: number,
  thresholds: { low: number; medium: number; high: number }
): DrawdownLevel {
  if (drawdown >= thresholds.high) return 'high';
  if (drawdown >= thresholds.medium) return 'medium';
  if (drawdown >= thresholds.low) return 'low';
  return 'normal';
}

/**
 * 根据回撤等级获取状态信息
 * @param level 回撤等级
 * @returns 完整的状态信息（样式、图标、文本）
 */
export function getDrawdownStatusInfo(level: DrawdownLevel): DrawdownStatusInfo {
  switch (level) {
    case 'high':
      return {
        level: 'high',
        style: 'bg-red-200 text-red-800',
        icon: '🔴',
        text: '超过重度预警阈值'
      };
    case 'medium':
      return {
        level: 'medium',
        style: 'bg-orange-200 text-orange-800',
        icon: '🟠',
        text: '超过中度预警阈值'
      };
    case 'low':
      return {
        level: 'low',
        style: 'bg-yellow-200 text-yellow-800',
        icon: '🟡',
        text: '超过轻度预警阈值'
      };
    case 'normal':
      return {
        level: 'normal',
        style: 'bg-green-200 text-green-800',
        icon: '✅',
        text: '正常范围'
      };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 恢复进度状态判断
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 恢复进度阈值常量
 * 与整体回撤恢复进度使用相同的标准
 */
export const RECOVERY_PROGRESS_THRESHOLDS = {
  /** >= 70% 为正常 */
  safe: 70,
  /** >= 35% 为中等，< 35% 为高风险 */
  warning: 35,
} as const;

/**
 * 根据恢复进度判断状态
 * @param progress 恢复进度百分比 (0-100)
 * @returns 状态等级 ('danger' | 'warning' | 'safe')
 */
export function getRecoveryProgressStatus(progress: number): 'danger' | 'warning' | 'safe' {
  return progress < RECOVERY_PROGRESS_THRESHOLDS.warning ? 'danger'
       : progress < RECOVERY_PROGRESS_THRESHOLDS.safe ? 'warning'
       : 'safe';
}

/**
 * 根据恢复进度状态获取颜色
 * @param status 状态等级
 * @returns 颜色值 (十六进制)
 */
export function getRecoveryProgressColor(status: 'danger' | 'warning' | 'safe'): string {
  switch (status) {
    case 'safe': return '#22c55e';    // green-500
    case 'warning': return '#f59e0b'; // amber-500
    case 'danger': return '#dc2626';  // red-600
  }
}