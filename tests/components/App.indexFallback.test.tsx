import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../../App';
import { MarketIndex } from '../../types';

jest.mock('../../components/MarketNewsTicker', () => ({
  MarketNewsTicker: () => <div data-testid="market-news-ticker" />,
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

jest.mock('../../components/InvestmentNoticeModal', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../components/InvestmentDraftModal', () => ({
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

describe('App index fallback rendering', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();

    localStorage.setItem('fund_indices_config', JSON.stringify(['1.000001', '0.399001']));
    localStorage.setItem('fund_global_indices_config', JSON.stringify(['100.NDX']));

    fetchFundDataMock.mockResolvedValue(null);
    forceFetchFundHistoryMock.mockResolvedValue([]);
  });

  test('keeps index cards visible with placeholder content when fetch fails', async () => {
    fetchMarketIndicesMock.mockRejectedValue(new Error('network error'));

    render(<App />);

    expect(screen.getByText('1.000001')).toBeInTheDocument();
    expect(screen.getByText('0.399001')).toBeInTheDocument();
    expect(screen.getByText('100.NDX')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText('等待更新').length).toBeGreaterThanOrEqual(3);
    });
  });

  test('keeps missing symbols as placeholders when API returns partial result', async () => {
    fetchMarketIndicesMock.mockImplementation(async (symbols: string[]) => {
      if (symbols.includes('1.000001')) {
        return [
          {
            symbol: '1.000001',
            name: '上证指数',
            current: 3333.12,
            change: 10.2,
            changePercent: 0.31,
            lastUpdated: '10:00:00',
          } as MarketIndex,
        ];
      }
      return [];
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('上证指数')).toBeInTheDocument();
    });

    expect(screen.getByText('1.000001')).toBeInTheDocument();
    expect(screen.getByText('0.399001')).toBeInTheDocument();
    expect(screen.getByText('100.NDX')).toBeInTheDocument();
    expect(screen.getAllByText('等待更新').length).toBeGreaterThanOrEqual(2);
  });
});

