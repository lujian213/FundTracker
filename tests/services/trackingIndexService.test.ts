import { parseTrackingIndex, fetchTrackingIndexChangePercent, fetchValuationByTrackingIndex } from '../../services/trackingIndexService';

describe('trackingIndexService', () => {
  describe('parseTrackingIndex', () => {
    it('should parse valid format', () => {
      expect(parseTrackingIndex('2.H50036')).toEqual({ market: 2, code: 'H50036' });
      expect(parseTrackingIndex('0.980017')).toEqual({ market: 0, code: '980017' });
      expect(parseTrackingIndex('1.518880')).toEqual({ market: 1, code: '518880' });
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
      expect(parseTrackingIndex('10.H50036')).toBeNull();  // market 超出范围（>9）
      expect(parseTrackingIndex('2.')).toBeNull();          // code 为空
    });
  });

  describe('fetchValuationByTrackingIndex', () => {
    it('should return warning for invalid format', async () => {
      const result = await fetchValuationByTrackingIndex('invalid', 1.0, '000001', '测试基金');
      expect(result.valuation).toBeNull();
      expect(result.statusInfo.status).toBe('warning');
      expect(result.statusInfo.message).toBe('跟踪指数格式无效');
    });

    it('should return warning when previousPrice is zero or negative', async () => {
      const result = await fetchValuationByTrackingIndex('2.931743', 0, '000001', '测试基金');
      expect(result.valuation).toBeNull();
      expect(result.statusInfo.status).toBe('warning');
      expect(result.statusInfo.message).toBe('缺少前一日净值，无法计算估值');

      const resultNegative = await fetchValuationByTrackingIndex('2.931743', -1.0, '000001', '测试基金');
      expect(resultNegative.valuation).toBeNull();
      expect(resultNegative.statusInfo.status).toBe('warning');
      expect(resultNegative.statusInfo.message).toBe('缺少前一日净值，无法计算估值');
    });

    it('should calculate valuation correctly', async () => {
      // Mock fetch for successful response
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { f170: 5.5, f3: 5.5 }
        })
      });

      const result = await fetchValuationByTrackingIndex('2.931743', 2.0, '020640', '测试基金');

      expect(result.valuation).not.toBeNull();
      expect(result.valuation!.currentPrice).toBeCloseTo(2.0 * 1.055, 4);
      expect(result.valuation!.changePercentage).toBe(5.5);
      expect(result.valuation!.symbol).toBe('020640');
      expect(result.statusInfo.status).toBe('ok');

      global.fetch = originalFetch;
    });

    it('should return warning when index code not found', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: null  // 无数据
        })
      });

      const result = await fetchValuationByTrackingIndex('2.999999', 1.0, '000001', '测试基金');
      expect(result.valuation).toBeNull();
      expect(result.statusInfo.status).toBe('warning');
      expect(result.statusInfo.message).toBe('跟踪指数代码不存在');

      global.fetch = originalFetch;
    });
  });
});