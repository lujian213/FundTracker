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
import { IndexMarket, parseIndexCode, isDomesticIndex, isGlobalIndex } from '../src/utils/indexUrlHelper';
import { parseF80TradingPeriods, computeTradingDateAndTime } from './fundService';

const UT = 'fa1a66105171779fbdd067425f38a7c2';

// 板块市场代码（东方财富特有，不在 IndexMarket 中）
export const SECTOR_MARKET_CODE = 90;

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
 * @param config 格式如 "2.H50036"（指数）、"90.BK0877"（板块）、"100.NDX100"（全球指数）或 "124.HSTECH"（港股指数）
 * @returns { market: number; code: string } 或 null（格式无效）
 */
export function parseTrackingIndex(config: string): { market: number; code: string } | null {
  if (!config || typeof config !== 'string') return null;

  const match = config.match(/^(\d+)\.([A-Za-z0-9]+)$/);
  if (!match) return null;

  const market = parseInt(match[1], 10);
  const code = match[2];

  // 使用 indexUrlHelper 中定义的市场代码范围
  // 额外支持板块市场代码 90
  const validMarketCodes = [
    IndexMarket.SHSE,           // 0
    IndexMarket.SZSE,           // 1
    IndexMarket.GLOBAL_INDEX,   // 100
    IndexMarket.HKEX_TECH,      // 124
    IndexMarket.GLOBAL_FUTURE_COMMEX, // 101
    IndexMarket.GLOBAL_FUTURE_NYMEX,  // 102
    SECTOR_MARKET_CODE,         // 90 (板块)
  ];

  // 也支持 2-9 的中证指数等其他市场代码
  if (!validMarketCodes.includes(market) && (market < 2 || market > 9)) {
    return null;
  }

  if (!code) return null;

  return { market, code };
}

/**
 * 判断是否为板块配置
 */
export function isSectorConfig(config: string): boolean {
  const parsed = parseTrackingIndex(config);
  return parsed?.market === SECTOR_MARKET_CODE;
}

/**
 * 判断是否为全球指数配置
 *
 * 注意：这里使用更严格的定义，只有市场代码 100, 101, 102 才是全球指数。
 * 港股指数（100.HSI, 124.*）虽然市场代码是 100/124，但在 indexUrlHelper 中被归类为国内指数。
 */
export function isGlobalIndexConfig(config: string): boolean {
  const parsed = parseTrackingIndex(config);
  if (!parsed) return false;

  // 板块不是全球指数
  if (parsed.market === SECTOR_MARKET_CODE) return false;

  // 恒生指数（100.HSI）是国内指数
  if (parsed.market === IndexMarket.GLOBAL_INDEX && parsed.code === 'HSI') return false;

  // 恒生科技指数（124）是国内指数
  if (parsed.market === IndexMarket.HKEX_TECH) return false;

  // 市场代码 100, 101, 102 是全球指数（排除港股恒生指数）
  if ([IndexMarket.GLOBAL_INDEX, IndexMarket.GLOBAL_FUTURE_COMMEX, IndexMarket.GLOBAL_FUTURE_NYMEX].includes(parsed.market)) {
    return true;
  }

  return false;
}

/**
 * 判断是否为港股指数配置
 */
export function isHKIndexConfig(config: string): boolean {
  const parsed = parseTrackingIndex(config);
  // 恒生科技指数 (124) 或恒生指数 (100.HSI)
  if (parsed?.market === IndexMarket.HKEX_TECH) return true;
  if (parsed?.market === IndexMarket.GLOBAL_INDEX && parsed.code === 'HSI') return true;
  return false;
}

/**
 * 获取跟踪指数/板块的实时涨跌幅（内部函数，接收已解析的参数）
 */
async function fetchTrackingIndexChangePercentInternal(
  parsed: { market: number; code: string }
): Promise<{ changePercent: number; tradeDate: string; lastUpdated: string } | null> {
  const { market, code } = parsed;
  // 增加 f80 字段用于解析交易时段
  const url = `https://push2delay.eastmoney.com/api/qt/stock/get?ut=${UT}&fltt=2&invt=2&secid=${market}.${code}&fields=f12,f14,f2,f3,f43,f170,f80`;

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
    // 开盘前 f170 可能为 0%，这是正常情况，不应该返回 null
    if (changePercent === null || changePercent === '-' || changePercent === '') {
      return null;
    }

    // 解析交易时段，计算正确的交易日期和时间
    const tradingPeriods = parseF80TradingPeriods(json.data.f80);
    const { tradeDate, lastUpdated } = computeTradingDateAndTime(tradingPeriods);

    return {
      changePercent: parseFloat(changePercent),
      tradeDate,
      lastUpdated
    };
  } catch (error) {
    console.error('[fetchTrackingIndexChangePercent] 获取失败:', error);
    return null;
  }
}

/**
 * 获取跟踪指数的实时涨跌幅
 * @param config 跟踪指数配置 "market.code"
 * @returns 指数涨跌幅、交易日期和更新时间，或 null（获取失败）
 */
export async function fetchTrackingIndexChangePercent(
  config: string
): Promise<{ changePercent: number; tradeDate: string; lastUpdated: string } | null> {
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
  if (!parsed || parsed.market !== SECTOR_MARKET_CODE) {
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

  // 获取指数行情（传递已解析的参数，避免重复解析）
  const result = await fetchTrackingIndexChangePercentInternal(parsed);
  if (!result) {
    return {
      valuation: null,
      statusInfo: { status: 'warning', message: '跟踪指数代码不存在' }
    };
  }

  const { changePercent, tradeDate: apiTradeDate, lastUpdated: apiLastUpdated } = result;

  // 查找历史净值中第一个早于 API 收盘日期的记录
  // 估值 = 该记录的净值 × (1 + API涨跌幅)
  // 注意：与 marketFundService 中使用 toLocalDateKey 字符串比较不同，
  // 这里使用时间戳比较，因为 apiTradeDate 是 ISO 格式字符串
  const apiTradeDateTs = new Date(apiTradeDate).getTime();
  let prevPoint = null;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].date < apiTradeDateTs) {
      prevPoint = history[i];
      break;
    }
  }

  if (!prevPoint) {
    return {
      valuation: null,
      statusInfo: { status: 'warning', message: '找不到早于API日期的历史净值数据' }
    };
  }

  const previousPrice = prevPoint.value;
  const netWorthDate = formatDateISO(new Date(prevPoint.date));

  if (previousPrice <= 0) {
    return {
      valuation: null,
      statusInfo: { status: 'warning', message: '净值数据无效，无法计算估值' }
    };
  }

  // 计算估值
  const currentPrice = previousPrice * (1 + changePercent / 100);

  // realtimeDate 使用 API 收盘日期，表示估值数据所属日期
  const realtimeDate = apiTradeDate;
  const lastUpdated = `${apiTradeDate} ${apiLastUpdated.substring(0, 5)}`;

  const valuation: ValuationData = {
    symbol: fundSymbol,
    name: fundName,
    currentPrice,
    previousPrice,
    changePercentage: changePercent,
    lastUpdated,
    realtimeDate,
    netWorthDate,
    valuationDate: apiTradeDate,
    sourceUrl: `https://quote.eastmoney.com/unify/r/${parsed.market}.${parsed.code}`
  };

  return {
    valuation,
    statusInfo: { status: 'ok', message: '正常' }
  };
}

// 重新导出 IndexMarket 枚举，方便使用
export { IndexMarket };