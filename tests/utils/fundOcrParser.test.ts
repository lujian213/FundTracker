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

    it('extracts accumulated profit by position when keyword is misrecognized (ZTE)', () => {
      // OCR将"累计"错误识别为"ZTE"，累计收益在倒数几行
      const text = `
        21:08 了 HRC 96
        008888 中 高 风险 详情
        金额 (元 )
        11,962.24
        今日 收益 (元 ) +693.20
        持 有 收益 (元 ) +1,534.38
        持 有 份额 6,353.77
        日 涨幅 +6.15% 基金 净值 1.8827(05-006)
        收益 明细 交易 记录
        ZTE: +8,926.16
        讨论 区
      `;
      const result = parseFundInfo(text);
      expect(result.success).toBe(true);
      expect(result.data?.fundCode).toBe('008888');
      expect(result.data?.shares).toBe(6353.77);
      expect(result.data?.nav).toBe(1.8827);
      expect(result.data?.accumulatedProfit).toBe(8926.16);
    });

    it('handles OCR date with extra digits (05-006)', () => {
      // OCR将(05-06)识别为(05-006)
      const text = `
        008888
        持有份额 6,353.77
        基金净值 1.8827(05-006)
        累计收益: +8,926.16
      `;
      const result = parseFundInfo(text);
      expect(result.success).toBe(true);
      expect(result.data?.navDate).toBe(`${new Date().getFullYear()}-05-06`);
    });

    it('extracts accumulated profit when keyword is RATE and shares has thousand separator error', () => {
      // OCR将"累计收益"识别为"RATE"，持有份额千分位错误：5.681.87
      const text = `
        21:14 了 HRC 05
        南方 有 色 金 属 ETF 联 接 C
        004433 中 高 风险 详情
        金额 (元 )
        11,837.04
        今日 收益 (元 ) +416.48
        持 有 金额 11.837.04 待 确认 金额 0.00
        持仓 成 本 价 2.0263 持 有 份额 5.681.87
        日 涨幅 +3.65% 基金 净值 2.0833(05-06)
        收益 明细 交易 记录
        RATE: +694.56
        讨论 区
      `;
      const result = parseFundInfo(text);
      expect(result.success).toBe(true);
      expect(result.data?.fundCode).toBe('004433');
      expect(result.data?.shares).toBe(5681.87);
      expect(result.data?.nav).toBe(2.0833);
      expect(result.data?.accumulatedProfit).toBe(694.56);
    });

    it('handles accumulated profit with missing decimal point (+10,36713)', () => {
      // OCR丢失小数点：+10,36713 应该是 +10,367.13
      const text = `
        21:15 了 HRC 04
        易方达 人 工 智能 ETF 联 接 C
        012734 中 高 风险 详情
        金额 (元 )
        15,049.09
        持 有 份额 7,117.43
        基金 净值 2.1144(05-06)
        累计 收益 : +10,36713
        讨论 区
      `;
      const result = parseFundInfo(text);
      expect(result.success).toBe(true);
      expect(result.data?.fundCode).toBe('012734');
      expect(result.data?.shares).toBe(7117.43);
      expect(result.data?.nav).toBe(2.1144);
      expect(result.data?.accumulatedProfit).toBe(10367.13);
    });

    it('extracts accumulated profit when keyword is Zit', () => {
      // OCR将"累计收益"识别为"Zit"
      const text = `
        21:18 了 HRC 94
        天 弘 中 证 新 能 源 指数 增强 A
        012328 中 高 风险 详情
        金额 (元 )
        10,199.73
        持 有 份额 11,768.47
        基金 净值 0.8667(05-06)
        Zit: +2,207.24
        讨论 区
      `;
      const result = parseFundInfo(text);
      expect(result.success).toBe(true);
      expect(result.data?.fundCode).toBe('012328');
      expect(result.data?.shares).toBe(11768.47);
      expect(result.data?.nav).toBe(0.8667);
      expect(result.data?.accumulatedProfit).toBe(2207.24);
    });

    it('extracts accumulated profit with correct decimal format from Zit', () => {
      // OCR将"累计收益"识别为"Zit"，数字格式正确有小数点
      const text = `
        21:19 了 HRC 94
        博时 军工 主题 股票 C
        011592 中 高 风险 详情
        金额 (元 )
        18,098.66
        持 有 份额 7.791.07
        基金 净值 2.3230(05-06)
        Zit: +1420.91
        讨论 区
      `;
      const result = parseFundInfo(text);
      expect(result.success).toBe(true);
      expect(result.data?.fundCode).toBe('011592');
      expect(result.data?.shares).toBe(7791.07);
      expect(result.data?.nav).toBe(2.3230);
      expect(result.data?.accumulatedProfit).toBe(1420.91);
    });
  });
});