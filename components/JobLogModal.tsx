import React, { useEffect, useRef, useState } from 'react';
import { JobLogEntry, subscribeLogs, clearLogs, formatDateTime } from '../services/jobLogService';

interface JobLogModalProps {
  onClose: () => void;
}

const JobLogModal: React.FC<JobLogModalProps> = ({ onClose }) => {
  const [logs, setLogs] = useState<JobLogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  useEffect(() => {
    // 订阅日志变化
    const unsubscribe = subscribeLogs((newLogs) => {
      // 检查滚动位置
      if (scrollRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 50;
      }

      setLogs(newLogs);

      // 如果滚动条在底部，自动滚动到最新
      if (isAtBottomRef.current && scrollRef.current) {
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        }, 0);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleClearLogs = () => {
    clearLogs();
  };

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 50;
    }
  };

  const getStatusColor = (status?: 'running' | 'success' | 'failure') => {
    switch (status) {
      case 'running':
        return 'text-blue-500';
      case 'success':
        return 'text-green-500';
      case 'failure':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const getStatusText = (status?: 'running' | 'success' | 'failure') => {
    switch (status) {
      case 'running':
        return '运行中';
      case 'success':
        return '成功';
      case 'failure':
        return '失败';
      default:
        return '';
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose}></div>

      {/* 日志窗口 */}
      <div className="relative bg-white rounded-xl shadow-2xl w-[600px] h-[500px] flex flex-col overflow-hidden">
        {/* 标题栏 */}
        <div className="flex-none flex justify-between items-center px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h2 className="text-base font-bold text-gray-700">后台任务日志</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClearLogs}
              className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
            >
              清空日志
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>

        {/* 日志内容 */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-3 space-y-2"
          style={{ height: '420px' }}
        >
          {logs.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-8">
              暂无日志记录
            </div>
          ) : (
            logs.map((log) => {
              // 计算耗时
              const duration = log.endTime
                ? Math.round((log.endTime.getTime() - log.startTime.getTime()) / 1000)
                : null;
              const durationText = duration !== null
                ? (duration < 60
                    ? `${duration}秒`
                    : duration < 3600
                      ? `${Math.floor(duration / 60)}分${duration % 60}秒`
                      : `${Math.floor(duration / 3600)}小时${Math.floor((duration % 3600) / 60)}分`)
                : null;

              return (
                <div key={log.id} className="text-xs bg-gray-50 rounded p-2 border border-gray-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-700">{log.taskName}</span>
                    <span className={`font-medium ${getStatusColor(log.status)}`}>
                      {getStatusText(log.status)}
                    </span>
                  </div>
                  <div className="text-gray-500 space-y-0.5">
                    <div>开始: {formatDateTime(log.startTime)}</div>
                    {log.endTime && (
                      <div>完成: {formatDateTime(log.endTime)}</div>
                    )}
                    {durationText && (
                      <div>耗时: {durationText}</div>
                    )}
                    {log.message && (
                      <div className="text-gray-400 truncate">{log.message}</div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default JobLogModal;