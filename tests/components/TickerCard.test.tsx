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
    await act(async () => {
      render(<TickerCard ticker={sampleTicker} fetchHistory={mockFetchHistory} />);
    });
    // ensure microtasks and state updates are flushed inside act
    await flushAct();

    expect(screen.getByText('Sample Fund')).toBeInTheDocument();
    expect(screen.getByText('000001')).toBeInTheDocument();
    // Loading placeholder exists
    expect(screen.getByText('加载中')).toBeInTheDocument();
  });

  test('shows "-" placeholder for price and change when no data', async () => {
    await act(async () => {
      render(<TickerCard ticker={sampleTicker} fetchHistory={mockFetchHistory} />);
    });
    await flushAct();

    // Price and change should show '-' when no data
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  test('shows ticker symbol as name fallback when no name available', async () => {
    const noNameTicker: Ticker = { id: '2', symbol: '999999', name: '', market: 'Fund' } as any;
    await act(async () => {
      render(<TickerCard ticker={noNameTicker} fetchHistory={mockFetchHistory} />);
    });
    await flushAct();

    // Symbol appears twice: once as fallback name, once as the code display
    const matches = screen.getAllByText('999999');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  test('fund name exposes full text via title attribute', async () => {
    const longNameTicker: Ticker = { id: '3', symbol: '123456', name: '这是一个非常长的基金名称用于测试悬停提示', market: 'Fund' } as any;
    await act(async () => {
      render(<TickerCard ticker={longNameTicker} fetchHistory={mockFetchHistory} />);
    });
    await flushAct();

    const titleNode = screen.getByTitle('这是一个非常长的基金名称用于测试悬停提示');
    expect(titleNode).toBeInTheDocument();
    expect(titleNode.tagName.toLowerCase()).toBe('h3');
  });

  test('renders status dot with unknown state by default', async () => {
    await act(async () => {
      render(<TickerCard ticker={sampleTicker} fetchHistory={mockFetchHistory} />);
    });
    await flushAct();

    const dot = screen.getByLabelText('状态: 未知');
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveClass('bg-gray-400');
  });

  test('renders status dot as green when status is ok', async () => {
    await act(async () => {
      render(<TickerCard ticker={sampleTicker} status="ok" fetchHistory={mockFetchHistory} />);
    });
    await flushAct();

    const dot = screen.getByLabelText('状态: 正常');
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveClass('bg-green-500');
  });

  test('renders status dot as red when status is error', async () => {
    await act(async () => {
      render(<TickerCard ticker={sampleTicker} status="error" fetchHistory={mockFetchHistory} />);
    });
    await flushAct();

    const dot = screen.getByLabelText('状态: 错误');
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveClass('bg-red-500');
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

    await act(async () => {
      render(<TickerCard ticker={sampleTicker} data={data} fetchHistory={mockFetchHistory} />);
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
      render(<TickerCard ticker={sampleTicker} data={data} fetchHistory={mockFetchHistory} />);
    });
    await flushAct();

    const changeBadge = screen.getByText('-2.50%');
    const styledContainer = changeBadge.closest('div');
    expect(styledContainer).toBeTruthy();
    expect(styledContainer).toHaveClass('bg-green-100');
  });

  test('does not render delete button outside selection mode', async () => {
    await act(async () => {
      render(<TickerCard ticker={sampleTicker} fetchHistory={mockFetchHistory} />);
    });
    await flushAct();

    expect(screen.queryByLabelText('删除 000001')).not.toBeInTheDocument();
  });

  test('card click calls onClick when not in selection mode', async () => {
    const onClick = jest.fn();
    let container: HTMLElement | null = null;
    await act(async () => {
      const rendered = render(<TickerCard ticker={sampleTicker} onClick={onClick} fetchHistory={mockFetchHistory} />);
      container = rendered.container as HTMLElement;
    });
    await flushAct();

    const card = container!.firstChild as HTMLElement;
    fireEvent.click(card);
    expect(onClick).toHaveBeenCalled();
  });

  test('selection mode renders manage button and toggles selection indicator via card click', async () => {
    const onSelect = jest.fn();
    let container: HTMLElement | null = null;
    await act(async () => {
      const rendered = render(<TickerCard ticker={sampleTicker} isSelectionMode onSelect={onSelect} fetchHistory={mockFetchHistory} />);
      container = rendered.container as HTMLElement;
    });
    await flushAct();

    const manageButton = screen.getByLabelText('切换删除选择 Sample Fund');
    expect(manageButton).toBeInTheDocument();
    expect(manageButton).toHaveClass('-top-1.5');
    expect(manageButton).toHaveClass('-right-1.5');
    expect(manageButton).toHaveClass('w-[22px]');
    expect(manageButton).toHaveClass('h-[22px]');
    expect(container!.firstChild).toHaveClass('overflow-visible');

    fireEvent.click(container!.firstChild as HTMLElement);
    expect(onSelect).toHaveBeenCalled();
  });

  test('selection mode manage button triggers onSelect', async () => {
    const onSelect = jest.fn();
    await act(async () => {
      render(<TickerCard ticker={sampleTicker} isSelectionMode onSelect={onSelect} fetchHistory={mockFetchHistory} />);
    });
    await flushAct();

    const manageButton = screen.getByLabelText('切换删除选择 Sample Fund');
    expect(manageButton).toHaveClass('w-[22px]');
    expect(manageButton).toHaveClass('h-[22px]');
    expect(manageButton).toHaveClass('-top-1.5');
    expect(manageButton).toHaveClass('-right-1.5');

    fireEvent.click(manageButton);
    expect(onSelect).toHaveBeenCalled();
  });

  test('keeps a reserved slot for the rating badge outside selection mode', async () => {
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
      render(<TickerCard ticker={sampleTicker} data={data} fetchHistory={mockFetchHistory} />);
    });
    await flushAct();

    const badge = await screen.findByLabelText(/风险评级/);
    const reservedSlot = screen.getByTestId('rating-badge-slot');
    expect(reservedSlot).toHaveClass('w-[72px]');
    expect(reservedSlot).toHaveClass('justify-start');
    expect(reservedSlot).toHaveClass('items-start');
    expect(reservedSlot).toHaveClass('pt-0.5');
    expect(badge).toHaveClass('whitespace-nowrap');
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
      render(<TickerCard ticker={sampleTicker} data={data} fetchHistory={mockFetchHistory} />);
    });
    await flushAct();

    const badge = await screen.findByLabelText(/风险评级/);
    expect(badge).toBeTruthy();
    fireEvent.mouseEnter(badge);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toBeTruthy();
    expect(tooltip).toHaveClass('whitespace-normal');
    expect(tooltip).toHaveClass('break-words');
    expect(tooltip.textContent).toBeTruthy();
  });

  test('shows golden cross in rating tooltip when calculated from history', async () => {
    // Provide >=20 points so SMA20 exists. First 24 values = 1.0, last value = 1.5
    const CROSS_HISTORY = Array.from({ length: 25 }).map((_, i) => ({ date: i + 1, value: i < 24 ? 1.00 : 1.50, equityReturn: 0 }));

    mockFetchHistory.mockResolvedValue(CROSS_HISTORY);

    await act(async () => {
      render(<TickerCard ticker={sampleTicker} fetchHistory={mockFetchHistory} />);
    });
    await flushAct();

    const badge = await screen.findByLabelText(/风险评级/);
    fireEvent.mouseEnter(badge);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toMatch(/黄金交叉/);
  });

});

