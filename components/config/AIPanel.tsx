/**
 * components/config/AIPanel.tsx
 *
 * AI 配置管理面板，包含配置的增删改功能。
 */

import React, { useState, useEffect } from 'react';
import { AIConfigProfile } from '../../types/aiConfigTypes';
import {
  getAIConfigManager,
  addAIConfig,
  updateAIConfig,
  deleteAIConfig,
  setActiveAIConfig,
  getAITemplates,
  createConfigFromTemplate,
} from '../../services/aiConfigService';
import { useModalBodyStyle } from '../../hooks/useModalBodyStyle';

const AIPanel: React.FC = () => {
  useModalBodyStyle();
  const [configs, setConfigs] = useState<AIConfigProfile[]>([]);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<AIConfigProfile | null>(null);
  const [newConfig, setNewConfig] = useState<Omit<AIConfigProfile, 'id' | 'isActive' | 'createdAt' | 'updatedAt'>>({
    name: '',
    apiEndpoint: 'https://api.openai.com/v1/chat/completions',
    apiKey: '',
    model: 'gpt-4'
  });
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState<{show: boolean, id: string | null}>({show: false, id: null});

  // 加载配置
  useEffect(() => {
    reloadConfigs();
  }, []);

  const reloadConfigs = () => {
    const manager = getAIConfigManager();
    setConfigs(manager.configs);
    setActiveConfigId(manager.activeConfigId);
  };

  const handleSaveConfig = () => {
    let validationErrors: Record<string, string> = {};

    if (!newConfig.name.trim()) {
      validationErrors.name = '配置名称不能为空';
    }

    if (!newConfig.apiEndpoint.trim()) {
      validationErrors.apiEndpoint = 'API端点不能为空';
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});

    if (editingConfig) {
      // 更新现有配置
      updateAIConfig(editingConfig.id, {
        name: newConfig.name,
        apiEndpoint: newConfig.apiEndpoint,
        apiKey: newConfig.apiKey,
        model: newConfig.model
      });

      setEditingConfig(null);
      setNewConfig({ name: '', apiEndpoint: '', apiKey: '', model: 'gpt-4' });
    } else {
      // 添加新配置
      addAIConfig({
        name: newConfig.name,
        apiEndpoint: newConfig.apiEndpoint,
        apiKey: newConfig.apiKey,
        model: newConfig.model
      });

      setNewConfig({ name: '', apiEndpoint: '', apiKey: '', model: 'gpt-4' });
    }

    reloadConfigs();
  };

  const handleEditConfig = (config: AIConfigProfile) => {
    setEditingConfig(config);
    setNewConfig({
      name: config.name,
      apiEndpoint: config.apiEndpoint,
      apiKey: config.apiKey,
      model: config.model
    });
    setErrors({});
    setShowTemplates(false);
  };

  const handleDeleteConfig = (id: string) => {
    setShowDeleteConfirmation({show: true, id});
  };

  const confirmDeleteConfig = () => {
    if (showDeleteConfirmation.id) {
      deleteAIConfig(showDeleteConfirmation.id);
      reloadConfigs();

      if (activeConfigId && activeConfigId === showDeleteConfirmation.id) {
        setActiveAIConfig(null);
        reloadConfigs();
      }
    }
    setShowDeleteConfirmation({show: false, id: null});
  };

  const cancelDeleteConfig = () => {
    setShowDeleteConfirmation({show: false, id: null});
  };

  const handleSetActive = (id: string) => {
    setActiveAIConfig(id);
    reloadConfigs();
  };

  const handleUseTemplate = () => {
    if (!selectedTemplate || !templateName.trim()) {
      alert('请选择模板并输入配置名称');
      return;
    }

    const newConfigFromTemplate = createConfigFromTemplate(selectedTemplate, templateName, '');
    if (newConfigFromTemplate) {
      setEditingConfig(newConfigFromTemplate);
      setNewConfig({
        name: newConfigFromTemplate.name,
        apiEndpoint: newConfigFromTemplate.apiEndpoint,
        apiKey: newConfigFromTemplate.apiKey,
        model: newConfigFromTemplate.model
      });
      setShowTemplates(false);
      setTemplateName('');
      setSelectedTemplate('');
    } else {
      alert('模板不存在');
    }
  };

  const handleCancelEdit = () => {
    setEditingConfig(null);
    setNewConfig({ name: '', apiEndpoint: '', apiKey: '', model: 'gpt-4' });
    setErrors({});
    setShowTemplates(false);
  };

  return (
    <div className="space-y-6">
      {/* 新建/编辑配置表单 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center">
          <i className="fas fa-plus-circle text-blue-500 mr-2"></i>
          {editingConfig ? '编辑配置' : '新建配置'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">配置名称 *</label>
            <input
              type="text"
              value={newConfig.name}
              onChange={(e) => setNewConfig({...newConfig, name: e.target.value})}
              className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.name ? 'border-red-500' : 'border-gray-300'}`}
              placeholder="例如：OpenAI GPT-4"
            />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">模型 *</label>
            <input
              type="text"
              value={newConfig.model}
              onChange={(e) => setNewConfig({...newConfig, model: e.target.value})}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="例如：gpt-4"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">API 端点 *</label>
            <input
              type="text"
              value={newConfig.apiEndpoint}
              onChange={(e) => setNewConfig({...newConfig, apiEndpoint: e.target.value})}
              className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.apiEndpoint ? 'border-red-500' : 'border-gray-300'}`}
              placeholder="例如：https://api.openai.com/v1/chat/completions"
            />
            {errors.apiEndpoint && <p className="text-red-500 text-xs mt-1">{errors.apiEndpoint}</p>}
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">API 密钥</label>
            <input
              type="password"
              value={newConfig.apiKey}
              onChange={(e) => setNewConfig({...newConfig, apiKey: e.target.value})}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="请输入API密钥"
            />
          </div>
        </div>

        <div className="flex space-x-2 mt-4">
          <button
            onClick={handleSaveConfig}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
          >
            {editingConfig ? '更新配置' : '保存配置'}
          </button>

          {editingConfig && (
            <button
              onClick={handleCancelEdit}
              className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 transition-colors"
            >
              取消
            </button>
          )}

          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="px-4 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 transition-colors ml-auto"
          >
            从模板创建
          </button>
        </div>
      </div>

      {/* 模板选择区域 */}
      {showTemplates && (
        <div className="bg-green-50 rounded-xl border border-green-200 p-5">
          <h3 className="font-semibold text-green-700 mb-4 flex items-center">
            <i className="fas fa-copy text-green-500 mr-2"></i>
            从模板创建配置
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">配置名称 *</label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="为新配置命名"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">选择模板 *</label>
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">请选择模板</option>
                {getAITemplates().map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={handleUseTemplate}
                className="px-4 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 transition-colors"
              >
                使用模板
              </button>

              <button
                onClick={() => {
                  setShowTemplates(false);
                  setSelectedTemplate('');
                  setTemplateName('');
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 配置列表 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center">
          <i className="fas fa-list text-blue-500 mr-2"></i>
          配置列表
        </h3>

        {configs.length === 0 ? (
          <p className="text-gray-500 text-center py-4 text-sm">暂无配置，请添加一个新的配置</p>
        ) : (
          <div className="space-y-3">
            {configs.map(config => (
              <div
                key={config.id}
                className={`p-4 rounded-lg border ${
                  config.isActive
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium text-gray-800 text-sm">{config.name}</h4>
                    <p className="text-xs text-gray-600">{config.apiEndpoint}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      模型: {config.model} | 更新时间: {config.updatedAt.toLocaleString()}
                    </p>

                    {config.isActive && (
                      <span className="inline-block mt-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                        已激活
                      </span>
                    )}
                  </div>

                  <div className="flex space-x-1">
                    <button
                      onClick={() => handleSetActive(config.id)}
                      disabled={config.isActive}
                      className={`p-1.5 rounded-full ${config.isActive ? 'text-gray-300 cursor-default' : 'text-blue-500 hover:bg-blue-100'}`}
                      title={config.isActive ? '已激活' : '设为激活'}
                    >
                      {config.isActive ? (
                        <i className="fas fa-check-circle"></i>
                      ) : (
                        <i className="fas fa-toggle-on"></i>
                      )}
                    </button>

                    <button
                      onClick={() => handleEditConfig(config)}
                      className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-full"
                      title="编辑"
                    >
                      <i className="fas fa-edit"></i>
                    </button>

                    <button
                      onClick={() => handleDeleteConfig(config.id)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-full"
                      title="删除"
                    >
                      <i className="fas fa-trash-alt"></i>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 删除确认对话框 */}
      {showDeleteConfirmation.show && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={cancelDeleteConfig}></div>
          <div className="relative bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-bold text-gray-800 mb-2">确认删除</h3>
            <p className="text-sm text-gray-500 mb-4">确定要删除这个配置吗？此操作不可撤销。</p>
            <div className="flex space-x-3">
              <button
                onClick={cancelDeleteConfig}
                className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300"
              >
                取消
              </button>
              <button
                onClick={confirmDeleteConfig}
                className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm font-bold hover:bg-red-600"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIPanel;