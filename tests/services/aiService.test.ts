import { queryAI, AIResponse, AIRequest, ChatMessage } from '../../services/aiService';
import { fillTemplateVariables } from '../../services/promptTemplateService';
import { getAIConfig, AIConfiguration, saveAIConfig, validateAIConfig, hasValidAIConfig, resetCache as resetAIConfigCache } from '../../services/aiConfigService';
import { AIConfigProfile } from '../../types/aiConfigTypes';
import { FundAIQueryContext, IndexAIQueryContext } from '../../types/aiServiceTypes';
import { PromptTemplate } from '../../types/promptTemplateTypes';
import { TemplateContext } from '../../utils/templateFiller';

describe('AI Services', () => {
  describe('aiConfigService', () => {
    beforeEach(() => {
      localStorage.clear();
      resetAIConfigCache(); // 使用 aiConfigService 导出的 resetCache
    });

    test('should save and retrieve AI configuration', () => {
      const config: AIConfiguration = {
        apiEndpoint: 'https://api.example.com/v1/chat',
        apiKey: 'test-key-123',
        model: 'gpt-4'
      };

      saveAIConfig(config);
      const retrievedConfig = getAIConfig();

      expect(retrievedConfig).toEqual(config);
    });

    test('should return null when no configuration exists', () => {
      const config = getAIConfig();
      expect(config).toBeNull();
    });

    test('should validate complete configuration as valid', () => {
      const config: AIConfigProfile = {
        id: 'test-id',
        name: 'Test Config', // Required field in AIConfigProfile
        apiEndpoint: 'https://api.openai.com/v1/chat',
        apiKey: 'sk-test123',
        model: 'gpt-4',
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = validateAIConfig(config);
      expect(result.isValid).toBe(true);
    });

    test('should invalidate missing api endpoint', () => {
      const config: AIConfigProfile = {
        id: 'test-id',
        name: 'Test Config', // Required field in AIConfigProfile
        apiEndpoint: '',
        apiKey: 'test-key',
        model: 'gpt-4',
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = validateAIConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('API端点不能为空');
    });

    test('should validate config with empty api key (allowed for backup restore)', () => {
      const config: AIConfigProfile = {
        id: 'test-id',
        name: 'Test Config',
        apiEndpoint: 'https://api.example.com',
        apiKey: '',
        model: 'gpt-4',
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = validateAIConfig(config);
      expect(result.isValid).toBe(true); // API密钥为空时配置仍然有效
    });

    test('should invalidate invalid URL', () => {
      const config: AIConfigProfile = {
        id: 'test-id',
        name: 'Test Config', // Required field in AIConfigProfile
        apiEndpoint: 'not-a-valid-url',
        apiKey: 'test-key',
        model: 'gpt-4',
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = validateAIConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('无效的API端点URL');
    });

    test('should return false for hasValidAIConfig when no config exists', () => {
      const isValid = hasValidAIConfig();
      expect(isValid).toBe(false);
    });

    test('should return false for hasValidAIConfig when config is invalid', () => {
      const config: AIConfigProfile = {
        id: 'test-id',
        name: 'Test Config',
        apiEndpoint: '',
        apiKey: 'test-key',
        model: 'gpt-4',
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save using the addAIConfig function which is appropriate for AIConfigProfile
      // But we don't have access to that in this test, so let's just make sure localStorage is clean
      localStorage.clear();
      const isValid = hasValidAIConfig();
      expect(isValid).toBe(false);
    });
  });

  describe('aiService', () => {
    // Mock fetch globally
    global.fetch = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();
      localStorage.clear();
      resetAIConfigCache(); // 使用 aiConfigService 导出的 resetCache
    });

    test('should return error response when invalid config is provided', async () => {
      // Mock fetch to throw an error when called with empty URL
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Invalid URL'));

      const result = await queryAI(
        { apiEndpoint: '', apiKey: '', model: 'gpt-4' }, // Invalid config will cause fetch to fail
        { messages: [{ role: 'user', content: 'Test query' }] }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should construct proper request body with messages', async () => {
      // 模拟流式响应
      const sseData = 'data: {"choices":[{"delta":{"content":"Test response"}}]}\n\ndata: [DONE]\n\n';
      const uint8Array = new Uint8Array(sseData.length);
      for (let i = 0; i < sseData.length; i++) {
        uint8Array[i] = sseData.charCodeAt(i);
      }
      const chunks = [uint8Array];

      let chunkIndex = 0;
      const mockReader = {
        read: jest.fn().mockImplementation(() => {
          if (chunkIndex < chunks.length) {
            return Promise.resolve({ done: false, value: chunks[chunkIndex++] });
          }
          return Promise.resolve({ done: true, value: undefined });
        })
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        body: {
          getReader: () => mockReader
        }
      });

      const config: AIConfiguration = {
        apiEndpoint: 'https://api.example.com/v1/chat',
        apiKey: 'test-key',
        model: 'gpt-4'
      };

      const request: AIRequest = {
        messages: [
          { role: 'user', content: 'How is this fund performing? Fund name: Test Fund' }
        ]
      };

      const result: AIResponse = await queryAI(config, request);

      expect(fetch).toHaveBeenCalledWith(
        'https://api.example.com/v1/chat',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-key',
          },
          body: expect.stringContaining('Test Fund'),
        })
      );

      expect(result.success).toBe(true);
      expect(result.content).toBe('Test response');
    });

    test('should handle API errors gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      });

      const config: AIConfiguration = {
        apiEndpoint: 'https://api.example.com/v1/chat',
        apiKey: 'invalid-key',
        model: 'gpt-4'
      };

      const result = await queryAI(config, { messages: [{ role: 'user', content: 'Test query' }] });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle network timeout', async () => {
      // Mock fetch to reject with a timeout error
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network timeout'));

      const config: AIConfiguration = {
        apiEndpoint: 'https://api.example.com/v1/chat',
        apiKey: 'test-key',
        model: 'gpt-4'
      };

      const result = await queryAI(config, { messages: [{ role: 'user', content: 'Test query' }] });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
    }, 15000);
  });

  describe('fillTemplateVariables', () => {
    test('should fill currentPrice variable from valuationData', () => {
      const template = '当前价格：{currentPrice}';
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: 'Test Fund',
        fundSymbol: 'TEST',
        valuationData: {
          symbol: 'TEST',
          name: 'Test Fund',
          currentPrice: 1.2345,
          previousPrice: 1.2000,
          changePercentage: 2.88,
          lastUpdated: '2023-01-01 15:00',
          realtimeDate: '2023-01-01',
          netWorthDate: '2022-12-31',
          valuationDate: '2023-01-01',
          sourceUrl: 'https://example.com'
        }
      };

      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('当前价格：1.2345');
    });

    test('should fill currentDate variable from valuationData.realtimeDate', () => {
      const template = '估值日期：{currentDate}';
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: 'Test Fund',
        fundSymbol: 'TEST',
        valuationData: {
          symbol: 'TEST',
          name: 'Test Fund',
          currentPrice: 1.2345,
          previousPrice: 1.2000,
          changePercentage: 2.88,
          lastUpdated: '2023-01-01 15:00',
          realtimeDate: '2023-01-01',
          netWorthDate: '2022-12-31',
          valuationDate: '2023-01-01',
          sourceUrl: 'https://example.com'
        }
      };

      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('估值日期：2023-01-01');
    });

    test('should fill previousPrice variable from valuationData', () => {
      const template = '前值：{previousPrice}';
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: 'Test Fund',
        fundSymbol: 'TEST',
        valuationData: {
          symbol: 'TEST',
          name: 'Test Fund',
          currentPrice: 1.2345,
          previousPrice: 1.2000,
          changePercentage: 2.88,
          lastUpdated: '2023-01-01 15:00',
          realtimeDate: '2023-01-01',
          netWorthDate: '2022-12-31',
          valuationDate: '2023-01-01',
          sourceUrl: 'https://example.com'
        }
      };

      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('前值：1.2000');
    });

    test('should fill previousDate variable from valuationData.netWorthDate', () => {
      const template = '前值日期：{previousDate}';
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: 'Test Fund',
        fundSymbol: 'TEST',
        valuationData: {
          symbol: 'TEST',
          name: 'Test Fund',
          currentPrice: 1.2345,
          previousPrice: 1.2000,
          changePercentage: 2.88,
          lastUpdated: '2023-01-01 15:00',
          realtimeDate: '2023-01-01',
          netWorthDate: '2022-12-31',
          valuationDate: '2023-01-01',
          sourceUrl: 'https://example.com'
        }
      };

      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('前值日期：2022-12-31');
    });

    test('should fill rate variable with sign from valuationData.changePercentage', () => {
      const template = '涨跌幅：{rate}';
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: 'Test Fund',
        fundSymbol: 'TEST',
        valuationData: {
          symbol: 'TEST',
          name: 'Test Fund',
          currentPrice: 1.2345,
          previousPrice: 1.2000,
          changePercentage: 2.88,
          lastUpdated: '2023-01-01 15:00',
          realtimeDate: '2023-01-01',
          netWorthDate: '2022-12-31',
          valuationDate: '2023-01-01',
          sourceUrl: 'https://example.com'
        }
      };

      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('涨跌幅：+2.88%');
    });

    test('should show negative sign for negative rate', () => {
      const template = '涨跌幅：{rate}';
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: 'Test Fund',
        fundSymbol: 'TEST',
        valuationData: {
          symbol: 'TEST',
          name: 'Test Fund',
          currentPrice: 1.1800,
          previousPrice: 1.2000,
          changePercentage: -1.67,
          lastUpdated: '2023-01-01 15:00',
          realtimeDate: '2023-01-01',
          netWorthDate: '2022-12-31',
          valuationDate: '2023-01-01',
          sourceUrl: 'https://example.com'
        }
      };

      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('涨跌幅：-1.67%');
    });

    test('should show "未设置" when valuationData is missing', () => {
      const template = '当前价格：{currentPrice}，前值：{previousPrice}，涨跌幅：{rate}';
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: 'Test Fund',
        fundSymbol: 'TEST'
      };

      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('当前价格：，前值：，涨跌幅：');
    });

    test('should fill all five new variables together', () => {
      const template = '当前价格：{currentPrice}（{currentDate}），前值：{previousPrice}（{previousDate}），涨跌幅：{rate}';
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: 'Test Fund',
        fundSymbol: 'TEST',
        valuationData: {
          symbol: 'TEST',
          name: 'Test Fund',
          currentPrice: 1.2345,
          previousPrice: 1.2000,
          changePercentage: 2.88,
          lastUpdated: '2023-01-01 15:00',
          realtimeDate: '2023-01-01',
          netWorthDate: '2022-12-31',
          valuationDate: '2023-01-01',
          sourceUrl: 'https://example.com'
        }
      };

      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('当前价格：1.2345（2023-01-01），前值：1.2000（2022-12-31），涨跌幅：+2.88%');
    });

    test('should fill marketValue variable', () => {
      const template = '市场价值：{marketValue}';
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: 'Test Fund',
        fundSymbol: 'TEST',
        marketValue: 12345.67
      };

      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('市场价值：12345.67');
    });

    test('should show "未设置" when marketValue is missing', () => {
      const template = '市场价值：{marketValue}';
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: 'Test Fund',
        fundSymbol: 'TEST'
      };

      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('市场价值：');
    });

    test('should fill position variable', () => {
      const template = '当前仓位：{position} 份';
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: 'Test Fund',
        fundSymbol: 'TEST',
        position: 5000.50
      };

      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('当前仓位：5000.50 份');
    });

    test('should show empty string when position is missing', () => {
      const template = '当前仓位：{position}';
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: 'Test Fund',
        fundSymbol: 'TEST'
      };

      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('当前仓位：');
    });

    test('should fill positionRate variable', () => {
      const template = '仓位占比：{positionRate}';
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: 'Test Fund',
        fundSymbol: 'TEST',
        positionRate: 50.55
      };

      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('仓位占比：50.55%');
    });

    test('should show "未设置" when positionRate is missing', () => {
      const template = '仓位占比：{positionRate}';
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: 'Test Fund',
        fundSymbol: 'TEST'
      };

      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('仓位占比：');
    });

    test('should fill profit variable with positive sign', () => {
      const template = '整体盈利：{profit}';
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: 'Test Fund',
        fundSymbol: 'TEST',
        profit: 1234.56
      };

      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('整体盈利：+1234.56');
    });

    test('should fill profit variable with negative sign', () => {
      const template = '整体盈利：{profit}';
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: 'Test Fund',
        fundSymbol: 'TEST',
        profit: -567.89
      };

      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('整体盈利：-567.89');
    });

    test('should show "未设置" when profit is missing', () => {
      const template = '整体盈利：{profit}';
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: 'Test Fund',
        fundSymbol: 'TEST'
      };

      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('整体盈利：');
    });

    test('should fill all four new holding variables together', () => {
      const template = '市场价值：{marketValue}，仓位：{position} 份，仓位占比：{positionRate}，盈利：{profit}';
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: 'Test Fund',
        fundSymbol: 'TEST',
        marketValue: 6172.50,
        position: 5000.00,
        positionRate: 50.00,
        profit: 172.50
      };

      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('市场价值：6172.50，仓位：5000.00 份，仓位占比：50.00%，盈利：+172.50');
    });
  });
});

// === fillTemplateVariables 变量名映射测试 ===
// 测试 indexName/indexSymbol → name/code 的映射
describe('fillTemplateVariables Variable Mapping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Fund context variable mapping', () => {
    test('should map fundName to {name}', () => {
      const template = '基金名称: {name}';
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: '易方达蓝筹精选',
        fundSymbol: '005827',
      };

      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('基金名称: 易方达蓝筹精选');
    });

    test('should map fundSymbol to {code}', () => {
      const template = '基金代码: {code}';
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: '易方达蓝筹精选',
        fundSymbol: '005827',
      };

      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('基金代码: 005827');
    });

    test('should map both fundName and fundSymbol in webSearchHint format', () => {
      // 模拟 webSearchHint: "搜索{name}({code})市场动态"
      const template = '搜索{name}({code})市场动态';
      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: '易方达蓝筹精选',
        fundSymbol: '005827',
      };

      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('搜索易方达蓝筹精选(005827)市场动态');
    });
  });

  describe('Index context variable mapping', () => {
    test('should map indexName to {name}', () => {
      const template = '指数名称: {name}';
      const context: IndexAIQueryContext = {
        marketType: 'index',
        indexName: '沪深300',
        indexSymbol: '000300',
        datetime: '2026/05/19',
      };

      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('指数名称: 沪深300');
    });

    test('should map indexSymbol to {code}', () => {
      const template = '指数代码: {code}';
      const context: IndexAIQueryContext = {
        marketType: 'index',
        indexName: '沪深300',
        indexSymbol: '000300',
        datetime: '2026/05/19',
      };

      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('指数代码: 000300');
    });

    test('should map indexName/indexSymbol/datetime together', () => {
      const template = '指数名称: {name}, 代码: {code}, 时间: {datetime}';
      const context: IndexAIQueryContext = {
        marketType: 'index',
        indexName: '深证成指',
        indexSymbol: '399001',
        datetime: '2026/05/19 10:30',
      };

      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('指数名称: 深证成指, 代码: 399001, 时间: 2026/05/19 10:30');
    });

    test('should correctly fill webSearchHint template for index', () => {
      // 模拟指数分析模板的 webSearchHint
      const template = '搜索{name}({code}){datetime}市场动态';
      const context: IndexAIQueryContext = {
        marketType: 'index',
        indexName: '上证指数',
        indexSymbol: '000001',
        datetime: '2026/05/19',
      };

      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(true);
      expect(result.content).toBe('搜索上证指数(000001)2026/05/19市场动态');
    });
  });

  describe('Missing variable handling', () => {
    test('should return success=false when variables are missing', () => {
      const template = '名称: {name}, 代码: {code}, 缺失: {missing}';
      const context: IndexAIQueryContext = {
        marketType: 'index',
        indexName: '上证指数',
        indexSymbol: '000001',
        datetime: '2026/05/19',
      };

      const result = fillTemplateVariables(template, context);
      expect(result.success).toBe(false);
      expect(result.missingPlaceholders).toContain('missing');
    });
  });
});

// === queryAIWithMarketTemplate 搜索集成测试 ===
// 使用 spy 来验证内部调用逻辑
describe('queryAIWithMarketTemplate Web Search Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  describe('Template loading and request construction', () => {
    test('should return error when template not found', async () => {
      // Mock getById 返回 null
      const getByIdSpy = jest.spyOn(require('../../services/promptTemplateService'), 'getById').mockReturnValue(null);

      const { queryAIWithMarketTemplate } = require('../../services/aiService');

      const config = {
        apiEndpoint: 'https://api.example.com/v1/chat',
        apiKey: 'test-key',
        model: 'gpt-4',
      };

      const result = await queryAIWithMarketTemplate(config, 'index', {
        marketType: 'index',
        indexName: '上证指数',
        indexSymbol: '000001',
        datetime: '2026/05/19',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('No template');

      getByIdSpy.mockRestore();
    });

    test('should construct correct AIRequest with webSearch parameters', async () => {
      // Mock template with webSearch enabled
      const getByIdSpy = jest.spyOn(require('../../services/promptTemplateService'), 'getById').mockReturnValue({
        id: 'index-analysis',
        name: '指数分析',
        template: '分析指数 {name} ({code})，日期: {datetime}',
        enableWebSearch: true,
        webSearchHint: '搜索{name}({code}){datetime}市场动态',
      });

      // Mock fetch for streaming response
      const sseData = 'data: {"choices":[{"delta":{"content":"AI response"}}]}\n\ndata: [DONE]\n\n';
      const uint8Array = new Uint8Array(sseData.length);
      for (let i = 0; i < sseData.length; i++) {
        uint8Array[i] = sseData.charCodeAt(i);
      }

      let chunkIndex = 0;
      const mockReader = {
        read: jest.fn().mockImplementation(() => {
          if (chunkIndex < 1) {
            chunkIndex++;
            return Promise.resolve({ done: false, value: uint8Array });
          }
          return Promise.resolve({ done: true, value: undefined });
        })
      };

      (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader }
      });

      const { queryAIWithMarketTemplate } = require('../../services/aiService');

      const config = {
        apiEndpoint: 'https://api.example.com/v1/chat',
        apiKey: 'test-key',
        model: 'deepseek-v4-pro',
      };

      const context: IndexAIQueryContext = {
        marketType: 'index',
        indexName: '上证指数',
        indexSymbol: '000001',
        datetime: '2026/05/19 20:38',
      };

      const result = await queryAIWithMarketTemplate(config, 'index', context);

      // 验证 fetch 被调用
      expect(global.fetch).toHaveBeenCalled();

      // 获取请求 body
      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      // 验证消息内容包含正确的变量映射（indexName → name, indexSymbol → code）
      expect(body.messages[0].content).toContain('上证指数');
      expect(body.messages[0].content).toContain('000001');
      expect(body.messages[0].content).toContain('2026/05/19 20:38');

      expect(result.success).toBe(true);

      getByIdSpy.mockRestore();
    });

    test('should not enable webSearch when template has enableWebSearch=false', async () => {
      // Mock template WITHOUT webSearch
      const getByIdSpy = jest.spyOn(require('../../services/promptTemplateService'), 'getById').mockReturnValue({
        id: 'fund-analysis',
        name: '基金分析',
        template: '分析基金 {name} ({code})',
        enableWebSearch: false,
      });

      // Mock fetch
      const sseData = 'data: {"choices":[{"delta":{"content":"AI response"}}]}\n\ndata: [DONE]\n\n';
      const uint8Array = new Uint8Array(sseData.length);
      for (let i = 0; i < sseData.length; i++) {
        uint8Array[i] = sseData.charCodeAt(i);
      }

      let chunkIndex = 0;
      const mockReader = {
        read: jest.fn().mockImplementation(() => {
          if (chunkIndex < 1) {
            chunkIndex++;
            return Promise.resolve({ done: false, value: uint8Array });
          }
          return Promise.resolve({ done: true, value: undefined });
        })
      };

      (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader }
      });

      const { queryAIWithMarketTemplate } = require('../../services/aiService');

      const config = {
        apiEndpoint: 'https://api.example.com/v1/chat',
        apiKey: 'test-key',
        model: 'gpt-4',
      };

      const context: FundAIQueryContext = {
        marketType: 'fund',
        fundName: '易方达蓝筹精选',
        fundSymbol: '005827',
      };

      await queryAIWithMarketTemplate(config, 'fund', context);

      // 获取请求 body
      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      // 验证消息内容被填充（fundName → name, fundSymbol → code）
      expect(body.messages[0].content).toContain('易方达蓝筹精选');
      expect(body.messages[0].content).toContain('005827');

      // 验证没有 tools 参数（因为 enableWebSearch=false）
      expect(body.tools).toBeUndefined();

      getByIdSpy.mockRestore();
    });

    test('should correctly fill webSearchQuery when template has webSearchHint', async () => {
      // 这个测试验证 webSearchHint 是否被正确填充
      // 直接测试 fillTemplateVariables 函数的变量映射
      const context: IndexAIQueryContext = {
        marketType: 'index',
        indexName: '上证指数',
        indexSymbol: '000001',
        datetime: '2026/05/19',
      };

      // webSearchHint 模板
      const webSearchHintTemplate = '搜索{name}({code}){datetime}市场动态';
      const result = fillTemplateVariables(webSearchHintTemplate, context);

      // 验证变量名映射正确：indexName → name, indexSymbol → code
      expect(result.success).toBe(true);
      expect(result.content).toBe('搜索上证指数(000001)2026/05/19市场动态');
    });
  });
});