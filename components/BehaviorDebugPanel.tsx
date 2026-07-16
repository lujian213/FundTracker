import React, { useState } from 'react';
import { createPortal } from 'react-dom';

interface DebugPanelProps {
  debugInfo: string;
  onClose: () => void;
}

const DebugPanel: React.FC<DebugPanelProps> = ({ debugInfo, onClose }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(debugInfo);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  const content = (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col overflow-hidden" style={{ maxHeight: '80vh' }}>
        <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
          <h3 className="text-base font-bold">行为分析调试信息</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              onClick={handleCopy}
            >
              {copied ? '已复制!' : '复制到剪贴板'}
            </button>
            <button
              type="button"
              className="w-6 h-6 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100"
              onClick={onClose}
              aria-label="关闭"
            >
              <i className="fas fa-times" />
            </button>
          </div>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          <pre className="text-xs font-mono bg-gray-50 p-3 rounded-lg whitespace-pre-wrap break-words">
            {debugInfo}
          </pre>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default DebugPanel;