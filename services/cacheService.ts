/**
 * cacheService.ts
 *
 * 集中式内存缓存层。维护三类数据的内存 Map ：
 *   - valuationMap  : 实时估值  (ValuationData)
 *   - historyMap    : 历史净值  (HistoricalPoint[])
 *   - intradayMap   : 日内数据  (IntradayPoint[])
 *   - newsCache     : 市场热点  (NewsItem[])
 *
 * 数据来源：从 marketFundService 读取，提供估值增强等业务逻辑。
 */

import { ValuationData, HistoricalPoint, IntradayPoint } from '../types';
import { toLocalDateKey } from '../utils/priceResolver';
import { floorToMinute, isSameLocalDay } from '../utils/dateTimeUtils';
import { compressConsecutiveSameValues } from '../utils/intradayCompression';
import * as marketFundService from './marketFundService';

export interface NewsItem {
  id: string;
  title: string;
  time: string;
  url: string;
  altUrls?: { label: string; url: string }[];
}

// ─── In-memory stores ─────────────────────────────────────────────────────────
const valuationMap = new Map<string, ValuationData>();
const historyMap   = new Map<string, HistoricalPoint[]>();
const intradayMap  = new Map<string, IntradayPoint[]>();
let   newsCache: NewsItem[] = [];

// ─── Initialisation: load from marketFundService ───────────────────────────────
function init() {
  // 1. Valuation data - 从 marketFundService 获取
  const allValuations = marketFundService.getAllValuations();
  Object.entries(allValuations).forEach(([sym, data]) => valuationMap.set(sym, data));

  // 2. History data - 从 marketFundService 获取
  const allSymbols = marketFundService.getAllFundSymbols();
  allSymbols.forEach(sym => {
    const history = marketFundService.getHistory(sym);
    if (history.length > 0) {
      historyMap.set(sym, history);
    }
  });

  // 3. Intraday data - 从 marketFundService 获取
  allSymbols.forEach(sym => {
    const intraday = marketFundService.getIntraday(sym);
    if (intraday.length > 0) {
      intradayMap.set(sym, intraday);
    }
  });
}

init();

// ─── Valuation (real-time estimate) ──────────────────────────────────────────
function applyAccuracyEnhancements(
  valuation: ValuationData,
  history: HistoricalPoint[]
): ValuationData {
  // Sort history by date ascending to find the most recent and previous values
  const sortedHistory = [...history].sort((a, b) => (a.date as number) - (b.date as number));
  const latestHistory = sortedHistory[sortedHistory.length - 1];
  const previousHistory = sortedHistory.length > 1 ? sortedHistory[sortedHistory.length - 2] : null;

  // Create a copy of the original valuation to potentially modify
  let result = {...valuation};

  // Rule 1: Compare valuationDate and the date of the most recent historical net worth data
  const latestHistoryDate = toLocalDateKey(latestHistory.date);
  const valuationDate = valuation.valuationDate?.split(' ')[0] || valuation.realtimeDate;

  let rule1Applied = false;

  if (valuationDate && latestHistoryDate && valuationDate <= latestHistoryDate) {
    // Use the most recent historical data as the valuation data
    result = {
      ...result,
      currentPrice: latestHistory.value,
      realtimeDate: latestHistoryDate,
      valuationDate: latestHistoryDate,
      // Adjust previous value to be the historical previous
      previousPrice: previousHistory ? previousHistory.value : valuation.previousPrice,
      netWorthDate: previousHistory ? toLocalDateKey(previousHistory.date) : valuation.netWorthDate,
    };
    rule1Applied = true;
  }

  // Rule 2: Compare valuationDate and netWorthDate
  // 注意：如果 Rule 1 已生效，使用更新后的 result 中的日期，而非原始日期
  const currentValuationDate = result.valuationDate?.split(' ')[0] || result.realtimeDate;
  const currentNetWorthDate = result.netWorthDate;

  // 如果 Rule 1 已生效，跳过 Rule 2（因为数据已经是最新历史数据）
  if (!rule1Applied && currentValuationDate && currentNetWorthDate && currentValuationDate <= currentNetWorthDate) {
    // Find the historical net worth on or before the valuation date
    const sortedHistoryDesc = [...sortedHistory].sort((a, b) => (b.date as number) - (a.date as number));
    const closestHistory = sortedHistoryDesc.find(h => toLocalDateKey(h.date) <= currentValuationDate);

    if (closestHistory) {
      // If valuationDate equals netWorthDate, use that day's NAV to replace the valuation
      if (currentValuationDate === currentNetWorthDate) {
        result = {
          ...result,
          currentPrice: closestHistory.value,
          realtimeDate: toLocalDateKey(closestHistory.date),
          valuationDate: toLocalDateKey(closestHistory.date),
          previousPrice: sortedHistoryDesc.find(h => toLocalDateKey(h.date) < currentValuationDate)?.value || valuation.previousPrice,
          netWorthDate: toLocalDateKey(closestHistory.date),
        };
      } else {
        // Otherwise, just update previousPrice and netWorthDate
        result = {
          ...result,
          previousPrice: closestHistory.value,
          netWorthDate: toLocalDateKey(closestHistory.date),
        };
      }
    }
  }

  // Return the potentially modified valuation
  return result;
}

export function getValuation(symbol: string): ValuationData | undefined {
  const valuation = valuationMap.get(symbol);
  if (!valuation) return undefined;

  // Get historical data for validation
  const history = getHistory(symbol);
  if (!history || history.length === 0) return valuation;

  // Apply the enhancement logic as described in the feature document
  return applyAccuracyEnhancements(valuation, history);
}

export function setValuation(symbol: string, data: ValuationData): void {
  valuationMap.set(symbol, data);
  // 同步到 marketFundService
  marketFundService.updateValuation(symbol, data);
}

export function getAllValuations(): Record<string, ValuationData> {
  const obj: Record<string, ValuationData> = {};
  valuationMap.forEach((_, k) => {
    // Use getValuation to ensure accuracy enhancements are applied
    const enhancedValuation = getValuation(k);
    if (enhancedValuation) {
      obj[k] = enhancedValuation;
    }
  });
  return obj;
}

// Legacy function that returns raw valuations without enhancements (for internal use only)
export function getRawValuations(): Record<string, ValuationData> {
  const obj: Record<string, ValuationData> = {};
  valuationMap.forEach((v, k) => { obj[k] = v; });
  return obj;
}

/** Fallback write: only sets valuation if the symbol is NOT already in the cache. */
export function setValuationIfAbsent(symbol: string, data: ValuationData): void {
  if (!valuationMap.has(symbol)) setValuation(symbol, data);
}

/**
 * Remove all valuations whose symbol is NOT in keepSymbols.
 */
export function evictValuations(keepSymbols: Set<string>): void {
  const toDelete: string[] = [];
  valuationMap.forEach((_, k) => { if (!keepSymbols.has(k)) toDelete.push(k); });
  toDelete.forEach(k => valuationMap.delete(k));
  // 注意：数据统一由 marketFundService 管理，这里只清理内存缓存
}

// ─── History (historical net worth) ──────────────────────────────────────────
export function getHistory(symbol: string): HistoricalPoint[] | undefined {
  return historyMap.get(symbol);
}

export function setHistory(symbol: string, points: HistoricalPoint[]): void {
  historyMap.set(symbol, points);
  // 同步到 marketFundService
  marketFundService.updateHistory(symbol, points);
}

/** Fallback write: only sets history if the symbol is NOT already in the cache. */
export function setHistoryIfAbsent(symbol: string, points: HistoricalPoint[]): void {
  if (!historyMap.has(symbol)) setHistory(symbol, points);
}

export function getAllHistories(): Map<string, HistoricalPoint[]> {
  return historyMap;
}

// ─── Intraday (per-minute, per-day net worth points used by intraday chart) ───
export function getIntradayPoints(symbol: string): IntradayPoint[] {
  const s = symbol.padStart ? symbol.padStart(6, '0') : symbol;
  const inMem = intradayMap.get(s);
  if (Array.isArray(inMem)) return [...inMem];
  // 从 marketFundService 获取
  const intraday = marketFundService.getIntraday(s);
  if (intraday.length > 0) {
    intradayMap.set(s, intraday);
    return [...intraday];
  }
  return [];
}

export function setIntradayPoints(symbol: string, points: IntradayPoint[]): void {
  const s = symbol.padStart ? symbol.padStart(6, '0') : symbol;
  const cleaned = (points || []).map(pt => ({
    timestamp: floorToMinute(Number(pt.timestamp) || 0),
    value: Number(pt.value) || 0,
    equityReturn: Number(pt.equityReturn) || 0,
  })).filter(pt => !Number.isNaN(pt.timestamp) && isSameLocalDay(pt.timestamp));
  // dedupe by minute keeping last, then compress consecutive identical values
  const dedup = cleaned.reduce((acc: IntradayPoint[], cur) => {
    const last = acc[acc.length - 1];
    if (last && floorToMinute(last.timestamp) === floorToMinute(cur.timestamp)) acc[acc.length - 1] = cur;
    else acc.push(cur);
    return acc;
  }, []);
  const compressed = compressConsecutiveSameValues(dedup);
  intradayMap.set(s, compressed);
  // 同步到 marketFundService
  marketFundService.updateIntraday(s, compressed);
}

/**
 * Append a new intraday point for symbol. Will floor timestamp to minute and
 * replace existing point in the same minute if present. Uses valuation.lastUpdated
 * preferentially to build timestamp; fallbacks to Date.now().
 * If tradeDate is provided and is not today, skip adding intraday point.
 */
export function appendIntradayPoint(symbol: string, valuation: ValuationData | { value: number; lastUpdated?: string | number; equityReturn?: number; tradeDate?: string }): void {
  try {
    const s = symbol.padStart ? symbol.padStart(6, '0') : symbol;
    const tradeDateVal = (valuation as any).tradeDate;

    // 检查tradeDate：如果不是今天，不添加日内点
    if (tradeDateVal) {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      if (tradeDateVal !== todayStr) {
        return;
      }
    }

    // choose timestamp: prefer valuation.lastUpdated if parseable
    // 如果lastUpdated只包含时间(如"15:00:00")，需要结合tradeDate来构建完整时间戳
    let ts = Date.now();
    if ((valuation as any).lastUpdated) {
      const lu = (valuation as any).lastUpdated;
      // 如果lastUpdated只包含时间格式(HH:mm:ss)，需要结合tradeDate或使用当前日期
      if (typeof lu === 'string' && /^\d{1,2}:\d{2}:\d{2}$/.test(lu)) {
        // 时间格式，构建完整日期时间
        let dateStr = '';
        if (tradeDateVal) {
          dateStr = `${tradeDateVal} ${lu}`;
        } else {
          // 没有tradeDate，使用当前日期
          const now = new Date();
          dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${lu}`;
        }
        const parsed = Date.parse(dateStr);
        if (!Number.isNaN(parsed)) ts = parsed;
      } else {
        const parsed = typeof lu === 'number' ? lu : Date.parse(String(lu));
        if (!Number.isNaN(parsed)) ts = parsed;
      }
    }
    const minuteTs = floorToMinute(ts);
    const value = Number((valuation as any).value ?? (valuation as any).currentPrice ?? 0) || 0;
    const equity = Number((valuation as any).equityReturn ?? (valuation as any).changePercentage ?? 0) || 0;

    // 使用 marketFundService 的 appendIntradayPoint
    marketFundService.appendIntradayPoint(s, value, equity, ts);

    // 更新本地缓存
    const updated = marketFundService.getIntraday(s);
    intradayMap.set(s, updated);
  } catch (e) { /* swallow errors to avoid bubbling into polling */ }
}

/**
 * Remove intraday entries that are not from current local day. If symbol provided,
 * only operates on that symbol; otherwise cleans all funds.
 */
export function clearOldIntradayData(symbol?: string): void {
  try {
    if (symbol) {
      const s = symbol.padStart ? symbol.padStart(6, '0') : symbol;
      const arr = intradayMap.get(s) || [];
      const today = arr.filter(p => isSameLocalDay(p.timestamp));
      if (today.length > 0) {
        intradayMap.set(s, today);
        marketFundService.updateIntraday(s, today);
      } else {
        intradayMap.delete(s);
        marketFundService.updateIntraday(s, []);
      }
      return;
    }

    // 清理所有基金的日内数据
    const allSymbols = marketFundService.getAllFundSymbols();
    allSymbols.forEach(sym => {
      const arr = intradayMap.get(sym) || [];
      const today = arr.filter(p => isSameLocalDay(p.timestamp));
      if (today.length > 0) {
        intradayMap.set(sym, today);
        marketFundService.updateIntraday(sym, today);
      } else {
        intradayMap.delete(sym);
        marketFundService.updateIntraday(sym, []);
      }
    });
  } catch {/* ignore */}
}

// ─── Market news (hot spots) ──────────────────────────────────────────────────
export function getNews(): NewsItem[] {
  return newsCache;
}

export function setNews(items: NewsItem[]): void {
  newsCache = items;
  // News is ephemeral: not persisted to localStorage
}

// ─── Test utilities ────────────────────────────────────────────────────────────
/**
 * Reset all in-memory caches. Used for testing only.
 */
export function resetCache(): void {
  valuationMap.clear();
  historyMap.clear();
  intradayMap.clear();
  newsCache = [];
}
