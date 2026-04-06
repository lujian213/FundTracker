/**
 * services/marketFundService.ts
 *
 * 基金数据管理服务
 * - 管理基金配置（完整 MarketFund：info + trades + intraday + history）
 * - 提供运行时 MarketFund（包含交易、日内和历史数据）
 * - 处理数据迁移
 */

import {
  MarketFund, FundInfo, FundPosition, TradeRecord,
  HistoricalPoint, IntradayPoint, ValuationData, Ticker, MarketType
} from '../types';
import { STORAGE_KEYS, OLD_STORAGE_KEYS } from './storageKeys';
import { floorToMinute, isSameLocalDay } from '../utils/dateTimeUtils';

// ═══════════════════════════════════════════════════════════════════════════════
// 内存缓存
// ═══════════════════════════════════════════════════════════════════════════════

// 统一基金缓存：Map<string, MarketFund>（含info、trades、intraday、history）
const funds = new Map<string, MarketFund>();

// ═══════════════════════════════════════════════════════════════════════════════
// 初始化
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 从 localStorage 加载数据并初始化缓存
 */
function init(): void {
  console.log('[FundMigration] init() 开始执行');
  console.log(`[FundMigration] ${STORAGE_KEYS.FUND_DATA} 存在: ${localStorage.getItem(STORAGE_KEYS.FUND_DATA) !== null}`);

  // 检查新 key 数据格式是否正确
  let needsMigration = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.FUND_DATA);
    if (raw) {
      const items = JSON.parse(raw);
      if (Array.isArray(items) && items.length > 0) {
        // 检查第一个元素是否有嵌套的 ticker 结构
        const first = items[0];
        if (first.info?.ticker?.symbol) {
          // 新格式，不需要迁移
          needsMigration = false;
          console.log(`[FundMigration] 新 key 数据格式正确，${items.length} 个基金`);
        } else {
          // 旧格式（info 直接包含 symbol/name 等），需要迁移
          console.log('[FundMigration] 新 key 数据格式为旧版，需要重新迁移');
          // 删除旧格式的新 key，让迁移重新执行
          localStorage.removeItem(STORAGE_KEYS.FUND_DATA);
        }
      }
    }
  } catch (e) {
    console.error('[FundMigration] 检查新 key 格式失败:', e);
    // 出错时删除并重新迁移
    localStorage.removeItem(STORAGE_KEYS.FUND_DATA);
  }

  // 执行迁移（如果需要）
  if (needsMigration) {
    console.log('[FundMigration] 执行迁移...');
    migrateFromOldKeys();
  }

  // 从新 key 加载完整 MarketFund 数据
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.FUND_DATA);
    if (raw) {
      const marketFunds: MarketFund[] = JSON.parse(raw);
      console.log(`[FundMigration] 从新 key 加载 ${marketFunds.length} 个基金`);
      marketFunds.forEach(m => {
        // 确保每个 MarketFund 都有完整字段
        funds.set(m.info.ticker.symbol, {
          info: m.info,
          trades: m.trades || [],
          intraday: m.intraday || [],
          history: m.history || [],
        });
      });
      console.log(`[FundMigration] 成功加载 ${funds.size} 个基金到内存`);
    } else {
      console.log('[FundMigration] 新 key 无数据');
    }
  } catch (e) {
    console.error('[FundMigration] 加载新 key 失败:', e);
  }
}

/**
 * 从旧 key 迁移数据到新 key
 * 合并 Ticker + ValuationData + Position + Trades + History + Intraday
 */
function migrateFromOldKeys(): void {
  const OLD_KEYS = OLD_STORAGE_KEYS.FUND;
  console.log('[FundMigration] 开始迁移...');

  // 收集 Ticker 数据
  const tickerMap = new Map<string, Ticker>();

  // 1. 从 fund_portfolio 读取 Ticker[]
  try {
    const portfolioRaw = localStorage.getItem(OLD_KEYS.PORTFOLIO);
    console.log(`[FundMigration] ${OLD_KEYS.PORTFOLIO} 存在: ${portfolioRaw !== null}`);
    if (portfolioRaw) {
      const tickers: Ticker[] = JSON.parse(portfolioRaw);
      tickers.forEach(t => {
        tickerMap.set(t.symbol, t);
      });
      console.log(`[FundMigration] 从 ${OLD_KEYS.PORTFOLIO} 读取 ${tickers.length} 个 Ticker`);
    }
  } catch (e) {
    console.error('[FundMigration] 读取 fund_portfolio 失败:', e);
  }

  // 收集 ValuationData 数据
  const valuationMap = new Map<string, ValuationData>();

  // 2. 从 fund_market_data 读取 ValuationData
  try {
    const marketDataRaw = localStorage.getItem(OLD_KEYS.MARKET_DATA);
    console.log(`[FundMigration] ${OLD_KEYS.MARKET_DATA} 存在: ${marketDataRaw !== null}`);
    if (marketDataRaw) {
      const valuations: Record<string, ValuationData> = JSON.parse(marketDataRaw);
      Object.entries(valuations).forEach(([symbol, v]) => {
        valuationMap.set(symbol, v);
        // 如果 ticker 中没有这个 symbol，创建一个基础 Ticker
        if (!tickerMap.has(symbol)) {
          tickerMap.set(symbol, {
            id: Math.random().toString(36).substr(2, 9),
            symbol,
            name: v.name,
            market: MarketType.FUND,
          });
        }
      });
      console.log(`[FundMigration] 从 ${OLD_KEYS.MARKET_DATA} 读取 ${valuationMap.size} 个估值`);
    }
  } catch (e) {
    console.error('[FundMigration] 读取 fund_market_data 失败:', e);
  }

  // 收集 Position 数据
  const positionMap = new Map<string, FundPosition>();

  // 3. 从 fund_position_{symbol} 读取持仓配置
  try {
    const positionKeys = Object.keys(localStorage).filter(k => k.startsWith(OLD_KEYS.POSITION_PREFIX));
    console.log(`[FundMigration] 找到 ${positionKeys.length} 个 ${OLD_KEYS.POSITION_PREFIX}* key`);
    positionKeys.forEach(k => {
        const symbol = k.replace(OLD_KEYS.POSITION_PREFIX, '');
        try {
          const raw = localStorage.getItem(k);
          if (raw) {
            const pos = JSON.parse(raw);
            positionMap.set(symbol, {
              fullCapacity: Number(pos.fullCapacity) || 0,
              initialPosition: Number(pos.initialPosition) || 0,
              startDate: pos.startDate ?? null,
              initialPrice: pos.initialPrice === undefined ? null : Number(pos.initialPrice),
            });
            // 如果 ticker 中没有这个 symbol，创建一个基础 Ticker
            if (!tickerMap.has(symbol)) {
              tickerMap.set(symbol, {
                id: Math.random().toString(36).substr(2, 9),
                symbol,
                name: symbol,
                market: MarketType.FUND,
              });
            }
          }
        } catch { /* ignore */ }
      });
  } catch { /* ignore */ }

  // 4. 从 fund_trades 读取交易记录
  const tradesMap = new Map<string, TradeRecord[]>();
  try {
    const tradesRaw = localStorage.getItem(OLD_KEYS.TRADES);
    if (tradesRaw) {
      const allTrades: Record<string, TradeRecord[]> = JSON.parse(tradesRaw);
      Object.entries(allTrades).forEach(([symbol, trades]) => {
        tradesMap.set(symbol, trades);
      });
    }
  } catch { /* ignore */ }

  // 5. 构建 MarketFund，合并 history 和 intraday
  const marketFunds: MarketFund[] = [];

  // 合并所有有数据的 symbol（ticker、valuation、position 都可能带来 symbol）
  const allSymbols = new Set([
    ...tickerMap.keys(),
    ...valuationMap.keys(),
    ...positionMap.keys(),
  ]);

  console.log(`[FundMigration] allSymbols 数量: ${allSymbols.size}, ticker=${tickerMap.size}, valuation=${valuationMap.size}, position=${positionMap.size}`);

  for (const symbol of allSymbols) {
    const ticker = tickerMap.get(symbol);
    const valuation = valuationMap.get(symbol);
    const position = positionMap.get(symbol);

    // 构建 FundInfo（嵌套结构）
    const info: FundInfo = {
      ticker: ticker || {
        id: Math.random().toString(36).substr(2, 9),
        symbol,
        name: valuation?.name || symbol,
        market: MarketType.FUND,
      },
      position,
      valuation,
    };

    // 读取历史数据
    let history: HistoricalPoint[] = [];
    try {
      const historyRaw = localStorage.getItem(`${OLD_KEYS.HISTORY_PREFIX}${symbol}`);
      if (historyRaw) {
        history = JSON.parse(historyRaw);
      }
    } catch { /* ignore */ }

    // 读取日内数据
    let intraday: IntradayPoint[] = [];
    try {
      const intradayRaw = localStorage.getItem(`${OLD_KEYS.INTRADAY_PREFIX}${symbol}`);
      if (intradayRaw) {
        const parsed: IntradayPoint[] = JSON.parse(intradayRaw);
        // 只保留当天的日内数据
        intraday = filterTodayIntraday(parsed);
      }
    } catch { /* ignore */ }

    // 读取交易记录
    const trades = tradesMap.get(symbol) || [];

    marketFunds.push({ info, trades, intraday, history });
  }

  console.log(`[FundMigration] 构建了 ${marketFunds.length} 个 MarketFund`);

  // 6. 保存到新 key
  if (marketFunds.length > 0) {
    try {
      localStorage.setItem(STORAGE_KEYS.FUND_DATA, JSON.stringify(marketFunds));
      console.log(`[FundMigration] 成功保存 ${marketFunds.length} 个基金到 ${STORAGE_KEYS.FUND_DATA}`);
    } catch (e) {
      console.error('[FundMigration] 保存失败:', e);
    }
  } else {
    console.log('[FundMigration] marketFunds 为空，跳过保存');
  }
}

/**
 * 过滤只保留当天的日内数据
 */
function filterTodayIntraday(points: IntradayPoint[]): IntradayPoint[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayEnd = todayStart + 24 * 60 * 60 * 1000;

  return points.filter(pt => {
    const ts = Number(pt.timestamp) || 0;
    return ts >= todayStart && ts < todayEnd;
  });
}

// 初始化
init();

// ═══════════════════════════════════════════════════════════════════════════════
// 基本信息管理
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 获取所有基金符号列表
 */
export function getAllFundSymbols(): string[] {
  return Array.from(funds.keys());
}

/**
 * 获取所有基金信息列表
 */
export function getAllFundInfos(): FundInfo[] {
  return Array.from(funds.values()).map(m => m.info);
}

/**
 * 获取所有基金的Ticker列表（从FundInfo.ticker提取）
 */
export function getAllTickers(): Ticker[] {
  return Array.from(funds.values()).map(m => m.info.ticker);
}

/**
 * 获取所有基金的估值数据映射（从FundInfo.valuation提取）
 */
export function getAllValuations(): Record<string, ValuationData> {
  const data: Record<string, ValuationData> = {};
  for (const m of funds.values()) {
    if (m.info.valuation) {
      data[m.info.ticker.symbol] = m.info.valuation;
    }
  }
  return data;
}

/**
 * 获取所有基金的完整数据
 */
export function getAllMarketFunds(): MarketFund[] {
  return Array.from(funds.values());
}

/**
 * 获取单个基金的完整数据
 */
export function getMarketFund(symbol: string): MarketFund | null {
  return funds.get(symbol) || null;
}

/**
 * 获取单个基金的信息
 */
export function getFundInfo(symbol: string): FundInfo | null {
  return funds.get(symbol)?.info || null;
}

/**
 * 添加新基金
 */
export function addFund(symbol: string, name: string): void {
  if (funds.has(symbol)) return;

  const info: FundInfo = {
    ticker: {
      id: Math.random().toString(36).substr(2, 9),
      symbol,
      name,
      market: MarketType.FUND,
    },
  };

  funds.set(symbol, { info, trades: [], intraday: [], history: [] });
  saveToStorage();
}

/**
 * 删除基金
 */
export function removeFund(symbol: string): void {
  funds.delete(symbol);
  saveToStorage();
}

/**
 * 批量删除基金
 */
export function removeFunds(symbols: string[]): void {
  symbols.forEach(symbol => funds.delete(symbol));
  saveToStorage();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 估值数据更新
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 更新基金估值数据
 */
export function updateValuation(symbol: string, data: ValuationData): void {
  const existing = funds.get(symbol);
  if (existing) {
    existing.info = {
      ...existing.info,
      ticker: {
        ...existing.info.ticker,
        name: data.name || existing.info.ticker.name,
      },
      valuation: data,
    };
  } else {
    // 新基金，创建完整记录
    const info: FundInfo = {
      ticker: {
        id: Math.random().toString(36).substr(2, 9),
        symbol,
        name: data.name,
        market: MarketType.FUND,
      },
      valuation: data,
    };
    funds.set(symbol, { info, trades: [], intraday: [], history: [] });
  }
  saveToStorage();
}

/**
 * 批量更新基金估值数据
 */
export function batchUpdateValuations(valuations: Record<string, ValuationData>): void {
  Object.entries(valuations).forEach(([symbol, data]) => {
    const existing = funds.get(symbol);
    if (existing) {
      existing.info = {
        ...existing.info,
        ticker: {
          ...existing.info.ticker,
          name: data.name || existing.info.ticker.name,
        },
        valuation: data,
      };
    } else {
      const info: FundInfo = {
        ticker: {
          id: Math.random().toString(36).substr(2, 9),
          symbol,
          name: data.name,
          market: MarketType.FUND,
        },
        valuation: data,
      };
      funds.set(symbol, { info, trades: [], intraday: [], history: [] });
    }
  });
  saveToStorage();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 持仓配置管理
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 获取基金持仓配置
 */
export function getPosition(symbol: string): FundPosition | undefined {
  return funds.get(symbol)?.info.position;
}

/**
 * 更新基金持仓配置
 */
export function updatePosition(symbol: string, position: FundPosition): void {
  const existing = funds.get(symbol);
  if (existing) {
    existing.info.position = position;
    saveToStorage();
  } else {
    // 创建新基金记录
    const info: FundInfo = {
      ticker: {
        id: Math.random().toString(36).substr(2, 9),
        symbol,
        name: '',
        market: MarketType.FUND,
      },
      position,
    };
    funds.set(symbol, { info, trades: [], intraday: [], history: [] });
    saveToStorage();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 交易记录管理
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 获取基金交易记录
 */
export function getTrades(symbol: string): TradeRecord[] {
  return funds.get(symbol)?.trades || [];
}

/**
 * 更新基金交易记录
 */
export function updateTrades(symbol: string, trades: TradeRecord[]): void {
  const existing = funds.get(symbol);
  if (existing) {
    existing.trades = trades;
    saveToStorage();
  } else {
    // 创建新基金记录
    const info: FundInfo = {
      ticker: {
        id: Math.random().toString(36).substr(2, 9),
        symbol,
        name: '',
        market: MarketType.FUND,
      },
    };
    funds.set(symbol, { info, trades, intraday: [], history: [] });
    saveToStorage();
  }
}

/**
 * 添加交易记录
 */
export function addTrade(symbol: string, trade: TradeRecord): void {
  const existing = funds.get(symbol);
  if (existing) {
    existing.trades = [trade, ...existing.trades];
    saveToStorage();
  } else {
    // 创建新基金记录
    const info: FundInfo = {
      ticker: {
        id: Math.random().toString(36).substr(2, 9),
        symbol,
        name: '',
        market: MarketType.FUND,
      },
    };
    funds.set(symbol, { info, trades: [trade], intraday: [], history: [] });
    saveToStorage();
  }
}

/**
 * 更新交易记录
 */
export function updateTrade(symbol: string, id: string, patch: Partial<TradeRecord>): void {
  const existing = funds.get(symbol);
  if (existing) {
    existing.trades = existing.trades.map(t => t.id === id ? { ...t, ...patch } : t);
    saveToStorage();
  }
}

/**
 * 删除交易记录
 */
export function removeTrade(symbol: string, id: string): void {
  const existing = funds.get(symbol);
  if (existing) {
    existing.trades = existing.trades.filter(t => t.id !== id);
    saveToStorage();
  }
}

/**
 * 获取所有基金的交易记录
 */
export function getAllTrades(): Record<string, TradeRecord[]> {
  const result: Record<string, TradeRecord[]> = {};
  funds.forEach((fund, symbol) => {
    if (fund.trades.length > 0) {
      result[symbol] = fund.trades;
    }
  });
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 历史数据管理
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 获取基金历史数据
 */
export function getHistory(symbol: string): HistoricalPoint[] {
  return funds.get(symbol)?.history || [];
}

/**
 * 更新基金历史数据
 */
export function updateHistory(symbol: string, history: HistoricalPoint[]): void {
  const existing = funds.get(symbol);
  if (existing) {
    existing.history = history;
    saveToStorage();
  } else {
    // 创建新基金记录
    const info: FundInfo = {
      ticker: {
        id: Math.random().toString(36).substr(2, 9),
        symbol,
        name: '',
        market: MarketType.FUND,
      },
    };
    funds.set(symbol, { info, trades: [], intraday: [], history });
    saveToStorage();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 日内数据管理
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 获取基金日内数据
 */
export function getIntraday(symbol: string): IntradayPoint[] {
  return funds.get(symbol)?.intraday || [];
}

/**
 * 更新基金日内数据
 */
export function updateIntraday(symbol: string, points: IntradayPoint[]): void {
  // 只保留当天的数据
  const todayPoints = filterTodayIntraday(points);
  const existing = funds.get(symbol);
  if (existing) {
    existing.intraday = todayPoints;
    saveToStorage();
  } else {
    // 创建新基金记录
    const info: FundInfo = {
      ticker: {
        id: Math.random().toString(36).substr(2, 9),
        symbol,
        name: '',
        market: MarketType.FUND,
      },
    };
    funds.set(symbol, { info, trades: [], intraday: todayPoints, history: [] });
    saveToStorage();
  }
}


/**
 * 添加单个日内数据点
 */
export function appendIntradayPoint(
  symbol: string,
  value: number,
  equityReturn: number,
  lastUpdated?: string | number
): void {
  // 构建 timestamp
  let ts = Date.now();
  if (lastUpdated) {
    if (typeof lastUpdated === 'string' && /^\d{1,2}:\d{2}:\d{2}$/.test(lastUpdated)) {
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${lastUpdated}`;
      const parsed = Date.parse(dateStr);
      if (!Number.isNaN(parsed)) ts = parsed;
    } else {
      const parsed = typeof lastUpdated === 'number' ? lastUpdated : Date.parse(String(lastUpdated));
      if (!Number.isNaN(parsed)) ts = parsed;
    }
  }
  const minuteTs = floorToMinute(ts);

  const existing = funds.get(symbol);
  if (!existing) return;

  // 过滤掉非当天数据和比新时间戳更晚的脏数据
  let intraday = existing.intraday.filter(p => isSameLocalDay(p.timestamp) && p.timestamp <= minuteTs);

  // 检查是否与上一个点值相同（跳过连续相同值）
  const last = intraday[intraday.length - 1];
  if (last && Object.is(last.value, value)) {
    return;
  }

  const point: IntradayPoint = { timestamp: minuteTs, value, equityReturn };

  // 如果同一分钟已有数据，替换；否则添加
  if (last && floorToMinute(last.timestamp) === minuteTs) {
    intraday[intraday.length - 1] = point;
  } else {
    intraday.push(point);
  }

  // 更新并保存
  existing.intraday = intraday;
  saveToStorage();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 持久化
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 保存到 localStorage（保存完整 MarketFund[]）
 */
function saveToStorage(): void {
  const marketFunds = Array.from(funds.values());
  try {
    localStorage.setItem(STORAGE_KEYS.FUND_DATA, JSON.stringify(marketFunds));
  } catch (e) {
    console.error('Error saving fund data:', e);
  }
}

/**
 * 保存所有数据到 localStorage（供外部调用）
 */
export function saveAllToStorage(): void {
  saveToStorage();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 迁移验证
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 检查是否需要迁移
 */
export function needsFundMigration(): boolean {
  // 新 key 已存在则无需迁移
  if (localStorage.getItem(STORAGE_KEYS.FUND_DATA)) {
    return false;
  }

  // 检查旧 key
  const OLD_KEYS = OLD_STORAGE_KEYS.FUND;
  const oldKeys = [
    OLD_KEYS.PORTFOLIO,
    OLD_KEYS.MARKET_DATA,
    OLD_KEYS.TRADES,
  ];
  for (const key of oldKeys) {
    if (localStorage.getItem(key)) return true;
  }

  // 检查动态 key
  const hasHistoryKeys = Object.keys(localStorage).some(k => k.startsWith(OLD_KEYS.HISTORY_PREFIX));
  const hasIntradayKeys = Object.keys(localStorage).some(k => k.startsWith(OLD_KEYS.INTRADAY_PREFIX));
  const hasPositionKeys = Object.keys(localStorage).some(k => k.startsWith(OLD_KEYS.POSITION_PREFIX));

  return hasHistoryKeys || hasIntradayKeys || hasPositionKeys;
}

/**
 * 执行迁移（由 init() 自动执行，此函数可用于手动触发）
 */
export function ensureFundMigration(): void {
  // 已有新 key 则跳过
  if (localStorage.getItem(STORAGE_KEYS.FUND_DATA)) {
    return;
  }

  // 执行迁移
  migrateFromOldKeys();

  // 重新加载缓存
  funds.clear();
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.FUND_DATA);
    if (raw) {
      const marketFunds: MarketFund[] = JSON.parse(raw);
      marketFunds.forEach(m => {
        funds.set(m.info.ticker.symbol, {
          info: m.info,
          trades: m.trades || [],
          intraday: m.intraday || [],
          history: m.history || [],
        });
      });
    }
  } catch { /* ignore */ }
}

/**
 * 验证迁移结果
 * 详细对比新旧数据是否一致
 */
export function verifyFundMigration(deleteOldKeys: boolean = false): {
  success: boolean;
  oldKeysFound: string[];
  newFundCount: number;
  details: string[];
} {
  const OLD_KEYS = OLD_STORAGE_KEYS.FUND;
  const details: string[] = [];
  const oldKeysFound: string[] = [];
  const errors: string[] = [];

  // ========== 1. 收集旧数据 ==========
  // 1.1 旧 Ticker 数据
  const oldTickers = new Map<string, Ticker>();
  try {
    const raw = localStorage.getItem(OLD_KEYS.PORTFOLIO);
    if (raw) {
      oldKeysFound.push(OLD_KEYS.PORTFOLIO);
      const tickers: Ticker[] = JSON.parse(raw);
      tickers.forEach(t => oldTickers.set(t.symbol, t));
    }
  } catch { /* ignore */ }

  // 1.2 旧 ValuationData 数据
  const oldValuations = new Map<string, ValuationData>();
  try {
    const raw = localStorage.getItem(OLD_KEYS.MARKET_DATA);
    if (raw) {
      oldKeysFound.push(OLD_KEYS.MARKET_DATA);
      const data: Record<string, ValuationData> = JSON.parse(raw);
      Object.entries(data).forEach(([sym, v]) => oldValuations.set(sym, v));
    }
  } catch { /* ignore */ }

  // 1.3 旧 Position 数据
  const oldPositions = new Map<string, FundPosition>();
  Object.keys(localStorage)
    .filter(k => k.startsWith(OLD_KEYS.POSITION_PREFIX))
    .forEach(k => {
      oldKeysFound.push(k);
      const symbol = k.replace(OLD_KEYS.POSITION_PREFIX, '');
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          const pos = JSON.parse(raw);
          oldPositions.set(symbol, {
            fullCapacity: Number(pos.fullCapacity) || 0,
            initialPosition: Number(pos.initialPosition) || 0,
            startDate: pos.startDate ?? null,
            initialPrice: pos.initialPrice === undefined ? null : Number(pos.initialPrice),
          });
        }
      } catch { /* ignore */ }
    });

  // 1.4 旧 Trades 数据
  const oldTrades = new Map<string, TradeRecord[]>();
  try {
    const raw = localStorage.getItem(OLD_KEYS.TRADES);
    if (raw) {
      oldKeysFound.push(OLD_KEYS.TRADES);
      const data: Record<string, TradeRecord[]> = JSON.parse(raw);
      Object.entries(data).forEach(([sym, trades]) => oldTrades.set(sym, trades));
    }
  } catch { /* ignore */ }

  // 1.5 旧 History 数据
  const oldHistories = new Map<string, HistoricalPoint[]>();
  Object.keys(localStorage)
    .filter(k => k.startsWith(OLD_KEYS.HISTORY_PREFIX))
    .forEach(k => {
      oldKeysFound.push(k);
      const symbol = k.replace(OLD_KEYS.HISTORY_PREFIX, '');
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          oldHistories.set(symbol, JSON.parse(raw));
        }
      } catch { /* ignore */ }
    });

  // 1.6 旧 Intraday 数据（注意：只统计，不比较内容，因为日内数据会被过滤为当天）
  const oldIntradayKeys: string[] = [];
  Object.keys(localStorage)
    .filter(k => k.startsWith(OLD_KEYS.INTRADAY_PREFIX))
    .forEach(k => {
      oldKeysFound.push(k);
      oldIntradayKeys.push(k);
    });

  // 收集所有旧的 symbol
  const oldSymbols = new Set([
    ...oldTickers.keys(),
    ...oldValuations.keys(),
    ...oldPositions.keys(),
  ]);

  // ========== 2. 读取新数据 ==========
  const newFunds = new Map<string, MarketFund>();
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.FUND_DATA);
    if (raw) {
      const items: MarketFund[] = JSON.parse(raw);
      items.forEach(m => newFunds.set(m.info.ticker.symbol, m));
    }
  } catch { /* ignore */ }

  // ========== 3. 验证对比 ==========
  // 3.1 数量验证
  const oldCount = oldSymbols.size;
  const newCount = newFunds.size;

  if (oldCount === 0 && newCount === 0) {
    // 无旧数据无新数据
    details.push('无旧数据需要迁移');
    console.log('[FundMigration] 验证结果:', { success: true, oldKeysFound: 0, newFundCount: 0, details });
    return { success: true, oldKeysFound: [], newFundCount: 0, details };
  }

  if (oldCount > 0 && newCount === 0) {
    // 有旧数据但无新数据
    details.push(`迁移失败：有 ${oldCount} 个旧基金但新 key 无数据`);
    console.log('[FundMigration] 验证结果:', { success: false, oldKeysFound: oldKeysFound.length, newFundCount: 0, details });
    return { success: false, oldKeysFound, newFundCount: 0, details };
  }

  details.push(`基金数量: 旧=${oldCount}, 新=${newCount}`);

  // 3.2 逐个基金验证
  for (const symbol of oldSymbols) {
    const oldTicker = oldTickers.get(symbol);
    const oldValuation = oldValuations.get(symbol);
    const oldPosition = oldPositions.get(symbol);
    const oldTradeList = oldTrades.get(symbol) || [];
    const oldHistoryList = oldHistories.get(symbol) || [];

    const newFund = newFunds.get(symbol);
    if (!newFund) {
      errors.push(`${symbol}: 新数据中缺失`);
      continue;
    }

    // 验证 Ticker
    if (oldTicker) {
      if (newFund.info.ticker.symbol !== oldTicker.symbol) {
        errors.push(`${symbol}: Ticker.symbol 不匹配`);
      }
      if (newFund.info.ticker.name !== oldTicker.name) {
        errors.push(`${symbol}: Ticker.name 不匹配 (旧="${oldTicker.name}", 新="${newFund.info.ticker.name}")`);
      }
      if (newFund.info.ticker.market !== oldTicker.market) {
        errors.push(`${symbol}: Ticker.market 不匹配`);
      }
    }

    // 验证 Position
    if (oldPosition) {
      const newPos = newFund.info.position;
      if (!newPos) {
        errors.push(`${symbol}: Position 缺失`);
      } else {
        if (newPos.fullCapacity !== oldPosition.fullCapacity) {
          errors.push(`${symbol}: Position.fullCapacity 不匹配 (旧=${oldPosition.fullCapacity}, 新=${newPos.fullCapacity})`);
        }
        if (newPos.initialPosition !== oldPosition.initialPosition) {
          errors.push(`${symbol}: Position.initialPosition 不匹配 (旧=${oldPosition.initialPosition}, 新=${newPos.initialPosition})`);
        }
        if (newPos.startDate !== oldPosition.startDate) {
          errors.push(`${symbol}: Position.startDate 不匹配 (旧=${oldPosition.startDate}, 新=${newPos.startDate})`);
        }
        if (newPos.initialPrice !== oldPosition.initialPrice) {
          errors.push(`${symbol}: Position.initialPrice 不匹配 (旧=${oldPosition.initialPrice}, 新=${newPos.initialPrice})`);
        }
      }
    }

    // 验证 Valuation
    if (oldValuation) {
      const newVal = newFund.info.valuation;
      if (!newVal) {
        errors.push(`${symbol}: Valuation 缺失`);
      } else {
        if (newVal.currentPrice !== oldValuation.currentPrice) {
          errors.push(`${symbol}: Valuation.currentPrice 不匹配 (旧=${oldValuation.currentPrice}, 新=${newVal.currentPrice})`);
        }
        if (newVal.previousPrice !== oldValuation.previousPrice) {
          errors.push(`${symbol}: Valuation.previousPrice 不匹配`);
        }
        if (newVal.changePercentage !== oldValuation.changePercentage) {
          errors.push(`${symbol}: Valuation.changePercentage 不匹配`);
        }
      }
    }

    // 验证 Trades 数量和内容
    const newTradeList = newFund.trades || [];
    if (newTradeList.length !== oldTradeList.length) {
      errors.push(`${symbol}: Trades 数量不匹配 (旧=${oldTradeList.length}, 新=${newTradeList.length})`);
    } else {
      // 按日期排序后比较
      const sortedOld = [...oldTradeList].sort((a, b) => a.date.localeCompare(b.date));
      const sortedNew = [...newTradeList].sort((a, b) => a.date.localeCompare(b.date));
      for (let i = 0; i < sortedOld.length; i++) {
        const o = sortedOld[i];
        const n = sortedNew[i];
        if (o.date !== n.date || o.type !== n.type || o.shares !== n.shares || o.price !== n.price) {
          errors.push(`${symbol}: Trades[${i}] 内容不匹配`);
          break;
        }
      }
    }

    // 验证 History 数量和内容
    const newHistoryList = newFund.history || [];
    if (newHistoryList.length !== oldHistoryList.length) {
      errors.push(`${symbol}: History 数量不匹配 (旧=${oldHistoryList.length}, 新=${newHistoryList.length})`);
    } else {
      // 按日期排序后比较
      const sortedOld = [...oldHistoryList].sort((a, b) => (a.date as number) - (b.date as number));
      const sortedNew = [...newHistoryList].sort((a, b) => (a.date as number) - (b.date as number));
      for (let i = 0; i < sortedOld.length; i++) {
        const o = sortedOld[i];
        const n = sortedNew[i];
        if (o.value !== n.value) {
          errors.push(`${symbol}: History[${i}].value 不匹配 (旧=${o.value}, 新=${n.value})`);
          break;
        }
      }
    }

    // 日内数据：只比较数量（因为迁移时只保留当天数据）
    // 跳过日内数据的详细验证
  }

  // 检查新数据中是否有多余的基金
  for (const symbol of newFunds.keys()) {
    if (!oldSymbols.has(symbol) && !symbol.startsWith('test')) {
      details.push(`新数据中有多余基金: ${symbol}`);
    }
  }

  // ========== 4. 汇总结果 ==========
  const success = errors.length === 0;

  if (success) {
    details.unshift(`迁移成功: ${newCount} 个基金`);
    if (oldCount > 0) {
      details.push('所有数据验证通过');
    }
  } else {
    details.unshift(`迁移验证失败: ${errors.length} 个错误`);
    details.push(...errors.slice(0, 10)); // 最多显示 10 个错误
    if (errors.length > 10) {
      details.push(`... 还有 ${errors.length - 10} 个错误`);
    }
  }

  // 删除旧 key
  if (deleteOldKeys && success && oldKeysFound.length > 0) {
    oldKeysFound.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch { /* ignore */ }
    });
    details.push(`已删除旧 key: ${oldKeysFound.length} 个`);
  }

  console.log('[FundMigration] 验证结果:', { success, oldKeysFound: oldKeysFound.length, newFundCount: newCount, details, errors });

  return {
    success,
    oldKeysFound,
    newFundCount: newCount,
    details,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 重置缓存（用于测试）
// ═══════════════════════════════════════════════════════════════════════════════

export function resetCache(): void {
  funds.clear();
  init();
}