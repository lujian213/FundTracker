import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IndexDetailsModal } from '../../components/IndexDetailsModal';
import { fetchIndexIntradayKline, fetchIndexHistory } from '../../services/fundService';
import { MarketIndex } from '../../types';

jest.mock('../../services/fundService');
jest.mock('../../services/indexService', () => ({
  getIntraday: jest.fn().mockReturnValue([])
}));

const mockFetchIndexIntradayKline = fetchIndexIntradayKline as jest.MockedFunction<typeof fetchIndexIntradayKline>;

const mockIndexData: MarketIndex = {
  info: {
    symbol: '1.000001',
    name: '上证指数',
    current: 3150,
    change: 50,
    changePercent: 1.6,
    lastUpdated: '2026-06-26 15:00',
    previousClose: 3100,
  },
  intraday: [],
  history: [
    { date: Date.now() - 86400000, value: 3100, equityReturn: 0 },
  ],
};

describe('IndexDetailsModal kline period selector (history tab)', () => {
  beforeEach(() => {
    mockFetchIndexIntradayKline.mockClear();
    mockFetchIndexIntradayKline.mockResolvedValue([]);
  });

  it('should NOT show period selector dropdown in intraday tab', () => {
    render(<IndexDetailsModal data={mockIndexData} onClose={() => {}} />);
    // 默认在日内趋势图tab，验证下拉框不存在
    expect(screen.queryByRole('combobox')).toBeFalsy();
  });

  it('should show period selector dropdown in history tab', async () => {
    render(<IndexDetailsModal data={mockIndexData} onClose={() => {}} />);
    fireEvent.click(screen.getByText('历史趋势图'));
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeTruthy();
    });
  });

  it('should call fetchIndexIntradayKline when selecting 5min in history tab', async () => {
    render(<IndexDetailsModal data={mockIndexData} onClose={() => {}} />);
    fireEvent.click(screen.getByText('历史趋势图'));
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeTruthy();
    });
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '5min' } });
    await waitFor(() => {
      expect(mockFetchIndexIntradayKline).toHaveBeenCalledWith('1.000001', 5, 80, 3100);
    });
  });

  it('should show loading indicator when fetching kline in history tab', async () => {
    mockFetchIndexIntradayKline.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
    render(<IndexDetailsModal data={mockIndexData} onClose={() => {}} />);
    fireEvent.click(screen.getByText('历史趋势图'));
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeTruthy();
    });
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '5min' } });
    await waitFor(() => {
      expect(screen.getByText('加载中...')).toBeTruthy();
    });
  });

  it('should show error message when fetch fails in history tab', async () => {
    mockFetchIndexIntradayKline.mockRejectedValue(new Error('Network error'));
    render(<IndexDetailsModal data={mockIndexData} onClose={() => {}} />);
    fireEvent.click(screen.getByText('历史趋势图'));
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeTruthy();
    });
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '5min' } });
    await waitFor(() => {
      expect(screen.getByText(/获取K线数据失败|错误/)).toBeTruthy();
    });
  });

  it('should reset to realtime (日K) data when selecting realtime', async () => {
    render(<IndexDetailsModal data={mockIndexData} onClose={() => {}} />);
    fireEvent.click(screen.getByText('历史趋势图'));
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeTruthy();
    });
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '5min' } });
    await waitFor(() => expect(mockFetchIndexIntradayKline).toHaveBeenCalled());
    mockFetchIndexIntradayKline.mockClear();
    fireEvent.change(select, { target: { value: 'realtime' } });
    expect(mockFetchIndexIntradayKline).not.toHaveBeenCalled();
  });

  it('should show MA buttons in both realtime (日K) and minute K modes', async () => {
    render(<IndexDetailsModal data={mockIndexData} onClose={() => {}} />);
    fireEvent.click(screen.getByText('历史趋势图'));
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeTruthy();
    });
    // 日K模式下均线按钮应该显示
    expect(screen.getByText('MA5')).toBeTruthy();

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '5min' } });
    await waitFor(() => {
      // 分钟K模式下均线按钮也应该显示（需求变更）
      expect(screen.getByText('MA5')).toBeTruthy();
    });
  });
});