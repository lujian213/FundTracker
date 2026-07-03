// components/NewsSidebar.tsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FastNewsItem } from '../types/fastNewsTypes';
import { getFastNews } from '../services/marketNewsService';
import { getTimerJobScheduler } from '../services/timerJobScheduler';
import { useNews } from '../contexts/NewsContext';
import NewsCard from './NewsCard';

interface NewsSidebarProps {
  isVisible: boolean;
  onClose: () => void;
}

/**
 * 财经快讯侧边栏组件
 */
const NewsSidebar: React.FC<NewsSidebarProps> = ({ isVisible, onClose }) => {
  const [news, setNews] = useState<FastNewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 使用全局的AI分析模态框状态
  const { openAIModal } = useNews();

  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 监听缓存更新事件
  useEffect(() => {
    const handleCacheUpdate = () => {
      const cached = getFastNews();
      if (cached.length > 0) {
        setNews(cached);
        setError(null);
        setIsLoading(false);
      } else {
        setError('快讯正在加载中...');
        setIsLoading(true);
      }
    };

    // 初始读取缓存
    handleCacheUpdate();

    window.addEventListener('fast-news-cache-updated', handleCacheUpdate);
    return () => window.removeEventListener('fast-news-cache-updated', handleCacheUpdate);
  }, []);

  // 侧边栏显示时隐藏窗口滚动条，消失时恢复
  // 通过添加 padding-right 补偿滚动条宽度，防止滚动条消失导致的页面抖动
  useEffect(() => {
    if (isVisible) {
      // 计算滚动条宽度
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }

    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [isVisible]);

  // 处理鼠标离开,延迟 300ms 后关闭
  const handleMouseLeave = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
    closeTimeoutRef.current = setTimeout(() => {
      onClose();
    }, 300);
  }, [onClose]);

  // 处理鼠标进入,取消关闭
  const handleMouseEnter = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  // 手动刷新按钮：触发后台任务立即执行
  const handleRefresh = useCallback(() => {
    const scheduler = getTimerJobScheduler();
    scheduler._triggerJob?.('fast-news-refresh');
    setIsLoading(true);
  }, []);

  // 点击快讯卡片
  const handleNewsClick = useCallback((item: FastNewsItem) => {
    window.open(item.url, '_blank', 'noopener,noreferrer');
  }, []);

  // 打开AI分析模态框（使用全局状态）
  const handleAIAnalysis = useCallback((item: FastNewsItem) => {
    openAIModal(item);
  }, [openAIModal]);

  return (
    <div
      className={`fixed right-0 top-0 bottom-0 w-[420px] bg-gray-50 border-l border-gray-200 shadow-xl z-[9998] transition-transform duration-300 ease-out flex flex-col ${
        isVisible ? 'translate-x-0' : 'translate-x-full'
      }`}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={handleMouseEnter}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
        <div>
          <h3 className="text-sm font-bold text-gray-800">财经快讯 · 全球直播</h3>
          <p className="text-[10px] text-gray-500">{news.length} 条快讯</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50"
          title="刷新快讯"
          aria-label="刷新快讯"
        >
          <i className={`fas fa-sync-alt ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 快讯列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading && news.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <div className="flex items-center space-x-2 text-gray-500">
              <div className="h-2 w-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="h-2 w-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="h-2 w-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
            {error}
          </div>
        ) : (
          news.map((item) => (
            <NewsCard
              key={item.code}
              news={item}
              onClick={() => handleNewsClick(item)}
              onAIAnalysis={handleAIAnalysis}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default NewsSidebar;