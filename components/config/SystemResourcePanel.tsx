/**
 * components/config/SystemResourcePanel.tsx
 *
 * 系统资源面板 - 显示 localStorage 使用情况
 */

import React, { useState, useEffect } from 'react';

interface StorageUsage {
  usedBytes: number;
  totalBytes: number;
  usedPercentage: number;
  usedMB: string;
  remainingMB: string;
  isWarning: boolean;
}

// localStorage 估算容量（浏览器通常为 5-10MB）
const ESTIMATED_TOTAL_BYTES = 5 * 1024 * 1024; // 5MB
const WARNING_THRESHOLD = 80; // 80%

const SystemResourcePanel: React.FC = () => {
  const [usage, setUsage] = useState<StorageUsage | null>(null);

  useEffect(() => {
    const calculateStorageUsage = (): StorageUsage => {
      let totalUsedBytes = 0;

      // Iterate through all localStorage keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          if (value) {
            // Calculate the actual bytes stored (key + value)
            totalUsedBytes += key.length + value.length;
          }
        }
      }

      // Each character in JS string is 2 bytes (UTF-16)
      totalUsedBytes *= 2;

      const usedPercentage = Math.min(100, (totalUsedBytes / ESTIMATED_TOTAL_BYTES) * 100);
      const remainingBytes = ESTIMATED_TOTAL_BYTES - totalUsedBytes;

      return {
        usedBytes: totalUsedBytes,
        totalBytes: ESTIMATED_TOTAL_BYTES,
        usedPercentage,
        usedMB: formatBytes(totalUsedBytes),
        remainingMB: formatBytes(Math.max(0, remainingBytes)),
        isWarning: usedPercentage >= WARNING_THRESHOLD,
      };
    };

    const formatBytes = (bytes: number): string => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    setUsage(calculateStorageUsage());
  }, []);

  return (
    <div className="space-y-6">
      {/* localStorage 使用情况 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center">
          <i className="fas fa-hdd text-blue-500 mr-2"></i>
          localStorage 使用情况
        </h3>

        {usage && (
          <div className="space-y-4">
            {/* 进度条 */}
            <div className="relative">
              <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    usage.isWarning ? 'bg-red-500' : 'bg-blue-600'
                  }`}
                  style={{ width: `${usage.usedPercentage}%` }}
                />
              </div>
              {/* 百分比标签 */}
              <span className={`absolute top-0 right-0 text-xs font-medium ${
                usage.isWarning ? 'text-red-600' : 'text-gray-600'
              }`}>
                {usage.usedPercentage.toFixed(1)}%
              </span>
            </div>

            {/* 详细数值 */}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">已使用: <strong>{usage.usedMB}</strong></span>
              <span className="text-gray-600">剩余: <strong>{usage.remainingMB}</strong></span>
            </div>

            {/* 警告信息 */}
            {usage.isWarning && (
              <div className="bg-red-50 rounded-lg p-3 flex items-center space-x-2">
                <i className="fas fa-exclamation-triangle text-red-500 text-sm"></i>
                <span className="text-sm text-red-700">
                  localStorage 空间使用超过 {WARNING_THRESHOLD}%，建议清理历史数据或导出备份
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 说明 */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-700 mb-3 flex items-center">
          <i className="fas fa-info-circle text-gray-500 mr-2"></i>
          说明
        </h3>
        <ul className="text-sm text-gray-500 space-y-2">
          <li className="flex items-start">
            <i className="fas fa-check text-green-500 mt-1 mr-2 text-xs"></i>
            <span>localStorage 估算容量为 5MB，实际容量因浏览器而异</span>
          </li>
          <li className="flex items-start">
            <i className="fas fa-check text-green-500 mt-1 mr-2 text-xs"></i>
            <span>数据使用 LZString 压缩存储，实际占用空间已考虑压缩效果</span>
          </li>
          <li className="flex items-start">
            <i className="fas fa-check text-green-500 mt-1 mr-2 text-xs"></i>
            <span>当使用超过 80% 时，进度条会变为红色并显示警告</span>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default SystemResourcePanel;