// tests/utils/tradeOcrParser.test.ts

import { parseTradeOcrText, parseSingleScreenshot, OcrTradeData, TradeParseResult } from '../../utils/tradeOcrParser';

describe('parseTradeOcrText', () => {
  describe('格式检测', () => {
    test('检测单张交易成功截图格式', () => {
      const text = `
买 入 成 功
买 入 产 品 天 弘 恒 生 科 技 ETF 联 接 C >
买 入 金 额 2,000.00 元
买 入 时 间 2026-04-22 13:02:40
确 认 份 额 2,962.09 份
确 认 净 值 0.6752
手 续 费 0.00 元
`;
      const result = parseTradeOcrText(text);
      expect(result.format).toBe('single');
      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
    });

    test('检测交易汇总列表格式', () => {
      const text = `
买 入 基 金 | 博 时 黄 金 ETF 联 接 C 1,000.00 元
2026-04-28 09:27:11
`;
      const result = parseTradeOcrText(text);
      expect(result.format).toBe('summary');
    });
  });

  describe('单张交易成功截图解析', () => {
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
`;

    test('解析买入交易1：天弘恒生科技ETF联接', () => {
      const result = parseTradeOcrText(buyText1);
      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
      expect(result.data![0]).toEqual({
        fundName: '天弘恒生科技ETF联接(QDI)C',
        operation: 'buy',
        amount: 2000,
        shares: 2962.09,
        nav: 0.6752,
        fee: 0,
        tradeTime: '2026-04-22 13:02:40',
        tradeDate: '2026-04-22',
        status: 'completed',
      });
    });

    // OCR空格分隔+净值漏小数点
    const buyTextOcrNoise = `
买 入 成 功
买 入 信息
买 入 产品 博时 黄金 ETF 联 接 C 》
买 入 金额 200.00 元
付款 方式 余额 宝
买 入 时 间 2026-04-29 09:28:42
确认 信息
确认 金额 200.00 元
确认 份额 62.96%)
确认 净值 3418 元
手续 费 0.00 元
确认 时 间 2026-04-30
`;

    test('解析买入交易-OCR空格分隔+净值漏小数点', () => {
      const result = parseTradeOcrText(buyTextOcrNoise);
      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
      expect(result.data![0]).toEqual({
        fundName: '博时黄金ETF联接C',
        operation: 'buy',
        amount: 200,
        shares: 62.96,
        nav: 3.418,  // OCR漏小数点，3418修正为3.418
        fee: 0,
        tradeTime: '2026-04-29 09:28:42',
        tradeDate: '2026-04-29',
        status: 'completed',
      });
    });

    const sellText1 = `
卖 出 成 功
卖 出 产 品 南 方 有 色 金 属 ETF 联 接 C >
卖 出 时 间 2026-04-24 14:53:26
确 认 份 额 5,000.00 价
确 认 净 值 2.0110
手 续 费 G) 0.00 元
到 账 金 额 10,055.00 元
`;

    test('解析卖出交易', () => {
      const result = parseTradeOcrText(sellText1);
      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
      expect(result.data![0].operation).toBe('sell');
      expect(result.data![0].amount).toBe(10055);
    });

    test('解析卖出交易带手续费OCR噪声（146.707C）', () => {
      // OCR识别手续费为 "146.707C"（元被识别成C）
      const sellTextWithFee = `
卖 出 成 功
卖 出 产 品 永 赢 科 技 智 选 混 合 A >
卖 出 时 间 2026-04-22 14:43:32
确 认 份 额 6,000.00 份
确 认 净 值 4.8899
手 续 费 ® 146.707C
到 账 金 额 29,192.70 元
`;
      const result = parseTradeOcrText(sellTextWithFee);
      expect(result.success).toBe(true);
      expect(result.data![0].fee).toBe(146.7);  // 146.707C应解析为146.70
    });

    test('解析手续费OCR噪声（手续 费 (9) 0.00 元）', () => {
      // OCR识别手续费为 "手续 费 (9) 0.00 元"，其中(9)是噪声
      const sellTextWithNoise = `
卖 出 成 功
卖 出 产 品 天 弘 中 证 电 网 设 备 主 题 指 数 C ~
卖 出 时 间 2026-04-29 14:48:06
确 认 份 额 730.00 份
确 认 净 值 1.3616
手 续 费 (9) 0.00 元
到  金 额 993.97 元
`;
      const result = parseTradeOcrText(sellTextWithNoise);
      expect(result.success).toBe(true);
      expect(result.data![0].fee).toBe(0);  // 应解析为0.00，不应被噪声干扰
    });
  });

  describe('交易汇总列表解析', () => {
    const summaryText = `
买 入 基 金 | 博 时 黄 金 ETF 联 接 C 15,000.00 元
2026-04-28 14:43:54
卖 出 基 金 | 南 方 有 色 金 属 ETF 联 接 C 29,810.13 元
2026-04-29 14:37:44
定 投 基 金 | 华 宝 纳 斯 达 克 精选股票(QDI)C 100.00 元
2026-04-29 09:55:23 交 易 进 行 中
`;

    test('解析多笔交易记录', () => {
      const result = parseTradeOcrText(summaryText);
      expect(result.success).toBe(true);
      expect(result.format).toBe('summary');
      expect(result.data?.length).toBe(3);
    });

    test('正确识别操作类型', () => {
      const result = parseTradeOcrText(summaryText);
      expect(result.data![0].operation).toBe('buy');
      expect(result.data![1].operation).toBe('sell');
      expect(result.data![2].operation).toBe('dingtou');
    });

    test('识别交易状态', () => {
      const result = parseTradeOcrText(summaryText);
      expect(result.data![0].status).toBe('completed');
      expect(result.data![2].status).toBe('pending');
    });

    // OCR噪音前缀变体：EN、IN、IN BE、卖 出 "基金、卖 出 BE
    test('解析8条交易记录-OCR噪音前缀变体', () => {
      const ocrText = `
定投 黄金 | 博时 黄金 ETF 联 接 C 200.00 元
2026-04-30 09:29:05

EN 黄金 | 博时 黄金 ETF 联 接 C 500.00 元
2026-04-29 14:49:46

IN 基金 | 广发 半导体 材料 设备 主 500.00 元
题ETF 联 接 C
2026-04-29 14:49:20

IN BE | 华夏 国 证 半导体 心 片 E 500.00 元
TF 联 接 C
2026-04-29 14:48:58

卖 出 "基金 | 天 弘 中 证 电网 设备 主题 993.97 元
指数 C
2026-04-29 14:48:06

卖 出 "基金 | 华泰 柏 瑞 中 证 油气 产业 386.70 元
ETF 联 接 A
2026-04-29 14:47:41

卖 出 "基金 | 天 弘 中 证 新 能 源 指数 增 2,956.45 元
强 A
2026-04-29 14:47:16

卖 出 BE | 南方 有 色 金 属 ETF 联 接 3,041.85 元
C
2026-04-29 14:46:29
`;
      const result = parseTradeOcrText(ocrText);
      expect(result.success).toBe(true);
      expect(result.format).toBe('summary');
      expect(result.data?.length).toBe(8);

      // 验证操作类型
      expect(result.data![0].operation).toBe('dingtou');  // 定投黄金
      expect(result.data![1].operation).toBe('buy');      // EN黄金 = 买入黄金
      expect(result.data![2].operation).toBe('buy');      // IN基金 = 买入基金
      expect(result.data![3].operation).toBe('buy');      // IN BE = 买入基金
      expect(result.data![4].operation).toBe('sell');     // 卖出"基金
      expect(result.data![5].operation).toBe('sell');     // 卖出"基金
      expect(result.data![6].operation).toBe('sell');     // 卖出"基金
      expect(result.data![7].operation).toBe('sell');     // 卖出BE = 卖出基金

      // 验证金额
      expect(result.data![0].amount).toBe(200);
      expect(result.data![4].amount).toBe(993.97);
      expect(result.data![6].amount).toBe(2956.45);
    });

    // 新增测试：7条记录（包含卖出份额、金额带括号等变体）
    test('解析7条交易记录-卖出份额+金额带括号', () => {
      const ocrText = `
IN 基金 | 南方 有 色 金 属 ETF 联 接 1000.00 元
C 交易 进行 中
2026-04-30 14:48:57

IN 基金 | 天 弘 中 证 电网 设备 主题 1000.00 元
指数 C 交易 进行 中
2026-04-30 14:48:28

买 入 基金 | 天 弘 恒生 科技 ETF 联 接 ( 500.00 元
QDIDC 交易 进行 中
2026-04-30 14:48:01

IN 基金 | 天 弘 中 证 新 能 源 指数 增 500.00 元
强 A 交易 进行 中
2026-04-30 14:47:37

卖 出 基金 | 博时 军工 主题 股票 C 450.0017)
2026-04-30 14:46:34 预计 05-06 24 点 前 到

卖 出 "基金 | 易方达 人 工 智能 ETF 联 1200.00 份
接 C 预计 05-06 24 点 前 到
2026-04-30 14:46:03

卖 出 "基金 | 永 赢 国 证 商用 卫星 通信 1750.00 份
产业 ETF 联 接 A 预计 05-06 24 点 前 到
2026-04-30 14:45:34
`;
      const result = parseTradeOcrText(ocrText);
      expect(result.success).toBe(true);
      expect(result.format).toBe('summary');
      expect(result.data?.length).toBe(7);  // 全部7条记录

      // 验证操作类型
      expect(result.data![0].operation).toBe('buy');      // IN基金
      expect(result.data![1].operation).toBe('buy');      // IN基金
      expect(result.data![2].operation).toBe('buy');      // 买入基金
      expect(result.data![3].operation).toBe('buy');      // IN基金
      expect(result.data![4].operation).toBe('sell');     // 卖出基金 450.00
      expect(result.data![5].operation).toBe('sell');     // 卖出份额
      expect(result.data![6].operation).toBe('sell');     // 卖出份额

      // 验证金额（450.0017应解析为450.00，且判断为份额）
      expect(result.data![4].amount).toBe(450);
      expect(result.data![4].status).toBe('closed');  // 卖出.00结尾 = 份额记录
      expect(result.data![5].amount).toBe(1200);
      expect(result.data![5].status).toBe('closed');   // 份额记录
      expect(result.data![6].amount).toBe(1750);
      expect(result.data![6].status).toBe('closed');   // 份额记录
    });

    // 新增测试：8条记录（定投+卖出份额+金额格式异常），包含完整OCR头部噪音
    test('解析8条交易记录-定投卖出份额混合', () => {
      // 用户实际完整OCR文本（包含头部噪音）
      const ocrText = `
20:56 7 HH ACH 80
《 全 部 持 有 "收益 明细 "交易 记录 O
明细 投资 增值 . 进 阶 理财 V 全 部 Vv
卖 出 "基金 | 广发 半导体 材料 设备 主 1.500.00 份
题ETF 联 接 C 预计 05-06 24 点 前 到
2026-04-30 14:45:03 账

卖 出 "基金 | 华夏 国 证 半导体 心 片 E 2,240.00 份
TF 联 接 C 预计 05-06 24 点 前 到
2026-04-30 14:44:10 账

定投 "基金 | 华泰 柏 瑞 中 证 油气 产业 100.00 元
ETF 联 接 A 交易 进行 中
2026-04-30 10:48:11

定投 "基金 | 广发 纳 斯 达 克 100ETF 10.00 元
联接 (QDIDA 交易 进行 中
2026-04-30 09:49:02

定投 "基金 | 广发 纳 斯 达 克 100ETF 10.00 元
联接 (QDIDA 交易 进行 中
2026-04-29 09:42:39

卖 出 BE | 永 赢 科技 智 选 混合 A 200.00 份
2026-04-30 14:47:03 已 撤销

定投 "基金 | 南方 有 色 金 属 ETF 联 接 100.00 元
C 已 撤销
2026-04-30 10:35:45

定投 "基金 | 天 弘 中 证 新 能 源 指数 增 100.00 元
强 A 已 撤销
2026-04-30 10:16:35
`;
      const result = parseTradeOcrText(ocrText);
      expect(result.success).toBe(true);
      expect(result.format).toBe('summary');
      expect(result.data?.length).toBe(8);

      // 验证操作类型
      expect(result.data![0].operation).toBe('sell');     // 卖出份额
      expect(result.data![1].operation).toBe('sell');     // 卖出份额
      expect(result.data![2].operation).toBe('dingtou');  // 定投
      expect(result.data![3].operation).toBe('dingtou');  // 定投
      expect(result.data![4].operation).toBe('dingtou');  // 定投
      expect(result.data![5].operation).toBe('sell');     // 卖出份额(已撤销)
      expect(result.data![6].operation).toBe('dingtou');  // 定投(已撤销)
      expect(result.data![7].operation).toBe('dingtou');  // 定投(已撤销)

      // 验证金额（1.500.00异常格式修正为1500）
      expect(result.data![0].amount).toBe(1500);
      expect(result.data![1].amount).toBe(2240);

      // 验证状态
      expect(result.data![0].status).toBe('closed');      // 卖出份额
      expect(result.data![1].status).toBe('closed');      // 卖出份额
      expect(result.data![2].status).toBe('pending');     // 交易进行中
      expect(result.data![5].status).toBe('closed');      // 已撤销
      expect(result.data![6].status).toBe('closed');      // 已撤销
    });
  });

  describe('单基金明细列表解析', () => {
    const singleFundText = `
广 发 纳 斯 达 克 100ETF 联 接 (QDI)A(270042)
定 投 10.00 元
2026-04-30 09:44:34 交 易 进 行 中
定 投 10.00 元
2026-04-29 09:37:57
买 入 10,000.00 元
2026-04-28 14:35:37
`;

    test('提取基金代码', () => {
      const result = parseTradeOcrText(singleFundText);
      expect(result.success).toBe(true);
      expect(result.format).toBe('single-detail');
      expect(result.data![0].fundCode).toBe('270042');
    });

    test('解析多笔交易', () => {
      const result = parseTradeOcrText(singleFundText);
      expect(result.data?.length).toBe(3);
    });

    test('识别定投操作', () => {
      const result = parseTradeOcrText(singleFundText);
      expect(result.data![0].operation).toBe('dingtou');
      expect(result.data![2].operation).toBe('buy');
    });

    // trade_history3.jpg OCR变体测试
    test('EA/SEA操作类型OCR变体', () => {
      const text = `
O 永 赢 科技 智 选 混合 A022364)

定投 1,000.007T N
2026-04-30 10:32:03 交易 进行 中

EA 10,000.007T N
2026-04-28 14:35:37

SEA 5,000.007T 、
2026-04-27 14:41:51
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      expect(result.format).toBe('single-detail');
      expect(result.data!.length).toBe(3);
      expect(result.data![0].operation).toBe('dingtou');
      expect(result.data![1].operation).toBe('buy');   // EA = 买入
      expect(result.data![2].operation).toBe('buy');   // SEA实际是买入（金额特征判断）
    });

    test('金额OCR噪声（7T、N、>、、）处理', () => {
      const text = `
O 永 赢 科技 智 选 混合 A022364)

定投 1,000.007T N
2026-04-30 10:32:03

EA 10,000.007T N
2026-04-28 14:35:37

SEA 5,000.007T 、
2026-04-27 14:41:51

EA 20,000.007T >
2026-04-24 14:47:51
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      expect(result.data!.length).toBe(4);
      expect(result.data![0].amount).toBe(1000);     // 1,000.007T → 1000
      expect(result.data![1].amount).toBe(10000);    // 10,000.007T → 10000
      expect(result.data![2].amount).toBe(5000);     // 5,000.007T → 5000
      expect(result.data![3].amount).toBe(20000);    // 20,000.007T → 20000
    });

    test('基金代码格式A022364)提取', () => {
      const text = `
O 永 赢 科技 智 选 混合 A022364)

定投 1,000.00 元
2026-04-30 10:32:03
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      expect(result.data![0].fundCode).toBe('022364');
    });

    // trade_history4.jpg OCR变体测试
    test('金额逗号位置错误（2,.500.00）', () => {
      const text = `
© 南方 有 色 金 属 ETF 联 接 C(004433)

定投 2,.500.00 元
2026-04-30 10:31:57 交易 进行 中
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      expect(result.data![0].amount).toBe(2500);  // 2,.500.00 → 2500
    });

    test('金额OCR噪声混入数字（2,500.005T）', () => {
      const text = `
© 南方 有 色 金 属 ETF 联 接 C(004433)

定投 2,500.005T N
2026-04-29 10:26:08 已 撤 单
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      expect(result.data![0].amount).toBe(2500);  // 2,500.005T → 2500
      expect(result.data![0].status).toBe('closed');
    });

    test('trade_history4完整解析-9条记录', () => {
      const text = `
© 南方 有 色 金 属 ETF 联 接 C(004433)

IA 10,000.007T N
2026-04-30 14:45:37 交易 进行 中
定投 2,.500.00 元

a 2

2026-04-30 10:31:57 交易 进行 中

卖 出 29,810.13 元 、
2026-04-29 14:37:44

定投 2,500.005T N
2026-04-29 10:26:08 已 撤 单

IA 20,000.007T 、
2026-04-28 14:43:07

定投 2,500.005T N
2026-04-28 10:29:33

IA 10,000.007T 、
2026-04-27 14:44:11

定投 2,500.005T N
2026-04-27 10:39:22

卖 出 10,055.00 元 >
2026-04-24 14:53:26
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      expect(result.data!.length).toBe(9);
      // 检查各操作类型
      const operations = result.data!.map(d => d.operation);
      expect(operations.filter(o => o === 'buy').length).toBe(3);      // IA = 买入
      expect(operations.filter(o => o === 'dingtou').length).toBe(4);  // 定投
      expect(operations.filter(o => o === 'sell').length).toBe(2);     // 卖出
      // 检查已撤单状态
      const closedRecords = result.data!.filter(d => d.status === 'closed');
      expect(closedRecords.length).toBe(1);
    });

    // 新增：灵活解析测试 - 不依赖固定操作关键词
    test('灵活解析-未知OCR噪音前缀', () => {
      const text = `
© 南方 有 色 金 属 ETF 联 接 C(004433)

XYZ 10,000.007T N
2026-04-30 14:45:37

ABC 5,000.13 元
2026-04-29 10:26:08
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      expect(result.data!.length).toBe(2);
      // XYZ 10,000.00 → 整数金额 → 买入
      expect(result.data![0].operation).toBe('buy');
      // ABC 5,000.13 → 小数金额 → 卖出
      expect(result.data![1].operation).toBe('sell');
    });

    test('灵活解析-金额特征推断操作', () => {
      const text = `
基金名称(004433)

??? 1,000.00 元
2026-04-30 10:00:00

??? 1,234.56 元
2026-04-29 10:00:00
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      // 1,000.00 整数 → 买入
      expect(result.data![0].operation).toBe('buy');
      // 1,234.56 小数 → 卖出
      expect(result.data![1].operation).toBe('sell');
    });

    test('灵活解析-保留已知操作关键词', () => {
      const text = `
基金名称(004433)

定投 1,000.56 元
2026-04-30 10:00:00

买入 2,000.56 元
2026-04-29 10:00:00

卖出 3,000.00 元
2026-04-28 10:00:00
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      // 定投关键词优先，金额小数也不改变
      expect(result.data![0].operation).toBe('dingtou');
      // 买入关键词优先
      expect(result.data![1].operation).toBe('buy');
      // 卖出关键词优先
      expect(result.data![2].operation).toBe('sell');
    });
  });

  describe('卖出份额交易过滤', () => {
    const sellShareText = `
博 时 军 工 主 题 股 票 C(011592)
卖 出 4400.00 份
2026-04-30 14:42:18 预 计 05.06 日 到 账
买 入 20,000.00 元
2026-04-28 14:40:24
`;

    test('卖出份额交易被忽略', () => {
      const result = parseTradeOcrText(sellShareText);
      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
      expect(result.data![0].operation).toBe('buy');
    });
  });

  describe('多基金交易明细列表解析', () => {
    test('trade_history1格式 - 支持各种OCR噪音前缀', () => {
      // OCR前缀变体：(28)、GAN)、EM)、=)、任何字母组合
      // 灵活识别：基金名称以中文开头，前面都是噪音
      const text = `
(28) 博时 黄金 ETF 联 接 C 1000.00 元
2026-04-30 09:27 确认 成 功

GAN) 博时 黄金 ETF 联 接 C 10000.00 元
2026-04-29 14:46 确认 成 功

(28) 博时 黄金 ETF 联 接 C 1000.00 元
2026-04-29 09:26 确认 成 功

=) 博时 黄金 ETF 联 接 C 5000.00 元
2026-04-24 14:48 确认 成 功

EM) 博时 黄金 ETF 联 接 C 10000.00 元
2026-04-23 14:50 确认 成 功

ABC123) 华夏 国 证 半导体 芯片 ETF 5000.00 元
2026-04-22 14:30 确认 成 功
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      expect(result.format).toBe('multi-detail');
      // 应解析出6条记录
      expect(result.data?.length).toBe(6);
      // 基金名称应正确提取（去掉噪音前缀）
      expect(result.data![0].fundName).toContain('博时黄金ETF联接C');
      expect(result.data![5].fundName).toContain('华夏国证半导体芯片ETF');
    });
  });

  describe('OCR错误字符处理', () => {
    test('处理OCR金额噪声（7T）', () => {
      const text = `
买 入 基 金 | 测试基金A 10,000.007T
2026-04-28 14:35:04
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      expect(result.data![0].amount).toBe(10000);
    });
  });

  // 新增测试用例：2026-05-04 修复中文引号和数字问题
  describe('中文全角引号变体', () => {
    test('定投 "基金（中文全角引号U+201C）', () => {
      const text = `
定投 "基金 | 华 宝 纳 斯 达 克 精 选 股票 100.00 元
(QDIDC 交易 进行 中
2026-04-29 09:55:23
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      expect(result.format).toBe('summary');
      expect(result.data!.length).toBe(1);
      expect(result.data![0].fundName).toContain('华宝纳斯达克精选股票');
      expect(result.data![0].operation).toBe('dingtou');
      expect(result.data![0].amount).toBe(100);
      expect(result.data![0].status).toBe('pending');
    });

    test('定投 "基金（中文全角引号U+201D）', () => {
      const text = `
定投 "基金 | 华泰 柏 瑞 纳 斯 达 克 100 10.00 元
ETF 联 接 (QDIDA 交易 进行 中
2026-04-29 09:41:12
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      expect(result.data!.length).toBe(1);
      expect(result.data![0].fundName).toContain('华泰柏瑞纳斯达克');
    });
  });

  describe('OCR操作类型变体', () => {
    test('IA 基金（买入被OCR识别为IA）', () => {
      const text = `
IA 基金 | 广发 半导体 材料 设备 主 。 5.000.00 元
题 ETF 联 接 C
2026-04-29 14:48:01
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      expect(result.data![0].operation).toBe('buy');
      expect(result.data![0].amount).toBe(5000);
    });

    test('TA 黄金（买入黄金被OCR识别为TA）', () => {
      const text = `
TA 黄金 | 博时 黄金 ETF 联 接 C 10.000.00 元
2026-04-29 14:46:42
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      expect(result.data![0].operation).toBe('buy');
      expect(result.data![0].fundName).toContain('博时黄金ETF联接C');
    });

    test('定投 Be（定投基金被OCR识别为定投Be）', () => {
      const text = `
定投 Be | 华泰 柏 瑞 中 证 油气 产业 1,000,005
ETF 联 接 A 已 撤销
2026-04-29 10:29:51
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      expect(result.data![0].operation).toBe('dingtou');
      expect(result.data![0].status).toBe('closed');
    });

    test('定投 黄金（定投黄金类型）', () => {
      const text = `
定投 黄金 | 博时 黄金 ETF 联 接 C 1000.00 元
2026-04-29 09:26:39
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      expect(result.data![0].operation).toBe('dingtou');
    });
  });

  describe('基金名称包含数字', () => {
    test('摩根纳斯达克100指数 - 数字在名称中不被误识别为金额', () => {
      const text = `
定投 "基金 | 摩根 纳 斯 达 克 100 指 数 100.00 元
(QDIDC 交易 进行 中
2026-04-29 09:43:49
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      expect(result.data![0].fundName).toContain('摩根纳斯达克100指数');
      expect(result.data![0].amount).toBe(100);  // 金额应该是100.00元，不是名称中的100
    });

    test('华泰柏瑞纳斯达克100ETF联接', () => {
      const text = `
定投 "基金 | 华泰 柏 瑞 纳 斯 达 克 100 10.00 元
ETF 联 接 (QDIDA
2026-04-29 09:41:12
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      expect(result.data![0].fundName).toContain('华泰柏瑞纳斯达克100');
      expect(result.data![0].amount).toBe(10);
    });

    test('建信深证100指数增强', () => {
      const text = `
卖 出 "基金 | 建 信 深 证 100 指 数 增强 19722.17 元
2026-04-29 14:41:42
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      expect(result.data![0].fundName).toContain('建信深证100指数增强');
      expect(result.data![0].amount).toBe(19722.17);
    });
  });

  describe('基金代码续行', () => {
    test('(QDIDC 续行应合并到基金名称', () => {
      const text = `
定投 "基金 | 华 宝 纳 斯 达 克 精 选 股票 100.00 元
(QDIDC 交易 进行 中
2026-04-29 09:55:23
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      expect(result.data![0].fundName).toContain('(QDIDC');
    });

    test('ETF联接(QDIDA 续行', () => {
      const text = `
定投 "基金 | 华泰 柏 瑞 纳 斯 达 克 100 10.00 元
ETF 联 接 (QDIDA 交易 进行 中
2026-04-29 09:41:12
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      expect(result.data![0].fundName).toContain('华泰柏瑞纳斯达克100');
      expect(result.data![0].fundName).toContain('ETF联接');
      expect(result.data![0].fundName).toContain('(QDIDA');
    });

    test('广友纳斯达克100ETF联接(QDIDA - 单行基金名称+续行代码', () => {
      const text = `
定投 "基金 | 广 友 纳 斯 达 克 100ETF 10.00 元
联接 (QDIDA 交易 进行 中
2026-04-29 09:37:57
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      expect(result.data![0].fundName).toContain('广友纳斯达克100ETF');
      expect(result.data![0].fundName).toContain('联接');
      expect(result.data![0].fundName).toContain('(QDIDA');
    });

    test('广发半导体材料设备主题ETF联接C - 主题关键词+续行C', () => {
      const text = `
IA 基金 | 广发 半导体 材料 设备 主 。 5.000.00 元
题 ETF 联 接 C
2026-04-29 14:48:01
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      // OCR将"主题"分成"主"和"题"两行，解析器合并后名称包含关键部分
      expect(result.data![0].fundName).toContain('广发半导体材料设备主');
      expect(result.data![0].fundName).toContain('题');  // "题"作为关键词被提取
      expect(result.data![0].fundName).toContain('ETF联接C');
    });

    test('摩根纳斯达克100指数(QDIDC - 不应重复添加C', () => {
      const text = `
定投 "基金 | 摩根 纳 斯 达 克 100 指 数 100.00 元
(QDIDC 交易 进行 中
2026-04-29 09:43:49
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      expect(result.data![0].fundName).toContain('摩根纳斯达克100指数');
      expect(result.data![0].fundName).toContain('(QDIDC');
      // 不应该重复添加C：名称应该是"摩根纳斯达克100指数(QDIDC"，而不是"摩根纳斯达克100指数C(QDIDC"
      expect(result.data![0].fundName).not.toContain('指数C(QDIDC');
    });

    test('易方达人工智能ETF联接C - 联接被OCR分成两行', () => {
      const text = `
IA 基金 | 易方达 人 工 智 能 ETF 联 15,000.00 元
接 C
2026-04-28 14:40:59
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      expect(result.data![0].fundName).toContain('易方达人工智能');
      expect(result.data![0].fundName).toContain('ETF联接C');
      // 不应该缺少"接"字
      expect(result.data![0].fundName).not.toContain('ETF联C');
    });

    test('状态标记不应追加到基金名称', () => {
      const text = `
定投 "基金 | 华 宝 纳 斯 达 克 精 选 股票 100.00 元
(QDIDC 交易 进行 中
2026-04-29 09:55:23
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      expect(result.data![0].fundName).toContain('华宝纳斯达克精选股票');
      expect(result.data![0].fundName).toContain('(QDIDC');
      // "交易进行中"不应该出现在基金名称中
      expect(result.data![0].fundName).not.toContain('交易进行中');
      expect(result.data![0].status).toBe('pending');
    });
  });

  describe('真实browser OCR完整测试', () => {
    test('daily_trade2.jpg OCR输出应解析22条记录', () => {
      // 用户提供的真实browser OCR输出（精简版）
      const text = `
全 部 交易 汇总 2026-04-29 vv
定投 "基金 | 华 宝 纳 斯 达 克 精 选 股票 100.00 元
(QDIDC 交易 进行 中
2026-04-29 09:55:23

定投 "基金 | 摩根 纳 斯 达 克 100 指 数 100.00 元
(QDIDC 交易 进行 中
2026-04-29 09:43:49

买 入 "基金 | 永 赢 国 证 商用 卫星 通信 。 5,000.00 元
产业 ETF 联 接 A
2026-04-29 14:49:42

IA 基金 | 广发 半导体 材料 设备 主 。 5.000.00 元
题 ETF 联 接 C
2026-04-29 14:48:01

TA 黄金 | 博时 黄金 ETF 联 接 C 10.000.00 元
2026-04-29 14:46:42

卖 出 "基金 | 天 弘 中 证 电网 设备 主题 7300000
指数 C 已 撤销
2026-04-29 14:43:56

定投 Be | 华泰 柏 瑞 中 证 油气 产业 1,000,005
ETF 联 接 A 已 撤销
2026-04-29 10:29:51

定投 黄金 | 博时 黄金 ETF 联 接 C 1000.00 元
2026-04-29 09:26:39
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(true);
      expect(result.format).toBe('summary');
      // 应至少解析出8条记录（上面包含了8笔交易）
      expect(result.data!.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('字段缺失处理', () => {
    test('缺少操作类型', () => {
      const text = `
买 入 产 品 天 弘 恒 生 科 技 ETF 联 接 C >
买 入 金 额 2,000.00 元
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(false);
      expect(result.missingFields).toContain('操作类型');
    });

    test('缺少基金名称', () => {
      const text = `
买 入 成 功
买 入 金 额 2,000.00 元
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(false);
      expect(result.missingFields).toContain('基金名称');
    });

    test('缺少金额', () => {
      const text = `
买 入 成 功
买 入 产 品 天 弘 恒 生 科 技 ETF 联 接 C >
`;
      const result = parseTradeOcrText(text);
      expect(result.success).toBe(false);
      expect(result.missingFields).toContain('金额');
    });
  });
});

describe('parseSingleScreenshot', () => {
  // 保留原有测试用例，测试单张截图格式
  describe('买入交易截图解析', () => {
    const buyText = `
买 入 成 功
买 入 产 品 永 赢 科 技 智 选 混 合 A >
买 入 金 额 5,000.00 元
买 入 时 间 2026-04-23 14:44:33
确 认 份 额 1,022.26 份
确 认 净 值 4.8838
手 续 费 7.49 元
`;

    test('解析买入交易', () => {
      const result = parseSingleScreenshot(buyText);
      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
    });
  });
});