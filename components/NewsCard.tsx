// components/NewsCard.tsx

import React from 'react';
import { FastNewsItem } from '../types/fastNewsTypes';

interface NewsCardProps {
  news: FastNewsItem;
  onClick?: () => void;
  onAIAnalysis?: (news: FastNewsItem) => void;
}

/**
 * 单条快讯卡片组件
 */
const NewsCard: React.FC<NewsCardProps> = ({ news, onClick, onAIAnalysis }) => {
  const isImportant = news.titleColor === 3;

  // 格式化时间显示 (HH:mm)
  const formattedTime = news.showTime
    ? news.showTime.substring(11, 16) // 从 "YYYY-MM-DD HH:mm:ss" 提取 "HH:mm"
    : '';

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      window.open(news.url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleAIAnalysis = (e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止事件冒泡，避免触发handleClick
    if (onAIAnalysis) {
      onAIAnalysis(news);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`rounded-xl p-3 cursor-pointer transition-all hover:shadow-md ${
        isImportant
          ? 'bg-red-50 border border-red-100'
          : 'bg-white border border-gray-100'
      }`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
    >
      {/* 时间、重要标签、AI分析按钮 */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          {isImportant && (
            <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
              重要
            </span>
          )}
          <span className="text-[10px] text-gray-500">{formattedTime}</span>
        </div>
        {onAIAnalysis && (
          <button
            onClick={handleAIAnalysis}
            className="text-gray-400 hover:text-blue-500 transition-colors p-1"
            aria-label="AI分析"
          >
            <i className="fas fa-robot text-xs" />
          </button>
        )}
      </div>

      {/* 标题 */}
      <h4 className="text-[13px] font-medium text-gray-800 leading-tight line-clamp-2">
        {news.title}
      </h4>

      {/* 摘要 */}
      {news.summary && (
        <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed line-clamp-2">
          {news.summary}
        </p>
      )}
    </div>
  );
};

export default NewsCard;