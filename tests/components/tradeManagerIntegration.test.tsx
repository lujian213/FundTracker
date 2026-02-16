import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FundDetailsModal } from '../../components/FundDetailsModal';
import { ValuationData } from '../../types';

describe('FundDetailsModal -> TradeManager integration', () => {
  const mockFetchHistory = jest.fn().mockResolvedValue([
    { date: Date.now() - 3 * 24 * 3600 * 1000, value: 1.0, equityReturn: 0 },
    { date: Date.now() - 2 * 24 * 3600 * 1000, value: 1.0, equityReturn: 0 },
    { date: Date.now() - 1 * 24 * 3600 * 1000, value: 1.2, equityReturn: 0 }
  ]);

  const data: ValuationData = {
    symbol: 'TEST001',
    name: 'Test Fund',
    currentPrice: 1.2345,
    previousPrice: 1.1000,
    changePercentage: 1.2,
    lastUpdated: '2026-02-15 15:00:00',
    realtimeDate: new Date().toISOString().split('T')[0],
    netWorthDate: new Date().toISOString().split('T')[0],
    valuationDate: new Date().toISOString().split('T')[0],
    sourceUrl: ''
  } as any;

  test('clicking trade button opens TradeManager', async () => {
    const onClose = jest.fn();

    render(<FundDetailsModal data={data} onClose={onClose} fetchHistory={mockFetchHistory} />);

    // wait for history to load and component to settle
    await waitFor(() => expect(mockFetchHistory).toHaveBeenCalledWith('TEST001'));

    const btn = screen.getByLabelText('交易管理');
    expect(btn).toBeInTheDocument();

    fireEvent.click(btn);

    // TradeManager shows current price label
    await waitFor(() => expect(screen.getByText(/当前净值：/)).toBeInTheDocument());
    expect(screen.getByText(/当前净值：/).textContent).toContain('1.2345');
  });
});

