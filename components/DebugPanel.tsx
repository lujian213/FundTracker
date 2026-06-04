/**
 * components/DebugPanel.tsx
 *
 * 调试信息显示窗口
 * 用于显示数据一致性检查结果和关键操作日志
 * 包含滚动条和复制按钮
 *
 * DEBUG_START 2026-06-03: 调试面板组件
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface LogEntry {
  time: string;
  type: string;
  data: any;
}

interface DebugPanelProps {
  visible: boolean;
  onClose: () => void;
}

const MAX_LOG_ENTRIES = 500;

// 全局日志存储
const debugLogs: LogEntry[] = [];

// 添加日志的函数（供其他组件调用）
export function addDebugLog(type: string, data: any): void {
  const entry: LogEntry = {
    time: new Date().toISOString(),
    type,
    data,
  };
  debugLogs.push(entry);
  // 限制日志数量
  if (debugLogs.length > MAX_LOG_ENTRIES) {
    debugLogs.shift();
  }
}

// 获取所有日志
export function getDebugLogs(): LogEntry[] {
  return [...debugLogs];
}

// 清空日志
export function clearDebugLogs(): void {
  debugLogs.length = 0;
}

const DebugPanel: React.FC<DebugPanelProps> = ({ visible, onClose }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // 自动刷新日志
  useEffect(() => {
    if (!visible || !autoRefresh) return;

    const interval = setInterval(() => {
      setLogs(getDebugLogs());
    }, 500);

    return () => clearInterval(interval);
  }, [visible, autoRefresh]);

  // 手动刷新
  const handleRefresh = useCallback(() => {
    setLogs(getDebugLogs());
  }, []);

  // 清空日志
  const handleClear = useCallback(() => {
    clearDebugLogs();
    setLogs([]);
  }, []);

  // 复制日志
  const handleCopy = useCallback(() => {
    const text = logs
      .filter(log => !filter || log.type.includes(filter) || JSON.stringify(log.data).includes(filter))
      .map(log => `[${log.time}] [${log.type}] ${JSON.stringify(log.data, null, 2)}`)
      .join('\n\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
      console.error('Failed to copy debug logs:', err);
    });
  }, [logs, filter]);

  // 过滤日志
  const filteredLogs = logs.filter(log =>
    !filter || log.type.includes(filter) || JSON.stringify(log.data).includes(filter)
  );

  // 滚动到底部
  useEffect(() => {
    if (scrollRef.current && autoRefresh) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLogs, autoRefresh]);

  if (!visible) return null;

  const content = (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden" style={{ height: '80vh' }}>
        {/* 头部 */}
        <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
          <h3 className="text-lg font-bold text-gray-800">
            调试信息面板
            <span className="text-xs text-gray-400 ml-2">(记录数: {filteredLogs.length})</span>
          </h3>
          <div className="flex items-center gap-2">
            {/* 过滤输入 */}
            <input
              type="text"
              placeholder="过滤关键字..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-2 py-1 text-xs border border-gray-200 rounded w-32"
            />
            {/* 自动刷新开关 */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                autoRefresh ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {autoRefresh ? '自动刷新' : '手动'}
            </button>
            {/* 刷新按钮 */}
            <button
              onClick={handleRefresh}
              className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100"
              title="刷新"
            >
              <i className="fas fa-sync-alt" />
            </button>
            {/* 复制按钮 */}
            <button
              onClick={handleCopy}
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                copied ? 'bg-green-100 text-green-600' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
              }`}
              title={copied ? '已复制' : '复制全部'}
            >
              <i className={`fas fa-${copied ? 'check' : 'copy'}`} />
            </button>
            {/* 清空按钮 */}
            <button
              onClick={handleClear}
              className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100"
              title="清空"
            >
              <i className="fas fa-trash" />
            </button>
            {/* 关闭按钮 */}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100"
              title="关闭"
            >
              <i className="fas fa-times" />
            </button>
          </div>
        </div>

        {/* 日志区域 */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 bg-gray-50"
          style={{ scrollbarGutter: 'stable' }}
        >
          {filteredLogs.length === 0 ? (
            <div className="text-center text-gray-400 py-10">
              <i className="fas fa-inbox text-3xl mb-3" />
              <p className="text-sm">暂无日志记录</p>
              <p className="text-xs mt-2">刷新页面后，操作数据会在此显示</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLogs.map((log, index) => (
                <div
                  key={index}
                  className={`p-2 rounded-lg border ${
                    log.type.includes('MISMATCH') || log.type.includes('ERROR') || log.type.includes('WARN')
                      ? 'bg-red-50 border-red-200'
                      : log.type.includes('SUCCESS')
                        ? 'bg-green-50 border-green-200'
                        : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-400 font-mono">{log.time}</span>
                    <span className={`text-xs font-bold ${
                      log.type.includes('MISMATCH') || log.type.includes('ERROR') || log.type.includes('WARN')
                        ? 'text-red-600'
                        : log.type.includes('SUCCESS')
                          ? 'text-green-600'
                          : 'text-blue-600'
                    }`}>
                      [{log.type}]
                    </span>
                  </div>
                  <pre className="text-xs text-gray-700 whitespace-pre-wrap overflow-x-auto font-mono">
                    {JSON.stringify(log.data, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部提示 */}
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex justify-between items-center flex-shrink-0">
          <span className="text-xs text-gray-400">
            提示: 日志记录在内存中，最多保留 {MAX_LOG_ENTRIES} 条，页面刷新后清空
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">
              过滤类型:
              <button onClick={() => setFilter('MISMATCH')} className="ml-1 px-2 py-0.5 bg-red-100 text-red-600 rounded text-xs hover:bg-red-200">错位</button>
              <button onClick={() => setFilter('HistoryRequest')} className="ml-1 px-2 py-0.5 bg-blue-100 text-blue-600 rounded text-xs hover:bg-blue-200">历史</button>
              <button onClick={() => setFilter('updateValuation')} className="ml-1 px-2 py-0.5 bg-green-100 text-green-600 rounded text-xs hover:bg-green-200">估值</button>
              <button onClick={() => setFilter('')} className="ml-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200">全部</button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default DebugPanel;
// DEBUG_END