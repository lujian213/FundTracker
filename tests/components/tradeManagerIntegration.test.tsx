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
    expect(screen.getByText('120.00')).toBeInTheDocument();
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
      expect(screen.getByText(/选中1条记录/)).toBeInTheDocument();
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
