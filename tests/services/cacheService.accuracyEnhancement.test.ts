import * as cacheService from '../../services/cacheService';
import { ValuationData, HistoricalPoint } from '../../types';

// Mock data for testing
const mockValuation: ValuationData = {
  symbol: '000001',
  name: 'Test Fund',
  currentPrice: 1.2345,
  previousPrice: 1.2000,
  changePercentage: 2.88,
  lastUpdated: '2026-03-17 15:00',
  realtimeDate: '2026-03-17',
  netWorthDate: '2026-03-16',
  valuationDate: '2026-03-17',
  sourceUrl: 'http://example.com'
};

const mockHistory: HistoricalPoint[] = [
  {
    date: new Date('2026-03-15').getTime(),
    value: 1.1800,
    equityReturn: -0.5
  },
  {
    date: new Date('2026-03-16').getTime(),
    value: 1.2000,
    equityReturn: 1.69
  },
  {
    date: new Date('2026-03-17').getTime(),
    value: 1.2400,
    equityReturn: 3.33
  }
];

describe('Cache Service - Accuracy Enhancement', () => {
  beforeEach(() => {
    // Clear cache before each test
    cacheService.evictValuations(new Set());
    cacheService.setValuation('000001', mockValuation);
    cacheService.setHistory('000001', mockHistory);
  });

  afterEach(() => {
    // Clean up
    cacheService.evictValuations(new Set());
    // Clear history
    cacheService.getAllHistories().clear();
  });

  test('should apply rule 1: when valuation date is earlier than latest history date', () => {
    // Create a valuation where valuation date is earlier than the latest history date
    // and netWorthDate is different from valuationDate to test rule 1 independently
    const earlyValuation: ValuationData = {
      ...mockValuation,
      currentPrice: 1.2200,
      realtimeDate: '2026-03-16', // Earlier than latest history date (2026-03-17)
      valuationDate: '2026-03-16',
      netWorthDate: '2026-03-14', // Different from valuationDate to avoid rule 2
    };

    cacheService.setValuation('000001', earlyValuation);

    // With enhancement, it should return the latest history value
    const result = cacheService.getValuation('000001');

    // According to rule 1, when valuation date is earlier than latest history date,
    // the result should use the latest history value as currentPrice
    if (result) {
      // The current price should match the latest history value (1.2400)
      // And the dates should be adjusted accordingly
      expect(result.currentPrice).toBeCloseTo(1.2400);
      expect(result.realtimeDate).toBe('2026-03-17');
      expect(result.valuationDate).toBe('2026-03-17');
    }

    expect(result).toBeDefined();
  });

  test('should apply rule 2: when valuation date equals netWorthDate, replace valuation with confirmed NAV', () => {
    // Create a valuation where valuation date equals netWorthDate
    const conflictingValuation: ValuationData = {
      ...mockValuation,
      currentPrice: 1.2200,
      realtimeDate: '2026-03-16',
      valuationDate: '2026-03-16',
      previousPrice: 1.1900,
      netWorthDate: '2026-03-16', // Same as valuation date
    };

    cacheService.setValuation('000001', conflictingValuation);

    const result = cacheService.getValuation('000001');

    // According to rule 2, when valuation date equals netWorthDate,
    // the valuation should be replaced with the confirmed NAV from that date
    // History: 2026-03-16 = 1.2000, 2026-03-15 = 1.1800
    if (result) {
      // currentPrice should be replaced with the confirmed NAV from 2026-03-16
      expect(result.currentPrice).toBeCloseTo(1.2000);
      expect(result.realtimeDate).toBe('2026-03-16');
      expect(result.valuationDate).toBe('2026-03-16');
      // previousPrice should be the historical value before valuation date
      expect(result.previousPrice).toBeCloseTo(1.1800);
      // netWorthDate should remain the confirmed date
      expect(result.netWorthDate).toBe('2026-03-16');
    }

    expect(result).toBeDefined();
  });

  test('should not modify data when no rules apply', () => {
    // Create a valuation where no rules apply (valuationDate is later than both history and netWorthDate)
    const normalValuation: ValuationData = {
      ...mockValuation,
      currentPrice: 1.2345,
      realtimeDate: '2026-03-18',
      valuationDate: '2026-03-18', // Later than latest history date (2026-03-17)
      previousPrice: 1.2000,
      netWorthDate: '2026-03-17', // Earlier than valuation date
    };

    cacheService.setValuation('000001', normalValuation);

    const result = cacheService.getValuation('000001');

    // The result should remain unchanged when no rules apply
    expect(result).toEqual(normalValuation);
  });

  test('should handle edge case where no history data exists', () => {
    const emptyHistoryValuation: ValuationData = {
      ...mockValuation,
      symbol: '000002'
    };

    cacheService.setValuation('000002', emptyHistoryValuation);
    cacheService.setHistory('000002', []); // Empty history

    const result = cacheService.getValuation('000002');
    // Should return original valuation when no history exists
    expect(result).toBeDefined();
    expect(result?.symbol).toBe('000002');
  });

  test('should handle invalid dates gracefully', () => {
    const invalidValuation: ValuationData = {
      ...mockValuation,
      realtimeDate: 'invalid-date',
      netWorthDate: '---',
    };

    cacheService.setValuation('000003', invalidValuation);

    const result = cacheService.getValuation('000003');
    expect(result).toBeDefined();
  });
});