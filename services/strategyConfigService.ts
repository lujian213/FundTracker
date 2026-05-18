/**
 * services/strategyConfigService.ts
 *
 * 策略参数配置服务 - 合合默认值与用户覆盖值，提供生效参数
 */

import { strategyConfig } from './strategyConfig';
import { getStrategyParamsConfig } from './systemConfigService';
import { StrategyParams, StrategyParam } from '../types';

/**
 * 获取单个策略的生效参数（默认值 + 用户覆盖值合并）
 * @param strategyKey 策略标识（如 'trendFollowing'）
 * @returns 合合后的参数配置
 */
export function getEffectiveStrategyParams(strategyKey: string): StrategyParams {
  const userParams = getStrategyParamsConfig()[strategyKey] || {};
  const defaultParams = strategyConfig[strategyKey]?.params || {};

  const result: StrategyParams = {};
  for (const [key, param] of Object.entries(defaultParams)) {
    result[key] = {
      value: userParams[key] ?? param.value,
      type: param.type,
      description: param.description,
    };
  }
  return result;
}

/**
 * 获取所有策略的生效参数
 * @returns 所有策略的参数配置映射
 */
export function getAllEffectiveStrategyParams(): Record<string, StrategyParams> {
  const result: Record<string, StrategyParams> = {};
  for (const strategyKey of Object.keys(strategyConfig)) {
    result[strategyKey] = getEffectiveStrategyParams(strategyKey);
  }
  return result;
}

export default {
  getEffectiveStrategyParams,
  getAllEffectiveStrategyParams,
};