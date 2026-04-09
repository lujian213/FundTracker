import React, { useEffect, useState } from 'react';
import { useTimerJobErrors } from '../contexts/TimerJobErrorContext';
import { useNews } from '../contexts/NewsContext';

// 每条错误信息最多滚动显示的次数
const MAX_ERROR_SCROLL_COUNT = 3;
// Marquee动画时长（毫秒），每次循环完成后增加计数
const MARQUEE_DURATION_MS = 60000;

export const MarketNewsTicker: React.FC = () => {
  const { errors: jobErrors } = useTimerJobErrors();
  const { news, reloadTrigger } = useNews();
  // 记录每个错误ID的滚动次数
  const [scrollCounts, setScrollCounts] = useState<Map<string, number>>(new Map());

  // reloadTrigger 变化时，news 已经由 service 更新，无需额外操作

  // 每 MARQUEE_DURATION_MS 毫秒增加所有当前显示错误的滚动次数
  useEffect(() => {
    const interval = setInterval(() => {
      setScrollCounts(prev => {
        const next = new Map(prev);
        // 对当前所有错误增加计数
        for (const err of jobErrors) {
          const currentCount = next.get(err.id) || 0;
          next.set(err.id, currentCount + 1);
        }
        return next;
      });
    }, MARQUEE_DURATION_MS);

    return () => clearInterval(interval);
  }, [jobErrors]);

  // 新错误加入时初始化计数为0
  useEffect(() => {
    setScrollCounts(prev => {
      const next = new Map(prev);
      for (const err of jobErrors) {
        if (!next.has(err.id)) {
          next.set(err.id, 0);
        }
      }
      // 清理已移除错误的计数
      for (const [id] of next) {
        if (!jobErrors.find(e => e.id === id)) {
          next.delete(id);
        }
      }
      return next;
    });
  }, [jobErrors]);

  // 过滤掉滚动次数超过限制的错误
  const visibleErrors = jobErrors.filter(err => (scrollCounts.get(err.id) || 0) < MAX_ERROR_SCROLL_COUNT);

  // Combine errors and news for display
  const displayItems = [
    ...visibleErrors.map(e => ({
      id: `error-${e.id}`,
      title: `[${e.jobName}] 执行失败: ${e.message}`,
      time: e.time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      url: '#',
      isError: true,
    })),
    ...news.map(n => ({ ...n, isError: false })),
  ];

  return (
    <div className="w-full bg-white border-b border-gray-100 h-9 flex items-center overflow-hidden z-10">
      <div className="flex-shrink-0 bg-gray-900 h-full px-3 flex items-center z-20">
        <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2 animate-pulse"></div>
        <span className="text-[9px] font-black text-white uppercase tracking-wider whitespace-nowrap">市场热点</span>
      </div>

      <div className="flex-1 relative overflow-hidden h-full flex items-center bg-gray-50/50">
        {displayItems.length > 0 ? (
          <div className="absolute whitespace-nowrap flex items-center h-full animate-marquee hover:[animation-play-state:paused] cursor-pointer">
            {[...displayItems, ...displayItems].map((item, idx) => (
              item.isError ? (
                <span
                  key={`${item.id}-${idx}`}
                  className="inline-flex items-center px-12"
                >
                  <i className="fas fa-exclamation-circle text-red-500 mr-2"></i>
                  <span className="text-[10px] font-mono font-bold text-red-400 mr-2">{item.time}</span>
                  <span className="text-[11px] font-medium text-red-600">
                    {item.title}
                  </span>
                  <div className="ml-12 text-gray-200">/</div>
                </span>
              ) : (
                <a
                  key={`${item.id}-${idx}`}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center px-12 group"
                >
                  <span className="text-[10px] font-mono font-bold text-gray-400 mr-2">{item.time}</span>
                  <span className="text-[11px] font-medium text-gray-600 group-hover:text-red-600 group-hover:underline transition-all">
                    {item.title}
                  </span>
                  <div className="ml-12 text-gray-200">/</div>
                </a>
              )
            ))}
          </div>
        ) : (
          <div className="px-4 text-[10px] text-gray-400 italic">市场休息中，暂无热点资讯</div>
        )}
      </div>

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 60s linear infinite;
        }
      `}</style>
    </div>
  );
};