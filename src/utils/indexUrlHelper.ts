/**
 * 指数市场类型枚举（基于东方财富市场代码）
 *
 * 市场代码含义：
 * - 0: 深交所（深证系列）
 * - 1: 上交所（上证系列）
 * - 100: 全球指数（包含美股指数 + 港股恒生指数）
 *   - 美股指数：100.NDX, 100.SPX, 100.DJI 等
 *   - 港股恒生指数：100.HSI（特殊，URL格式与美股不同）
 * - 124: 港股科技指数（恒生科技）
 * - 101: 全球期货 - COMEX（黄金、白银）
 * - 102: 全球期货 - NYMEX（原油等）
 */
export enum IndexMarket {
  SHSE = 1,           // 上交所（上证系列）
  SZSE = 0,           // 深交所（深证系列）
  GLOBAL_INDEX = 100, // 全球指数（美股指数 + 港股恒生指数）
  HKEX_TECH = 124,    // 港股科技指数（恒生科技）
  GLOBAL_FUTURE_COMMEX = 101, // 全球期货 - COMEX（黄金、白银）
  GLOBAL_FUTURE_NYMEX = 102,  // 全球期货 - NYMEX（原油等）
}

/**
 * 指数代码格式：{市场代码}.{指数代码}
 * 例如：1.000001, 0.399001, 124.HSTECH, 100.NDX, 101.GC00Y
 */
export interface IndexCodeParts {
  marketCode: number;    // 市场代码
  indexCode: string;     // 指数代码
}

// ═══════════════════════════════════════════════════════════════════════════════
// 指数名称映射
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 指数名称映射表（用于填充指数名称）
 * 系统中所有指数的名称都应该从这个映射表获取
 */
export const INDEX_NAME_MAP: Record<string, string> = {
  '1.000001': '上证指数',
  '0.399001': '深证成指',
  '0.399006': '创业板指',
  '0.399005': '中小板指',
  '100.NDX': '纳斯达克100',
  '100.NDX100': '纳斯达克100',
  '100.SPX': '标普500',
  '100.DJI': '道琼斯',
  '100.IXIC': '纳斯达克综合指数',
  '100.HSI': '恒生指数',
  '124.HSTECH': '恒生科技',
  '101.GC00Y': 'COMEX黄金',
  '101.SI00Y': 'COMEX白银',
  '102.CL00Y': 'NYMEX原油',
};

/**
 * 指数代码转换字典（将用户输入的简码转换为系统完整代码）
 * 用于AddTickerModal等用户输入场景
 */
export const INDEX_CODE_DICT: Record<string, string> = {
  // 国内指数
  '000001': '1.000001',    // 上证指数
  '399001': '0.399001',    // 深证成指
  '399006': '0.399006',    // 创业板指
  '000300': '1.000300',    // 沪深300
  '000688': '1.000688',    // 科创50
  '000852': '1.000852',    // 中证1000
  // 全球指数
  'NDX': '100.NDX',
  'NDX100': '100.NDX100',
  'IXIC': '100.IXIC',
  'SPX': '100.SPX',
  'DJI': '100.DJI',
  'GC00Y': '101.GC00Y',
  'SI00Y': '101.SI00Y',
  'CL00Y': '102.CL00Y',
  'N225': '100.N225',
  'HSI': '100.HSI',
  'HSTECH': '124.HSTECH',
};

// ═══════════════════════════════════════════════════════════════════════════════
// 基础函数：解析指数代码
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 解析指数代码
 * @param fullCode 完整指数代码，格式：{市场代码}.{指数代码}
 * @returns 解析后的市场代码和指数代码
 */
export function parseIndexCode(fullCode: string): IndexCodeParts {
  const parts = fullCode.split('.');
  if (parts.length !== 2) {
    throw new Error(`Invalid index code format: ${fullCode}. Expected format: {marketCode}.{indexCode}`);
  }

  const marketCode = parseInt(parts[0], 10);
  const indexCode = parts[1];

  return { marketCode, indexCode };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 辅助函数：港股指数判断
// ═══════════════════════════════════════════════════════恒════════════════════════

/**
 * 判断是否为港股指数（用于统一处理特殊逻辑）
 * @param marketCode 市场代码
 * @param indexCode 指数代码
 * @returns 港股指数类型，如果不是港股则返回 null
 */
function getHKIndexType(marketCode: number, indexCode: string): 'hsi' | 'hstech' | null {
  if (marketCode === 100 && indexCode === 'HSI') return 'hsi';
  if (marketCode === 124) return 'hstech';
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 市场判断函数
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 判断是否为国内指数（A股 + 港股）
 * @param symbol 指数代码，格式：{市场代码}.{指数代码}
 * @returns 是否为国内指数
 */
export function isDomesticIndex(symbol: string): boolean {
  try {
    const { marketCode, indexCode } = parseIndexCode(symbol);
    // A股指数：市场代码为 0 或 1
    if (marketCode === 0 || marketCode === 1) return true;
    // 港股指数：使用统一的判断函数
    if (getHKIndexType(marketCode, indexCode)) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * 判断是否为全球指数（美股 + 商品期货等）
 * @param symbol 指数代码，格式：{市场代码}.{指数代码}
 * @returns 是否为全球指数
 */
export function isGlobalIndex(symbol: string): boolean {
  return !isDomesticIndex(symbol);
}

/**
 * 获取指数的市场类型（用于URL生成等）
 * @param symbol 指数代码，格式：{市场代码}.{指数代码}
 * @returns 市场代码
 */
export function getIndexMarketType(symbol: string): number {
  try {
    return parseIndexCode(symbol).marketCode;
  } catch {
    return 1; // 默认上交所
  }
}

/**
 * 获取指数名称
 * @param symbol 指数代码，格式：{市场代码}.{指数代码}
 * @returns 指数名称，如果映射表中没有则返回代码本身
 */
export function getIndexName(symbol: string): string {
  return INDEX_NAME_MAP[symbol] || symbol;
}

/**
 * 转换指数代码（将简码转换为完整代码）
 * @param code 用户输入的简码或完整代码
 * @returns 完整的指数代码（{市场代码}.{指数代码}格式）
 */
export function convertIndexCode(code: string): string {
  // 如果已经是完整格式，直接返回
  if (code.includes('.')) {
    return code;
  }

  // 查找转换字典（字典键都是大写）
  const upper = code.toUpperCase();
  const converted = INDEX_CODE_DICT[upper] || INDEX_CODE_DICT[code];
  return converted || code;
}

/**
 * 根据市场代码和指数代码生成东方财富详情页URL
 * @param marketCode 市场代码
 * @param indexCode 指数代码
 * @returns 东方财富详情页URL
 */
export function generateEastmoneyIndexUrl(marketCode: number, indexCode: string): string {
  const baseUrl = 'https://quote.eastmoney.com';

  // 港股指数：使用统一的判断和URL格式
  const hkType = getHKIndexType(marketCode, indexCode);
  if (hkType) {
    return `${baseUrl}/gb/zs${indexCode}.html`;
  }

  switch (marketCode) {
    case IndexMarket.SHSE:
      // 上交所指数：zs{代码}.html
      return `${baseUrl}/zs${indexCode}.html`;

    case IndexMarket.SZSE:
      // 深交所指数：unify/r/0.{代码}.html
      return `${baseUrl}/unify/r/0.${indexCode}.html`;

    case IndexMarket.GLOBAL_INDEX:
      // 全球指数（美股指数）：gb/zs{代码}.html 或 unify/r/100.{代码}.html
      // 优先使用 gb/zs 格式（港股指数已单独处理）
      return `${baseUrl}/gb/zs${indexCode}.html`;

    case IndexMarket.GLOBAL_FUTURE_COMMEX:
    case IndexMarket.GLOBAL_FUTURE_NYMEX:
      // 全球期货（COMEX/NYMEX）：globalfuture/{代码}.html
      return `${baseUrl}/globalfuture/${indexCode}.html`;

    default:
      // 未识别的市场代码，根据特征推断
      // 如果指数代码是纯数字，使用上交所或深交所格式
      if (/^\d+$/.test(indexCode)) {
        // 数字代码，尝试使用上交所格式
        return `${baseUrl}/zs${indexCode}.html`;
      } else {
        // 字母代码，使用全球指数格式
        return `${baseUrl}/gb/zs${indexCode}.html`;
      }
  }
}

/**
 * 根据完整指数代码自动生成东方财富详情页URL
 * @param fullCode 完整指数代码，格式：{市场代码}.{指数代码}
 * @returns 东方财富详情页URL
 */
export function getIndexDetailUrl(fullCode: string): string {
  const { marketCode, indexCode } = parseIndexCode(fullCode);
  return generateEastmoneyIndexUrl(marketCode, indexCode);
}

/**
 * 获取市场类型的中文描述
 * @param marketCode 市场代码
 * @param indexCode 指数代码（用于特殊判断恒生指数）
 * @returns 市场类型描述
 */
export function getMarketDescription(marketCode: number, indexCode?: string): string {
  // 港股指数：使用统一的判断函数
  const hkType = getHKIndexType(marketCode, indexCode || '');
  if (hkType === 'hsi') return '香港交易所（恒生指数）';
  if (hkType === 'hstech') return '香港交易所（恒生科技）';

  switch (marketCode) {
    case IndexMarket.SHSE:
      return '上海证券交易所';
    case IndexMarket.SZSE:
      return '深圳证券交易所';
    case IndexMarket.GLOBAL_INDEX:
      return '全球指数（美股）';
    case IndexMarket.GLOBAL_FUTURE_COMMEX:
      return '全球期货（COMEX）';
    case IndexMarket.GLOBAL_FUTURE_NYMEX:
      return '全球期货（NYMEX）';
    default:
      return '未知市场';
  }
}

/**
 * 获取市场类型的英文标识
 * @param marketCode 市场代码
 * @param indexCode 指数代码（用于特殊判断恒生指数）
 * @returns 市场类型标识
 */
export function getMarketIdentifier(marketCode: number, indexCode?: string): string {
  // 港股指数：使用统一的判断函数
  const hkType = getHKIndexType(marketCode, indexCode || '');
  if (hkType === 'hsi') return 'HKEX';
  if (hkType === 'hstech') return 'HKEX_TECH';

  switch (marketCode) {
    case IndexMarket.SHSE:
      return 'SHSE';
    case IndexMarket.SZSE:
      return 'SZSE';
    case IndexMarket.GLOBAL_INDEX:
      return 'US'; // 美股指数
    case IndexMarket.GLOBAL_FUTURE_COMMEX:
      return 'COMEX';
    case IndexMarket.GLOBAL_FUTURE_NYMEX:
      return 'NYMEX';
    default:
      return 'UNKNOWN';
  }
}