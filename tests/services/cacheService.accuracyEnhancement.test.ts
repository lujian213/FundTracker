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
    // IMPORTANT: valuationDate must be LATER than latestHistoryDate for Rule 2 to apply
    // (otherwise Rule 1 will apply first and skip Rule 2)
    const historyForRule2Test: HistoricalPoint[] = [
      { date: new Date('2026-03-14').getTime(), value: 1.1800, equityReturn: -0.5 },
      { date: new Date('2026-03-15').getTime(), value: 1.1900, equityReturn: 0.85 },
    ];

    const conflictingValuation: ValuationData = {
      ...mockValuation,
      symbol: 'rule2test',
      currentPrice: 1.2200,
      realtimeDate: '2026-03-16',
      valuationDate: '2026-03-16',          // Later than latest history (03-15)
      previousPrice: 1.2000,
      netWorthDate: '2026-03-16',           // Same as valuation date
    };

    cacheService.setValuation('rule2test', conflictingValuation);
    cacheService.setHistory('rule2test', historyForRule2Test);

    const result = cacheService.getValuation('rule2test');

    // According to rule 2, when valuation date equals netWorthDate,
    // the valuation should be replaced with the confirmed NAV from that date
    // Since there's no history on 03-16, closestHistory would be 03-15 (1.1900)
    if (result) {
      // currentPrice should be replaced with the closest history value (03-15 = 1.1900)
      expect(result.currentPrice).toBeCloseTo(1.1900);
      expect(result.realtimeDate).toBe('2026-03-15');
      expect(result.valuationDate).toBe('2026-03-15');
      // netWorthDate should be updated
      expect(result.netWorthDate).toBe('2026-03-15');
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

  describe('Rule 1 and Rule 2 interaction', () => {
    test('should skip Rule 2 when Rule 1 has already applied', () => {
      // Scenario: valuationDate (04-02) < latestHistoryDate (04-03)
      // AND valuationDate (04-02) === netWorthDate (04-02)
      // Without the fix, Rule 2 would incorrectly overwrite Rule 1's result
      const historyWithLaterDate: HistoricalPoint[] = [
        { date: new Date('2026-04-01').getTime(), value: 1.1553, equityReturn: 0 },
        { date: new Date('2026-04-02').getTime(), value: 1.1342, equityReturn: -1.83 },
        { date: new Date('2026-04-03').getTime(), value: 1.1351, equityReturn: 0.08 },
      ];

      const valuationWithEarlierDate: ValuationData = {
        symbol: '015283',
        name: 'Test QDII Fund',
        currentPrice: 1.1167,  // Estimated value
        previousPrice: 1.1342,
        changePercentage: -1.54,
        lastUpdated: '2026-04-02 16:00',
        realtimeDate: '2026-04-02',
        valuationDate: '2026-04-02 16:00',  // Earlier than latest history
        netWorthDate: '2026-04-02',          // Same as valuationDate (would trigger Rule 2)
        sourceUrl: 'http://example.com'
      };

      cacheService.setValuation('015283', valuationWithEarlierDate);
      cacheService.setHistory('015283', historyWithLaterDate);

      const result = cacheService.getValuation('015283');

      expect(result).toBeDefined();
      // Rule 1 should apply: use latest history value (04-03 = 1.1351)
      expect(result?.currentPrice).toBeCloseTo(1.1351);
      expect(result?.previousPrice).toBeCloseTo(1.1342);  // 04-02 history value
      expect(result?.realtimeDate).toBe('2026-04-03');
      expect(result?.valuationDate).toBe('2026-04-03');
      // Rule 2 should NOT overwrite this - netWorthDate should be updated by Rule 1
      expect(result?.netWorthDate).toBe('2026-04-02');
    });

    test('should apply Rule 2 when Rule 1 does not apply', () => {
      // Scenario: valuationDate (04-02) > latestHistoryDate (04-01)
      // AND valuationDate (04-02) === netWorthDate (04-02)
      // Rule 1 does not apply, so Rule 2 should apply
      const historyWithEarlierDate: HistoricalPoint[] = [
        { date: new Date('2026-03-31').getTime(), value: 1.1600, equityReturn: 0 },
        { date: new Date('2026-04-01').getTime(), value: 1.1553, equityReturn: -0.4 },
      ];

      const valuationWithLaterDate: ValuationData = {
        symbol: '000004',
        name: 'Test Fund',
        currentPrice: 1.1167,
        previousPrice: 1.1342,
        changePercentage: -1.54,
        lastUpdated: '2026-04-02 16:00',
        realtimeDate: '2026-04-02',
        valuationDate: '2026-04-02 16:00',  // Later than latest history
        netWorthDate: '2026-04-02',          // Same as valuationDate
        sourceUrl: 'http://example.com'
      };

      cacheService.setValuation('000004', valuationWithLaterDate);
      cacheService.setHistory('000004', historyWithEarlierDate);

      const result = cacheService.getValuation('000004');

      expect(result).toBeDefined();
      // Rule 1 does NOT apply (valuationDate > latestHistoryDate)
      // Rule 2 applies: find history on or before valuationDate
      // But there's no history on 04-02, so closestHistory would be 04-01 (1.1553)
      // However, the condition checks valuationDate === netWorthDate, which is true
      // So currentPrice should be set to closest history value
      expect(result?.currentPrice).toBeCloseTo(1.1553);  // 04-01 history value (closest to 04-02)
    });
  });
});