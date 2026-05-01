// tests/utils/tradeOcrParser.test.ts

import { parseTradeScreenshotText, OcrTradeData } from '../../utils/tradeOcrParser';

describe('parseTradeScreenshotText', () => {
  describe('买入交易截图解析', () => {
    // 基于实际OCR输出的测试数据
    const buyText1 = `
23:58 了 小 TE

< 记 录 详 情

鹤 天 弘 基 金 管 理 有 限 公 司

2,000.00 儿

买 入 成 功

买 入 信 息
买 入 产 品 天 弘 恒 生 科 技 ETF 联 接 (QDI)C >
买 入 金 额 2,000.00 元
付 款 方 式 余 额 宝
买 入 时 间 2026-04-22 13:02:40
确 认 信 息
确 认 金 额 2,000.00 元
确 认 份 额 2,962.09 份
确 认 净 值 0.6752
手 续 费 0.00 元
确 认 时 间 2026-04-23
订 单 号 20260422001080012204160040787481
`;

    const buyText2 = `
10:40 日 回 四 戢 光 些 宗 怡 | al 100) 4
< 记 录 详 情
C 建 信 基 金 管 理 有 限 责 任 公 司
10,000.007T
买 入 成 功

买 入 信 息

买 入 产 品 建 信 深 证 100 指 数 增 强 >
买 入 金 额 10,000.007T
付 款 方 式 余 额 宝
买 入 时 间 2026-04-28 14:35:04
确 认 信 息

确 认 金 额 9,985.027T
确 认 份 额 3,431.99 份
确 认 净 值 2.9094
手 续 费 14.98 元
确 认 时 间 2026-04-29
订 单 号 20260428001080012204310078028834
`;

    const buyText3 = `
10:42 口 固 团 蝎 兄 些 宗 "ul $ (00) 4
K 记 录 详 情

黛 天 弘 基 金 管 理 有 限 公 司

20000.00 兀

买 入 成 功

买 入 信 息
买 入 产 咤 天 弘 中 证 电 网 设 备 主 题 指 数 C >
买 入 金 额 20,000.00 元
付 款 方 式 余 额 宝
买 入 时 间 2026-04-28 14:39:49
确 认 信 息
确 认 金 额 20,000.007T
确 认 份 额 14,820.30 价
确 认 净 值 1.3495
手 续 费 0.00 元
确 认 时 间 2026-04-29
订 单 号 20260428001080012204310078054458
`;

    const buyText4 = `
10:59 0 ORO» WN 宋 Sal Sal (30) 4
K 记 录 详 情

〇 永 赢 基 金 管 理 有 限 公 司

5,000.00 儿

买 入 成 功

买 入 信 息
买 入 产 品 永 赢 科 技 智 选 混 合 A >
买 入 金 额 5,000.00 元
付 款 方 式 余 额 宝
买 入 时 间 2026-04-23 14:44:33
确 认 信 息
确 认 金 额 4,992.51 元
确 认 份 额 1,022.26 份
确 认 净 值 4.8838
手 续 费 7.49 元
确 认 时 间 2026-04-24
订 单 号 20260423001080012204310064623500
`;

    test('解析买入交易1：天弘恒生科技ETF联接', () => {
      const result = parseTradeScreenshotText(buyText1);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        fundName: '天弘恒生科技ETF联接(QDI)C',
        operation: 'buy',
        amount: 2000,
        shares: 2962.09,
        nav: 0.6752,
        fee: 0,
        tradeTime: '2026-04-22 13:02:40',
        tradeDate: '2026-04-22',
      });
    });

    test('解析买入交易2：建信深证100指数增强', () => {
      const result = parseTradeScreenshotText(buyText2);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        fundName: '建信深证100指数增强',
        operation: 'buy',
        amount: 10000,
        shares: 3431.99,
        nav: 2.9094,
        fee: 14.98,
        tradeTime: '2026-04-28 14:35:04',
        tradeDate: '2026-04-28',
      });
    });

    test('解析买入交易3：天弘中证电网设备（OCR错误字符）', () => {
      const result = parseTradeScreenshotText(buyText3);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        fundName: '天弘中证电网设备主题指数C',
        operation: 'buy',
        amount: 20000,
        shares: 14820.3,
        nav: 1.3495,
        fee: 0,
        tradeTime: '2026-04-28 14:39:49',
        tradeDate: '2026-04-28',
      });
    });

    test('解析买入交易4：永赢科技智选混合A', () => {
      const result = parseTradeScreenshotText(buyText4);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        fundName: '永赢科技智选混合A',
        operation: 'buy',
        amount: 5000,
        shares: 1022.26,
        nav: 4.8838,
        fee: 7.49,
        tradeTime: '2026-04-23 14:44:33',
        tradeDate: '2026-04-23',
      });
    });
  });

  describe('卖出交易截图解析', () => {
    const sellText1 = `
1051080 Q*% NZ 怡 | al 100) 4
< 记 录 详 情
G@@ 南 方 基 金 管 理 股 份 有 限 公 司
5,000.00 份
卖 出 成 功
卖 出 金 额 10,055.00 元 于 04 月 27 日 15:30 到 账 余 额 宝

卖 出 信 息

卖 出 产 品 南 方 有 色 金 属 ETF 联 接 C >
卖 出 份 额 5,000.00 价
卖 出 时 间 2026-04-24 14:53:26
确 认 信 息

确 认 份 额 5,000.00 价
确 认 净 值 2.0110
手 续 费 G) 0.00 元
到 账 金 额 10,055.00 元
到 账 渠 道 余 额 宝
到 贕 时 间 2026-04-27 15:30:39
订 单 号 20260424001080012404310067865040
`;

    const sellText2 = `
11:00 盱 恩 回 照 申 些 宋 Sal Sl [30 4
K 记 录 详 情

〇 永 赢 基 金 管 理 有 限 公 司

6,000.00 份

卖 出 成 功
卖 出 金 额 29,192.70 元 于 04 月 23 日 15:43 到 账 余 额 宝
卖 出 信 息
卖 出 产 品 永 赢 科 技 智 选 混 合 A >
卖 出 份 额 6,000.00 份
卖 出 时 间 2026-04-22 14:43:32
确 认 信 息
确 认 份 额 6,000.00 份
确 认 净 值 4.8899
手 续 费 ® 146.70 元
到 账 金 额 29,192.70 元
到 账 渠 道 余 额 宝
到 账 时 间 2026-04-23 15:43:39
订 单 号 20260422001080012404310061660068
`;

    test('解析卖出交易1：南方有色金属ETF联接C', () => {
      const result = parseTradeScreenshotText(sellText1);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        fundName: '南方有色金属ETF联接C',
        operation: 'sell',
        amount: 10055,
        shares: 5000,
        nav: 2.011,
        fee: 0,
        tradeTime: '2026-04-24 14:53:26',
        tradeDate: '2026-04-24',
      });
    });

    test('解析卖出交易2：永赢科技智选混合A（带手续费）', () => {
      const result = parseTradeScreenshotText(sellText2);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        fundName: '永赢科技智选混合A',
        operation: 'sell',
        amount: 29192.7,
        shares: 6000,
        nav: 4.8899,
        fee: 146.7,
        tradeTime: '2026-04-22 14:43:32',
        tradeDate: '2026-04-22',
      });
    });
  });

  describe('字段缺失处理', () => {
    test('缺少操作类型', () => {
      const text = `
买 入 产 品 天 弘 恒 生 科 技 ETF 联 接 C >
买 入 金 额 2,000.00 元
买 入 时 间 2026-04-22 13:02:40
确 认 份 额 2,962.09 份
确 认 净 值 0.6752
手 续 费 0.00 元
`;
      const result = parseTradeScreenshotText(text);
      expect(result.success).toBe(false);
      expect(result.missingFields).toContain('操作类型');
    });

    test('缺少基金名称', () => {
      const text = `
买 入 成 功
买 入 金 额 2,000.00 元
买 入 时 间 2026-04-22 13:02:40
确 认 份 额 2,962.09 份
确 认 净 值 0.6752
手 续 费 0.00 元
`;
      const result = parseTradeScreenshotText(text);
      expect(result.success).toBe(false);
      expect(result.missingFields).toContain('基金名称');
    });

    test('缺少金额', () => {
      const text = `
买 入 成 功
买 入 产 品 天 弘 恒 生 科 技 ETF 联 接 C >
买 入 时 间 2026-04-22 13:02:40
确 认 份 额 2,962.09 份
确 认 净 值 0.6752
手 续 费 0.00 元
`;
      const result = parseTradeScreenshotText(text);
      expect(result.success).toBe(false);
      expect(result.missingFields).toContain('金额');
    });

    test('缺少确认份额', () => {
      const text = `
买 入 成 功
买 入 产 品 天 弘 恒 生 科 技 ETF 联 接 C >
买 入 金 额 2,000.00 元
买 入 时 间 2026-04-22 13:02:40
确 认 净 值 0.6752
手 续 费 0.00 元
`;
      const result = parseTradeScreenshotText(text);
      expect(result.success).toBe(false);
      expect(result.missingFields).toContain('确认份额');
    });

    test('缺少确认净值', () => {
      const text = `
买 入 成 功
买 入 产 品 天 弘 恒 生 科 技 ETF 联 接 C >
买 入 金 额 2,000.00 元
买 入 时 间 2026-04-22 13:02:40
确 认 份 额 2,962.09 份
手 续 费 0.00 元
`;
      const result = parseTradeScreenshotText(text);
      expect(result.success).toBe(false);
      expect(result.missingFields).toContain('确认净值');
    });

    test('缺少手续费', () => {
      const text = `
买 入 成 功
买 入 产 品 天 弘 恒 生 科 技 ETF 联 接 C >
买 入 金 额 2,000.00 元
买 入 时 间 2026-04-22 13:02:40
确 认 份 额 2,962.09 份
确 认 净 值 0.6752
`;
      const result = parseTradeScreenshotText(text);
      expect(result.success).toBe(false);
      expect(result.missingFields).toContain('手续费');
    });

    test('缺少交易时间', () => {
      const text = `
买 入 成 功
买 入 产 品 天 弘 恒 生 科 技 ETF 联 接 C >
买 入 金 额 2,000.00 元
确 认 份 额 2,962.09 份
确 认 净 值 0.6752
手 续 费 0.00 元
`;
      const result = parseTradeScreenshotText(text);
      expect(result.success).toBe(false);
      expect(result.missingFields).toContain('交易时间');
    });

    test('多个字段缺失', () => {
      const text = `
买 入 成 功
买 入 产 品 某基金 >
`;
      const result = parseTradeScreenshotText(text);
      expect(result.success).toBe(false);
      expect(result.missingFields?.length).toBeGreaterThan(3);
    });
  });

  describe('OCR错误字符处理', () => {
    test('处理全角冒号', () => {
      const text = `
买 入 成 功
买 入 产 品 测试基金A >
买 入 金 额 1,000.00 元
买 入 时 间 2026-04-22 13：02：40
确 认 份 额 100.00 份
确 认 净 值 1.0000
手 续 费 0.00 元
`;
      const result = parseTradeScreenshotText(text);
      expect(result.success).toBe(true);
      expect(result.data?.tradeTime).toBe('2026-04-22 13:02:40');
    });

    test('处理手续费中的OCR干扰字符', () => {
      const text = `
买 入 成 功
买 入 产 品 测试基金A >
买 入 金 额 1,000.00 元
买 入 时 间 2026-04-22 13:02:40
确 认 份 额 100.00 份
确 认 净 值 1.0000
手 续 费 G) 15.00 元
`;
      const result = parseTradeScreenshotText(text);
      expect(result.success).toBe(true);
      expect(result.data?.fee).toBe(15);
    });

    test('处理份额中的OCR错误字符（价代替份）', () => {
      const text = `
买 入 成 功
买 入 产 品 测试基金A >
买 入 金 额 1,000.00 元
买 入 时 间 2026-04-22 13:02:40
确 认 份 额 100.00 价
确 认 净 值 1.0000
手 续 费 0.00 元
`;
      const result = parseTradeScreenshotText(text);
      expect(result.success).toBe(true);
      expect(result.data?.shares).toBe(100);
    });

    test('处理OCR识别错误的多小数点（如2.962.09应该是2962.09）', () => {
      const text = `
买 入 成 功
买 入 产 品 测试基金A >
买 入 金 额 2.000.00 元
买 入 时 间 2026-04-22 13:02:40
确 认 份 额 2.962.09 份
确 认 净 值 0.6752
手 续 费 0.00 元
`;
      const result = parseTradeScreenshotText(text);
      expect(result.success).toBe(true);
      expect(result.data?.amount).toBe(2000);
      expect(result.data?.shares).toBe(2962.09);
    });

    test('处理确认金额的多小数点（如9.985.02应该是9985.02）', () => {
      const text = `
买 入 成 功
买 入 产 品 测试基金A >
买 入 金 额 10,000.00 元
买 入 时 间 2026-04-28 14:35:04
确 认 金额 9.985.02 元
确 认 份 额 3,431.99 份
确 认 净 值 2.9094
手 续 费 14.98 元
`;
      const result = parseTradeScreenshotText(text);
      expect(result.success).toBe(true);
      expect(result.data?.amount).toBe(10000);
      expect(result.data?.shares).toBe(3431.99);
    });

    test('处理乱码的交易时间标签', () => {
      const text = `
卖 出 成 功
卖 出 产 品 测试基金A >
SEH AE 2026-04-22 14:43:32
确 认 份 额 6,000.00 份
确 认 净 值 4.8899
手 续 费 146.70 元
到 账 金 额 29,192.70 元
`;
      const result = parseTradeScreenshotText(text);
      expect(result.success).toBe(true);
      expect(result.data?.tradeTime).toBe('2026-04-22 14:43:32');
      expect(result.data?.tradeDate).toBe('2026-04-22');
    });

    test('处理逗号位置错误（如5,.000.00）', () => {
      const text = `
卖 出 成 功
卖 出 产 品 测试基金A >
卖 出 时 间 2026-04-24 14:53:26
卖 出 份 额 5,.000.00 份
确 认 份 额 5,.000.00 份
确 认 净 值 2.0110
手 续 费 0.00 元
到 账 金 额 10,055.00 元
`;
      const result = parseTradeScreenshotText(text);
      expect(result.success).toBe(true);
      expect(result.data?.shares).toBe(5000);
    });
  });
});