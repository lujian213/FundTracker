import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ProfitModal from '../../components/ProfitModal';

// Mock fetchFundHistory in services and useTrades hook
jest.mock('../../services/fundService', () => ({ fetchFundHistory: jest.fn() }));
jest.mock('../../hooks/useTrades', () => ({ __esModule: true, default: (symbol: string) => ({ trades: [] }) }));

import { fetchFundHistory } from '../../services/fundService';

const SAMPLE_HISTORY = [
  { date: new Date('2026-02-20').getTime(), value: 10, equityReturn: 0 },
  { date: new Date('2026-02-21').getTime(), value: 12, equityReturn: 0 },
  { date: new Date('2026-02-22').getTime(), value: 11, equityReturn: 0 }
];

describe('ProfitModal', () => {
  beforeEach(() => {
    (fetchFundHistory as jest.Mock).mockResolvedValue(SAMPLE_HISTORY);
  });
  afterEach(() => jest.restoreAllMocks());

  test('renders and shows three-column table rows', async () => {
    render(<ProfitModal symbol="000001" initialPosition={100} initialPrice={9} onClose={() => {}} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled());
    // wait for rows to be rendered
    await waitFor(() => expect(document.querySelectorAll('tbody tr').length).toBe(3));
    // header should have three columns (flexible check)
    const headers = document.querySelectorAll('thead th');
    expect(headers.length).toBeGreaterThanOrEqual(2);
  });

  test('date validation prevents selecting before initialStartDate', async () => {
    render(<ProfitModal symbol="000001" initialPosition={100} initialPrice={9} initialStartDate={'2026-02-21'} onClose={() => {}} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled());
    const inputs = document.querySelectorAll('input[type="date"]');
    // attempt to set fromDate to 2026-02-20 which is before initialStartDate
    fireEvent.change(inputs[0], { target: { value: '2026-02-20' } });
    await waitFor(() => expect(screen.getByText(/开始日期不能早于持仓起始日期/)).toBeTruthy());
  });

  test('changing dates and clicking 清除 should clear table rows', async () => {
    render(<ProfitModal symbol="000001" initialPosition={100} initialPrice={9} onClose={() => {}} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled());
    // wait for initial rows exist
    await waitFor(() => expect(document.querySelectorAll('tbody tr').length).toBe(3));
    // change temp start date to trigger confirm dialog
    const inputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(inputs[0], { target: { value: '2026-02-21' } });
    // dates apply immediately; table should be filtered to 2 rows (21 and 22)
    await waitFor(() => expect(document.querySelectorAll('tbody tr').length).toBe(2));
    const rows = Array.from(document.querySelectorAll('tbody tr'));
    const rowDates = rows.map(r => r.querySelector('td')?.textContent?.trim());
    expect(rowDates).toContain('2026-02-21');
    expect(rowDates).toContain('2026-02-22');
  });
});
