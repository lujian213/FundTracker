/**
 * tests/services/systemConfigService.test.ts
 *
 * 测试 systemConfigService 的核心行为：
 *  - 默认设置的正确性
 *  - localStorage 读写
 *  - 单个功能开关的获取和设置
 *  - 分区配置读写
 */

import { DEFAULT_SYSTEM_CONFIG } from '../../types/systemConfigTypes';

describe('systemConfigService', () => {
  const STORAGE_KEY = 'fund_system_config';

  beforeEach(() => {
    localStorage.clear();
    // Reset modules to ensure clean state
    jest.resetModules();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('getSystemConfig', () => {
    test('should return default config when no saved data', () => {
      const { getSystemConfig } = require('../../services/systemConfigService');
      const config = getSystemConfig();
      expect(config.backup).toEqual(DEFAULT_SYSTEM_CONFIG.backup);
      expect(config.features).toEqual(DEFAULT_SYSTEM_CONFIG.features);
    });

    test('should return saved config', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        features: { initialPriceAdjustmentEnabled: true, jobLogEnabled: false }
      }));
      const { getSystemConfig } = require('../../services/systemConfigService');
      const config = getSystemConfig();
      expect(config.features.initialPriceAdjustmentEnabled).toBe(true);
    });
  });

  describe('saveSystemConfig', () => {
    test('should save config to localStorage', () => {
      const { saveSystemConfig } = require('../../services/systemConfigService');
      const config = { ...DEFAULT_SYSTEM_CONFIG };
      config.features.initialPriceAdjustmentEnabled = true;
      saveSystemConfig(config);
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      expect(saved.features.initialPriceAdjustmentEnabled).toBe(true);
    });
  });

  describe('Feature config', () => {
    describe('getFeatureConfig', () => {
      test('should return default feature config', () => {
        const { getFeatureConfig } = require('../../services/systemConfigService');
        const features = getFeatureConfig();
        expect(features).toEqual({
          initialPriceAdjustmentEnabled: false,
          jobLogEnabled: false,
          ocrDebugPanelEnabled: false,
        });
      });
    });

    describe('saveFeatureConfig', () => {
      test('should save feature config', () => {
        const { saveFeatureConfig, getFeatureConfig } = require('../../services/systemConfigService');
        saveFeatureConfig({ initialPriceAdjustmentEnabled: true, jobLogEnabled: true, ocrDebugPanelEnabled: false });
        const features = getFeatureConfig();
        expect(features.initialPriceAdjustmentEnabled).toBe(true);
        expect(features.jobLogEnabled).toBe(true);
        expect(features.ocrDebugPanelEnabled).toBe(false);
      });
    });

    describe('isFeatureEnabled', () => {
      test('should return false for disabled feature', () => {
        const { isFeatureEnabled } = require('../../services/systemConfigService');
        expect(isFeatureEnabled('initialPriceAdjustmentEnabled')).toBe(false);
      });

      test('should return true for enabled feature', () => {
        const { setFeatureEnabled, isFeatureEnabled } = require('../../services/systemConfigService');
        setFeatureEnabled('initialPriceAdjustmentEnabled', true);
        expect(isFeatureEnabled('initialPriceAdjustmentEnabled')).toBe(true);
      });
    });

    describe('setFeatureEnabled', () => {
      test('should update single feature without affecting others', () => {
        const { setFeatureEnabled, isFeatureEnabled } = require('../../services/systemConfigService');
        setFeatureEnabled('initialPriceAdjustmentEnabled', true);
        expect(isFeatureEnabled('initialPriceAdjustmentEnabled')).toBe(true);
        expect(isFeatureEnabled('jobLogEnabled')).toBe(false);
      });
    });
  });

  describe('Backup config', () => {
    test('should return default backup config', () => {
      const { getBackupConfig } = require('../../services/systemConfigService');
      const backup = getBackupConfig();
      expect(backup.autoExportTime).toBe('16:00');
      expect(backup.autoBackupEnabled).toBe(false);
    });

    test('should save and retrieve backup config', () => {
      const { saveBackupConfig, getBackupConfig } = require('../../services/systemConfigService');
      saveBackupConfig({ autoExportTime: '09:30', autoBackupEnabled: true });
      const backup = getBackupConfig();
      expect(backup.autoExportTime).toBe('09:30');
      expect(backup.autoBackupEnabled).toBe(true);
    });
  });

  describe('Sync config', () => {
    test('should return default sync config', () => {
      const { getSyncConfig } = require('../../services/systemConfigService');
      const sync = getSyncConfig();
      expect(sync.eggfundUsername).toBeUndefined();
      expect(sync.eggfundPassword).toBeUndefined();
    });

    test('should save and retrieve sync config', () => {
      const { saveSyncConfig, getSyncConfig } = require('../../services/systemConfigService');
      saveSyncConfig({ eggfundUsername: 'testuser', eggfundPassword: 'testpass' });
      const sync = getSyncConfig();
      expect(sync.eggfundUsername).toBe('testuser');
      expect(sync.eggfundPassword).toBe('testpass');
    });
  });

  describe('Strategy params config', () => {
    test('should return default strategy params config (empty)', () => {
      const { getStrategyParamsConfig } = require('../../services/systemConfigService');
      const strategyParams = getStrategyParamsConfig();
      expect(strategyParams).toEqual({});
    });

    test('should save and retrieve strategy params config', () => {
      const { saveStrategyParamsConfig, getStrategyParamsConfig } = require('../../services/systemConfigService');
      saveStrategyParamsConfig({
        trendFollowing: { short_window: 10, buy_ratio: 0.3 }
      });
      const strategyParams = getStrategyParamsConfig();
      expect(strategyParams.trendFollowing?.short_window).toBe(10);
      expect(strategyParams.trendFollowing?.buy_ratio).toBe(0.3);
    });

    test('should not affect other sections when saving strategy params', () => {
      const { saveStrategyParamsConfig, getFeatureConfig, getStrategyParamsConfig, saveFeatureConfig } = require('../../services/systemConfigService');
      // 先设置 feature
      saveFeatureConfig({ initialPriceAdjustmentEnabled: true, jobLogEnabled: false, ocrDebugPanelEnabled: false });

      // 再设置 strategy params
      saveStrategyParamsConfig({ meanReversion: { bb_window: 15 } });

      // 验证 feature 不受影响
      const features = getFeatureConfig();
      expect(features.initialPriceAdjustmentEnabled).toBe(true);

      // 验证 strategy params 正确保存
      const strategyParams = getStrategyParamsConfig();
      expect(strategyParams.meanReversion?.bb_window).toBe(15);
    });
  });
});