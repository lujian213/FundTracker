// types/aiConfigTypes.ts
export interface AIConfiguration {
  apiEndpoint: string;
  apiKey: string;
  model?: string;
}

export interface AIConfigProfile {
  id: string;
  name: string;
  apiEndpoint: string;
  apiKey: string;
  model: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AIConfigManager {
  configs: AIConfigProfile[];
  activeConfigId: string | null;
}

export interface AITemplate {
  id: string;
  name: string;
  apiEndpoint: string;
  model: string;
  // 联网搜索配置（可选，无则表示不支持）
  webSearch?: {
    params: Record<string, any>;  // 提供商特定的联网搜索参数
  };
}