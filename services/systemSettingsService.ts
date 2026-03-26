/**
 * systemSettingsService.ts
 *
 * 系统设置服务，用于管理系统级功能开关。
 * 设置保存在 localStorage 中，页面刷新后仍然有效。
 */

export interface SystemSettings {
  /** 初始价格调整功能是否启用，默认 false */
  initialPriceAdjustmentEnabled: boolean;
}

const STORAGE_KEY = 'fund_system_settings';

const DEFAULT_SETTINGS: SystemSettings = {
  initialPriceAdjustmentEnabled: false,
};

/**
 * 获取所有系统设置
 */
export function getSystemSettings(): SystemSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {
    // ignore parse errors
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * 保存系统设置
 */
export function setSystemSettings(settings: SystemSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

/**
 * 检查单个功能是否启用
 */
export function isFeatureEnabled(featureKey: keyof SystemSettings): boolean {
  const settings = getSystemSettings();
  return settings[featureKey] === true;
}

/**
 * 更新单个功能开关
 */
export function setFeatureEnabled(featureKey: keyof SystemSettings, enabled: boolean): void {
  const settings = getSystemSettings();
  settings[featureKey] = enabled;
  setSystemSettings(settings);
}