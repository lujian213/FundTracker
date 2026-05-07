/**
 * services/localStorageService.ts
 *
 * localStorage 统一入口服务
 * - 提供迁移协调
 * - 清理旧版存储 key
 */

import { ensureUserPreferenceMigration, needsUserPreferenceMigration } from './userPreferenceService';
import { ensureSystemConfigMigration, needsSystemConfigMigration } from './systemConfigService';
import { ensureAppDataMigration, needsAppDataMigration } from './appDataService';
import { ensureIndexMigration, needsIndexMigration } from './indexService';
import { ensureFundMigration, needsFundMigration } from './marketFundService';
import { OLD_STORAGE_KEYS } from './storageKeys';

// 导出 key 常量（从 storageKeys.ts）
export { STORAGE_KEYS, OLD_STORAGE_KEYS } from './storageKeys';

/**
 * 执行所有必要的 localStorage 数据迁移
 * 应在应用初始化时、任何状态读取前调用
 */
export function ensureMigration(): void {
  ensureFundMigration();       // 基金数据迁移（最先执行，因为其他服务可能依赖）
  ensureUserPreferenceMigration();
  ensureSystemConfigMigration();
  ensureAppDataMigration();
  ensureIndexMigration();
}

/**
 * 检查是否需要任何迁移
 */
export function needsAnyMigration(): boolean {
  return needsFundMigration() || needsUserPreferenceMigration() || needsSystemConfigMigration() || needsAppDataMigration() || needsIndexMigration();
}

/**
 * 验证并清理旧版 localStorage key
 * @param deleteOldKeys 是否删除旧 key，默认 false
 */
export function verifyStorageMigration(deleteOldKeys: boolean = false): void {
  if (!deleteOldKeys) return;

  // 删除所有旧版存储 key
  deleteAllOldStorageKeys();
}

/**
 * 删除所有旧版存储 key（单次遍历优化）
 */
function deleteAllOldStorageKeys(): void {
  // 收集所有需要删除的固定 key
  const fixedKeys = [
    // 基金
    OLD_STORAGE_KEYS.FUND.PORTFOLIO,
    OLD_STORAGE_KEYS.FUND.MARKET_DATA,
    OLD_STORAGE_KEYS.FUND.TRADES,
    // 指数
    OLD_STORAGE_KEYS.INDEX.INDEX_INFO_UNIFIED,
    OLD_STORAGE_KEYS.INDEX.INDEX_INFO_DOMESTIC,
    OLD_STORAGE_KEYS.INDEX.INDEX_INFO_GLOBAL,
    OLD_STORAGE_KEYS.INDEX.INDICES_CONFIG,
    OLD_STORAGE_KEYS.INDEX.GLOBAL_INDICES_CONFIG,
    OLD_STORAGE_KEYS.INDEX.MARKET_INDICES_CACHE,
    OLD_STORAGE_KEYS.INDEX.GLOBAL_INDICES_CACHE,
    OLD_STORAGE_KEYS.INDEX.INDEX_MARKET_DATA,
    // 用户偏好
    OLD_STORAGE_KEYS.USER_PREFERENCE.SORT_ORDER,
    OLD_STORAGE_KEYS.USER_PREFERENCE.DRAFT_MODAL_HEIGHT,
    // 系统配置
    OLD_STORAGE_KEYS.SYSTEM_CONFIG.BACKUP_CONFIG,
    OLD_STORAGE_KEYS.SYSTEM_CONFIG.SYNC_CONFIG,
    OLD_STORAGE_KEYS.SYSTEM_CONFIG.EGGFUND_SYNC_CONFIG,
    OLD_STORAGE_KEYS.SYSTEM_CONFIG.SYNC_FILTER_CONFIG,
    OLD_STORAGE_KEYS.SYSTEM_CONFIG.AI_CONFIGS,
    OLD_STORAGE_KEYS.SYSTEM_CONFIG.SYSTEM_SETTINGS,
    // 应用数据
    OLD_STORAGE_KEYS.APP_DATA.APP_DATA,
    OLD_STORAGE_KEYS.APP_DATA.CALENDAR,
    OLD_STORAGE_KEYS.APP_DATA.AI_TEMPLATES_CACHE,
    OLD_STORAGE_KEYS.APP_DATA.COMBO_TRADE,
  ];

  // 收集所有需要删除的前缀
  const prefixes = [
    OLD_STORAGE_KEYS.FUND.HISTORY_PREFIX,
    OLD_STORAGE_KEYS.FUND.INTRADAY_PREFIX,
    OLD_STORAGE_KEYS.FUND.POSITION_PREFIX,
    'fund_index_history_',
    OLD_STORAGE_KEYS.APP_DATA.INVESTMENT_DRAFT_PREFIX,
  ];

  // 单次遍历收集所有需要删除的 key
  const keysToDelete: string[] = [];

  // 1. 先添加固定 key（如果存在）
  fixedKeys.forEach(key => {
    if (localStorage.getItem(key) !== null) {
      keysToDelete.push(key);
    }
  });

  // 2. 遍历 localStorage，收集匹配前缀的 key
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && prefixes.some(p => key.startsWith(p))) {
      keysToDelete.push(key);
    }
  }

  // 3. 批量删除
  keysToDelete.forEach(key => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  });
}