/**
 * tests/services/strategyConfigService.test.ts
 *
 * 测试 strategyConfigService 的核心行为：
 *  - 默认值与用户值合并
 *  - 多策略参数获取
 */

import { strategyConfig } from '../../services/strategyConfig';

describe('strategyConfigService', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.resetModules();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('getEffectiveStrategyParams', () => {
    test('should return default params when no user config', () => {
      const { getEffectiveStrategyParams } = require('../../services/strategyConfigService');
      const params = getEffectiveStrategyParams('trendFollowing');

      // 验证默认值
      expect(params.short_window.value).toBe(5);
      expect(params.short_window.type).toBe('number');
      expect(params.long_window.value).toBe(20);
      expect(params.buy_ratio.value).toBe(0.5);
    });

    test('should merge user params with defaults', () => {
      // 设置用户配置
      const { saveStrategyParamsConfig } = require('../../services/systemConfigService');
      saveStrategyParamsConfig({
        trendFollowing: { short_window: 10, buy_ratio: 0.3 }
      });

      const { getEffectiveStrategyParams } = require('../../services/strategyConfigService');
      const params = getEffectiveStrategyParams('trendFollowing');

      // 用户覆盖的值
      expect(params.short_window.value).toBe(10);
      expect(params.buy_ratio.value).toBe(0.3);

      // 未覆盖的值仍为默认值
      expect(params.long_window.value).toBe(20);
      expect(params.sell_ratio.value).toBe(0.5);

      // type 和 description 保持不变
      expect(params.short_window.type).toBe('number');
      expect(params.short_window.description).toBe('短期均线天数');
    });

    test('should return empty params for unknown strategy', () => {
      const { getEffectiveStrategyParams } = require('../../services/strategyConfigService');
      const params = getEffectiveStrategyParams('unknownStrategy');
      expect(params).toEqual({});
    });
  });

  describe('getAllEffectiveStrategyParams', () => {
    test('should return params for all registered strategies', () => {
      const { getAllEffectiveStrategyParams } = require('../../services/strategyConfigService');
      const allParams = getAllEffectiveStrategyParams();

      // 验证包含所有策略
      const strategyKeys = Object.keys(strategyConfig);
      expect(Object.keys(allParams)).toEqual(strategyKeys);

      // 验证每个策略都有参数
      for (const key of strategyKeys) {
        expect(allParams[key]).toBeDefined();
      }
    });
  });
});