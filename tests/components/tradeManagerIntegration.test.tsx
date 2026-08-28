import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FundDetailsModal } from '../../components/FundDetailsModal';
import { TradeManager } from '../../components/TradeManager';
import { ValuationData } from '../../types';
import { fetchFundHistory } from '../../services/fundService';
import { toLocalDateKey } from '../../utils/priceResolver';
import { setTradesForSymbol } from '../../hooks/useTrades';
import { resetCache as resetMarketFundCache, updatePosition } from '../../services/marketFundService';

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
    localStorage.clear();
    resetMarketFundCache();
    updatePosition('TEST001', { fullCapacity: 100, initialPosition: 0, startDate: null, initialPrice: null });
    (fetchFundHistory as jest.Mock).mockResolvedValue(SHARED_HISTORY);
  });

  test('clicking trade button opens TradeManager', async () => {
    const onClose = jest.fn();
    render(<FundDetailsModal data={data} onClose={onClose} fetchHistory={mockFetchHistory} />);

    await waitFor(() => expect(mockFetchHistory).toHaveBeenCalledWith('TEST001'), { timeout: 1000 });

    fireEvent.click(screen.getByLabelText('交易管理'));
    await waitFor(() => expect(screen.getByText(/当前估值：/)).toBeInTheDocument(), { timeout: 1000 });
    expect(screen.getByText(/当前估值：/).textContent).toContain('1.2345');
  });
});

// ─── TradeManager buy/sell field mode tests ──────────────────────────────────
describe('TradeManager buy/sell input mode', () => {
  const renderTM = (price = 1.5) =>
    render(<TradeManager symbol="TEST001" currentPrice={price} onClose={jest.fn()} />);

  beforeEach(() => {
    (fetchFundHistory as jest.Mock).mockResolvedValue([]);
  });

  test('buy mode: 总额 editable, 份额 readonly', () => {
    renderTM();
    expect(screen.getByText('份额（只读）')).toBeInTheDocument();
    expect(screen.getByText('总额')).toBeInTheDocument();
    expect(screen.getByDisplayValue('0.00')).toHaveAttribute('readOnly');
    expect(screen.getAllByRole('spinbutton').length).toBeGreaterThanOrEqual(2);
  });

  test('sell mode: 份额 editable, 总额 readonly', () => {
    renderTM();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sell' } });
    expect(screen.getByText('份额')).toBeInTheDocument();
    expect(screen.getByText('总额（只读）')).toBeInTheDocument();
    expect(screen.getByDisplayValue('0.00')).toHaveAttribute('readOnly');
  });

  test('switching type resets values', () => {
    renderTM();
    const spinbuttons = screen.getAllByRole('spinbutton');
    fireEvent.change(spinbuttons[1], { target: { value: '100' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sell' } });
    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(0);
  });

  test('buy mode computes shares from total', () => {
    render(<TradeManager symbol="TEST001" currentPrice={2.0} onClose={jest.fn()} />);
    fireEvent.change(screen.getAllByRole('spinbutton')[1], { target: { value: '200' } });
    expect(screen.getByDisplayValue('100.00')).toBeInTheDocument();
  });

  test('sell mode computes total from shares', () => {
    render(<TradeManager symbol="TEST001" currentPrice={2.0} onClose={jest.fn()} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sell' } });
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '50' } });
    expect(screen.getByDisplayValue('100.00')).toBeInTheDocument();
  });
});

// ─── TradeManager price resolution ────────────────────────────────────────────
describe('TradeManager price resolution', () => {
  beforeEach(() => {
    const today = new Date();
    const y = new Date(today.getTime() - 24 * 3600 * 1000);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    (fetchFundHistory as jest.Mock).mockResolvedValue([
      { date: new Date(`${fmt(y)} 15:00`).getTime(), value: 1.2, equityReturn: 0 },
    ]);
    render(
      <TradeManager symbol="TEST001" currentPrice={1.5} previousPrice={1.25}
        realtimeDate={fmt(today)} netWorthDate={fmt(y)} onClose={jest.fn()} />
    );
  });

  test('today price uses valuation', async () => {
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });
    expect(screen.getByDisplayValue('1.5000')).toBeInTheDocument();
  });
});

// ─── TradeManager initial position record tests ───────────────────────────────
describe('TradeManager initial position record', () => {
  beforeEach(() => {
    (fetchFundHistory as jest.Mock).mockResolvedValue([]);
  });

  test('shows initial position when > 0', async () => {
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()}
      initialPosition={100} initialPrice={1.2} startDate="2024-01-15" />);

    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });
    expect(screen.getByText('建仓')).toBeInTheDocument();
    expect(screen.getByText('2024/01/15')).toBeInTheDocument();
    // 交易额：100*1.2=120，可能在合计行和表格行中都有
    expect(screen.getAllByText('120.00').length).toBeGreaterThanOrEqual(1);
  });

  test('hides initial position when 0', async () => {
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()}
      initialPosition={0} initialPrice={1.2} startDate="2024-01-15" />);

    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });
    expect(screen.queryByText('建仓')).not.toBeInTheDocument();
  });

  test('initial position has no edit/delete', async () => {
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()}
      initialPosition={100} initialPrice={1.2} startDate="2024-01-15" />);

    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });
    expect(screen.queryAllByTitle('编辑').length).toBe(0);
    expect(screen.queryAllByTitle('删除').length).toBe(0);
  });

  test('records sorted by date DESC', async () => {
    localStorage.clear();
    resetMarketFundCache();
    setTradesForSymbol('TEST001', [
      { id: 't1', date: '2024-06-15', type: 'buy', shares: 50, price: 1.5, fee: 0 },
      { id: 't2', date: '2024-03-20', type: 'sell', shares: 30, price: 1.6, fee: 0 },
    ] as any);

    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()}
      initialPosition={100} initialPrice={1.2} startDate="2024-01-15" />);

    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });
    const dates = screen.getAllByText(/2024\/\d{2}\/\d{2}/);
    expect(dates.length).toBe(3);
    expect(dates[0]).toHaveTextContent('2024/06/15');
    expect(dates[2]).toHaveTextContent('2024/01/15');
  });
});

// ─── TradeManager view switching tests ───────────────────────────────────
describe('TradeManager view switching', () => {
  beforeEach(() => {
    (fetchFundHistory as jest.Mock).mockResolvedValue([]);
  });

  test('default view is normal', async () => {
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });
    expect((screen.getByLabelText('普通视图') as HTMLInputElement).checked).toBe(true);
  });

  test('can switch views', async () => {
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    fireEvent.click(screen.getByLabelText('先进先出'));
    expect((screen.getByLabelText('先进先出') as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByLabelText('后进先出'));
    expect((screen.getByLabelText('后进先出') as HTMLInputElement).checked).toBe(true);
  });
});

// ─── TradeManager profit/loss display tests ───────────────────────────────
describe('TradeManager profit/loss display', () => {
  beforeEach(() => {
    (fetchFundHistory as jest.Mock).mockResolvedValue([]);
    localStorage.clear();
    resetMarketFundCache();
  });

  test('positive profit in red', async () => {
    setTradesForSymbol('TEST001', [{ id: 't1', date: '2024-06-15', type: 'buy', shares: 100, price: 1.0, fee: 0 }] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });
    const el = screen.getByText('+50.00%');
    expect(el).toBeInTheDocument();
    expect(el).toHaveClass('text-red-500');
  });

  test('negative profit in green', async () => {
    setTradesForSymbol('TEST001', [{ id: 't1', date: '2024-06-15', type: 'buy', shares: 100, price: 2.0, fee: 0 }] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });
    const el = screen.getByText('-25.00%');
    expect(el).toBeInTheDocument();
    expect(el).toHaveClass('text-green-500');
  });

  test('zero profit and fee show dash', async () => {
    setTradesForSymbol('TEST001', [{ id: 't1', date: '2024-06-15', type: 'buy', shares: 100, price: 1.5, fee: 0 }] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(2);
  });

  test('pagination format', async () => {
    setTradesForSymbol('TEST001', [{ id: 't1', date: '2024-06-15', type: 'buy', shares: 100, price: 1.5, fee: 0 }] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });
    expect(screen.getByText(/共 1 条记录/)).toBeInTheDocument();
  });

  test('number formatting', async () => {
    setTradesForSymbol('TEST001', [{ id: 't1', date: '2024-06-15', type: 'buy', shares: 12345.67, price: 1.5, fee: 100 }] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });
    expect(screen.getAllByText('12,345.67').length).toBeGreaterThanOrEqual(1);
  });

  test('sell shows dash for profit', async () => {
    setTradesForSymbol('TEST001', [{ id: 't1', date: '2024-06-15', type: 'sell', shares: 100, price: 1.5, fee: 0 }] as any);
    render(<TradeManager symbol="TEST001" currentPrice={2.0} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });
    expect(screen.getAllByText('卖出').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(2);
  });
});

// ─── TradeManager FIFO/LIFO view tests ───────────────────────────────────
describe('TradeManager FIFO/LIFO views', () => {
  beforeEach(() => {
    (fetchFundHistory as jest.Mock).mockResolvedValue([]);
    localStorage.clear();
    resetMarketFundCache();
  });

  test('FIFO shows remaining shares', async () => {
    setTradesForSymbol('TEST001', [
      { id: '1', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 10 },
      { id: '2', date: '2024-01-02', type: 'sell', shares: 60, price: 1.5, fee: 0 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });
    fireEvent.click(screen.getByLabelText('先进先出'));
    expect(screen.getAllByText('40.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('4.00')).toBeInTheDocument();
  });

  test('FIFO shows error for unmatched sell', async () => {
    setTradesForSymbol('TEST001', [{ id: '1', date: '2024-01-01', type: 'sell', shares: 100, price: 1.5, fee: 0 }] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });
    fireEvent.click(screen.getByLabelText('先进先出'));
    expect(screen.getByText(/未匹配/)).toBeInTheDocument();
  });

  test('FIFO/LIFO are read-only', async () => {
    setTradesForSymbol('TEST001', [{ id: '1', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 0 }] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });
    fireEvent.click(screen.getByLabelText('先进先出'));
    expect(screen.queryByTitle('编辑')).not.toBeInTheDocument();
  });

  test('LIFO matches recent buys first', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'A', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 0 },
      { id: 'B', date: '2024-01-02', type: 'buy', shares: 50, price: 1.2, fee: 0 },
      { id: 'C', date: '2024-01-03', type: 'sell', shares: 70, price: 1.5, fee: 0 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });
    fireEvent.click(screen.getByLabelText('后进先出'));
    expect(screen.getAllByText('80.00').length).toBeGreaterThanOrEqual(1);
  });
});

// ─── TradeManager summary row tests ───────────────────────────────────
describe('TradeManager summary row', () => {
  beforeEach(() => {
    (fetchFundHistory as jest.Mock).mockResolvedValue([]);
    localStorage.clear();
    resetMarketFundCache();
  });

  test('shows summary row with total shares', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'A', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 10 },
      { id: 'B', date: '2024-01-02', type: 'sell', shares: 30, price: 1.5, fee: 5 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 合计数量：100 - 30 = 70（可能在多处显示）
    expect(screen.getByText('合计')).toBeInTheDocument();
    expect(screen.getAllByText('70.00').length).toBeGreaterThanOrEqual(1);
  });

  test('shows negative total shares in red', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'A', date: '2024-01-01', type: 'buy', shares: 50, price: 1.0, fee: 0 },
      { id: 'B', date: '2024-01-02', type: 'sell', shares: 100, price: 1.5, fee: 0 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 合计数量：50 - 100 = -50（负数显示红色）
    const negativeShares = screen.getByText('-50.00');
    expect(negativeShares).toBeInTheDocument();
    expect(negativeShares).toHaveClass('text-red-500');
  });

  test('shows trade amount summary with positive icon', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'A', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 10 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 交易额合计：100*1.0+10 = 110（正数，显示箭头↑）
    // 新的title格式：总买入 110.00, 总卖出 0.00, 总分红 0.00, 净投入 110.00
    const titleElement = screen.getByTitle(/总买入 110\.00, 总卖出 0\.00, 总分红 0\.00, 净投入 110\.00/);
    expect(titleElement).toBeInTheDocument();
    expect(screen.getAllByText('110.00').length).toBeGreaterThanOrEqual(1);
  });

  test('shows trade amount summary with negative icon', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'A', date: '2024-01-01', type: 'buy', shares: 50, price: 1.0, fee: 0 },
      { id: 'B', date: '2024-01-02', type: 'sell', shares: 60, price: 1.5, fee: 0 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 交易额合计：买入50*1.0=50，卖出60*1.5=90，合计=50-90=-40（负数，显示箭头↓）
    // 新的title格式：总买入 50.00, 总卖出 90.00, 总分红 0.00, 净回收 40.00
    const titleElement = screen.getByTitle(/总买入 50\.00, 总卖出 90\.00, 总分红 0\.00, 净回收 40\.00/);
    expect(titleElement).toBeInTheDocument();
    expect(screen.getAllByText('40.00').length).toBeGreaterThanOrEqual(1);
  });

  test('shows trade amount zero without icon', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'A', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 0 },
      { id: 'B', date: '2024-01-02', type: 'sell', shares: 100, price: 1.0, fee: 0 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 交易额合计：买入100*1.0=100，卖出100*1.0=100，合计=100-100=0
    // 合计行中交易额列显示"0.00"，不带图标
    const zeros = screen.getAllByText('0.00');
    expect(zeros.length).toBeGreaterThanOrEqual(1);
    // 不应显示净投入或净回收的title（零值时不显示图标）
    expect(screen.queryByTitle(/净投入/)).not.toBeInTheDocument();
    expect(screen.queryByTitle(/净回收/)).not.toBeInTheDocument();
  });

  test('shows fee summary in normal view', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'A', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 10 },
      { id: 'B', date: '2024-01-02', type: 'sell', shares: 50, price: 1.5, fee: 5 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 手续费合计：10 + 5 = 15（普通视图显示）
    expect(screen.getByText('15.00')).toBeInTheDocument();
  });

  test('hides fee summary in FIFO view', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'A', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 10 },
      { id: 'B', date: '2024-01-02', type: 'sell', shares: 50, price: 1.5, fee: 5 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    fireEvent.click(screen.getByLabelText('先进先出'));
    await waitFor(() => expect((screen.getByLabelText('先进先出') as HTMLInputElement).checked).toBe(true), { timeout: 1000 });

    // FIFO视图手续费合计显示"-"
    const feeElements = screen.getAllByText('-');
    expect(feeElements.length).toBeGreaterThanOrEqual(1);
  });

  test('hides fee summary in LIFO view', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'A', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 10 },
      { id: 'B', date: '2024-01-02', type: 'sell', shares: 50, price: 1.5, fee: 5 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    fireEvent.click(screen.getByLabelText('后进先出'));
    await waitFor(() => expect((screen.getByLabelText('后进先出') as HTMLInputElement).checked).toBe(true), { timeout: 1000 });

    // LIFO视图手续费合计显示"-"
    const feeElements = screen.getAllByText('-');
    expect(feeElements.length).toBeGreaterThanOrEqual(1);
  });

  test('trade amount summary only in normal view', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'A', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 10 },
      { id: 'B', date: '2024-01-02', type: 'sell', shares: 30, price: 1.5, fee: 5 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 普通视图：交易额合计 = 买入(100*1.0+10)=110 - 卖出(30*1.5-5)=40 = 70
    // 新的title格式：总买入 110.00, 总卖出 40.00, 总分红 0.00, 净投入 70.00
    expect(screen.getByTitle(/总买入 110\.00, 总卖出 40\.00, 总分红 0\.00, 净投入 70\.00/)).toBeInTheDocument();

    // FIFO视图：交易额合计显示"-"
    fireEvent.click(screen.getByLabelText('先进先出'));
    await waitFor(() => expect((screen.getByLabelText('先进先出') as HTMLInputElement).checked).toBe(true), { timeout: 1000 });
    // 交易额合计不显示图标
    expect(screen.queryByTitle(/净投入/)).not.toBeInTheDocument();

    // LIFO视图：交易额合计显示"-"
    fireEvent.click(screen.getByLabelText('后进先出'));
    await waitFor(() => expect((screen.getByLabelText('后进先出') as HTMLInputElement).checked).toBe(true), { timeout: 1000 });
    // 交易额合计不显示图标
    expect(screen.queryByTitle(/净投入/)).not.toBeInTheDocument();
  });

  test('includes initial position in summary', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'A', date: '2024-01-02', type: 'buy', shares: 50, price: 1.2, fee: 0 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()}
      initialPosition={100} initialPrice={1.0} startDate="2024-01-01" />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 数量合计：建仓100 + 买入50 = 150
    expect(screen.getByText('150.00')).toBeInTheDocument();

    // 交易额合计：建仓100*1.0=100 + 买入50*1.2=60 = 160（显示箭头↑）
    // 新的title格式：总买入 160.00, 总卖出 0.00, 总分红 0.00, 净投入 160.00
    expect(screen.getByTitle(/总买入 160\.00, 总卖出 0\.00, 总分红 0\.00, 净投入 160\.00/)).toBeInTheDocument();
    expect(screen.getAllByText('160.00').length).toBeGreaterThanOrEqual(1);
  });

  test('formats trade amount with thousand separators', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'A', date: '2024-01-01', type: 'buy', shares: 10000, price: 1.0, fee: 0 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 交易额合计：10000*1.0=10000（显示箭头↑）
    // 新的title格式：总买入 10,000.00, 总卖出 0.00, 总分红 0.00, 净投入 10,000.00
    expect(screen.getByTitle(/总买入 10,000\.00, 总卖出 0\.00, 总分红 0\.00, 净投入 10,000\.00/)).toBeInTheDocument();
    expect(screen.getAllByText('10,000.00').length).toBeGreaterThanOrEqual(1);
  });

  test('shows operation count in summary row', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'A', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 10 },
      { id: 'B', date: '2024-01-02', type: 'sell', shares: 30, price: 1.5, fee: 5 },
      { id: 'C', date: '2024-01-03', type: 'buy', shares: 50, price: 1.2, fee: 0 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 操作列统计：买入/建仓 2 次，卖出 1 次，分红 0 次，总次数 3
    const titleElement = screen.getByTitle('买入/建仓 2 次，卖出 1 次，分红 0 次');
    expect(titleElement).toBeInTheDocument();
    expect(titleElement).toHaveTextContent('3');
  });

  test('operation count includes initial position', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'A', date: '2024-01-02', type: 'sell', shares: 50, price: 1.5, fee: 0 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()}
      initialPosition={100} initialPrice={1.0} startDate="2024-01-01" />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 操作列统计：建仓 1 次 + 卖出 1 次 = 2
    const titleElement = screen.getByTitle('买入/建仓 1 次，卖出 1 次，分红 0 次');
    expect(titleElement).toBeInTheDocument();
    expect(titleElement).toHaveTextContent('2');
  });

  test('hides operation count in FIFO view', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'A', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 10 },
      { id: 'B', date: '2024-01-02', type: 'sell', shares: 30, price: 1.5, fee: 5 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 普通视图显示操作统计
    expect(screen.getByTitle('买入/建仓 1 次，卖出 1 次，分红 0 次')).toBeInTheDocument();

    // FIFO视图：操作列显示"-"
    fireEvent.click(screen.getByLabelText('先进先出'));
    await waitFor(() => expect((screen.getByLabelText('先进先出') as HTMLInputElement).checked).toBe(true), { timeout: 1000 });
    expect(screen.queryByTitle(/买入\/建仓/)).not.toBeInTheDocument();
  });

  test('hides operation count in LIFO view', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'A', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 10 },
      { id: 'B', date: '2024-01-02', type: 'sell', shares: 30, price: 1.5, fee: 5 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 普通视图显示操作统计
    expect(screen.getByTitle('买入/建仓 1 次，卖出 1 次，分红 0 次')).toBeInTheDocument();

    // LIFO视图：操作列显示"-"
    fireEvent.click(screen.getByLabelText('后进先出'));
    await waitFor(() => expect((screen.getByLabelText('后进先出') as HTMLInputElement).checked).toBe(true), { timeout: 1000 });
    expect(screen.queryByTitle(/买入\/建仓/)).not.toBeInTheDocument();
  });
});
// ─── TradeManager selection stats tests ───────────────────────────────────
describe('TradeManager selection stats (total profit)', () => {
  beforeEach(() => {
    (fetchFundHistory as jest.Mock).mockResolvedValue([]);
    localStorage.clear();
    resetMarketFundCache();
  });

  test('shows total profit when selecting buy records', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'A', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 0 },
      { id: 'B', date: '2024-01-02', type: 'buy', shares: 50, price: 1.2, fee: 0 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 点击选中第一条买入记录（找到表格行容器）
    const row = screen.getByText('2024/01/02').closest('div[class*="border"]');
    fireEvent.mouseDown(row!, { bubbles: true });
    fireEvent.mouseUp(row!, { bubbles: true });

    await waitFor(() => {
      expect(screen.getByText(/选中.*条记录/)).toBeInTheDocument();
    }, { timeout: 1000 });

    // 验证盈亏计算：50 * (1.5 - 1.2) = 15，使用 span 选择器匹配总计盈亏
    const profitSpans = screen.getAllByText('+15.00');
    expect(profitSpans.length).toBeGreaterThanOrEqual(2);
  });

  test('shows positive profit in red', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'A', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 0 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={2.0} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 选中记录
    const row = screen.getByText('2024/01/01').closest('div[class*="border"]');
    fireEvent.mouseDown(row!, { bubbles: true });
    fireEvent.mouseUp(row!, { bubbles: true });

    await waitFor(() => {
      // 找到 span 元素中的盈亏值（信息栏的总计盈亏）
      const profitSpans = screen.getAllByText('+100.00');
      const spanEl = profitSpans.find(el => el.tagName === 'SPAN');
      expect(spanEl).toHaveClass('text-red-500');
    }, { timeout: 1000 });
  });

  test('shows negative profit in green', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'A', date: '2024-01-01', type: 'buy', shares: 100, price: 2.0, fee: 0 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.0} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 选中记录
    const row = screen.getByText('2024/01/01').closest('div[class*="border"]');
    fireEvent.mouseDown(row!, { bubbles: true });
    fireEvent.mouseUp(row!, { bubbles: true });

    await waitFor(() => {
      // 找到 span 元素中的盈亏值（信息栏的总计盈亏）
      const profitSpans = screen.getAllByText('-100.00');
      const spanEl = profitSpans.find(el => el.tagName === 'SPAN');
      expect(spanEl).toHaveClass('text-green-500');
    }, { timeout: 1000 });
  });

  test('calculates total profit for multiple selected records', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'A', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 0 },
      { id: 'B', date: '2024-01-02', type: 'buy', shares: 50, price: 1.2, fee: 0 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // Ctrl + 点击选中两条记录
    const row1 = screen.getByText('2024/01/02').closest('div[class*="border"]');
    const row2 = screen.getByText('2024/01/01').closest('div[class*="border"]');
    fireEvent.mouseDown(row1!, { bubbles: true, ctrlKey: true });
    fireEvent.mouseUp(row1!, { bubbles: true });
    fireEvent.mouseDown(row2!, { bubbles: true, ctrlKey: true });
    fireEvent.mouseUp(row2!, { bubbles: true });

    await waitFor(() => {
      // 总盈亏：50*(1.5-1.2) + 100*(1.5-1.0) = 15 + 50 = 65
      expect(screen.getByText('+65.00')).toBeInTheDocument();
    }, { timeout: 1000 });
  });

  test('excludes sell records from total profit', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'A', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 0 },
      { id: 'B', date: '2024-01-02', type: 'sell', shares: 50, price: 1.5, fee: 0 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={2.0} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 选中两条记录（通过 Ctrl + 点击）
    const buyRow = screen.getByText('2024/01/01').closest('div[class*="border"]');
    const sellRow = screen.getByText('2024/01/02').closest('div[class*="border"]');
    fireEvent.mouseDown(buyRow!, { bubbles: true, ctrlKey: true });
    fireEvent.mouseUp(buyRow!, { bubbles: true });
    fireEvent.mouseDown(sellRow!, { bubbles: true, ctrlKey: true });
    fireEvent.mouseUp(sellRow!, { bubbles: true });

    await waitFor(() => {
      // 只计算买入记录的盈亏：100*(2.0-1.0) = 100
      expect(screen.getAllByText('+100.00').length).toBeGreaterThanOrEqual(2);
    }, { timeout: 1000 });
  });

  test('formats profit with thousand separators', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'A', date: '2024-01-01', type: 'buy', shares: 10000, price: 1.0, fee: 0 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={2.0} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 选中记录
    const row = screen.getByText('2024/01/01').closest('div[class*="border"]');
    fireEvent.mouseDown(row!, { bubbles: true });
    fireEvent.mouseUp(row!, { bubbles: true });

    await waitFor(() => {
      // 10000*(2.0-1.0) = 10000
      expect(screen.getAllByText('+10,000.00').length).toBeGreaterThanOrEqual(2);
    }, { timeout: 1000 });
  });
});

// ─── TradeManager dividend type tests ───────────────────────────────────
describe('TradeManager dividend type', () => {
  beforeEach(() => {
    (fetchFundHistory as jest.Mock).mockResolvedValue([]);
    localStorage.clear();
    resetMarketFundCache();
  });

  test('dividend option is available in type selector', async () => {
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    const typeSelect = screen.getByRole('combobox');
    const options = Array.from(typeSelect.querySelectorAll('option')).map(opt => opt.value);
    expect(options).toContain('dividend');
    expect(options).toContain('buy');
    expect(options).toContain('sell');
  });

  test('switching to dividend disables shares, price, fee fields', async () => {
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 切换到分红类型
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dividend' } });

    // 验证份额字段显示"禁用"
    expect(screen.getByText('份额（禁用）')).toBeInTheDocument();

    // 验证价格字段显示"禁用"
    expect(screen.getByText('价格（禁用）')).toBeInTheDocument();

    // 验证手续费字段显示"禁用"
    expect(screen.getByText('手续费（禁用）')).toBeInTheDocument();

    // 验证总额字段显示"分红金额"
    expect(screen.getByText('分红金额')).toBeInTheDocument();
  });

  test('dividend type shows total field as editable', async () => {
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 切换到分红类型
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dividend' } });

    // 总额字段应该可编辑
    const totalInputs = screen.getAllByRole('spinbutton');
    // 分红类型只有一个可编辑的数字输入框（总额）
    const editableInputs = totalInputs.filter(input => !input.hasAttribute('readOnly'));
    expect(editableInputs.length).toBeGreaterThanOrEqual(1);
  });

  test('dividend validation: total must be > 0', async () => {
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 切换到分红类型
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dividend' } });

    // 总额为 0 时点击添加
    fireEvent.click(screen.getByText('添加交易'));

    // 应该显示错误信息
    expect(screen.getByText('分红金额必须大于0')).toBeInTheDocument();
  });

  test('dividend can be added successfully', async () => {
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 切换到分红类型
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dividend' } });

    // 输入分红金额
    const totalInputs = screen.getAllByRole('spinbutton');
    const totalInput = totalInputs.find(input => !input.hasAttribute('readOnly'));
    fireEvent.change(totalInput!, { target: { value: '100' } });

    // 点击添加
    fireEvent.click(screen.getByText('添加交易'));

    // 应该在表格中显示分红记录
    await waitFor(() => {
      expect(screen.getByText('分红')).toBeInTheDocument();
    }, { timeout: 1000 });
  });

  test('dividend displays with yellow background', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'd1', date: '2024-06-15', type: 'dividend', shares: 0, price: 0, fee: 0, total: 100 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 分红记录应该显示"分红"（表格中的div，不是option）
    const dividendTypes = screen.getAllByText('分红');
    // 找到表格中的分红类型（在 div 中）
    const tableDividendType = dividendTypes.find(el => el.tagName === 'DIV');
    expect(tableDividendType).toBeInTheDocument();
    expect(tableDividendType).toHaveClass('text-yellow-600');
  });

  test('dividend shows dash for shares and price in table', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'd1', date: '2024-06-15', type: 'dividend', shares: 0, price: 0, fee: 0, total: 100 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 分红记录的数量和价格列应该显示"-"
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  test('dividend shows total amount in trade amount column', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'd1', date: '2024-06-15', type: 'dividend', shares: 0, price: 0, fee: 0, total: 123.45 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 分红记录的交易额应该显示 total 值（可能在表格行和合计行中都有）
    expect(screen.getAllByText('123.45').length).toBeGreaterThanOrEqual(1);
  });

  test('dividend can be edited', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'd1', date: '2024-06-15', type: 'dividend', shares: 0, price: 0, fee: 0, total: 100 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 点击编辑按钮
    fireEvent.click(screen.getByTitle('编辑'));

    // 类型选择器应该选中分红
    await waitFor(() => {
      expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('dividend');
    }, { timeout: 1000 });

    // 分红金额输入框应该显示原有值
    // 找到所有数字输入框
    const allInputs = screen.getAllByRole('spinbutton');
    // 查找分红金额标签对应的输入框
    const totalLabel = screen.getByText('分红金额');
    const totalContainer = totalLabel.closest('div');
    const totalInput = totalContainer?.querySelector('input[type="number"]');
    expect(totalInput).toHaveValue(100);
  });

  test('dividend can be deleted', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'd1', date: '2024-06-15', type: 'dividend', shares: 0, price: 0, fee: 0, total: 100 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 点击删除按钮
    fireEvent.click(screen.getByTitle('删除'));

    // 记录应该被删除（表格中的分红记录）
    await waitFor(() => {
      // 检查表格中是否还有分红记录（不是 option 中的"分红"）
      const dividendTypes = screen.getAllByText('分红');
      const tableDividendType = dividendTypes.find(el => el.tagName === 'DIV');
      expect(tableDividendType).toBeUndefined();
    }, { timeout: 1000 });
  });

  // Task 6: 分红记录在不同视图模式下的过滤测试
  test('normal view shows dividend records', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'b1', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 0 },
      { id: 'd1', date: '2024-01-02', type: 'dividend', shares: 0, price: 0, fee: 0, total: 50 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 普通视图应该显示分红记录（表格中的div，不是option）
    const dividendTypes = screen.getAllByText('分红');
    const tableDividendType = dividendTypes.find(el => el.tagName === 'DIV');
    expect(tableDividendType).toBeInTheDocument();
    // 分红金额会在表格行和合计行中显示，所以用 getAllByText
    expect(screen.getAllByText('50.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/共 2 条记录/)).toBeInTheDocument();
  });

  test('FIFO view excludes dividend records from matching', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'b1', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 10 },
      { id: 'd1', date: '2024-01-02', type: 'dividend', shares: 0, price: 0, fee: 0, total: 50 },
      { id: 's1', date: '2024-01-03', type: 'sell', shares: 60, price: 1.5, fee: 0 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 切换到 FIFO 视图
    fireEvent.click(screen.getByLabelText('先进先出'));
    await waitFor(() => expect((screen.getByLabelText('先进先出') as HTMLInputElement).checked).toBe(true), { timeout: 1000 });

    // FIFO 视图应该只显示未完全匹配的买入记录（分红被过滤）
    // 买入100份，卖出60份，剩余40份
    expect(screen.getAllByText('40.00').length).toBeGreaterThanOrEqual(1); // 剩余份额
    expect(screen.getByText('4.00')).toBeInTheDocument(); // 剩余手续费 10 * 40/100 = 4
    // 分红记录不应该在表格中显示
    const dividendTypes = screen.getAllByText('分红');
    const tableDividendType = dividendTypes.find(el => el.tagName === 'DIV');
    expect(tableDividendType).toBeUndefined();
    // 记录总数应该只有1条（买入记录）
    expect(screen.getByText(/共 1 条记录/)).toBeInTheDocument();
  });

  test('LIFO view excludes dividend records from matching', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'b1', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 0 },
      { id: 'b2', date: '2024-01-02', type: 'buy', shares: 50, price: 1.2, fee: 0 },
      { id: 'd1', date: '2024-01-03', type: 'dividend', shares: 0, price: 0, fee: 0, total: 80 },
      { id: 's1', date: '2024-01-04', type: 'sell', shares: 70, price: 1.5, fee: 0 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 切换到 LIFO 视图
    fireEvent.click(screen.getByLabelText('后进先出'));
    await waitFor(() => expect((screen.getByLabelText('后进先出') as HTMLInputElement).checked).toBe(true), { timeout: 1000 });

    // LIFO 视图应该只显示未完全匹配的买入记录（分红被过滤）
    // LIFO: b2(50)被完全匹配，b1(100)剩余80份，卖出被过滤
    expect(screen.getAllByText('80.00').length).toBeGreaterThanOrEqual(1); // b1剩余份额
    // 分红记录不应该在表格中显示
    const dividendTypes = screen.getAllByText('分红');
    const tableDividendType = dividendTypes.find(el => el.tagName === 'DIV');
    expect(tableDividendType).toBeUndefined();
    // 记录总数应该只有1条（买入记录）
    expect(screen.getByText(/共 1 条记录/)).toBeInTheDocument();
  });

  test('FIFO view summary excludes dividend amount', async () => {
    setTradesForSymbol('TEST001', [
      { id: 'b1', date: '2024-01-01', type: 'buy', shares: 100, price: 1.0, fee: 10 },
      { id: 'd1', date: '2024-01-02', type: 'dividend', shares: 0, price: 0, fee: 0, total: 50 },
      { id: 's1', date: '2024-01-03', type: 'sell', shares: 30, price: 1.5, fee: 5 },
    ] as any);
    render(<TradeManager symbol="TEST001" currentPrice={1.5} onClose={jest.fn()} />);
    await waitFor(() => expect(fetchFundHistory).toHaveBeenCalled(), { timeout: 1000 });

    // 普通视图：交易额合计应该包含分红
    // 买入(100*1.0+10)=110, 卖出(30*1.5-5)=40, 分红=50
    // 合计 = 110 - 40 - 50 = 20
    expect(screen.getByTitle(/总买入 110\.00, 总卖出 40\.00, 总分红 50\.00, 净投入 20\.00/)).toBeInTheDocument();

    // 切换到 FIFO 视图
    fireEvent.click(screen.getByLabelText('先进先出'));
    await waitFor(() => expect((screen.getByLabelText('先进先出') as HTMLInputElement).checked).toBe(true), { timeout: 1000 });

    // FIFO 视图：交易额合计显示"-"，分红不参与计算
    expect(screen.queryByTitle(/净投入/)).not.toBeInTheDocument();
  });
});
