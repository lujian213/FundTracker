// tests/utils/fundOcrParser.test.ts

import { parseFundInfo, OcrFundData } from '../../utils/fundOcrParser';

describe('fundOcrParser', () => {
  describe('parseFundInfo', () => {
    it('parses complete fund info successfully', () => {
      const text = `
        广发 纳 斯 达 克 100ETF 联 接 (QDII)
        270042 中 高 风险 详情
        持 有 份额 5,349.92
        基金 净值 7.7008(04-27)
        累计 收益 : +30,479.48
      `;
      const result = parseFundInfo(text);
      expect(result.success).toBe(true);
      expect(result.data?.fundCode).toBe('270042');
      expect(result.data?.shares).toBe(5349.92);
      expect(result.data?.nav).toBe(7.7008);
      expect(result.data?.accumulatedProfit).toBe(30479.48);
      expect(result.data?.navDate).toMatch(/^\d{4}-04-27$/);
      expect(result.data?.fundName).toContain('广发');
    });

    it('handles OCR spacing in fund name', () => {
      const text = `
        广 发 全 球 精 选 股票 (QDII)
        270023
        持有份额 32,740.58
        基金净值 5.7986(04-27)
        累计收益: +55,487.24
      `;
      const result = parseFundInfo(text);
      expect(result.success).toBe(true);
      expect(result.data?.fundName).toBe('广发全球精选股票(QDII)');
    });

    it('handles OCR thousand-separator error (5.349.92)', () => {
      const text = `
        270042
        持有份额 5.349.92
        基金净值 7.7008(04-27)
        累计收益: +30,479.48
      `;
      const result = parseFundInfo(text);
      expect(result.success).toBe(true);
      expect(result.data?.shares).toBe(5349.92);
    });

    it('returns missing fields when fund code not found', () => {
      const text = `
        持有份额 5349.92
        基金净值 7.7008(04-27)
        累计收益: +30,479.48
      `;
      const result = parseFundInfo(text);
      expect(result.success).toBe(false);
      expect(result.missingFields).toContain('基金代码');
    });

    it('returns missing fields when nav not found', () => {
      const text = `
        270042
        持有份额 5349.92
        累计收益: +30,479.48
      `;
      const result = parseFundInfo(text);
      expect(result.success).toBe(false);
      expect(result.missingFields).toContain('基金净值');
    });

    it('handles negative accumulated profit', () => {
      const text = `
        270042
        持有份额 5349.92
        基金净值 7.7008(04-27)
        累计收益: -1,234.56
      `;
      const result = parseFundInfo(text);
      expect(result.success).toBe(true);
      expect(result.data?.accumulatedProfit).toBe(-1234.56);
    });

    it('fundName is optional and undefined when not found', () => {
      const text = `
        270042
        持有份额 5349.92
        基金净值 7.7008(04-27)
        累计收益: +30,479.48
      `;
      const result = parseFundInfo(text);
      expect(result.success).toBe(true);
      expect(result.data?.fundName).toBeUndefined();
    });
  });
});