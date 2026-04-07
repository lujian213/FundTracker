// tests/services/marketNewsService.test.ts
import * as marketNewsService from '../../services/marketNewsService';

describe('marketNewsService', () => {
  beforeEach(() => {
    marketNewsService.resetCache();
  });

  describe('getNews / setNews', () => {
    it('should return empty array initially', () => {
      expect(marketNewsService.getNews()).toEqual([]);
    });

    it('should set and get news items', () => {
      const items = [
        { id: 'news-001', title: 'Test News', time: '10:00', url: 'https://example.com' }
      ];
      marketNewsService.setNews(items);
      expect(marketNewsService.getNews()).toEqual(items);
    });

    it('should overwrite existing news', () => {
      marketNewsService.setNews([{ id: '1', title: 'Old', time: '09:00', url: 'url1' }]);
      marketNewsService.setNews([{ id: '2', title: 'New', time: '10:00', url: 'url2' }]);
      expect(marketNewsService.getNews()).toHaveLength(1);
      expect(marketNewsService.getNews()[0].title).toBe('New');
    });
  });

  describe('resetCache', () => {
    it('should clear news cache', () => {
      marketNewsService.setNews([{ id: '1', title: 'Test', time: '10:00', url: 'url' }]);
      marketNewsService.resetCache();
      expect(marketNewsService.getNews()).toEqual([]);
    });
  });
});