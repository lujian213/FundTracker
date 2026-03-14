import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import InvestmentNoticeModal from '../../components/InvestmentNoticeModal';
import { Ticker, MarketType } from '../../types';

// Mock the dependencies
jest.mock('../../services/fundService', () => ({
  fetchFundHistory: jest.fn(() => Promise.resolve([
    { date: new Date('2023-01-01').getTime(), value: 1.0, equityReturn: 0 },
    { date: new Date('2023-01-02').getTime(), value: 1.1, equityReturn: 0 },
  ])),
}));

jest.mock('../../services/virtualTradeEngine', () => ({
  runVirtualTrade: jest.fn(() => ({
    timeline: [],
    summary: { initialTotal: 100000, finalTotal: 105000, totalProfit: 5000 },
    todayTip: { action: 'buy', shares: 100, reason: { type: 'golden', text: 'Golden cross detected' } }
  }))
}));

jest.mock('../../services/virtualTradeStrategies/trendFollowing', () => ({
  trendFollowingStrategy: { name: 'Trend Following', decide: () => ({ action: 'buy', shares: 100 }) },
}));

jest.mock('../../services/virtualTradeStrategies/meanReversion', () => ({
  meanReversionStrategy: { name: 'Mean Reversion', decide: () => ({ action: 'sell', shares: 50 }) },
}));

jest.mock('../../services/virtualTradeStrategies/constantMix', () => ({
  constantMixStrategy: { name: 'Constant Mix', decide: () => ({ action: 'hold', shares: 0 }) }
}));

jest.mock('../../services/strategyConfig', () => ({
  strategyConfig: {
    trendFollowing: { name: '趋势追踪策略', description: 'Trend following strategy' },
    meanReversion: { name: '均值回归策略', description: 'Mean reversion strategy' },
    constantMix: { name: '恒定混合策略', description: 'Constant mix strategy' },
  },
  defaultVirtualCash: 100000
}));

jest.mock('../../components/ThumbsUpIcon', () => {
  return {
    __esModule: true,
    default: function DummyThumbsUpIcon({ className, title }: { className?: string; title?: string }) {
      return <span className={className} title={title}>👍</span>;
    }
  };
});

const mockTicker: Ticker[] = [
  {
    id: '1',
    symbol: '000001',
    name: '华夏成长混合',
    market: MarketType.FUND
  }
];

describe('InvestmentNoticeModal', () => {
  const defaultProps = {
    portfolio: mockTicker,
    onClose: jest.fn(),
    onSelectFund: jest.fn(),
  };

  it('renders without crashing', async () => {
    render(<InvestmentNoticeModal {...defaultProps} />);

    // Should initially display the modal header and loading state
    expect(screen.getByText('今日投资提示')).toBeInTheDocument();
    expect(screen.getByText('正在计算投资建议...')).toBeInTheDocument();

    // Wait for the data to finish loading
    await waitFor(() => {
      expect(screen.queryByText('正在计算投资建议...')).not.toBeInTheDocument();
    }, { timeout: 3000 }); // Give more time for the delayed processing

    // After data loads, should display the disclaimer text
    expect(await screen.findByText(/以下是根据预设的交易策略计算出的投资提示/)).toBeInTheDocument();

    // Should display the table headers
    expect(screen.getByText('基金名称')).toBeInTheDocument();
    expect(screen.getByText('趋势追踪策略')).toBeInTheDocument();
    expect(screen.getByText('均值回归策略')).toBeInTheDocument();
    expect(screen.getByText('恒定混合策略')).toBeInTheDocument();
  });

  it('displays loading state initially', () => {
    render(<InvestmentNoticeModal {...defaultProps} />);

    expect(screen.getByText('正在计算投资建议...')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    render(<InvestmentNoticeModal {...defaultProps} />);

    // Wait for the modal to finish loading
    await waitFor(() => {
      expect(screen.getByText('今日投资提示')).toBeInTheDocument();
    });

    const closeButton = screen.getByLabelText('关闭投资提示窗口');
    fireEvent.click(closeButton);

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('displays fund name in the table', async () => {
    render(<InvestmentNoticeModal {...defaultProps} />);

    // Wait for the data to load
    await waitFor(() => {
      expect(screen.getByText('华夏成长混合')).toBeInTheDocument();
    });

    expect(screen.getByText('华夏成长混合')).toBeInTheDocument();
  });

  it('navigates to fund details when fund name is clicked', async () => {
    render(<InvestmentNoticeModal {...defaultProps} />);

    // Wait for the data to load
    await waitFor(() => {
      expect(screen.getByText('华夏成长混合')).toBeInTheDocument();
    });

    const fundNameElement = screen.getByText('华夏成长混合');
    fireEvent.click(fundNameElement);

    expect(defaultProps.onSelectFund).toHaveBeenCalledWith('000001');
  });
});