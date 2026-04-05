/**
 * cacheService.ts
 *
 * 集中式内存缓存层。维护三类数据的内存 Map ：
 *   - valuationMap  : 实时估值  (ValuationData)
 *   - historyMap    : 历史净值  (HistoricalPoint[])
 *   - newsCache     : 市场热点  (NewsItem[])
 *
 * 写入时同步更新对应 localStorage key，以便页面刷新后仍能从
 * localStorage 预加载（historyMap 以 fund_history_{symbol} 存储）。
 *
 * 注意：历史净值不纳入导入/导出备份，这与现有 handleExport/handleImport 行为一致。
 */

import { ValuationData, HistoricalPoint, IntradayPoint } from '../types';
import { toLocalDateKey } from '../utils/priceResolver';

export interface NewsItem {
  id: string;
  title: string;
  time: string;
  url: string;
  altUrls?: { label: string; url: string }[];
}

// ─── localStorage keys ────────────────────────────────────────────────────────
const VALUATION_STORAGE_KEY = 'fund_market_data';
const historyStorageKey = (symbol: string) => `fund_history_${symbol}`;
const intradayStorageKey = (symbol: string) => `fund_intraday_${symbol}`;

// ─── In-memory stores ─────────────────────────────────────────────────────────
const valuationMap = new Map<string, ValuationData>();
const historyMap   = new Map<string, HistoricalPoint[]>();
const intradayMap  = new Map<string, IntradayPoint[]>();
let   newsCache: NewsItem[] = [];

// Helper: floor timestamp to minute (ms)
const floorToMinute = (ts: number) => Math.floor(ts / 60000) * 60000;

// Helper: check if timestamp is same local day as now
const isSameLocalDay = (ts: number) => {
  const d = new Date(ts);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

// Helper: compress consecutive identical-value points keeping the earliest timestamp in each run
const compressConsecutiveSameValues = (pts: IntradayPoint[]) => {
  if (!Array.isArray(pts) || pts.length === 0) return [] as IntradayPoint[];
  // sort ascending by timestamp
  const arr = [...pts].sort((a, b) => a.timestamp - b.timestamp);
  const out: IntradayPoint[] = [];
  for (const p of arr) {
    const last = out[out.length - 1];
    if (last && Object.is(last.value, p.value)) {
      // same value as last kept -> skip (keep earliest)
      continue;
    }
    out.push(p);
  }
  return out;
};

// ─── Initialisation: pre-load from localStorage ───────────────────────────────
function init() {
  // 1. Valuation data (already stored as a single JSON object in fund_market_data)
  try {
    const raw = localStorage.getItem(VALUATION_STORAGE_KEY);
    if (raw) {
      const obj: Record<string, ValuationData> = JSON.parse(raw);
      Object.entries(obj).forEach(([sym, data]) => valuationMap.set(sym, data));
    }
  } catch {/* ignore */}

  // 2. History data (one key per fund: fund_history_{symbol})
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('fund_history_'))
      .forEach(k => {
        const symbol = k.replace('fund_history_', '');
        try {
          const raw = localStorage.getItem(k);
          if (raw) {
            const arr: HistoricalPoint[] = JSON.parse(raw);
            if (Array.isArray(arr)) historyMap.set(symbol, arr);
          }
        } catch {/* ignore single key errors */}
      });
  } catch {/* ignore */}

  // 3. Intraday data (one key per fund: fund_intraday_{symbol}) — load only today's data
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('fund_intraday_'))
      .forEach(k => {
        const symbol = k.replace('fund_intraday_', '');
        try {
          const raw = localStorage.getItem(k);
          if (!raw) return;
          const arr: IntradayPoint[] = JSON.parse(raw);
          if (!Array.isArray(arr)) return;
          // normalize: ensure timestamp numbers and keep only today's points
          const cleaned = arr.map(pt => ({
            timestamp: floorToMinute(typeof pt.timestamp === 'string' ? Date.parse(pt.timestamp) : Number(pt.timestamp)),
            value: Number(pt.value) || 0,
            equityReturn: Number(pt.equityReturn) || 0,
          })).filter(pt => !Number.isNaN(pt.timestamp) && isSameLocalDay(pt.timestamp))
            // dedupe by minute keeping last by timestamp (then compress consecutive identical values keeping earliest)
            .reduce((acc: IntradayPoint[], cur) => {
              const last = acc[acc.length - 1];
              if (last && floorToMinute(last.timestamp) === floorToMinute(cur.timestamp)) {
                acc[acc.length - 1] = cur; // replace with newer
              } else {
                acc.push(cur);
              }
              return acc;
            }, []);
          const compressed = compressConsecutiveSameValues(cleaned);
          if (compressed.length > 0) intradayMap.set(symbol, compressed);
          else try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
        } catch {/* ignore per-key errors */}
      });
  } catch {/* ignore top-level */}
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
  }

  // Rule 2: Compare valuationDate and netWorthDate
  const netWorthDate = valuation.netWorthDate;
  if (valuationDate && netWorthDate && valuationDate <= netWorthDate) {
    // Find the historical net worth on or before the valuation date
    const sortedHistoryDesc = [...sortedHistory].sort((a, b) => (b.date as number) - (a.date as number));
    const closestHistory = sortedHistoryDesc.find(h => toLocalDateKey(h.date) <= valuationDate);

    if (closestHistory) {
      // If valuationDate equals netWorthDate, use that day's NAV to replace the valuation
      if (valuationDate === netWorthDate) {
        result = {
          ...result,
          currentPrice: closestHistory.value,
          realtimeDate: toLocalDateKey(closestHistory.date),
          valuationDate: toLocalDateKey(closestHistory.date),
          previousPrice: sortedHistoryDesc.find(h => toLocalDateKey(h.date) < valuationDate)?.value || valuation.previousPrice,
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
  // Persist entire valuation map as a single JSON blob (compatible with App.tsx key)
  try {
    const obj: Record<string, ValuationData> = {};
    valuationMap.forEach((v, k) => { obj[k] = v; });
    localStorage.setItem(VALUATION_STORAGE_KEY, JSON.stringify(obj));
  } catch {/* ignore quota errors */}
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
 * Remove all valuations whose symbol is NOT in keepSymbols, both from the
 * in-memory map and from the persisted fund_market_data localStorage entry.
 */
export function evictValuations(keepSymbols: Set<string>): void {
  const toDelete: string[] = [];
  valuationMap.forEach((_, k) => { if (!keepSymbols.has(k)) toDelete.push(k); });
  toDelete.forEach(k => valuationMap.delete(k));
  // Re-persist the pruned map
  try {
    const obj: Record<string, ValuationData> = {};
    valuationMap.forEach((v, k) => { obj[k] = v; });
    localStorage.setItem(VALUATION_STORAGE_KEY, JSON.stringify(obj));
  } catch {/* ignore quota errors */}
}

// ─── History (historical net worth) ──────────────────────────────────────────
export function getHistory(symbol: string): HistoricalPoint[] | undefined {
  return historyMap.get(symbol);
}

export function setHistory(symbol: string, points: HistoricalPoint[]): void {
  historyMap.set(symbol, points);
  // Persist per-fund history to localStorage
  try {
    localStorage.setItem(historyStorageKey(symbol), JSON.stringify(points));
  } catch {/* ignore quota errors */}
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
  try {
    const raw = localStorage.getItem(intradayStorageKey(s));
    if (!raw) return [];
    const arr: IntradayPoint[] = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    // filter today's and normalize
    const cleaned = arr.map(pt => ({
      timestamp: floorToMinute(typeof pt.timestamp === 'string' ? Date.parse(pt.timestamp) : Number(pt.timestamp)),
      value: Number(pt.value) || 0,
      equityReturn: Number(pt.equityReturn) || 0,
    })).filter(pt => !Number.isNaN(pt.timestamp) && isSameLocalDay(pt.timestamp));
    // dedupe by minute keeping last
    const dedup = cleaned.reduce((acc: IntradayPoint[], cur) => {
      const last = acc[acc.length - 1];
      if (last && floorToMinute(last.timestamp) === floorToMinute(cur.timestamp)) acc[acc.length - 1] = cur;
      else acc.push(cur);
      return acc;
    }, []);
    // compress consecutive identical values keeping earliest timestamp
    const compressed = compressConsecutiveSameValues(dedup);
    // cache in memory
    if (compressed.length > 0) intradayMap.set(s, compressed);
    return compressed;
  } catch { return []; }
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
  try {
    localStorage.setItem(intradayStorageKey(s), JSON.stringify(compressed));
  } catch {/* ignore */}
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

    const point: IntradayPoint = { timestamp: minuteTs, value, equityReturn: equity };

    const existing = intradayMap.get(s) || [];
    // ensure existing only contains today's points
    let today = existing.filter(p => isSameLocalDay(p.timestamp));

    // 清除时间戳比新点更晚的脏数据（之前错误解析导致的15:00收市时间点）
    today = today.filter(p => p.timestamp <= minuteTs);

    const last = today[today.length - 1];
    if (last && Object.is(last.value, point.value)) {
      // same as last value: keep earliest (do not append or replace)
      // but still update storage to reflect current state (no-op)
      try { localStorage.setItem(intradayStorageKey(s), JSON.stringify(today)); } catch {/* ignore */}
      intradayMap.set(s, today);
      return;
    }
    if (today.length > 0 && floorToMinute(last.timestamp) === minuteTs) {
      // same minute but different value -> replace last
      today[today.length - 1] = point;
    } else {
      today.push(point);
    }
    // compress consecutive same values to remove long flat runs, keeping earliest
    const compressed = compressConsecutiveSameValues(today);
    intradayMap.set(s, compressed);
    try { localStorage.setItem(intradayStorageKey(s), JSON.stringify(compressed)); } catch {/* ignore */}
  } catch (e) { /* swallow errors to avoid bubbling into polling */ }
}

/**
 * Remove intraday entries that are not from current local day. If symbol provided,
 * only operates on that symbol; otherwise scans all fund_intraday_* keys.
 */
export function clearOldIntradayData(symbol?: string): void {
  try {
    if (symbol) {
      const s = symbol.padStart ? symbol.padStart(6, '0') : symbol;
      const arr = intradayMap.get(s) || [];
      const today = arr.filter(p => isSameLocalDay(p.timestamp));
      if (today.length > 0) {
        intradayMap.set(s, today);
        try { localStorage.setItem(intradayStorageKey(s), JSON.stringify(today)); } catch {/* ignore */}
      } else {
        intradayMap.delete(s);
        try { localStorage.removeItem(intradayStorageKey(s)); } catch {/* ignore */}
      }
      return;
    }

    Object.keys(localStorage).filter(k => k.startsWith('fund_intraday_')).forEach(k => {
      const sym = k.replace('fund_intraday_', '');
      try {
        const raw = localStorage.getItem(k);
        if (!raw) { try { localStorage.removeItem(k); } catch {/* ignore */} ; return; }
        const arr: IntradayPoint[] = JSON.parse(raw);
        if (!Array.isArray(arr)) { try { localStorage.removeItem(k); } catch {/* ignore */} ; return; }
        const cleaned = arr.map(pt => ({ timestamp: floorToMinute(typeof pt.timestamp === 'string' ? Date.parse(pt.timestamp) : Number(pt.timestamp)), value: Number(pt.value) || 0, equityReturn: Number(pt.equityReturn) || 0 }))
          .filter(pt => !Number.isNaN(pt.timestamp) && isSameLocalDay(pt.timestamp))
          .reduce((acc: IntradayPoint[], cur) => {
            const last = acc[acc.length - 1];
            if (last && floorToMinute(last.timestamp) === floorToMinute(cur.timestamp)) acc[acc.length - 1] = cur;
            else acc.push(cur);
            return acc;
          }, []);
        const compressed = compressConsecutiveSameValues(cleaned);
        if (compressed.length > 0) {
          intradayMap.set(sym, compressed);
          try { localStorage.setItem(k, JSON.stringify(compressed)); } catch {/* ignore */}
        } else {
          intradayMap.delete(sym);
          try { localStorage.removeItem(k); } catch {/* ignore */}
        }
      } catch {/* ignore per-key errors */}
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
