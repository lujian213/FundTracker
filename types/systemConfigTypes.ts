/**
 * types/systemConfigTypes.ts
 *
 * 系统配置类型定义
 */

export interface SystemConfig {
  version: number;
  backup: BackupConfigSection;
  sync: SyncConfigSection;
  ai: AIConfigSection;
  features: FeatureConfigSection;
}

export interface BackupConfigSection {
  autoExportTime: string;
  autoBackupEnabled: boolean;
}

export interface SyncConfigSection {
  eggfundUsername?: string;
  eggfundPassword?: string;
  filter?: SyncFilterConfigSection;
}

export interface SyncFilterConfigSection {
  selectedFunds: string[];
  filterDate: string;
  selectedTypes: string[];
}

export interface AIConfigSection {
  manager: AIConfigManagerSection;
}

export interface AIConfigManagerSection {
  configs: AIConfigProfileSection[];
  activeConfigId: string | null;
}

export interface AIConfigProfileSection {
  id: string;
  name: string;
  apiEndpoint: string;
  apiKey: string;
  model: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureConfigSection {
  initialPriceAdjustmentEnabled: boolean;
  jobLogEnabled: boolean;
}

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