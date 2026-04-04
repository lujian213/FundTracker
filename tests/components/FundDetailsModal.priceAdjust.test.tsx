// tests/components/FundDetailsModal.priceAdjust.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FundDetailsModal } from '../../components/FundDetailsModal';
import * as systemConfigService from '../../services/systemConfigService';

jest.mock('../../services/systemConfigService');

const mockIsFeatureEnabled = systemConfigService.isFeatureEnabled as jest.MockedFunction<typeof systemConfigService.isFeatureEnabled>;

describe('FundDetailsModal - 初始价格调整按钮', () => {
  const mockData = {
    symbol: '007349',
    name: '华夏科技创新A',
    currentPrice: 1.5,
    previousPrice: 1.45,
    changePercentage: 3.45,
    realtimeDate: '2026-03-26',
    netWorthDate: '2026-03-25',
    lastUpdated: '10:30',
    sourceUrl: 'https://example.com',
  };

  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  test('should not show adjust button when feature is disabled', () => {
    mockIsFeatureEnabled.mockReturnValue(false);
    localStorage.setItem('fund_position_007349', JSON.stringify({
      fullCapacity: 10000,
      initialPosition: 1000,
      startDate: '2026-01-01',
      initialPrice: 1.2,
    }));

    render(<FundDetailsModal data={mockData} onClose={mockOnClose} />);

    expect(screen.queryByLabelText('调整初始价格')).not.toBeInTheDocument();
  });

  test('should not show adjust button when initialPosition is 0', () => {
    mockIsFeatureEnabled.mockReturnValue(true);
    localStorage.setItem('fund_position_007349', JSON.stringify({
      fullCapacity: 10000,
      initialPosition: 0,
    }));

    render(<FundDetailsModal data={mockData} onClose={mockOnClose} />);

    expect(screen.queryByLabelText('调整初始价格')).not.toBeInTheDocument();
  });

  test('should show adjust button when feature enabled and initialPosition > 0', async () => {
    mockIsFeatureEnabled.mockReturnValue(true);
    localStorage.setItem('fund_position_007349', JSON.stringify({
      fullCapacity: 10000,
      initialPosition: 1000,
      startDate: '2026-01-01',
      initialPrice: 1.2,
    }));

    render(<FundDetailsModal data={mockData} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByLabelText('调整初始价格')).toBeInTheDocument();
    });
  });
});