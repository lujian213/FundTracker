/**
 * tests/services/systemSettingsService.test.ts
 *
 * 测试 systemSettingsService 的核心行为：
 *  - 默认设置的正确性
 *  - localStorage 读写
 *  - 单个功能开关的获取和设置
 */

import {
  getSystemSettings,
  setSystemSettings,
  isFeatureEnabled,
  setFeatureEnabled
} from '../../services/systemSettingsService';

describe('systemSettingsService', () => {
  const STORAGE_KEY = 'fund_system_settings';

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  describe('getSystemSettings', () => {
    test('should return default settings when no saved data', () => {
      const settings = getSystemSettings();
      expect(settings).toEqual({
        initialPriceAdjustmentEnabled: false
      });
    });

    test('should return saved settings', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        initialPriceAdjustmentEnabled: true
      }));
      const settings = getSystemSettings();
      expect(settings.initialPriceAdjustmentEnabled).toBe(true);
    });
  });

  describe('setSystemSettings', () => {
    test('should save settings to localStorage', () => {
      setSystemSettings({ initialPriceAdjustmentEnabled: true });
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      expect(saved.initialPriceAdjustmentEnabled).toBe(true);
    });
  });

  describe('isFeatureEnabled', () => {
    test('should return false for disabled feature', () => {
      expect(isFeatureEnabled('initialPriceAdjustmentEnabled')).toBe(false);
    });

    test('should return true for enabled feature', () => {
      setFeatureEnabled('initialPriceAdjustmentEnabled', true);
      expect(isFeatureEnabled('initialPriceAdjustmentEnabled')).toBe(true);
    });
  });

  describe('setFeatureEnabled', () => {
    test('should update single feature without affecting others', () => {
      setFeatureEnabled('initialPriceAdjustmentEnabled', true);
      const settings = getSystemSettings();
      expect(settings.initialPriceAdjustmentEnabled).toBe(true);
    });
  });
});