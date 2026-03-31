import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import * as cacheService from '../services/cacheService';
import { fetchMarketNews, NewsItem } from '../services/fundService';
import { JobResult } from '../types';

export type { NewsItem };

interface NewsContextValue {
  news: NewsItem[];
  loading: boolean;
  error: boolean;
  setNews: (news: NewsItem[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: boolean) => void;
  reload: () => void;
  reloadTrigger: number;
  loadNews: () => Promise<JobResult<NewsItem[]>>;
}

const NewsContext = createContext<NewsContextValue>({
  news: [],
  loading: true,
  error: false,
  setNews: () => {},
  setLoading: () => {},
  setError: () => {},
  reload: () => {},
  reloadTrigger: 0,
  loadNews: async () => ({ success: true }),
});

export const NewsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // 初始化时从缓存读取，实现秒开
  const [news, setNews] = useState<NewsItem[]>(() => cacheService.getNews());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  const reload = useCallback(() => {
    setReloadTrigger(prev => prev + 1);
  }, []);

  const loadNews = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const result = await fetchMarketNews();

      if (result.success && result.data && result.data.length > 0) {
        cacheService.setNews(result.data);
        setNews(result.data);
        return { success: true, data: result.data };
      } else {
        setNews([]);
        setError(true);
        return { success: false, message: result.message };
      }
    } catch (e: unknown) {
      setError(true);
      return { success: false, message: (e as Error).message || '未知错误' };
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <NewsContext.Provider value={{ news, loading, error, setNews, setLoading, setError, reload, reloadTrigger, loadNews }}>
      {children}
    </NewsContext.Provider>
  );
};

export const useNews = () => useContext(NewsContext);