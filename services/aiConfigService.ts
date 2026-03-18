// Updated services/aiConfigService.ts
import { AIConfigProfile, AIConfigManager, AITemplate } from '../types/aiConfigTypes';
import { getAITemplatesSync, getAITemplatesAsync } from './dynamicAITemplateService';

const AI_CONFIG_KEY = 'ai_configs';

/**
 * 获取AI配置管理器
 */
export function getAIConfigManager(): AIConfigManager {
  try {
    const configStr = localStorage.getItem(AI_CONFIG_KEY);
    if (!configStr) {
      // 初始化默认配置
      const defaultManager: AIConfigManager = {
        configs: [],
        activeConfigId: null
      };
      return defaultManager;
    }

    const stored = JSON.parse(configStr);
    // 确保日期对象被正确重建
    const configs = stored.configs.map((config: any) => ({
      ...config,
      createdAt: new Date(config.createdAt),
      updatedAt: new Date(config.updatedAt)
    }));

    return {
      configs,
      activeConfigId: stored.activeConfigId
    };
  } catch (e) {
    console.error('Error reading AI config manager:', e);
    return { configs: [], activeConfigId: null };
  }
}

/**
 * 保存AI配置管理器
 */
export function saveAIConfigManager(manager: AIConfigManager): void {
  try {
    // 转换日期对象为字符串以安全存储
    const serialized = {
      ...manager,
      configs: manager.configs.map(config => ({
        ...config,
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString()
      }))
    };

    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(serialized));
  } catch (e) {
    console.error('Error saving AI config manager:', e);
    throw e;
  }
}

/**
 * 获取当前激活的配置
 */
export function getActiveAIConfig(): AIConfigProfile | null {
  const manager = getAIConfigManager();
  if (!manager.activeConfigId) {
    return null;
  }

  return manager.configs.find(config => config.id === manager.activeConfigId) || null;
}

/**
 * 设置激活配置
 */
export function setActiveAIConfig(configId: string | null): boolean {
  const manager = getAIConfigManager();

  if (configId === null) {
    // 清除激活配置
    manager.configs = manager.configs.map(config => ({
      ...config,
      isActive: false
    }));
    manager.activeConfigId = null;
    saveAIConfigManager(manager);
    return true;
  }

  const configExists = manager.configs.some(config => config.id === configId);

  if (!configExists) {
    return false;
  }

  // 先将所有配置设为非激活
  manager.configs = manager.configs.map(config => ({
    ...config,
    isActive: config.id === configId
  }));

  manager.activeConfigId = configId;
  saveAIConfigManager(manager);
  return true;
}

/**
 * 添加新的配置
 */
export function addAIConfig(config: Omit<AIConfigProfile, 'id' | 'isActive' | 'createdAt' | 'updatedAt'>): AIConfigProfile {
  const manager = getAIConfigManager();
  const newConfig: AIConfigProfile = {
    id: `ai-config-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    ...config,
    isActive: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  manager.configs.push(newConfig);
  saveAIConfigManager(manager);
  return newConfig;
}

/**
 * 更新配置
 */
export function updateAIConfig(id: string, updates: Partial<Omit<AIConfigProfile, 'id' | 'createdAt'>>): boolean {
  const manager = getAIConfigManager();
  const index = manager.configs.findIndex(config => config.id === id);

  if (index === -1) {
    return false;
  }

  manager.configs[index] = {
    ...manager.configs[index],
    ...updates,
    updatedAt: new Date()
  };

  // 如果正在激活的配置被更新且被禁用，清除激活ID
  if (id === manager.activeConfigId && updates.isActive === false) {
    manager.activeConfigId = null;
  }

  saveAIConfigManager(manager);
  return true;
}

/**
 * 删除配置
 */
export function deleteAIConfig(id: string): boolean {
  const manager = getAIConfigManager();
  const index = manager.configs.findIndex(config => config.id === id);

  if (index === -1) {
    return false;
  }

  // 如果删除的是激活的配置，清除激活ID
  if (manager.activeConfigId === id) {
    manager.activeConfigId = null;
  }

  manager.configs.splice(index, 1);
  saveAIConfigManager(manager);
  return true;
}

/**
 * 获取预设模板
 */
export function getAITemplates(): AITemplate[] {
  // 使用同步版本获取模板，以保持与现有代码的兼容性
  return getAITemplatesSync();
}

/**
 * 异步获取预设模板
 */
export async function getAITemplatesAsyncWrapper(): Promise<AITemplate[]> {
  return await getAITemplatesAsync();
}

/**
 * 从模板创建配置（排除API密钥）
 */
export function createConfigFromTemplate(templateId: string, name: string, apiKey: string): AIConfigProfile | null {
  const templates = getAITemplates();
  const template = templates.find(t => t.id === templateId);

  if (!template) {
    return null;
  }

  return addAIConfig({
    name,
    apiEndpoint: template.apiEndpoint,
    apiKey,
    model: template.model
  });
}

/**
 * 异步从模板创建配置（排除API密钥）
 */
export async function createConfigFromTemplateAsync(templateId: string, name: string, apiKey: string): Promise<AIConfigProfile | null> {
  const templates = await getAITemplatesAsync();
  const template = templates.find(t => t.id === templateId);

  if (!template) {
    return null;
  }

  return addAIConfig({
    name,
    apiEndpoint: template.apiEndpoint,
    apiKey,
    model: template.model
  });
}

/**
 * 验证AI配置
 */
export function validateAIConfig(config: AIConfigProfile): { isValid: boolean; error?: string } {
  if (!config.name || config.name.trim() === '') {
    return { isValid: false, error: '配置名称不能为空' };
  }

  if (!config.apiEndpoint || config.apiEndpoint.trim() === '') {
    return { isValid: false, error: 'API端点不能为空' };
  }

  // API密钥可以为空，允许从备份恢复后由用户补充
  // 基本URL验证
  try {
    new URL(config.apiEndpoint);
  } catch (e) {
    return { isValid: false, error: '无效的API端点URL' };
  }

  return { isValid: true };
}

/**
 * 检查是否存在有效配置（配置结构完整）
 * 注意：API Key为空的配置仍被认为是有效的，只是不能用于调用API
 */
export function hasValidAIConfig(): boolean {
  const config = getActiveAIConfig();
  if (!config) return false;

  const validation = validateAIConfig(config);
  return validation.isValid;
}

/**
 * 检查是否存在可用于调用API的配置（必须包含API Key）
 */
export function hasUsableAIConfig(): boolean {
  const config = getActiveAIConfig();
  if (!config) return false;

  const validation = validateAIConfig(config);
  return validation.isValid && !!(config.apiKey && config.apiKey.trim() !== '');
}

/**
 * 创建配置备份（排除API密钥）
 */
export function createAIConfigBackup(): any {
  const manager = getAIConfigManager();

  // 备份时排除API密钥
  const backup = {
    configs: manager.configs.map(config => ({
      id: config.id,
      name: config.name,
      apiEndpoint: config.apiEndpoint,
      model: config.model,
      isActive: config.isActive,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt
    })),
    activeConfigId: manager.activeConfigId
  };

  return backup;
}

/**
 * 从备份恢复配置
 */
export function restoreAIConfigBackup(backup: any): boolean {
  if (!backup || !backup.configs) {
    console.warn('restoreAIConfigBackup: Invalid backup data', backup);
    return false;
  }

  // 重置现有配置
  const newManager: AIConfigManager = {
    configs: backup.configs.map((config: any) => ({
      ...config,
      apiKey: ''  // API密钥必须重新输入
    })),
    activeConfigId: backup.activeConfigId
  };

  // 确保日期对象被正确重建
  newManager.configs = newManager.configs.map((config: any) => ({
    ...config,
    createdAt: new Date(config.createdAt),
    updatedAt: new Date(config.updatedAt)
  }));

  saveAIConfigManager(newManager);
  return true;
}

// 保留旧版兼容的类型定义和函数
export interface AIConfiguration {
  apiEndpoint: string;
  apiKey: string;
  model?: string;
}

/**
 * 获取当前AI配置（旧版兼容）
 */
export function getAIConfig(): AIConfiguration | null {
  const activeConfig = getActiveAIConfig();
  if (!activeConfig) return null;

  return {
    apiEndpoint: activeConfig.apiEndpoint,
    apiKey: activeConfig.apiKey,
    model: activeConfig.model
  };
}

/**
 * 保存AI配置（旧版兼容）
 */
export function saveAIConfig(config: AIConfiguration): void {
  // 如果没有活动配置，创建一个新配置并激活它
  const manager = getAIConfigManager();
  if (manager.configs.length === 0) {
    const newConfig = addAIConfig({
      name: config.model || 'Default Config',
      apiEndpoint: config.apiEndpoint,
      apiKey: config.apiKey,
      model: config.model || 'gpt-4'
    });
    setActiveAIConfig(newConfig.id);
  } else if (manager.activeConfigId) {
    // 更新当前激活的配置
    updateAIConfig(manager.activeConfigId, {
      apiEndpoint: config.apiEndpoint,
      apiKey: config.apiKey,
      model: config.model
    });
  }
}