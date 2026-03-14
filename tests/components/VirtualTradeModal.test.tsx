import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// mock runVirtualTrade to control outputs
jest.mock('../../services/virtualTradeEngine', () => ({
  runVirtualTrade: jest.fn(),
}));

// Mock strategy registry to return static data in tests
jest.mock('../../services/strategyRegistry', () => ({
  loadAllStrategies: jest.fn().mockResolvedValue([
    { key: 'trendFollowing', strategy: { name: 'Trend Following' }, meta: { name: '趋势跟踪', description: 'Follows trends' } },
    { key: 'meanReversion', strategy: { name: 'Mean Reversion' }, meta: { name: '均值回归', description: 'Reverts to mean' } },
    { key: 'constantMix', strategy: { name: 'Constant Mix' }, meta: { name: '固定混合', description: 'Constant mix allocation' } },
  ]),
  getStaticStrategyList: jest.fn(),
}));

import { runVirtualTrade } from '../../services/virtualTradeEngine';
import VirtualTradeModal from '../../components/VirtualTradeModal';
import { HistoricalPoint, VirtualTradeResult, VirtualTradeAction } from '../../types';

const today = new Date();
const hist: HistoricalPoint[] = [
  { date: today.getTime() - 2 * 24 * 3600 * 1000, value: 1.0, equityReturn: 0 },
  { date: today.getTime() - 1 * 24 * 3600 * 1000, value: 1.01, equityReturn: 0 },
  { date: today.getTime(), value: 1.02, equityReturn: 0 },
];

function makeResult(totalProfit: number, hasTrade = true): VirtualTradeResult {
  const timeline = hasTrade ? [{ date: '2026-01-01', action: 'buy' as VirtualTradeAction, nav: 1.0, shares: 1, amount: 1, cashAfter: 0, sharesAfter: 1, totalAfter: 1, profitSincePrev: 0, profitSinceStart: totalProfit }] : [];
  return { timeline, summary: { initialTotal: 100, finalTotal: 100 + totalProfit, totalProfit }, todayTip: null };
}

describe('VirtualTradeModal thumbs and auto-switch behavior', () => {
  beforeEach(() => { (runVirtualTrade as jest.Mock).mockReset(); });

  test('best single strategy gets thumb and active tab switches', async () => {
    // strategy results: index 0: 200, index1: 50, index2: 0
    (runVirtualTrade as jest.Mock)
      .mockReturnValueOnce(makeResult(200))
      .mockReturnValueOnce(makeResult(50))
      .mockReturnValueOnce(makeResult(0));

    render(<VirtualTradeModal symbol="X" fundName="F" history={hist} onClose={() => {}} />);

    // Wait for strategies to load (button text should change from "加载中..." to "开始")
    const startBtn = await screen.findByRole('button', { name: /开始/ });
    fireEvent.click(startBtn);

    // expect thumb svg to appear in the first strategy tab and active tab switched
    const svgs = await screen.findAllByTitle('当前收益最高');
    // prefer the SVG element if multiple matches exist
    const svg = svgs.find(el => el.tagName?.toLowerCase() === 'svg') || svgs[0];
    expect(svg).toBeInTheDocument();
    // active tab should be the first (strategy 0) - its button should be aria-pressed true
    const buttons = screen.getAllByRole('button', { name: /策略/ });
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
  });

  test('tie -> earlier index gets thumb', async () => {
    (runVirtualTrade as jest.Mock)
      .mockReturnValueOnce(makeResult(100))
      .mockReturnValueOnce(makeResult(100))
      .mockReturnValueOnce(makeResult(50));

    render(<VirtualTradeModal symbol="X" fundName="F" history={hist} onClose={() => {}} />);
    const startBtn = await screen.findByRole('button', { name: /开始/ });
    fireEvent.click(startBtn);

    const svgs2 = await screen.findAllByTitle('当前收益最高');
    const svg2 = svgs2.find(el => el.tagName?.toLowerCase() === 'svg') || svgs2[0];
    expect(svg2).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: /策略/ });
    // tie between 0 and 1 -> index 0 should have thumb
    expect(buttons[0]).toContainElement(svg2);
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
  });

  test('all zero and no trades -> no thumb and no auto switch', async () => {
    (runVirtualTrade as jest.Mock)
      .mockReturnValueOnce(makeResult(0, false))
      .mockReturnValueOnce(makeResult(0, false))
      .mockReturnValueOnce(makeResult(0, false));

    render(<VirtualTradeModal symbol="X" fundName="F" history={hist} onClose={() => {}} />);
    const startBtn = await screen.findByRole('button', { name: /开始/ });
    fireEvent.click(startBtn);

    await waitFor(() => {
      // no svg with that title
      const found = screen.queryByTitle('当前收益最高');
      expect(found).toBeNull();
    });
    // active tab should remain initial (0)
    const buttons = screen.getAllByRole('button', { name: /策略/ });
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
  });
});
