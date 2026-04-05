import React from 'react';
import { render, screen } from '@testing-library/react';
import { IndexDetailsModal } from '../../components/IndexDetailsModal';
import * as cacheService from '../../services/cacheService';
import { MarketIndex } from '../../types';

jest.mock('../../services/fundService', () => ({ fetchIndexHistory: jest.fn().mockResolvedValue([]) }));

describe('IndexDetailsModal intraday tab', () => {
  const data: MarketIndex = {
    info: {
      symbol: 'IDX001',
      name: 'Test Index',
      current: 1234.5,
      change: 10,
      changePercent: 0.8,
      lastUpdated: '2026-03-09 10:05:00',
    },
    history: [],
  };

  beforeEach(() => { jest.resetAllMocks(); });

  test('renders intraday tab and chart when cache has points', async () => {
    jest.spyOn(cacheService, 'getIntradayPoints').mockReturnValue([{ timestamp: 1678320000000, value: 1234.5, equityReturn: 0.8 } as any]);
    const { container } = render(<IndexDetailsModal data={data} onClose={() => {}} />);
    // wait for tab to show (component does async load)
    await screen.findByText('日内趋势图');
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  test('shows placeholder when no intraday data', async () => {
    jest.spyOn(cacheService, 'getIntradayPoints').mockReturnValue([]);
    render(<IndexDetailsModal data={data} onClose={() => {}} />);
    await screen.findByText('日内趋势图');
    expect(screen.getByText(/暂无日内数据/)).toBeTruthy();
  });
});
