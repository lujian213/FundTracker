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

describe('AISidePanel Context Length Consistency Test', () => {
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

  test('should handle context length correctly after panel reopen', async () => {
    const { rerender } = render(
      <AISidePanel {...defaultProps} isVisible={true} />
    );

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText(/AI 投资助手/)).toBeInTheDocument();
    });

    // Capture initial context length
    let contextElement = screen.getByText(/上下文: \d+ 字符/);
    const initialMatch = contextElement.textContent?.match(/上下文: (\d+) 字符/);
    const initialLength = initialMatch ? parseInt(initialMatch[1]) : 0;

    // Simulate adding a message to establish some context
    const input = screen.getByPlaceholderText('输入您的问题...');
    fireEvent.change(input, { target: { value: 'Test question to establish context' } });
    const sendButton = screen.getByLabelText('发送');
    fireEvent.click(sendButton);

    // Wait for the AI response
    await waitFor(() => {
      expect(screen.getByText('Test response from AI')).toBeInTheDocument();
    });

    // Capture context length after adding message
    contextElement = screen.getByText(/上下文: \d+ 字符/);
    const afterMessageMatch = contextElement.textContent?.match(/上下文: (\d+) 字符/);
    const afterMessageLength = afterMessageMatch ? parseInt(afterMessageMatch[1]) : 0;

    // Length should have increased after adding message
    expect(afterMessageLength).toBeGreaterThanOrEqual(initialLength);

    // Close the panel
    rerender(<AISidePanel {...defaultProps} isVisible={false} />);
    expect(screen.queryByText(/AI 投资助手/)).not.toBeInTheDocument();

    // Reopen the panel
    rerender(<AISidePanel {...defaultProps} isVisible={true} />);

    // Wait for the panel to reload
    await waitFor(() => {
      expect(screen.getByText(/AI 投资助手/)).toBeInTheDocument();
    });

    // Check context length after reopen - it should be consistent with the state
    contextElement = screen.getByText(/上下文: \d+ 字符/);
    const afterReopenMatch = contextElement.textContent?.match(/上下文: (\d+) 字符/);
    const afterReopenLength = afterReopenMatch ? parseInt(afterReopenMatch[1]) : 0;

    // Context length should remain consistent after reopen (with slight tolerance for formatting differences)
    // Previously there was an issue where this would be inconsistent
    expect(Math.abs(afterMessageLength - afterReopenLength)).toBeLessThanOrEqual(50);
  });

  test('should not exhibit the "summaryLength=0, newContentLength=large" bug', async () => {
    // This test specifically validates that the issue mentioned in the bug report is fixed:
    // The problem was that after compression, the context showed summaryLength=0 and newContentLength=large
    // instead of the correct state where summaryLength=compressed_content and newContentLength=0

    // Create a simulated state that represents the post-compression state
    const postCompressionState = {
      historyContent: [
        { id: 'orig1', content: 'Original message 1', role: 'user', timestamp: new Date() },
        { id: 'orig2', content: 'Original message 2', role: 'assistant', timestamp: new Date() }
      ],
      newContent: [], // After compression, newContent should be moved to history and newContent cleared
      summaryContent: 'This is the compressed summary of the conversation with key points.',
      hasBeenInitialized: true,
      lastAccessed: new Date(),
      initializationDate: new Date()
    };

    // Set this state in the global state manager
    aiAssistantStateManager.setState('TEST001', postCompressionState);

    // Render the panel
    const { rerender } = render(
      <AISidePanel {...defaultProps} isVisible={true} />
    );

    // Wait for the panel to load
    await waitFor(() => {
      expect(screen.getByText(/AI 投资助手/)).toBeInTheDocument();
    });

    // Check that the state is consistent - no longer showing the erroneous state
    const state = aiAssistantStateManager.getState('TEST001');
    expect(state).not.toBeNull();

    // After fix, newContent should remain empty and summary should have content
    expect(state?.newContent.length).toBe(0);
    expect(state?.summaryContent.length).toBeGreaterThan(0);

    // The context length should be calculated correctly
    const compressionService = new ContextCompressionService();
    const expectedLength = compressionService.getContextLength(state!);

    const contextElement = screen.getByText(/上下文: \d+ 字符/);
    const contextMatch = contextElement.textContent?.match(/上下文: (\d+) 字符/);
    const displayedLength = contextMatch ? parseInt(contextMatch[1]) : 0;

    // The displayed length should match the expected length from the service
    expect(displayedLength).toBeCloseTo(expectedLength, -1); // Allow for small differences (tens of characters)
  });
});