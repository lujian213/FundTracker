// components/AIConfigModal.tsx
import React, { useState, useEffect } from 'react';
import { AIConfigProfile, AITemplate, AIConfigManager } from '../types/aiConfigTypes';
import { getAIConfigManager, saveAIConfigManager, setActiveAIConfig, addAIConfig, updateAIConfig, deleteAIConfig, getAITemplates, validateAIConfig, createConfigFromTemplate } from '../services/aiConfigService';
import { getAITemplatesAsync } from '../services/dynamicAITemplateService';
import { createPortal } from 'react-dom';
import AlertModal from './AlertModal';
import { ConfirmDialog } from './ConfirmDialog';

interface AIConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AIConfigModal: React.FC<AIConfigModalProps> = ({ isOpen, onClose }) => {
  const [configs, setConfigs] = useState<AIConfigProfile[]>([]);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<AIConfigProfile | null>(null);
  const [newConfig, setNewConfig] = useState<Omit<AIConfigProfile, 'id' | 'isActive' | 'createdAt' | 'updatedAt'>>({
    name: '',
    apiEndpoint: '',
    apiKey: '',
    model: 'gpt-4'
  });
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState<{show: boolean, id: string | null}>({show: false, id: null});
  const [alertInfo, setAlertInfo] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: ''
  });

  // 加载配置
  useEffect(() => {
    if (isOpen) {
      reloadConfigs();
    }
  }, [isOpen]);

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

    // API密钥可以为空，允许用户稍后补充
    // 从备份恢复时可能没有API密钥

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
      const newProfile = addAIConfig({
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
        reloadConfigs(); // 再次刷新以更新激活状态
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
      setAlertInfo({ isOpen: true, message: '请选择模板并输入配置名称' });
      return;
    }

    const newConfigFromTemplate = createConfigFromTemplate(selectedTemplate, templateName, '');
    if (newConfigFromTemplate) {
      // Set the form to editing mode for the newly created config
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
      setAlertInfo({ isOpen: true, message: '模板不存在' });
    }
  };

  const handleCancelEdit = () => {
    setEditingConfig(null);
    setNewConfig({ name: '', apiEndpoint: '', apiKey: '', model: 'gpt-4' });
    setErrors({});
  };

  if (!isOpen) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}></div>

        <div className="relative bg-white rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 max-h-[90vh] flex flex-col">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-800">AI 配置管理</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* 新建/编辑配置表单 */}
            <div className="border border-gray-200 rounded-xl p-4">
              <h3 className="font-semibold text-gray-700 mb-3 text-sm">
                {editingConfig ? '编辑配置' : '新建配置'}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">配置名称 *</label>
                  <input
                    type="text"
                    value={newConfig.name}
                    onChange={(e) => setNewConfig({...newConfig, name: e.target.value})}
                    className={`w-full px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.name ? 'border-red-500' : 'border-gray-300'}`}
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
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="例如：gpt-4"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">API 端点 *</label>
                  <input
                    type="text"
                    value={newConfig.apiEndpoint}
                    onChange={(e) => setNewConfig({...newConfig, apiEndpoint: e.target.value})}
                    className={`w-full px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.apiEndpoint ? 'border-red-500' : 'border-gray-300'}`}
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
                    className={`w-full px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.apiKey ? 'border-red-500' : 'border-gray-300'}`}
                    placeholder="请输入API密钥"
                  />
                  {errors.apiKey && <p className="text-red-500 text-xs mt-1">{errors.apiKey}</p>}
                </div>
              </div>

              <div className="flex space-x-2 mt-4">
                <button
                  onClick={handleSaveConfig}
                  className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  {editingConfig ? '更新配置' : '保存配置'}
                </button>

                {editingConfig && (
                  <button
                    onClick={handleCancelEdit}
                    className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    取消
                  </button>
                )}

                <button
                  onClick={() => setShowTemplates(!showTemplates)}
                  className="px-3 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors ml-auto"
                >
                  从模板创建
                </button>
              </div>
            </div>

            {/* 模板选择区域 */}
            {showTemplates && (
              <div className="border border-green-200 rounded-xl p-4 bg-green-50">
                <h3 className="font-semibold text-green-700 mb-3 text-sm">从模板创建配置</h3>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">配置名称 *</label>
                    <input
                      type="text"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="为新配置命名"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">选择模板 *</label>
                    <select
                      value={selectedTemplate}
                      onChange={(e) => setSelectedTemplate(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
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
                      className="px-3 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                    >
                      使用模板
                    </button>

                    <button
                      onClick={() => {
                        setShowTemplates(false);
                        setSelectedTemplate('');
                        setTemplateName('');
                      }}
                      className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      取消
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 配置列表 */}
            <div>
              <h3 className="font-semibold text-gray-700 mb-3 text-sm">配置列表</h3>

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
                            模型: {config.model} |
                            更新时间: {config.updatedAt.toLocaleString()}
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
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      </div>

      {/* 删除确认对话框 */}
      <ConfirmDialog
        isOpen={showDeleteConfirmation.show}
        title="确认删除"
        message="确定要删除这个配置吗？此操作不可撤销。"
        onConfirm={confirmDeleteConfig}
        onCancel={cancelDeleteConfig}
        confirmText="确认删除"
        cancelText="取消"
        type="danger"
      />

      {/* 提示弹窗 */}
      <AlertModal
        isOpen={alertInfo.isOpen}
        message={alertInfo.message}
        onClose={() => setAlertInfo({ isOpen: false, message: '' })}
      />
    </>,
    document.body
  );
};

export default AIConfigModal;