// utils/tradeOcrParser.ts
// 交易截图OCR文本解析（支持多种格式）
// 版本: v20250504g - 添加英文引号匹配+卖出整数金额推断份额

import Tesseract from 'tesseract.js';

// 解析器版本号（用于调试确认）
export const PARSER_VERSION = 'v20250504g';

/**
 * 交易操作类型
 */
export type TradeOperation = 'buy' | 'sell' | 'dingtou';

/**
 * 交易状态
 */
export type TradeStatus = 'completed' | 'pending' | 'closed';

/**
 * 交易截图OCR识别结果（扩展支持多种格式）
 */
export interface OcrTradeData {
  fundName: string;              // 基金名称
  fundCode?: string;             // 基金代码（可选，单基金明细格式可能有）
  operation: TradeOperation;     // 操作类型：买入/卖出/定投
  amount: number;                // 金额（买入金额或到账金额）
  shares?: number;               // 确认份额（可选）
  nav?: number;                  // 确认净值（可选）
  fee: number;                   // 手续费（默认0）
  tradeTime: string;             // 交易时间 YYYY-MM-DD HH:MM:SS
  tradeDate: string;             // 交易日期 YYYY-MM-DD
  status?: TradeStatus;          // 交易状态（可选）
}

/**
 * 图片格式类型
 */
export type TradeImageFormat = 'single' | 'summary' | 'multi-detail' | 'single-detail';

/**
 * 解析结果
 */
export interface TradeParseResult {
  success: boolean;
  data?: OcrTradeData[];         // 改为数组（一张图可能多笔交易）
  format?: TradeImageFormat;     // 识别的格式类型
  missingFields?: string[];      // 缺失的必要字段列表
}

/**
 * 修复OCR识别错误的金额格式
 *
 * @param amountStr 金额字符串
 * @param operation 操作类型（卖出保留小数，买入/定投取整）
 */
function fixAmountFormat(amountStr: string, operation: TradeOperation = 'buy'): number {
  // 去掉末尾噪声字符（包括 % 和常见OCR符号）
  amountStr = amountStr.replace(/[A-Za-z%、>\s]+$/, '');

  // 处理逗号位置错误：如 "2,.500.00" 应变成 "2500.00"
  // 模式：数字后跟 ",." 再跟数字，说明逗号位置错了
  if (amountStr.match(/\d,\.(\d+)/)) {
    // 去掉错误的逗号，合并数字部分
    amountStr = amountStr.replace(/(\d),\.(\d+)/g, '$1$2');
  }

  // 去掉千分位逗号
  amountStr = amountStr.replace(/,/g, '');

  // 处理空格分隔的多个数字部分
  const spaceParts = amountStr.split(/\s+/);
  if (spaceParts.length > 1) {
    for (let i = spaceParts.length - 1; i >= 0; i--) {
      if (/^\d+\.?\d*$/.test(spaceParts[i])) {
        amountStr = spaceParts[i];
        break;
      }
    }
  }

  // 特殊处理：开头没有数字或只有0
  if (amountStr === '000' || amountStr === '0000' || amountStr === '000.00') {
    return 1000;
  }
  if (amountStr.startsWith('.') && amountStr.length <= 5) {
    return 1000;
  }

  const dotParts = amountStr.split('.');

  // 有小数点的情况
  if (dotParts.length === 2) {
    const intPart = dotParts[0];
    const decPart = dotParts[1];

    // 卖出操作：保留小数部分
    if (operation === 'sell') {
      const fixedDecPart = decPart.length > 2 ? decPart.slice(0, 2) : decPart;
      const result = parseFloat(`${intPart}.${fixedDecPart}`);
      return isNaN(result) ? 0 : result;
    }

    // 买入/定投：小数部分非00视为噪声
    if (decPart === '00') {
      const result = parseFloat(`${intPart}.00`);
      return isNaN(result) ? 0 : result;
    }

    // 小数部分长度>2，可能是噪声（如 100.005 -> 100.00）
    if (decPart.length > 2) {
      const result = parseFloat(`${intPart}.00`);
      return isNaN(result) ? 0 : result;
    }

    // 其他情况保留整数部分
    const result = parseFloat(`${intPart}.00`);
    return isNaN(result) ? 0 : result;
  }

  // 多个小数点（如 1.000.00）
  if (dotParts.length >= 3) {
    const firstPart = dotParts[0];
    const middlePart = dotParts[1];

    // 如果中间部分是3位（如 000），则合并
    if (middlePart.length === 3 && /^\d+$/.test(middlePart)) {
      const result = parseFloat(`${firstPart}${middlePart}.00`);
      return isNaN(result) ? 0 : result;
    }

    // 否则取最后两位作为小数
    const allDigits = dotParts.join('');
    return fixAmountFormat(allDigits, operation);
  }

  // 无小数点
  if (dotParts.length === 1 && amountStr.length > 0) {
    let cleanedDigits = amountStr;

    // 去掉末尾非0数字（噪声）
    while (cleanedDigits.length > 2 && !cleanedDigits.endsWith('0')) {
      cleanedDigits = cleanedDigits.slice(0, -1);
    }

    if (cleanedDigits.length > 2) {
      const intPart = cleanedDigits.slice(0, -2);
      const decPart = cleanedDigits.slice(-2);
      const result = parseFloat(`${intPart}.${decPart}`);
      return isNaN(result) ? 0 : result;
    }

    const result = parseFloat(cleanedDigits);
    return isNaN(result) ? 0 : result;
  }

  return 0;
}

/**
 * 修复OCR识别错误的数字格式（用于份额、净值等）
 */
function fixOcrNumberFormat(numStr: string): string {
  // 先去掉逗号
  let cleaned = numStr.replace(/,/g, '');

  // 去掉末尾的非数字字符
  cleaned = cleaned.replace(/[^\d.]/g, '');

  // 检查是否有多个小数点
  const parts = cleaned.split('.');
  if (parts.length >= 3) {
    const firstPart = parts[0];
    const middlePart = parts[1];
    const lastPart = parts.slice(2).join('');

    if (middlePart.length >= 3 && lastPart.length === 2) {
      return `${firstPart}${middlePart}.${lastPart}`;
    }
    if (middlePart.length >= 3 && lastPart.length > 2) {
      return `${firstPart}${middlePart}.${lastPart.substring(0, 2)}`;
    }
    if (middlePart.length < 3) {
      const allDigits = parts.join('');
      if (allDigits.length > 2) {
        return `${allDigits.slice(0, -2)}.${allDigits.slice(-2)}`;
      }
    }
  }

  if (parts.length === 2 && parts[1].length > 2) {
    return `${parts[0]}.${parts[1].substring(0, 2)}`;
  }

  return cleaned;
}

/**
 * 检测图片格式类型
 */
function detectTradeFormat(text: string): TradeImageFormat {
  // 单张交易成功截图：包含"买入成功"或"卖出成功"
  if (text.match(/买\s*入\s*成\s*功/) || text.match(/卖\s*出\s*成\s*功/)) {
    return 'single';
  }

  // 交易汇总列表：包含"全部交易汇总"或"买入基金|"等
  // 注意：OCR可能输出多种格式变体：
  // - "定投 "基金 |"（带引号）
  // - "IA 基金 |"
  // - "TA 黄金 |"（买入黄金的OCR错误）
  // - "定投 Be |"（定投基金的OCR错误）
  // - "定投 黄金 |"
  // - "全 部 交 易 汇 总"（有空格版本）
  const hasSummaryPattern = text.match(/全\s*部\s*交\s*易\s*汇\s*总/) !== null ||
    text.match(/买\s*入\s*_?\s*["""""]?\s*基\s*金\s*[|｜]/) !== null ||
    text.match(/卖\s*出\s*_?\s*["""""]?\s*基\s*金\s*[|｜]/) !== null ||
    text.match(/定\s*投\s*_?\s*["""""]?\s*基\s*金\s*[|｜]/) !== null ||
    text.match(/买\s*入\s*_?\s*["""""]?\s*黄\s*金\s*[|｜]/) !== null ||
    text.match(/定\s*投\s*_?\s*["""""]?\s*黄\s*金\s*[|｜]/) !== null ||
    text.match(/IA\s*基\s*金\s*[|｜]/) !== null ||
    text.match(/TA\s*黄\s*金\s*[|｜]/) !== null ||
    text.match(/定\s*投\s*Be\s*[|｜]/) !== null ||
    text.match(/定\s*投\s*[|｜]/) !== null;

  if (hasSummaryPattern) {
    return 'summary';
  }

  // 多基金交易明细列表：包含"(28)"或"C"开头的行
  const hasMultiFundHistoryPattern = text.match(/\(28\)/) !== null ||
    text.match(/^C\s+.+?\s+\d+\.\d+\s*元/m) !== null ||
    text.match(/^=\)\s+.+?\s+\d+\.\d+\s*元/m) !== null;

  if (hasMultiFundHistoryPattern) {
    return 'multi-detail';
  }

  // 单基金交易明细列表：包含6位基金代码（括号可能丢失）
  // 格式：(270042) 或 270042) 或 A022364)
  const hasFundCodePattern = text.match(/\d{6}\)/) !== null;

  if (hasFundCodePattern) {
    return 'single-detail';
  }

  // 默认尝试单张格式
  return 'single';
}

/**
 * 解析单张交易成功截图
 */
function parseSingleScreenshot(text: string): TradeParseResult {
  const missingFields: string[] = [];

  // 操作类型
  const operationMatch = text.match(/买\s*入\s*成\s*功|卖\s*出\s*成\s*功/);
  const operation: TradeOperation | null = operationMatch
    ? (operationMatch[0].includes('买') ? 'buy' : 'sell')
    : null;
  if (!operation) missingFields.push('操作类型');

  // 基金名称
  // 匹配"买入产品"或"卖出产品"，OCR可能有空格分隔
  // 格式："买 入 产品 博时 黄金 ETF 联 接 C 》"
  const productMatch = text.match(/(?:买\s*入|卖\s*出)\s*产\s*品?\s*(.+?)(?:\s*[>》~]|\s*$)/m);
  const fundName = productMatch
    ? productMatch[1].replace(/\s+/g, '').trim()
    : '';
  if (!fundName) missingFields.push('基金名称');

  // 金额
  let amount: number | null = null;
  if (operation === 'buy') {
    const amountMatch = text.match(/买\s*入\s*金\s*额\s*[:：]?\s*([\d,.]+)/);
    if (amountMatch) {
      amount = fixAmountFormat(amountMatch[1], 'buy');
    }
  } else if (operation === 'sell') {
    // 卖出金额：匹配"到账金额"或"到金额"（OCR可能漏字）
    const amountMatch = text.match(/到\s*(?:账)?\s*金\s*额\s*[:：]?\s*([\d,.]+)/);
    if (amountMatch) {
      amount = fixAmountFormat(amountMatch[1], 'sell');
    }
  }
  if (amount === null || amount === 0) missingFields.push('金额');

  // 确认份额
  const sharesMatch = text.match(/确\s*认\s*份\s*额\s*[:：]?\s*([\d,.]+)/);
  const shares = sharesMatch ? parseFloat(fixOcrNumberFormat(sharesMatch[1])) : undefined;
  if (shares === undefined) missingFields.push('确认份额');

  // 确认净值
  // OCR可能漏掉小数点：如"3418"实际是"3.418"
  const navMatch = text.match(/确\s*认\s*净\s*值\s*[:：]?\s*([\d.]+)/);
  let nav: number | undefined = undefined;
  if (navMatch) {
    const navStr = navMatch[1];
    const navNum = parseFloat(navStr);
    // 如果净值数值异常大（>100），可能是OCR漏了小数点
    // 常见基金净值范围：0.x ~ 10.x，极少超过100
    if (navNum > 100 && navStr.length >= 4) {
      // 尝试在第一个数字后插入小数点：3418 -> 3.418
      const corrected = parseFloat(`${navStr[0]}.${navStr.slice(1)}`);
      if (corrected > 0 && corrected < 20) {
        nav = corrected;
      } else {
        nav = navNum;
      }
    } else {
      nav = navNum;
    }
  }
  if (nav === undefined) missingFields.push('确认净值');

  // 手续费
  // 特征：手续费关键词后面有空格，金额在行尾（或后面有元/C等单位）
  // 格式可能是: "手续费0.00元" 或 "手续费(9)0.00元" 或 "手续费146.707C"
  const feeMatch = text.match(/手\s*续\s*费\s+.*?([\d,.]+(?:\.\d{2,3})?)\s*(?:元|[A-Za-z]|$)/);
  let fee = 0;
  if (feeMatch) {
    const feeStr = fixOcrNumberFormat(feeMatch[1]);
    const feeNum = parseFloat(feeStr);
    fee = Math.round(feeNum * 100) / 100;
  }

  // 交易时间
  const timeMatch = text.match(
    /(?:买\s*入|卖\s*出)\s*时\s*间\s*[:：]?\s*(\d{4}-\d{2}-\d{2}\s*\d{1,2}[:：]\d{2}[:：]\d{2})/
  );
  const fallbackTimeMatch = text.match(/(\d{4}-\d{2}-\d{2}\s*\d{1,2}[:：]\d{2}[:：]\d{2})/);
  const matchedTime = timeMatch?.[1] || fallbackTimeMatch?.[1];
  let tradeTime = '';
  let tradeDate = '';
  if (matchedTime) {
    tradeTime = matchedTime.replace(/：/g, ':').replace(/\s+/g, ' ');
    tradeDate = tradeTime.split(' ')[0];
  }
  if (!tradeTime) missingFields.push('交易时间');

  if (missingFields.length > 0) {
    return { success: false, missingFields };
  }

  return {
    success: true,
    data: [{
      fundName: fundName!,
      operation: operation!,
      amount: amount!,
      shares,
      nav,
      fee,
      tradeTime: tradeTime!,
      tradeDate: tradeDate!,
      status: 'completed',
    }],
    format: 'single',
  };
}

/**
 * 解析交易汇总列表
 */
function parseTradeSummaryList(text: string): OcrTradeData[] {
  const trades: OcrTradeData[] = [];
  const lines = text.split('\n');

  // 灵活正则：匹配 "前缀 | 基金名称 金额 元" 格式
  // 不限定前缀关键词，用detectOperation判断操作类型
  // 格式变体：
  // - 定投 黄金 | 博时 黄金 ETF 联 接 C 200.00 元
  // - EN 黄金 | 博时 黄金 ETF 联 接 C 500.00 元  (OCR噪音)
  // - 卖 出 "基金 | 天 弘 中 证 电网 设备 主题 993.97 元
  const tradePattern = /^(.+?)\s*[|｜]\s*(.+?)\s+([\d,.]+)\s*(?:元|份)?[A-Za-z\s、>%)]*$/;

  const timePattern = /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/;

  // 已知操作关键词
  const knownOperations = {
    dingtou: ['定投', '定\s*投'],
    buy: ['买入', '买\s*入'],
    sell: ['卖出', '卖\s*出']
  };

  // 检测操作类型（优先关键词，其次金额特征）
  function detectOperation(prefixText: string, rawAmountStr: string): TradeOperation {
    const cleanPrefix = prefixText.replace(/\s+/g, '');

    // 优先检查已知关键词
    for (const keyword of knownOperations.dingtou) {
      if (cleanPrefix.match(new RegExp(keyword, 'i'))) return 'dingtou';
    }
    for (const keyword of knownOperations.buy) {
      if (cleanPrefix.match(new RegExp(keyword, 'i'))) return 'buy';
    }
    for (const keyword of knownOperations.sell) {
      if (cleanPrefix.match(new RegExp(keyword, 'i'))) return 'sell';
    }

    // 没有已知关键词，根据金额特征推断
    const normalizedStr = rawAmountStr.replace(/[A-Za-z%、>\s]+$/, '').replace(/,/g, '');
    const fixedStr = normalizedStr.replace(/(\d),\.(\d+)/g, '$1$2');
    const parts = fixedStr.split('.');

    // 小数部分长度 <= 2 且非 00 → 卖出
    if (parts.length === 2) {
      const decPart = parts[1];
      if (decPart.length <= 2 && decPart !== '00' && decPart !== '0') {
        return 'sell';
      }
    }
    return 'buy';
  }

  let currentTrade: Partial<OcrTradeData> | null = null;
  let prevLineHadTrade = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cleanLine = line.trim();
    if (cleanLine.length === 0) continue;

    const tradeMatch = cleanLine.match(tradePattern);
    if (tradeMatch) {
      // 如果当前交易未结束，跳过这行（噪音）
      if (currentTrade && !currentTrade.tradeTime) continue;

      const prefixText = tradeMatch[1];
      const fundNameRaw = tradeMatch[2];
      const amountStr = tradeMatch[3];

      // 排除时间行被误匹配
      if (prefixText.match(/\d{4}-\d{2}-\d{2}/)) continue;

      if (currentTrade && currentTrade.tradeTime) {
        trades.push(currentTrade as OcrTradeData);
      }

      // 判断操作类型
      const operation = detectOperation(prefixText, amountStr);

      // 基金名称：去掉空格和OCR噪声标点
      let fundName = fundNameRaw.replace(/\s+/g, '').trim();
      fundName = fundName.replace(/[。，、；：]/g, '');

      // 金额处理
      const amount = fixAmountFormat(amountStr, operation);

      // 检查是否是份额记录
      // 1. 明确标识"份"
      const hasShareMark = cleanLine.includes('份') && !cleanLine.includes('元');
      // 2. 卖出交易 + 金额.00结尾 + 无明确"元"单位 → 推断为份额
      //    原因：卖出金额通常有小数（如993.97），整数金额罕见
      //    特殊处理：OCR噪音如"450.0017)"，需要去掉末尾噪音数字
      let normalizedAmount = amountStr.replace(/[A-Za-z%、>\s)]+$/, '').replace(/,/g, '');
      // 处理OCR噪音：小数点后超过2位，截取前2位
      if (normalizedAmount.match(/^\d+\.\d{3,}$/)) {
        normalizedAmount = normalizedAmount.slice(0, normalizedAmount.indexOf('.') + 3);
      }
      const isSellWithIntegerAmount = operation === 'sell' &&
        normalizedAmount.match(/^\d+\.00$/) &&
        !cleanLine.includes('元');

      const isShareRecord = hasShareMark || isSellWithIntegerAmount;

      currentTrade = {
        fundName,
        operation,
        amount,
        fee: 0,
        status: isShareRecord ? 'closed' : 'completed',
      };
      prevLineHadTrade = true;
      continue;
    }

    const timeMatch = cleanLine.match(timePattern);
    if (timeMatch && currentTrade) {
      currentTrade.tradeTime = timeMatch[1];
      currentTrade.tradeDate = timeMatch[1].split(' ')[0];

      // 检查状态标记在时间行
      const cleanTimeLine = cleanLine.replace(/\s+/g, '');
      if (currentTrade.status === 'completed') {
        if (cleanTimeLine.includes('交易进行中') || cleanTimeLine.includes('进行中')) {
          currentTrade.status = 'pending';
        }
        if (cleanTimeLine.includes('已撤销') || cleanTimeLine.includes('已撒销')) {
          currentTrade.status = 'closed';
        }
      }

      trades.push(currentTrade as OcrTradeData);
      currentTrade = null;
      prevLineHadTrade = false;
      continue;
    }

    // 基金名称续行处理（必须在状态行检查之前）
    // 简化逻辑：去掉状态标记词后，追加剩余内容到基金名称
    const cleanLineNoSpace = cleanLine.replace(/\s+/g, '');

    if (prevLineHadTrade && currentTrade) {
      // 检查是否是时间行
      const isTimeLine = cleanLine.match(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/);

      // 检查是否包含状态标记
      const hasStatusMark = cleanLineNoSpace.includes('交易进行中') ||
        cleanLineNoSpace.includes('进行中') ||
        cleanLineNoSpace.includes('已撤销') ||
        cleanLineNoSpace.includes('已撒销') ||
        cleanLineNoSpace.includes('交易关闭');

      // 如果不是时间行，追加到基金名称（去掉状态标记词）
      if (!isTimeLine) {
        // 去掉空格、OCR噪声标点和状态标记词
        let continuation = cleanLine.replace(/\s+/g, '').replace(/[。，、；：]/g, '');
        // 去掉状态标记词
        continuation = continuation.replace(/交易进行中|进行中|已撤销|已撒销|交易关闭/gi, '');
        if (continuation.length > 0 && continuation.length < 30) {
          currentTrade.fundName += continuation;
        }
      }

      // 检查并更新状态
      if (hasStatusMark) {
        if (cleanLineNoSpace.includes('交易进行中') || cleanLineNoSpace.includes('进行中')) {
          currentTrade.status = 'pending';
        }
        if (cleanLineNoSpace.includes('已撤销') || cleanLineNoSpace.includes('已撒销') || cleanLineNoSpace.includes('交易关闭')) {
          currentTrade.status = 'closed';
        }
        continue;  // 状态行跳过后续处理
      }
    }

    // 检查状态标记行（独立的状态行，没有prevLineHadTrade）
    if (!prevLineHadTrade) {
      if (cleanLineNoSpace.includes('交易进行中') || cleanLineNoSpace.includes('进行中')) {
        if (currentTrade) {
          currentTrade.status = 'pending';
        }
        continue;
      }
      if (cleanLineNoSpace.includes('已撤销') || cleanLineNoSpace.includes('已撒销') || cleanLineNoSpace.includes('交易关闭')) {
        if (currentTrade) {
          currentTrade.status = 'closed';
        }
        continue;
      }
    }
  }

  if (currentTrade && currentTrade.tradeTime) {
    trades.push(currentTrade as OcrTradeData);
  }

  return trades;
}

/**
 * 解析多基金交易明细列表
 */
function parseMultiFundDetailList(text: string): OcrTradeData[] {
  const trades: OcrTradeData[] = [];
  const lines = text.split('\n');

  // 灵活匹配多基金明细列表的交易行
  // 基金名称以中文开头，前面的内容都是OCR噪音
  // 格式：噪音前缀 + 中文基金名称 + 金额 + 元
  // 例如：(28) 博时 黄金 ETF 联 接 C 1000.00 元
  //       GAN) 博时 黄金 ETF 联 接 C 10000.00 元
  //       ABC123) 华夏 国 证 半导体 5000.00 元
  const historyPattern = /^(?:.*?\s+)?([一-龥].+?)\s+([\d,]+\.\d+)\s*元$/;
  const timePattern = /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/;

  let currentTrade: Partial<OcrTradeData> | null = null;

  for (const line of lines) {
    const cleanLine = line.trim();

    const tradeMatch = cleanLine.match(historyPattern);
    if (tradeMatch) {
      if (currentTrade && currentTrade.tradeTime) {
        trades.push(currentTrade as OcrTradeData);
      }

      // tradeMatch[1] = 基金名称（以中文开头）
      // tradeMatch[2] = 金额
      let fundName = tradeMatch[1].replace(/\s+/g, '').trim();
      // 去掉基金名称中可能残留的前缀符号
      fundName = fundName.replace(/^[=\)\(\[\]]+/g, '').trim();
      const amount = fixAmountFormat(tradeMatch[2].replace(/,/g, ''), 'buy');

      // 从原始行检测操作类型：噪音前缀包含 (28) 或 ) 结尾（非 =)）表示定投
      // 例如：(28)基金名称、GAN)基金名称、EM)基金名称 → 定投
      // 例如：=)基金名称、C 基金名称 → 买入
      const prefixMatch = cleanLine.match(/^([^一-龥]+)\s+/);
      let operation: TradeOperation = 'buy';  // 默认买入
      if (prefixMatch) {
        const prefix = prefixMatch[1].trim();
        // (28) 或其他以 ) 结尾（但不是 =)）的模式表示定投
        if (prefix === '(28)' || (prefix.endsWith(')') && prefix !== '=)')) {
          operation = 'dingtou';
        }
      }

      currentTrade = {
        fundName,
        operation,
        amount,
        fee: 0,
        status: 'completed',
      };
      continue;
    }

    const timeMatch = cleanLine.match(timePattern);
    if (timeMatch && currentTrade) {
      currentTrade.tradeTime = timeMatch[1] + ':00';
      currentTrade.tradeDate = timeMatch[1].split(' ')[0];

      trades.push(currentTrade as OcrTradeData);
      currentTrade = null;
    }
  }

  if (currentTrade && currentTrade.tradeTime) {
    trades.push(currentTrade as OcrTradeData);
  }

  return trades;
}

/**
 * 解析单基金交易明细列表
 */
function parseSingleFundDetailList(text: string): OcrTradeData[] {
  const trades: OcrTradeData[] = [];
  const lines = text.split('\n');

  // 提取基金名称和代码
  // 支持格式：
  // - 基金名称(270042) - 标准格式
  // - 基金名称A022364) - "("被OCR丢失，A属于基金名称
  // 基金代码必定是6位数字，后面跟着 ")"
  let fundName = '';
  let fundCode = '';

  for (const line of lines) {
    const cleanLine = line.trim();
    // 匹配基金代码：6位数字 + )，前面的都是基金名称
    // 噪音前缀：&、C、28、(<、©、O、阚 等
    const fundMatch = cleanLine.match(/^(?:&|C|28|\(<|©|O|阚)?\s*(.+?)\s*(\d{6})\)/);
    if (fundMatch && fundName === '') {
      let rawFundName = fundMatch[1].replace(/\s+/g, '').trim();
      // 去掉噪音前缀和末尾可能的 "("
      rawFundName = rawFundName.replace(/^&|^C|^28|^[\(]+|^©|^O|^o|^阚/gi, '').trim();
      rawFundName = rawFundName.replace(/\($/, '').trim();  // 去掉末尾的 "("
      fundName = rawFundName;
      fundCode = fundMatch[2];
      break;
    }
  }

  if (!fundName) return trades;

  // 灵活交易行正则：识别行结构特点
  // 格式：前面任意文字 + 中间金额（数字逗号小数点） + 后面元/份/噪音
  // 例如："XYZ 10,000.007T N"、"定投 2,500.00 元"、"卖 出 29,810.13 元 、"
  const tradePattern = /^(.+?)\s+([\d,.]+)\s*(?:元|份)?[A-Za-z\s、>]*$/;
  const timePattern = /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/;

  // 已知操作关键词（中文关键词保留，OCR噪音关键词移除）
  const knownOperations = {
    dingtou: ['定投', '定\s*投'],
    buy: ['买入', '买\s*入'],
    sell: ['卖出', '卖\s*出']
  };
  // 注意：EA、SEA、IA、TA等OCR噪音关键词不再写死匹配，改用金额特征判断

  // 检测操作类型的辅助函数（使用原始金额字符串）
  function detectOperation(prefixText: string, rawAmountStr: string): TradeOperation {
    const cleanPrefix = prefixText.replace(/\s+/g, '');

    // 优先检查已知关键词
    for (const keyword of knownOperations.dingtou) {
      if (cleanPrefix.match(new RegExp(keyword, 'i'))) return 'dingtou';
    }
    for (const keyword of knownOperations.buy) {
      if (cleanPrefix.match(new RegExp(keyword, 'i'))) return 'buy';
    }
    for (const keyword of knownOperations.sell) {
      if (cleanPrefix.match(new RegExp(keyword, 'i'))) return 'sell';
    }

    // 没有已知关键词，根据原始金额字符串特征推断
    // 去掉噪音字符后判断小数部分
    const normalizedStr = rawAmountStr.replace(/[A-Za-z%、>\s]+$/, '').replace(/,/g, '');
    // 处理逗号位置错误
    const fixedStr = normalizedStr.replace(/(\d),\.(\d+)/g, '$1$2');
    const parts = fixedStr.split('.');

    // 小数部分长度 <= 2 且不是 00/007 → 卖出
    // 例如：29,810.13 → 卖出
    // 例如：5,000.007 → 噪音（买入）
    if (parts.length === 2) {
      const decPart = parts[1];
      // 小数部分长度 <= 2 且非 00 → 卖出
      if (decPart.length <= 2 && decPart !== '00' && decPart !== '0') {
        return 'sell';
      }
    }
    // 默认买入
    return 'buy';
  }

  let currentTrade: Partial<OcrTradeData> | null = null;
  let skipCurrent = false;

  for (const line of lines) {
    const cleanLine = line.trim();

    // 卖出份额交易忽略（包含"份"而非"元"）
    const sellShareMatch = cleanLine.match(/^卖\s*出\s+[\d,]+\.\d+\s*份/);
    if (sellShareMatch) {
      skipCurrent = true;
      currentTrade = null;
      continue;
    }

    const tradeMatch = cleanLine.match(tradePattern);
    if (tradeMatch) {
      const prefixText = tradeMatch[1];  // 前面的文字部分
      const amountStr = tradeMatch[2];   // 金额部分

      // 排除时间行被误匹配（前缀包含日期）
      if (prefixText.match(/\d{4}-\d{2}-\d{2}/)) continue;

      // 关键逻辑：如果当前交易还未结束（没有tradeTime），这行应该是噪音，忽略
      // 只有当 currentTrade 为 null 时才尝试匹配新的交易行
      if (currentTrade && !currentTrade.tradeTime) continue;

      skipCurrent = false;
      const operation = detectOperation(prefixText, amountStr);
      const amount = fixAmountFormat(amountStr, operation);

      currentTrade = {
        fundName,
        fundCode,
        operation,
        amount,
        fee: 0,
        status: 'completed',
      };
      continue;
    }

    const timeMatch = cleanLine.match(timePattern);
    if (timeMatch && currentTrade && !skipCurrent) {
      currentTrade.tradeTime = timeMatch[1];
      currentTrade.tradeDate = timeMatch[1].split(' ')[0];

      const cleanTimeLine = cleanLine.replace(/\s+/g, '');
      if (cleanTimeLine.includes('交易进行中') || cleanTimeLine.includes('进行中')) {
        currentTrade.status = 'pending';
      }
      if (cleanTimeLine.includes('已撤单') || cleanTimeLine.includes('已撤销')) {
        currentTrade.status = 'closed';
      }

      trades.push(currentTrade as OcrTradeData);
      currentTrade = null;
    }
  }

  if (currentTrade && !skipCurrent && currentTrade.tradeTime) {
    trades.push(currentTrade as OcrTradeData);
  }

  return trades;
}

/**
 * 统一解析入口
 */
export function parseTradeOcrText(text: string): TradeParseResult {
  const format = detectTradeFormat(text);
  let data: OcrTradeData[];

  switch (format) {
    case 'single':
      return parseSingleScreenshot(text);
    case 'summary':
      data = parseTradeSummaryList(text);
      break;
    case 'multi-detail':
      data = parseMultiFundDetailList(text);
      break;
    case 'single-detail':
      data = parseSingleFundDetailList(text);
      break;
    default:
      return parseSingleScreenshot(text);
  }

  if (data.length === 0) {
    return { success: false, missingFields: ['无法识别交易记录'] };
  }

  return {
    success: true,
    data,
    format,
  };
}

/**
 * OCR识别图片并解析交易信息
 */
export async function recognizeTradeImage(imageFile: File): Promise<TradeParseResult> {
  try {
    const result = await Tesseract.recognize(imageFile, 'chi_sim+eng');

    const text = result.data.text;
    return parseTradeOcrText(text);
  } catch (error) {
    return {
      success: false,
      missingFields: [`OCR识别失败: ${error instanceof Error ? error.message : '未知错误'}`],
    };
  }
}

// 保留旧函数名兼容（单张截图解析）
export { parseSingleScreenshot };

// 保留旧函数名兼容
export function parseTradeScreenshotText(text: string, platform: 'alipay' = 'alipay'): TradeParseResult {
  return parseSingleScreenshot(text);
}