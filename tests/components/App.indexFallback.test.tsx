import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../../App';
import { MarketIndex } from '../../types';
import { resetCache as resetIndexCache } from '../../services/indexService';

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
  normalizeIndexSymbol: (symbol: string) => symbol,
}));

describe('App index fallback rendering', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();

    // 使用新的统一存储格式
    localStorage.setItem('fund_indices_info', JSON.stringify([
      { symbol: '1.000001', name: '上证指数', current: 0, change: 0, changePercent: 0, lastUpdated: '' },
      { symbol: '0.399001', name: '深证成指', current: 0, change: 0, changePercent: 0, lastUpdated: '' },
      { symbol: '100.NDX', name: '纳斯达克100', current: 0, change: 0, changePercent: 0, lastUpdated: '' },
    ]));

    resetIndexCache(); // 重新加载 indexService 缓存（必须在 localStorage 设置之后）

    fetchFundDataMock.mockResolvedValue(null);
    forceFetchFundHistoryMock.mockResolvedValue([]);
  });

  test('keeps index cards visible with placeholder content when fetch fails', async () => {
    fetchMarketIndicesMock.mockRejectedValue(new Error('network error'));

    render(<App />);

    // 指数卡片仍然显示，即使 API 失败
    expect(screen.getByText('1.000001')).toBeInTheDocument();
    expect(screen.getByText('0.399001')).toBeInTheDocument();
    expect(screen.getByText('100.NDX')).toBeInTheDocument();

    // 由于 lastUpdated 为空，显示的是空时间或初始状态
    // 验证指数名称显示（初始 localStorage 中的 name 为空，会使用 INDEX_NAME_MAP）
    await waitFor(() => {
      expect(screen.getByText('上证指数')).toBeInTheDocument();
      expect(screen.getByText('深证成指')).toBeInTheDocument();
      expect(screen.getByText('纳斯达克100')).toBeInTheDocument();
    });
  });

  test('keeps missing symbols as placeholders when API returns partial result', async () => {
    fetchMarketIndicesMock.mockImplementation(async (symbols: string[]) => {
      if (symbols.includes('1.000001')) {
        return [
          {
            info: {
              symbol: '1.000001',
              name: '上证指数',
              current: 3333.12,
              change: 10.2,
              changePercent: 0.31,
              lastUpdated: '10:00:00',
            },
            history: [],
          } as MarketIndex,
        ];
      }
      return [];
    });

    render(<App />);

    // 等待成功获取的指数显示
    await waitFor(() => {
      expect(screen.getByText('上证指数')).toBeInTheDocument();
    });

    // 验证所有指数符号显示
    expect(screen.getByText('1.000001')).toBeInTheDocument();
    expect(screen.getByText('0.399001')).toBeInTheDocument();
    expect(screen.getByText('100.NDX')).toBeInTheDocument();

    // 对于 API 未返回的指数，使用 INDEX_NAME_MAP 中的名称显示
    expect(screen.getByText('深证成指')).toBeInTheDocument();
    expect(screen.getByText('纳斯达克100')).toBeInTheDocument();
  });
});

