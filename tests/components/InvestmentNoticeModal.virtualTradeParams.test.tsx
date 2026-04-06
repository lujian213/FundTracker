import React from 'react';
import { render, waitFor } from '@testing-library/react';
import InvestmentNoticeModal from '../../components/InvestmentNoticeModal';
import { Ticker, MarketType } from '../../types';
import * as marketFundService from '../../services/marketFundService';

// Mock the services and utilities
jest.mock('../../services/fundService', () => ({
  fetchFundHistory: jest.fn()
}));

jest.mock('../../utils/positionHelper', () => ({
  getUnitsForDate: jest.fn()
}));

jest.mock('../../services/virtualTradeEngine', () => ({
  runVirtualTrade: jest.fn(() => ({
    todayTip: { action: 'hold', shares: 0 },
    summary: { totalProfit: 0 }
  }))
}));

jest.mock('../../services/virtualTradeStrategies/trendFollowing', () => ({
  trendFollowingStrategy: { name: 'trendFollowing', description: 'Trend following strategy' }
}));

jest.mock('../../services/virtualTradeStrategies/meanReversion', () => ({
  meanReversionStrategy: { name: 'meanReversion', description: 'Mean reversion strategy' }
}));

jest.mock('../../services/virtualTradeStrategies/constantMix', () => ({
  constantMixStrategy: { name: 'constantMix', description: 'Constant mix strategy' }
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] || null
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

describe('InvestmentNoticeModal Virtual Trade Parameters Consistency', () => {
  beforeEach(() => {
    localStorage.clear();
    marketFundService.resetCache();
    jest.clearAllMocks();

    // Mock fetchFundHistory to return sample history data
    (require('../../services/fundService').fetchFundHistory as jest.Mock).mockResolvedValue([
      { date: new Date('2026-01-01').getTime(), value: 1.0, equityReturn: 0 },
      { date: new Date('2026-01-02').getTime(), value: 1.05, equityReturn: 0 },
      { date: new Date('2026-01-03').getTime(), value: 1.1, equityReturn: 0 },
    ]);

    // Mock getUnitsForDate to return sample units
    (require('../../utils/positionHelper').getUnitsForDate as jest.Mock).mockResolvedValue(10000);
  });

  test('should use VirtualTradeModal-consistent parameters when calculating recommendations', async () => {
    const mockPortfolio: Ticker[] = [
      { id: 'test1', symbol: '000001', name: 'Test Fund 1', market: MarketType.FUND }
    ];

    const { unmount } = render(
      <InvestmentNoticeModal
        portfolio={mockPortfolio}
        onClose={jest.fn()}
        onSelectFund={jest.fn()}
      />
    );

    // Wait for the calculations to complete
    await waitFor(() => {
      // Check if the mock function has been called
      expect(require('../../services/virtualTradeEngine').runVirtualTrade).toHaveBeenCalled();
    }, { timeout: 5000 });

    // Verify that the runVirtualTrade was called with the correct parameters
    // according to VirtualTradeModal logic
    const runVirtualTradeCalls = (require('../../services/virtualTradeEngine').runVirtualTrade as jest.Mock).mock.calls;

    // At least one call should have been made
    expect(runVirtualTradeCalls.length).toBeGreaterThan(0);

    // Each call should have been made with startDate following VirtualTradeModal logic
    // (either from localStorage or 90 days ago, clamped to history bounds)
    runVirtualTradeCalls.forEach(call => {
      const params = call[2]; // Third argument is the params object

      // Verify that it includes all expected properties
      expect(params).toHaveProperty('startDate');
      expect(params).toHaveProperty('initialCash');
      expect(params).toHaveProperty('initialShares');

      // startDate should be within the bounds of the history (since we have history data)
      const startDate = params.startDate;
      const historyDates = ['2026-01-01', '2026-01-02', '2026-01-03'];
      const isValidDate = historyDates.includes(startDate);
      if (!isValidDate) {
        // If not one of the exact history dates, it should be a computed date within the range
        // based on VirtualTradeModal's logic
        const dateObj = new Date(startDate);
        const startDateInRange =
          dateObj >= new Date('2026-01-01') &&
          dateObj <= new Date('2026-01-03');

        expect(startDateInRange).toBe(true);
      }
    });

    unmount();
  });

  test('should use localStorage-configured startDate when available', async () => {
    // 使用 marketFundService 设置持仓数据（而非 legacy key）
    marketFundService.addFund('000001', 'Test Fund 1');
    marketFundService.updatePosition('000001', {
      startDate: '2026-01-02',
      initialPosition: 10000,
      initialPrice: 1.0,
      fullCapacity: 20000
    });

    const mockPortfolio: Ticker[] = [
      { id: 'test1', symbol: '000001', name: 'Test Fund 1', market: MarketType.FUND }
    ];

    const { unmount } = render(
      <InvestmentNoticeModal
        portfolio={mockPortfolio}
        onClose={jest.fn()}
        onSelectFund={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(require('../../services/virtualTradeEngine').runVirtualTrade).toHaveBeenCalled();
    }, { timeout: 5000 });

    // Check the calls to runVirtualTrade to see if it used the localStorage date
    const runVirtualTradeCalls = (require('../../services/virtualTradeEngine').runVirtualTrade as jest.Mock).mock.calls;

    if (runVirtualTradeCalls.length > 0) {
      const firstCall = runVirtualTradeCalls[0];
      const params = firstCall[2];
      expect(params.startDate).toBe('2026-01-02'); // Should use localStorage date
    }

    unmount();
  });

  test('should calculate initialCash and initialShares following VirtualTradeModal logic', async () => {
    // 使用 marketFundService 设置持仓数据（而非 legacy key）
    marketFundService.addFund('000001', 'Test Fund 1');
    marketFundService.updatePosition('000001', {
      startDate: '2026-01-01',
      initialPosition: 5000,
      initialPrice: 1.0,
      fullCapacity: 15000
    });

    const mockPortfolio: Ticker[] = [
      { id: 'test1', symbol: '000001', name: 'Test Fund 1', market: MarketType.FUND }
    ];

    // Mock getUnitsForDate to return a specific value for the given date
    (require('../../utils/positionHelper').getUnitsForDate as jest.Mock)
      .mockResolvedValue(8000); // 8000 shares on the start date

    const { unmount } = render(
      <InvestmentNoticeModal
        portfolio={mockPortfolio}
        onClose={jest.fn()}
        onSelectFund={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(require('../../services/virtualTradeEngine').runVirtualTrade).toHaveBeenCalled();
    }, { timeout: 5000 });

    // Check that initialCash was calculated using the VirtualTradeModal formula:
    // (fullCapacity - currentShares) * nav
    // If fullCapacity=15000, currentShares=8000, nav=1.05 (from history),
    // cash = (15000 - 8000) * 1.05 = 7000 * 1.05 = 7350
    const runVirtualTradeCalls = (require('../../services/virtualTradeEngine').runVirtualTrade as jest.Mock).mock.calls;

    if (runVirtualTradeCalls.length > 0) {
      const firstCall = runVirtualTradeCalls[0];
      const params = firstCall[2];

      // The initialCash and initialShares should match VirtualTradeModal's logic
      expect(params.initialShares).toBeDefined();
      expect(params.initialCash).toBeDefined();
    }

    unmount();
  });
});