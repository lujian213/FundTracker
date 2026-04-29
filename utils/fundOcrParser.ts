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
    // 移除空格和逗号，保留负号
    const rawValue = accumulatedProfitMatch[1].replace(/\s/g, '').replace(/,/g, '');
    accumulatedProfit = parseFloat(rawValue);
  }
  if (accumulatedProfit === null || isNaN(accumulatedProfit)) missingFields.push('累计收益');

  // 净值日期：从 "(MM-DD)" 提取，拼接当前年份
  const navDateMatch = text.match(/\((\d{2})-(\d{2})\)/);
  let navDate: string | null = null;
  if (navDateMatch) {
    const currentYear = new Date().getFullYear();
    navDate = `${currentYear}-${navDateMatch[1]}-${navDateMatch[2]}`;
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