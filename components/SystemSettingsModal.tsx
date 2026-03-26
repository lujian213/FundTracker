/**
 * SystemSettingsModal.tsx
 *
 * 系统开关窗口组件，用于管理系统级功能开关。
 */

import React, { useState, useEffect } from 'react';
import { getSystemSettings, setFeatureEnabled, SystemSettings } from '../services/systemSettingsService';

interface SystemSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SwitchConfig {
  key: keyof SystemSettings;
  label: string;
  description: string;
}

const SWITCH_CONFIGS: SwitchConfig[] = [
  {
    key: 'initialPriceAdjustmentEnabled',
    label: '初始价格调整',
    description: '启用后可在基金详情页调整初始价格',
  },
];

export const SystemSettingsModal: React.FC<SystemSettingsModalProps> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState<SystemSettings>({
    initialPriceAdjustmentEnabled: false,
  });

  useEffect(() => {
    if (isOpen) {
      // Single read for all settings
      const allSettings = getSystemSettings();
      setSettings(allSettings);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggle = (key: keyof SystemSettings) => {
    const newValue = !settings[key];
    setSettings(prev => ({ ...prev, [key]: newValue }));
    setFeatureEnabled(key, newValue);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 150 }}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>
      <div className="relative bg-white rounded-2xl w-full max-w-md p-6 z-40">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-gray-800">系统开关</h3>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors"
            aria-label="关闭"
          >
            <i className="fas fa-times text-gray-400"></i>
          </button>
        </div>

        <div className="space-y-4">
          {SWITCH_CONFIGS.map(config => (
            <div key={config.key} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
              <div className="flex-1">
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
    </div>
  );
};

export default SystemSettingsModal;