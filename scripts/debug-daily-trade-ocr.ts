// scripts/debug-daily-trade-ocr.ts
// 解析交易截图，提取交易内容
// 使用系统的 tradeOcrParser.ts 模块进行解析

import Tesseract from 'tesseract.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseTradeOcrText, OcrTradeData } from '../utils/tradeOcrParser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


async function run() {
  // 测试所有图片文件
  const testPaths = [
    path.resolve(__dirname, '../debug/daily_trade1.jpg'),
    path.resolve(__dirname, '../debug/daily_trade2.jpg'),
    path.resolve(__dirname, '../debug/daily_trade3.jpg'),
    path.resolve(__dirname, '../debug/trade_history1.jpg'),
    path.resolve(__dirname, '../debug/trade_history2.jpg'),
    path.resolve(__dirname, '../debug/trade_history3.jpg'),
    path.resolve(__dirname, '../debug/trade_history4.jpg'),
    path.resolve(__dirname, '../debug/trade_history5.jpg'),
  ];

  for (const imagePath of testPaths) {
    if (!fs.existsSync(imagePath)) {
      console.error(`文件不存在: ${imagePath}`);
      continue;
    }

    const fileName = path.basename(imagePath);
    console.log(`\n========== ${fileName} ==========`);

    const result = await Tesseract.recognize(imagePath, 'chi_sim+eng', {
      logger: (m: any) => {
        if (m.status === 'recognizing text') {
          const progress = Math.round(m.progress * 100);
          if (progress % 20 === 0) {
            console.log(`识别进度: ${progress}%`);
          }
        }
      },
    });

    const text = result.data.text;

    // 使用系统的 parseTradeOcrText 函数解析
    const parseResult = parseTradeOcrText(text);

    console.log(`\n格式: ${parseResult.format || '未知'}`);
    console.log(`成功: ${parseResult.success}`);

    if (!parseResult.success) {
      console.log(`缺失字段: ${parseResult.missingFields?.join(', ') || '无'}`);
      continue;
    }

    const trades = parseResult.data || [];

    // 打印结果表格
    console.log('\n| 序号 | 基金代码 | 基金名称 | 操作 | 金额 | 时间 | 状态 |');
    console.log('|------|----------|----------|------|------|------|------|');
    trades.forEach((trade, idx) => {
      const status = trade.status === 'closed' ? '已撤销' :
                     (trade.status === 'pending' ? '进行中' : '已完成');
      const operation = trade.operation === 'dingtou' ? '定投' :
                        (trade.operation === 'buy' ? '买入' : '卖出');
      console.log(`| ${idx + 1} | ${trade.fundCode || '-'} | ${trade.fundName} | ${operation} | ${trade.amount} | ${trade.tradeTime} | ${status} |`);
    });

    // 计算金额汇总（排除已关闭的交易）
    const validTrades = trades.filter(t => t.status !== 'closed');
    const buyTotal = validTrades.filter(t => t.operation === 'buy').reduce((sum, t) => sum + t.amount, 0);
    const dingtouTotal = validTrades.filter(t => t.operation === 'dingtou').reduce((sum, t) => sum + t.amount, 0);
    const sellTotal = validTrades.filter(t => t.operation === 'sell').reduce((sum, t) => sum + t.amount, 0);
    console.log(`\n金额汇总：买入 ${buyTotal}，定投 ${dingtouTotal}，卖出 ${sellTotal}`);
    console.log(`记录总数：${trades.length}（有效 ${validTrades.length}，已撤销 ${trades.filter(t => t.status === 'closed').length}，进行中 ${trades.filter(t => t.status === 'pending').length}）`);
  }
}

run().catch(console.error);