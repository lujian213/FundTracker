/**
 * services/localStorageService.ts
 *
 * localStorage 统一入口服务
 * - 提供迁移协调
 */

import { ensureUserPreferenceMigration, needsUserPreferenceMigration } from './userPreferenceService';
import { ensureSystemConfigMigration, needsSystemConfigMigration } from './systemConfigService';
import { ensureAppDataMigration, needsAppDataMigration } from './appDataService';
import { ensureIndexMigration, needsIndexMigration, verifyIndexMigration } from './indexService';

// 导出 key 常量（从 storageKeys.ts）
export { STORAGE_KEYS, OLD_STORAGE_KEYS } from './storageKeys';

/**
 * 执行所有必要的 localStorage 数据迁移
 * 应在应用初始化时、任何状态读取前调用
 */
export function ensureMigration(): void {
  ensureUserPreferenceMigration();
  ensureSystemConfigMigration();
  ensureAppDataMigration();
  ensureIndexMigration();
}

/**
 * 检查是否需要任何迁移
 */
export function needsAnyMigration(): boolean {
  return needsUserPreferenceMigration() || needsSystemConfigMigration() || needsAppDataMigration() || needsIndexMigration();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 迁移验证
// ═══════════════════════════════════════════════════════════════════════════════

interface MigrationCheckResult {
  success: boolean;
  oldKeysFound: string[];
  newKeysData: Record<string, any>;
  details: string[];
}

/**
 * 验证所有 localStorage 迁移结果
 * @param deleteOldKeys 是否删除旧 key，默认 false
 * @returns 迁移验证报告
 */
export function verifyStorageMigration(deleteOldKeys: boolean = false): {
  success: boolean;
  categories: {
    userPreference: MigrationCheckResult;
    systemConfig: MigrationCheckResult;
    appData: MigrationCheckResult;
    index: MigrationCheckResult;
  };
} {
  // 验证结果汇总
  const indexResult = verifyIndexMigration(deleteOldKeys);
  const results = {
    userPreference: verifyUserPreferenceMigration(deleteOldKeys),
    systemConfig: verifySystemConfigMigration(deleteOldKeys),
    appData: verifyAppDataMigration(deleteOldKeys),
    index: {
      success: indexResult.success,
      oldKeysFound: indexResult.oldKeysFound,
      newKeysData: { count: indexResult.newIndexCount },
      details: indexResult.details,
    } as MigrationCheckResult,
  };

  const success = Object.values(results).every(r => r.success);

  console.log('[StorageMigration] 验证结果汇总:', JSON.stringify({
    success,
    userPreference: { success: results.userPreference.success, details: results.userPreference.details },
    systemConfig: { success: results.systemConfig.success, details: results.systemConfig.details },
    appData: { success: results.appData.success, details: results.appData.details },
    index: { success: results.index.success, details: results.index.details, oldKeysFound: results.index.oldKeysFound },
  }, null, 2));

  return { success, categories: results };
}

/**
 * 验证用户偏好迁移
 */
function verifyUserPreferenceMigration(deleteOldKeys: boolean): MigrationCheckResult {
  const details: string[] = [];
  const oldKeysFound: string[] = [];
  const OLD_KEYS = {
    SORT_ORDER: 'fund_sort_order',
    DRAFT_MODAL_HEIGHT: 'draft_modal_matched_height',
  };

  for (const [, key] of Object.entries(OLD_KEYS)) {
    if (localStorage.getItem(key) !== null) {
      oldKeysFound.push(key);
    }
  }

  const newData = localStorage.getItem('fund_user_preference');
  const success = newData !== null;

  if (success) {
    details.push('用户偏好迁移成功');
  } else {
    details.push('用户偏好迁移失败：新 key 无数据');
  }

  if (deleteOldKeys && success) {
    oldKeysFound.forEach(key => {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    });
    if (oldKeysFound.length > 0) {
      details.push(`已删除旧 key: ${oldKeysFound.join(', ')}`);
    }
  }

  return { success, oldKeysFound, newKeysData: { hasData: success }, details };
}

/**
 * 验证系统配置迁移
 */
function verifySystemConfigMigration(deleteOldKeys: boolean): MigrationCheckResult {
  const details: string[] = [];
  const oldKeysFound: string[] = [];
  const OLD_KEYS = {
    BACKUP_CONFIG: 'fund_backup_config',
    SYNC_CONFIG: 'fund_sync_config',
    EGGFUND_SYNC_CONFIG: 'eggfund_sync_config',
    SYNC_FILTER_CONFIG: 'sync_filter_config',
    AI_CONFIGS: 'ai_configs',
    SYSTEM_SETTINGS: 'fund_system_settings',
  };

  for (const [, key] of Object.entries(OLD_KEYS)) {
    if (localStorage.getItem(key) !== null) {
      oldKeysFound.push(key);
    }
  }

  const newData = localStorage.getItem('fund_system_config');
  const success = newData !== null;

  if (success) {
    details.push('系统配置迁移成功');
  } else {
    details.push('系统配置迁移失败：新 key 无数据');
  }

  if (deleteOldKeys && success) {
    oldKeysFound.forEach(key => {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    });
    if (oldKeysFound.length > 0) {
      details.push(`已删除旧 key: ${oldKeysFound.join(', ')}`);
    }
  }

  return { success, oldKeysFound, newKeysData: { hasData: success }, details };
}

/**
 * 验证应用数据迁移
 */
function verifyAppDataMigration(deleteOldKeys: boolean): MigrationCheckResult {
  const details: string[] = [];
  const oldKeysFound: string[] = [];
  const OLD_KEYS = {
    APP_DATA: 'fund_app_data',
    CALENDAR: 'fund_tracker_calendar',
    AI_TEMPLATES_CACHE: 'ai_templates_cached_data',
    COMBO_TRADE: 'fund_combo_trades',
  };

  for (const [, key] of Object.entries(OLD_KEYS)) {
    if (localStorage.getItem(key) !== null) {
      oldKeysFound.push(key);
    }
  }

  // 检查 investment_draft_ 前缀的 key
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('investment_draft_')) {
      oldKeysFound.push(key);
    }
  }

  const calendarData = localStorage.getItem('fund_calendar');
  const draftData = localStorage.getItem('fund_investment_draft');
  const comboData = localStorage.getItem('fund_combo_trade');

  const success = (calendarData !== null) || (draftData !== null) || (comboData !== null);

  if (success) {
    details.push('应用数据迁移成功');
  } else {
    details.push('应用数据迁移失败：新 key 无数据');
  }

  if (deleteOldKeys && success) {
    oldKeysFound.forEach(key => {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    });
    if (oldKeysFound.length > 0) {
      details.push(`已删除旧 key: ${oldKeysFound.join(', ')}`);
    }
  }

  return { success, oldKeysFound, newKeysData: { hasCalendar: calendarData !== null, hasDraft: draftData !== null, hasCombo: comboData !== null }, details };
}