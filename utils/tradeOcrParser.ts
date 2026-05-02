// utils/tradeOcrParser.ts
// 交易截图OCR文本解析

/**
 * 交易截图OCR识别结果
 */
export interface OcrTradeData {
  fundName: string;      // 基金名称
  operation: 'buy' | 'sell';  // 操作类型：买入/卖出
  amount: number;        // 金额（买入金额或到账金额）
  shares: number;        // 确认份额
  nav: number;           // 确认净值
  fee: number;           // 手续费
  tradeTime: string;     // 交易时间 YYYY-MM-DD HH:MM:SS
  tradeDate: string;     // 交易日期 YYYY-MM-DD（从tradeTime提取）
}

/**
 * 解析结果
 */
export interface TradeParseResult {
  success: boolean;
  data?: OcrTradeData;
  missingFields?: string[];  // 缺失的必要字段列表
}

/**
 * 修复OCR识别错误的数字格式
 *
 * 常见错误：
 * 1. 数字中间出现多余的小数点，如 "2.962.09" 应该是 "2962.09"
 *    - 规则：如果数字格式是 X.YYY.ZZ（第一个点后有3位以上，第二个点后有2位），
 *      去掉第一个小数点
 * 2. 数字后面有OCR垃圾字符，如 "10,000.007T" 应该是 "10000.00"
 *    - 规则：提取前面有效的数字部分
 * 3. 逗号位置错误，如 "5,.000.00" 应该是 "5000.00"
 *    - 规则：去掉所有逗号后再处理
 */
function fixOcrNumberFormat(numStr: string): string {
  // 先去掉逗号（包括位置错误的逗号如 "5,.000"）
  let cleaned = numStr.replace(/,/g, '');

  // 去掉末尾的非数字字符（如 "7T", "C", "元" 等）
  cleaned = cleaned.replace(/[^\d.]/g, '');

  // 检查是否有多个小数点
  const parts = cleaned.split('.');
  if (parts.length >= 3) {
    // 格式：X.YYY.ZZ 或 X.YY.ZZ 等
    const firstPart = parts[0];  // 千位以上部分
    const middlePart = parts[1]; // 中间部分
    const lastPart = parts.slice(2).join(''); // 合并后面所有部分作为小数部分

    // 如果中间部分是3位或更多（如962），且小数部分是2位
    // 则认为是OCR把千位识别成小数点了
    if (middlePart.length >= 3 && lastPart.length === 2) {
      // 合并第一部分和中间部分，保留最后的小数点
      return `${firstPart}${middlePart}.${lastPart}`;
    }

    // 如果中间部分是3位或更多，但小数部分超过2位（如 .007T 处理后的 .007）
    // 则取小数部分前2位
    if (middlePart.length >= 3 && lastPart.length > 2) {
      return `${firstPart}${middlePart}.${lastPart.substring(0, 2)}`;
    }

    // 如果中间部分长度小于3，可能是其他情况，取最后2位作为小数
    if (middlePart.length < 3) {
      const allDigits = parts.join('');
      if (allDigits.length > 2) {
        return `${allDigits.slice(0, -2)}.${allDigits.slice(-2)}`;
      }
    }
  }

  // 如果只有一个小数点，但小数部分超过2位，截取前2位
  if (parts.length === 2 && parts[1].length > 2) {
    return `${parts[0]}.${parts[1].substring(0, 2)}`;
  }

  return cleaned;
}

/**
 * 解析交易截图OCR文本
 *
 * 支持支付宝基金交易截图格式
 * OCR输出的文字可能包含大量空格（如"买 入 成 功"），需要宽松匹配
 *
 * @param text OCR识别的原始文本
 * @param platform 平台类型（预留扩展），当前仅支持'alipay'
 * @returns TradeParseResult 包含解析结果或缺失字段信息
 */
export function parseTradeScreenshotText(
  text: string,
  platform: 'alipay' = 'alipay'
): TradeParseResult {
  const missingFields: string[] = [];

  // 1. 操作类型：买入成功/卖出成功
  // OCR可能输出"买 入 成 功"（字符间有空格）
  const operationMatch = text.match(/买\s*入\s*成\s*功|卖\s*出\s*成\s*功/);
  const operation: 'buy' | 'sell' | null = operationMatch
    ? (operationMatch[0].includes('买') ? 'buy' : 'sell')
    : null;
  if (!operation) missingFields.push('操作类型');

  // 2. 基金名称：从"买入产品"或"卖出产品"字段提取
  // OCR可能输出"买 入 产 品"或"买 入 产 咤"（品可能被识别错）
  // 末尾可能是">"或"~"（OCR识别差异）
  // 使用宽松匹配：产\s*[任意汉字]后面提取名称，直到遇到空格+符号或行尾
  const productMatch = text.match(/(?:买\s*入|卖\s*出)\s*产\s*[一-龥]\s*(.+?)(?:\s*[>~]|$)/);
  const fundName = productMatch
    ? productMatch[1].replace(/\s+/g, '').trim()
    : '';
  if (!fundName) missingFields.push('基金名称');

  // 3. 金额
  let amount: number | null = null;
  if (operation === 'buy') {
    // 买入时，从"买入金额"字段提取
    // OCR可能输出"买 入 金 额 2.000.00 元"（多了一个小数点）
    const amountMatch = text.match(/买\s*入\s*金\s*额\s*[:：]?\s*([\d,.]+)/);
    if (amountMatch) {
      const amountStr = fixOcrNumberFormat(amountMatch[1].replace(/,/g, ''));
      amount = parseFloat(amountStr);
    }
  } else if (operation === 'sell') {
    // 卖出时，从"到账金额"字段提取
    const amountMatch = text.match(/到\s*账\s*金\s*额\s*[:：]?\s*([\d,.]+)/);
    if (amountMatch) {
      const amountStr = fixOcrNumberFormat(amountMatch[1].replace(/,/g, ''));
      amount = parseFloat(amountStr);
    }
  }
  if (amount === null || amount === 0) missingFields.push('金额');

  // 4. 确认份额
  // OCR可能输出"确 认 份 额 2.962.09 份"（多了一个小数点）
  const sharesMatch = text.match(/确\s*认\s*份\s*额\s*[:：]?\s*([\d,.]+)/);
  let shares: number | null = null;
  if (sharesMatch) {
    const sharesStr = fixOcrNumberFormat(sharesMatch[1].replace(/,/g, ''));
    shares = parseFloat(sharesStr);
  }
  if (shares === null || shares === 0) missingFields.push('确认份额');

  // 5. 确认净值
  // OCR可能输出"确 认 净 值 0.6752"
  const navMatch = text.match(/确\s*认\s*净\s*值\s*[:：]?\s*([\d.]+)/);
  const nav = navMatch ? parseFloat(navMatch[1]) : null;
  if (nav === null || nav === 0) missingFields.push('确认净值');

  // 6. 手续费
  // OCR可能输出"手 续 费 0.00 元" 或 "手 续 费 G) 14.98 元" 或 "手 续 费 (9) 0.00 元"
  // 需要跳过括号内的噪声数字，提取"元"前面的实际手续费
  // 匹配：手 续 费 后面任意字符，然后提取最后一个数字（后面跟着元）
  const feeMatch = text.match(/手\s*续\s*费\s*.*?([\d,.]+)\s*元/);
  let fee: number | null = null;
  if (feeMatch) {
    const feeStr = fixOcrNumberFormat(feeMatch[1].replace(/,/g, ''));
    fee = parseFloat(feeStr);
  }
  if (fee === null) missingFields.push('手续费');

  // 7. 交易时间
  // OCR可能输出"买 入 时 间 2026-04-22 13:02:40"
  // 也可能输出乱码如 "SEH AE 2026-04-22 14:43:32"
  // 时间格式中的冒号可能是半角或全角
  // 首先尝试精确匹配
  const timeMatch = text.match(
    /(?:买\s*入|卖\s*出)\s*时\s*间\s*[:：]?\s*(\d{4}-\d{2}-\d{2}\s*\d{1,2}[:：]\d{2}[:：]\d{2})/
  );
  // 如果精确匹配失败，尝试在文本中查找任意时间格式
  const fallbackTimeMatch = text.match(
    /(\d{4}-\d{2}-\d{2}\s*\d{1,2}[:：]\d{2}[:：]\d{2})/
  );
  let tradeTime = '';
  let tradeDate = '';
  const matchedTime = timeMatch?.[1] || fallbackTimeMatch?.[1];
  if (matchedTime) {
    // 将全角冒号转换为半角，清理可能存在的空格
    tradeTime = matchedTime.replace(/：/g, ':').replace(/\s+/g, ' ');
    // 提取日期部分
    tradeDate = tradeTime.split(' ')[0];
  }
  if (!tradeTime) missingFields.push('交易时间');

  // 检查必要字段是否齐全
  if (missingFields.length > 0) {
    return { success: false, missingFields };
  }

  return {
    success: true,
    data: {
      fundName: fundName!,
      operation: operation!,
      amount: amount!,
      shares: shares!,
      nav: nav!,
      fee: fee!,
      tradeTime: tradeTime!,
      tradeDate: tradeDate!,
    },
  };
}