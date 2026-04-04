import { AIConfigProfile } from '../../types/aiConfigTypes';

describe('AI Configuration Backup and Restore', () => {
  beforeEach(() => {
    // 清空localStorage中的AI配置（整合后的统一key）
    localStorage.removeItem('fund_system_config');
    localStorage.removeItem('ai_configs'); // 兼容旧key
    jest.resetModules();
  });

  afterEach(() => {
    // 清空localStorage中的AI配置
    localStorage.removeItem('fund_system_config');
    localStorage.removeItem('ai_configs'); // 兼容旧key
  });

  test('should backup AI configuration without API keys and restore without API keys', () => {
    const {
      addAIConfig,
      getAIConfigManager,
      setActiveAIConfig,
      createAIConfigBackup,
      restoreAIConfigBackup
    } = require('../../services/aiConfigService');

    // 创建几个测试配置
    const config1 = addAIConfig({
      name: 'Test Config 1',
      apiEndpoint: 'https://api.openai.com/v1/chat',
      apiKey: 'sk-test1234567890',
      model: 'gpt-4'
    });

    const config2 = addAIConfig({
      name: 'Test Config 2',
      apiEndpoint: 'https://api.anthropic.com/v1/messages',
      apiKey: 'sk-ant-test987654321',
      model: 'claude-3'
    });

    // 设置第二个配置为激活状态
    setActiveAIConfig(config2.id);

    // 验证配置已正确保存
    const managerBefore = getAIConfigManager();
    expect(managerBefore.configs).toHaveLength(2);
    expect(managerBefore.activeConfigId).toBe(config2.id);

    // 检查API密钥确实存在
    const savedConfig1 = managerBefore.configs.find(c => c.id === config1.id);
    const savedConfig2 = managerBefore.configs.find(c => c.id === config2.id);
    expect(savedConfig1?.apiKey).toBe('sk-test1234567890');
    expect(savedConfig2?.apiKey).toBe('sk-ant-test987654321');

    // 创建备份（此时应该不包含API密钥）
    const backup = createAIConfigBackup();

    // 验证备份中不包含API密钥
    expect(backup).toHaveProperty('configs');
    expect(backup.configs).toHaveLength(2);

    // 检查备份中的每个配置都不包含API密钥
    backup.configs.forEach((config: AIConfigProfile) => {
      expect(config.apiKey).toBeUndefined(); // apiKey不应存在于备份中
      expect(config.name).toBeDefined();
      expect(config.apiEndpoint).toBeDefined();
      expect(config.model).toBeDefined();
      expect(config.id).toBeDefined();
      expect(config.isActive).toBeDefined();
      expect(config.createdAt).toBeDefined();
      expect(config.updatedAt).toBeDefined();
    });

    // 验证备份中包含了激活配置ID
    expect(backup.activeConfigId).toBe(config2.id);

    // 清空当前配置（模拟恢复过程）
    localStorage.removeItem('fund_system_config');

    // 重新导入模块以获取清空后的状态
    jest.resetModules();
    const { restoreAIConfigBackup: restoreBackup, getAIConfigManager: getManagerAfter } = require('../../services/aiConfigService');

    // 尝试从备份恢复配置
    restoreBackup(backup);

    // 验证恢复后的配置
    const managerAfter = getManagerAfter();
    expect(managerAfter.configs).toHaveLength(2);
    expect(managerAfter.activeConfigId).toBe(config2.id);

    // 检查恢复后的配置，它们应该没有API密钥
    const restoredConfig1 = managerAfter.configs.find(c => c.id === config1.id);
    const restoredConfig2 = managerAfter.configs.find(c => c.id === config2.id);

    expect(restoredConfig1).toBeDefined();
    expect(restoredConfig2).toBeDefined();

    // 确认API密钥确实是空字符串而不是原来的值
    expect(restoredConfig1?.apiKey).toBe('');
    expect(restoredConfig2?.apiKey).toBe('');

    // 验证其他字段都正确恢复了
    expect(restoredConfig1?.name).toBe('Test Config 1');
    expect(restoredConfig1?.apiEndpoint).toBe('https://api.openai.com/v1/chat');
    expect(restoredConfig1?.model).toBe('gpt-4');
    expect(restoredConfig1?.isActive).toBe(false); // 因为config1不是激活的

    expect(restoredConfig2?.name).toBe('Test Config 2');
    expect(restoredConfig2?.apiEndpoint).toBe('https://api.anthropic.com/v1/messages');
    expect(restoredConfig2?.model).toBe('claude-3');
    expect(restoredConfig2?.isActive).toBe(true); // 因为config2是激活的
  });

  test('should handle empty configurations during backup and restore', () => {
    const { createAIConfigBackup, restoreAIConfigBackup, getAIConfigManager } = require('../../services/aiConfigService');

    // 测试没有任何配置的情况
    const backup = createAIConfigBackup();
    expect(backup.configs).toHaveLength(0);
    expect(backup.activeConfigId).toBeNull();

    // 恢复空配置
    restoreAIConfigBackup(backup);

    const manager = getAIConfigManager();
    expect(manager.configs).toHaveLength(0);
    expect(manager.activeConfigId).toBeNull();
  });

  test('should handle invalid backup data', () => {
    const { restoreAIConfigBackup } = require('../../services/aiConfigService');

    // 测试传入无效备份数据时的行为
    expect(restoreAIConfigBackup(null)).toBe(false);
    expect(restoreAIConfigBackup({})).toBe(false);
    expect(restoreAIConfigBackup({ configs: undefined })).toBe(false);
  });

  test('should maintain config relationships after restore', () => {
    const {
      addAIConfig,
      setActiveAIConfig,
      createAIConfigBackup,
      restoreAIConfigBackup,
      getAIConfigManager
    } = require('../../services/aiConfigService');

    // 创建测试配置
    const config = addAIConfig({
      name: 'Config With Special Chars',
      apiEndpoint: 'https://api.example.com/v1/chat',
      apiKey: 'sk-special-chars!@#$%^&*()',
      model: 'gpt-4-turbo'
    });

    setActiveAIConfig(config.id);

    // 备份
    const backup = createAIConfigBackup();

    // 验证备份中API密钥不存在
    const backupConfig = backup.configs.find((c: any) => c.id === config.id);
    expect(backupConfig).toBeDefined();
    expect(backupConfig.apiKey).toBeUndefined(); // 备份中不应该包含apiKey字段

    // 恢复
    localStorage.removeItem('fund_system_config');
    jest.resetModules();
    const { restoreAIConfigBackup: restoreBackup, getAIConfigManager: getManagerAfter } = require('../../services/aiConfigService');
    restoreBackup(backup);

    // 验证恢复后的状态
    const managerAfter = getManagerAfter();
    const restoredConfig = managerAfter.configs.find(c => c.id === config.id);

    expect(restoredConfig).toBeDefined();
    expect(restoredConfig?.apiKey).toBe(''); // 恢复后apiKey应该是空字符串
    expect(restoredConfig?.name).toBe('Config With Special Chars');
    expect(restoredConfig?.apiEndpoint).toBe('https://api.example.com/v1/chat');
    expect(restoredConfig?.model).toBe('gpt-4-turbo');
    expect(restoredConfig?.isActive).toBe(true);
  });
});