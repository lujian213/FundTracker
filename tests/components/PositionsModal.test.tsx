import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MarketType } from '../../types';
import { setTradesForSymbol } from '../../hooks/useTrades';
import PositionsModal from '../../components/PositionsModal';
import { Ticker, ValuationData } from '../../types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Render portals inline so queries work
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (node: React.ReactNode) => node,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTicker(symbol: string, name: string): Ticker {
  return { id: symbol, symbol, name, market: MarketType.FUND };
}

function makeValuation(symbol: string, currentPrice: number): ValuationData {
  return {
    symbol, name: `Fund-${symbol}`,
    currentPrice, previousPrice: currentPrice * 0.99,
    changePercentage: 0,
    lastUpdated: '2026-03-01 15:00',
    realtimeDate: '2026-03-01',
    netWorthDate: '2026-02-28',
    valuationDate: '2026-03-01',
    sourceUrl: '',
  };
}

function setPosition(symbol: string, fullCapacity: number, initialPosition: number) {
  localStorage.setItem(
    `fund_position_${symbol}`,
    JSON.stringify({ fullCapacity, initialPosition })
  );
}

const BASE_PORTFOLIO: Ticker[] = [
  makeTicker('000001', '沪深300ETF'),
  makeTicker('000002', '纳斯达克100'),
];

const BASE_MARKET_DATA: Record<string, ValuationData> = {
  '000001': makeValuation('000001', 2.0),
  '000002': makeValuation('000002', 3.0),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PositionsModal', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ── Empty state ─────────────────────────────────────────────────────────────

  test('shows empty state when no fund has a position configured', () => {
    render(
      <PositionsModal
        portfolio={BASE_PORTFOLIO}
        marketData={BASE_MARKET_DATA}
        onClose={() => {}}
        onSelectFund={() => {}}
      />
    );
    // '无持仓数据' appears in multiple nodes (pie placeholder, legend, empty-state section)
    expect(screen.getAllByText('无持仓数据').length).toBeGreaterThan(0);
    // summary line shows 0 funds
    expect(screen.getByText(/0只基金/)).toBeTruthy();
  });

  // ── Summary line ────────────────────────────────────────────────────────────

  test('shows correct fund count and total market value in summary line', () => {
    setPosition('000001', 100, 50); // 50 shares × 2.0 = 100
    setPosition('000002', 100, 40); // 40 shares × 3.0 = 120  → total 220

    render(
      <PositionsModal
        portfolio={BASE_PORTFOLIO}
        marketData={BASE_MARKET_DATA}
        onClose={() => {}}
        onSelectFund={() => {}}
      />
    );

    expect(screen.getByText(/2只基金/)).toBeTruthy();
    // total 220 元 — check the summary div text contains 220
    const summaryDiv = screen.getByText(/2只基金/).closest('div');
    expect(summaryDiv?.textContent).toMatch(/220/);
  });

  // ── Table rows ────────────────────────────────────���─────────────────────────

  test('renders one table row per configured position', () => {
    setPosition('000001', 100, 50);
    setPosition('000002', 100, 40);

    render(
      <PositionsModal
        portfolio={BASE_PORTFOLIO}
        marketData={BASE_MARKET_DATA}
        onClose={() => {}}
        onSelectFund={() => {}}
      />
    );

    // Both fund names should appear (in table and legend)
    expect(screen.getAllByText(/沪深300ETF/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/纳斯达克100/).length).toBeGreaterThan(0);
  });

  test('table rows are ordered by market value descending', () => {
    setPosition('000001', 100, 50); // 50 × 2.0 = 100
    setPosition('000002', 100, 40); // 40 × 3.0 = 120  ← larger

    render(
      <PositionsModal
        portfolio={BASE_PORTFOLIO}
        marketData={BASE_MARKET_DATA}
        onClose={() => {}}
        onSelectFund={() => {}}
      />
    );

    const rows = screen.getAllByRole('row');
    // rows[0] = thead, rows[1] = first data row, rows[last] = tfoot
    const firstDataRow = rows[1].textContent ?? '';
    expect(firstDataRow).toContain('纳斯达克100'); // higher value first
  });

  test('footer shows correct total and 100%', () => {
    setPosition('000001', 100, 50); // 100
    setPosition('000002', 100, 40); // 120

    render(
      <PositionsModal
        portfolio={BASE_PORTFOLIO}
        marketData={BASE_MARKET_DATA}
        onClose={() => {}}
        onSelectFund={() => {}}
      />
    );

    expect(screen.getByText(/总计：2条记录/)).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
  });

  test('shows correct shares and ratio for a single fund', () => {
    setPosition('000001', 100, 80); // 80 shares × 2.0 = 160, ratio = 100%

    render(
      <PositionsModal
        portfolio={[BASE_PORTFOLIO[0]]}
        marketData={{ '000001': BASE_MARKET_DATA['000001'] }}
        onClose={() => {}}
        onSelectFund={() => {}}
      />
    );

    // shares: 80.00
    expect(screen.getByText('80.00')).toBeTruthy();
    // ratio: 100.00%
    expect(screen.getAllByText('100.00%').length).toBeGreaterThan(0);
  });

  // ── Trades interaction ───────────────────────────────────────────────────────

  test('incorporates trade records into currentShares', () => {
    setPosition('000001', 200, 100);
    // net: 100 + 50 - 20 = 130
    setTradesForSymbol('000001', [
      { id: 'b1', date: '2026-01-01', type: 'buy', shares: 50, price: 2.0, fee: 0 },
      { id: 's1', date: '2026-01-02', type: 'sell', shares: 20, price: 2.1, fee: 0 },
    ] as any);

    render(
      <PositionsModal
        portfolio={[BASE_PORTFOLIO[0]]}
        marketData={{ '000001': BASE_MARKET_DATA['000001'] }}
        onClose={() => {}}
        onSelectFund={() => {}}
      />
    );

    // 130 shares shown
    expect(screen.getByText('130.00')).toBeTruthy();
  });

  test('excludes fund whose net shares are zero after trades', () => {
    setPosition('000001', 100, 50);
    // sell all: 50 + 50 - 100 = 0
    setTradesForSymbol('000001', [
      { id: 'b1', date: '2026-01-01', type: 'buy', shares: 50, price: 2.0, fee: 0 },
      { id: 's1', date: '2026-01-02', type: 'sell', shares: 100, price: 2.1, fee: 0 },
    ] as any);

    render(
      <PositionsModal
        portfolio={[BASE_PORTFOLIO[0]]}
        marketData={{ '000001': BASE_MARKET_DATA['000001'] }}
        onClose={() => {}}
        onSelectFund={() => {}}
      />
    );

    // fund excluded → shows empty state (text appears multiple times across pie/legend/empty-state)
    expect(screen.getAllByText('无持仓数据').length).toBeGreaterThan(0);
    // and no table rows rendered (only thead + tfoot would give 2 rows, but table is not rendered at all)
    expect(screen.queryByRole('table')).toBeNull();
  });

  // ── Close button ─────────────────────────────────────────────────────────────

  test('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    render(
      <PositionsModal
        portfolio={[]}
        marketData={{}}
        onClose={onClose}
        onSelectFund={() => {}}
      />
    );
    fireEvent.click(screen.getByLabelText('关闭持仓窗口'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('calls onClose when backdrop is clicked', () => {
    const onClose = jest.fn();
    const { container } = render(
      <PositionsModal
        portfolio={[]}
        marketData={{}}
        onClose={onClose}
        onSelectFund={() => {}}
      />
    );
    // backdrop is the first absolute div inside the outermost fixed div
    const backdrop = container.querySelector('.absolute.inset-0') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── onSelectFund callback ────────────────────────────────────────────────────

  test('calls onSelectFund with correct symbol when table row name is clicked', () => {
    setPosition('000001', 100, 50);
    const onSelectFund = jest.fn();

    render(
      <PositionsModal
        portfolio={[BASE_PORTFOLIO[0]]}
        marketData={{ '000001': BASE_MARKET_DATA['000001'] }}
        onClose={() => {}}
        onSelectFund={onSelectFund}
      />
    );

    // Click the fund name button inside the table row (there may be multiple — table + legend)
    const buttons = screen.getAllByTitle(/沪深300ETF/);
    fireEvent.click(buttons[0]);
    expect(onSelectFund).toHaveBeenCalledWith('000001');
  });

  // ── Pie chart ────────────────────────────────────────────────────────────────

  test('renders SVG pie slices for each configured fund', () => {
    setPosition('000001', 100, 50);
    setPosition('000002', 100, 40);

    const { container } = render(
      <PositionsModal
        portfolio={BASE_PORTFOLIO}
        marketData={BASE_MARKET_DATA}
        onClose={() => {}}
        onSelectFund={() => {}}
      />
    );

    const paths = container.querySelectorAll('svg path');
    expect(paths.length).toBe(2);
  });

  test('renders no SVG paths when there are no positions', () => {
    const { container } = render(
      <PositionsModal
        portfolio={BASE_PORTFOLIO}
        marketData={BASE_MARKET_DATA}
        onClose={() => {}}
        onSelectFund={() => {}}
      />
    );
    const paths = container.querySelectorAll('svg path');
    expect(paths.length).toBe(0);
  });
});




