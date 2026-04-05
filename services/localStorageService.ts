/**
 * services/localStorageService.ts
 *
 * localStorage 统一入口服务
 * - 集中定义所有 localStorage key
 * - 提供迁移协调
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 当前使用的 key
// ═══════════════════════════════════════════════════════════════════════════════

export const STORAGE_KEYS = {
  /** 用户偏好配置 */
  USER_PREFERENCE: 'fund_user_preference',

  /** 系统配置 */
  SYSTEM_CONFIG: 'fund_system_config',

  /** 日历数据 */
  CALENDAR: 'fund_calendar',

  /** 投资草稿 */
  INVESTMENT_DRAFT: 'fund_investment_draft',
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// 旧版 key（用于迁移，迁移完成后可删除）
// ═══════════════════════════════════════════════════════════════════════════════

export const OLD_STORAGE_KEYS = {
  USER_PREFERENCE: {
    SORT_ORDER: 'fund_sort_order',
    DRAFT_MODAL_HEIGHT: 'draft_modal_matched_height',
  },

  SYSTEM_CONFIG: {
    BACKUP_CONFIG: 'fund_backup_config',
    SYNC_CONFIG: 'fund_sync_config',
    EGGFUND_SYNC_CONFIG: 'eggfund_sync_config',
    SYNC_FILTER_CONFIG: 'sync_filter_config',
    AI_CONFIGS: 'ai_configs',
    AI_API_CONFIG: 'ai_api_config',  // 废弃，不迁移
    SYSTEM_SETTINGS: 'fund_system_settings',
  },

  APP_DATA: {
    /** 旧版统一存储key（临时过渡用） */
    APP_DATA: 'fund_app_data',
    CALENDAR: 'fund_tracker_calendar',
    AI_TEMPLATES_CACHE: 'ai_templates_cached_data',
    INVESTMENT_DRAFT_PREFIX: 'investment_draft_',
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// 迁移接口（迁移完成后可删除）
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 执行所有必要的 localStorage 数据迁移
 * 应在应用初始化时、任何状态读取前调用
 */
export function ensureMigration(): void {
  const { ensureUserPreferenceMigration } = require('./userPreferenceService');
  const { ensureSystemConfigMigration } = require('./systemConfigService');
  const { ensureAppDataMigration } = require('./appDataService');
  ensureUserPreferenceMigration();
  ensureSystemConfigMigration();
  ensureAppDataMigration();
}

/**
 * 检查是否需要任何迁移
 */
export function needsAnyMigration(): boolean {
  const { needsUserPreferenceMigration } = require('./userPreferenceService');
  const { needsSystemConfigMigration } = require('./systemConfigService');
  const { needsAppDataMigration } = require('./appDataService');
  return needsUserPreferenceMigration() || needsSystemConfigMigration() || needsAppDataMigration();
}