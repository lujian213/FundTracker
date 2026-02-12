import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FundDetailsModal } from '../../components/FundDetailsModal';
import { ValuationData } from '../../types';

// Mock fetchFundHistory
jest.mock('../../services/fundService', () => ({
  fetchFundHistory: jest.fn()
}));

import { fetchFundHistory } from '../../services/fundService';

// Provide HistoricalPoint[] with date, value, equityReturn (at least 10 points for SMA10)
const SAMPLE_HISTORY = [
  { date: 1670000000000, value: 1.00, equityReturn: 0.00 },
  { date: 1670000001000, value: 1.01, equityReturn: 0.01 },
  { date: 1670000002000, value: 1.02, equityReturn: 0.01 },
  { date: 1670000003000, value: 1.03, equityReturn: 0.01 },
  { date: 1670000004000, value: 1.04, equityReturn: 0.01 },
  { date: 1670000005000, value: 1.05, equityReturn: 0.01 },
  { date: 1670000006000, value: 1.06, equityReturn: 0.01 },
  { date: 1670000007000, value: 1.07, equityReturn: 0.01 },
  { date: 1670000008000, value: 1.08, equityReturn: 0.01 },
  { date: 1670000009000, value: 1.09, equityReturn: 0.01 },
  { date: 1670000010000, value: 1.10, equityReturn: 0.01 },
  { date: 1670000011000, value: 1.11, equityReturn: 0.01 }
];

describe('FundDetailsModal SMA behavior', () => {
  const data: ValuationData = {
    symbol: '000001',
    name: 'Sample Fund',
    currentPrice: 1.11,
    previousPrice: 1.10,
    changePercentage: 0.96,
    lastUpdated: '2026-02-12 15:00',
    realtimeDate: '2026-02-12',
    netWorthDate: '2026-02-11',
    valuationDate: '2026-02-12',
    sourceUrl: 'https://example.com'
  };

  beforeEach(() => {
    (fetchFundHistory as jest.Mock).mockResolvedValue(SAMPLE_HISTORY);
  });

  afterEach(() => jest.restoreAllMocks());

  test('renders SMA5 by default and toggles work', async () => {
    render(<FundDetailsModal data={data} onClose={() => {}} />);

    // wait for fetch and render
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled());

    // SMA5 path should be present (stroke color #2563eb)
    const svg = document.querySelector('svg');
    expect(svg).toBeTruthy();

    // There should be a path with stroke '#2563eb' when SMA5 visible
    const paths = svg!.querySelectorAll('path');
    let foundSMA = false;
    paths.forEach(p => { if (p.getAttribute('stroke') === '#2563eb') foundSMA = true; });
    expect(foundSMA).toBe(true);

    // click 5 toggle to hide
    const btn5 = screen.getByRole('button', { name: /5/ });
    fireEvent.click(btn5);

    // now SMA5 path should not be present
    const pathsAfter = svg!.querySelectorAll('path');
    let foundAfter = false;
    pathsAfter.forEach(p => { if (p.getAttribute('stroke') === '#2563eb') foundAfter = true; });
    expect(foundAfter).toBe(false);
  });

  test('rating tooltip shows reasons', async () => {
    render(<FundDetailsModal data={data} onClose={() => {}} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled());

    const badge = screen.getByLabelText(/风险评级/);
    fireEvent.mouseEnter(badge);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toBeTruthy();
    // tooltip should include at least one reason string
    expect(tooltip.textContent).toBeTruthy();
  });
});
