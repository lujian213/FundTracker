import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ValuationData } from '../../types';
import * as marketFundService from '../../services/marketFundService';

jest.mock('../../utils/positionHelper', () => ({
  getUnitsForDate: jest.fn(async () => 100),
}));

import VirtualTradeModal from '../../components/VirtualTradeModal';

const todayIso = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

const mkHistoryPoint = (date: string, value: number) => ({
  date: new Date(`${date}T00:00:00`).getTime(),
  value,
  equityReturn: 0,
});

describe('VirtualTradeModal real profit display', () => {
  beforeEach(() => {
    localStorage.clear();
    marketFundService.resetCache();
  });

  test('shows real profit and effective interval based on available history', async () => {
    const symbol = '002611';
    marketFundService.updatePosition(symbol, {
      fullCapacity: 0,
      initialPosition: 100,
      startDate: '2026-02-13',
      initialPrice: 1,
    });

    const history = [
      { date: new Date('2026-02-13T00:00:00').getTime(), value: 1.0, equityReturn: 0 },
      { date: new Date('2026-02-14T00:00:00').getTime(), value: 1.1, equityReturn: 0 },
    ];

    render(<VirtualTradeModal symbol={symbol} fundName="Test Fund" history={history} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/实盘盈亏：/)).toBeInTheDocument();
      expect(screen.getByText('10.00')).toBeInTheDocument();
      expect(screen.getByText('计算区间：2026-02-13 — 2026-02-14')).toBeInTheDocument();
    });
  });

  test('recomputes real profit when selected start date changes and ends at today valuation', async () => {
    const symbol = '002611';
    marketFundService.updatePosition(symbol, {
      fullCapacity: 0,
      initialPosition: 100,
      startDate: '2026-02-13',
      initialPrice: 1,
    });

    const history = [
      mkHistoryPoint('2026-02-13', 1.0),
      mkHistoryPoint('2026-02-14', 1.1),
      mkHistoryPoint('2026-02-15', 1.15),
    ];

    const valuation: ValuationData = {
      symbol,
      name: 'Test Fund',
      currentPrice: 1.05,
      previousPrice: 1.15,
      changePercentage: 0,
      lastUpdated: `${todayIso} 15:00`,
      realtimeDate: todayIso,
      netWorthDate: '2026-02-15',
      valuationDate: todayIso,
      sourceUrl: 'test',
    };

    render(<VirtualTradeModal symbol={symbol} fundName="Test Fund" history={history} valuation={valuation} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/实盘盈亏：/)).toHaveTextContent('实盘盈亏：5.00');
      expect(screen.getByText(`计算区间：2026-02-13 — ${todayIso}`)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('开始日期'), { target: { value: '2026-02-15' } });

    await waitFor(() => {
      expect(screen.getByText(/实盘盈亏：/)).toHaveTextContent('实盘盈亏：-10.00');
      expect(screen.getByText(`计算区间：2026-02-15 — ${todayIso}`)).toBeInTheDocument();
    });
  });

  test('uses today confirmed NAV when no intraday valuation is available', async () => {
    const symbol = '002612';
    marketFundService.updatePosition(symbol, {
      fullCapacity: 0,
      initialPosition: 100,
      startDate: '2026-02-13',
      initialPrice: 1,
    });

    const history = [
      mkHistoryPoint('2026-02-13', 1.0),
      mkHistoryPoint('2026-02-14', 1.1),
    ];

    const valuation: ValuationData = {
      symbol,
      name: 'Confirmed NAV Fund',
      currentPrice: 0,
      previousPrice: 1.2,
      changePercentage: 0,
      lastUpdated: `${todayIso} 15:00`,
      realtimeDate: todayIso,
      netWorthDate: todayIso,
      valuationDate: todayIso,
      sourceUrl: 'test',
    };

    render(<VirtualTradeModal symbol={symbol} fundName="Confirmed NAV Fund" history={history} valuation={valuation} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/实盘盈亏：/)).toHaveTextContent('实盘盈亏：20.00');
      expect(screen.getByText(`计算区间：2026-02-13 — ${todayIso}`)).toBeInTheDocument();
    });
  });
});
