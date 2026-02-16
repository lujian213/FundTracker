import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FundDetailsModal } from '../../components/FundDetailsModal';
import { fetchFundHistory } from '../../services/fundService';

jest.mock('../../services/fundService', () => ({ fetchFundHistory: jest.fn() }));

const SAMPLE_HISTORY = [
  { date: 1670000000000, value: 1.0, equityReturn: 0 },
  { date: 1670000001000, value: 1.01, equityReturn: 0 },
  { date: 1670000002000, value: 1.02, equityReturn: 0 }
];

const data = {
  symbol: 'TEST001',
  name: 'Test Fund',
  currentPrice: 1.02,
  previousPrice: 1.01,
  changePercentage: 0.99,
  lastUpdated: '2026-02-12 15:00',
  realtimeDate: '2026-02-12',
  netWorthDate: '2026-02-11',
  valuationDate: '2026-02-12',
  sourceUrl: 'https://example.com'
};

describe('position config persistence and UI', () => {
  beforeEach(() => {
    (fetchFundHistory as jest.Mock).mockResolvedValue(SAMPLE_HISTORY);
    localStorage.clear();
  });

  afterEach(() => jest.restoreAllMocks());

  test('by default no position displayed and modal can save/show values', async () => {
    render(<FundDetailsModal data={data as any} onClose={() => {}} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled());

    // initially should not show position because not configured
    expect(screen.queryByText(/满仓/)).toBeNull();

    // open config modal
    const gear = screen.getByLabelText(/配置仓位/);
    fireEvent.click(gear);

    const fullInput = await screen.findByLabelText('modal-full') as HTMLInputElement;
    const initialInput = await screen.findByLabelText('modal-initial') as HTMLInputElement;
    fireEvent.change(fullInput, { target: { value: '100' } });
    fireEvent.change(initialInput, { target: { value: '25' } });

    const saveBtn = screen.getByText('保存');
    fireEvent.click(saveBtn);

    // should show in header (unit: 份)
    await waitFor(() => expect(screen.getByText(/满仓份额/)).toBeTruthy());
    expect(screen.getByText(/100.00份/)).toBeTruthy();
    expect(screen.getByText(/初始份额/)).toBeTruthy();
    expect(screen.getByText(/25.00份/)).toBeTruthy();

    // localStorage should have key
    const key = `fund_position_${data.symbol}`;
    const raw = localStorage.getItem(key);
    expect(raw).toBeTruthy();
    const obj = JSON.parse(raw as string);
    expect(obj.fullCapacity).toBe(100);
    expect(obj.initialPosition).toBe(25);
  });

  test('invalid inputs show errors and keep modal open', async () => {
    render(<FundDetailsModal data={data as any} onClose={() => {}} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled());

    const gear = screen.getByLabelText(/配置仓位/);
    fireEvent.click(gear);

    const fullInput = await screen.findByLabelText('modal-full') as HTMLInputElement;
    const initialInput = screen.getByLabelText('modal-initial') as HTMLInputElement;

    // non-numeric full
    fireEvent.change(fullInput, { target: { value: 'abc' } });
    fireEvent.change(initialInput, { target: { value: '10' } });
    fireEvent.click(screen.getByText('保存'));

    // should display an error for full and keep modal open
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(/请输入有效的满仓额度/)).toBeTruthy();

    // now test initial > full
    fireEvent.change(fullInput, { target: { value: '5' } });
    fireEvent.change(initialInput, { target: { value: '10' } });
    fireEvent.click(screen.getByText('保存'));
    // match a flexible substring to avoid issues if the message is split/wrapped
    expect(await screen.findByText(/初始仓位/)).toBeTruthy();
    // modal should still be present
    expect(await screen.findByLabelText(/modal-full/)).toBeTruthy();
  });

  test('clear button removes persisted config and hides UI', async () => {
    // pre-populate storage
    const key = `fund_position_${data.symbol}`;
    localStorage.setItem(key, JSON.stringify({ fullCapacity: 50, initialPosition: 10 }));

    render(<FundDetailsModal data={data as any} onClose={() => {}} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled());

    // should show prepopulated values (unit: 份)
    expect(await screen.findByText(/满仓份额/)).toBeTruthy();
    expect(await screen.findByText(/50.00份/)).toBeTruthy();

    // open modal and click clear
    const gear = screen.getByLabelText(/配置仓位/);
    fireEvent.click(gear);

    const clearBtn = screen.getByText('清除');
    fireEvent.click(clearBtn);

    await waitFor(() => expect(screen.queryByText(/满仓/)).toBeNull());
    expect(localStorage.getItem(key)).toBeNull();
  });
});
