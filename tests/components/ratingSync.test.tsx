import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TickerCard } from '../../components/TickerCard';
import { FundDetailsModal } from '../../components/FundDetailsModal';
import { Ticker, ValuationData } from '../../types';

jest.mock('../../services/fundService', () => ({ fetchFundHistory: jest.fn() }));
import { fetchFundHistory } from '../../services/fundService';
import { toLocalDateKey } from '../../utils/priceResolver';

const sampleTicker: Ticker = { id: '1', symbol: '000001', name: 'Sample Fund', market: 'Fund' } as any;

const HISTORY = Array.from({ length: 25 }).map((_, i) => ({ date: 1670000000000 + i * 1000, value: i < 24 ? 1.0 : 1.5, equityReturn: 0 }));

const data: ValuationData = {
  symbol: '000001',
  name: 'Sample Fund',
  currentPrice: 1.5,
  previousPrice: 1.4,
  changePercentage: 1.0,
  lastUpdated: '2026-02-12 15:00',
  realtimeDate: toLocalDateKey(new Date(HISTORY[HISTORY.length - 1].date)),
  netWorthDate: '2026-02-11',
  valuationDate: '2026-02-12',
  sourceUrl: ''
};

describe('rating sync between TickerCard and FundDetailsModal', () => {
  beforeEach(() => {
    (fetchFundHistory as jest.Mock).mockResolvedValue(HISTORY);
  });
  afterEach(() => jest.restoreAllMocks());

  test('Tooltip content is identical for TickerCard and FundDetailsModal when given same data', async () => {
    // Render TickerCard first
    const { unmount } = render(<TickerCard ticker={sampleTicker} data={data} fetchHistory={(fetchFundHistory as jest.Mock)} />);
    // Wait for badge
    const badgeCard = await screen.findByLabelText(/风险评级/);
    expect(badgeCard).toHaveClass('whitespace-nowrap');
    fireEvent.mouseEnter(badgeCard);
    const tooltipCard = await screen.findByRole('tooltip');
    const textCard = tooltipCard.textContent;

    // Unmount the TickerCard before rendering FundDetailsModal to avoid duplicate aria-labels
    unmount();

    render(<FundDetailsModal data={data} onClose={() => {}} fetchHistory={(fetchFundHistory as jest.Mock)} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled());
    const badgeModal = await screen.findByLabelText(/风险评级/);
    fireEvent.mouseEnter(badgeModal);
    const tooltipModal = await screen.findByRole('tooltip');
    const textModal = tooltipModal.textContent;

    expect(textCard).toBeTruthy();
    expect(textModal).toBeTruthy();
    expect(textCard).toBe(textModal);
  });
});
