/**
 * services/systemConfigService.ts
 *
 * 系统配置服务 - 统一管理所有系统级配置的读写
 */

import {
  SystemConfig,
  BackupConfigSection,
  SyncConfigSection,
  SyncFilterConfigSection,
  AIConfigSection,
  AIConfigManagerSection,
  AIConfigProfileSection,
  FeatureConfigSection,
  SystemParamsSection,
  StrategyParamsSection,  // 新增
  SearchProvidersSection,  // 搜索服务配置
  DEFAULT_SYSTEM_CONFIG,
} from '../types/systemConfigTypes';
import { STORAGE_KEYS, OLD_STORAGE_KEYS } from './storageKeys';

export type {
  BackupConfigSection,
  SyncConfigSection,
  SyncFilterConfigSection,
  AIConfigSection,
  AIConfigManagerSection,
  AIConfigProfileSection,
  FeatureConfigSection,
  SystemParamsSection,
  StrategyParamsSection,  // 新增
  SearchProvidersSection,  // 搜索服务配置
};

const STORAGE_KEY = STORAGE_KEYS.SYSTEM_CONFIG;
const OLD_KEYS = OLD_STORAGE_KEYS.SYSTEM_CONFIG;

// ═══════════════════════════════════════════════════════════════════════════════
// 内存缓存
// ═══════════════════════════════════════════════════════════════════════════════

let cachedConfig: SystemConfig | null = null;

/**
 * 重置内存缓存（仅用于测试）
 */
export function resetCache(): void {
  cachedConfig = null;
}

/**
 * 从 localStorage 加载数据到缓存
 */
function loadFromStorage(): SystemConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // 使用深拷贝避免修改 DEFAULT_SYSTEM_CONFIG
      return JSON.parse(JSON.stringify({ ...DEFAULT_SYSTEM_CONFIG, ...parsed }));
    }
  } catch (e) {
    console.error('Error reading system config:', e);
  }
  // 使用深拷贝返回默认配置的独立副本
  return JSON.parse(JSON.stringify(DEFAULT_SYSTEM_CONFIG));
}

/**
 * 获取缓存（懒加载）
 */
function getCache(): SystemConfig {
  if (!cachedConfig) {
    cachedConfig = loadFromStorage();
  }
  return cachedConfig;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 公共 API
// ═══════════════════════════════════════════════════════════════════════════════

export function getSystemConfig(): SystemConfig {
  return getCache();
}

export function saveSystemConfig(config: SystemConfig): void {
  cachedConfig = config;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Error saving system config:', e);
  }
}

function isValidTimeFormat(time: string): boolean {
  return /^\d{2}:\d{2}$/.test(time);
}

export function getBackupConfig(): BackupConfigSection {
  const config = getCache();
  const autoExportTime = config.backup?.autoExportTime ?? DEFAULT_SYSTEM_CONFIG.backup.autoExportTime;
  const autoBackupEnabled = config.backup?.autoBackupEnabled ?? DEFAULT_SYSTEM_CONFIG.backup.autoBackupEnabled;

  return {
    autoExportTime: isValidTimeFormat(autoExportTime) ? autoExportTime : DEFAULT_SYSTEM_CONFIG.backup.autoExportTime,
    autoBackupEnabled,
  };
}

export function saveBackupConfig(cfg: BackupConfigSection): void {
  const config = getCache();
  config.backup = cfg;
  saveSystemConfig(config);
}

export function getSyncConfig(): SyncConfigSection {
  return getCache().sync;
}

export function saveSyncConfig(cfg: SyncConfigSection): void {
  const config = getCache();
  config.sync = cfg;
  saveSystemConfig(config);
}

export function getSyncFilterConfig(): SyncFilterConfigSection | undefined {
  return getCache().sync.filter;
}

export function saveSyncFilterConfig(cfg: SyncFilterConfigSection): void {
  const config = getCache();
  config.sync.filter = cfg;
  saveSystemConfig(config);
}

export function getAIConfig(): AIConfigSection {
  return getCache().ai;
}

export function saveAIConfig(ai: AIConfigSection): void {
  const config = getCache();
  config.ai = ai;
  saveSystemConfig(config);
}

export function getAIConfigManager(): AIConfigManagerSection {
  return getCache().ai.manager;
}

export function saveAIConfigManager(manager: AIConfigManagerSection): void {
  const config = getCache();
  config.ai.manager = manager;
  saveSystemConfig(config);
}

export function getActiveAIConfig(): AIConfigProfileSection | null {
  const manager = getAIConfigManager();
  if (!manager.activeConfigId) return null;
  return manager.configs.find(c => c.id === manager.activeConfigId) || null;
}

export function getFeatureConfig(): FeatureConfigSection {
  const config = getCache();
  return {
    initialPriceAdjustmentEnabled: config.features?.initialPriceAdjustmentEnabled ?? DEFAULT_SYSTEM_CONFIG.features.initialPriceAdjustmentEnabled,
    jobLogEnabled: config.features?.jobLogEnabled ?? DEFAULT_SYSTEM_CONFIG.features.jobLogEnabled,
    ocrDebugPanelEnabled: config.features?.ocrDebugPanelEnabled ?? DEFAULT_SYSTEM_CONFIG.features.ocrDebugPanelEnabled,
  };
}

export function saveFeatureConfig(cfg: FeatureConfigSection): void {
  const config = getCache();
  config.features = cfg;
  saveSystemConfig(config);
}

export function isFeatureEnabled(featureKey: keyof FeatureConfigSection): boolean {
  const features = getFeatureConfig();
  return features[featureKey] === true;
}

export function setFeatureEnabled(featureKey: keyof FeatureConfigSection, enabled: boolean): void {
  const features = getFeatureConfig();
  features[featureKey] = enabled;
  saveFeatureConfig(features);
}

export function getSystemParams(): SystemParamsSection {
  const config = getCache();
  return {
    ocrConcurrency: config.systemParams?.ocrConcurrency ?? DEFAULT_SYSTEM_CONFIG.systemParams.ocrConcurrency,
  };
}

export function saveSystemParams(params: SystemParamsSection): void {
  const config = getCache();
  // 校验范围
  const validConcurrency = Math.max(1, Math.min(8, params.ocrConcurrency));
  config.systemParams = {
    ocrConcurrency: validConcurrency,
  };
  saveSystemConfig(config);
}

export function getOcrConcurrency(): number {
  return getSystemParams().ocrConcurrency;
}

export function setOcrConcurrency(value: number): void {
  saveSystemParams({ ocrConcurrency: value });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 策略参数配置
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 获取用户配置的策略参数（原始存储值，不含默认值）
 */
export function getStrategyParamsConfig(): StrategyParamsSection {
  return getCache().strategyParams ?? {};
}

/**
 * 保存策略参数配置
 */
export function saveStrategyParamsConfig(cfg: StrategyParamsSection): void {
  const config = getCache();
  config.strategyParams = cfg;
  saveSystemConfig(config);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 搜索服务配置
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 获取用户配置的搜索服务参数（原始存储值，不含默认值）
 */
export function getSearchProvidersConfig(): SearchProvidersSection {
  return getCache().searchProviders ?? { providers: {} };
}

/**
 * 保存搜索服务配置
 */
export function saveSearchProvidersConfig(cfg: SearchProvidersSection): void {
  const config = getCache();
  config.searchProviders = cfg;
  saveSystemConfig(config);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 迁移接口（由 localStorageService 统一调用，迁移完成后可删除）
// ═══════════════════════════════════════════════════════════════════════════════

export function needsSystemConfigMigration(): boolean {
  if (localStorage.getItem(STORAGE_KEY)) return false;
  return Object.entries(OLD_KEYS).some(([name, key]) => {
    if (name === 'AI_API_CONFIG') return false;
    return localStorage.getItem(key) !== null;
  });
}

export function ensureSystemConfigMigration(): void {
  if (localStorage.getItem(STORAGE_KEY)) return;

  const hasOldKeys = Object.entries(OLD_KEYS).some(([name, key]) => {
    if (name === 'AI_API_CONFIG') return false;
    return localStorage.getItem(key) !== null;
  });
  if (!hasOldKeys) return;

  const newConfig: SystemConfig = { ...DEFAULT_SYSTEM_CONFIG };

  try {
    const backupRaw = localStorage.getItem(OLD_KEYS.BACKUP_CONFIG);
    if (backupRaw) {
      const parsed = JSON.parse(backupRaw);
      if (typeof parsed.autoExportTime === 'string' && /^\d{2}:\d{2}$/.test(parsed.autoExportTime)) {
        newConfig.backup = {
          autoExportTime: parsed.autoExportTime,
          autoBackupEnabled: parsed.autoBackupEnabled === true,
        };
      }
    }
  } catch { /* ignore */ }

  try {
    const eggfundRaw = localStorage.getItem(OLD_KEYS.EGGFUND_SYNC_CONFIG);
    const syncRaw = localStorage.getItem(OLD_KEYS.SYNC_CONFIG);
    const syncSource = eggfundRaw || syncRaw;
    if (syncSource) {
      const parsed = JSON.parse(syncSource);
      newConfig.sync.eggfundUsername = parsed.eggfundUsername;
      newConfig.sync.eggfundPassword = parsed.eggfundPassword;
    }
  } catch { /* ignore */ }

  try {
    const filterRaw = localStorage.getItem(OLD_KEYS.SYNC_FILTER_CONFIG);
    if (filterRaw) {
      const parsed = JSON.parse(filterRaw);
      newConfig.sync.filter = {
        selectedFunds: parsed.selectedFunds || [],
        filterDate: parsed.filterDate || '',
        selectedTypes: parsed.selectedTypes || [],
      };
    }
  } catch { /* ignore */ }

  try {
    const aiRaw = localStorage.getItem(OLD_KEYS.AI_CONFIGS);
    if (aiRaw) {
      const parsed = JSON.parse(aiRaw);
      newConfig.ai.manager = {
        configs: (parsed.configs || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          apiEndpoint: c.apiEndpoint,
          apiKey: c.apiKey || '',
          model: c.model,
          isActive: c.isActive || false,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
        activeConfigId: parsed.activeConfigId || null,
      };
    }
  } catch { /* ignore */ }

  try {
    const settingsRaw = localStorage.getItem(OLD_KEYS.SYSTEM_SETTINGS);
    if (settingsRaw) {
      const parsed = JSON.parse(settingsRaw);
      newConfig.features = {
        initialPriceAdjustmentEnabled: parsed.initialPriceAdjustmentEnabled === true,
        jobLogEnabled: parsed.jobLogEnabled === true,
        ocrDebugPanelEnabled: parsed.ocrDebugPanelEnabled === true,
      };
    }
  } catch { /* ignore */ }

  saveSystemConfig(newConfig);
  // 不删除旧 key，由 verifyStorageMigration() 决定是否删除
}

/**
 * @deprecated 使用 ensureSystemConfigMigration 代替
 */
export function migrateFromOldKeys(): void {
  ensureSystemConfigMigration();
}

export function getAIConfiguration(): { apiEndpoint: string; apiKey: string; model: string } | null {
  const activeConfig = getActiveAIConfig();
  if (!activeConfig) return null;
  return {
    apiEndpoint: activeConfig.apiEndpoint,
    apiKey: activeConfig.apiKey,
    model: activeConfig.model,
  };
}