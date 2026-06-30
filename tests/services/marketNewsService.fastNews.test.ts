import * as marketNewsService from '../../services/marketNewsService';
import { FastNewsItem } from '../../types/fastNewsTypes';

describe('marketNewsService - 快讯缓存', () => {
  beforeEach(() => {
    marketNewsService.resetFastNewsCache();
  });

  test('getFastNews 初始返回空数组', () => {
    expect(marketNewsService.getFastNews()).toEqual([]);
  });

  test('setFastNews 更新缓存并触发事件', () => {
    const mockNews: FastNewsItem[] = [
      { code: '123', title: '测试快讯', summary: '摘要', showTime: '10:30', titleColor: 3, url: 'https://example.com' }
    ];

    const eventListener = jest.fn();
    window.addEventListener('fast-news-cache-updated', eventListener);

    marketNewsService.setFastNews(mockNews);

    expect(marketNewsService.getFastNews()).toEqual(mockNews);
    expect(eventListener).toHaveBeenCalled();

    window.removeEventListener('fast-news-cache-updated', eventListener);
  });

  test('getLastImportantNewsCodes 和 setLastImportantNewsCodes 正确记录重要快讯code', () => {
    const codes = new Set(['123', '456']);

    marketNewsService.setLastImportantNewsCodes(codes);

    expect(marketNewsService.getLastImportantNewsCodes()).toEqual(codes);
    expect(marketNewsService.getLastImportantNewsCodes().has('123')).toBe(true);
    expect(marketNewsService.getLastImportantNewsCodes().has('456')).toBe(true);
  });

  test('resetFastNewsCache 正确重置缓存', () => {
    const mockNews: FastNewsItem[] = [
      { code: '123', title: '测试快讯', summary: '摘要', showTime: '10:30', titleColor: 3, url: 'https://example.com' }
    ];
    const codes = new Set(['123']);

    marketNewsService.setFastNews(mockNews);
    marketNewsService.setLastImportantNewsCodes(codes);

    marketNewsService.resetFastNewsCache();

    expect(marketNewsService.getFastNews()).toEqual([]);
    expect(marketNewsService.getLastImportantNewsCodes()).toEqual(new Set());
  });
});