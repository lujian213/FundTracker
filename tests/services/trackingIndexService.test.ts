import { parseTrackingIndex, fetchTrackingIndexChangePercent, fetchValuationByTrackingIndex, fetchSectorQuote, isSectorConfig, MARKET_CODE } from '../../services/trackingIndexService';
import * as marketFundService from '../../services/marketFundService';

jest.mock('../../services/marketFundService', () => ({
  getHistory: jest.fn(),
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
      expect(parseTrackingIndex('10.H50036')).toBeNull();  // market 超出范围（>9 且 != 90）
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
      expect(isSectorConfig('0.980017')).toBe(false);
      expect(isSectorConfig('invalid')).toBe(false);
    });
  });

  describe('MARKET_CODE', () => {
    it('should have correct values', () => {
      expect(MARKET_CODE.SZSE_INDEX).toBe(0);
      expect(MARKET_CODE.SSE_ETF).toBe(1);
      expect(MARKET_CODE.CSI_INDEX).toBe(2);
      expect(MARKET_CODE.SECTOR).toBe(90);
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

    it('should return warning when latest net worth is zero or negative', async () => {
      // Mock history with zero value
      (marketFundService.getHistory as jest.Mock).mockReturnValue([
        { date: 1784563200000, value: 0, equityReturn: 0 }
      ]);

      const result = await fetchValuationByTrackingIndex('2.931743', '000001', '测试基金');
      expect(result.valuation).toBeNull();
      expect(result.statusInfo.status).toBe('warning');
      expect(result.statusInfo.message).toBe('净值数据无效，无法计算估值');
    });

    it('should calculate valuation correctly', async () => {
      // Mock history
      (marketFundService.getHistory as jest.Mock).mockReturnValue([
        { date: 1784476800000, value: 1.9, equityReturn: 0 },
        { date: 1784563200000, value: 2.0, equityReturn: 5.26 }
      ]);

      // Mock fetch for successful response
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { f170: 5.5, f3: 5.5 }
        })
      });

      const result = await fetchValuationByTrackingIndex('2.931743', '020640', '测试基金');

      expect(result.valuation).not.toBeNull();
      expect(result.valuation!.currentPrice).toBeCloseTo(2.0 * 1.055, 4);
      expect(result.valuation!.changePercentage).toBe(5.5);
      expect(result.valuation!.symbol).toBe('020640');
      expect(result.valuation!.previousPrice).toBe(2.0); // 来自历史数据最新一条
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
  });
});