/**
 * cacheService.ts
 *
 * 集中式内存缓存层。维护三类数据的内存 Map：
 *   - valuationMap  : 实时估值  (ValuationData)
 *   - historyMap    : 历史净值  (HistoricalPoint[])
 *   - newsCache     : 市场热点  (NewsItem[])
 *
 * 写入时同步更新对应 localStorage key，以便页面刷新后仍能从
 * localStorage 预加载（historyMap 以 fund_history_{symbol} 存储）。
 *
 * 注意：历史净值不纳入导入/导出备份，这与现有 handleExport/handleImport 行为一致。
 */

import { ValuationData, HistoricalPoint } from '../types';

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

// ─── In-memory stores ─────────────────────────────────────────────────────────
const valuationMap = new Map<string, ValuationData>();
const historyMap   = new Map<string, HistoricalPoint[]>();
let   newsCache: NewsItem[] = [];

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
}

init();

// ─── Valuation (real-time estimate) ──────────────────────────────────────────
export function getValuation(symbol: string): ValuationData | undefined {
  return valuationMap.get(symbol);
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

// ─── Market news (hot spots) ──────────────────────────────────────────────────
export function getNews(): NewsItem[] {
  return newsCache;
}

export function setNews(items: NewsItem[]): void {
  newsCache = items;
  // News is ephemeral: not persisted to localStorage
}

