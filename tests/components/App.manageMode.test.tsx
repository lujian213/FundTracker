import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../App';
import { MarketIndex, ValuationData } from '../../types';
import { resetCache as resetIndexCache } from '../../services/indexService';

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
  normalizeIndexSymbol: (symbol: string) => symbol,
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
    info: {
      symbol,
      name,
      current: 1234.56,
      change: 12.3,
      changePercent: 1.01,
      lastUpdated: '10:00:00',
    },
    history: [],
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

  test('manage button is enabled due to default indices when no funds or indices are configured', () => {
    localStorage.setItem('fund_portfolio', JSON.stringify([]));
    localStorage.setItem('fund_indices_info', JSON.stringify([]));
    resetIndexCache();

    render(<App />);

    const manageButton = screen.getByRole('button', { name: '管理' });
    // 当没有配置指数时，App 会使用默认指数，所以管理按钮不会禁用
    expect(manageButton).not.toBeDisabled();
  });

  test('enters unified manage mode and shows shared selection actions', async () => {
    localStorage.setItem('fund_portfolio', JSON.stringify([{ id: 'fund-1', symbol: '000001', name: 'Sample Fund', market: 'Fund' }]));
    localStorage.setItem('fund_indices_info', JSON.stringify([
      { symbol: '1.000001', name: '上证指数', current: 3200, change: 0, changePercent: 0, lastUpdated: '' },
      { symbol: '100.NDX', name: '纳斯达克100', current: 15000, change: 0, changePercent: 0, lastUpdated: '' }
    ]));
    resetIndexCache();

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '管理' }));

    expect(screen.getByText('批量删除')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
    expect(screen.queryByText('1个项目待删除')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByLabelText('切换删除选择 Sample Fund')).toBeInTheDocument();
      expect(screen.getByLabelText('切换删除选择 上证指数')).toBeInTheDocument();
      expect(screen.getByLabelText('切换删除选择 纳斯达克100')).toBeInTheDocument();
    });
  });

  test('confirm removes selected fund, domestic index, and global index together', async () => {
    localStorage.setItem('fund_portfolio', JSON.stringify([{ id: 'fund-1', symbol: '000001', name: 'Sample Fund', market: 'Fund' }]));
    localStorage.setItem('fund_indices_info', JSON.stringify([
      { symbol: '1.000001', name: '上证指数', current: 3200, change: 0, changePercent: 0, lastUpdated: '' },
      { symbol: '100.NDX', name: '纳斯达克100', current: 15000, change: 0, changePercent: 0, lastUpdated: '' }
    ]));
    resetIndexCache();

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '管理' }));

    await waitFor(() => {
      expect(screen.getByLabelText('切换删除选择 Sample Fund')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('切换删除选择 Sample Fund'));
    fireEvent.click(screen.getByLabelText('切换删除选择 上证指数'));
    fireEvent.click(screen.getByLabelText('切换删除选择 纳斯达克100'));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));

    await waitFor(() => {
      expect(screen.getByText('我的自选基金')).toBeInTheDocument();
    });

    // 基金被删除
    expect(screen.queryByText('Sample Fund')).not.toBeInTheDocument();

    // 验证 localStorage 已重置为默认指数（6个）- 使用新的统一key
    const storedIndices = JSON.parse(localStorage.getItem('fund_all_indices_data') || '[]');
    expect(storedIndices.length).toBe(6);

    // 删除后 App 会使用默认指数（DEFAULT_INDICES 包含上证指数和纳斯达克100）
    // 所以管理按钮不会禁用
    expect(screen.getByRole('button', { name: '管理' })).not.toBeDisabled();
  });

  test('cancel exits manage mode without deleting selected items', async () => {
    localStorage.setItem('fund_portfolio', JSON.stringify([{ id: 'fund-1', symbol: '000001', name: 'Sample Fund', market: 'Fund' }]));
    localStorage.setItem('fund_indices_info', JSON.stringify([
      { symbol: '1.000001', name: '上证指数', current: 3200, change: 0, changePercent: 0, lastUpdated: '' },
      { symbol: '100.NDX', name: '纳斯达克100', current: 15000, change: 0, changePercent: 0, lastUpdated: '' }
    ]));
    resetIndexCache();

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
    expect(screen.getByText('纳斯达克100')).toBeInTheDocument();
  });

  test('shows pending deletion count only after items are selected', async () => {
    localStorage.setItem('fund_portfolio', JSON.stringify([{ id: 'fund-1', symbol: '000001', name: 'Sample Fund', market: 'Fund' }]));
    localStorage.setItem('fund_indices_info', JSON.stringify([
      { symbol: '1.000001', name: '上证指数', current: 3200, change: 0, changePercent: 0, lastUpdated: '' },
      { symbol: '100.NDX', name: '纳斯达克100', current: 15000, change: 0, changePercent: 0, lastUpdated: '' }
    ]));
    resetIndexCache();

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

    fireEvent.click(screen.getByLabelText('切换删除选择 纳斯达克100'));
    expect(screen.getByText('3个项目待删除')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('切换删除选择 纳斯达克100'));
    expect(screen.getByText('2个项目待删除')).toBeInTheDocument();
  });
});

