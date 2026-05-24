// tests/services/aiPortfolioService.test.ts
import {
  loadInvestmentDraftTemplate,
  formatPortfolioData,
  analyzePortfolio
} from '../../services/aiPortfolioService';
import { queryAIWithTemplate } from '../../services/aiService';
import { PortfolioItem } from '../../services/aiPortfolioService';
import * as promptTemplateService from '../../services/promptTemplateService';

// Mock aiService
jest.mock('../../services/aiService', () => ({
  queryAIWithTemplate: jest.fn(),
}));

describe('aiPortfolioService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the template cache before each test
    promptTemplateService.resetCache();
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

    test('calls queryAI with formatted prompt when template is available', async () => {
      // Pre-load a mock template into the cache
      const mockTemplate = {
        id: 'portfolio-analysis',
        name: '测试模板',
        template: '分析以下投资组合：\n{portfolio}',
        enabled: true
      };

      // Manually set the template in cache using getById's internal cache
      // We need to call loadAllTemplates with mocked fetch, or use resetCache + direct cache set
      promptTemplateService.resetCache();

      // Mock the template by loading it through the service
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ templates: [mockTemplate] })
      });

      await promptTemplateService.loadAllTemplates();
      global.fetch = originalFetch;

      (queryAIWithTemplate as jest.Mock).mockResolvedValueOnce({
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

      expect(queryAIWithTemplate).toHaveBeenCalled();
      const callArgs = (queryAIWithTemplate as jest.Mock).mock.calls[0];
      expect(callArgs[2].portfolio).toContain('测试基金');
      expect(result.content).toBe('AI分析结果');
      expect(result.success).toBe(true);
    });

    test('returns error when no template found', async () => {
      // Reset cache to ensure no templates
      promptTemplateService.resetCache();

      const items: PortfolioItem[] = [
        { symbol: '001', name: '基金', position: 100, marketValue: 1000, ratio: 1 }
      ];

      const result = await analyzePortfolio(mockConfig, items);

      expect(result.success).toBe(false);
      expect(result.error).toContain('未找到');
    });

    test('passes webSearchQuery when template has webSearchHint', async () => {
      // Pre-load a mock template with webSearchHint
      const mockTemplate = {
        id: 'portfolio-analysis',
        name: '测试模板',
        template: '今天是 {currentDate}。分析以下投资组合：\n{portfolio}',
        enabled: true,
        enableWebSearch: true,
        webSearchHint: '搜索{currentDate}市场环境'
      };

      promptTemplateService.resetCache();
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ templates: [mockTemplate] })
      });

      await promptTemplateService.loadAllTemplates();
      global.fetch = originalFetch;

      (queryAIWithTemplate as jest.Mock).mockResolvedValueOnce({
        content: 'AI分析结果',
        success: true
      });

      const items: PortfolioItem[] = [
        { symbol: '005827', name: '测试基金', position: 100, marketValue: 1000, ratio: 1 }
      ];

      await analyzePortfolio(mockConfig, items);

      expect(queryAIWithTemplate).toHaveBeenCalled();
      const callArgs = (queryAIWithTemplate as jest.Mock).mock.calls[0];
      // queryAIWithTemplate 的第三个参数是 variables，包含 currentDate
      expect(callArgs[2].currentDate).toBeDefined();
      // queryAIWithTemplate 会自动处理 webSearchHint
      expect(mockTemplate.webSearchHint).toContain('市场环境');
    });
  });
});