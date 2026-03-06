import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../App';
import { MarketIndex, ValuationData } from '../../types';

jest.mock('../../components/MarketNewsTicker', () => ({
  MarketNewsTicker: () => <div data-testid="market-news" />,
}));

jest.mock('../../components/AddTickerModal', () => ({
  AddTickerModal: () => null,
}));

jest.mock('../../components/FundDetailsModal', () => ({
  FundDetailsModal: () => null,
}));

jest.mock('../../components/IndexDetailsModal', () => ({
  IndexDetailsModal: () => null,
}));

jest.mock('../../components/OverallProfitModal', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../components/TransactionsModal', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../components/PositionsModal', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../components/BackupSettingsModal', () => ({
  __esModule: true,
  default: () => null,
}));

const fetchFundDataMock = jest.fn();
const fetchMarketIndicesMock = jest.fn();
const forceFetchFundHistoryMock = jest.fn();

jest.mock('../../services/fundService', () => ({
  fetchFundData: (...args: unknown[]) => fetchFundDataMock(...args),
  fetchMarketIndices: (...args: unknown[]) => fetchMarketIndicesMock(...args),
  forceFetchFundHistory: (...args: unknown[]) => forceFetchFundHistoryMock(...args),
}));

const fundData: ValuationData = {
  symbol: '000001',
  name: 'Sample Fund',
  currentPrice: 1.2345,
  previousPrice: 1.2,
  changePercentage: 1.23,
  lastUpdated: '2026-03-06 10:00:00',
  realtimeDate: '2026-03-06',
  netWorthDate: '2026-03-05',
  valuationDate: '2026-03-06',
  sourceUrl: '',
};

function makeIndex(symbol: string, name: string): MarketIndex {
  return {
    symbol,
    name,
    current: 1234.56,
    change: 12.3,
    changePercent: 1.01,
    lastUpdated: '10:00:00',
  };
}

describe('App manage mode', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();

    fetchFundDataMock.mockResolvedValue(fundData);
    forceFetchFundHistoryMock.mockResolvedValue([]);
    fetchMarketIndicesMock.mockImplementation(async (symbols: string[]) => {
      return symbols.map(symbol => {
        if (symbol === '1.000001') return makeIndex(symbol, '上证指数');
        if (symbol === '100.NDX') return makeIndex(symbol, '纳斯达克');
        return makeIndex(symbol, symbol);
      });
    });
  });

  test('disables manage button when no funds or indices are configured', () => {
    localStorage.setItem('fund_portfolio', JSON.stringify([]));
    localStorage.setItem('fund_indices_config', JSON.stringify([]));
    localStorage.setItem('fund_global_indices_config', JSON.stringify([]));

    render(<App />);

    const manageButton = screen.getByRole('button', { name: '管理' });
    expect(manageButton).toBeDisabled();
  });

  test('enters unified manage mode and shows shared selection actions', async () => {
    localStorage.setItem('fund_portfolio', JSON.stringify([{ id: 'fund-1', symbol: '000001', name: 'Sample Fund', market: 'Fund' }]));
    localStorage.setItem('fund_indices_config', JSON.stringify(['1.000001']));
    localStorage.setItem('fund_global_indices_config', JSON.stringify(['100.NDX']));

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '管理' }));

    expect(screen.getByText('批量删除')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
    expect(screen.queryByText('1个项目待删除')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByLabelText('切换删除选择 Sample Fund')).toBeInTheDocument();
      expect(screen.getByLabelText('切换删除选择 上证指数')).toBeInTheDocument();
      expect(screen.getByLabelText('切换删除选择 纳斯达克')).toBeInTheDocument();
    });
  });

  test('confirm removes selected fund, domestic index, and global index together', async () => {
    localStorage.setItem('fund_portfolio', JSON.stringify([{ id: 'fund-1', symbol: '000001', name: 'Sample Fund', market: 'Fund' }]));
    localStorage.setItem('fund_indices_config', JSON.stringify(['1.000001']));
    localStorage.setItem('fund_global_indices_config', JSON.stringify(['100.NDX']));

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '管理' }));

    await waitFor(() => {
      expect(screen.getByLabelText('切换删除选择 Sample Fund')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('切换删除选择 Sample Fund'));
    fireEvent.click(screen.getByLabelText('切换删除选择 上证指数'));
    fireEvent.click(screen.getByLabelText('切换删除选择 纳斯达克'));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));

    await waitFor(() => {
      expect(screen.getByText('我的自选基金')).toBeInTheDocument();
    });

    expect(screen.queryByText('Sample Fund')).not.toBeInTheDocument();
    expect(screen.queryByText('上证指数')).not.toBeInTheDocument();
    expect(screen.queryByText('纳斯达克')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '管理' })).toBeDisabled();
  });

  test('cancel exits manage mode without deleting selected items', async () => {
    localStorage.setItem('fund_portfolio', JSON.stringify([{ id: 'fund-1', symbol: '000001', name: 'Sample Fund', market: 'Fund' }]));
    localStorage.setItem('fund_indices_config', JSON.stringify(['1.000001']));
    localStorage.setItem('fund_global_indices_config', JSON.stringify(['100.NDX']));

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '管理' }));

    await waitFor(() => {
      expect(screen.getByLabelText('切换删除选择 Sample Fund')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('切换删除选择 Sample Fund'));
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    await waitFor(() => {
      expect(screen.getByText('我的自选基金')).toBeInTheDocument();
    });

    expect(screen.getByText('Sample Fund')).toBeInTheDocument();
    expect(screen.getByText('上证指数')).toBeInTheDocument();
    expect(screen.getByText('纳斯达克')).toBeInTheDocument();
  });

  test('shows pending deletion count only after items are selected', async () => {
    localStorage.setItem('fund_portfolio', JSON.stringify([{ id: 'fund-1', symbol: '000001', name: 'Sample Fund', market: 'Fund' }]));
    localStorage.setItem('fund_indices_config', JSON.stringify(['1.000001']));
    localStorage.setItem('fund_global_indices_config', JSON.stringify(['100.NDX']));

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '管理' }));

    await waitFor(() => {
      expect(screen.getByLabelText('切换删除选择 Sample Fund')).toBeInTheDocument();
    });

    expect(screen.queryByText('1个项目待删除')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('切换删除选择 Sample Fund'));
    const pendingCount = screen.getByText('1个项目待删除');
    expect(pendingCount).toBeInTheDocument();
    expect(pendingCount).toHaveClass('text-center');
    const centeredSlot = pendingCount.parentElement;
    expect(centeredSlot).toHaveClass('justify-center');

    fireEvent.click(screen.getByLabelText('切换删除选择 上证指数'));
    expect(screen.getByText('2个项目待删除')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('切换删除选择 纳斯达克'));
    expect(screen.getByText('3个项目待删除')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('切换删除选择 纳斯达克'));
    expect(screen.getByText('2个项目待删除')).toBeInTheDocument();
  });
});

