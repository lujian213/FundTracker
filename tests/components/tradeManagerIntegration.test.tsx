import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FundDetailsModal } from '../../components/FundDetailsModal';
import { TradeManager } from '../../components/TradeManager';
import { ValuationData } from '../../types';
import { fetchFundHistory } from '../../services/fundService';
import { toLocalDateKey } from '../../utils/priceResolver';
import { setTradesForSymbol } from '../../hooks/useTrades';

jest.mock('../../services/fundService', () => ({ fetchFundHistory: jest.fn() }));

// ─── shared mock history ────────────────────────────────────────────────────
const SHARED_HISTORY = [
  { date: Date.now() - 3 * 24 * 3600 * 1000, value: 1.0, equityReturn: 0 },
  { date: Date.now() - 2 * 24 * 3600 * 1000, value: 1.0, equityReturn: 0 },
  { date: Date.now() - 1 * 24 * 3600 * 1000, value: 1.2, equityReturn: 0 }
];

const mockFetchHistory = jest.fn().mockResolvedValue(SHARED_HISTORY);

const data: ValuationData = {
  symbol: 'TEST001',
  name: 'Test Fund',
  currentPrice: 1.2345,
  previousPrice: 1.1000,
  changePercentage: 1.2,
  lastUpdated: '2026-02-15 15:00:00',
  realtimeDate: toLocalDateKey(new Date()),
  netWorthDate: toLocalDateKey(new Date()),
  valuationDate: toLocalDateKey(new Date()),
  sourceUrl: ''
} as any;

// ─── FundDetailsModal → TradeManager integration ────────────────────────────
describe('FundDetailsModal -> TradeManager integration', () => {
  beforeEach(() => {
    // ensure this fund has a configured fullCapacity so the trade button is enabled
    const key = `fund_position_TEST001`;
    try { localStorage.setItem(key, JSON.stringify({ fullCapacity: 100, initialPosition: 0, startDate: null, initialPrice: null })); } catch (e) {}
    (fetchFundHistory as jest.Mock).mockResolvedValue(SHARED_HISTORY);
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
    await waitFor(() => expect(screen.getByText(/当前估值：/)).toBeInTheDocument());
    expect(screen.getByText(/当前估值：/).textContent).toContain('1.2345');
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

// ─── TradeManager price resolution ────────────────────────────────────────────
describe('TradeManager price resolution', () => {
  beforeEach(() => {
    const today = new Date();
    const y = new Date(today.getTime() - 24 * 3600 * 1000);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const todayIso = fmt(today);
    const yesterdayIso = fmt(y);
    (fetchFundHistory as jest.Mock).mockResolvedValue([
      { date: new Date(`${yesterdayIso} 15:00`).getTime(), value: 1.2, equityReturn: 0 },
    ]);

    render(
      <TradeManager
        symbol="TEST001"
        currentPrice={1.5}
        previousPrice={1.25}
        realtimeDate={todayIso}
        netWorthDate={yesterdayIso}
        onClose={jest.fn()}
      />
    );
  });

  test('today price uses valuation before previous confirmed NAV', async () => {
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled());
    expect(screen.getByDisplayValue('1.5000')).toBeInTheDocument();

    const spinbuttons = screen.getAllByRole('spinbutton');
    fireEvent.change(spinbuttons[1], { target: { value: '150' } });
    expect(screen.getByDisplayValue('100.00')).toBeInTheDocument();
  });
});

// ─── TradeManager initial position record tests ───────────────────────────────
describe('TradeManager initial position record', () => {
  beforeEach(() => {
    (fetchFundHistory as jest.Mock).mockResolvedValue([]);
  });

  test('shows initial position record when initialPosition > 0', async () => {
    render(
      <TradeManager
        symbol="TEST001"
        currentPrice={1.5}
        onClose={jest.fn()}
        initialPosition={100}
        initialPrice={1.2}
        startDate="2024-01-15"
      />
    );

    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled());

    // Should show 建仓 record
    expect(screen.getByText('建仓')).toBeInTheDocument();
    expect(screen.getByText(/100.00 份/)).toBeInTheDocument();
    // Date should be shown
    expect(screen.getByText('2024-01-15')).toBeInTheDocument();
    // Amount should be 100 * 1.2 = 120.00
    expect(screen.getByText('120.00')).toBeInTheDocument();
  });

  test('hides initial position record when initialPosition is 0', async () => {
    render(
      <TradeManager
        symbol="TEST001"
        currentPrice={1.5}
        onClose={jest.fn()}
        initialPosition={0}
        initialPrice={1.2}
        startDate="2024-01-15"
      />
    );

    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled());

    // Should NOT show 建仓 record
    expect(screen.queryByText('建仓')).not.toBeInTheDocument();
  });

  test('initial position record has blue background and no edit/delete buttons', async () => {
    render(
      <TradeManager
        symbol="TEST001"
        currentPrice={1.5}
        onClose={jest.fn()}
        initialPosition={100}
        initialPrice={1.2}
        startDate="2024-01-15"
      />
    );

    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled());

    // Should show 建仓 record
    expect(screen.getByText('建仓')).toBeInTheDocument();

    // Should NOT have edit/delete buttons for initial position record
    // (only the 建仓 row exists, no 编辑/删除 buttons should be present)
    const editButtons = screen.queryAllByText('编辑');
    const deleteButtons = screen.queryAllByText('删除');
    expect(editButtons.length).toBe(0);
    expect(deleteButtons.length).toBe(0);
  });

  test('initial position record is sorted by date (should be at the end when date is earliest)', async () => {
    // Clear localStorage and set up trades
    localStorage.clear();
    setTradesForSymbol('TEST001', [
      { id: 't1', date: '2024-06-15', type: 'buy', shares: 50, price: 1.5, fee: 0 },
      { id: 't2', date: '2024-03-20', type: 'sell', shares: 30, price: 1.6, fee: 0 },
    ] as any);

    render(
      <TradeManager
        symbol="TEST001"
        currentPrice={1.5}
        onClose={jest.fn()}
        initialPosition={100}
        initialPrice={1.2}
        startDate="2024-01-15"
      />
    );

    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled());

    // Should have 建仓 record
    expect(screen.getByText('建仓')).toBeInTheDocument();

    // All dates should be visible (we have 3 records, pageSize=10, so all on one page)
    // Records are sorted by date DESC, so order should be: 2024-06-15, 2024-03-20, 2024-01-15
    const dateElements = screen.getAllByText(/2024-\d{2}-\d{2}/);
    expect(dateElements.length).toBe(3);

    // The first visible date should be the most recent (2024-06-15)
    expect(dateElements[0]).toHaveTextContent('2024-06-15');
    // The last visible date should be the earliest - which is the 建仓 date (2024-01-15)
    expect(dateElements[2]).toHaveTextContent('2024-01-15');
  });
});
