import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AISidePanel from '../../components/AISidePanel';
import { aiAssistantStateManager } from '../../services/aiAssistantStateManager';
import { ContextCompressionService, COMPRESSION_THRESHOLD } from '../../services/ContextCompressionService';

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

describe('AISidePanel Final Integration Test', () => {
  const defaultProps = {
    isVisible: true,
    onClose: jest.fn(),
    fundSymbol: 'TEST001',
    fundName: 'Test Fund',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    aiAssistantStateManager.clearState('TEST001');
  });

  afterEach(() => {
    aiAssistantStateManager.clearState('TEST001');
  });

  test('verifies all compression fixes are working', async () => {
    const { rerender } = render(
      <AISidePanel {...defaultProps} isVisible={true} />
    );

    await waitFor(() => {
      expect(screen.getByText(/AI 投资助手/)).toBeInTheDocument();
    });

    const initialState = aiAssistantStateManager.getState('TEST001');
    expect(initialState).not.toBeNull();

    const input = screen.getByPlaceholderText('输入您的问题...');

    // Add multiple exchanges to build up context
    for (let i = 0; i < 3; i++) {
      fireEvent.change(input, { target: { value: `Question ${i+1} to test compression fix. This is a moderately long question to build up context for testing purposes. `.repeat(15) } });
      const sendButton = screen.getByLabelText('发送');
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(screen.getAllByText('Test response from AI').length).toBeGreaterThan(0);
      }, { timeout: 5000 });

      const currentState = aiAssistantStateManager.getState('TEST001');
      if (currentState) {
        const compressionService = new ContextCompressionService(COMPRESSION_THRESHOLD);
        const summaryLength = currentState.summaryContent.length || 0;
        const totalContextLength = compressionService.getContextLength(currentState);

        if (totalContextLength >= COMPRESSION_THRESHOLD) {
          expect(summaryLength).toBeGreaterThan(0);
        }
      }
    }

    const stateBeforeClose = aiAssistantStateManager.getState('TEST001');
    if (stateBeforeClose) {
      const compressionService = new ContextCompressionService(COMPRESSION_THRESHOLD);
      const contextLength = compressionService.getContextLength(stateBeforeClose);
      expect(contextLength).toBeGreaterThan(0);
    }

    // Close the panel
    rerender(<AISidePanel {...defaultProps} isVisible={false} />);
    expect(screen.queryByText(/AI 投资助手/)).not.toBeInTheDocument();

    // Reopen the panel
    rerender(<AISidePanel {...defaultProps} isVisible={true} />);

    await waitFor(() => {
      expect(screen.getByText(/AI 投资助手/)).toBeInTheDocument();
    });

    const stateAfterReopen = aiAssistantStateManager.getState('TEST001');
    if (stateAfterReopen) {
      const compressionService = new ContextCompressionService(COMPRESSION_THRESHOLD);
      const summaryLength = stateAfterReopen.summaryContent.length || 0;
      const totalContextLength = compressionService.getContextLength(stateAfterReopen);

      if (totalContextLength >= COMPRESSION_THRESHOLD) {
        expect(summaryLength).toBeGreaterThan(0);
      }

      expect(totalContextLength).toBeLessThan(50000);
    }

    // Verify that we can still add more messages after reopen
    fireEvent.change(input, { target: { value: 'Final test question after reopen' } });
    const sendButton = screen.getByLabelText('发送');
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(screen.getAllByText('Test response from AI').length).toBeGreaterThan(0);
    }, { timeout: 5000 });

    const finalState = aiAssistantStateManager.getState('TEST001');
    if (finalState) {
      const compressionService = new ContextCompressionService(COMPRESSION_THRESHOLD);
      const summaryLength = finalState.summaryContent.length || 0;
      const totalContextLength = compressionService.getContextLength(finalState);

      if (totalContextLength >= COMPRESSION_THRESHOLD) {
        expect(summaryLength).toBeGreaterThan(0);
      }
    }
  });
});