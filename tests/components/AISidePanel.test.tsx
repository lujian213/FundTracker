import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AISidePanel from '../../components/AISidePanel';
import { ValuationData } from '../../types';

// Mock DOMPurify
jest.mock('dompurify', () => ({
  __esModule: true,
  default: {
    sanitize: (html: string) => html
  }
}));

// Mock the services
jest.mock('../../services/aiService', () => ({
  queryAI: jest.fn()
}));

jest.mock('../../services/aiConfigService', () => ({
  getAIConfig: jest.fn(),
  hasValidAIConfig: jest.fn()
}));

describe('AISidePanel', () => {
  const mockOnClose = jest.fn();
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
  });

  test('renders correctly when visible', () => {
    const { getByText } = render(
      <AISidePanel
        isVisible={true}
        onClose={mockOnClose}
        fundSymbol="TEST"
        fundName="Test Fund"
        valuationData={mockValuationData}
      />
    );

    expect(getByText('AI 投资助手')).toBeInTheDocument();
    expect(getByText('Test Fund (TEST)')).toBeInTheDocument();
  });

  test('does not render when not visible', () => {
    const { container } = render(
      <AISidePanel
        isVisible={false}
        onClose={mockOnClose}
        fundSymbol="TEST"
        fundName="Test Fund"
        valuationData={mockValuationData}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  test('calls onClose when close button is clicked', () => {
    render(
      <AISidePanel
        isVisible={true}
        onClose={mockOnClose}
        fundSymbol="TEST"
        fundName="Test Fund"
        valuationData={mockValuationData}
      />
    );

    fireEvent.click(screen.getByLabelText('关闭'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test('shows red warning when no config exists', () => {
    require('../../services/aiConfigService').getAIConfig.mockReturnValue(null);
    require('../../services/aiConfigService').hasValidAIConfig.mockReturnValue(false);

    const { rerender } = render(
      <AISidePanel
        isVisible={true}
        onClose={mockOnClose}
        fundSymbol="TEST"
        fundName="Test Fund"
        valuationData={mockValuationData}
      />
    );

    // Re-render to trigger the useEffect that loads config
    rerender(
      <AISidePanel
        isVisible={true}
        onClose={mockOnClose}
        fundSymbol="TEST"
        fundName="Test Fund"
        valuationData={mockValuationData}
      />
    );

    // Check that the red warning message is shown
    expect(screen.getByText('未检测到AI配置，请前往设置页面配置AI助手')).toBeInTheDocument();
  });

  test('allows input and submit when config is provided', async () => {
    // Mock config exists
    const mockConfig = {
      apiEndpoint: 'https://api.example.com',
      apiKey: 'test-key',
      model: 'gpt-4'
    };

    require('../../services/aiConfigService').getAIConfig.mockReturnValue(mockConfig);
    require('../../services/aiConfigService').hasValidAIConfig.mockReturnValue(true);

    const { rerender } = render(
      <AISidePanel
        isVisible={true}
        onClose={mockOnClose}
        fundSymbol="TEST"
        fundName="Test Fund"
        valuationData={mockValuationData}
      />
    );

    // Re-render to trigger the useEffect that loads config
    rerender(
      <AISidePanel
        isVisible={true}
        onClose={mockOnClose}
        fundSymbol="TEST"
        fundName="Test Fund"
        valuationData={mockValuationData}
      />
    );

    // Find the textarea and input a message
    const textarea = screen.getByPlaceholderText('输入您的问题...');
    fireEvent.change(textarea, { target: { value: 'How is this fund performing?' } });

    // Find and click the send button
    const sendButton = screen.getByLabelText('发送');
    fireEvent.click(sendButton);

    // Check that the message was added to the chat
    await waitFor(() => {
      expect(screen.getByText('How is this fund performing?')).toBeInTheDocument();
    });
  });

  test('disables send button when no config exists', () => {
    require('../../services/aiConfigService').getAIConfig.mockReturnValue(null);

    const { rerender } = render(
      <AISidePanel
        isVisible={true}
        onClose={mockOnClose}
        fundSymbol="TEST"
        fundName="Test Fund"
        valuationData={mockValuationData}
      />
    );

    // Re-render to trigger the useEffect that loads config
    rerender(
      <AISidePanel
        isVisible={true}
        onClose={mockOnClose}
        fundSymbol="TEST"
        fundName="Test Fund"
        valuationData={mockValuationData}
      />
    );

    const sendButton = screen.getByLabelText('发送');
    expect(sendButton).toBeDisabled();
  });
});