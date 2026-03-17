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
    const earlyValuation: ValuationData = {
      ...mockValuation,
      currentPrice: 1.2200,
      realtimeDate: '2026-03-16', // Earlier than latest history date (2026-03-17)
      valuationDate: '2026-03-16',
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

  test('should apply rule 2: when valuation date is not later than netWorthDate', () => {
    // Create a valuation where valuation date is not later than netWorthDate
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

    // According to rule 2, when valuation date is not later than netWorthDate,
    // the previousPrice should be adjusted to the closest historical record before valuation date
    // That would be the history from 2026-03-15 with value 1.1800

    if (result) {
      expect(result.previousPrice).toBeCloseTo(1.1800);
      expect(result.netWorthDate).toBe('2026-03-15');
    }

    expect(result).toBeDefined();
  });

  test('should not modify data when no adjustment needed', () => {
    // Create a valuation where no rules apply
    const normalValuation: ValuationData = {
      ...mockValuation,
      currentPrice: 1.2345,
      realtimeDate: '2026-03-17',
      valuationDate: '2026-03-17',
      previousPrice: 1.2000,
      netWorthDate: '2026-03-16', // Earlier than valuation date
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