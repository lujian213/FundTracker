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
};

const STORAGE_KEY = STORAGE_KEYS.SYSTEM_CONFIG;
const OLD_KEYS = OLD_STORAGE_KEYS.SYSTEM_CONFIG;

export function getSystemConfig(): SystemConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SYSTEM_CONFIG, ...parsed };
    }
  } catch (e) {
    console.error('Error reading system config:', e);
  }
  return { ...DEFAULT_SYSTEM_CONFIG };
}

export function saveSystemConfig(config: SystemConfig): void {
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
  const config = getSystemConfig();
  const autoExportTime = config.backup?.autoExportTime ?? DEFAULT_SYSTEM_CONFIG.backup.autoExportTime;
  const autoBackupEnabled = config.backup?.autoBackupEnabled ?? DEFAULT_SYSTEM_CONFIG.backup.autoBackupEnabled;

  return {
    autoExportTime: isValidTimeFormat(autoExportTime) ? autoExportTime : DEFAULT_SYSTEM_CONFIG.backup.autoExportTime,
    autoBackupEnabled,
  };
}

export function saveBackupConfig(cfg: BackupConfigSection): void {
  const config = getSystemConfig();
  config.backup = cfg;
  saveSystemConfig(config);
}

export function getSyncConfig(): SyncConfigSection {
  const config = getSystemConfig();
  return config.sync;
}

export function saveSyncConfig(cfg: SyncConfigSection): void {
  const config = getSystemConfig();
  config.sync = cfg;
  saveSystemConfig(config);
}

export function getSyncFilterConfig(): SyncFilterConfigSection | undefined {
  const config = getSystemConfig();
  return config.sync.filter;
}

export function saveSyncFilterConfig(cfg: SyncFilterConfigSection): void {
  const config = getSystemConfig();
  config.sync.filter = cfg;
  saveSystemConfig(config);
}

export function getAIConfig(): AIConfigSection {
  const config = getSystemConfig();
  return config.ai;
}

export function saveAIConfig(ai: AIConfigSection): void {
  const config = getSystemConfig();
  config.ai = ai;
  saveSystemConfig(config);
}

export function getAIConfigManager(): AIConfigManagerSection {
  const config = getSystemConfig();
  return config.ai.manager;
}

export function saveAIConfigManager(manager: AIConfigManagerSection): void {
  const config = getSystemConfig();
  config.ai.manager = manager;
  saveSystemConfig(config);
}

export function getActiveAIConfig(): AIConfigProfileSection | null {
  const manager = getAIConfigManager();
  if (!manager.activeConfigId) return null;
  return manager.configs.find(c => c.id === manager.activeConfigId) || null;
}

export function getFeatureConfig(): FeatureConfigSection {
  const config = getSystemConfig();
  return {
    initialPriceAdjustmentEnabled: config.features?.initialPriceAdjustmentEnabled ?? DEFAULT_SYSTEM_CONFIG.features.initialPriceAdjustmentEnabled,
    jobLogEnabled: config.features?.jobLogEnabled ?? DEFAULT_SYSTEM_CONFIG.features.jobLogEnabled,
  };
}

export function saveFeatureConfig(cfg: FeatureConfigSection): void {
  const config = getSystemConfig();
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

// ─── 迁移接口（由 localStorageService 统一调用，迁移完成后可删除）────────────────

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