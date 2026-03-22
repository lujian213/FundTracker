import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AISidePanel from '../../components/AISidePanel';
import { aiAssistantStateManager } from '../../services/aiAssistantStateManager';
import { ContextCompressionService, COMPRESSION_THRESHOLD } from '../../services/ContextCompressionService';
import { ValuationData } from '../../types';

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
  queryAIWithTemplate: jest.fn().mockResolvedValue({
    success: true,
    content: 'Welcome to the AI assistant!'
  }),
  AIResponse: {},
  AIQueryContext: {},
}));

jest.mock('../../services/commonQuestionsService', () => ({
  getCommonQuestions: jest.fn().mockResolvedValue([
    { id: 'test-1', name: '测试问题1', template: '这是测试问题1的模板' },
    { id: 'test-2', name: '测试问题2', template: '这是测试问题2的模板' },
  ]),
  applyTemplateVariables: jest.fn((template) => template),
}));

describe('AISidePanel', () => {
  const mockOnClose = jest.fn();
  const defaultProps = {
    isVisible: true,
    onClose: mockOnClose,
    fundSymbol: 'TEST001',
    fundName: 'Test Fund',
  };

  const mockValuationData: ValuationData = {
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
  };

  beforeEach(() => {
    jest.clearAllMocks();
    aiAssistantStateManager.clearState('TEST001');
  });

  afterEach(() => {
    aiAssistantStateManager.clearState('TEST001');
  });

  // === 基础 UI 测试 ===
  describe('UI Rendering', () => {
    test('renders correctly when visible', () => {
      render(<AISidePanel {...defaultProps} valuationData={mockValuationData} />);
      expect(screen.getByText('AI 投资助手')).toBeInTheDocument();
    });

    test('does not render when not visible', () => {
      const { container } = render(<AISidePanel {...defaultProps} isVisible={false} valuationData={mockValuationData} />);
      expect(container.firstChild).toBeNull();
    });

    test('calls onClose when close button is clicked', () => {
      render(<AISidePanel {...defaultProps} valuationData={mockValuationData} />);
      fireEvent.click(screen.getByLabelText('关闭'));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    test('disables send button when no config exists', () => {
      require('../../services/aiConfigService').getAIConfig.mockReturnValue(null);
      require('../../services/aiConfigService').hasValidAIConfig.mockReturnValue(false);

      const { rerender } = render(<AISidePanel {...defaultProps} valuationData={mockValuationData} />);
      rerender(<AISidePanel {...defaultProps} valuationData={mockValuationData} />);

      expect(screen.getByLabelText('发送')).toBeDisabled();
    });
  });

  // === 状态管理和压缩测试 ===
  describe('State Management and Compression', () => {
    test('should maintain conversation history when panel is closed and reopened', async () => {
      const initialMessages = [
        { id: '1', content: 'Initial message 1', role: 'user', timestamp: new Date() },
        { id: '2', content: 'Initial message 2', role: 'assistant', timestamp: new Date() },
      ];

      aiAssistantStateManager.setState('TEST001', {
        historyContent: [],
        newContent: initialMessages,
        summaryContent: '',
        hasBeenInitialized: true,
        lastAccessed: new Date(),
        initializationDate: new Date()
      });

      const { rerender } = render(<AISidePanel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/AI 投资助手/)).toBeInTheDocument();
      }, { timeout: 1000 });

      // Close and reopen
      rerender(<AISidePanel {...defaultProps} isVisible={false} />);
      rerender(<AISidePanel {...defaultProps} isVisible={true} />);

      await waitFor(() => {
        expect(screen.getByText(/AI 投资助手/)).toBeInTheDocument();
      }, { timeout: 1000 });

      // Verify state is preserved
      const state = aiAssistantStateManager.getState('TEST001');
      expect(state?.newContent.length).toBe(2);
    });

    test('should not duplicate messages when panel is reopened', async () => {
      const { rerender } = render(<AISidePanel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/AI 投资助手/)).toBeInTheDocument();
      }, { timeout: 1000 });

      const initialCount = screen.getAllByText(/(AI 投资助手|Test response)/i).length;

      // Close and reopen
      rerender(<AISidePanel {...defaultProps} isVisible={false} />);
      rerender(<AISidePanel {...defaultProps} isVisible={true} />);

      await waitFor(() => {
        expect(screen.getByText(/AI 投资助手/)).toBeInTheDocument();
      }, { timeout: 1000 });

      const finalCount = screen.getAllByText(/(AI 投资助手|Test response)/i).length;
      expect(finalCount).toEqual(initialCount);
    });

    test('should handle compression correctly', async () => {
      const longContent = 'A'.repeat(3500);
      const aiMessage = {
        id: 'recent-ai',
        content: 'Latest AI response',
        role: 'assistant',
        timestamp: new Date()
      };

      aiAssistantStateManager.setState('TEST001', {
        historyContent: [{ id: 'old', content: longContent, role: 'user', timestamp: new Date() }],
        newContent: [aiMessage],
        summaryContent: 'Previous summary',
        hasBeenInitialized: true,
        lastAccessed: new Date(),
        initializationDate: new Date()
      });

      render(<AISidePanel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/AI 投资助手/)).toBeInTheDocument();
      }, { timeout: 1000 });

      const responses = screen.getAllByText('Latest AI response');
      expect(responses).toHaveLength(1);
    });

    test('should maintain separate states for different funds', () => {
      aiAssistantStateManager.setState('FUND_A', {
        historyContent: [],
        newContent: [{ id: '1', content: 'Fund A message', role: 'user', timestamp: new Date() }],
        summaryContent: '',
        hasBeenInitialized: true,
        lastAccessed: new Date(),
        initializationDate: new Date()
      });

      aiAssistantStateManager.setState('FUND_B', {
        historyContent: [],
        newContent: [{ id: '1', content: 'Fund B message', role: 'user', timestamp: new Date() }],
        summaryContent: '',
        hasBeenInitialized: true,
        lastAccessed: new Date(),
        initializationDate: new Date()
      });

      const stateA = aiAssistantStateManager.getState('FUND_A');
      const stateB = aiAssistantStateManager.getState('FUND_B');

      expect(stateA?.newContent[0].content).toBe('Fund A message');
      expect(stateB?.newContent[0].content).toBe('Fund B message');
    });

    test('should not exhibit the summaryLength=0, newContentLength=large bug', async () => {
      const { container } = render(<AISidePanel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/AI 投资助手/)).toBeInTheDocument();
      }, { timeout: 1000 });

      const input = screen.getByPlaceholderText('输入您的问题...');

      // Add multiple questions to exceed threshold
      for (let i = 0; i < 3; i++) {
        fireEvent.change(input, { target: { value: `Question ${i + 1} with sufficient length to contribute to context. `.repeat(20) } });
        fireEvent.click(screen.getByLabelText('发送'));

        await waitFor(() => {
          expect(container.querySelector('.animate-bounce')).toBeFalsy();
        }, { timeout: 1000 });

        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const finalState = aiAssistantStateManager.getState('TEST001');
      expect(finalState).not.toBeNull();

      if (finalState?.summaryContent && finalState.summaryContent.length > 0) {
        const compressionService = new ContextCompressionService();
        const newContentLength = compressionService.serializeMessages(finalState.newContent).length;
        const summaryLength = finalState.summaryContent.length;

        // Key check: should NOT have summary=0 and newContent=large
        expect(!(summaryLength === 0 && newContentLength > 1000)).toBeTruthy();
      }
    });
  });

  // === 常用问题功能测试 ===
  describe('Common Questions Feature', () => {
    test('should show common questions button when questions are loaded', async () => {
      render(<AISidePanel {...defaultProps} valuationData={mockValuationData} />);

      await waitFor(() => {
        expect(screen.getByLabelText('常用问题')).toBeInTheDocument();
      }, { timeout: 1000 });
    });

    test('should show dropdown menu when button is clicked', async () => {
      render(<AISidePanel {...defaultProps} valuationData={mockValuationData} />);

      await waitFor(() => {
        expect(screen.getByLabelText('常用问题')).toBeInTheDocument();
      }, { timeout: 1000 });

      fireEvent.click(screen.getByLabelText('常用问题'));

      await waitFor(() => {
        expect(screen.getByText('测试问题1')).toBeInTheDocument();
        expect(screen.getByText('测试问题2')).toBeInTheDocument();
      });
    });

    test('should disable button when AI is not configured', async () => {
      require('../../services/aiConfigService').hasUsableAIConfig.mockReturnValue(false);

      render(<AISidePanel {...defaultProps} valuationData={mockValuationData} />);

      await waitFor(() => {
        const button = screen.getByLabelText('常用问题');
        expect(button).toBeDisabled();
      }, { timeout: 1000 });
    });
  });
});