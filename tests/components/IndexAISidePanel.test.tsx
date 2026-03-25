import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import IndexAISidePanel from '../../components/IndexAISidePanel';
import { aiAssistantStateManager } from '../../services/aiAssistantStateManager';

// Mock DOMPurify
jest.mock('dompurify', () => ({
  __esModule: true,
  default: {
    sanitize: (html: string) => html
  }
}));

// Mock services
jest.mock('../../services/aiConfigService', () => ({
  getAIConfig: jest.fn(() => ({
    apiEndpoint: 'https://api.test.com/v1/chat/completions',
    apiKey: 'test-key',
    model: 'gpt-4'
  })),
  hasValidAIConfig: jest.fn(() => true),
  hasUsableAIConfig: jest.fn(() => true),
}));

jest.mock('../../services/aiService', () => ({
  queryAI: jest.fn().mockResolvedValue({
    success: true,
    content: 'Test response from AI'
  }),
  queryAIWithMarketTemplate: jest.fn().mockResolvedValue({
    success: true,
    content: 'Index analysis from AI'
  }),
  AIResponse: {},
  AIQueryContext: {},
}));

jest.mock('../../services/commonQuestionsService', () => ({
  getCommonQuestions: jest.fn().mockResolvedValue([
    { id: 'trend-prediction', name: '走势预测', template: '走势预测模板' },
  ]),
  applyTemplateVariables: jest.fn((template) => template),
}));

describe('IndexAISidePanel', () => {
  const mockOnClose = jest.fn();
  const defaultProps = {
    isVisible: true,
    onClose: mockOnClose,
    indexSymbol: '000001',
    indexName: '上证指数',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    aiAssistantStateManager.clearState('index_000001');
  });

  afterEach(() => {
    aiAssistantStateManager.clearState('index_000001');
  });

  // === 基础 UI 测试 ===
  describe('UI Rendering', () => {
    it('should render panel when visible', () => {
      render(<IndexAISidePanel {...defaultProps} />);
      expect(screen.getByText('AI 投资助手')).toBeInTheDocument();
    });

    it('should not render when not visible', () => {
      render(<IndexAISidePanel {...defaultProps} isVisible={false} />);
      expect(screen.queryByText('AI 投资助手')).not.toBeInTheDocument();
    });
  });

  // === realtimeVolume 计算逻辑测试 ===
  describe('realtimeVolume calculation', () => {
    it('should extract realtimeVolume from last volumeData point', async () => {
      const { queryAIWithMarketTemplate } = require('../../services/aiService');
      queryAIWithMarketTemplate.mockClear();

      const volumeData = [
        { x: 0, volume: 1000000, isUp: true },
        { x: 1, volume: 1200000, isUp: true },
        { x: 2, volume: 1500000, isUp: false }, // 最后一个点
      ];

      render(
        <IndexAISidePanel
          {...defaultProps}
          volumeData={volumeData}
        />
      );

      // 等待初始化完成
      await waitFor(() => {
        expect(queryAIWithMarketTemplate).toHaveBeenCalled();
      });

      // 获取传入的 context 参数
      const callArgs = queryAIWithMarketTemplate.mock.calls[0];
      const context = callArgs[2]; // 第三个参数是 context

      // 验证 realtimeVolume 是最后一个数据点的成交量
      expect(context.realtimeVolume).toBe(1500000);
    });

    it('should handle empty volumeData gracefully', async () => {
      const { queryAIWithMarketTemplate } = require('../../services/aiService');
      queryAIWithMarketTemplate.mockClear();

      render(
        <IndexAISidePanel
          {...defaultProps}
          volumeData={[]}
        />
      );

      await waitFor(() => {
        expect(queryAIWithMarketTemplate).toHaveBeenCalled();
      });

      const callArgs = queryAIWithMarketTemplate.mock.calls[0];
      const context = callArgs[2];

      // 空 volumeData 时 realtimeVolume 应为 undefined
      expect(context.realtimeVolume).toBeUndefined();
    });

    it('should handle undefined volumeData gracefully', async () => {
      const { queryAIWithMarketTemplate } = require('../../services/aiService');
      queryAIWithMarketTemplate.mockClear();

      render(
        <IndexAISidePanel
          {...defaultProps}
          volumeData={undefined}
        />
      );

      await waitFor(() => {
        expect(queryAIWithMarketTemplate).toHaveBeenCalled();
      });

      const callArgs = queryAIWithMarketTemplate.mock.calls[0];
      const context = callArgs[2];

      // undefined volumeData 时 realtimeVolume 应为 undefined
      expect(context.realtimeVolume).toBeUndefined();
    });

    it('should handle volumeData with zero volume', async () => {
      const { queryAIWithMarketTemplate } = require('../../services/aiService');
      queryAIWithMarketTemplate.mockClear();

      const volumeData = [
        { x: 0, volume: 1000000, isUp: true },
        { x: 1, volume: 0, isUp: false }, // 最后一个点 volume 为 0
      ];

      render(
        <IndexAISidePanel
          {...defaultProps}
          volumeData={volumeData}
        />
      );

      await waitFor(() => {
        expect(queryAIWithMarketTemplate).toHaveBeenCalled();
      });

      const callArgs = queryAIWithMarketTemplate.mock.calls[0];
      const context = callArgs[2];

      // volume 为 0 时应该正常传递
      expect(context.realtimeVolume).toBe(0);
    });
  });

  // === 其他上下文数据测试 ===
  describe('context data construction', () => {
    it('should include all required fields in context', async () => {
      const { queryAIWithMarketTemplate } = require('../../services/aiService');
      queryAIWithMarketTemplate.mockClear();

      const history = [
        { date: Date.now() - 86400000 * 2, value: 3000, equityReturn: 1.0 },
        { date: Date.now() - 86400000, value: 3050, equityReturn: 1.5 },
      ];

      const maValues = {
        5: [3000, 3010, 3020],
        10: [2990, 3000, 3010],
        20: [2980, 2990, 3000],
      };

      const volumeData = [
        { x: 0, volume: 1000000, isUp: true },
      ];

      const intradayPoints = [
        { timestamp: Date.now(), value: 3060, equityReturn: 0.5 },
      ];

      render(
        <IndexAISidePanel
          {...defaultProps}
          history={history}
          maValues={maValues}
          volumeData={volumeData}
          intradayPoints={intradayPoints}
        />
      );

      await waitFor(() => {
        expect(queryAIWithMarketTemplate).toHaveBeenCalled();
      });

      const callArgs = queryAIWithMarketTemplate.mock.calls[0];
      const context = callArgs[2];

      // 验证所有必需字段
      expect(context.marketType).toBe('index');
      expect(context.indexName).toBe('上证指数');
      expect(context.indexSymbol).toBe('000001');
      expect(context.datetime).toBeDefined();
      expect(context.closingPrices).toBeDefined();
      expect(context.ma5).toBeDefined();
      expect(context.ma10).toBeDefined();
      expect(context.ma20).toBeDefined();
      expect(context.volumes).toBeDefined();
      expect(context.realtimePrices).toBeDefined();
      expect(context.realtimeVolume).toBe(1000000);
    });
  });
});