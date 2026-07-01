// tests/services/newsAIAnalysisService.test.ts
import { loadNewsAnalysisTemplate, formatPortfolioWithProfile, TEMPLATE_IDS } from '../../services/newsAIAnalysisService';
import { MarketFund } from '../../types';
import { getById, resetCache } from '../../services/promptTemplateService';

// Mock promptTemplateService
jest.mock('../../services/promptTemplateService', () => ({
  getById: jest.fn(),
  resetCache: jest.fn(),
  TEMPLATE_IDS: {
    NEWS_IMPACT_ANALYSIS: 'news-impact-analysis',
  },
}));

// Mock aiService
jest.mock('../../services/aiService', () => ({
  queryAIWithTemplate: jest.fn(),
}));

import { queryAIWithTemplate } from '../../services/aiService';

describe('newsAIAnalysisService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('TEMPLATE_IDS', () => {
    test('should export NEWS_IMPACT_ANALYSIS constant', () => {
      expect(TEMPLATE_IDS.NEWS_IMPACT_ANALYSIS).toBe('news-impact-analysis');
    });
  });

  describe('loadNewsAnalysisTemplate', () => {
    test('should return null when template not loaded', async () => {
      (getById as jest.Mock).mockReturnValue(null);
      const template = await loadNewsAnalysisTemplate();
      expect(template).toBeNull();
      expect(getById).toHaveBeenCalledWith('news-impact-analysis');
    });

    test('should return template when loaded', async () => {
      const mockTemplate = {
        id: 'news-impact-analysis',
        name: '财经快讯影响分析',
        template: 'test template',
        enabled: true,
      };
      (getById as jest.Mock).mockReturnValue(mockTemplate);
      const template = await loadNewsAnalysisTemplate();
      expect(template).toEqual(mockTemplate);
    });
  });

  describe('formatPortfolioWithProfile', () => {
    test('should format funds with profile data', () => {
      const mockFunds: MarketFund[] = [
        {
          info: {
            ticker: {
              symbol: '005827',
              name: '易方达蓝筹精选混合',
              market: 'Fund' as any,
              id: '1',
              profile: {
                stock_positions: [
                  { stock_name: '宁德时代', percentage: 9.45 }
                ],
                stage_increase: [],
                fund_type: '混合型-偏股',
                sectors: [{ code: 'BK001', name: '新能源' }],
                fetched_at: '2026-07-01T10:00:00'
              }
            }
          },
          trades: [],
          intraday: [],
          history: []
        } as MarketFund
      ];

      const result = formatPortfolioWithProfile(mockFunds);
      expect(result).toContain('易方达蓝筹精选混合');
      expect(result).toContain('005827');
      expect(result).toContain('混合型-偏股');
      expect(result).toContain('新能源');
      expect(result).toContain('宁德时代');
      expect(result).toContain('9.45%');
    });

    test('should return "暂无持仓基金" for empty funds', () => {
      const result = formatPortfolioWithProfile([]);
      expect(result).toBe('暂无持仓基金');
    });

    test('should return "暂无持仓基金" for null/undefined funds', () => {
      expect(formatPortfolioWithProfile(null as any)).toBe('暂无持仓基金');
      expect(formatPortfolioWithProfile(undefined as any)).toBe('暂无持仓基金');
    });

    test('should handle funds without profile', () => {
      const mockFunds: MarketFund[] = [
        {
          info: {
            ticker: { symbol: '005827', name: '易方达蓝筹精选混合', market: 'Fund' as any, id: '1' }
          },
          trades: [],
          intraday: [],
          history: []
        } as MarketFund
      ];

      const result = formatPortfolioWithProfile(mockFunds);
      expect(result).toContain('易方达蓝筹精选混合');
      expect(result).toContain('005827');
      expect(result).toContain('暂无持仓信息');
    });

    test('should handle funds with partial profile data', () => {
      const mockFunds: MarketFund[] = [
        {
          info: {
            ticker: {
              symbol: '005827',
              name: '易方达蓝筹精选混合',
              market: 'Fund' as any,
              id: '1',
              profile: {
                stock_positions: [],
                stage_increase: [],
                fund_type: '混合型-偏股',
                fetched_at: '2026-07-01T10:00:00'
              }
            }
          },
          trades: [],
          intraday: [],
          history: []
        } as MarketFund
      ];

      const result = formatPortfolioWithProfile(mockFunds);
      expect(result).toContain('混合型-偏股');
      expect(result).not.toContain('板块');
    });

    test('should format multiple funds correctly', () => {
      const mockFunds: MarketFund[] = [
        {
          info: {
            ticker: {
              symbol: '005827',
              name: '易方达蓝筹精选混合',
              market: 'Fund' as any,
              id: '1',
              profile: {
                stock_positions: [{ stock_name: '宁德时代', percentage: 9.45 }],
                stage_increase: [],
                fund_type: '混合型-偏股',
                fetched_at: '2026-07-01T10:00:00'
              }
            }
          },
          trades: [],
          intraday: [],
          history: []
        } as MarketFund,
        {
          info: {
            ticker: {
              symbol: '007301',
              name: '招商中证白酒指数',
              market: 'Fund' as any,
              id: '2',
              profile: {
                stock_positions: [{ stock_name: '贵州茅台', percentage: 15.2 }],
                stage_increase: [],
                fund_type: '指数型',
                sectors: [{ code: 'BK002', name: '白酒' }],
                fetched_at: '2026-07-01T10:00:00'
              }
            }
          },
          trades: [],
          intraday: [],
          history: []
        } as MarketFund
      ];

      const result = formatPortfolioWithProfile(mockFunds);
      expect(result).toContain('1. 易方达蓝筹精选混合');
      expect(result).toContain('2. 招商中证白酒指数');
      expect(result).toContain('宁德时代');
      expect(result).toContain('贵州茅台');
    });
  });

  describe('analyzeNewsImpact', () => {
    test('should return error when template not found', async () => {
      (getById as jest.Mock).mockReturnValue(null);

      const { analyzeNewsImpact } = await import('../../services/newsAIAnalysisService');
      const mockConfig = { apiEndpoint: 'test', apiKey: 'test' };
      const mockNews = {
        code: '1',
        title: '测试快讯',
        summary: '测试摘要',
        showTime: '2026-07-01 10:00:00',
        titleColor: 3,
      };
      const mockFunds: MarketFund[] = [];

      const result = await analyzeNewsImpact(mockConfig as any, mockNews as any, mockFunds);

      expect(result.success).toBe(false);
      expect(result.error).toBe('未找到启用的快讯分析模板');
    });

    test('should call queryAIWithTemplate with correct parameters', async () => {
      const mockTemplate = {
        id: 'news-impact-analysis',
        name: '财经快讯影响分析',
        template: 'test template with {newsTitle}',
        enabled: true,
      };
      (getById as jest.Mock).mockReturnValue(mockTemplate);
      (queryAIWithTemplate as jest.Mock).mockResolvedValue({
        content: 'AI分析结果',
        success: true,
      });

      const { analyzeNewsImpact } = await import('../../services/newsAIAnalysisService');
      const mockConfig = { apiEndpoint: 'test', apiKey: 'test' };
      const mockNews = {
        code: '1',
        title: '测试快讯标题',
        summary: '测试摘要',
        showTime: '2026-07-01 10:00:00',
        titleColor: 3,
      };
      const mockFunds: MarketFund[] = [
        {
          info: {
            ticker: {
              symbol: '005827',
              name: '易方达蓝筹精选混合',
              market: 'Fund' as any,
              id: '1',
              profile: {
                stock_positions: [{ stock_name: '宁德时代', percentage: 9.45 }],
                stage_increase: [],
                fund_type: '混合型-偏股',
                fetched_at: '2026-07-01T10:00:00'
              }
            }
          },
          trades: [],
          intraday: [],
          history: []
        } as MarketFund
      ];

      const result = await analyzeNewsImpact(mockConfig as any, mockNews as any, mockFunds);

      expect(queryAIWithTemplate).toHaveBeenCalledWith(
        mockConfig,
        mockTemplate,
        expect.objectContaining({
          newsTitle: '测试快讯标题',
          newsSummary: '测试摘要',
          newsTime: '2026-07-01 10:00:00',
          newsLevel: '重要',
          portfolioWithProfile: expect.stringContaining('易方达蓝筹精选混合'),
        }),
        undefined
      );
      expect(result.success).toBe(true);
      expect(result.content).toBe('AI分析结果');
    });

    test('should identify important news by titleColor 3', async () => {
      const mockTemplate = {
        id: 'news-impact-analysis',
        name: '财经快讯影响分析',
        template: 'test template',
        enabled: true,
      };
      (getById as jest.Mock).mockReturnValue(mockTemplate);
      (queryAIWithTemplate as jest.Mock).mockResolvedValue({
        content: 'AI分析结果',
        success: true,
      });

      const { analyzeNewsImpact } = await import('../../services/newsAIAnalysisService');
      const mockConfig = { apiEndpoint: 'test', apiKey: 'test' };
      const mockNews = {
        code: '1',
        title: '测试快讯',
        summary: '测试摘要',
        showTime: '2026-07-01 10:00:00',
        titleColor: 3,
      };

      await analyzeNewsImpact(mockConfig as any, mockNews as any, []);

      expect(queryAIWithTemplate).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ newsLevel: '重要' }),
        undefined
      );
    });

    test('should identify normal news by titleColor not 3', async () => {
      const mockTemplate = {
        id: 'news-impact-analysis',
        name: '财经快讯影响分析',
        template: 'test template',
        enabled: true,
      };
      (getById as jest.Mock).mockReturnValue(mockTemplate);
      (queryAIWithTemplate as jest.Mock).mockResolvedValue({
        content: 'AI分析结果',
        success: true,
      });

      const { analyzeNewsImpact } = await import('../../services/newsAIAnalysisService');
      const mockConfig = { apiEndpoint: 'test', apiKey: 'test' };
      const mockNews = {
        code: '1',
        title: '测试快讯',
        summary: '测试摘要',
        showTime: '2026-07-01 10:00:00',
        titleColor: 0,
      };

      await analyzeNewsImpact(mockConfig as any, mockNews as any, []);

      expect(queryAIWithTemplate).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ newsLevel: '普通' }),
        undefined
      );
    });

    test('should pass onChunk callback to queryAIWithTemplate', async () => {
      const mockTemplate = {
        id: 'news-impact-analysis',
        name: '财经快讯影响分析',
        template: 'test template',
        enabled: true,
      };
      (getById as jest.Mock).mockReturnValue(mockTemplate);
      (queryAIWithTemplate as jest.Mock).mockResolvedValue({
        content: 'AI分析结果',
        success: true,
      });

      const { analyzeNewsImpact } = await import('../../services/newsAIAnalysisService');
      const mockConfig = { apiEndpoint: 'test', apiKey: 'test' };
      const mockNews = {
        code: '1',
        title: '测试快讯',
        summary: '测试摘要',
        showTime: '2026-07-01 10:00:00',
        titleColor: 3,
      };
      const mockCallback = jest.fn();

      await analyzeNewsImpact(mockConfig as any, mockNews as any, [], mockCallback);

      expect(queryAIWithTemplate).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        mockCallback
      );
    });

    test('should handle news without summary', async () => {
      const mockTemplate = {
        id: 'news-impact-analysis',
        name: '财经快讯影响分析',
        template: 'test template',
        enabled: true,
      };
      (getById as jest.Mock).mockReturnValue(mockTemplate);
      (queryAIWithTemplate as jest.Mock).mockResolvedValue({
        content: 'AI分析结果',
        success: true,
      });

      const { analyzeNewsImpact } = await import('../../services/newsAIAnalysisService');
      const mockConfig = { apiEndpoint: 'test', apiKey: 'test' };
      const mockNews = {
        code: '1',
        title: '测试快讯',
        summary: '',
        showTime: '2026-07-01 10:00:00',
        titleColor: 3,
      };

      await analyzeNewsImpact(mockConfig as any, mockNews as any, []);

      expect(queryAIWithTemplate).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ newsSummary: '无摘要' }),
        undefined
      );
    });
  });
});