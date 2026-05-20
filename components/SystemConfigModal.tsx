/**
 * SystemConfigModal.tsx
 *
 * 系统配置界面容器组件，整合备份管理、同步管理、AI配置和系统开关。
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import BackupPanel from './config/BackupPanel';
import SyncPanel from './config/SyncPanel';
import AIPanel from './config/AIPanel';
import SystemPanel from './config/SystemPanel';
import SystemParamsPanel from './config/SystemParamsPanel';
import DataSnapshotPanel from './config/DataSnapshotPanel';
import SystemResourcePanel from './config/SystemResourcePanel';
import StrategyParamsPanel from './config/StrategyParamsPanel';
import SearchProvidersPanel from './config/SearchProvidersPanel';
import { Ticker, MarketIndex } from '../types';

export type ConfigSection = 'backup' | 'sync' | 'ai' | 'system' | 'params' | 'strategy' | 'search' | 'resource' | 'snapshot';

interface SystemConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncNow?: () => void;
  portfolio?: Ticker[];
  indicesConfig?: string[];
  marketIndices?: MarketIndex[];
  onBackupSettingsChange?: (time: string, enabled: boolean) => void;
}

interface NavItem {
  id: ConfigSection;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'backup', label: '备份管理', icon: 'fa-save' },
  { id: 'sync', label: '同步管理', icon: 'fa-sync-alt' },
  { id: 'ai', label: 'AI配置', icon: 'fa-robot' },
  { id: 'system', label: '系统开关', icon: 'fa-toggle-on' },
  { id: 'params', label: '系统参数', icon: 'fa-cogs' },
  { id: 'strategy', label: '交易策略', icon: 'fa-chart-line' },
  { id: 'search', label: '搜索服务', icon: 'fa-search' },
  { id: 'resource', label: '系统资源', icon: 'fa-database' },
  { id: 'snapshot', label: '数据快照', icon: 'fa-camera' },
];

const SystemConfigModal: React.FC<SystemConfigModalProps> = ({
  isOpen,
  onClose,
  onSyncNow,
  portfolio = [],
  indicesConfig = [],
  marketIndices = [],
  onBackupSettingsChange,
}) => {
  const [activeSection, setActiveSection] = useState<ConfigSection>('backup');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  const handleSyncNow = () => {
    onClose();
    if (onSyncNow) {
      onSyncNow();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="system-config-title"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal body */}
      <div className="relative bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <h2 id="system-config-title" className="text-lg font-bold text-gray-800">
            系统配置
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors"
            aria-label="关闭"
          >
            <i className="fas fa-times" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Left navigation */}
          <nav className="w-[200px] shrink-0 border-r border-gray-100 py-4 overflow-y-auto">
            <ul className="space-y-1 px-3">
              {NAV_ITEMS.map(item => (
                <li key={item.id}>
                  <button
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      activeSection === item.id
                        ? 'bg-blue-50 text-blue-600'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <i className={`fas ${item.icon} w-4 text-center`}></i>
                    <span>{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Right content area */}
          <div className="flex-1 overflow-y-auto p-6" style={{ height: '630px' }}>
            {activeSection === 'backup' && (
              <BackupPanel
                onClose={onClose}
                portfolio={portfolio}
                indicesConfig={indicesConfig}
                marketIndices={marketIndices}
                onBackupSettingsChange={onBackupSettingsChange}
              />
            )}
            {activeSection === 'sync' && <SyncPanel onSyncNow={handleSyncNow} />}
            {activeSection === 'ai' && <AIPanel />}
            {activeSection === 'system' && <SystemPanel />}
            {activeSection === 'params' && <SystemParamsPanel />}
            {activeSection === 'strategy' && <StrategyParamsPanel />}
            {activeSection === 'search' && <SearchProvidersPanel />}
            {activeSection === 'resource' && <SystemResourcePanel />}
            {activeSection === 'snapshot' && <DataSnapshotPanel />}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SystemConfigModal;