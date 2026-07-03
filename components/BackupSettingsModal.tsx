import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { readBackupConfig, writeBackupConfig } from '../utils/backupService';
import { secondsUntilNext, formatCountdown } from '../utils/dateTimeUtils';
import { useModalBodyStyle } from '../hooks/useModalBodyStyle';

interface Props {
  autoExportTime: string;          // current "HH:mm" value from App state
  autoBackupEnabled: boolean;      // current auto backup enabled state
  onSave: (time: string, enabled: boolean) => void;  // notify App to update its state + reset timer
  onClose: () => void;
}

const BackupSettingsModal: React.FC<Props> = ({ autoExportTime, autoBackupEnabled, onSave, onClose }) => {
  useModalBodyStyle();
  const [tmpTime, setTmpTime] = useState(autoExportTime);
  const [tmpEnabled, setTmpEnabled] = useState(autoBackupEnabled);
  const [error, setError] = useState('');
  // Countdown is based on tmpTime (the currently edited value) so it updates as the user changes the input
  const [countdown, setCountdown] = useState(() => tmpEnabled ? secondsUntilNext(autoExportTime) : 0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Recompute countdown whenever tmpTime or tmpEnabled changes, and tick every second
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    // Only run countdown if tmpEnabled is true and tmpTime looks valid
    if (tmpEnabled && /^\d{2}:\d{2}$/.test(tmpTime)) {
      setCountdown(secondsUntilNext(tmpTime));
      intervalRef.current = setInterval(() => {
        setCountdown(secondsUntilNext(tmpTime));
      }, 1000);
    } else {
      setCountdown(0);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [tmpTime, tmpEnabled]);

  const handleSave = () => {
    if (tmpEnabled && !/^\d{2}:\d{2}$/.test(tmpTime)) {
      setError('请输入有效的时间（HH:mm）');
      return;
    }
    writeBackupConfig({ autoExportTime: tmpTime, autoBackupEnabled: tmpEnabled });
    onSave(tmpTime, tmpEnabled);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="backup-settings-title"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal body */}
      <div className="relative bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 id="backup-settings-title" className="text-base font-bold text-gray-800">
            备份设置
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors"
            aria-label="关闭"
          >
            <i className="fas fa-times" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Auto Backup Toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">启用自动备份</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={tmpEnabled}
                onChange={e => setTmpEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 rounded-full"></div>
            </label>
          </div>

          {/* Time picker - conditionally disabled based on toggle */}
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

          {/* Countdown */}
          <div className="bg-green-50 rounded-2xl px-4 py-3 flex items-center space-x-3">
            <i className="fas fa-clock text-green-500 text-sm" />
            <div>
              <p className="text-xs text-green-700 font-medium">自动备份状态</p>
              {tmpEnabled ? (
                <>
                  <p className="text-xs text-green-700">距下次自动备份还有</p>
                  <p className="text-lg font-mono font-bold text-green-700 leading-tight">
                    {formatCountdown(countdown)}
                  </p>
                </>
              ) : (
                <p className="text-lg font-bold text-gray-500 leading-tight">已关闭</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 py-4 text-sm font-bold text-gray-400 hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
          <div className="w-px bg-gray-100" />
          <button
            onClick={handleSave}
            className="flex-1 py-4 text-sm font-bold text-blue-600 hover:bg-blue-50 transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default BackupSettingsModal;


