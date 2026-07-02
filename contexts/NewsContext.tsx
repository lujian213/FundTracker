import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import * as marketNewsService from '../services/marketNewsService';
import { FastNewsItem } from '../types/fastNewsTypes';

export type { NewsItem } from '../services/marketNewsService';

type NewsItem = marketNewsService.NewsItem;

interface NewsContextValue {
  news: NewsItem[];
  reload: () => void;
  reloadTrigger: number;
  // AI分析模态框状态（全局唯一）
  aiModalNews: FastNewsItem | null;
  openAIModal: (news: FastNewsItem) => void;
  closeAIModal: () => void;
}

const NewsContext = createContext<NewsContextValue>({
  news: [],
  reload: () => {},
  reloadTrigger: 0,
  aiModalNews: null,
  openAIModal: () => {},
  closeAIModal: () => {},
});

export const NewsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [news, setNews] = useState<NewsItem[]>(() => marketNewsService.getNews());
  const [aiModalNews, setAiModalNews] = useState<FastNewsItem | null>(null);

  const reload = useCallback(() => {
    // 从 service 重新读取缓存
    setNews(marketNewsService.getNews());
    setReloadTrigger(prev => prev + 1);
  }, []);

  const openAIModal = useCallback((news: FastNewsItem) => {
    setAiModalNews(news);
  }, []);

  const closeAIModal = useCallback(() => {
    setAiModalNews(null);
  }, []);

  // 监听缓存更新事件
  useEffect(() => {
    const handleCacheUpdate = () => {
      reload();
    };
    window.addEventListener('news-cache-updated', handleCacheUpdate);
    return () => window.removeEventListener('news-cache-updated', handleCacheUpdate);
  }, [reload]);

  return (
    <NewsContext.Provider value={{ news, reload, reloadTrigger, aiModalNews, openAIModal, closeAIModal }}>
      {children}
    </NewsContext.Provider>
  );
};

export const useNews = () => useContext(NewsContext);