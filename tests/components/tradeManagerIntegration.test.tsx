import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FundDetailsModal } from '../../components/FundDetailsModal';
import { TradeManager } from '../../components/TradeManager';
import { ValuationData } from '../../types';

// ─── shared mock history ────────────────────────────────────────────────────
const mockFetchHistory = jest.fn().mockResolvedValue([
  { date: Date.now() - 3 * 24 * 3600 * 1000, value: 1.0, equityReturn: 0 },
  { date: Date.now() - 2 * 24 * 3600 * 1000, value: 1.0, equityReturn: 0 },
  { date: Date.now() - 1 * 24 * 3600 * 1000, value: 1.2, equityReturn: 0 }
]);

const data: ValuationData = {
  symbol: 'TEST001',
  name: 'Test Fund',
  currentPrice: 1.2345,
  previousPrice: 1.1000,
  changePercentage: 1.2,
  lastUpdated: '2026-02-15 15:00:00',
  realtimeDate: new Date().toISOString().split('T')[0],
  netWorthDate: new Date().toISOString().split('T')[0],
  valuationDate: new Date().toISOString().split('T')[0],
  sourceUrl: ''
} as any;

// ─── FundDetailsModal → TradeManager integration ────────────────────────────
describe('FundDetailsModal -> TradeManager integration', () => {
  beforeEach(() => {
    // ensure this fund has a configured fullCapacity so the trade button is enabled
    const key = `fund_position_TEST001`;
    try { localStorage.setItem(key, JSON.stringify({ fullCapacity: 100, initialPosition: 0, startDate: null, initialPrice: null })); } catch (e) {}
  });

  test('clicking trade button opens TradeManager', async () => {
    const onClose = jest.fn();

    render(<FundDetailsModal data={data} onClose={onClose} fetchHistory={mockFetchHistory} />);

    // wait for history to load and component to settle
    await waitFor(() => expect(mockFetchHistory).toHaveBeenCalledWith('TEST001'));

    const btn = screen.getByLabelText('交易管理');
    expect(btn).toBeInTheDocument();

    fireEvent.click(btn);

    // TradeManager shows current price label
    await waitFor(() => expect(screen.getByText(/当前净值：/)).toBeInTheDocument());
    expect(screen.getByText(/当前净值：/).textContent).toContain('1.2345');
  });
});

// ─── TradeManager buy/sell field mode tests ──────────────────────────────────
describe('TradeManager buy/sell input mode', () => {
  const renderTM = () =>
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);

  test('buy mode (default): 总额 is editable, 份额（只读）is readonly', () => {
    renderTM();

    // 份额 label should say 份额（只读）
    expect(screen.getByText('份额（只读）')).toBeInTheDocument();
    // 总额 label should be plain 总额 (editable)
    expect(screen.getByText('总额')).toBeInTheDocument();

    // The shares field should be readonly (bg-gray-50 input)
    const sharesInput = screen.getByDisplayValue('0.00');
    expect(sharesInput).toHaveAttribute('readOnly');

    // The total input should NOT be readonly — verify via spinbutton count
    const numberInputs = screen.getAllByRole('spinbutton');
    // In buy mode there should be a number input for 总额 and 手续费 (not 份额)
    expect(numberInputs.length).toBeGreaterThanOrEqual(2);
  });

  test('sell mode: 份额 is editable, 总额（只读）is readonly', () => {
    renderTM();

    // Switch to sell
    const typeSelect = screen.getByRole('combobox');
    fireEvent.change(typeSelect, { target: { value: 'sell' } });

    expect(screen.getByText('份额')).toBeInTheDocument();
    expect(screen.getByText('总额（只读）')).toBeInTheDocument();

    // Total field should be readonly
    const totalInput = screen.getByDisplayValue('0.00');
    expect(totalInput).toHaveAttribute('readOnly');
  });

  test('switching type resets shares and total to 0', () => {
    renderTM();

    // In buy mode: spinbuttons order is [0]=手续费, [1]=总额
    const spinbuttons = screen.getAllByRole('spinbutton');
    // Change 总额 to 100
    fireEvent.change(spinbuttons[1], { target: { value: '100' } });

    // Switch to sell
    const typeSelect = screen.getByRole('combobox');
    fireEvent.change(typeSelect, { target: { value: 'sell' } });

    // After switch: shares field (now spinbutton [0]) should be reset to 0
    const sharesAfter = screen.getAllByRole('spinbutton')[0];
    expect(sharesAfter).toHaveValue(0);
  });

  test('buy mode: 份额（只读）shows computed value from 总额, 价格, 手续费', () => {
    // Use currentPrice=2.0 to make math easy
    render(<TradeManager symbol="TEST001" currentPrice={2.0} onClose={jest.fn()} />);

    // DOM order of spinbuttons in buy mode: [0]=手续费, [1]=总额
    // (手续费 is in the second grid, 总额 is last in second grid)
    const spinbuttons = screen.getAllByRole('spinbutton');
    // Set 总额 = 200, fee stays 0 → shares = (200 - 0) / 2.0 = 100.00
    const totalInput = spinbuttons[1]; // 总额
    fireEvent.change(totalInput, { target: { value: '200' } });

    // The readonly shares field: displayPrice falls back to currentPrice=2.0
    // shares = (200 - 0) / 2.0 = 100.00
    expect(screen.getByDisplayValue('100.00')).toBeInTheDocument();
  });

  test('sell mode: 总额（只读）shows computed value from 份额, 价格, 手续费', () => {
    render(<TradeManager symbol="TEST001" currentPrice={2.0} onClose={jest.fn()} />);

    // Switch to sell
    const typeSelect = screen.getByRole('combobox');
    fireEvent.change(typeSelect, { target: { value: 'sell' } });

    // DOM order in sell mode: [0]=份额, [1]=手续费
    // Set shares = 50, fee = 0 → total = 50 * 2.0 - 0 = 100.00
    const spinbuttons = screen.getAllByRole('spinbutton');
    const sharesInput = spinbuttons[0]; // 份额
    fireEvent.change(sharesInput, { target: { value: '50' } });

    expect(screen.getByDisplayValue('100.00')).toBeInTheDocument();
  });
});
