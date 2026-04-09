import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import * as marketNewsService from '../services/marketNewsService';

export type { NewsItem } from '../services/marketNewsService';

type NewsItem = marketNewsService.NewsItem;

interface NewsContextValue {
  news: NewsItem[];
  reload: () => void;
  reloadTrigger: number;
}

const NewsContext = createContext<NewsContextValue>({
  news: [],
  reload: () => {},
  reloadTrigger: 0,
});

export const NewsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [reloadTrigger, setReloadTrigger] = useState(0);

  const [news, setNews] = useState<NewsItem[]>(() => marketNewsService.getNews());

  const reload = useCallback(() => {
    // 从 service 重新读取缓存
    setNews(marketNewsService.getNews());
    setReloadTrigger(prev => prev + 1);
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
    <NewsContext.Provider value={{ news, reload, reloadTrigger }}>
      {children}
    </NewsContext.Provider>
  );
};

export const useNews = () => useContext(NewsContext);