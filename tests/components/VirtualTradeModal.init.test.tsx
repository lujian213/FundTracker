import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../../utils/positionHelper', () => ({
  getUnitsForDate: jest.fn(),
}));

import VirtualTradeModal from '../../components/VirtualTradeModal';
import { getUnitsForDate } from '../../utils/positionHelper';

const mockedGetUnitsForDate = getUnitsForDate as jest.Mock;

describe('VirtualTradeModal initialization from localStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    mockedGetUnitsForDate.mockReset();
    mockedGetUnitsForDate.mockImplementation(async (_symbol: string, date: string) => {
      if (date === '2026-02-15') return 88888.88;
      return 131568.67;
    });
  });

  test('uses stored startDate and populates shares from getUnitsForDate', async () => {
    const symbol = '002611';
    const cfg = { fullCapacity: 200000, initialPosition: 131568.67, startDate: '2026-02-13', initialPrice: 3.4845 };
    localStorage.setItem(`fund_position_${symbol}`, JSON.stringify(cfg));

    const hist = [
      { date: new Date('2026-02-12').getTime(), value: 3.4, equityReturn: 0 },
      { date: new Date('2026-02-13').getTime(), value: 3.4845, equityReturn: 0 },
    ];

    render(<VirtualTradeModal symbol={symbol} fundName="Test Fund" history={hist} onClose={() => {}} />);

    await waitFor(() => {
      const dateInput = screen.getByLabelText(/开始日期/i) as HTMLInputElement;
      expect(dateInput).toHaveValue('2026-02-13');
    });

    await waitFor(() => {
      const sharesInput = screen.getByLabelText(/现有份额/i) as HTMLInputElement;
      expect(sharesInput.value.replace(/,/g, '')).toContain('131568.67');
    });
  });

  test('reset restores default start date, default shares, and default cash', async () => {
    const symbol = '002611';
    localStorage.setItem(`fund_position_${symbol}`, JSON.stringify({
      fullCapacity: 200000,
      initialPosition: 131568.67,
      startDate: '2026-02-13',
      initialPrice: 3.4845,
    }));

    const hist = [
      { date: new Date('2026-02-12').getTime(), value: 3.4, equityReturn: 0 },
      { date: new Date('2026-02-13').getTime(), value: 3.4845, equityReturn: 0 },
      { date: new Date('2026-02-15').getTime(), value: 3.6, equityReturn: 0 },
    ];

    render(<VirtualTradeModal symbol={symbol} fundName="Test Fund" history={hist} onClose={() => {}} />);

    const cashInput = screen.getByLabelText(/现有现金/i) as HTMLInputElement;
    const sharesInput = screen.getByLabelText(/现有份额/i) as HTMLInputElement;
    const dateInput = screen.getByLabelText(/开始日期/i) as HTMLInputElement;

    await waitFor(() => {
      expect(dateInput).toHaveValue('2026-02-13');
      expect(cashInput).toHaveValue('238,448.97');
      expect(sharesInput).toHaveValue('131,568.67');
    });

    fireEvent.change(cashInput, { target: { value: '12,345.00' } });
    fireEvent.change(sharesInput, { target: { value: '999.99' } });
    fireEvent.change(dateInput, { target: { value: '2026-02-15' } });

    expect(cashInput).toHaveValue('12,345.00');
    expect(sharesInput).toHaveValue('999.99');
    expect(dateInput).toHaveValue('2026-02-15');

    fireEvent.click(screen.getByRole('button', { name: '重置虚拟交易默认值' }));

    await waitFor(() => {
      expect(dateInput).toHaveValue('2026-02-13');
      expect(cashInput).toHaveValue('238,448.97');
      expect(sharesInput).toHaveValue('131,568.67');
    });

    await waitFor(() => {
      expect(mockedGetUnitsForDate).toHaveBeenCalledWith(symbol, '2026-02-13', 100000);
    });
  });
});
