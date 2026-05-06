// utils/fundOcrParser.ts

export interface OcrFundData {
  fundCode: string;           // 必要：基金代码（6位）
  fundName?: string;          // 可选：基金名称
  shares: number;             // 必要：持有份额
  nav: number;                // 必要：基金净值
  navDate: string;            // 必要：净值日期 YYYY-MM-DD
  accumulatedProfit: number;  // 必要：累计收益
}

export interface ParseResult {
  success: boolean;
  data?: OcrFundData;
  missingFields?: string[];  // 缺失的必要字段列表
}

/**
 * 解析 OCR 文本，提取基金关键字段
 *
 * @param text OCR 识别的原始文本
 * @returns ParseResult 包含解析结果或缺失字段信息
 */
export function parseFundInfo(text: string): ParseResult {
  const missingFields: string[] = [];

  // 基金代码：6位数字
  const fundCodeMatch = text.match(/\b(\d{6})\b/);
  const fundCode = fundCodeMatch ? fundCodeMatch[1] : null;
  if (!fundCode) missingFields.push('基金代码');

  // 基金名称：通过位置获取（可选）
  const fundName = parseFundName(text, fundCode || '');

  // 持有份额：匹配 "持有份额" 后面的数字
  // OCR 可能输出 "持 有 份 额"（每个字符间有空格），所以用 \s* 匹配所有空格
  const sharesMatch = text.match(/持\s*有\s*份\s*额\s*([\d,.]+)/);
  let shares: number | null = null;
  if (sharesMatch) {
    const rawValue = sharesMatch[1];
    // 移除逗号和千分位格式错误（如 5.349.92）
    const cleaned = rawValue.replace(/,/g, '').replace(/\.(?=\d{3}\.|\d{3}$)/g, '');
    shares = parseFloat(cleaned);
  }
  if (shares === null || isNaN(shares)) missingFields.push('持有份额');

  // 基金净值：匹配 "基金净值" 后面的数字
  // OCR 可能输出 "基 金 净 值"，格式可能是 "1.6339(04-28)"
  const navMatch = text.match(/基\s*金\s*净\s*值\s*([\d.]+)/);
  const nav = navMatch ? parseFloat(navMatch[1]) : null;
  if (nav === null || isNaN(nav)) missingFields.push('基金净值');

  // 累计收益：匹配 "累计收益" 后面的数字（含负号）
  // OCR 可能输出 "累 计 收 益" 或 "累计收益 : +22,652.44"
  const accumulatedProfitMatch = text.match(/累\s*计\s*收\s*益\s*[:：]?\s*([+-]?\s*[\d,]+\.?\d*)/);
  let accumulatedProfit: number | null = null;
  if (accumulatedProfitMatch) {
    accumulatedProfit = parseAccumulatedProfitValue(accumulatedProfitMatch[1]);
  }
  // 兜底策略：如果关键词匹配失败，在文本末尾查找带正负号的数字
  if (accumulatedProfit === null || isNaN(accumulatedProfit)) {
    accumulatedProfit = extractAccumulatedProfitByPosition(text);
  }
  if (accumulatedProfit === null || isNaN(accumulatedProfit)) missingFields.push('累计收益');

  // 净值日期：从 "(MM-DD)" 提取，拼接当前年份
  // OCR可能将日期误识别为多位数字（如05-006），取最后两位修正
  const navDateMatch = text.match(/\((\d{2})-(\d{1,3})\)/);
  let navDate: string | null = null;
  if (navDateMatch) {
    const currentYear = new Date().getFullYear();
    let day = navDateMatch[2];
    if (day.length > 2) {
      day = day.slice(-2);
    }
    navDate = `${currentYear}-${navDateMatch[1]}-${day}`;
  }
  if (!navDate) missingFields.push('净值日期');

  // 检查必要字段是否齐全
  if (missingFields.length > 0) {
    return { success: false, missingFields };
  }

  return {
    success: true,
    data: {
      fundCode: fundCode!,
      fundName,
      shares: shares!,
      nav: nav!,
      navDate: navDate!,
      accumulatedProfit: accumulatedProfit!,
    },
  };
}

/**
 * 通过位置解析基金名称
 * 基金名称通常在基金代码上方 1-3 行
 */
function parseFundName(text: string, fundCode: string): string | undefined {
  if (!fundCode) return undefined;

  const lines = text.split('\n');
  const codeLineIndex = lines.findIndex((line) => line.includes(fundCode));

  if (codeLineIndex === -1) return undefined;

  // 从上方 1-3 行取最近的非空行
  for (let i = codeLineIndex - 1; i >= Math.max(0, codeLineIndex - 3); i--) {
    const line = lines[i].trim();
    if (line.length > 0) {
      // 清理 OCR 插入的多余空格
      return line.replace(/\s+/g, '');
    }
  }

  // 尝试取基金代码所在行的前半部分
  const codeLine = lines[codeLineIndex];
  const codeIndex = codeLine.indexOf(fundCode);
  if (codeIndex > 0) {
    const namePart = codeLine.substring(0, codeIndex).replace(/\s+/g, '').trim();
    if (namePart.length > 0) return namePart;
  }

  return undefined;
}

/**
 * 解析累计收益数字值
 * OCR可能丢失小数点（如+10,36713），按货币格式假设末尾2位为小数部分
 */
function parseAccumulatedProfitValue(rawValue: string): number | null {
  const cleaned = rawValue.replace(/\s/g, '').replace(/,/g, '');

  if (cleaned.includes('.')) {
    const value = parseFloat(cleaned);
    return isNaN(value) ? null : value;
  }

  // 无小数点时，假设末尾2位为小数部分（标准货币格式）
  const sign = cleaned[0] === '+' || cleaned[0] === '-' ? cleaned[0] : '';
  const digits = sign ? cleaned.slice(1) : cleaned;

  if (digits.length <= 2) {
    const value = parseFloat(cleaned);
    return isNaN(value) ? null : value;
  }

  const value = parseFloat(sign + digits.slice(0, -2) + '.' + digits.slice(-2));
  return isNaN(value) ? null : value;
}

/**
 * 从文本末尾提取累计收益（兜底策略）
 * 当"累计收益"关键词被OCR误识别（如ZTE/RATE/Zit）时，通过位置+格式特征匹配
 */
function extractAccumulatedProfitByPosition(text: string): number | null {
  const lines = text.split('\n');
  const startIdx = Math.max(0, lines.length - 5);
  for (let i = lines.length - 1; i >= startIdx; i--) {
    const line = lines[i];
    // 匹配带正负号的数字：[+-] 后面可能有空格，然后是数字（带千分位，可能有小数点）
    // 格式如：+8,926.16 或 -1234.56 或 +10,36713（小数点丢失）
    const match = line.match(/[+-]\s*[\d,]+(?:\.\d{2})?/);
    if (match) {
      const value = parseAccumulatedProfitValue(match[0]);
      if (value !== null) {
        return value;
      }
    }
  }
  return null;
}