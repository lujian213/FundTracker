// scripts/test-browser-real-ocr.ts
// 使用真实的browser OCR输出测试解析器

// 用户提供的真实browser OCR文本
const browserOcrText = `12:09 = & QO % N= "Gl Sul (100) 4
《 "全 部 持 有 收益 明细 BER SO
全 部 交易 汇总 2026-04-29 vv
4x IA 0 5 次 卖 出 O 5 次 定投 /发 车

共 25,000.00 元 共 101950.98 元 共 6,500.00 元

0 次 分 红 0 次 预约

现金 分 红 0.00 元 共 0.00 元

红利 再 投资 0 份

清仓 分 析 分 析 复 盘 历史 持仓 >

你 清仓 的 基金 跑 赢 大 盘 指数

南方 中 证 半导体 产业 指数 C 曾 持 有

收益 超 沪 深 300 指 数 超 14.84% (去 看 看

明细 全 部 Y 全 部

定投 "基金 | 华 宝 纳 斯 达 克 精 选 股票 100.00 元
(QDIDC 交易 进行 中
2026-04-29 09:55:23

定投 "基金 | 摩根 纳 斯 达 克 100 指 数 100.00 元
(QDIDC 交易 进行 中
2026-04-29 09:43:49

定投 "基金 | 华泰 柏 瑞 纳 斯 达 克 100 10.00 元
ETF 联 接 (QDIDA 交易 进行 中
2026-04-29 09:41:12

定投 "基金 | 广 友 纳 斯 达 克 100ETF 10.00 元
联接 (QDIDA 交易 进行 中
2026-04-29 09:37:57

买 入 "基金 | 永 赢 国 证 商用 卫星 通信 。 5,000.00 元
产业 ETF 联 接 A
2026-04-29 14:49:42

IA 基金 | 广发 半导体 材料 设备 主 。 5.000.00 元
题 ETF 联 接 C
2026-04-29 14:48:01

IA 基金 | 华夏 国 证 半导体 芯片 E 5,000.005%
TF 联 接 C
2026-04-29 14:47:28

TA 黄金 | 博时 黄金 ETF 联 接 C 10.000.00 元
2026-04-29 14:46:42

卖 出 "基金 | 天 弘 中 证 电网 设备 主题 7300000
指数 C 已 撤销
2026-04-29 14:43:56

卖 出 "基金 | 华安 恒生 科技 ETF 联 接  18987.205
(QDIDC
2026-04-29 14:43:26

卖 出 "基金 | 华泰 柏 瑞 中 证 油气 产业 3,866.98 元
ETF 联 接 A
2026-04-29 14:42:52

卖 出 "基金 | 建 信 深 证 100 指 数 增强 19722.17 元
2026-04-29 14:41:42

卖 出 "基金 | 天 弘 中 证 新 能 源 指数 增 29564505
强 A
2026-04-29 14:41:03

卖 出 "基金 | 南方 有 色 金 属 ETF 联 接  2981013%
C
2026-04-29 14:37:44

定投 Be | 华泰 柏 瑞 中 证 油气 产业 1,000,005
ETF 联 接 A 已 撤销
2026-04-29 10:29:51

定投 "基金 | 天 弘 中 证 电网 设备 主题 。 2.500.00 元
指数 C
2026-04-29 10:29:40

定投 "基金 | 永 赢 国 证 商用 卫星 通信 1000.00 元
产业 ETF 联 接 A
2026-04-29 10:26:14

定投 "基金 | 永 赢 科技 智 选 混合 A 1.000.00 元
2026-04-29 10:26:11

定投 "基金 | 南方 有 色 金 属 ETF 联 接 2,500,007
C 已 撤销
2026-04-29 10:26:08

定投 "基金 | 博时 军工 主题 股票 C 1.000.00 元
2026-04-29 10:13:03

定投 "基金 | 天 弘 中 证 新 能 源 指数 增 1,000,007
强 A 已 撤销
2026-04-29 10:08:15

定投 黄金 | 博时 黄金 ETF 联 接 C 1000.00 元
2026-04-29 09:26:39

当前 时 间 范 围 暂 无 更 多 记录 ， 请 切换 其 他 周期 尝试`;

import { parseTradeOcrText, PARSER_VERSION } from '../utils/tradeOcrParser';

console.log('解析器版本:', PARSER_VERSION);

// 逐行分析
const lines = browserOcrText.split('\n');
const tradePattern = /((?:买\s*入\s*_?\s*[""]?\s*(?:基\s*金|黄\s*金)|卖\s*出\s*_?\s*[""]?\s*(?:基\s*金)|定\s*投\s*_?\s*[""]?\s*(?:基\s*金|黄\s*金|Be|黄金)|IAN\s*(?:HE|基\s*金)|IA\s*基\s*金|IA\s*BE|TA\s*黄\s*金)\s*(?:基\s*金|黄\s*金|HE|BE|BS)?\s*[""]?\s*)\s*[|｜]\s*(.+?)\s+([\d,.]+(?:\.\d{2})?(?:\.\d+)?\d*)\s*(元|份|%|[A-Za-z]?|$)/;

let matchedLines = 0;
console.log('\n=== 逐行匹配分析 ===');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (line.length === 0) continue;

  const hasPipe = line.includes('|');
  const hasKeyword = line.includes('定投') || line.includes('买') || line.includes('卖') || line.includes('IA') || line.includes('TA') || line.includes('Be') || line.includes('黄金');

  if (hasPipe && hasKeyword) {
    const match = line.match(tradePattern);
    if (match) {
      matchedLines++;
      console.log(`L${i}: ✓ "${line.slice(0, 60)}..."`);
    } else {
      console.log(`L${i}: ✗ 未匹配 "${line}"`);
    }
  }
}

console.log(`\n匹配的交易行数: ${matchedLines}`);

// 最终解析结果
const result = parseTradeOcrText(browserOcrText);
console.log('\n=== 最终解析结果 ===');
console.log('格式:', result.format);
console.log('成功:', result.success);
console.log('记录数:', result.data?.length || 0);

if (result.data) {
  const validRecords = result.data.filter(t => t.status !== 'closed');
  const closedRecords = result.data.filter(t => t.status === 'closed');
  console.log('有效记录:', validRecords.length);
  console.log('已撤销:', closedRecords.length);

  console.log('\n| 序号 | 基金名称 | 操作 | 金额 | 状态 |');
  console.log('|------|----------|------|------|------|');
  result.data.forEach((t, i) => {
    const status = t.status === 'closed' ? '已撤销' : (t.status === 'pending' ? '进行中' : '已完成');
    const op = t.operation === 'dingtou' ? '定投' : (t.operation === 'buy' ? '买入' : '卖出');
    console.log(`| ${i + 1} | ${t.fundName.slice(0, 20)} | ${op} | ${t.amount} | ${status} |`);
  });
}

if (!result.success) {
  console.log('缺失字段:', result.missingFields);
}