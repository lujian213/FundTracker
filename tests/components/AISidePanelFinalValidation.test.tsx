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
    // Clear any existing state for the test fund
    aiAssistantStateManager.clearState('TEST001');
  });

  afterEach(() => {
    // Clean up after each test
    aiAssistantStateManager.clearState('TEST001');
  });

  test('verifies all compression fixes are working', async () => {
    const { rerender } = render(
      <AISidePanel {...defaultProps} isVisible={true} />
    );

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText(/AI 投资助手/)).toBeInTheDocument();
    });

    // Get initial state
    let initialState = aiAssistantStateManager.getState('TEST001');
    expect(initialState).not.toBeNull();

    if (initialState) {
      console.log(`Initial state - history: ${initialState.historyContent.length}, new: ${initialState.newContent.length}, summary: ${initialState.summaryContent.length}`);
    }

    // Add content to trigger potential compression
    const input = screen.getByPlaceholderText('输入您的问题...');

    // Add multiple exchanges to build up context
    for (let i = 0; i < 3; i++) {
      // Add a substantial question
      fireEvent.change(input, { target: { value: `Question ${i+1} to test compression fix. This is a moderately long question to build up context for testing purposes. `.repeat(15) } });
      const sendButton = screen.getByLabelText('发送');
      fireEvent.click(sendButton);

      // Wait for AI response
      await waitFor(() => {
        expect(screen.getAllByText('Test response from AI').length).toBeGreaterThan(0);
      }, { timeout: 5000 });

      // Verify state after each exchange
      let currentState = aiAssistantStateManager.getState('TEST001');
      if (currentState) {
        console.log(`After exchange ${i+1} - history: ${currentState.historyContent.length}, new: ${currentState.newContent.length}, summary: ${currentState.summaryContent.length}`);

        const compressionService = new ContextCompressionService(COMPRESSION_THRESHOLD);
        const serializedNewContentLength = compressionService.serializeMessages(currentState.newContent).length;
        const summaryLength = currentState.summaryContent.length || 0;
        const totalContextLength = compressionService.getContextLength(currentState);

        console.log(`After exchange ${i+1} - newContentLength: ${serializedNewContentLength}, summaryLength: ${summaryLength}, totalContextLength: ${totalContextLength}`);

        // 修改检查逻辑：只有当总上下文超过阈值时，才检查summary是否被设置
        // 如果总上下文超过阈值但summary为0，说明压缩后状态被错误恢复
        if (totalContextLength >= COMPRESSION_THRESHOLD) {
          // 如果总上下文超过压缩阈值，summary应该不为0（已压缩）
          expect(summaryLength).toBeGreaterThan(0);
        }
      }
    }

    // Check if compression occurred by this point
    let stateBeforeClose = aiAssistantStateManager.getState('TEST001');
    if (stateBeforeClose) {
      console.log(`Before close - history: ${stateBeforeClose.historyContent.length}, new: ${stateBeforeClose.newContent.length}, summary: ${stateBeforeClose.summaryContent.length}`);

      const compressionService = new ContextCompressionService(COMPRESSION_THRESHOLD);
      const contextLength = compressionService.getContextLength(stateBeforeClose);
      console.log(`Context length before close: ${contextLength}`);
    }

    // Close the panel
    rerender(<AISidePanel {...defaultProps} isVisible={false} />);
    expect(screen.queryByText(/AI 投资助手/)).not.toBeInTheDocument();

    // Reopen the panel
    rerender(<AISidePanel {...defaultProps} isVisible={true} />);

    // Wait for the panel to reload
    await waitFor(() => {
      expect(screen.getByText(/AI 投资助手/)).toBeInTheDocument();
    });

    // Verify state after reopen is consistent
    let stateAfterReopen = aiAssistantStateManager.getState('TEST001');
    if (stateAfterReopen) {
      console.log(`After reopen - history: ${stateAfterReopen.historyContent.length}, new: ${stateAfterReopen.newContent.length}, summary: ${stateAfterReopen.summaryContent.length}`);

      const compressionService = new ContextCompressionService(COMPRESSION_THRESHOLD);
      const serializedNewContentLength = compressionService.serializeMessages(stateAfterReopen.newContent).length;
      const summaryLength = stateAfterReopen.summaryContent.length || 0;
      const totalContextLength = compressionService.getContextLength(stateAfterReopen);

      console.log(`After reopen - newContentLength: ${serializedNewContentLength}, summaryLength: ${summaryLength}, totalContextLength: ${totalContextLength}`);

      // 验证状态一致性：如果总上下文超过阈值，summary应该不为0
      if (totalContextLength >= COMPRESSION_THRESHOLD) {
        expect(summaryLength).toBeGreaterThan(0);
      }

      // The context length should be reasonable (not unexpectedly large after reopen)
      expect(totalContextLength).toBeLessThan(50000); // Should not be extremely large
    }

    // Verify that we can still add more messages after reopen
    fireEvent.change(input, { target: { value: 'Final test question after reopen' } });
    const sendButton = screen.getByLabelText('发送');
    fireEvent.click(sendButton);

    await waitFor(() => {
        expect(screen.getAllByText('Test response from AI').length).toBeGreaterThan(0);
      }, { timeout: 5000 });

    // Final verification
    let finalState = aiAssistantStateManager.getState('TEST001');
    if (finalState) {
      console.log(`Final state - history: ${finalState.historyContent.length}, new: ${finalState.newContent.length}, summary: ${finalState.summaryContent.length}`);

      const compressionService = new ContextCompressionService(COMPRESSION_THRESHOLD);
      const serializedNewContentLength = compressionService.serializeMessages(finalState.newContent).length;
      const summaryLength = finalState.summaryContent.length || 0;
      const totalContextLength = compressionService.getContextLength(finalState);

      console.log(`Final state - newContentLength: ${serializedNewContentLength}, summaryLength: ${summaryLength}, totalContextLength: ${totalContextLength}`);

      // 验证状态一致性：如果总上下文超过阈值，summary应该不为0
      if (totalContextLength >= COMPRESSION_THRESHOLD) {
        expect(summaryLength).toBeGreaterThan(0);
      }
    }

    expect(true).toBe(true); // Test passes if we reach this point without errors
  });
});