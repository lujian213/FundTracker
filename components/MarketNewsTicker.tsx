import React, { useEffect } from 'react';
import { useTimerJobErrors } from '../contexts/TimerJobErrorContext';
import { useNews } from '../contexts/NewsContext';

export const MarketNewsTicker: React.FC = () => {
  const { errors: jobErrors } = useTimerJobErrors();
  const { news, loading, error, loadNews, reloadTrigger } = useNews();

  // Load news when reloadTrigger changes (triggered by scheduler)
  useEffect(() => {
    loadNews();
  }, [reloadTrigger, loadNews]);

  // Combine errors and news for display
  const displayItems = [
    ...jobErrors.map(e => ({
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
        {loading && displayItems.length === 0 ? (
          <div className="px-4 text-[10px] text-gray-400 italic">正在接入行情快讯...</div>
        ) : error && displayItems.length === 0 ? (
          <div className="px-4 text-[10px] text-amber-600 flex items-center">
            <i className="fas fa-wifi-slash mr-2 opacity-60"></i>
            行情同步受阻 (可能是网络波动或非交易时段)
            <button onClick={loadNews} className="ml-2 font-bold underline hover:text-red-600">重试</button>
          </div>
        ) : displayItems.length > 0 ? (
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