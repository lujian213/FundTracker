/**
 * types/systemConfigTypes.ts
 *
 * 系统配置类型定义 - 统一存储所有系统级配置
 * 存储于 localStorage key: 'fund_system_config'
 */

/**
 * 系统配置 - 统一存储所有系统级配置
 */
export interface SystemConfig {
  /** 配置版本号，用于数据迁移 */
  version: number;

  /** 自动备份配置 */
  backup: BackupConfigSection;

  /** 同步配置（合并原 fund_sync_config + eggfund_sync_config） */
  sync: SyncConfigSection;

  /** AI 配置 */
  ai: AIConfigSection;

  /** 系统功能开关 */
  features: FeatureConfigSection;
}

// ─── 各分区类型定义 ────────────────────────────────────────────────────────────

/** 自动备份配置 */
export interface BackupConfigSection {
  /** 自动备份时间，格式 "HH:mm"，默认 "16:00" */
  autoExportTime: string;
  /** 是否启用自动备份，默认 false */
  autoBackupEnabled: boolean;
}

/** 同步配置（合并原 fund_sync_config + eggfund_sync_config + sync_filter_config） */
export interface SyncConfigSection {
  /** Eggfund 用户名 */
  eggfundUsername?: string;
  /** Eggfund 密码 */
  eggfundPassword?: string;
  /** 同步过滤配置 */
  filter?: SyncFilterConfigSection;
}

/** 同步过滤配置 */
export interface SyncFilterConfigSection {
  /** 选中的基金代码列表 */
  selectedFunds: string[];
  /** 过滤日期 */
  filterDate: string;
  /** 选中的交易类型 */
  selectedTypes: string[];
}

/** AI 配置 */
export interface AIConfigSection {
  /** 多配置管理器 */
  manager: AIConfigManagerSection;
}

/** AI 多配置管理器 */
export interface AIConfigManagerSection {
  /** 配置列表 */
  configs: AIConfigProfileSection[];
  /** 当前激活的配置 ID */
  activeConfigId: string | null;
}

/** AI 配置档案 */
export interface AIConfigProfileSection {
  id: string;
  name: string;
  apiEndpoint: string;
  apiKey: string;
  model: string;
  isActive: boolean;
  createdAt: string;  // ISO 格式
  updatedAt: string;  // ISO 格式
}

/** 系统功能开关 */
export interface FeatureConfigSection {
  /** 是否启用初始价格调整功能 */
  initialPriceAdjustmentEnabled: boolean;
  /** 是否启用后台任务日志 */
  jobLogEnabled: boolean;
}

// ─── 默认值 ────────────────────────────────────────────────────────────────────

export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  version: 1,

  backup: {
    autoExportTime: '16:00',
    autoBackupEnabled: false,
  },

  sync: {
    eggfundUsername: undefined,
    eggfundPassword: undefined,
    filter: undefined,
  },

  ai: {
    manager: {
      configs: [],
      activeConfigId: null,
    },
  },

  features: {
    initialPriceAdjustmentEnabled: false,
    jobLogEnabled: false,
  },
};

// ─── 旧 Key 常量（用于迁移）────────────────────────────────────────────────────

/** 需要迁移的旧 key 列表 */
export const OLD_KEYS = {
  BACKUP_CONFIG: 'fund_backup_config',
  SYNC_CONFIG: 'fund_sync_config',
  EGGFUND_SYNC_CONFIG: 'eggfund_sync_config',
  SYNC_FILTER_CONFIG: 'sync_filter_config',
  AI_CONFIGS: 'ai_configs',
  AI_API_CONFIG: 'ai_api_config',  // 废弃，不迁移
  SYSTEM_SETTINGS: 'fund_system_settings',
} as const;