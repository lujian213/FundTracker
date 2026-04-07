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

  describe('changePercentage recalculation', () => {
    test('Rule 1: should recalculate changePercentage when prices are adjusted', () => {
      // 场景：估值数据使用历史数据替换后，涨跌幅需要重新计算
      // 原估值：currentPrice=0.6297, previousPrice=0.6396 → -1.54%
      // 调整后：currentPrice=0.6396 (04-03净值), previousPrice=0.6391 (04-02净值) → ~+0.08%
      const historyData: HistoricalPoint[] = [
        { date: new Date('2026-04-01').getTime(), value: 0.6506, equityReturn: 0 },
        { date: new Date('2026-04-02').getTime(), value: 0.6391, equityReturn: -1.76 },
        { date: new Date('2026-04-03').getTime(), value: 0.6396, equityReturn: 0.08 },
      ];

      const valuationData: ValuationData = {
        symbol: '012349',
        name: '天弘恒生科技ETF联接C',
        currentPrice: 0.6297,  // 过时的估值
        previousPrice: 0.6396,
        changePercentage: -1.54,  // 原涨跌幅（错误）
        lastUpdated: '2026-04-02 16:00',
        realtimeDate: '2026-04-02',
        valuationDate: '2026-04-02 16:00',
        netWorthDate: '2026-04-03',
        sourceUrl: 'http://example.com'
      };

      cacheService.setValuation('012349', valuationData);
      cacheService.setHistory('012349', historyData);

      const result = cacheService.getValuation('012349');

      expect(result).toBeDefined();
      // Rule 1 应生效：valuationDate(04-02) < latestHistoryDate(04-03)
      expect(result?.currentPrice).toBeCloseTo(0.6396);  // 使用04-03净值
      expect(result?.previousPrice).toBeCloseTo(0.6391);  // 使用04-02净值

      // 涨跌幅应该重新计算：(0.6396 - 0.6391) / 0.6391 * 100 ≈ 0.078%
      const expectedChangePercentage = ((0.6396 - 0.6391) / 0.6391) * 100;
      expect(result?.changePercentage).toBeCloseTo(expectedChangePercentage, 2);
      // 不应该是原来的 -1.54%
      expect(result?.changePercentage).not.toBeCloseTo(-1.54, 1);
    });

    test('Rule 2 branch A: should recalculate changePercentage when valuation equals netWorthDate', () => {
      // 场景：Rule 2分支A生效，替换估值数据
      // 关键：valuationDate要大于latestHistoryDate，且等于netWorthDate
      // 这样closestHistory会是latestHistory（03-31），previousPrice会是03-30
      const historyData: HistoricalPoint[] = [
        { date: new Date('2026-03-29').getTime(), value: 1.1400, equityReturn: 0 },
        { date: new Date('2026-03-30').getTime(), value: 1.1500, equityReturn: 0.88 },
        { date: new Date('2026-03-31').getTime(), value: 1.1600, equityReturn: 0.87 },
      ];

      const valuationData: ValuationData = {
        symbol: 'testRule2A',
        name: 'Test Fund',
        currentPrice: 1.2000,  // 过时估值
        previousPrice: 1.1000,
        changePercentage: 9.09,  // 原涨跌幅（错误）
        lastUpdated: '2026-04-01 16:00',
        realtimeDate: '2026-04-01',
        valuationDate: '2026-04-01 16:00',
        netWorthDate: '2026-04-01',  // 与valuationDate日期相同，触发Rule 2
        sourceUrl: 'http://example.com'
      };

      cacheService.setValuation('testRule2A', valuationData);
      cacheService.setHistory('testRule2A', historyData);

      const result = cacheService.getValuation('testRule2A');

      expect(result).toBeDefined();
      // Rule 2 分支A生效
      // valuationDate日期=04-01 > latestHistoryDate=03-31，所以Rule 1不生效
      // currentValuationDate = 04-01 (从valuationDate提取日期部分)
      // currentNetWorthDate = 04-01
      // closestHistory = 03-31 (满足 <= 04-01)
      // previousPrice查找 < 04-01，先检查03-31(日期03-31<04-01)，所以previousPrice=1.1600
      expect(result?.currentPrice).toBeCloseTo(1.1600);  // closestHistory (03-31)
      expect(result?.previousPrice).toBeCloseTo(1.1600);  // 也是03-31，因为03-31 < 04-01

      // 这种情况下涨跌幅为0
      const expectedChangePercentage = 0;
      expect(result?.changePercentage).toBeCloseTo(expectedChangePercentage, 2);
    });

    test('Rule 2 branch B: should recalculate changePercentage when only previousPrice changes', () => {
      // 场景：Rule 2分支B生效（valuationDate < netWorthDate）
      // 这是边缘情况：估值日期比净值确认日期早
      // 构造数据使Rule 1不生效（valuationDate > latestHistoryDate）
      // 同时Rule 2条件满足（valuationDate < netWorthDate）
      const historyData: HistoricalPoint[] = [
        { date: new Date('2026-03-28').getTime(), value: 1.1300, equityReturn: 0 },
        { date: new Date('2026-03-29').getTime(), value: 1.1400, equityReturn: 0.88 },
      ];

      const valuationData: ValuationData = {
        symbol: 'testRule2B',
        name: 'Test Fund',
        currentPrice: 1.2000,  // 保持不变
        previousPrice: 1.1000,  // 会被调整
        changePercentage: 9.09,  // 原涨跌幅（错误）
        lastUpdated: '2026-03-30 16:00',
        realtimeDate: '2026-03-30',
        valuationDate: '2026-03-30 16:00',  // 晚于latestHistoryDate(03-29)，Rule 1不生效
        netWorthDate: '2026-03-31',  // 早于valuationDate，触发Rule 2分支B
        sourceUrl: 'http://example.com'
      };

      cacheService.setValuation('testRule2B', valuationData);
      cacheService.setHistory('testRule2B', historyData);

      const result = cacheService.getValuation('testRule2B');

      expect(result).toBeDefined();
      // Rule 1 不生效（03-30 > 03-29）
      // Rule 2 检查：03-30 <= 03-31? Yes，且不等于，所以分支B生效
      // closestHistory = 03-29 (1.1400)，因为 03-29 <= 03-30
      expect(result?.currentPrice).toBeCloseTo(1.2000);  // 保持不变
      expect(result?.previousPrice).toBeCloseTo(1.1400);  // 调整为closestHistory

      // 涨跌幅重新计算：(1.2000 - 1.1400) / 1.1400 * 100 ≈ 5.26%
      const expectedChangePercentage = ((1.2000 - 1.1400) / 1.1400) * 100;
      expect(result?.changePercentage).toBeCloseTo(expectedChangePercentage, 2);
    });
  });

  describe('lastUpdated format consistency', () => {
    test('Rule 1: lastUpdated should use net worth date with time format', () => {
      const historyData: HistoricalPoint[] = [
        { date: new Date('2026-04-01').getTime(), value: 1.1553, equityReturn: 0 },
        { date: new Date('2026-04-02').getTime(), value: 1.1342, equityReturn: -1.83 },
        { date: new Date('2026-04-03').getTime(), value: 1.1351, equityReturn: 0.08 },
      ];

      const valuationData: ValuationData = {
        symbol: 'testLastUpdated',
        name: 'Test Fund',
        currentPrice: 1.1167,
        previousPrice: 1.1342,
        changePercentage: -1.54,
        lastUpdated: '2026-04-02 16:00',
        realtimeDate: '2026-04-02',
        valuationDate: '2026-04-02 16:00',
        netWorthDate: '2026-04-03',
        sourceUrl: 'http://example.com'
      };

      cacheService.setValuation('testLastUpdated', valuationData);
      cacheService.setHistory('testLastUpdated', historyData);

      const result = cacheService.getValuation('testLastUpdated');

      expect(result).toBeDefined();
      // lastUpdated 应更新为净值日期 + 时间格式
      expect(result?.lastUpdated).toBe('2026-04-03 15:00');
      expect(result?.realtimeDate).toBe('2026-04-03');
      expect(result?.valuationDate).toBe('2026-04-03');
    });

    test('Rule 2 branch A: lastUpdated should use net worth date with time format', () => {
      const historyData: HistoricalPoint[] = [
        { date: new Date('2026-03-30').getTime(), value: 1.1500, equityReturn: 0 },
        { date: new Date('2026-03-31').getTime(), value: 1.1600, equityReturn: 0.87 },
      ];

      const valuationData: ValuationData = {
        symbol: 'testLastUpdatedR2A',
        name: 'Test Fund',
        currentPrice: 1.2000,
        previousPrice: 1.1000,
        changePercentage: 9.09,
        lastUpdated: '2026-04-01 16:00',
        realtimeDate: '2026-04-01',
        valuationDate: '2026-04-01',
        netWorthDate: '2026-04-01',
        sourceUrl: 'http://example.com'
      };

      cacheService.setValuation('testLastUpdatedR2A', valuationData);
      cacheService.setHistory('testLastUpdatedR2A', historyData);

      const result = cacheService.getValuation('testLastUpdatedR2A');

      expect(result).toBeDefined();
      // lastUpdated 应更新为净值日期 + 时间格式
      // closestHistory 是 03-31
      expect(result?.lastUpdated).toBe('2026-03-31 15:00');
    });
  });
});