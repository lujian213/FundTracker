
import React, { useState, useEffect, useRef } from 'react';
import { fetchMarketNews } from '../services/fundService';

export const MarketNewsTicker: React.FC = () => {
  const [news, setNews] = useState<{ id: string, title: string, time: string, url: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadNews = async () => {
    try {
      setLoading(true);
      const data = await fetchMarketNews();
      if (data && data.length > 0) {
        setNews(data);
      }
    } catch (e) {
      console.error("[Ticker] Error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNews();
    const interval = setInterval(loadNews, 300000); // 5分钟重载一次
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full bg-blue-50/80 backdrop-blur-md border-b border-blue-100 h-10 flex items-center overflow-hidden z-10">
      <div className="flex-shrink-0 bg-blue-600 h-full px-4 flex items-center z-20 shadow-[4px_0_12px_rgba(37,99,235,0.2)]">
        <i className="fas fa-bolt text-white text-xs mr-2 animate-pulse"></i>
        <span className="text-[10px] font-black text-white uppercase tracking-widest whitespace-nowrap">市场快讯</span>
      </div>

      <div className="flex-1 relative overflow-hidden h-full flex items-center" ref={containerRef}>
        {loading && news.length === 0 ? (
          <div className="flex items-center h-full px-6 space-x-3">
            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-ping"></div>
            <span className="text-[11px] text-blue-500 font-bold italic">正在通过加密隧道接入全球金融直播间...</span>
          </div>
        ) : news.length > 0 ? (
          <div className="absolute whitespace-nowrap flex items-center h-full animate-marquee hover:[animation-play-state:paused] cursor-pointer">
            {/* 重复内容以实现无缝循环 */}
            {[...news, ...news, ...news].map((item, idx) => (
              <a
                key={`${item.id}-${idx}`}
                href={item.url}
                target={item.url === '#' ? '_self' : '_blank'}
                rel="noreferrer"
                className="inline-flex items-center px-10 group"
              >
                <span className="text-[10px] font-mono font-bold text-blue-500 mr-2 bg-blue-100/50 px-1.5 py-0.5 rounded">
                  {item.time}
                </span>
                <span className="text-[11px] font-bold text-gray-700 group-hover:text-blue-600 transition-colors">
                  {item.title}
                </span>
                <div className="ml-10 w-1 h-1 bg-blue-200 rounded-full"></div>
              </a>
            ))}
          </div>
        ) : (
          <div className="px-6 text-[11px] text-gray-400">
             连接中...
          </div>
        )}
      </div>

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.33%); }
        }
        .animate-marquee {
          animation: marquee 160s linear infinite;
        }
      `}</style>
    </div>
  );
};
