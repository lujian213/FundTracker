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