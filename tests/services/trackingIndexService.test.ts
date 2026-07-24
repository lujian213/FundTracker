import { parseTrackingIndex, fetchTrackingIndexChangePercent, fetchValuationByTrackingIndex, fetchSectorQuote, isSectorConfig, isGlobalIndexConfig, isHKIndexConfig, IndexMarket, SECTOR_MARKET_CODE } from '../../services/trackingIndexService';
import * as marketFundService from '../../services/marketFundService';

jest.mock('../../services/marketFundService', () => ({
  getHistory: jest.fn(),
}));

// Mock fundService 的交易时段解析函数
jest.mock('../../services/fundService', () => ({
  parseF80TradingPeriods: (f80: string) => {
    if (!f80) return [];
    const beginMatches = [...f80.matchAll(/"b":(\d{12})/g)] as RegExpMatchArray[];
    const endMatches = [...f80.matchAll(/"e":(\d{12})/g)] as RegExpMatchArray[];
    const periods: { beginDate: string; endDate: string; beginHHMM: number; endHHMM: number }[] = [];
    for (let i = 0; i < beginMatches.length && i < endMatches.length; i++) {
      const beginNum = beginMatches[i][1];
      const endNum = endMatches[i][1];
      periods.push({
        beginDate: `${beginNum.substring(0, 4)}-${beginNum.substring(4, 6)}-${beginNum.substring(6, 8)}`,
        endDate: `${endNum.substring(0, 4)}-${endNum.substring(4, 6)}-${endNum.substring(6, 8)}`,
        beginHHMM: parseInt(beginNum.substring(8, 12)),
        endHHMM: parseInt(endNum.substring(8, 12)),
      });
    }
    return periods;
  },
  computeTradingDateAndTime: (periods: { beginDate: string; endDate: string; beginHHMM: number; endHHMM: number }[]) => {
    if (!periods || periods.length === 0) {
      const now = new Date();
      return {
        tradeDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
        lastUpdated: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`,
      };
    }
    const lastPeriod = periods[periods.length - 1];
    return {
      tradeDate: lastPeriod.endDate,
      lastUpdated: `${String(Math.floor(lastPeriod.endHHMM / 100)).padStart(2, '0')}:${String(lastPeriod.endHHMM % 100).padStart(2, '0')}:00`,
    };
  },
}));

describe('trackingIndexService', () => {
  describe('parseTrackingIndex', () => {
    it('should parse valid format', () => {
      expect(parseTrackingIndex('2.H50036')).toEqual({ market: 2, code: 'H50036' });
      expect(parseTrackingIndex('0.980017')).toEqual({ market: 0, code: '980017' });
      expect(parseTrackingIndex('1.518880')).toEqual({ market: 1, code: '518880' });
    });

    it('should parse sector format (market=90)', () => {
      expect(parseTrackingIndex('90.BK0877')).toEqual({ market: 90, code: 'BK0877' });
      expect(parseTrackingIndex('90.BK0477')).toEqual({ market: 90, code: 'BK0477' });
    });

    it('should parse global index format (market=100)', () => {
      expect(parseTrackingIndex('100.NDX100')).toEqual({ market: 100, code: 'NDX100' });
      expect(parseTrackingIndex('100.DJIA')).toEqual({ market: 100, code: 'DJIA' });
      expect(parseTrackingIndex('100.SPX')).toEqual({ market: 100, code: 'SPX' });
      expect(parseTrackingIndex('100.HSI')).toEqual({ market: 100, code: 'HSI' });
    });

    it('should parse HK index format (market=124)', () => {
      expect(parseTrackingIndex('124.hstech')).toEqual({ market: 124, code: 'hstech' });
      expect(parseTrackingIndex('124.HSTECH')).toEqual({ market: 124, code: 'HSTECH' });
    });

    it('should return null for invalid format', () => {
      expect(parseTrackingIndex('')).toBeNull();
      expect(parseTrackingIndex('H50036')).toBeNull();
      expect(parseTrackingIndex('2H50036')).toBeNull();
      expect(parseTrackingIndex('2.H50036.extra')).toBeNull();
      expect(parseTrackingIndex('abc.def')).toBeNull();
      expect(parseTrackingIndex(null as any)).toBeNull();
      expect(parseTrackingIndex(undefined as any)).toBeNull();
    });

    it('should return null for edge cases', () => {
      expect(parseTrackingIndex('11.H50036')).toBeNull();  // market 超出范围
      expect(parseTrackingIndex('2.')).toBeNull();          // code 为空
    });
  });

  describe('isSectorConfig', () => {
    it('should return true for sector config', () => {
      expect(isSectorConfig('90.BK0877')).toBe(true);
      expect(isSectorConfig('90.BK0477')).toBe(true);
    });

    it('should return false for non-sector config', () => {
      expect(isSectorConfig('2.H50036')).toBe(false);
      expect(isSectorConfig('100.NDX100')).toBe(false);
      expect(isSectorConfig('124.hstech')).toBe(false);
      expect(isSectorConfig('invalid')).toBe(false);
    });
  });

  describe('isGlobalIndexConfig', () => {
    it('should return true for global index config', () => {
      expect(isGlobalIndexConfig('100.NDX100')).toBe(true);
      expect(isGlobalIndexConfig('100.DJIA')).toBe(true);
      expect(isGlobalIndexConfig('100.SPX')).toBe(true);
    });

    it('should return false for non-global index config', () => {
      expect(isGlobalIndexConfig('2.H50036')).toBe(false);  // 国内指数
      expect(isGlobalIndexConfig('90.BK0877')).toBe(false); // 板块
      expect(isGlobalIndexConfig('100.HSI')).toBe(false);   // 恒生指数是国内指数
      expect(isGlobalIndexConfig('124.hstech')).toBe(false); // 恒生科技是国内指数
      expect(isGlobalIndexConfig('invalid')).toBe(false);
    });
  });

  describe('isHKIndexConfig', () => {
    it('should return true for HK index config', () => {
      expect(isHKIndexConfig('124.hstech')).toBe(true);
      expect(isHKIndexConfig('124.HSTECH')).toBe(true);
      expect(isHKIndexConfig('100.HSI')).toBe(true);  // 恒生指数
    });

    it('should return false for non-HK index config', () => {
      expect(isHKIndexConfig('2.H50036')).toBe(false);
      expect(isHKIndexConfig('100.NDX100')).toBe(false);
      expect(isHKIndexConfig('90.BK0877')).toBe(false);
      expect(isHKIndexConfig('invalid')).toBe(false);
    });
  });

  describe('IndexMarket', () => {
    it('should have correct values', () => {
      expect(IndexMarket.SZSE).toBe(0);
      expect(IndexMarket.SHSE).toBe(1);
      expect(IndexMarket.GLOBAL_INDEX).toBe(100);
      expect(IndexMarket.HKEX_TECH).toBe(124);
    });
  });

  describe('SECTOR_MARKET_CODE', () => {
    it('should be 90', () => {
      expect(SECTOR_MARKET_CODE).toBe(90);
    });
  });

  describe('fetchSectorQuote', () => {
    it('should return null for non-sector config', async () => {
      const result = await fetchSectorQuote('2.H50036');
      expect(result).toBeNull();
    });

    it('should return null for invalid config', async () => {
      const result = await fetchSectorQuote('invalid');
      expect(result).toBeNull();
    });

    it('should fetch sector quote successfully', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: {
            f12: 'BK0877',
            f14: 'PCB',
            f43: 3668.36,
            f170: 0.73
          }
        })
      });

      const result = await fetchSectorQuote('90.BK0877');

      expect(result).not.toBeNull();
      expect(result!.code).toBe('BK0877');
      expect(result!.name).toBe('PCB');
      expect(result!.changePercent).toBe(0.73);
      expect(result!.indexValue).toBe(3668.36);
      expect(result!.fetchDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      global.fetch = originalFetch;
    });

    it('should return null when API returns no data', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: null
        })
      });

      const result = await fetchSectorQuote('90.BK9999');
      expect(result).toBeNull();

      global.fetch = originalFetch;
    });

    it('should return null when fetch fails', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: false
      });

      const result = await fetchSectorQuote('90.BK0877');
      expect(result).toBeNull();

      global.fetch = originalFetch;
    });
  });

  describe('fetchValuationByTrackingIndex', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return warning for invalid format', async () => {
      const result = await fetchValuationByTrackingIndex('invalid', '000001', '测试基金');
      expect(result.valuation).toBeNull();
      expect(result.statusInfo.status).toBe('warning');
      expect(result.statusInfo.message).toBe('跟踪指数格式无效');
    });

    it('should return warning when history is empty', async () => {
      (marketFundService.getHistory as jest.Mock).mockReturnValue([]);

      const result = await fetchValuationByTrackingIndex('2.931743', '000001', '测试基金');
      expect(result.valuation).toBeNull();
      expect(result.statusInfo.status).toBe('warning');
      expect(result.statusInfo.message).toBe('缺少历史净值数据，无法计算估值');
    });

    it('should return warning when net worth is zero or negative', async () => {
      // Mock history with zero value
      (marketFundService.getHistory as jest.Mock).mockReturnValue([
        { date: new Date('2026-07-21').getTime(), value: 0, equityReturn: 0 }
      ]);

      // Mock API return
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: {
            f170: 1.5,
            f80: '[{"b":202607220930,"e":202607221130}]'
          }
        })
      });

      const result = await fetchValuationByTrackingIndex('2.H50036', '000001', '测试基金');
      expect(result.valuation).toBeNull();
      expect(result.statusInfo.status).toBe('warning');
      expect(result.statusInfo.message).toBe('净值数据无效，无法计算估值');

      global.fetch = originalFetch;
    });

    it('should calculate valuation correctly', async () => {
      // Mock history - 2026-07-21 和 2026-07-22 的净值
      (marketFundService.getHistory as jest.Mock).mockReturnValue([
        { date: new Date('2026-07-21').getTime(), value: 1.9, equityReturn: 0 },
        { date: new Date('2026-07-22').getTime(), value: 2.0, equityReturn: 5.26 }
      ]);

      // Mock fetch - API f80 收盘日期为 2026-07-23
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: {
            f170: 5.5,
            f80: '[{"b":202607230930,"e":202607231130},{"b":202607231300,"e":202607231500}]'
          }
        })
      });

      const result = await fetchValuationByTrackingIndex('2.H50036', '020640', '测试基金');

      // API 收盘日期 = 2026-07-23
      // 查找第一个 date < 2026-07-23 的记录 → 2026-07-22 的净值 2.0
      expect(result.valuation).not.toBeNull();
      expect(result.valuation!.currentPrice).toBeCloseTo(2.0 * 1.055, 4);
      expect(result.valuation!.changePercentage).toBe(5.5);
      expect(result.valuation!.symbol).toBe('020640');
      expect(result.valuation!.previousPrice).toBe(2.0);  // 来自 2026-07-22
      expect(result.valuation!.realtimeDate).toBe('2026-07-23');  // API 收盘日期
      expect(result.valuation!.netWorthDate).toBe('2026-07-22');  // 净值日期
      expect(result.statusInfo.status).toBe('ok');

      global.fetch = originalFetch;
    });

    it('should return warning when index code not found', async () => {
      // Mock history
      (marketFundService.getHistory as jest.Mock).mockReturnValue([
        { date: 1784563200000, value: 1.0, equityReturn: 0 }
      ]);

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: null  // 无数据
        })
      });

      const result = await fetchValuationByTrackingIndex('2.999999', '000001', '测试基金');
      expect(result.valuation).toBeNull();
      expect(result.statusInfo.status).toBe('warning');
      expect(result.statusInfo.message).toBe('跟踪指数代码不存在');

      global.fetch = originalFetch;
    });

    it('should handle f170 equals 0 (zero change percent)', async () => {
      // Mock history - 净值日期为 2026-07-21
      (marketFundService.getHistory as jest.Mock).mockReturnValue([
        { date: new Date('2026-07-21').getTime(), value: 2.0, equityReturn: 0 }
      ]);

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: {
            f170: 0,  // 涨跌幅为 0% 是正常情况
            f80: '[{"b":202607220930,"e":202607221130},{"b":202607221300,"e":202607221500}]'
          }
        })
      });

      const result = await fetchValuationByTrackingIndex('2.H50036', '000001', '测试基金');

      // 涨跌幅为 0% 应该正常处理，不是返回 null
      expect(result.valuation).not.toBeNull();
      expect(result.valuation!.changePercentage).toBe(0);
      expect(result.valuation!.currentPrice).toBe(2.0);  // 2.0 * (1 + 0/100) = 2.0

      global.fetch = originalFetch;
    });

    it('should use history point before API trade date', async () => {
      // API f80 收盘日期 = 2026-07-22
      // 历史净值：2026-07-20, 2026-07-21
      // 应查找第一个 date < 2026-07-22 的记录 → 2026-07-21
      (marketFundService.getHistory as jest.Mock).mockReturnValue([
        { date: new Date('2026-07-20').getTime(), value: 1.9, equityReturn: 0 },
        { date: new Date('2026-07-21').getTime(), value: 2.0, equityReturn: 0 }
      ]);

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: {
            f170: 1.5,
            f80: '[{"b":202607220930,"e":202607221130},{"b":202607221300,"e":202607221500}]'
          }
        })
      });

      const result = await fetchValuationByTrackingIndex('2.H50036', '000001', '测试基金');

      expect(result.valuation).not.toBeNull();
      expect(result.valuation!.previousPrice).toBe(2.0);  // 来自 2026-07-21 的净值
      expect(result.valuation!.realtimeDate).toBe('2026-07-22');  // API 收盘日期
      expect(result.valuation!.netWorthDate).toBe('2026-07-21');  // 净值日期
      expect(result.valuation!.currentPrice).toBeCloseTo(2.0 * 1.015, 4);
      expect(result.valuation!.changePercentage).toBe(1.5);

      global.fetch = originalFetch;
    });

    it('should handle US stock index (cross-day trading period)', async () => {
      // 美股场景：API f80 收盘日期 = 2026-07-24（跨日时段 07-23 21:30 ~ 07-24 04:00）
      // 历史净值：2026-07-22
      // 应查找第一个 date < 2026-07-24 的记录 → 2026-07-22
      (marketFundService.getHistory as jest.Mock).mockReturnValue([
        { date: new Date('2026-07-22').getTime(), value: 2.0, equityReturn: 0 }
      ]);

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: {
            f170: -1.87,
            f80: '[{"b":202607232130,"e":202607240400}]'  // 美股跨日时段：21:30-04:00
          }
        })
      });

      const result = await fetchValuationByTrackingIndex('100.NDX100', '000001', '测试基金');

      // 使用 API 返回的收盘日期和时间
      expect(result.valuation).not.toBeNull();
      expect(result.valuation!.previousPrice).toBe(2.0);  // 来自 2026-07-22 的净值
      expect(result.valuation!.realtimeDate).toBe('2026-07-24');  // API 收盘日期
      expect(result.valuation!.netWorthDate).toBe('2026-07-22');  // 净值日期
      expect(result.valuation!.changePercentage).toBe(-1.87);

      global.fetch = originalFetch;
    });

    it('should return warning when no history point before API date', async () => {
      // API f80 收盘日期 = 2026-07-20
      // 历史净值最新 = 2026-07-22（比 API 日期还新）
      // 找不到 date < 2026-07-20 的记录
      (marketFundService.getHistory as jest.Mock).mockReturnValue([
        { date: new Date('2026-07-21').getTime(), value: 2.0, equityReturn: 0 },
        { date: new Date('2026-07-22').getTime(), value: 2.1, equityReturn: 0 }
      ]);

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: {
            f170: 1.5,
            f80: '[{"b":202607200930,"e":202607201130}]'
          }
        })
      });

      const result = await fetchValuationByTrackingIndex('2.H50036', '000001', '测试基金');

      expect(result.valuation).toBeNull();
      expect(result.statusInfo.status).toBe('warning');
      expect(result.statusInfo.message).toBe('找不到早于API日期的历史净值数据');

      global.fetch = originalFetch;
    });
  });
});