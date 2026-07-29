/**
 * components/config/BackupPanel.tsx
 *
 * 备份管理面板，包含自动备份设置和手动备份/导入功能。
 */

import React, { useState, useEffect, useRef } from 'react';
import { readBackupConfig, writeBackupConfig, buildBackupData, downloadBackupFile } from '../../utils/backupService';
import { exportFundConfig, downloadFundConfig, importFundConfig } from '../../utils/fundConfigExportService';
import { secondsUntilNext, formatCountdown } from '../../utils/dateTimeUtils';
import { Ticker, MarketIndex } from '../../types';

interface BackupPanelProps {
  onClose: () => void;
  portfolio: Ticker[];
  indicesConfig: string[];
  marketIndices: MarketIndex[];
  onBackupSettingsChange?: (time: string, enabled: boolean) => void;
}

const BackupPanel: React.FC<BackupPanelProps> = ({
  onClose,
  portfolio,
  indicesConfig,
  marketIndices,
  onBackupSettingsChange,
}) => {
  const [tmpTime, setTmpTime] = useState(() => readBackupConfig().autoExportTime);
  const [tmpEnabled, setTmpEnabled] = useState(() => readBackupConfig().autoBackupEnabled ?? false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(() => tmpEnabled ? secondsUntilNext(tmpTime) : 0);
  const [isExporting, setIsExporting] = useState(false);
  const [isImportingConfig, setIsImportingConfig] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fundConfigFileInputRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  // 组件挂载状态追踪
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 倒计时逻辑
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (tmpEnabled && /^\d{2}:\d{2}$/.test(tmpTime)) {
      setCountdown(secondsUntilNext(tmpTime));
      intervalRef.current = setInterval(() => {
        setCountdown(secondsUntilNext(tmpTime));
      }, 1000);
    } else {
      setCountdown(0);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [tmpTime, tmpEnabled]);

  // 保存消息自动消失
  useEffect(() => {
    if (saveMessage) {
      const timer = setTimeout(() => {
        if (isMountedRef.current) {
          setSaveMessage(null);
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [saveMessage]);

  const handleSave = () => {
    if (tmpEnabled && !/^\d{2}:\d{2}$/.test(tmpTime)) {
      setError('请输入有效的时间（HH:mm）');
      return;
    }
    writeBackupConfig({ autoExportTime: tmpTime, autoBackupEnabled: tmpEnabled });
    // 回调通知父组件更新状态
    if (onBackupSettingsChange) {
      onBackupSettingsChange(tmpTime, tmpEnabled);
    }
    setError('');
    setSaveMessage({ type: 'success', text: '备份设置已保存' });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await buildBackupData(portfolio, indicesConfig, marketIndices);
      downloadBackupFile(data, false);
    } catch (err) {
      console.error('导出备份失败:', err);
      setSaveMessage({ type: 'error', text: '导出备份失败' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        // 将数据传递给父组件处理
        const normalizeIndices = (arr: any[]): any[] =>
          arr.map(item => typeof item === 'string' ? { symbol: item } : item);

        const normalized = {
          portfolio: Array.isArray(imported) ? imported : (imported.portfolio || []),
          indices: normalizeIndices(imported.indices || []),
          globalIndices: normalizeIndices(imported.globalIndices || []),
          positions: imported.positions || {},
          trades: imported.trades || {},
          comboTrades: imported.comboTrades || {},
          config: imported.config || { autoExportTime: '16:00' },
        };

        // 触发自定义事件通知父组件处理导入数据
        window.dispatchEvent(new CustomEvent('backup-import', { detail: normalized }));
        onClose();
      } catch {
        setSaveMessage({ type: 'error', text: '导入文件格式错误' });
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // 基金配置分享功能
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * 导出基金配置
   */
  const handleExportFundConfig = () => {
    try {
      const data = exportFundConfig();

      // 检查是否有数据导出
      if (data.funds.length === 0) {
        setSaveMessage({ type: 'error', text: '没有可导出的基金配置（需要先设置持仓配置）' });
        return;
      }

      downloadFundConfig(data);
      setSaveMessage({ type: 'success', text: `导出成功，共 ${data.funds.length} 只基金配置` });
    } catch (err) {
      console.error('导出基金配置失败:', err);
      setSaveMessage({ type: 'error', text: '导出基金配置失败' });
    }
  };

  /**
   * 点击导入基金配置按钮
   */
  const handleFundConfigImportClick = () => {
    fundConfigFileInputRef.current?.click();
  };

  /**
   * 导入基金配置
   */
  const handleFundConfigImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImportingConfig(true);
    setSaveMessage(null);

    try {
      const content = await file.text();
      const data = JSON.parse(content);

      // 执行导入
      const result = importFundConfig(data);

      if (result.errors.length > 0) {
        console.error('导入基金配置错误:', result.errors);
        setSaveMessage({
          type: 'error',
          text: `导入失败：${result.errors[0]}`
        });
      } else {
        const message = result.skipped > 0
          ? `导入成功 ${result.imported} 只，跳过 ${result.skipped} 只（无持仓配置或系统中不存在）`
          : `导入成功，共 ${result.imported} 只基金配置`;
        setSaveMessage({ type: 'success', text: message });
      }
    } catch (err) {
      console.error('导入基金配置失败:', err);
      setSaveMessage({ type: 'error', text: '导入文件格式错误' });
    } finally {
      setIsImportingConfig(false);
      event.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* 自动备份设置 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center">
          <i className="fas fa-clock text-blue-500 mr-2"></i>
          自动备份
        </h3>

        <div className="space-y-4">
          {/* 启用/禁用开关 */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">启用自动备份</span>
            <div className="flex items-center space-x-3">
              <button
                role="switch"
                aria-checked={tmpEnabled}
                onClick={() => setTmpEnabled(!tmpEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  tmpEnabled ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    tmpEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-xs text-gray-500 w-8">
                {tmpEnabled ? '开启' : '关闭'}
              </span>
            </div>
          </div>

          {/* 备份时间输入 */}
          <div>
            <label htmlFor="auto-export-time" className="block text-sm font-medium text-gray-700 mb-2">
              每日自动导出时间
            </label>
            <input
              id="auto-export-time"
              type="time"
              value={tmpTime}
              onChange={e => { setTmpTime(e.target.value); setError(''); }}
              disabled={!tmpEnabled}
              className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 ${
                tmpEnabled
                  ? 'border-gray-200 focus:ring-blue-400'
                  : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            />
            {error && (
              <p className="mt-1.5 text-xs text-red-500" role="alert">{error}</p>
            )}
          </div>

          {/* 倒计时显示 - 固定高度布局，避免开关切换时窗口抖动 */}
          <div className="bg-green-50 rounded-2xl px-4 py-3 flex items-center space-x-3 min-h-[68px]">
            <i className="fas fa-clock text-green-500 text-sm" />
            <div className="flex-1">
              <p className="text-xs text-green-700 font-medium">自动备份状态</p>
              <div className="h-7 mt-1">
                {tmpEnabled ? (
                  <p className="text-lg font-mono font-bold text-green-700 leading-tight">
                    距下次备份：{formatCountdown(countdown)}
                  </p>
                ) : (
                  <p className="text-lg font-bold text-gray-500 leading-tight">已关闭</p>
                )}
              </div>
            </div>
          </div>

          {/* 保存按钮 */}
          <button
            onClick={handleSave}
            className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors"
          >
            保存设置
          </button>
        </div>
      </div>

      {/* 手动备份 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center">
          <i className="fas fa-save text-blue-500 mr-2"></i>
          手动备份
        </h3>

        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            手动导出当前数据为备份文件，或从备份文件恢复数据。
          </p>

          <div className="flex space-x-3">
            <button
              onClick={handleExport}
              disabled={isExporting}
              className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-colors flex items-center justify-center space-x-2 ${
                isExporting
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
              }`}
            >
              <i className="fas fa-file-export"></i>
              <span>{isExporting ? '导出中...' : '导出备份'}</span>
            </button>

            <button
              onClick={handleImportClick}
              className="flex-1 py-2.5 text-sm font-bold rounded-xl transition-colors flex items-center justify-center space-x-2 bg-gray-50 text-gray-600 hover:bg-gray-100"
            >
              <i className="fas fa-file-import"></i>
              <span>导入备份</span>
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
        </div>
      </div>

      {/* 基金配置分享 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center">
          <i className="fas fa-share-alt text-green-500 mr-2"></i>
          基金配置分享
        </h3>

        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            导出基金配置（基金代码、名称、常用名称、跟踪指数），分享给其他用户导入使用。
          </p>

          <div className="flex space-x-3">
            <button
              onClick={handleExportFundConfig}
              className="flex-1 py-2.5 text-sm font-bold rounded-xl transition-colors flex items-center justify-center space-x-2 bg-green-50 text-green-600 hover:bg-green-100"
            >
              <i className="fas fa-file-export"></i>
              <span>导出配置</span>
            </button>

            <button
              onClick={handleFundConfigImportClick}
              disabled={isImportingConfig}
              className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-colors flex items-center justify-center space-x-2 ${
                isImportingConfig
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <i className={`fas ${isImportingConfig ? 'fa-spinner fa-spin' : 'fa-file-import'}`}></i>
              <span>{isImportingConfig ? '导入中...' : '导入配置'}</span>
            </button>
          </div>

          <input
            ref={fundConfigFileInputRef}
            type="file"
            accept=".json"
            onChange={handleFundConfigImport}
            className="hidden"
          />
        </div>
      </div>

      {/* 保存消息提示 - 固定高度预留，避免显示/消失时窗口抖动 */}
      <div className="h-10">
        {saveMessage && (
          <div className={`rounded-xl p-3 flex items-center space-x-2 ${
            saveMessage.type === 'success'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}>
            <i className={`fas ${saveMessage.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'} text-sm`}></i>
            <span className="text-sm font-medium">{saveMessage.text}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default BackupPanel;