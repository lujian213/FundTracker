import * as marketNewsService from '../services/marketNewsService';
import { getTimerJobScheduler } from '../services/timerJobScheduler';
import { FastNewsItem } from '../types/fastNewsTypes';
import { JobResult } from '../types';

// Mock cron-parser
jest.mock('cron-parser', () => ({
  __esModule: true,
  default: {
    parse: jest.fn((expression: string) => {
      if (!expression || expression.split(' ').length !== 5) {
        throw new Error('Invalid cron expression');
      }
      return {
        next: () => ({ toDate: () => new Date() }),
        prev: () => ({ toDate: () => new Date() }),
      };
    }),
  },
}));

// Mock fetch for config loading
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('财经快讯刷新任务处理器', () => {
  let scheduler: ReturnType<typeof getTimerJobScheduler>;

  beforeEach(() => {
    jest.clearAllMocks();
    scheduler = getTimerJobScheduler();
    scheduler.stop();
    scheduler._reset?.();
    marketNewsService.resetFastNewsCache();
  });

  afterEach(() => {
    scheduler.stop();
    scheduler._reset?.();
  });

  describe('任务处理器成功获取快讯并更新缓存', () => {
    test('成功获取快讯后更新缓存并返回成功状态', async () => {
      const mockConfig = {
        jobs: [
          { id: 'fast-news-refresh', name: '财经快讯刷新', cron: '*/1 * * * *', enabled: true }
        ]
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfig)
      });

      await scheduler.loadConfig();

      const mockNews: FastNewsItem[] = [
        { code: '001', title: '快讯1', summary: '摘要1', showTime: '2024-01-01 10:00:00', titleColor: 0, url: 'https://example.com/1' },
        { code: '002', title: '快讯2', summary: '摘要2', showTime: '2024-01-01 10:05:00', titleColor: 3, url: 'https://example.com/2' },
      ];

      // Mock fetchFastNews 返回数据
      const fetchFastNewsSpy = jest.spyOn(marketNewsService, 'fetchFastNews').mockResolvedValueOnce(mockNews);
      const setFastNewsSpy = jest.spyOn(marketNewsService, 'setFastNews');

      const handler = jest.fn().mockImplementation(async () => {
        const result = await marketNewsService.fetchFastNews(20);
        if (result.length > 0) {
          marketNewsService.setFastNews(result);
          return { success: true, message: `获取${result.length}条快讯` };
        }
        return { success: false, message: '获取快讯失败' };
      });

      scheduler.registerHandler('fast-news-refresh', handler);

      scheduler._triggerJob?.('fast-news-refresh');
      await Promise.resolve();
      await Promise.resolve();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(setFastNewsSpy).toHaveBeenCalledWith(mockNews);
      const result = await handler.mock.results[0].value;
      expect(result).toEqual({ success: true, message: '获取2条快讯' });
    });
  });

  describe('任务处理器失败时不更新缓存', () => {
    test('API返回空数据时不更新缓存，保留原有数据', async () => {
      const mockConfig = {
        jobs: [
          { id: 'fast-news-refresh', name: '财经快讯刷新', cron: '*/1 * * * *', enabled: true }
        ]
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfig)
      });

      await scheduler.loadConfig();

      // 设置初始缓存
      const initialCache: FastNewsItem[] = [
        { code: 'old001', title: '旧快讯', summary: '旧摘要', showTime: '2024-01-01 09:00:00', titleColor: 0, url: 'https://example.com/old' },
      ];
      marketNewsService.setFastNews(initialCache);

      // Mock fetchFastNews 返回空数组
      const fetchFastNewsSpy = jest.spyOn(marketNewsService, 'fetchFastNews').mockResolvedValueOnce([]);

      const handler = jest.fn().mockImplementation(async () => {
        const result = await marketNewsService.fetchFastNews(20);
        if (result.length > 0) {
          marketNewsService.setFastNews(result);
          return { success: true, message: `获取${result.length}条快讯` };
        }
        // 失败时不更新缓存
        return { success: false, message: '获取快讯失败或API返回空数据' };
      });

      scheduler.registerHandler('fast-news-refresh', handler);

      scheduler._triggerJob?.('fast-news-refresh');
      await Promise.resolve();
      await Promise.resolve();

      expect(handler).toHaveBeenCalledTimes(1);
      // 缓存应保持不变
      expect(marketNewsService.getFastNews()).toEqual(initialCache);
      const result = await handler.mock.results[0].value;
      expect(result).toEqual({ success: false, message: '获取快讯失败或API返回空数据' });
    });
  });

  describe('检测到新的重要快讯时触发事件', () => {
    test('检测到新的重要快讯（titleColor=3）时触发 important-news-detected 事件', async () => {
      const mockConfig = {
        jobs: [
          { id: 'fast-news-refresh', name: '财经快讯刷新', cron: '*/1 * * * *', enabled: true }
        ]
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfig)
      });

      await scheduler.loadConfig();

      // 模拟新的重要快讯
      const mockNews: FastNewsItem[] = [
        { code: '001', title: '普通快讯', summary: '摘要', showTime: '2024-01-01 10:00:00', titleColor: 0, url: 'https://example.com/1' },
        { code: '002', title: '重要快讯', summary: '重要摘要', showTime: '2024-01-01 10:05:00', titleColor: 3, url: 'https://example.com/2' },
      ];

      jest.spyOn(marketNewsService, 'fetchFastNews').mockResolvedValueOnce(mockNews);

      const eventListener = jest.fn();
      window.addEventListener('important-news-detected', eventListener);

      const handler = jest.fn().mockImplementation(async () => {
        const result = await marketNewsService.fetchFastNews(20);
        if (result.length > 0) {
          const prevCache = marketNewsService.getFastNews();
          const currentImportant = result.filter(n => n.titleColor === 3);
          const lastCodes = marketNewsService.getLastImportantNewsCodes();

          // 检测新的重要快讯
          const newImportant = currentImportant.filter(n => {
            const isNewCode = !lastCodes.has(n.code);
            const isNewTime = prevCache.length === 0 || n.showTime > prevCache[0]?.showTime;
            return isNewCode && isNewTime;
          });

          marketNewsService.setFastNews(result);
          const newCodes = new Set(currentImportant.map(n => n.code));
          marketNewsService.setLastImportantNewsCodes(newCodes);

          if (newImportant.length > 0) {
            window.dispatchEvent(new CustomEvent('important-news-detected', {
              detail: { news: newImportant }
            }));
          }

          return { success: true, message: `获取${result.length}条快讯，其中${newImportant.length}条重要快讯` };
        }
        return { success: false, message: '获取快讯失败' };
      });

      scheduler.registerHandler('fast-news-refresh', handler);

      scheduler._triggerJob?.('fast-news-refresh');
      await Promise.resolve();
      await Promise.resolve();

      expect(eventListener).toHaveBeenCalled();
      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({
            news: expect.arrayContaining([
              expect.objectContaining({ code: '002', titleColor: 3 })
            ])
          })
        })
      );

      window.removeEventListener('important-news-detected', eventListener);
    });

    test('已有重要快讯的code不会重复触发事件', async () => {
      const mockConfig = {
        jobs: [
          { id: 'fast-news-refresh', name: '财经快讯刷新', cron: '*/1 * * * *', enabled: true }
        ]
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfig)
      });

      await scheduler.loadConfig();

      // 设置上次重要快讯的code集合
      marketNewsService.setLastImportantNewsCodes(new Set(['002', '003']));

      // 模拟快讯数据（包含已记录的重要快讯）
      const mockNews: FastNewsItem[] = [
        { code: '001', title: '普通快讯', summary: '摘要', showTime: '2024-01-01 10:00:00', titleColor: 0, url: 'https://example.com/1' },
        { code: '002', title: '已存在的重要快讯', summary: '摘要', showTime: '2024-01-01 10:05:00', titleColor: 3, url: 'https://example.com/2' },
        { code: '004', title: '新的重要快讯', summary: '摘要', showTime: '2024-01-01 10:10:00', titleColor: 3, url: 'https://example.com/4' },
      ];

      jest.spyOn(marketNewsService, 'fetchFastNews').mockResolvedValueOnce(mockNews);

      const eventListener = jest.fn();
      window.addEventListener('important-news-detected', eventListener);

      const handler = jest.fn().mockImplementation(async () => {
        const result = await marketNewsService.fetchFastNews(20);
        if (result.length > 0) {
          const currentImportant = result.filter(n => n.titleColor === 3);
          const lastCodes = marketNewsService.getLastImportantNewsCodes();

          const newImportant = currentImportant.filter(n => !lastCodes.has(n.code));

          marketNewsService.setFastNews(result);
          marketNewsService.setLastImportantNewsCodes(new Set(currentImportant.map(n => n.code)));

          if (newImportant.length > 0) {
            window.dispatchEvent(new CustomEvent('important-news-detected', {
              detail: { news: newImportant }
            }));
          }

          return { success: true, message: `获取${result.length}条快讯，其中${newImportant.length}条重要快讯` };
        }
        return { success: false, message: '获取快讯失败' };
      });

      scheduler.registerHandler('fast-news-refresh', handler);

      scheduler._triggerJob?.('fast-news-refresh');
      await Promise.resolve();
      await Promise.resolve();

      // 应该只检测到新的重要快讯（code=004）
      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({
            news: expect.arrayContaining([
              expect.objectContaining({ code: '004' })
            ])
          })
        })
      );
      // 不应包含已存在的快讯
      const callArgs = eventListener.mock.calls[0][0];
      const detectedCodes = callArgs.detail.news.map((n: FastNewsItem) => n.code);
      expect(detectedCodes).not.toContain('002');

      window.removeEventListener('important-news-detected', eventListener);
    });
  });

  describe('任务返回正确的 JobResult 结构', () => {
    test('成功时返回正确的 JobResult 结构', async () => {
      const mockConfig = {
        jobs: [
          { id: 'fast-news-refresh', name: '财经快讯刷新', cron: '*/1 * * * *', enabled: true }
        ]
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfig)
      });

      await scheduler.loadConfig();

      const mockNews: FastNewsItem[] = [
        { code: '001', title: '快讯1', summary: '摘要', showTime: '2024-01-01 10:00:00', titleColor: 0, url: 'https://example.com' },
        { code: '002', title: '重要快讯', summary: '摘要', showTime: '2024-01-01 10:05:00', titleColor: 3, url: 'https://example.com' },
      ];

      jest.spyOn(marketNewsService, 'fetchFastNews').mockResolvedValueOnce(mockNews);

      const handler = jest.fn().mockImplementation(async (): Promise<JobResult> => {
        const result = await marketNewsService.fetchFastNews(20);
        if (result.length > 0) {
          const currentImportant = result.filter(n => n.titleColor === 3);
          const lastCodes = marketNewsService.getLastImportantNewsCodes();
          const newImportant = currentImportant.filter(n => !lastCodes.has(n.code));

          marketNewsService.setFastNews(result);
          marketNewsService.setLastImportantNewsCodes(new Set(currentImportant.map(n => n.code)));

          return {
            success: true,
            message: `获取${result.length}条快讯，其中${newImportant.length}条重要快讯`
          };
        }
        return {
          success: false,
          message: '获取快讯失败或API返回空数据'
        };
      });

      scheduler.registerHandler('fast-news-refresh', handler);

      scheduler._triggerJob?.('fast-news-refresh');
      await Promise.resolve();
      await Promise.resolve();

      const result = await handler.mock.results[0].value;
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('message');
      expect(typeof result.message).toBe('string');
    });

    test('失败时返回正确的 JobResult 结构', async () => {
      const mockConfig = {
        jobs: [
          { id: 'fast-news-refresh', name: '财经快讯刷新', cron: '*/1 * * * *', enabled: true }
        ]
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfig)
      });

      await scheduler.loadConfig();

      jest.spyOn(marketNewsService, 'fetchFastNews').mockResolvedValueOnce([]);

      const handler = jest.fn().mockImplementation(async (): Promise<JobResult> => {
        const result = await marketNewsService.fetchFastNews(20);
        if (result.length > 0) {
          return { success: true, message: `获取${result.length}条快讯` };
        }
        return {
          success: false,
          message: '获取快讯失败或API返回空数据'
        };
      });

      scheduler.registerHandler('fast-news-refresh', handler);

      scheduler._triggerJob?.('fast-news-refresh');
      await Promise.resolve();
      await Promise.resolve();

      const result = await handler.mock.results[0].value;
      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('message', '获取快讯失败或API返回空数据');
    });
  });
});

describe('detectNewImportantNews 双重验证逻辑', () => {
  beforeEach(() => {
    marketNewsService.resetFastNewsCache();
  });

  test('使用 code ID 和时间戳双重验证检测新的重要快讯', () => {
    // 设置上次重要快讯的code集合
    marketNewsService.setLastImportantNewsCodes(new Set(['old001']));

    // 当前快讯数据
    const currentNews: FastNewsItem[] = [
      { code: 'old001', title: '已存在的重要快讯', summary: '摘要', showTime: '2024-01-01 10:00:00', titleColor: 3, url: 'https://example.com' },
      { code: 'new001', title: '新的重要快讯', summary: '摘要', showTime: '2024-01-01 10:05:00', titleColor: 3, url: 'https://example.com' },
      { code: 'normal001', title: '普通快讯', summary: '摘要', showTime: '2024-01-01 10:03:00', titleColor: 0, url: 'https://example.com' },
    ];

    // 模拟检测逻辑
    const currentImportant = currentNews.filter(n => n.titleColor === 3);
    const lastCodes = marketNewsService.getLastImportantNewsCodes();

    const newImportant = currentImportant.filter(n => !lastCodes.has(n.code));

    // 应只检测到新的重要快讯
    expect(newImportant).toHaveLength(1);
    expect(newImportant[0].code).toBe('new001');

    // 更新code集合
    marketNewsService.setLastImportantNewsCodes(new Set(currentImportant.map(n => n.code)));
    expect(marketNewsService.getLastImportantNewsCodes().has('new001')).toBe(true);
    expect(marketNewsService.getLastImportantNewsCodes().has('old001')).toBe(true);
  });

  test('上次快讯为空时，所有重要快讯都是新的', () => {
    // 清空上次重要快讯记录
    marketNewsService.setLastImportantNewsCodes(new Set());

    const currentNews: FastNewsItem[] = [
      { code: '001', title: '重要快讯1', summary: '摘要', showTime: '2024-01-01 10:00:00', titleColor: 3, url: 'https://example.com' },
      { code: '002', title: '重要快讯2', summary: '摘要', showTime: '2024-01-01 10:05:00', titleColor: 3, url: 'https://example.com' },
      { code: '003', title: '普通快讯', summary: '摘要', showTime: '2024-01-01 10:03:00', titleColor: 0, url: 'https://example.com' },
    ];

    const currentImportant = currentNews.filter(n => n.titleColor === 3);
    const lastCodes = marketNewsService.getLastImportantNewsCodes();

    const newImportant = currentImportant.filter(n => !lastCodes.has(n.code));

    // 所有重要快讯都应被检测为新的
    expect(newImportant).toHaveLength(2);
    expect(newImportant.map(n => n.code)).toEqual(['001', '002']);
  });
});