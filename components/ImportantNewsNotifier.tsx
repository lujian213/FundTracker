// components/ImportantNewsNotifier.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { FastNewsItem } from '../types/fastNewsTypes';
import { useNews } from '../contexts/NewsContext';

interface NotificationItem {
  id: string;
  news: FastNewsItem;
  isFading: boolean;
}

/**
 * 重要快讯通知组件
 * 简化设计：队列有数据时立即显示，每个通知显示5秒+淡出3秒=8秒周期
 * 支持鼠标悬停：悬停时保持显示，离开后重新开始完整计时
 */
const ImportantNewsNotifier: React.FC = () => {
  const [queue, setQueue] = useState<NotificationItem[]>([]); // 待显示队列
  const [currentNotification, setCurrentNotification] = useState<NotificationItem | null>(null); // 当前显示的通知
  const [notificationTop, setNotificationTop] = useState(150); // 默认150px
  const [isHovered, setIsHovered] = useState(false); // 鼠标悬停状态

  // 使用全局的AI分析模态框状态
  const { openAIModal } = useNews();

  // 监听重要快讯检测事件 - 只负责push到队列
  useEffect(() => {
    const handleImportantNews = (event: CustomEvent<{ news: FastNewsItem[] }>) => {
      const newImportantNews = event.detail.news;

      // 按时间从早到晚排序（确保最早的快讯先显示）
      const sortedNews = [...newImportantNews].sort((a, b) => {
        return new Date(a.showTime).getTime() - new Date(b.showTime).getTime();
      });

      const newItems = sortedNews.map(news => ({
        id: `${news.code}-${Date.now()}`,
        news,
        isFading: false,
      }));
      setQueue(prev => [...prev, ...newItems]);
    };

    window.addEventListener('important-news-detected', handleImportantNews as EventListener);
    return () => {
      window.removeEventListener('important-news-detected', handleImportantNews as EventListener);
    };
  }, []);

  // 当当前通知消失且队列有数据时，立即显示下一个
  useEffect(() => {
    if (currentNotification === null && queue.length > 0) {
      setQueue(prev => {
        const first = prev[0];
        setCurrentNotification(first);
        return prev.slice(1);
      });
    }
  }, [currentNotification, queue.length]);

  // 当前通知的生命周期：显示5秒后开始淡出，第8秒完全消失
  // 鼠标悬停时保持显示，离开后重新开始完整计时
  useEffect(() => {
    if (!currentNotification) return;

    // 鼠标悬停时：保持显示状态，不设置定时器
    if (isHovered) {
      // 如果正在淡出，重置为完全显示
      if (currentNotification.isFading) {
        setCurrentNotification(prev => prev ? { ...prev, isFading: false } : null);
      }
      return;
    }

    // 5秒后开始淡出
    const fadeTimer = setTimeout(() => {
      setCurrentNotification(prev => prev ? { ...prev, isFading: true } : null);
    }, 5000);

    // 8秒后完全消失（触发上面的effect显示下一个）
    const disappearTimer = setTimeout(() => {
      setCurrentNotification(null);
    }, 8000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(disappearTimer);
    };
  }, [currentNotification?.id, isHovered]);

  // 计算通知位置：持仓按钮下方10px
  useEffect(() => {
    const calculatePosition = () => {
      const positionsButton = document.querySelector('#positions-button');
      if (positionsButton) {
        const buttonRect = positionsButton.getBoundingClientRect();
        setNotificationTop(buttonRect.bottom + 10);
      } else {
        setNotificationTop(150);
      }
    };

    // useEffect保证DOM已挂载，无需setTimeout
    calculatePosition();
    window.addEventListener('resize', calculatePosition);
    return () => window.removeEventListener('resize', calculatePosition);
  }, []);

  // 点击通知跳转到快讯详情页
  const handleClick = useCallback((news: FastNewsItem) => {
    window.open(news.url, '_blank', 'noopener,noreferrer');
  }, []);

  // 点击AI分析按钮（使用全局状态）
  const handleAIAnalysis = useCallback((e: React.MouseEvent, news: FastNewsItem) => {
    e.stopPropagation(); // 阻止触发handleClick
    openAIModal(news);
  }, [openAIModal]);

  // 鼠标悬停处理：进入时保持显示
  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  // 鼠标离开处理：离开后重新开始完整计时
  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  if (!currentNotification) return null;

  const positionStyle = {
    top: `${notificationTop}px`,
    right: '20px'
  };

  return (
    <div
      className="fixed z-[9999] w-[280px]"
      style={positionStyle}
    >
      <div
        className={`bg-white border-l-4 border-red-500 rounded-lg shadow-lg p-3 cursor-pointer
          transition-opacity duration-[3000ms] ${
          currentNotification.isFading ? 'opacity-0' : 'opacity-100'
        }`}
        onClick={() => handleClick(currentNotification.news)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* 重要标签 */}
        <div className="flex items-center mb-2">
          <span className="px-2 py-1 bg-red-500 text-white text-[10px] font-bold rounded">
            重要
          </span>
          <span className="ml-2 text-[10px] text-gray-500 font-mono">
            {currentNotification.news.showTime}
          </span>
          {/* AI分析按钮 */}
          <button
            onClick={(e) => handleAIAnalysis(e, currentNotification.news)}
            aria-label="AI分析"
            className="ml-2 text-[10px] text-gray-400 hover:text-blue-500 transition-colors cursor-pointer"
          >
            <i className="fas fa-robot" />
          </button>
          {/* 队列计数 */}
          {queue.length > 0 && (
            <span className="ml-auto px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded">
              +{queue.length}
            </span>
          )}
        </div>

        {/* 标题 */}
        <div className="text-[13px] font-medium text-gray-800 mb-1 line-clamp-2">
          {currentNotification.news.title}
        </div>

        {/* 摘要 */}
        <div className="text-[11px] text-gray-600 line-clamp-2">
          {currentNotification.news.summary}
        </div>
      </div>
    </div>
  );
};

export default ImportantNewsNotifier;