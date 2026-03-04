import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { writeBackupConfig } from '../utils/backupService';

interface Props {
  autoExportTime: string;          // current "HH:mm" value from App state
  onSave: (time: string) => void;  // notify App to update its state + reset timer
  onClose: () => void;
}

/** Compute seconds until the next occurrence of "HH:mm" in local time. */
function secondsUntilNext(timeStr: string): number {
  const [hh, mm] = timeStr.split(':').map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(hh, mm, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return Math.round((target.getTime() - now.getTime()) / 1000);
}

function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

const BackupSettingsModal: React.FC<Props> = ({ autoExportTime, onSave, onClose }) => {
  const [tmpTime, setTmpTime] = useState(autoExportTime);
  const [error, setError] = useState('');
  // Countdown is based on tmpTime (the currently edited value) so it updates as the user changes the input
  const [countdown, setCountdown] = useState(() => secondsUntilNext(autoExportTime));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Recompute countdown whenever tmpTime changes, and tick every second
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    // Only run countdown if tmpTime looks valid
    if (/^\d{2}:\d{2}$/.test(tmpTime)) {
      setCountdown(secondsUntilNext(tmpTime));
      intervalRef.current = setInterval(() => {
        setCountdown(secondsUntilNext(tmpTime));
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [tmpTime]);

  const handleSave = () => {
    if (!/^\d{2}:\d{2}$/.test(tmpTime)) {
      setError('请输入有效的时间（HH:mm）');
      return;
    }
    writeBackupConfig({ autoExportTime: tmpTime });
    onSave(tmpTime);
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
          {/* Time picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              每日自动导出时间
            </label>
            <input
              type="time"
              value={tmpTime}
              onChange={e => { setTmpTime(e.target.value); setError(''); }}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            {error && (
              <p className="mt-1.5 text-xs text-red-500" role="alert">{error}</p>
            )}
          </div>

          {/* Countdown */}
          <div className="bg-green-50 rounded-2xl px-4 py-3 flex items-center space-x-3">
            <i className="fas fa-clock text-green-500 text-sm" />
            <div>
              <p className="text-xs text-green-700 font-medium">距下次自动备份还有</p>
              <p className="text-lg font-mono font-bold text-green-700 leading-tight">
                {formatCountdown(countdown)}
              </p>
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


