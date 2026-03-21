// Number formatting helpers used across the app
export function fmtNumber(v: number, decimals = 2): string {
  if (!Number.isFinite(v)) return '';
  try {
    return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);
  } catch {
    return v.toFixed(decimals);
  }
}

// format net value with 4 decimals
export function fmtNav(v: number): string {
  return fmtNumber(v, 4);
}

// Format a number with thousands separator and fixed decimals (always returns string)
export function formatMoneyWithSeparators(v: number, decimals = 2): string {
  if (!Number.isFinite(v)) return '';
  try {
    return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);
  } catch {
    return v.toFixed(decimals);
  }
}

/**
 * 格式化金额（千分位 + 可选正负号）
 * @param v 数值
 * @param decimals 小数位数，默认2
 * @param showSign 是否显示正负号，默认false
 */
export function formatMoney(v: number, decimals = 2, showSign = false): string {
  if (!Number.isFinite(v)) return '';
  const formatted = fmtNumber(Math.abs(v), decimals);
  if (showSign && v > 0) {
    return '+' + formatted;
  }
  return v < 0 ? '-' + formatted : formatted;
}

/**
 * 格式化百分比
 * @param v 数值（如 5.5 表示 5.5%）
 * @param decimals 小数位数，默认2
 */
export function formatPercent(v: number, decimals = 2): string {
  if (!Number.isFinite(v)) return '';
  const sign = v > 0 ? '+' : '';
  return sign + v.toFixed(decimals) + '%';
}

/**
 * 格式化份额（千分位，2位小数）
 * @param v 数值
 */
export function formatShares(v: number): string {
  return fmtNumber(v, 2);
}

// Parse a user-provided formatted number string (may include thousands separators) into a number
// Returns null when input is empty/invalid/negative
export function parseFormattedNumber(s: string): number | null {
  if (s === null || s === undefined) return null;
  const raw = String(s).trim();
  if (raw === '') return null;
  // remove common thousands separators (commas, spaces)
  const cleaned = raw.replace(/[,\s\u00A0]/g, '');
  // allow parentheses or leading + sign? Keep simple: only numeric, optional decimal
  const v = Number(cleaned);
  if (!Number.isFinite(v)) return null;
  // Do not accept negative values here (UI validation requires >= 0)
  if (v < 0) return null;
  // round to 2 decimals
  return Math.round(v * 100) / 100;
}

export default { fmtNumber, fmtNav, formatMoneyWithSeparators, formatMoney, formatPercent, formatShares, parseFormattedNumber };
