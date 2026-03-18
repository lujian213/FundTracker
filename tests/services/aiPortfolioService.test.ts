// tests/services/aiPortfolioService.test.ts
import {
  loadPortfolioAnalysisTemplate,
  formatPortfolioData,
  analyzePortfolio
} from '../../services/aiPortfolioService';
import { queryAI } from '../../services/aiService';
import { PortfolioItem } from '../../services/aiPortfolioService';

// Mock aiService
jest.mock('../../services/aiService', () => ({
  queryAI: jest.fn(),
}));

// Mock fetch for template loading
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('aiPortfolioService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadPortfolioAnalysisTemplate', () => {
    test('loads enabled template from config file', async () => {
      const mockConfig = {
        templates: [
          {
            id: 'portfolio-analysis',
            name: '投资组合综合分析',
            description: '描述',
            enabled: true,
            template: '分析模板 {portfolio}'
          },
          {
            id: 'portfolio-risk',
            name: '风险评估',
            description: '描述',
            enabled: false,
            template: '风险模板 {portfolio}'
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfig
      });

      const result = await loadPortfolioAnalysisTemplate();

      expect(result).not.toBeNull();
      expect(result?.id).toBe('portfolio-analysis');
      expect(result?.template).toContain('{portfolio}');
    });

    test('returns null when no template is enabled', async () => {
      const mockConfig = {
        templates: [
          {
            id: 'disabled-template',
            name: '禁用的模板',
            description: '描述',
            enabled: false,
            template: '模板内容'
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfig
      });

      const result = await loadPortfolioAnalysisTemplate();
      expect(result).toBeNull();
    });

    test('returns null when fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      });

      const result = await loadPortfolioAnalysisTemplate();
      expect(result).toBeNull();
    });
  });

  describe('formatPortfolioData', () => {
    test('formats portfolio items into readable text', () => {
      const items: PortfolioItem[] = [
        {
          symbol: '005827',
          name: '易方达蓝筹精选混合',
          position: 1000,
          marketValue: 12345.67,
          ratio: 0.55
        },
        {
          symbol: '161725',
          name: '招商中证白酒指数',
          position: 500,
          marketValue: 8765.43,
          ratio: 0.45
        }
      ];

      const result = formatPortfolioData(items);

      expect(result).toContain('1. 易方达蓝筹精选混合 (005827)');
      expect(result).toContain('持仓份额: 1000.00份');
      expect(result).toContain('市场价值: 12345.67元');
      expect(result).toContain('占比: 55.00%');
      expect(result).toContain('2. 招商中证白酒指数 (161725)');
    });

    test('returns empty string for empty portfolio', () => {
      const result = formatPortfolioData([]);
      expect(result).toBe('暂无持仓数据');
    });
  });

  describe('analyzePortfolio', () => {
    const mockConfig = {
      apiEndpoint: 'https://api.example.com/v1/chat/completions',
      apiKey: 'test-key',
      model: 'gpt-4',
      active: true
    };

    test('calls queryAI with formatted prompt', async () => {
      const mockTemplate = {
        id: 'portfolio-analysis',
        name: '测试模板',
        description: '描述',
        enabled: true,
        template: '分析以下投资组合：\n{portfolio}'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ templates: [mockTemplate] })
      });

      (queryAI as jest.Mock).mockResolvedValueOnce({
        content: 'AI分析结果',
        success: true
      });

      const items: PortfolioItem[] = [
        {
          symbol: '005827',
          name: '测试基金',
          position: 100,
          marketValue: 1000,
          ratio: 1
        }
      ];

      const result = await analyzePortfolio(mockConfig, items);

      expect(queryAI).toHaveBeenCalled();
      const callArgs = (queryAI as jest.Mock).mock.calls[0];
      expect(callArgs[1]).toContain('分析以下投资组合');
      expect(callArgs[1]).toContain('测试基金');
      expect(result.content).toBe('AI分析结果');
      expect(result.success).toBe(true);
    });

    test('returns error when no template found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ templates: [] })
      });

      const items: PortfolioItem[] = [
        { symbol: '001', name: '基金', position: 100, marketValue: 1000, ratio: 1 }
      ];

      const result = await analyzePortfolio(mockConfig, items);

      expect(result.success).toBe(false);
      expect(result.error).toContain('模板');
    });
  });
});