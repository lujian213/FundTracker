/**
 * services/storageKeys.ts
 *
 * localStorage key 常量定义
 * 独立文件，避免循环依赖
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

  /** 组合交易 */
  COMBO_TRADE: 'fund_combo_trade',

  /** 指数配置（统一存储所有指数） */
  INDEX_INFO: 'fund_all_indices_info',
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
    COMBO_TRADE: 'fund_combo_trades',
  },

  INDEX: {
    /** 旧版国内指数配置 */
    INDICES_CONFIG: 'fund_indices_config',
    /** 旧版全球指数配置 */
    GLOBAL_INDICES_CONFIG: 'fund_global_indices_config',
    /** 旧版国内指数实时数据缓存 */
    MARKET_INDICES_CACHE: 'fund_market_indices_cache',
    /** 旧版全球指数实时数据缓存 */
    GLOBAL_INDICES_CACHE: 'fund_global_indices_cache',
    /** cacheService 中的指数数据 */
    INDEX_MARKET_DATA: 'fund_index_market_data',
    /** 历史数据 key 前缀 */
    HISTORY_PREFIX: 'fund_history_',
    /** 旧版分开存储的国内指数key（合并迁移源） */
    INDEX_INFO_DOMESTIC: 'fund_indices_info',
    /** 旧版分开存储的全球指数key（合并迁移源） */
    INDEX_INFO_GLOBAL: 'fund_global_indices_info',
  },
} as const;