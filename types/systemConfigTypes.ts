/**
 * types/systemConfigTypes.ts
 *
 * 系统配置类型定义
 */

export interface SystemConfig {
  backup: BackupConfigSection;
  sync: SyncConfigSection;
  ai: AIConfigSection;
  features: FeatureConfigSection;
  systemParams: SystemParamsSection;
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
  ocrDebugPanelEnabled: boolean;  // OCR调试面板开关，默认关闭
}

export interface SystemParamsSection {
  ocrConcurrency: number; // OCR 并发数量，默认 3，范围 1-8
}

export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
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
    ocrDebugPanelEnabled: false,
  },
  systemParams: {
    ocrConcurrency: 3,
  },
};