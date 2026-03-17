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
}