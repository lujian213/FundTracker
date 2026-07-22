/**
 * trackingIndexService.ts
 *
 * 跟踪指数服务
 * - 解析跟踪指数配置
 * - 获取指数实时行情
 * - 获取板块实时行情
 * - 计算基金估值
 */

import { ValuationData, CardStatus } from '../types';
import { formatDateISO, formatTime } from '../utils/dateFormat';
import * as marketFundService from './marketFundService';

const UT = 'fa1a66105171779fbdd067425f38a7c2';

// 市场代码常量
export const MARKET_CODE = {
  SZSE_INDEX: 0,      // 深交所指数（国证指数）
  SSE_ETF: 1,         // 上交所ETF
  CSI_INDEX: 2,       // 中证指数
  SECTOR: 90,         // 板块（行业/概念）
} as const;

interface CardStatusInfo {
  status: CardStatus;
  message?: string;
}

/**
 * 板块行情数据
 */
export interface SectorQuote {
  code: string;           // 板块代码（如 BK0877）
  name?: string;          // 板块名称
  changePercent: number;  // 涨跌幅（%）
  indexValue?: number;    // 板块指数点位
  fetchDate: string;      // 获取日期
}

/**
 * 解析跟踪指数/板块配置
 * @param config 格式如 "2.H50036"（指数）或 "90.BK0877"（板块）
 * @returns { market: number; code: string } 或 null（格式无效）
 */
export function parseTrackingIndex(config: string): { market: number; code: string } | null {
  if (!config || typeof config !== 'string') return null;

  const match = config.match(/^(\d+)\.([A-Za-z0-9]+)$/);
  if (!match) return null;

  const market = parseInt(match[1], 10);
  const code = match[2];

  // market 有效范围检查（0-2, 90 是有效的市场代码）
  if (market !== 90 && (market < 0 || market > 9)) return null;
  if (!code) return null;

  return { market, code };
}

/**
 * 判断是否为板块配置
 */
export function isSectorConfig(config: string): boolean {
  const parsed = parseTrackingIndex(config);
  return parsed?.market === MARKET_CODE.SECTOR;
}

/**
 * 获取跟踪指数/板块的实时涨跌幅（内部函数，接收已解析的参数）
 */
async function fetchTrackingIndexChangePercentInternal(
  parsed: { market: number; code: string }
): Promise<{ changePercent: number; fetchDate: string } | null> {
  const { market, code } = parsed;
  const url = `https://push2delay.eastmoney.com/api/qt/stock/get?ut=${UT}&fltt=2&invt=2&secid=${market}.${code}&fields=f12,f14,f2,f3,f43,f170`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!response.ok) {
      return null;
    }

    const json = await response.json();

    if (!json.data) {
      return null;
    }

    // 优先使用 f170（估算涨跌幅），否则使用 f3（实际涨跌幅）
    const changePercent = json.data.f170 ?? json.data.f3 ?? null;
    if (changePercent === null || changePercent === '-' || changePercent === '') {
      return null;
    }

    const fetchDate = formatDateISO(new Date());

    return {
      changePercent: parseFloat(changePercent),
      fetchDate
    };
  } catch (error) {
    console.error('[fetchTrackingIndexChangePercent] 获取失败:', error);
    return null;
  }
}

/**
 * 获取跟踪指数的实时涨跌幅
 * @param config 跟踪指数配置 "market.code"
 * @returns 指数涨跌幅和获取日期，或 null（获取失败）
 */
export async function fetchTrackingIndexChangePercent(
  config: string
): Promise<{ changePercent: number; fetchDate: string } | null> {
  const parsed = parseTrackingIndex(config);
  if (!parsed) return null;
  return fetchTrackingIndexChangePercentInternal(parsed);
}

/**
 * 获取板块实时行情
 * @param config 板块配置，格式如 "90.BK0877"
 * @returns 板块行情数据，或 null（获取失败）
 */
export async function fetchSectorQuote(config: string): Promise<SectorQuote | null> {
  const parsed = parseTrackingIndex(config);
  if (!parsed || parsed.market !== MARKET_CODE.SECTOR) {
    return null;
  }

  const { market, code } = parsed;
  const url = `https://push2delay.eastmoney.com/api/qt/stock/get?ut=${UT}&fltt=2&invt=2&secid=${market}.${code}&fields=f12,f14,f2,f3,f43,f170`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!response.ok) {
      return null;
    }

    const json = await response.json();

    if (!json.data) {
      return null;
    }

    // f12: 代码, f14: 名称, f43: 最新价, f170: 估算涨跌幅, f3: 实际涨跌幅
    const name = json.data.f14 ?? undefined;
    const indexValue = json.data.f43 ?? undefined;
    const changePercent = json.data.f170 ?? json.data.f3 ?? null;

    if (changePercent === null || changePercent === '-' || changePercent === '') {
      return null;
    }

    const fetchDate = formatDateISO(new Date());

    return {
      code,
      name,
      changePercent: parseFloat(changePercent),
      indexValue,
      fetchDate
    };
  } catch (error) {
    console.error('[fetchSectorQuote] 获取失败:', error);
    return null;
  }
}

/**
 * 获取跟踪指数实时行情并计算基金估值
 *
 * 该函数会从历史数据中获取最新的净值和日期，确保返回的估值数据完整且正确。
 * 这与 legacy 估值 API 的行为一致：返回的数据包含正确的 previousPrice 和 netWorthDate。
 *
 * @param config 跟踪指数配置
 * @param fundSymbol 基金代码
 * @param fundName 基金名称
 * @returns 估值数据和状态信息
 */
export async function fetchValuationByTrackingIndex(
  config: string,
  fundSymbol: string,
  fundName: string
): Promise<{ valuation: ValuationData | null; statusInfo: CardStatusInfo }> {
  // 格式校验
  const parsed = parseTrackingIndex(config);
  if (!parsed) {
    return {
      valuation: null,
      statusInfo: { status: 'warning', message: '跟踪指数格式无效' }
    };
  }

  // 从历史数据中获取最新净值和日期
  const history = marketFundService.getHistory(fundSymbol);
  if (!history || history.length === 0) {
    return {
      valuation: null,
      statusInfo: { status: 'warning', message: '缺少历史净值数据，无法计算估值' }
    };
  }

  const latestPoint = history[history.length - 1];
  const previousPrice = latestPoint.value;
  const netWorthDate = formatDateISO(new Date(latestPoint.date));

  if (previousPrice <= 0) {
    return {
      valuation: null,
      statusInfo: { status: 'warning', message: '净值数据无效，无法计算估值' }
    };
  }

  // 获取指数行情（传递已解析的参数，避免重复解析）
  const result = await fetchTrackingIndexChangePercentInternal(parsed);
  if (!result) {
    return {
      valuation: null,
      statusInfo: { status: 'warning', message: '跟踪指数代码不存在' }
    };
  }

  const { changePercent, fetchDate } = result;

  // 计算估值
  const currentPrice = previousPrice * (1 + changePercent / 100);

  // 构建估值数据
  const now = new Date();
  const lastUpdated = `${fetchDate} ${formatTime(now)}`;

  const valuation: ValuationData = {
    symbol: fundSymbol,
    name: fundName,
    currentPrice,
    previousPrice,
    changePercentage: changePercent,
    lastUpdated,
    realtimeDate: fetchDate,
    netWorthDate, // 使用历史数据中的净值日期
    valuationDate: fetchDate,
    sourceUrl: `https://quote.eastmoney.com/unify/r/${parsed.market}.${parsed.code}`
  };

  return {
    valuation,
    statusInfo: { status: 'ok', message: '正常' }
  };
}