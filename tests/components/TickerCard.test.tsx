import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { act } from 'react';
import { TickerCard } from '../../components/TickerCard';
import { Ticker } from '../../types';

const sampleTicker: Ticker = { id: '1', symbol: '000001', name: 'Sample Fund', market: 'Fund' } as any;

// Helper to flush pending microtasks inside act
async function flushAct() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('TickerCard', () => {
  let mockFetchHistory: jest.Mock;

  beforeEach(() => {
    mockFetchHistory = jest.fn().mockResolvedValue([{ date: 1, value: 1.0, equityReturn: 0 }]);
  });

  test('renders ticker name and symbol and shows loading when no data', async () => {
    const onRemove = jest.fn();
    await act(async () => {
      render(<TickerCard ticker={sampleTicker} onRemove={onRemove} fetchHistory={mockFetchHistory} />);
    });
    // ensure microtasks and state updates are flushed inside act
    await flushAct();

    expect(screen.getByText('Sample Fund')).toBeInTheDocument();
    expect(screen.getByText('000001')).toBeInTheDocument();
    // Loading placeholder exists
    expect(screen.getByText('加载中')).toBeInTheDocument();
  });

  test('renders valuation data and change styles for positive change', async () => {
    const data = {
      symbol: '000001',
      name: 'Sample Fund',
      currentPrice: 1.2345,
      previousPrice: 1.0000,
      changePercentage: 2.5,
      lastUpdated: '2026-02-11 10:00:00',
      realtimeDate: '2026-02-11',
      netWorthDate: '2026-02-10',
      valuationDate: '2026-02-11',
      sourceUrl: ''
    } as any;

    const onRemove = jest.fn();
    await act(async () => {
      render(<TickerCard ticker={sampleTicker} data={data} onRemove={onRemove} fetchHistory={mockFetchHistory} />);
    });
    await flushAct();

    expect(screen.getByText('1.2345')).toBeInTheDocument();
    expect(screen.getByText('+2.50%')).toBeInTheDocument();
    // Confirm net worth displayed
    expect(screen.getByText('确认净值:')).toBeInTheDocument();
    // Last updated exact string
    expect(screen.getByText('2026-02-11 10:00:00')).toBeInTheDocument();
  });

  test('applies negative change class when changePercentage < 0', async () => {
    const data = {
      symbol: '000001',
      name: 'Sample Fund',
      currentPrice: 1.2345,
      previousPrice: 1.0000,
      changePercentage: -2.5,
      lastUpdated: '2026-02-11 10:00:00',
      realtimeDate: '2026-02-11',
      netWorthDate: '2026-02-10',
      valuationDate: '2026-02-11',
      sourceUrl: ''
    } as any;

    await act(async () => {
      render(<TickerCard ticker={sampleTicker} data={data} onRemove={jest.fn()} fetchHistory={mockFetchHistory} />);
    });
    await flushAct();

    const changeBadge = screen.getByText('-2.50%');
    const styledContainer = changeBadge.closest('div');
    expect(styledContainer).toBeTruthy();
    expect(styledContainer).toHaveClass('bg-green-100');
  });

  test('onRemove callback is called when remove button clicked', async () => {
    const onRemove = jest.fn();
    await act(async () => {
      render(<TickerCard ticker={sampleTicker} onRemove={onRemove} fetchHistory={mockFetchHistory} />);
    });
    await flushAct();

    const btn = screen.getByLabelText('删除 000001');
    fireEvent.click(btn);
    expect(onRemove).toHaveBeenCalled();
  });

  test('card click calls onClick when not in selection mode', async () => {
    const onClick = jest.fn();
    const onRemove = jest.fn();
    let container: HTMLElement | null = null;
    await act(async () => {
      const rendered = render(<TickerCard ticker={sampleTicker} onRemove={onRemove} onClick={onClick} fetchHistory={mockFetchHistory} />);
      container = rendered.container as HTMLElement;
    });
    await flushAct();

    const card = container!.firstChild as HTMLElement;
    fireEvent.click(card);
    expect(onClick).toHaveBeenCalled();
  });

  test('selection mode toggles selection indicator and onSelect is called', async () => {
    const onSelect = jest.fn();
    const onRemove = jest.fn();
    let container: HTMLElement | null = null;
    await act(async () => {
      const rendered = render(<TickerCard ticker={sampleTicker} onRemove={onRemove} isSelectionMode onSelect={onSelect} fetchHistory={mockFetchHistory} />);
      container = rendered.container as HTMLElement;
    });
    await flushAct();

    const check = container!.querySelector('.rounded-full');
    expect(check).toBeTruthy();

    fireEvent.click(container!.firstChild as HTMLElement);
    expect(onSelect).toHaveBeenCalled();
  });

  test('shows rating badge and tooltip when data available', async () => {
    const data = {
      symbol: '000001',
      name: 'Sample Fund',
      currentPrice: 1.2345,
      previousPrice: 1.0000,
      changePercentage: 2.5,
      lastUpdated: '2026-02-11 10:00:00',
      realtimeDate: '2026-02-11',
      netWorthDate: '2026-02-10',
      valuationDate: '2026-02-11',
      sourceUrl: ''
    } as any;

    await act(async () => {
      render(<TickerCard ticker={sampleTicker} data={data} onRemove={jest.fn()} fetchHistory={mockFetchHistory} />);
    });
    await flushAct();

    const badge = await screen.findByLabelText(/风险评级/);
    expect(badge).toBeTruthy();
    fireEvent.mouseEnter(badge);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toBeTruthy();
    expect(tooltip.textContent).toBeTruthy();
  });

});
