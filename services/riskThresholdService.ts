/**
 * riskThresholdService.ts
 *
 * 风险阈值配置服务
 * 负责风险阈值的读取、保存和默认值管理
 */

import { RiskThresholds } from '../types';

// 存储键
const STORAGE_KEY = 'fund_risk_thresholds';

/**
 * 默认风险阈值配置
 */
export const DEFAULT_RISK_THRESHOLDS: RiskThresholds = {
  drawdown: {
    low: 10,      // 轻度预警：回撤超过10%
    medium: 15,   // 中度预警：回撤超过15%
    high: 20,     // 重度预警：回撤超过20%
  },
  volatility: {
    low: 15,      // 低波动：波动率低于15%
    high: 25,     // 高波动：波动率高于25%
  },
  dailyChange: {
    warning: 3,   // 预警：单日涨跌超过3%
    severe: 5,    // 严重：单日涨跌超过5%
  },
  continuousDecline: {
    low: 3,       // 轻度关注：连续下跌3天
    high: 5,      // 高度关注：连续下跌5天
  },
  concentration: {
    singleFund: 25,  // 单基金上限：25%
    topThree: 70,    // 前三基金上限：70%
  },
};

/**
 * 从localStorage读取风险阈值配置
 */
export function getRiskThresholds(): RiskThresholds {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { ...DEFAULT_RISK_THRESHOLDS };
    }

    const parsed = JSON.parse(stored);

    // 合并默认值，确保所有字段都存在（兼容旧版本）
    return {
      drawdown: {
        low: parsed.drawdown?.low ?? DEFAULT_RISK_THRESHOLDS.drawdown.low,
        medium: parsed.drawdown?.medium ?? DEFAULT_RISK_THRESHOLDS.drawdown.medium,
        high: parsed.drawdown?.high ?? DEFAULT_RISK_THRESHOLDS.drawdown.high,
      },
      volatility: {
        low: parsed.volatility?.low ?? DEFAULT_RISK_THRESHOLDS.volatility.low,
        high: parsed.volatility?.high ?? DEFAULT_RISK_THRESHOLDS.volatility.high,
      },
      dailyChange: {
        warning: parsed.dailyChange?.warning ?? DEFAULT_RISK_THRESHOLDS.dailyChange.warning,
        severe: parsed.dailyChange?.severe ?? DEFAULT_RISK_THRESHOLDS.dailyChange.severe,
      },
      continuousDecline: {
        low: parsed.continuousDecline?.low ?? DEFAULT_RISK_THRESHOLDS.continuousDecline.low,
        high: parsed.continuousDecline?.high ?? DEFAULT_RISK_THRESHOLDS.continuousDecline.high,
      },
      concentration: {
        singleFund: parsed.concentration?.singleFund ?? DEFAULT_RISK_THRESHOLDS.concentration.singleFund,
        topThree: parsed.concentration?.topThree ?? DEFAULT_RISK_THRESHOLDS.concentration.topThree,
      },
    };
  } catch (error) {
    console.error('读取风险阈值配置失败:', error);
    return { ...DEFAULT_RISK_THRESHOLDS };
  }
}

/**
 * 保存风险阈值配置到localStorage
 */
export function saveRiskThresholds(thresholds: RiskThresholds): void {
  try {
    // 校验并限制范围
    const validated: RiskThresholds = {
      drawdown: {
        low: Math.max(5, Math.min(20, thresholds.drawdown.low)),
        medium: Math.max(10, Math.min(30, thresholds.drawdown.medium)),
        high: Math.max(15, Math.min(40, thresholds.drawdown.high)),
      },
      volatility: {
        low: Math.max(5, Math.min(20, thresholds.volatility.low)),
        high: Math.max(20, Math.min(40, thresholds.volatility.high)),
      },
      dailyChange: {
        warning: Math.max(1, Math.min(10, thresholds.dailyChange.warning)),
        severe: Math.max(1, Math.min(15, thresholds.dailyChange.severe)),
      },
      continuousDecline: {
        low: Math.max(1, Math.min(10, thresholds.continuousDecline.low)),
        high: Math.max(1, Math.min(15, thresholds.continuousDecline.high)),
      },
      concentration: {
        singleFund: Math.max(10, Math.min(50, thresholds.concentration.singleFund)),
        topThree: Math.max(30, Math.min(90, thresholds.concentration.topThree)),
      },
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
  } catch (error) {
    console.error('保存风险阈值配置失败:', error);
  }
}

/**
 * 重置为默认阈值
 */
export function resetRiskThresholds(): void {
  saveRiskThresholds(DEFAULT_RISK_THRESHOLDS);
}