/**
 * SearchProvidersPanel.tsx
 *
 * 搜索服务配置面板
 */

import React, { useState, useRef } from 'react';
import { searchProvidersConfig, isSensitiveParam } from '../../services/searchProvidersConfig';
import { getSearchProvidersConfig, saveSearchProvidersConfig } from '../../services/systemConfigService';
import { ConfirmDialog } from '../ConfirmDialog';
import type { SearchProviderMeta, SearchProviderUserConfig } from '../../types/searchTypes';

interface ProviderConfig {
  enabled: boolean;
  order: number;
  params: Record<string, string | number | boolean>;
}

interface DialogState {
  isOpen: boolean;
  type: 'confirm' | 'alert';
  title: string;
  message: string;
  providerKey?: string;
}

const SearchProvidersPanel: React.FC = () => {
  // 初始化：合并用户配置与默认值
  const [providerConfigs, setProviderConfigs] = useState<Record<string, ProviderConfig>>(() => {
    const saved = getSearchProvidersConfig();
    const initial: Record<string, ProviderConfig> = {};

    // 按配置文件中的顺序初始化
    const providerKeys = Object.keys(searchProvidersConfig);
    providerKeys.forEach((key, index) => {
      const meta = searchProvidersConfig[key];
      const userConfig = saved.providers[key];
      const defaultParams: Record<string, string | number | boolean> = {};

      for (const [paramKey, param] of Object.entries(meta.params)) {
        defaultParams[paramKey] = param.value;
      }

      initial[key] = {
        enabled: userConfig?.enabled ?? true,
        order: userConfig?.order ?? index,
        params: { ...defaultParams, ...userConfig?.params },
      };
    });

    return initial;
  });

  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<DialogState>({
    isOpen: false,
    type: 'alert',
    title: '',
    message: '',
    providerKey: undefined,
  });

  // 切换 Provider 展开状态
  const toggleExpand = (providerKey: string) => {
    setExpandedProviders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(providerKey)) {
        newSet.delete(providerKey);
      } else {
        newSet.add(providerKey);
      }
      return newSet;
    });
  };

  // 切换 Provider 启用状态
  const toggleEnabled = (providerKey: string) => {
    setProviderConfigs(prev => ({
      ...prev,
      [providerKey]: {
        ...prev[providerKey],
        enabled: !prev[providerKey].enabled,
      },
    }));
  };

  // 更新参数值
  const updateParam = (providerKey: string, paramKey: string, value: string | number | boolean) => {
    setProviderConfigs(prev => ({
      ...prev,
      [providerKey]: {
        ...prev[providerKey],
        params: {
          ...prev[providerKey].params,
          [paramKey]: value,
        },
      },
    }));
  };

  // 拖拽开始
  const handleDragStart = (providerKey: string) => {
    setDraggedKey(providerKey);
  };

  // 拖拽结束
  const handleDragEnd = () => {
    setDraggedKey(null);
  };

  // 拖拽经过
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // 拖拽放置
  const handleDrop = (targetKey: string) => {
    if (!draggedKey || draggedKey === targetKey) return;

    setProviderConfigs(prev => {
      const keys = Object.keys(prev).sort((a, b) => prev[a].order - prev[b].order);
      const draggedIndex = keys.indexOf(draggedKey);
      const targetIndex = keys.indexOf(targetKey);

      if (draggedIndex === -1 || targetIndex === -1) return prev;

      // 重新排序
      keys.splice(draggedIndex, 1);
      keys.splice(targetIndex, 0, draggedKey);

      // 更新 order
      const newConfigs = { ...prev };
      keys.forEach((key, index) => {
        newConfigs[key] = { ...newConfigs[key], order: index };
      });

      return newConfigs;
    });

    setDraggedKey(null);
  };

  // 重置单个 Provider 为默认值
  const handleResetProvider = (providerKey: string) => {
    setDialogState({
      isOpen: true,
      type: 'confirm',
      title: '重置确认',
      message: `确定将【${searchProvidersConfig[providerKey]?.name || providerKey}】的所有参数恢复为默认值？`,
      providerKey,
    });
  };

  // 执行重置操作
  const executeReset = () => {
    const providerKey = dialogState.providerKey;
    if (!providerKey) return;

    const meta = searchProvidersConfig[providerKey];
    const defaultParams: Record<string, string | number | boolean> = {};
    for (const [paramKey, param] of Object.entries(meta.params)) {
      defaultParams[paramKey] = param.value;
    }

    setProviderConfigs(prev => ({
      ...prev,
      [providerKey]: {
        ...prev[providerKey],
        params: defaultParams,
      },
    }));

    setDialogState({ isOpen: false, type: 'alert', title: '', message: '', providerKey: undefined });
  };

  // 关闭对话框
  const closeDialog = () => {
    setDialogState({ isOpen: false, type: 'alert', title: '', message: '', providerKey: undefined });
  };

  // 保存所有配置
  const handleSave = () => {
    // 构建保存数据
    const providers: Record<string, SearchProviderUserConfig> = {};

    for (const [providerKey, config] of Object.entries(providerConfigs)) {
      const meta = searchProvidersConfig[providerKey];
      const changedParams: Record<string, string | number | boolean> = {};

      // 只保存与默认值不同的参数
      for (const [paramKey, param] of Object.entries(meta.params)) {
        const currentVal = config.params[paramKey];
        const defaultVal = param.value;
        if (String(currentVal) !== String(defaultVal)) {
          changedParams[paramKey] = currentVal;
        }
      }

      providers[providerKey] = {
        enabled: config.enabled,
        order: config.order,
        params: changedParams,
      };
    }

    saveSearchProvidersConfig({ providers });

    setDialogState({
      isOpen: true,
      type: 'alert',
      title: '保存成功',
      message: '搜索服务配置已保存',
    });
  };

  // 按顺序排序的 Provider 列表
  const sortedProviders = Object.entries(providerConfigs)
    .sort((a, b) => a[1].order - b[1].order);

  return (
    <div className="space-y-6">
      {/* 提示信息区 */}
      <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800">
        <p>参数修改后点击底部保存按钮生效。</p>
        <p>Provider 卡片可拖拽排序，越靠上优先级越高。</p>
      </div>

      {/* Provider 卡片列表 */}
      <div className="bg-white rounded-xl border border-gray-200">
        {sortedProviders.map(([providerKey, config]) => {
          const meta = searchProvidersConfig[providerKey];
          const isExpanded = expandedProviders.has(providerKey);
          const isDragging = draggedKey === providerKey;

          return (
            <div
              key={providerKey}
              className={`border-b border-gray-100 last:border-b-0 ${isDragging ? 'opacity-50' : ''}`}
              draggable
              onDragStart={() => handleDragStart(providerKey)}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(providerKey)}
            >
              {/* 卡片头部 */}
              <div className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  {/* 拖拽图标 */}
                  <i className="fas fa-grip-vertical text-gray-400 cursor-move" />
                  {/* Provider 名称 */}
                  <button
                    onClick={() => toggleExpand(providerKey)}
                    className="flex items-center gap-2"
                  >
                    <span className="font-medium text-gray-800">{meta.name}</span>
                    <i className={`fas fa-chevron-${isExpanded ? 'down' : 'right'} text-gray-400`} />
                  </button>
                </div>
                {/* 启用开关 */}
                <button
                  role="switch"
                  aria-checked={config.enabled}
                  onClick={() => toggleEnabled(providerKey)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    config.enabled ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                  title={config.enabled ? '已启用' : '已禁用'}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      config.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* 参数列表（展开时显示） */}
              {isExpanded && (
                <div className="px-5 pb-4 space-y-4">
                  {Object.entries(meta.params).map(([paramKey, param]) => (
                    <div key={paramKey} className="flex flex-col gap-1">
                      {/* 参数名和描述 */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">{paramKey}</span>
                        <span className="text-xs text-gray-400">({param.type})</span>
                        {param.isSensitive && <span className="text-xs text-red-500">*</span>}
                      </div>
                      <p className="text-xs text-gray-500">{param.description}</p>

                      {/* 输入组件 - 根据类型渲染 */}
                      {param.type === 'bool' ? (
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            role="switch"
                            aria-checked={Boolean(config.params[paramKey])}
                            onClick={() => updateParam(providerKey, paramKey, !config.params[paramKey])}
                            className={`relative w-10 h-5 rounded-full transition-colors ${
                              config.params[paramKey] ? 'bg-blue-600' : 'bg-gray-200'
                            }`}
                          >
                            <span
                              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                                config.params[paramKey] ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                          <span className="text-xs text-gray-600">
                            {config.params[paramKey] ? '开启' : '关闭'}
                          </span>
                        </div>
                      ) : param.isSensitive ? (
                        // 敏感参数：密码输入框
                        <input
                          type="password"
                          value={String(config.params[paramKey] ?? param.value)}
                          onChange={(e) => updateParam(providerKey, paramKey, e.target.value)}
                          placeholder={param.type === 'number' ? '数字' : '字符串'}
                          className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          autoComplete="off"
                        />
                      ) : (
                        <input
                          type="text"
                          value={String(config.params[paramKey] ?? param.value)}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (param.type === 'number') {
                              const num = Number(val);
                              if (!isNaN(num)) {
                                updateParam(providerKey, paramKey, num);
                              } else {
                                updateParam(providerKey, paramKey, val);
                              }
                            } else {
                              updateParam(providerKey, paramKey, val);
                            }
                          }}
                          placeholder={param.type === 'number' ? '数字' : '字符串'}
                          className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                      )}
                    </div>
                  ))}

                  {/* 重置按钮 */}
                  <button
                    onClick={() => handleResetProvider(providerKey)}
                    className="mt-4 text-sm text-gray-500 hover:text-gray-700"
                  >
                    <i className="fas fa-undo mr-1" />
                    重置为默认
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 保存按钮 */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <i className="fas fa-save mr-2" />
          保存
        </button>
      </div>

      {/* 确认/提示对话框 */}
      <ConfirmDialog
        isOpen={dialogState.isOpen}
        title={dialogState.title}
        message={dialogState.message}
        type={dialogState.type === 'confirm' ? 'info' : 'success'}
        confirmText={dialogState.type === 'confirm' ? '确认重置' : '确定'}
        cancelText="取消"
        singleButton={dialogState.type === 'alert'}
        onConfirm={dialogState.type === 'confirm' ? executeReset : closeDialog}
        onCancel={closeDialog}
      />
    </div>
  );
};

export default SearchProvidersPanel;