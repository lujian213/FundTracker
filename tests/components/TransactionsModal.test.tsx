import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MarketType } from '../../types';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock react-day-picker: render a plain <select> so tests can drive date selection
// without depending on DayPicker internals.
jest.mock('react-day-picker', () => ({
  DayPicker: ({ onSelect, disabled, modifiers }: any) => {
    const tradeDates: Date[] = modifiers?.hasTrack ?? [];
    const options = tradeDates.map((d: Date) => {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return <option key={iso} value={iso}>{iso}</option>;
    });
    return (
      <select
        data-testid="mock-day-picker"
        onChange={e => {
          const [y, m, day] = e.target.value.split('-').map(Number);
          onSelect && onSelect(new Date(y, m - 1, day));
        }}
      >
        <option value="">-- 选择日期 --</option>
        {options}
      </select>
    );
  },
}));

// Mock date-fns/locale (not needed in tests)
jest.mock('date-fns/locale', () => ({ zhCN: {} }));

// Mock createPortal to render inline so queries work
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (node: React.ReactNode) => node,
}));

// Provide a fresh localStorage-backed useTrades mock via the real module
// (no mock needed — we write directly to localStorage before rendering)

import { setTradesForSymbol } from '../../hooks/useTrades';
import TransactionsModal from '../../components/TransactionsModal';
import { Ticker, ValuationData } from '../../types';
import { resetCache as resetMarketFundCache } from '../../services/marketFundService';

// ── Helpers ───────────────────────────────────────────────────────────────────

const portfolio: Ticker[] = [
  { id: 'p1', symbol: '000001', name: '平安银行', market: MarketType.FUND },
  { id: 'p2', symbol: '000002', name: '万科A', market: MarketType.FUND },
];

const marketData: Record<string, ValuationData> = {
  '000001': {
    symbol: '000001', name: '平安银行基金',
    currentPrice: 1.5, previousPrice: 1.4, changePercentage: 0.5,
    lastUpdated: '2026-02-20 15:00', realtimeDate: '2026-02-20',
    netWorthDate: '2026-02-20', valuationDate: '2026-02-20', sourceUrl: '',
  },
};

function seed() {
  // 2026-02-20: 000001 buy + 000002 sell
  setTradesForSymbol('000001', [
    { id: 'a1', date: '2026-02-20', type: 'buy', shares: 100, price: 1.5, fee: 1.5 },
  ] as any);
  setTradesForSymbol('000002', [
    { id: 'b1', date: '2026-02-20', type: 'sell', shares: 50, price: 2.0, fee: 0.5 },
    { id: 'b2', date: '2026-01-10', type: 'buy', shares: 200, price: 1.8, fee: 2.0 },
  ] as any);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TransactionsModal', () => {
  beforeEach(() => {
    localStorage.clear();
    resetMarketFundCache();
  });

  // 1. No trades at all
  describe('when there are no trades', () => {
    test('date button is disabled and shows "暂无交易日期"', () => {
      render(<TransactionsModal portfolio={portfolio} marketData={marketData} onClose={jest.fn()} />);
      const btn = screen.getByRole('button', { name: /暂无交易日期/ });
      expect(btn).toBeDisabled();
    });

    test('table area shows "无任何交易存在"', () => {
      render(<TransactionsModal portfolio={portfolio} marketData={marketData} onClose={jest.fn()} />);
      expect(screen.getByText('无任何交易存在')).toBeInTheDocument();
    });
  });

  // 2. Default date selection
  describe('default date selection', () => {
    test('defaults to the most recent trade date (descending)', async () => {
      seed();
      render(<TransactionsModal portfolio={portfolio} marketData={marketData} onClose={jest.fn()} />);
      // The date button should show the most recent date
      await waitFor(() => expect(screen.getByText('2026-02-20')).toBeInTheDocument());
    });
  });

  // 3. Table columns and headers
  describe('table structure', () => {
    test('renders six column headers correctly', async () => {
      seed();
      render(<TransactionsModal portfolio={portfolio} marketData={marketData} onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByText('2026-02-20')).toBeInTheDocument());

      expect(screen.getByText('基金名称')).toBeInTheDocument();
      expect(screen.getByText('类型')).toBeInTheDocument();
      expect(screen.getByText('份额')).toBeInTheDocument();
      expect(screen.getByText('手续费')).toBeInTheDocument();
      expect(screen.getByText('交易总额')).toBeInTheDocument();
      // 第六列多选按钮 - 表头有一个全选checkbox，每行也有一个checkbox
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.length).toBeGreaterThan(0);
    });
  });

  // 4. Fund name display: prefer marketData.name, fall back to portfolio name
  describe('fund name resolution', () => {
    test('uses marketData name when available (000001)', async () => {
      seed();
      render(<TransactionsModal portfolio={portfolio} marketData={marketData} onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByText('2026-02-20')).toBeInTheDocument());
      // 000001 has a name in marketData → "平安银行基金（000001）"
      expect(screen.getByTitle('平安银行基金（000001）')).toBeInTheDocument();
    });

    test('falls back to portfolio name when marketData has no entry (000002)', async () => {
      seed();
      render(<TransactionsModal portfolio={portfolio} marketData={marketData} onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByText('2026-02-20')).toBeInTheDocument());
      // 000002 not in marketData → falls back to portfolio name "万科A（000002）"
      expect(screen.getByTitle('万科A（000002）')).toBeInTheDocument();
    });
  });

  // 5. Trade type label colours
  describe('trade type display', () => {
    test('buy trade shows "买入"', async () => {
      seed();
      render(<TransactionsModal portfolio={portfolio} marketData={marketData} onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByText('2026-02-20')).toBeInTheDocument());
      expect(screen.getByText('买入')).toBeInTheDocument();
    });

    test('sell trade shows "卖出"', async () => {
      seed();
      render(<TransactionsModal portfolio={portfolio} marketData={marketData} onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByText('2026-02-20')).toBeInTheDocument());
      expect(screen.getByText('卖出')).toBeInTheDocument();
    });
  });

  // 6. Total row shows buy/sell counts and amounts (matches TradeBatchInputModal style)
  describe('totals row', () => {
    test('shows buy and sell counts', async () => {
      seed();
      render(<TransactionsModal portfolio={portfolio} marketData={marketData} onClose={jest.fn()} />);
      // Find the totals container and check its text content
      await waitFor(() => {
        const totalsSection = screen.getByText(/总计：/);
        expect(totalsSection.parentElement).toHaveTextContent('买入');
        expect(totalsSection.parentElement).toHaveTextContent('卖出');
      });
    });

    test('shows buy total and sell total amounts', async () => {
      // 000001 buy: 100 * 1.5 + 1.5 = 151.5
      // 000002 sell: 50 * 2.0 - 0.5 = 99.5
      seed();
      render(<TransactionsModal portfolio={portfolio} marketData={marketData} onClose={jest.fn()} />);
      await waitFor(() => {
        const totalsSection = screen.getByText(/总计：/);
        expect(totalsSection.parentElement).toHaveTextContent('151.50');
        expect(totalsSection.parentElement).toHaveTextContent('99.50');
      });
    });

    test('shows total fee', async () => {
      // 000001 fee: 1.5, 000002 fee: 0.5 → total = 2.0
      seed();
      render(<TransactionsModal portfolio={portfolio} marketData={marketData} onClose={jest.fn()} />);
      await waitFor(() => {
        const totalsSection = screen.getByText(/总计：/);
        expect(totalsSection.parentElement).toHaveTextContent('手续费');
        expect(totalsSection.parentElement).toHaveTextContent('2.00');
      });
    });

    test('shows correct counts for multiple buys and sells', async () => {
      setTradesForSymbol('000001', [
        { id: 'm1', date: '2026-03-01', type: 'buy', shares: 100, price: 1.0, fee: 0 },
        { id: 'm2', date: '2026-03-01', type: 'buy', shares: 50, price: 1.5, fee: 1 },
        { id: 'm3', date: '2026-03-01', type: 'sell', shares: 30, price: 2.0, fee: 0.5 },
      ] as any);
      render(<TransactionsModal portfolio={portfolio} marketData={marketData} onClose={jest.fn()} />);
      await waitFor(() => {
        const totalsSection = screen.getByText(/总计：/);
        expect(totalsSection.parentElement).toHaveTextContent('买入 2 条');
        expect(totalsSection.parentElement).toHaveTextContent('卖出 1 条');
      });
    });
  });

  // 7. Date switching via the mock DayPicker
  describe('date switching', () => {
    test('table updates when a different date is selected', async () => {
      seed();
      render(<TransactionsModal portfolio={portfolio} marketData={marketData} onClose={jest.fn()} />);
      // default date is 2026-02-20 → 1 buy + 1 sell
      await waitFor(() => {
        const totalsSection = screen.getByText(/总计：/);
        expect(totalsSection.parentElement).toHaveTextContent('买入 1 条');
        expect(totalsSection.parentElement).toHaveTextContent('卖出 1 条');
      });

      // open the picker
      const dateBtn = screen.getByText('2026-02-20').closest('button')!;
      fireEvent.click(dateBtn);

      // pick 2026-01-10 from the mock select
      const picker = await screen.findByTestId('mock-day-picker');
      fireEvent.change(picker, { target: { value: '2026-01-10' } });

      // table should now show 1 buy (b2 on 2026-01-10), 0 sell
      await waitFor(() => {
        const totalsSection = screen.getByText(/总计：/);
        expect(totalsSection.parentElement).toHaveTextContent('买入 1 条');
        expect(totalsSection.parentElement).toHaveTextContent('卖出 0 条');
      });
    });

    test('picker closes after selecting a date', async () => {
      seed();
      render(<TransactionsModal portfolio={portfolio} marketData={marketData} onClose={jest.fn()} />);
      await waitFor(() => expect(screen.getByText('2026-02-20')).toBeInTheDocument());

      fireEvent.click(screen.getByText('2026-02-20').closest('button')!);
      expect(screen.getByTestId('mock-day-picker')).toBeInTheDocument();

      fireEvent.change(screen.getByTestId('mock-day-picker'), { target: { value: '2026-01-10' } });

      await waitFor(() => expect(screen.queryByTestId('mock-day-picker')).not.toBeInTheDocument());
    });
  });

  // 8. Zero-value display
  describe('zero value display', () => {
    test('fee of 0 renders as "-"', async () => {
      setTradesForSymbol('000001', [
        { id: 'z1', date: '2026-03-01', type: 'buy', shares: 100, price: 1.0, fee: 0 },
      ] as any);
      render(<TransactionsModal portfolio={portfolio} marketData={marketData} onClose={jest.fn()} />);
      await waitFor(() => {
        const totalsSection = screen.getByText(/总计：/);
        expect(totalsSection.parentElement).toHaveTextContent('买入 1 条');
      });
      // fee column should show "-" for zero fee
      const dashes = screen.getAllByText('-');
      expect(dashes.length).toBeGreaterThan(0);
    });
  });

  // 9. Close button
  describe('close button', () => {
    test('calls onClose when close button clicked', async () => {
      seed();
      const onClose = jest.fn();
      render(<TransactionsModal portfolio={portfolio} marketData={marketData} onClose={onClose} />);
      await waitFor(() => expect(screen.getByText('2026-02-20')).toBeInTheDocument());
      fireEvent.click(screen.getByLabelText('关闭'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});

