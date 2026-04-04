/**
 * components/config/SystemPanel.tsx
 *
 * 系统开关面板，管理各种系统级功能开关。
 */

import React, { useState, useEffect } from 'react';
import { getFeatureConfig, setFeatureEnabled, FeatureConfigSection } from '../../services/systemConfigService';

interface SwitchConfig {
  key: keyof FeatureConfigSection;
  label: string;
  description: string;
}

const SWITCH_CONFIGS: SwitchConfig[] = [
  {
    key: 'initialPriceAdjustmentEnabled',
    label: '初始价格调整',
    description: '启用后可在基金详情页调整初始价格',
  },
  {
    key: 'jobLogEnabled',
    label: '后台任务日志',
    description: '启用后可在主界面显示日志按钮',
  },
];

const SystemPanel: React.FC = () => {
  const [settings, setSettings] = useState<FeatureConfigSection>(() => getFeatureConfig());

  useEffect(() => {
    const allSettings = getFeatureConfig();
    setSettings(allSettings);
  }, []);

  const handleToggle = (key: keyof FeatureConfigSection) => {
    const newValue = !settings[key];
    setSettings((prev: FeatureConfigSection) => ({ ...prev, [key]: newValue }));
    setFeatureEnabled(key, newValue);
  };

  return (
    <div className="space-y-6">
      {/* 系统开关列表 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center">
          <i className="fas fa-sliders-h text-blue-500 mr-2"></i>
          功能开关
        </h3>

        <div className="space-y-0 divide-y divide-gray-100">
          {SWITCH_CONFIGS.map(config => (
            <div key={config.key} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
              <div className="flex-1 pr-4">
                <div className="text-sm font-medium text-gray-800">{config.label}</div>
                <div className="text-xs text-gray-500 mt-1">{config.description}</div>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  role="switch"
                  aria-checked={settings[config.key] || false}
                  onClick={() => handleToggle(config.key)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings[config.key] ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings[config.key] ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-xs text-gray-500 w-8">
                  {settings[config.key] ? '开启' : '关闭'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 说明 */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-700 mb-3 flex items-center">
          <i className="fas fa-info-circle text-gray-500 mr-2"></i>
          使用说明
        </h3>
        <ul className="text-sm text-gray-500 space-y-2">
          <li className="flex items-start">
            <i className="fas fa-check text-green-500 mt-1 mr-2 text-xs"></i>
            <span>系统开关用于控制各项功能的启用/禁用状态</span>
          </li>
          <li className="flex items-start">
            <i className="fas fa-check text-green-500 mt-1 mr-2 text-xs"></i>
            <span>开关状态会保存在浏览器本地存储中</span>
          </li>
          <li className="flex items-start">
            <i className="fas fa-check text-green-500 mt-1 mr-2 text-xs"></i>
            <span>修改后无需点击保存按钮，状态会自动生效</span>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default SystemPanel;