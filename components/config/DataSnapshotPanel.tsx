/**
 * components/config/DataSnapshotPanel.tsx
 *
 * 数据快照面板 - 用于生成测试数据快照
 */

import React, { useState } from 'react';
import { buildSnapshotData, downloadSnapshotFile } from '../../utils/dataSnapshotService';

const DataSnapshotPanel: React.FC = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setMessage(null);

    try {
      const snapshotData = buildSnapshotData();
      downloadSnapshotFile(snapshotData);
      setMessage({ type: 'success', text: '测试数据快照已生成并下载' });
    } catch (err) {
      console.error('生成快照失败:', err);
      setMessage({ type: 'error', text: '生成快照失败' });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center">
          <i className="fas fa-camera text-blue-500 mr-2"></i>
          测试数据快照
        </h3>

        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            将当前 localStorage 数据和市场新闻缓存导出为 JSON 文件，用于测试数据准备。
          </p>

          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-600 font-medium mb-2">导出的数据会自动隐藏敏感信息：</p>
            <ul className="text-xs text-gray-500 space-y-1">
              <li>• 同步配置的用户名和密码</li>
              <li>• AI 配置的 API 密钥</li>
            </ul>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`w-full py-2.5 text-sm font-bold rounded-xl transition-colors flex items-center justify-center space-x-2 ${
              isGenerating
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            <i className="fas fa-download"></i>
            <span>{isGenerating ? '生成中...' : '生成测试数据快照'}</span>
          </button>
        </div>
      </div>

      {/* 消息提示 - 固定高度预留，避免显示/消失时窗口抖动 */}
      <div className="h-10">
        {message && (
          <div className={`rounded-xl p-3 flex items-center space-x-2 ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}>
            <i className={`fas ${message.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'} text-sm`}></i>
            <span className="text-sm font-medium">{message.text}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataSnapshotPanel;