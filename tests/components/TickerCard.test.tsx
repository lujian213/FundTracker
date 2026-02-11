import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TickerCard } from '../../components/TickerCard';
import { Ticker } from '../../types';

const sampleTicker: Ticker = { id: '1', symbol: '000001', name: 'Sample Fund', market: 'Fund' } as any;

describe('TickerCard', () => {
  test('renders ticker name and symbol and shows loading when no data', () => {
    const onRemove = jest.fn();
    render(<TickerCard ticker={sampleTicker} onRemove={onRemove} />);

    expect(screen.getByText('Sample Fund')).toBeInTheDocument();
    expect(screen.getByText('000001')).toBeInTheDocument();
    // Loading placeholder exists
    expect(screen.getByText('加载中')).toBeInTheDocument();
  });

  test('renders valuation data and change styles for positive change', () => {
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
    render(<TickerCard ticker={sampleTicker} data={data} onRemove={onRemove} />);

    expect(screen.getByText('1.2345')).toBeInTheDocument();
    expect(screen.getByText('+2.50%')).toBeInTheDocument();
    // Confirm net worth displayed
    expect(screen.getByText('确认净值:')).toBeInTheDocument();
    // Last updated exact string
    expect(screen.getByText('2026-02-11 10:00:00')).toBeInTheDocument();
  });

  test('applies negative change class when changePercentage < 0', () => {
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

    render(<TickerCard ticker={sampleTicker} data={data} onRemove={jest.fn()} />);
    const changeBadge = screen.getByText('-2.50%');
    // The change badge is nested; check the closest div ancestor that should carry styles
    const styledContainer = changeBadge.closest('div');
    expect(styledContainer).toBeTruthy();
    expect(styledContainer).toHaveClass('bg-green-100');
  });

  test('onRemove callback is called when remove button clicked', () => {
    const onRemove = jest.fn();
    render(<TickerCard ticker={sampleTicker} onRemove={onRemove} />);

    const btn = screen.getByLabelText('删除 000001');
    fireEvent.click(btn);
    expect(onRemove).toHaveBeenCalled();
  });

  test('card click calls onClick when not in selection mode', () => {
    const onClick = jest.fn();
    const onRemove = jest.fn();
    const { container } = render(<TickerCard ticker={sampleTicker} onRemove={onRemove} onClick={onClick} />);

    const card = container.firstChild as HTMLElement;
    fireEvent.click(card);
    expect(onClick).toHaveBeenCalled();
  });

  test('selection mode toggles selection indicator and onSelect is called', () => {
    const onSelect = jest.fn();
    const onRemove = jest.fn();
    const { container } = render(<TickerCard ticker={sampleTicker} onRemove={onRemove} isSelectionMode onSelect={onSelect} />);

    // When rendered in selection mode, checkbox area should be present
    const check = container.querySelector('.rounded-full');
    expect(check).toBeTruthy();

    // Click card should call onSelect
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onSelect).toHaveBeenCalled();
  });

});
