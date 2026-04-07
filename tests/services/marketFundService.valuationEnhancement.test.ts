import * as marketFundService from '../../services/marketFundService';
import { ValuationData, HistoricalPoint } from '../../types';

// Helper to create a timestamp from date string
function dateToTimestamp(dateStr: string): number {
  return new Date(dateStr).getTime();
}

describe('marketFundService - Valuation Enhancement', () => {
  beforeEach(() => {
    localStorage.clear();
    marketFundService.resetCache();
  });

  afterEach(() => {
    localStorage.clear();
    marketFundService.resetCache();
  });

  describe('getValuation and getRawValuation', () => {
    test('getValuation returns undefined for non-existent fund', () => {
      const result = marketFundService.getValuation('nonexistent');
      expect(result).toBeUndefined();
    });

    test('getRawValuation returns undefined for non-existent fund', () => {
      const result = marketFundService.getRawValuation('nonexistent');
      expect(result).toBeUndefined();
    });

    test('getRawValuation returns original valuation without enhancement', () => {
      const valuation: ValuationData = {
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

      // Add fund with valuation but no history
      marketFundService.updateValuation('000001', valuation);

      const rawResult = marketFundService.getRawValuation('000001');
      expect(rawResult).toBeDefined();
      expect(rawResult?.currentPrice).toBe(1.2345);
      expect(rawResult?.changePercentage).toBe(2.88);
      // Should match original valuation exactly
      expect(rawResult).toEqual(valuation);
    });

    test('getValuation returns original valuation when no history exists', () => {
      const valuation: ValuationData = {
        symbol: '000002',
        name: 'Test Fund 2',
        currentPrice: 1.5000,
        previousPrice: 1.4500,
        changePercentage: 3.45,
        lastUpdated: '2026-03-18 15:00',
        realtimeDate: '2026-03-18',
        netWorthDate: '2026-03-17',
        valuationDate: '2026-03-18',
        sourceUrl: 'http://example.com'
      };

      marketFundService.updateValuation('000002', valuation);

      const result = marketFundService.getValuation('000002');
      expect(result).toBeDefined();
      // Without history, should return original valuation
      expect(result).toEqual(valuation);
    });
  });

  describe('Rule 1: valuationDate <= latestHistoryDate', () => {
    test('should apply Rule 1 when valuation date is earlier than latest history date', () => {
      const history: HistoricalPoint[] = [
        { date: dateToTimestamp('2026-03-15'), value: 1.1800, equityReturn: -0.5 },
        { date: dateToTimestamp('2026-03-16'), value: 1.2000, equityReturn: 1.69 },
        { date: dateToTimestamp('2026-03-17'), value: 1.2400, equityReturn: 3.33 }
      ];

      const valuation: ValuationData = {
        symbol: '000001',
        name: 'Test Fund',
        currentPrice: 1.2200,
        previousPrice: 1.2000,
        changePercentage: 1.67,
        lastUpdated: '2026-03-16 15:00',
        realtimeDate: '2026-03-16',
        netWorthDate: '2026-03-14',
        valuationDate: '2026-03-16',
        sourceUrl: 'http://example.com'
      };

      marketFundService.updateValuation('000001', valuation);
      marketFundService.updateHistory('000001', history);

      const enhanced = marketFundService.getValuation('000001');
      const raw = marketFundService.getRawValuation('000001');

      expect(enhanced).toBeDefined();
      expect(raw).toBeDefined();

      // Raw should be unchanged
      expect(raw?.currentPrice).toBe(1.2200);
      expect(raw?.realtimeDate).toBe('2026-03-16');

      // Enhanced should use latest history (Rule 1)
      expect(enhanced?.currentPrice).toBeCloseTo(1.2400);
      expect(enhanced?.previousPrice).toBeCloseTo(1.2000);
      expect(enhanced?.realtimeDate).toBe('2026-03-17');
      expect(enhanced?.valuationDate).toBe('2026-03-17');
      expect(enhanced?.lastUpdated).toBe('2026-03-17 15:00');

      // Change percentage should be recalculated
      const expectedChange = ((1.2400 - 1.2000) / 1.2000) * 100;
      expect(enhanced?.changePercentage).toBeCloseTo(expectedChange, 2);
    });

    test('should apply Rule 1 and skip Rule 2 when both conditions could apply', () => {
      // This tests the interaction: Rule 1 should take precedence
      const history: HistoricalPoint[] = [
        { date: dateToTimestamp('2026-04-01'), value: 1.1553, equityReturn: 0 },
        { date: dateToTimestamp('2026-04-02'), value: 1.1342, equityReturn: -1.83 },
        { date: dateToTimestamp('2026-04-03'), value: 1.1351, equityReturn: 0.08 }
      ];

      const valuation: ValuationData = {
        symbol: '015283',
        name: 'QDII Fund',
        currentPrice: 1.1167,
        previousPrice: 1.1342,
        changePercentage: -1.54,
        lastUpdated: '2026-04-02 16:00',
        realtimeDate: '2026-04-02',
        valuationDate: '2026-04-02 16:00',
        netWorthDate: '2026-04-02', // Same date as valuationDate (would trigger Rule 2)
        sourceUrl: 'http://example.com'
      };

      marketFundService.updateValuation('015283', valuation);
      marketFundService.updateHistory('015283', history);

      const result = marketFundService.getValuation('015283');

      expect(result).toBeDefined();
      // Rule 1 should apply: valuationDate (04-02) < latestHistoryDate (04-03)
      expect(result?.currentPrice).toBeCloseTo(1.1351);
      expect(result?.previousPrice).toBeCloseTo(1.1342);
      expect(result?.realtimeDate).toBe('2026-04-03');
      // Rule 2 should NOT overwrite this
      expect(result?.netWorthDate).toBe('2026-04-02');
    });
  });

  describe('Rule 2: valuationDate <= netWorthDate', () => {
    test('should apply Rule 2 branch A when valuationDate equals netWorthDate', () => {
      // valuationDate needs to be > latestHistoryDate for Rule 2 to apply
      const history: HistoricalPoint[] = [
        { date: dateToTimestamp('2026-03-14'), value: 1.1800, equityReturn: -0.5 },
        { date: dateToTimestamp('2026-03-15'), value: 1.1900, equityReturn: 0.85 }
      ];

      const valuation: ValuationData = {
        symbol: 'rule2test',
        name: 'Test Fund',
        currentPrice: 1.2200,
        previousPrice: 1.2000,
        changePercentage: 1.67,
        lastUpdated: '2026-03-16 15:00',
        realtimeDate: '2026-03-16',
        valuationDate: '2026-03-16',
        netWorthDate: '2026-03-16', // Same as valuationDate
        sourceUrl: 'http://example.com'
      };

      marketFundService.updateValuation('rule2test', valuation);
      marketFundService.updateHistory('rule2test', history);

      const result = marketFundService.getValuation('rule2test');

      expect(result).toBeDefined();
      // Rule 2: use closest history (03-15 = 1.1900)
      expect(result?.currentPrice).toBeCloseTo(1.1900);
      expect(result?.realtimeDate).toBe('2026-03-15');
      expect(result?.valuationDate).toBe('2026-03-15');
      expect(result?.lastUpdated).toBe('2026-03-15 15:00');
    });

    test('should apply Rule 2 branch B when valuationDate < netWorthDate', () => {
      const history: HistoricalPoint[] = [
        { date: dateToTimestamp('2026-03-28'), value: 1.1300, equityReturn: 0 },
        { date: dateToTimestamp('2026-03-29'), value: 1.1400, equityReturn: 0.88 }
      ];

      const valuation: ValuationData = {
        symbol: 'rule2btest',
        name: 'Test Fund',
        currentPrice: 1.2000,
        previousPrice: 1.1000,
        changePercentage: 9.09,
        lastUpdated: '2026-03-30 16:00',
        realtimeDate: '2026-03-30',
        valuationDate: '2026-03-30',
        netWorthDate: '2026-03-31', // Later than valuationDate
        sourceUrl: 'http://example.com'
      };

      marketFundService.updateValuation('rule2btest', valuation);
      marketFundService.updateHistory('rule2btest', history);

      const result = marketFundService.getValuation('rule2btest');

      expect(result).toBeDefined();
      // currentPrice should stay unchanged
      expect(result?.currentPrice).toBeCloseTo(1.2000);
      // previousPrice should be updated to closest history
      expect(result?.previousPrice).toBeCloseTo(1.1400);
      // netWorthDate should be updated
      expect(result?.netWorthDate).toBe('2026-03-29');
      // changePercentage should be recalculated
      const expectedChange = ((1.2000 - 1.1400) / 1.1400) * 100;
      expect(result?.changePercentage).toBeCloseTo(expectedChange, 2);
    });
  });

  describe('No rules apply', () => {
    test('should return original valuation when valuationDate is later than both history and netWorthDate', () => {
      const history: HistoricalPoint[] = [
        { date: dateToTimestamp('2026-03-15'), value: 1.1800, equityReturn: -0.5 },
        { date: dateToTimestamp('2026-03-16'), value: 1.2000, equityReturn: 1.69 },
        { date: dateToTimestamp('2026-03-17'), value: 1.2400, equityReturn: 3.33 }
      ];

      const valuation: ValuationData = {
        symbol: 'normaltest',
        name: 'Test Fund',
        currentPrice: 1.2345,
        previousPrice: 1.2000,
        changePercentage: 2.88,
        lastUpdated: '2026-03-18 15:00',
        realtimeDate: '2026-03-18',
        netWorthDate: '2026-03-17',
        valuationDate: '2026-03-18',
        sourceUrl: 'http://example.com'
      };

      marketFundService.updateValuation('normaltest', valuation);
      marketFundService.updateHistory('normaltest', history);

      const result = marketFundService.getValuation('normaltest');

      // No rules apply, should return original
      expect(result).toEqual(valuation);
    });
  });

  describe('getAllValuations', () => {
    test('getAllValuations returns enhanced valuations for all funds', () => {
      const history1: HistoricalPoint[] = [
        { date: dateToTimestamp('2026-03-15'), value: 1.1800, equityReturn: 0 },
        { date: dateToTimestamp('2026-03-16'), value: 1.2000, equityReturn: 1.69 },
        { date: dateToTimestamp('2026-03-17'), value: 1.2400, equityReturn: 3.33 }
      ];

      const valuation1: ValuationData = {
        symbol: '000001',
        name: 'Fund 1',
        currentPrice: 1.2200,
        previousPrice: 1.2000,
        changePercentage: 1.67,
        lastUpdated: '2026-03-16 15:00',
        realtimeDate: '2026-03-16',
        valuationDate: '2026-03-16',
        netWorthDate: '2026-03-14',
        sourceUrl: 'http://example.com'
      };

      const valuation2: ValuationData = {
        symbol: '000002',
        name: 'Fund 2',
        currentPrice: 2.0000,
        previousPrice: 1.9000,
        changePercentage: 5.26,
        lastUpdated: '2026-03-18 15:00',
        realtimeDate: '2026-03-18',
        netWorthDate: '2026-03-17',
        valuationDate: '2026-03-18',
        sourceUrl: 'http://example.com'
      };

      marketFundService.updateValuation('000001', valuation1);
      marketFundService.updateHistory('000001', history1);
      marketFundService.updateValuation('000002', valuation2);

      const allValuations = marketFundService.getAllValuations();

      expect(allValuations['000001']).toBeDefined();
      expect(allValuations['000002']).toBeDefined();

      // 000001 should be enhanced (Rule 1 applied)
      expect(allValuations['000001'].currentPrice).toBeCloseTo(1.2400);
      expect(allValuations['000001'].realtimeDate).toBe('2026-03-17');

      // 000002 should not be enhanced (no history)
      expect(allValuations['000002'].currentPrice).toBe(2.0000);
    });
  });

  describe('Edge cases', () => {
    test('should handle single history point', () => {
      const history: HistoricalPoint[] = [
        { date: dateToTimestamp('2026-03-17'), value: 1.2400, equityReturn: 3.33 }
      ];

      const valuation: ValuationData = {
        symbol: 'singlehist',
        name: 'Test Fund',
        currentPrice: 1.2200,
        previousPrice: 1.2000,
        changePercentage: 1.67,
        lastUpdated: '2026-03-16 15:00',
        realtimeDate: '2026-03-16',
        netWorthDate: '2026-03-14',
        valuationDate: '2026-03-16',
        sourceUrl: 'http://example.com'
      };

      marketFundService.updateValuation('singlehist', valuation);
      marketFundService.updateHistory('singlehist', history);

      const result = marketFundService.getValuation('singlehist');

      expect(result).toBeDefined();
      // Rule 1 should apply
      expect(result?.currentPrice).toBeCloseTo(1.2400);
      // With single history, previousPrice should remain from original valuation
      expect(result?.previousPrice).toBeCloseTo(1.2000);
    });

    test('should handle valuation with time in valuationDate', () => {
      const history: HistoricalPoint[] = [
        { date: dateToTimestamp('2026-04-01'), value: 1.1553, equityReturn: 0 },
        { date: dateToTimestamp('2026-04-02'), value: 1.1342, equityReturn: -1.83 },
        { date: dateToTimestamp('2026-04-03'), value: 1.1351, equityReturn: 0.08 }
      ];

      const valuation: ValuationData = {
        symbol: 'timetest',
        name: 'Test Fund',
        currentPrice: 1.1167,
        previousPrice: 1.1342,
        changePercentage: -1.54,
        lastUpdated: '2026-04-02 16:00',
        realtimeDate: '2026-04-02',
        valuationDate: '2026-04-02 16:00', // Contains time
        netWorthDate: '2026-04-02',
        sourceUrl: 'http://example.com'
      };

      marketFundService.updateValuation('timetest', valuation);
      marketFundService.updateHistory('timetest', history);

      const result = marketFundService.getValuation('timetest');

      expect(result).toBeDefined();
      // Rule 1 should apply: valuationDate date part (04-02) < latestHistoryDate (04-03)
      expect(result?.currentPrice).toBeCloseTo(1.1351);
      expect(result?.lastUpdated).toBe('2026-04-03 15:00');
    });

    test('should handle change percentage recalculation correctly', () => {
      const history: HistoricalPoint[] = [
        { date: dateToTimestamp('2026-04-01'), value: 0.6506, equityReturn: 0 },
        { date: dateToTimestamp('2026-04-02'), value: 0.6391, equityReturn: -1.76 },
        { date: dateToTimestamp('2026-04-03'), value: 0.6396, equityReturn: 0.08 }
      ];

      const valuation: ValuationData = {
        symbol: 'changetest',
        name: 'Test Fund',
        currentPrice: 0.6297,
        previousPrice: 0.6396,
        changePercentage: -1.54,
        lastUpdated: '2026-04-02 16:00',
        realtimeDate: '2026-04-02',
        valuationDate: '2026-04-02',
        netWorthDate: '2026-04-03',
        sourceUrl: 'http://example.com'
      };

      marketFundService.updateValuation('changetest', valuation);
      marketFundService.updateHistory('changetest', history);

      const result = marketFundService.getValuation('changetest');

      expect(result).toBeDefined();
      expect(result?.currentPrice).toBeCloseTo(0.6396);
      expect(result?.previousPrice).toBeCloseTo(0.6391);

      const expectedChange = ((0.6396 - 0.6391) / 0.6391) * 100;
      expect(result?.changePercentage).toBeCloseTo(expectedChange, 2);
      expect(result?.changePercentage).not.toBeCloseTo(-1.54, 1);
    });
  });
});