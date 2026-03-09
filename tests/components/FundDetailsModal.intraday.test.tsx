import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FundDetailsModal } from '../../components/FundDetailsModal';
import * as cacheService from '../../services/cacheService';
import { ValuationData } from '../../types';

jest.mock('../../services/fundService', () => ({ fetchFundHistory: jest.fn().mockResolvedValue([]) }));

describe('FundDetailsModal intraday tab', () => {
  const data: ValuationData = {
    symbol: 'TEST001',
    name: 'Test Fund',
    currentPrice: 1.2345,
    previousPrice: 1.1000,
    changePercentage: 1.2,
    lastUpdated: '2026-03-09 10:05:00',
    realtimeDate: '2026-03-09',
    netWorthDate: '2026-03-08',
    valuationDate: '2026-03-09',
    sourceUrl: '',
  } as any;

  beforeEach(() => { jest.resetAllMocks(); });

  test('renders intraday tab and chart when cache has points', async () => {
    jest.spyOn(cacheService, 'getIntradayPoints').mockReturnValue([{ timestamp: 1678320000000, value: 1.23, equityReturn: 0.5 } as any]);
    const { container } = render(<FundDetailsModal data={data} onClose={() => {}} />);
    // wait for tab button to appear after async history load
    await screen.findByText('日内趋势图');
    // activate intraday tab
    fireEvent.click(screen.getByText('日内趋势图'));
    // When points exist, placeholder should NOT be shown
    expect(screen.queryByText(/暂无日内数据/)).toBeNull();
  });

  test('shows placeholder when no intraday data', async () => {
    jest.spyOn(cacheService, 'getIntradayPoints').mockReturnValue([]);
    render(<FundDetailsModal data={data} onClose={() => {}} />);
    await screen.findByText('日内趋势图');
    fireEvent.click(screen.getByText('日内趋势图'));
    expect(screen.getByText(/暂无日内数据/)).toBeTruthy();
  });
});
