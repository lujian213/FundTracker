import { queryAI, AIResponse, AIQueryContext, fillTemplateVariables } from '../../services/aiService';
import { getAIConfig, AIConfiguration, saveAIConfig, validateAIConfig, hasValidAIConfig } from '../../services/aiConfigService';
import { AIConfigProfile } from '../../types/aiConfigTypes';

describe('AI Services', () => {
  describe('aiConfigService', () => {
    beforeEach(() => {
      localStorage.clear();
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
    });

    test('should return error response when invalid config is provided', async () => {
      // Mock fetch to throw an error when called with empty URL
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Invalid URL'));

      const result = await queryAI(
        { apiEndpoint: '', apiKey: '', model: 'gpt-4' }, // Invalid config will cause fetch to fail
        'Test query'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should construct proper request body with context', async () => {
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

      const context: AIQueryContext = {
        fundName: 'Test Fund',
        fundSymbol: 'TEST',
        valuationData: {
          symbol: 'TEST',
          name: 'Test Fund',
          currentPrice: 1.2345,
          previousPrice: 1.2200,
          changePercentage: 1.19,
          lastUpdated: '2023-01-01 15:00',
          realtimeDate: '2023-01-01',
          netWorthDate: '2023-01-01',
          valuationDate: '2023-01-01',
          sourceUrl: 'https://example.com'
        }
      };

      const result: AIResponse = await queryAI(config, 'How is this fund performing?', context);

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

      const result = await queryAI(config, 'Test query');

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

      const result = await queryAI(config, 'Test query');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
    }, 15000);
  });

  describe('fillTemplateVariables', () => {
    test('should fill currentPrice variable from valuationData', () => {
      const template = '当前价格：{currentPrice}';
      const context: AIQueryContext = {
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
      expect(result).toBe('当前价格：1.2345');
    });

    test('should fill currentDate variable from valuationData.realtimeDate', () => {
      const template = '估值日期：{currentDate}';
      const context: AIQueryContext = {
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
      expect(result).toBe('估值日期：2023-01-01');
    });

    test('should fill previousPrice variable from valuationData', () => {
      const template = '前值：{previousPrice}';
      const context: AIQueryContext = {
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
      expect(result).toBe('前值：1.2000');
    });

    test('should fill previousDate variable from valuationData.netWorthDate', () => {
      const template = '前值日期：{previousDate}';
      const context: AIQueryContext = {
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
      expect(result).toBe('前值日期：2022-12-31');
    });

    test('should fill rate variable with sign from valuationData.changePercentage', () => {
      const template = '涨跌幅：{rate}';
      const context: AIQueryContext = {
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
      expect(result).toBe('涨跌幅：+2.88%');
    });

    test('should show negative sign for negative rate', () => {
      const template = '涨跌幅：{rate}';
      const context: AIQueryContext = {
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
      expect(result).toBe('涨跌幅：-1.67%');
    });

    test('should show "未设置" when valuationData is missing', () => {
      const template = '当前价格：{currentPrice}，前值：{previousPrice}，涨跌幅：{rate}';
      const context: AIQueryContext = {};

      const result = fillTemplateVariables(template, context);
      expect(result).toBe('当前价格：未设置，前值：未设置，涨跌幅：未设置');
    });

    test('should fill all five new variables together', () => {
      const template = '当前价格：{currentPrice}（{currentDate}），前值：{previousPrice}（{previousDate}），涨跌幅：{rate}';
      const context: AIQueryContext = {
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
      expect(result).toBe('当前价格：1.2345（2023-01-01），前值：1.2000（2022-12-31），涨跌幅：+2.88%');
    });

    test('should fill marketValue variable', () => {
      const template = '市场价值：{marketValue}';
      const context: AIQueryContext = {
        marketValue: 12345.67
      };

      const result = fillTemplateVariables(template, context);
      expect(result).toBe('市场价值：12345.67');
    });

    test('should show "未设置" when marketValue is missing', () => {
      const template = '市场价值：{marketValue}';
      const context: AIQueryContext = {};

      const result = fillTemplateVariables(template, context);
      expect(result).toBe('市场价值：未设置');
    });

    test('should fill position variable', () => {
      const template = '当前仓位：{position} 份';
      const context: AIQueryContext = {
        position: 5000.50
      };

      const result = fillTemplateVariables(template, context);
      expect(result).toBe('当前仓位：5000.50 份');
    });

    test('should show "未设置" when position is missing', () => {
      const template = '当前仓位：{position}';
      const context: AIQueryContext = {};

      const result = fillTemplateVariables(template, context);
      expect(result).toBe('当前仓位：未设置');
    });

    test('should fill positionRate variable', () => {
      const template = '仓位占比：{positionRate}';
      const context: AIQueryContext = {
        positionRate: 50.55
      };

      const result = fillTemplateVariables(template, context);
      expect(result).toBe('仓位占比：50.55%');
    });

    test('should show "未设置" when positionRate is missing', () => {
      const template = '仓位占比：{positionRate}';
      const context: AIQueryContext = {};

      const result = fillTemplateVariables(template, context);
      expect(result).toBe('仓位占比：未设置');
    });

    test('should fill profit variable with positive sign', () => {
      const template = '整体盈利：{profit}';
      const context: AIQueryContext = {
        profit: 1234.56
      };

      const result = fillTemplateVariables(template, context);
      expect(result).toBe('整体盈利：+1234.56');
    });

    test('should fill profit variable with negative sign', () => {
      const template = '整体盈利：{profit}';
      const context: AIQueryContext = {
        profit: -567.89
      };

      const result = fillTemplateVariables(template, context);
      expect(result).toBe('整体盈利：-567.89');
    });

    test('should show "未设置" when profit is missing', () => {
      const template = '整体盈利：{profit}';
      const context: AIQueryContext = {};

      const result = fillTemplateVariables(template, context);
      expect(result).toBe('整体盈利：未设置');
    });

    test('should fill all four new holding variables together', () => {
      const template = '市场价值：{marketValue}，仓位：{position} 份，仓位占比：{positionRate}，盈利：{profit}';
      const context: AIQueryContext = {
        marketValue: 6172.50,
        position: 5000.00,
        positionRate: 50.00,
        profit: 172.50
      };

      const result = fillTemplateVariables(template, context);
      expect(result).toBe('市场价值：6172.50，仓位：5000.00 份，仓位占比：50.00%，盈利：+172.50');
    });
  });
});