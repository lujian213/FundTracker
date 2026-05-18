/**
 * StrategyParamsPanel.tsx
 *
 * 交易策略参数配置面板
 */

import React, { useState } from 'react';
import { strategyConfig } from '../../services/strategyConfig';
import { getStrategyParamsConfig, saveStrategyParamsConfig } from '../../services/systemConfigService';
import { ConfirmDialog } from '../ConfirmDialog';
import { StrategyParams, StrategyParam } from '../../types';

interface LocalParamValue {
  [strategyKey: string]: {
    [paramKey: string]: string | number | boolean;
  };
}

interface DialogState {
  isOpen: boolean;
  type: 'confirm' | 'alert';
  title: string;
  message: string;
  strategyKey?: string;
}

const StrategyParamsPanel: React.FC = () => {
  const [localParams, setLocalParams] = useState<LocalParamValue>(() => {
    const saved = getStrategyParamsConfig();
    // 初始化：合并用户值与默认值，用于输入框显示
    const initial: LocalParamValue = {};
    for (const [strategyKey, meta] of Object.entries(strategyConfig)) {
      const userParams = saved[strategyKey] || {};
      const defaultParams = meta.params || {};
      initial[strategyKey] = {};
      for (const [paramKey, param] of Object.entries(defaultParams)) {
        initial[strategyKey][paramKey] = userParams[paramKey] ?? param.value;
      }
    }
    return initial;
  });

  const [expandedStrategies, setExpandedStrategies] = useState<Set<string>>(new Set());
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [dialogState, setDialogState] = useState<DialogState>({
    isOpen: false,
    type: 'alert',
    title: '',
    message: '',
    strategyKey: undefined
  });

  // 切换策略展开状态
  const toggleExpand = (strategyKey: string) => {
    setExpandedStrategies(prev => {
      const newSet = new Set(prev);
      if (newSet.has(strategyKey)) {
        newSet.delete(strategyKey);
      } else {
        newSet.add(strategyKey);
      }
      return newSet;
    });
  };

  // 更新参数值
  const updateParam = (strategyKey: string, paramKey: string, value: string | number | boolean) => {
    setLocalParams(prev => ({
      ...prev,
      [strategyKey]: {
        ...prev[strategyKey],
        [paramKey]: value,
      },
    }));
    // 清除该参数的验证错误
    setValidationErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[`${strategyKey}.${paramKey}`];
      return newErrors;
    });
  };

  // 验证参数值
  const validateParam = (param: StrategyParam, value: string | number | boolean): string | null => {
    if (param.type === 'number') {
      // 数字类型：可以是数字或 ${expr} 格式
      if (typeof value === 'string') {
        const exprMatch = value.match(/^\$\{(.+)\}$/);
        if (exprMatch) return null; // 表达式格式正确
        const num = Number(value);
        if (isNaN(num)) return '请输入有效数字或 ${表达式}';
      }
    }
    return null;
  };

  // 重置单个策略为默认值（打开确认对话框）
  const handleResetStrategy = (strategyKey: string) => {
    setDialogState({
      isOpen: true,
      type: 'confirm',
      title: '重置确认',
      message: `确定将【${strategyConfig[strategyKey]?.name || strategyKey}】的所有参数恢复为默认值？`,
      strategyKey
    });
  };

  // 执行重置操作
  const executeReset = () => {
    const strategyKey = dialogState.strategyKey;
    if (!strategyKey) return;

    const defaultParams = strategyConfig[strategyKey]?.params || {};
    const resetValues: Record<string, string | number | boolean> = {};
    for (const [paramKey, param] of Object.entries(defaultParams)) {
      resetValues[paramKey] = param.value;
    }

    setLocalParams(prev => ({
      ...prev,
      [strategyKey]: resetValues,
    }));

    // 清除该策略的验证错误
    setValidationErrors(prev => {
      const newErrors = { ...prev };
      for (const key of Object.keys(prev)) {
        if (key.startsWith(`${strategyKey}.`)) {
          delete newErrors[key];
        }
      }
      return newErrors;
    });

    setDialogState({ isOpen: false, type: 'alert', title: '', message: '', strategyKey: undefined });
  };

  // 关闭对话框
  const closeDialog = () => {
    setDialogState({ isOpen: false, type: 'alert', title: '', message: '', strategyKey: undefined });
  };

  // 保存所有策略参数
  const handleSave = () => {
    // 验证所有参数
    const errors: Record<string, string> = {};
    for (const [strategyKey, meta] of Object.entries(strategyConfig)) {
      const params = meta.params || {};
      for (const [paramKey, param] of Object.entries(params)) {
        const value = localParams[strategyKey]?.[paramKey];
        const error = validateParam(param, value);
        if (error) {
          errors[`${strategyKey}.${paramKey}`] = error;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      // 展开第一个有错误的策略
      const firstErrorKey = Object.keys(errors)[0];
      const strategyKey = firstErrorKey.split('.')[0];
      setExpandedStrategies(prev => new Set(prev).add(strategyKey));
      return;
    }

    // 过滤：只保存与默认值不同的参数
    const userParams: LocalParamValue = {};
    for (const [strategyKey, meta] of Object.entries(strategyConfig)) {
      const defaultParams = meta.params || {};
      const currentParams = localParams[strategyKey] || {};
      const changedParams: Record<string, string | number | boolean> = {};

      for (const [paramKey, param] of Object.entries(defaultParams)) {
        const currentVal = currentParams[paramKey];
        const defaultVal = param.value;
        // 比较时统一转为字符串进行比较（处理数字和表达式）
        if (String(currentVal) !== String(defaultVal)) {
          changedParams[paramKey] = currentVal;
        }
      }

      if (Object.keys(changedParams).length > 0) {
        userParams[strategyKey] = changedParams;
      }
    }

    saveStrategyParamsConfig(userParams);
    setValidationErrors({});

    // 提示保存成功（使用对话框）
    setDialogState({
      isOpen: true,
      type: 'alert',
      title: '保存成功',
      message: '策略参数已保存'
    });
  };

  return (
    <div className="space-y-6">
      {/* 提示信息区 */}
      <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800">
        <p>参数可填固定值或表达式（格式: <code className="bg-blue-100 px-1 rounded">{'${expr}'}</code>）。</p>
        <p>修改后点击底部保存按钮生效。</p>
      </div>

      {/* 策略卡片列表 */}
      <div className="bg-white rounded-xl border border-gray-200">
        {Object.entries(strategyConfig).map(([strategyKey, meta]) => {
          const isExpanded = expandedStrategies.has(strategyKey);
          const params = meta.params || {};

          return (
            <div key={strategyKey} className="border-b border-gray-100 last:border-b-0">
              {/* 卡片头部 */}
              <button
                onClick={() => toggleExpand(strategyKey)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                <span className="font-medium text-gray-800">{meta.name}</span>
                <i className={`fas fa-chevron-${isExpanded ? 'down' : 'right'} text-gray-400`} />
              </button>

              {/* 参数列表（展开时显示） */}
              {isExpanded && (
                <div className="px-5 pb-4 space-y-4">
                  {Object.entries(params).map(([paramKey, param]) => (
                    <div key={paramKey} className="flex flex-col gap-1">
                      {/* 参数名和描述 */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">{paramKey}</span>
                        <span className="text-xs text-gray-400">({param.type})</span>
                      </div>
                      <p className="text-xs text-gray-500">{param.description}</p>

                      {/* 输入组件 - 根据类型渲染 */}
                      {param.type === 'bool' ? (
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            role="switch"
                            aria-checked={Boolean(localParams[strategyKey]?.[paramKey])}
                            onClick={() => updateParam(strategyKey, paramKey, !localParams[strategyKey]?.[paramKey])}
                            className={`relative w-10 h-5 rounded-full transition-colors ${
                              localParams[strategyKey]?.[paramKey] ? 'bg-blue-600' : 'bg-gray-200'
                            }`}
                          >
                            <span
                              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                                localParams[strategyKey]?.[paramKey] ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                          <span className="text-xs text-gray-600">
                            {localParams[strategyKey]?.[paramKey] ? '开启' : '关闭'}
                          </span>
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={String(localParams[strategyKey]?.[paramKey] ?? param.value)}
                          onChange={(e) => {
                            // 直接保留原始字符串输入，不进行类型转换
                            // 验证在保存时进行
                            updateParam(strategyKey, paramKey, e.target.value);
                          }}
                          placeholder={param.type === 'number' ? '数字或 ${表达式}' : '字符串或 ${表达式}'}
                          className={`mt-2 w-full px-3 py-2 border rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${
                            validationErrors[`${strategyKey}.${paramKey}`] ? 'border-red-300' : 'border-gray-200'
                          }`}
                        />
                      )}

                      {/* 验证错误提示 */}
                      {validationErrors[`${strategyKey}.${paramKey}`] && (
                        <p className="text-xs text-red-500">{validationErrors[`${strategyKey}.${paramKey}`]}</p>
                      )}
                    </div>
                  ))}

                  {/* 重置按钮 */}
                  <button
                    onClick={() => handleResetStrategy(strategyKey)}
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

export default StrategyParamsPanel;