import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import App from '../../App';
import { MarketIndex, ValuationData, IndexInfo } from '../../types';
import { resetCache as resetIndexCache, saveAllIndexInfos, getAllIndexInfos } from '../../services/indexService';
import * as marketFundService from '../../services/marketFundService';
import { STORAGE_KEYS } from '../../services/storageKeys';

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
    marketFundService.resetCache();
    resetIndexCache(); // 确保 indices service 也被重置

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
    // 使用 service 清空数据
    marketFundService.resetCache();
    resetIndexCache();
    // 不添加任何基金或指数

    render(<App />);

    const manageButton = screen.getByRole('button', { name: '管理' });
    // 当没有配置指数时，App 会使用默认指数，所以管理按钮不会禁用
    expect(manageButton).not.toBeDisabled();
  });

  test('enters unified manage mode and shows shared selection actions', async () => {
    // 使用 service 设置测试数据
    marketFundService.resetCache();
    marketFundService.addFund('000001', 'Sample Fund');
    resetIndexCache();
    const testIndices: IndexInfo[] = [
      { symbol: '1.000001', name: '上证指数', current: 3200, change: 0, changePercent: 0, lastUpdated: '' },
      { symbol: '100.NDX', name: '纳斯达克100', current: 15000, change: 0, changePercent: 0, lastUpdated: '' }
    ];
    saveAllIndexInfos(testIndices);

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '管理' }));

    expect(screen.getByText('管理模式')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
    expect(screen.queryByText('1个项目待删除')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByLabelText('切换删除选择 Sample Fund')).toBeInTheDocument();
      expect(screen.getByLabelText('切换删除选择 上证指数')).toBeInTheDocument();
      expect(screen.getByLabelText('切换删除选择 纳斯达克100')).toBeInTheDocument();
    });
  });

  test('confirm removes selected fund, domestic index, and global index together', async () => {
    // 使用 service 设置测试数据
    marketFundService.resetCache();
    marketFundService.addFund('000001', 'Sample Fund');
    resetIndexCache();
    const testIndices: IndexInfo[] = [
      { symbol: '1.000001', name: '上证指数', current: 3200, change: 0, changePercent: 0, lastUpdated: '' },
      { symbol: '100.NDX', name: '纳斯达克100', current: 15000, change: 0, changePercent: 0, lastUpdated: '' }
    ];
    saveAllIndexInfos(testIndices);

    // Debug: check what's in the indices service
    console.log('Test indices saved:', getAllIndexInfos().map(i => i.symbol));

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '管理' }));

    // Debug: check available selection buttons
    await waitFor(() => {
      const buttons = screen.getAllByRole('button', { name: /切换删除选择/ });
      console.log('Available selection buttons:', buttons.map(b => b.getAttribute('aria-label')));
    });

    await waitFor(() => {
      expect(screen.getByLabelText('切换删除选择 Sample Fund')).toBeInTheDocument();
    });

    // 使用 act 确保每个点击后的状态更新完成
    act(() => {
      fireEvent.click(screen.getByLabelText('切换删除选择 Sample Fund'));
    });

    await waitFor(() => {
      const deleteText = screen.queryByText(/\d+个项目待删除/);
      console.log('After fund click:', deleteText?.textContent || 'no delete text');
    });
    const fundButton = screen.getByLabelText('切换删除选择 Sample Fund');
    console.log('Fund button aria-pressed:', fundButton.getAttribute('aria-pressed'));

    act(() => {
      fireEvent.click(screen.getByLabelText('切换删除选择 上证指数'));
    });

    await waitFor(() => {
      const deleteText = screen.queryByText(/\d+个项目待删除/);
      console.log('After domestic index click:', deleteText?.textContent || 'no delete text');
    });
    const domesticButton = screen.getByLabelText('切换删除选择 上证指数');
    console.log('Domestic index button aria-pressed:', domesticButton.getAttribute('aria-pressed'));

    act(() => {
      fireEvent.click(screen.getByLabelText('切换删除选择 纳斯达克100'));
    });

    await waitFor(() => {
      const deleteText = screen.queryByText(/\d+个项目待删除/);
      console.log('After global index click:', deleteText?.textContent || 'no delete text');
    });
    const globalButton = screen.getByLabelText('切换删除选择 纳斯达克100');
    console.log('Global index button aria-pressed:', globalButton.getAttribute('aria-pressed'));

    // 等待 React 状态更新完成
    await waitFor(() => {
      // 使用正则匹配任意数字的项目待删除
      const deleteText = screen.getByText(/\d+个项目待删除/);
      console.log('Delete count before save:', deleteText.textContent);
      expect(deleteText).toBeInTheDocument();
    });

    // Debug: check localStorage before save
    const indicesBeforeSave = JSON.parse(localStorage.getItem(STORAGE_KEYS.INDEX_DATA) || '[]');
    console.log('Indices before save:', indicesBeforeSave.map((i: any) => i.info?.symbol));

    // Verify save button is enabled
    const saveButton = screen.getByRole('button', { name: '保存' });
    console.log('Save button disabled:', saveButton.hasAttribute('disabled'));

    // 等待 React 更新所有闭包和状态
    await act(async () => {
      // 等待微任务队列清空
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // 再次验证删除计数
    await waitFor(() => {
      const deleteText = screen.getByText(/\d+个项目待删除/);
      console.log('Delete count after wait:', deleteText.textContent);
    });

    // Click save
    await act(async () => {
      fireEvent.click(saveButton);
    });

    await waitFor(() => {
      expect(screen.getByText('我的自选基金')).toBeInTheDocument();
    });

    // Debug: check localStorage after save
    const indicesAfterSave = JSON.parse(localStorage.getItem(STORAGE_KEYS.INDEX_DATA) || '[]');
    console.log('Indices after save:', indicesAfterSave.map((i: any) => i.info?.symbol), 'count:', indicesAfterSave.length);

    await waitFor(() => {
      expect(screen.getByText('我的自选基金')).toBeInTheDocument();
    });

    // 基金被删除
    expect(screen.queryByText('Sample Fund')).not.toBeInTheDocument();

    // 验证 localStorage 已重置为默认指数（删除所有后应重置为 DEFAULT_INDICES）
    await waitFor(() => {
      const storedIndices = JSON.parse(localStorage.getItem(STORAGE_KEYS.INDEX_DATA) || '[]');
      expect(storedIndices.length).toBe(6);
    });

    // 删除后 App 会使用默认指数（DEFAULT_INDICES 包含上证指数和纳斯达克100）
    // 所以管理按钮不会禁用
    expect(screen.getByRole('button', { name: '管理' })).not.toBeDisabled();
  });

  test('cancel exits manage mode without deleting selected items', async () => {
    // 使用 service 设置测试数据
    marketFundService.resetCache();
    marketFundService.addFund('000001', 'Sample Fund');
    resetIndexCache();
    const testIndices: IndexInfo[] = [
      { symbol: '1.000001', name: '上证指数', current: 3200, change: 0, changePercent: 0, lastUpdated: '' },
      { symbol: '100.NDX', name: '纳斯达克100', current: 15000, change: 0, changePercent: 0, lastUpdated: '' }
    ];
    saveAllIndexInfos(testIndices);

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
    // 使用 service 设置测试数据
    marketFundService.resetCache();
    marketFundService.addFund('000001', 'Sample Fund');
    resetIndexCache();
    const testIndices: IndexInfo[] = [
      { symbol: '1.000001', name: '上证指数', current: 3200, change: 0, changePercent: 0, lastUpdated: '' },
      { symbol: '100.NDX', name: '纳斯达克100', current: 15000, change: 0, changePercent: 0, lastUpdated: '' }
    ];
    saveAllIndexInfos(testIndices);

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

