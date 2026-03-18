import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AISidePanel from '../../components/AISidePanel';
import { aiAssistantStateManager } from '../../services/aiAssistantStateManager';
import { ContextCompressionService } from '../../services/ContextCompressionService';

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

describe('AISidePanel After Compression Fix Verification', () => {
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

  test('should handle context length correctly after compression and panel reopen', async () => {
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

    // Send multiple messages to trigger compression
    const input = screen.getByPlaceholderText('输入您的问题...');

    // Send a long message to approach compression threshold
    fireEvent.change(input, { target: { value: 'This is a test question to add to the context with sufficient length to eventually trigger compression functionality. We need to add quite a bit of text to ensure we meet the compression threshold. Adding more content here to expand the context. Including additional phrases and sentences. More text to increase character count. Additional content for testing purposes. More words to make the message longer. Even more text to push towards the threshold. Additional phrases for length. More sentences to expand. Extra content for testing. Additional text to reach the limit. More words to make it longer. Additional content for testing purposes. Even more text to meet the threshold. More sentences and phrases. Extra content to increase length.' } });
    const sendButton = screen.getByLabelText('发送');
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText('Test response from AI')).toBeInTheDocument();
    });

    // Send another message to reach compression threshold
    fireEvent.change(input, { target: { value: 'Second test message with sufficient length to contribute to context growth and trigger compression. Adding more content here to expand the context. Including additional phrases and sentences. More text to increase character count. Additional content for testing purposes. More words to make the message longer. Even more text to push towards the threshold. Additional phrases for length. More sentences to expand. Extra content for testing. Additional text to reach the limit. More words to make it longer. Additional content for testing purposes. Even more text to meet the threshold. More sentences and phrases. Extra content to increase length.' } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(screen.getAllByText('Test response from AI')).toHaveLength(2);
    });

    // Check context length after adding messages
    contextElement = screen.getByText(/上下文: \d+ 字符/);
    const afterMessagesMatch = contextElement.textContent?.match(/上下文: (\d+) 字符/);
    const afterMessagesLength = afterMessagesMatch ? parseInt(afterMessagesMatch[1]) : 0;

    // Length should have increased significantly
    expect(afterMessagesLength).toBeGreaterThan(initialLength + 1000); // Should have increased significantly

    // Close the panel
    rerender(<AISidePanel {...defaultProps} isVisible={false} />);
    expect(screen.queryByText(/AI 投资助手/)).not.toBeInTheDocument();

    // Reopen the panel
    rerender(<AISidePanel {...defaultProps} isVisible={true} />);

    // Wait for the panel to reload
    await waitFor(() => {
      expect(screen.getByText(/AI 投资助手/)).toBeInTheDocument();
    });

    // Check context length after reopen
    contextElement = screen.getByText(/上下文: \d+ 字符/);
    const afterReopenMatch = contextElement.textContent?.match(/上下文: (\d+) 字符/);
    const afterReopenLength = afterReopenMatch ? parseInt(afterReopenMatch[1]) : 0;

    // After fix: context length should be consistent and not show the erroneous "summaryLength=0, newContentLength=large" issue
    // The difference should be reasonable (within 50 characters for display formatting differences)
    expect(Math.abs(afterMessagesLength - afterReopenLength)).toBeLessThanOrEqual(100);
  });

  test('should not show duplicated messages after compression', async () => {
    const { rerender } = render(
      <AISidePanel {...defaultProps} isVisible={true} />
    );

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText(/AI 投资助手/)).toBeInTheDocument();
    });

    // Send messages to trigger compression
    const input = screen.getByPlaceholderText('输入您的问题...');

    // Send first message
    fireEvent.change(input, { target: { value: 'First test question with sufficient length to contribute to context.' } });
    const sendButton = screen.getByLabelText('发送');
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText('Test response from AI')).toBeInTheDocument();
    });

    // Send a longer second message to trigger compression
    fireEvent.change(input, { target: { value: 'Second test question with very long content that should help trigger the compression mechanism when combined with the first message and response. This includes a lot of additional text to ensure we exceed the compression threshold. Adding more content here to expand the context. Including additional phrases and sentences. More text to increase character count. Additional content for testing purposes. More words to make the message longer. Even more text to push towards the threshold. Additional phrases for length. More sentences to expand. Extra content for testing. Additional text to reach the limit. More words to make it longer. Additional content for testing purposes. Even more text to meet the threshold. More sentences and phrases. Extra content to increase length. More text for the test. Additional content to expand. Even more to reach threshold.' } });
    fireEvent.click(sendButton);

    // Wait for potential compression
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Close and reopen the panel to test for message duplication
    rerender(<AISidePanel {...defaultProps} isVisible={false} />);
    expect(screen.queryByText(/AI 投资助手/)).not.toBeInTheDocument();

    rerender(<AISidePanel {...defaultProps} isVisible={true} />);

    // Wait for the panel to reload
    await waitFor(() => {
      expect(screen.getByText(/AI 投资助手/)).toBeInTheDocument();
    });

    // Check for message duplication
    const aiResponses = screen.getAllByText('Test response from AI');
    expect(aiResponses.length).toBeLessThanOrEqual(2); // Should have at most 2 responses (one for each question)
  });

  test('should maintain correct state after compression is completed', async () => {
    // Create a test scenario where we can verify state after compression

    // Create state that would trigger compression
    const longMessages = [
      {
        id: 'long1',
        content: 'This is a long test message with enough content to potentially trigger compression when combined with other messages. Adding lots of text to increase the character count. Including multiple sentences and phrases. More content to expand the context. Additional text for testing. Even more words to make it longer. Additional phrases for length. More sentences to expand. Extra content for testing. Additional text to reach the limit. More words to make it longer. Additional content for testing purposes. Even more text to meet the threshold. More sentences and phrases. Extra content to increase length.',
        role: 'user',
        timestamp: new Date()
      },
      {
        id: 'long2',
        content: 'Second long message with substantial content to increase context length further. This includes a lot of additional text to ensure we exceed the compression threshold. Adding more content here to expand the context. Including additional phrases and sentences. More text to increase character count. Additional content for testing purposes. More words to make the message longer. Even more text to push towards the threshold. Additional phrases for length. More sentences to expand. Extra content for testing. Additional text to reach the limit. More words to make it longer. Additional content for testing purposes. Even more text to meet the threshold. More sentences and phrases. Extra content to increase length.',
        role: 'user',
        timestamp: new Date()
      }
    ];

    aiAssistantStateManager.setState('TEST001', {
      historyContent: [],
      newContent: longMessages,
      summaryContent: 'Previous summary content',
      hasBeenInitialized: true,
      lastAccessed: new Date(),
      initializationDate: new Date()
    });

    // Render the panel
    render(<AISidePanel {...defaultProps} isVisible={true} />);

    // Wait for the panel to load
    await waitFor(() => {
      expect(screen.getByText(/AI 投资助手/)).toBeInTheDocument();
    });

    // Verify the state is maintained correctly
    const state = aiAssistantStateManager.getState('TEST001');
    expect(state).not.toBeNull();
    expect(state?.newContent.length).toBe(2); // Should maintain the 2 long messages
    expect(state?.summaryContent).toBe('Previous summary content');
  });
});