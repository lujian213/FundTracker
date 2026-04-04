/**
 * services/systemConfigService.ts
 *
 * 系统配置服务 - 统一管理所有系统级配置的读写
 * 将分散的多个 localStorage key 整合为单一 key: 'fund_system_config'
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
  OLD_KEYS,
} from '../types/systemConfigTypes';

// 重新导出类型，供其他模块使用
export type {
  BackupConfigSection,
  SyncConfigSection,
  SyncFilterConfigSection,
  AIConfigSection,
  AIConfigManagerSection,
  AIConfigProfileSection,
  FeatureConfigSection,
};

const STORAGE_KEY = 'fund_system_config';
const CONFIG_VERSION = 1;

// ─── 核心接口 ──────────────────────────────────────────────────────────────────

/**
 * 获取完整系统配置
 */
export function getSystemConfig(): SystemConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // 检查版本，必要时迁移
      if (parsed.version !== CONFIG_VERSION) {
        // 未来版本迁移逻辑
        return { ...DEFAULT_SYSTEM_CONFIG, ...parsed, version: CONFIG_VERSION };
      }
      return { ...DEFAULT_SYSTEM_CONFIG, ...parsed };
    }
  } catch (e) {
    console.error('Error reading system config:', e);
  }
  return { ...DEFAULT_SYSTEM_CONFIG };
}

/**
 * 保存完整系统配置
 */
export function saveSystemConfig(config: SystemConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...config, version: CONFIG_VERSION }));
  } catch (e) {
    console.error('Error saving system config:', e);
  }
}

// ─── 分区读写接口 ──────────────────────────────────────────────────────────────

/**
 * 验证备份时间格式 (HH:mm)
 */
function isValidTimeFormat(time: string): boolean {
  return /^\d{2}:\d{2}$/.test(time);
}

/**
 * 获取备份配置
 */
export function getBackupConfig(): BackupConfigSection {
  const config = getSystemConfig();
  const autoExportTime = config.backup?.autoExportTime ?? DEFAULT_SYSTEM_CONFIG.backup.autoExportTime;
  const autoBackupEnabled = config.backup?.autoBackupEnabled ?? DEFAULT_SYSTEM_CONFIG.backup.autoBackupEnabled;

  // 验证时间格式，无效则返回默认值
  return {
    autoExportTime: isValidTimeFormat(autoExportTime) ? autoExportTime : DEFAULT_SYSTEM_CONFIG.backup.autoExportTime,
    autoBackupEnabled,
  };
}

/**
 * 保存备份配置
 */
export function saveBackupConfig(cfg: BackupConfigSection): void {
  const config = getSystemConfig();
  config.backup = cfg;
  saveSystemConfig(config);
}

/**
 * 获取同步配置
 */
export function getSyncConfig(): SyncConfigSection {
  const config = getSystemConfig();
  return config.sync;
}

/**
 * 保存同步配置
 */
export function saveSyncConfig(cfg: SyncConfigSection): void {
  const config = getSystemConfig();
  config.sync = cfg;
  saveSystemConfig(config);
}

/**
 * 获取同步过滤配置
 */
export function getSyncFilterConfig(): SyncFilterConfigSection | undefined {
  const config = getSystemConfig();
  return config.sync.filter;
}

/**
 * 保存同步过滤配置
 */
export function saveSyncFilterConfig(cfg: SyncFilterConfigSection): void {
  const config = getSystemConfig();
  config.sync.filter = cfg;
  saveSystemConfig(config);
}

/**
 * 获取 AI 配置
 */
export function getAIConfig(): AIConfigSection {
  const config = getSystemConfig();
  return config.ai;
}

/**
 * 保存 AI 配置
 */
export function saveAIConfig(ai: AIConfigSection): void {
  const config = getSystemConfig();
  config.ai = ai;
  saveSystemConfig(config);
}

/**
 * 获取 AI 配置管理器
 */
export function getAIConfigManager(): AIConfigManagerSection {
  const config = getSystemConfig();
  return config.ai.manager;
}

/**
 * 保存 AI 配置管理器
 */
export function saveAIConfigManager(manager: AIConfigManagerSection): void {
  const config = getSystemConfig();
  config.ai.manager = manager;
  saveSystemConfig(config);
}

/**
 * 获取当前激活的 AI 配置
 */
export function getActiveAIConfig(): AIConfigProfileSection | null {
  const manager = getAIConfigManager();
  if (!manager.activeConfigId) {
    return null;
  }
  return manager.configs.find(c => c.id === manager.activeConfigId) || null;
}

/**
 * 获取系统功能开关
 */
export function getFeatureConfig(): FeatureConfigSection {
  const config = getSystemConfig();
  return {
    initialPriceAdjustmentEnabled: config.features?.initialPriceAdjustmentEnabled ?? DEFAULT_SYSTEM_CONFIG.features.initialPriceAdjustmentEnabled,
    jobLogEnabled: config.features?.jobLogEnabled ?? DEFAULT_SYSTEM_CONFIG.features.jobLogEnabled,
  };
}

/**
 * 保存系统功能开关
 */
export function saveFeatureConfig(cfg: FeatureConfigSection): void {
  const config = getSystemConfig();
  config.features = cfg;
  saveSystemConfig(config);
}

/**
 * 检查单个功能是否启用
 */
export function isFeatureEnabled(featureKey: keyof FeatureConfigSection): boolean {
  const features = getFeatureConfig();
  return features[featureKey] === true;
}

/**
 * 更新单个功能开关
 */
export function setFeatureEnabled(featureKey: keyof FeatureConfigSection, enabled: boolean): void {
  const features = getFeatureConfig();
  features[featureKey] = enabled;
  saveFeatureConfig(features);
}

// ─── 迁移接口 ──────────────────────────────────────────────────────────────────

/**
 * 检查是否需要迁移
 */
export function needsMigration(): boolean {
  // 如果新 key 已存在，则不需要迁移
  if (localStorage.getItem(STORAGE_KEY)) {
    return false;
  }
  // 检查是否存在旧 key
  return Object.values(OLD_KEYS).some(key => {
    if (key === OLD_KEYS.AI_API_CONFIG) return false; // 废弃的 key，不检查
    return localStorage.getItem(key) !== null;
  });
}

/**
 * 从旧 key 迁移数据到新结构
 */
export function migrateFromOldKeys(): void {
  if (!needsMigration()) {
    return;
  }

  const newConfig: SystemConfig = { ...DEFAULT_SYSTEM_CONFIG };

  // 迁移备份配置
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

  // 迁移同步配置（优先使用 eggfund_sync_config，因为它使用更广泛）
  try {
    const eggfundRaw = localStorage.getItem(OLD_KEYS.EGGFUND_SYNC_CONFIG);
    const syncRaw = localStorage.getItem(OLD_KEYS.SYNC_CONFIG);

    // 优先使用 eggfund_sync_config
    const syncSource = eggfundRaw || syncRaw;
    if (syncSource) {
      const parsed = JSON.parse(syncSource);
      newConfig.sync.eggfundUsername = parsed.eggfundUsername;
      newConfig.sync.eggfundPassword = parsed.eggfundPassword;
    }
  } catch { /* ignore */ }

  // 迁移同步过滤配置
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

  // 迁移 AI 配置
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

  // 迁移系统功能开关
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

  // 保存新配置
  saveSystemConfig(newConfig);

  // 清理旧 key
  cleanupOldKeys();
}

/**
 * 清理旧 key（迁移成功后调用）
 */
export function cleanupOldKeys(): void {
  Object.values(OLD_KEYS).forEach(key => {
    try {
      localStorage.removeItem(key);
    } catch { /* ignore */ }
  });
}

// ─── 兼容旧版接口 ──────────────────────────────────────────────────────────────

/**
 * 获取当前 AI 配置（旧版兼容接口）
 * 用于保持与现有 aiConfigService 的兼容性
 */
export function getAIConfiguration(): { apiEndpoint: string; apiKey: string; model: string } | null {
  const activeConfig = getActiveAIConfig();
  if (!activeConfig) return null;

  return {
    apiEndpoint: activeConfig.apiEndpoint,
    apiKey: activeConfig.apiKey,
    model: activeConfig.model,
  };
}