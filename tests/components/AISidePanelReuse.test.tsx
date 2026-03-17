import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AISidePanel from '../../components/AISidePanel';
import { aiAssistantStateManager } from '../../services/aiAssistantStateManager';

// Mock DOMPurify
jest.mock('dompurify', () => ({
  __esModule: true,
  default: {
    sanitize: (html: string) => html
  }
}));

// Mock the AI service functions
jest.mock('../../services/aiService', () => ({
  queryAI: jest.fn(),
  queryAIWithTemplate: jest.fn(),
  AIResponse: {}
}));

jest.mock('../../services/aiConfigService', () => ({
  getAIConfig: jest.fn(() => ({
    apiEndpoint: 'https://api.example.com/v1/chat/completions',
    apiKey: 'test-key',
    model: 'gpt-4'
  })),
  hasValidAIConfig: jest.fn(() => true)
}));

describe('AISidePanel Reusability Test', () => {
  const defaultProps = {
    isVisible: true,
    onClose: jest.fn(),
    fundSymbol: '012349',
    fundName: 'Test Fund',
    valuationData: {
      estimatedValuation: '1.2345',
      netAssetValue: '1.2234',
      estimationDate: '2023-01-01',
      changePercent: '0.91'
    },
    tradeHistory: []
  };

  beforeEach(() => {
    // Clear any existing state for the test fund
    aiAssistantStateManager.clearState('012349');
  });

  test('should maintain conversation history when panel is closed and reopened', async () => {
    // Initially render the panel
    const { rerender } = render(
      <AISidePanel {...defaultProps} isVisible={true} />
    );

    // Simulate adding a message to the conversation
    const testMessage = {
      id: 'test-message-1',
      content: 'Hello, this is a test message',
      role: 'user',
      timestamp: new Date()
    };

    // Manually set state for this fund to simulate a conversation
    aiAssistantStateManager.setState('012349', {
      messages: [testMessage],
      hasBeenInitialized: true,
      lastAccessed: new Date()
    });

    // Close the panel by re-rendering with isVisible=false
    rerender(<AISidePanel {...defaultProps} isVisible={false} />);

    // Verify the panel is not visible
    expect(screen.queryByText('AI 投资助手')).not.toBeInTheDocument();

    // Reopen the panel by re-rendering with isVisible=true
    rerender(<AISidePanel {...defaultProps} isVisible={true} />);

    // Wait for the component to update and check if the message is still there
    await waitFor(() => {
      expect(screen.getByText('Hello, this is a test message')).toBeInTheDocument();
    });

    // Verify that the state was retrieved correctly from the global state manager
    const state = aiAssistantStateManager.getState('012349');
    expect(state).not.toBeNull();
    expect(state?.messages.length).toBeGreaterThan(0);
    expect(state?.hasBeenInitialized).toBe(true);
  });

  test('should properly reset state when panel is manually closed', () => {
    // Render the panel
    render(<AISidePanel {...defaultProps} isVisible={true} />);

    // Add some messages to the state
    const messages = [
      { id: 'msg1', content: 'Message 1', role: 'user', timestamp: new Date() },
      { id: 'msg2', content: 'Message 2', role: 'assistant', timestamp: new Date() }
    ];

    aiAssistantStateManager.setState('012349', {
      messages,
      hasBeenInitialized: true,
      lastAccessed: new Date()
    });

    // Get the close button and click it
    const closeButton = screen.getByLabelText('关闭');
    fireEvent.click(closeButton);

    // Check that the state was reset
    const state = aiAssistantStateManager.getState('012349');
    expect(state).not.toBeNull();
    expect(state?.messages.length).toBe(0);
    expect(state?.hasBeenInitialized).toBe(false);
  });

  test('should maintain separate states for different funds', () => {
    const fundASymbol = '012349';
    const fundBSymbol = '012350';

    const fundAMessage = {
      id: 'fund-a-msg',
      content: 'Fund A message',
      role: 'user',
      timestamp: new Date()
    };

    const fundBMessage = {
      id: 'fund-b-msg',
      content: 'Fund B message',
      role: 'user',
      timestamp: new Date()
    };

    // Set state for Fund A
    aiAssistantStateManager.setState(fundASymbol, {
      messages: [fundAMessage],
      hasBeenInitialized: true,
      lastAccessed: new Date()
    });

    // Set state for Fund B
    aiAssistantStateManager.setState(fundBSymbol, {
      messages: [fundBMessage],
      hasBeenInitialized: true,
      lastAccessed: new Date()
    });

    // Verify both states exist separately
    const fundAState = aiAssistantStateManager.getState(fundASymbol);
    const fundBState = aiAssistantStateManager.getState(fundBSymbol);

    expect(fundAState).not.toBeNull();
    expect(fundBState).not.toBeNull();

    expect(fundAState?.messages[0].content).toBe('Fund A message');
    expect(fundBState?.messages[0].content).toBe('Fund B message');
  });
});