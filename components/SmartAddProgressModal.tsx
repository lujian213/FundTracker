// components/SmartAddProgressModal.tsx

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { SmartAddState } from '../hooks/useSmartAddFunds';

interface SmartAddProgressModalProps {
  visible: boolean;
  state: SmartAddState;
  onComplete?: () => void;
}

export function SmartAddProgressModal({
  visible,
  state,
  onComplete,
}: SmartAddProgressModalProps) {
  useEffect(() => {
    if (!state.isProcessing && state.processed === state.total && state.total > 0) {
      const timer = setTimeout(() => {
        onComplete?.();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [state.isProcessing, state.processed, state.total, onComplete]);

  if (!visible) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div className="relative bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-800">智能添加处理进度</h3>
        </div>

        <div className="px-5 py-6">
          <div className="relative h-4 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`absolute left-0 top-0 h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-300 ${
                state.isProcessing ? 'animate-pulse' : ''
              }`}
              style={{ width: `${state.progress}%` }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-700">
              {state.progress}%
            </span>
          </div>

          <div className="mt-4 text-sm text-gray-600 space-y-2">
            <div className="flex justify-between">
              <span>总图片数：</span>
              <span className="font-medium">{state.total}</span>
            </div>
            <div className="flex justify-between">
              <span>已处理：</span>
              <span className="font-medium">{state.processed}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-green-600">成功：</span>
              <span className="font-medium text-green-600">{state.successCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-red-500">失败：</span>
              <span className="font-medium text-red-500">{state.failCount}</span>
            </div>
          </div>

          {state.isProcessing && state.currentFile && (
            <div className="mt-4 text-sm">
              <span className="text-gray-500">正在处理：</span>
              <span className="ml-2 font-medium">{state.currentFile}</span>
            </div>
          )}

          {state.errors.length > 0 && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="text-sm font-medium text-red-600 mb-2">处理失败</div>
              <div className="overflow-y-auto max-h-[60px] text-xs text-red-500">
                {state.errors.map((err, idx) => (
                  <div key={idx} className="mb-1">
                    <span className="font-medium">{err.fileName}：</span>
                    <span>{err.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}