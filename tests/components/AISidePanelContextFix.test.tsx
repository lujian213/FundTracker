import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AISidePanel from '../../components/AISidePanel';
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
  queryAIWithTemplate: jest.fn().mockResolvedValue({
    success: true,
    content: 'Welcome to the AI assistant!'
  }),
  AIResponse: {},
  AIQueryContext: {},
}));

describe('AISidePanel Context Management Fixes', () => {
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

  test('should not duplicate messages when panel is reopened after compression', async () => {
    // Initially render the panel
    const { rerender } = render(
      <AISidePanel {...defaultProps} isVisible={true} />
    );

    // Wait for initial messages to load
    await waitFor(() => {
      expect(screen.getByText(/AI 投资助手/)).toBeInTheDocument();
    });

    // Check for the welcome message or initial AI message
    const initialMessageElements = screen.getAllByText(/(AI 投资助手|Welcome|Hello|Test response)/i);
    const initialCount = initialMessageElements.length;

    // Close the panel
    rerender(<AISidePanel {...defaultProps} isVisible={false} />);
    expect(screen.queryByText(/AI 投资助手/)).not.toBeInTheDocument();

    // Reopen the panel
    rerender(<AISidePanel {...defaultProps} isVisible={true} />);

    // Wait for panel to reload
    await waitFor(() => {
      expect(screen.getByText(/AI 投资助手/)).toBeInTheDocument();
    });

    // Count messages again to ensure no duplication
    const finalMessageElements = screen.getAllByText(/(AI 投资助手|Welcome|Hello|Test response)/i);
    const finalCount = finalMessageElements.length;

    // Message count should be the same (no duplication)
    expect(finalCount).toEqual(initialCount);
  });

  test('should maintain correct context length when panel is closed and reopened', async () => {
    // Setup initial state with some content
    const initialMessages = [
      { id: '1', content: 'Initial message 1', role: 'user', timestamp: new Date() },
      { id: '2', content: 'Initial message 2', role: 'assistant', timestamp: new Date() },
      { id: '3', content: 'Initial message 3', role: 'user', timestamp: new Date() }
    ];

    aiAssistantStateManager.setState('TEST001', {
      historyContent: [],
      newContent: initialMessages,
      summaryContent: '',
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
    const initialContextElement = screen.getByText(/上下文: \d+ 字符/);
    const initialMatch = initialContextElement.textContent?.match(/上下文: (\d+) 字符/);
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

    // Check context length again - it should be the same as before
    const finalContextElement = screen.getByText(/上下文: \d+ 字符/);
    const finalMatch = finalContextElement.textContent?.match(/上下文: (\d+) 字符/);
    const finalLength = finalMatch ? parseInt(finalMatch[1]) : 0;

    // Context length should remain consistent (may vary slightly due to formatting)
    expect(Math.abs(initialLength - finalLength)).toBeLessThanOrEqual(10); // Allow minor variance
  });

  test('should handle compression without duplicating the last AI response', async () => {
    // Create state with content that would trigger compression
    const longContent = 'A'.repeat(3500); // Exceeds our 3000 character threshold
    const aiMessage = {
      id: 'recent-ai-response',
      content: 'This is the latest AI response that should not be duplicated after compression.',
      role: 'assistant',
      timestamp: new Date()
    };

    aiAssistantStateManager.setState('TEST001', {
      historyContent: [{ id: 'old-msg', content: longContent, role: 'user', timestamp: new Date() }],
      newContent: [aiMessage],
      summaryContent: 'Previous summary content',
      hasBeenInitialized: true,
      lastAccessed: new Date(),
      initializationDate: new Date()
    });

    render(<AISidePanel {...defaultProps} isVisible={true} />);

    // Wait for panel to load
    await waitFor(() => {
      expect(screen.getByText(/AI 投资助手/)).toBeInTheDocument();
    });

    // Check that the AI message appears exactly once
    const aiResponses = screen.getAllByText('This is the latest AI response that should not be duplicated after compression.');
    expect(aiResponses).toHaveLength(1);
  });
});