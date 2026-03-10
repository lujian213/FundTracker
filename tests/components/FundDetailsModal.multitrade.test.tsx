import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import '@testing-library/jest-dom';
import { toLocalDateKey } from '../../utils/priceResolver';

// no top-level module reset here — tests will reset modules in before/after hooks

const today = Date.now();
const sampleHistory = [
  { date: today - 3 * 24 * 3600 * 1000, value: 1.0, equityReturn: 0 },
  { date: today - 2 * 24 * 3600 * 1000, value: 1.01, equityReturn: 0 },
  { date: today, value: 1.02, equityReturn: 0 }, // include today's point so trades aggregate to a marker
];

// Prepare trades: two trades on same date for symbol 000001
const tradesPayload = {
  '000001': [
    { id: 't1', date: toLocalDateKey(new Date()), type: 'buy', shares: 10, price: 1.2, fee: 0 },
    { id: 't2', date: toLocalDateKey(new Date()), type: 'sell', shares: 5, price: 1.25, fee: 0 },
  ]
};

// Prepare valuation data for modal
const valuation = {
  symbol: '000001', name: '测试基金', currentPrice: 1.23, previousPrice: 1.2, changePercentage: 0, lastUpdated: new Date().toISOString(), realtimeDate: toLocalDateKey(new Date()), netWorthDate: toLocalDateKey(new Date()), valuationDate: new Date().toISOString(), sourceUrl: 'https://example.com'
};

describe('FundDetailsModal multi-trade aggregation', () => {
  beforeEach(() => {
    localStorage.clear();
    // write trades to localStorage key used by useTrades hook
    localStorage.setItem('fund_trades', JSON.stringify(tradesPayload));
    // write a small history so modal loads
    localStorage.setItem('fund_history_000001', JSON.stringify(sampleHistory));
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('aggregates multiple trades on same day into a single marker', async () => {
    // dynamic import the component after localStorage setup to ensure module sees stored data
    const mod = await import('../../components/FundDetailsModal');
    const FundDetailsModal = mod.FundDetailsModal || mod.default;
    const { container } = render(<FundDetailsModal data={valuation} onClose={() => {}} />);

    // switch to history tab using userEvent wrapped in act
    const historyBtn = await screen.findByRole('button', { name: /历史趋势图/ });
    await act(async () => { await userEvent.click(historyBtn); });

    // Wait for history chart to render its markers (data-testid starting with marker-circle-)
    await waitFor(() => {
      const markers = (container as HTMLElement).querySelectorAll('[data-testid^="marker-circle-"]');
      expect(markers.length).toBe(1);
    }, { timeout: 2000 });
  });
});
