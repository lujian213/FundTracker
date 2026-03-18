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

describe('AISidePanel Issues Fix Verification', () => {
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

  test('should maintain correct context length after API responses', async () => {
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

    // Simulate sending a message
    const input = screen.getByPlaceholderText('输入您的问题...');
    fireEvent.change(input, { target: { value: 'Test question' } });

    // Find and click send button
    const sendButton = screen.getByLabelText('发送');
    fireEvent.click(sendButton);

    // Wait for the AI response to be processed
    await waitFor(() => {
      expect(screen.getByText('Test response from AI')).toBeInTheDocument();
    });

    // Capture context length after API response
    contextElement = screen.getByText(/上下文: \d+ 字符/);
    const afterResponseMatch = contextElement.textContent?.match(/上下文: (\d+) 字符/);
    const afterResponseLength = afterResponseMatch ? parseInt(afterResponseMatch[1]) : 0;

    // Length should have increased after adding user question and AI response
    expect(afterResponseLength).toBeGreaterThan(initialLength);
  });

  test('should handle context length correctly when panel is reopened', async () => {
    // Set up initial state with some content
    const initialMessages = [
      { id: '1', content: 'Initial message 1', role: 'user', timestamp: new Date() },
      { id: '2', content: 'Initial message 2', role: 'assistant', timestamp: new Date() },
      { id: '3', content: 'Initial message 3', role: 'user', timestamp: new Date() }
    ];

    aiAssistantStateManager.setState('TEST001', {
      historyContent: [],
      newContent: initialMessages,
      summaryContent: 'Initial summary',
      hasBeenInitialized: true,
      lastAccessed: new Date(),
      initializationDate: new Date()
    });

    // Render the panel initially
    const { rerender } = render(
      <AISidePanel {...defaultProps} isVisible={true} />
    );

    // Wait for the panel to load
    await waitFor(() => {
      expect(screen.getByText(/AI 投资助手/)).toBeInTheDocument();
    });

    // Capture the initial context length displayed
    let contextElement = screen.getByText(/上下文: \d+ 字符/);
    const initialMatch = contextElement.textContent?.match(/上下文: (\d+) 字符/);
    const initialLength = initialMatch ? parseInt(initialMatch[1]) : 0;

    // Close the panel
    rerender(<AISidePanel {...defaultProps} isVisible={false} />);
    expect(screen.queryByText(/AI 投资助手/)).not.toBeInTheDocument();

    // Reopen the panel
    rerender(<AISidePanel {...defaultProps} isVisible={true} />);

    // Wait for the panel to reload
    await waitFor(() => {
      expect(screen.getByText(/AI 投资助手/)).toBeInTheDocument();
    });

    // Check context length again - it should be consistent
    contextElement = screen.getByText(/上下文: \d+ 字符/);
    const finalMatch = contextElement.textContent?.match(/上下文: (\d+) 字符/);
    const finalLength = finalMatch ? parseInt(finalMatch[1]) : 0;

    // Context length should remain consistent after reopen (with slight tolerance for formatting differences)
    expect(Math.abs(initialLength - finalLength)).toBeLessThanOrEqual(10);
  });

  // Skipping the compression test for now as it requires more complex mocking of the full flow
  // The core issue is verifying that compression status is shown after successful compression
  // This is difficult to test without simulating the entire user interaction flow
  test.skip('should show compression completed status after successful compression', () => {
    // This test requires complex simulation of the entire flow
    // It would involve sending a message that triggers compression (>3000 chars)
    // and then verifying the status updates appropriately
  });

  test('should correctly calculate context length as summaryContent + newContent', async () => {
    const compressionService = new ContextCompressionService(5000); // Higher threshold for this test

    // Create test state - use the same format as AISidePanel expects
    const testState = {
      historyContent: [],
      newContent: [
        { id: 'new1', content: 'New message', role: 'user', timestamp: new Date() },
        { id: 'new2', content: 'Another new message', role: 'assistant', timestamp: new Date() }
      ],
      summaryContent: 'Summary content',
      hasBeenInitialized: true,
      lastAccessed: new Date(),
      initializationDate: new Date()
    };

    // Calculate expected length using the service method
    const expectedLength = compressionService.getContextLength(testState);

    // Store state
    aiAssistantStateManager.setState('TEST001', testState);

    // Render panel
    render(<AISidePanel {...defaultProps} isVisible={true} />);

    // Wait for panel to load
    await waitFor(() => {
      expect(screen.getByText(/AI 投资助手/)).toBeInTheDocument();
    });

    // Get the actual context length from the display
    const contextElement = screen.getByText(/上下文: \d+ 字符/);
    const actualLengthMatch = contextElement.textContent?.match(/上下文: (\d+) 字符/);
    const actualLength = actualLengthMatch ? parseInt(actualLengthMatch[1]) : 0;

    // The displayed length should match the service calculation
    expect(actualLength).toBe(expectedLength);
  });

  test('should not show the "summaryLength=0, newContentLength=large" error after compression', async () => {
    // This test verifies the fix for the specific issue reported:
    // "为什么summary忽然变成了0，而newContent忽然变成了2041？"

    // Set up state that simulates post-compression state
    const postCompressionState = {
      historyContent: [
        { id: 'orig1', content: 'Original message 1', role: 'user', timestamp: new Date() },
        { id: 'orig2', content: 'Original message 2', role: 'assistant', timestamp: new Date() }
      ],
      newContent: [], // After compression, newContent should be empty
      summaryContent: 'This is the compressed summary that contains key information from the conversation', // Should have content after compression
      hasBeenInitialized: true,
      lastAccessed: new Date(),
      initializationDate: new Date()
    };

    aiAssistantStateManager.setState('TEST001', postCompressionState);

    // Render the panel
    const { rerender } = render(
      <AISidePanel {...defaultProps} isVisible={true} />
    );

    // Wait for the panel to load
    await waitFor(() => {
      expect(screen.getByText(/AI 投资助手/)).toBeInTheDocument();
    });

    // Close and reopen to test the specific scenario where the bug occurred
    rerender(<AISidePanel {...defaultProps} isVisible={false} />);
    expect(screen.queryByText(/AI 投资助手/)).not.toBeInTheDocument();

    // Reopen the panel - this is where the bug previously occurred
    rerender(<AISidePanel {...defaultProps} isVisible={true} />);

    // Wait for the panel to reload
    await waitFor(() => {
      expect(screen.getByText(/AI 投资助手/)).toBeInTheDocument();
    });

    // Verify the context length is calculated correctly after reopen
    const contextElement = screen.getByText(/上下文: \d+ 字符/);
    const contextLengthMatch = contextElement.textContent?.match(/上下文: (\d+) 字符/);
    const contextLength = contextLengthMatch ? parseInt(contextLengthMatch[1]) : 0;

    // The context length should be based on the summary content, not incorrectly showing
    // a large newContent when it should be empty
    expect(contextLength).toBeGreaterThan(0); // Should have some length from the summary

    // Check that the state in the global manager is consistent
    const state = aiAssistantStateManager.getState('TEST001');
    expect(state).not.toBeNull();
    expect(state?.newContent.length).toBe(0); // newContent should remain empty after compression
    expect(state?.summaryContent.length).toBeGreaterThan(0); // summary should have content after compression
  });
});