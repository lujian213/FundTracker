import { ValuationData, MarketIndex, HistoricalPoint, OverallProfitSummary, OverallFundRow } from "../types";
import { computeProfitTimeline, ProfitPoint } from '../utils/profitCalculator';
import { getTradesForSymbol } from '../hooks/useTrades';
import * as cacheService from './cacheService';

/**
 * Dependency seam used by computeOverallProfit.
 * Tests can replace these properties to mock fetchFundHistory / fetchFundData
 * without going through the real RequestQueue or JSONP machinery.
 *
 * Example in a test:
 *   import { _deps } from '../../services/fundService';
 *   _deps.fetchFundHistory = jest.fn().mockResolvedValue([...]);
 *   _deps.fetchFundData    = jest.fn().mockResolvedValue(null);
 */
export const _deps = {
  fetchFundHistory: (symbol: string) => fetchFundHistory(symbol),
  fetchFundData:    (symbol: string) => fetchFundData(symbol),
};

// Module-level in-memory history cache (kept for backward-compat; cacheService is now the
// single source of truth and also persists to localStorage per-symbol).
const historyCache: Record<string, HistoricalPoint[]> = {};

/**
 * 基金回调注册表 (天天基金专用)
 */
const fundRegistry: Record<string, (data: any) => void> = {};

(window as any).jsonpgz = (data: any) => {
  if (data && data.fundcode && fundRegistry[data.fundcode]) {
    fundRegistry[data.fundcode](data);
    delete fundRegistry[data.fundcode];
  } else {
    const firstCode = Object.keys(fundRegistry)[0];
    if (firstCode) {
      fundRegistry[firstCode](data);
      delete fundRegistry[firstCode];
    }
  }
};

class RequestQueue {
  private queue: (() => Promise<any>)[] = [];
  private processing = false;

  async add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          await new Promise(r => setTimeout(r, 150 + Math.random() * 200));
          const result = await task();
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        try { await task(); } catch (e) {}
      }
    }
    this.processing = false;
  }
}

const globalQueue = new RequestQueue();

function normalizeHistoryTimestamp(input: unknown): number | null {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return null;
  // EastMoney historical x may occasionally be seconds; normalize to milliseconds.
  return n < 1e11 ? Math.trunc(n * 1000) : Math.trunc(n);
}

function normalizeHistoryPoints(points: Array<Partial<HistoricalPoint>> | undefined | null): HistoricalPoint[] {
  if (!Array.isArray(points) || points.length === 0) return [];

  const normalized = points
    .map((p) => {
      const ts = normalizeHistoryTimestamp((p as any)?.date ?? (p as any)?.x);
      if (ts === null) return null;
      const value = Number((p as any)?.value ?? (p as any)?.y);
      if (!Number.isFinite(value)) return null;
      const equityReturn = Number((p as any)?.equityReturn ?? 0);
      return {
        date: ts,
        value,
        equityReturn: Number.isFinite(equityReturn) ? equityReturn : 0,
      } as HistoricalPoint;
    })
    .filter((p): p is HistoricalPoint => p !== null)
    .sort((a, b) => a.date - b.date);

  // Keep the latest value when duplicate timestamps exist.
  const deduped: HistoricalPoint[] = [];
  for (const point of normalized) {
    const last = deduped[deduped.length - 1];
    if (last && last.date === point.date) deduped[deduped.length - 1] = point;
    else deduped.push(point);
  }
  return deduped;
}

function syncHistoryCache(code: string, points: HistoricalPoint[]): HistoricalPoint[] {
  historyCache[code] = points;
  cacheService.setHistory(code, points);
  return points;
}

function normalizeAndSyncHistory(code: string, points: Array<Partial<HistoricalPoint>> | undefined | null): HistoricalPoint[] {
  const normalized = normalizeHistoryPoints(points);
  return syncHistoryCache(code, normalized);
}

function toRawHistoryPoints(trendData: any[]): Array<Partial<HistoricalPoint>> {
  return trendData.map((item: any) => ({
    date: item?.x,
    value: parseFloat(item?.y) || 0,
    equityReturn: parseFloat(item?.equityReturn) || 0,
  }));
}

function loadHistoryFromPingzhongData(code: string, url: string): Promise<HistoricalPoint[]> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => {
      const trendData = (window as any).Data_netWorthTrend;
      if (Array.isArray(trendData)) {
        resolve(normalizeAndSyncHistory(code, toRawHistoryPoints(trendData)));
        return;
      }
      resolve(syncHistoryCache(code, []));
    };
    script.onerror = () => reject();
    document.head.appendChild(script);
  });
}

function jsonp<T>(url: string, callbackParam: string = 'cb', fundCode?: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const isFundGz = callbackParam === 'jsonpgz';
    const callbackName = isFundGz ? 'jsonpgz' : `__jp_cb_${Math.random().toString(36).slice(2, 10)}`;

    const script = document.createElement('script');
    const separator = url.includes('?') ? '&' : '?';
    const finalUrl = isFundGz ? url : `${url}${separator}${callbackParam}=${callbackName}`;

    const timeoutLimit = 8000;
    const timeoutId = setTimeout(() => {
      cleanup();
      if (fundCode) delete fundRegistry[fundCode];
      reject(new Error(`TIMEOUT`));
    }, timeoutLimit);

    const cleanup = () => {
      clearTimeout(timeoutId);
      if (script.parentNode) script.parentNode.removeChild(script);
      if (!isFundGz) delete (window as any)[callbackName];
    };

    if (isFundGz && fundCode) {
      fundRegistry[fundCode] = (data: T) => {
        cleanup();
        resolve(data);
      };
    } else {
      (window as any)[callbackName] = (data: T) => {
        cleanup();
        resolve(data);
      };
    }

    script.src = finalUrl;
    script.referrerPolicy = "no-referrer";
    script.onerror = () => {
      cleanup();
      if (fundCode) delete fundRegistry[fundCode];
      reject(new Error(`SCRIPT_ERROR`));
    };
    document.head.appendChild(script);
  });
}

export async function fetchFundData(symbol: string): Promise<ValuationData | null> {
  const code = symbol.padStart(6, '0');
  const url = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;
  try {
    const data: any = await globalQueue.add(() => jsonp(url, 'jsonpgz', code));
    if (data && data.fundcode) {
      return {
        symbol: data.fundcode,
        name: data.name || "未知基金",
        currentPrice: parseFloat(data.gsz) || 0,
        previousPrice: parseFloat(data.dwjz) || 0,
        changePercentage: parseFloat(data.gszzl) || 0,
        lastUpdated: data.gztime || "---",
        realtimeDate: (data.gztime || "---").split(' ')[0],
        netWorthDate: data.jzrq || "---",
        valuationDate: data.gztime || "---",
        sourceUrl: `https://fund.eastmoney.com/${code}.html`
      };
    }
  } catch (e) {}

  // Fallback: try EastMoney pingzhongdata JS which contains full fund info and history
  try {
    const fallback = await fetchFundDataFromEastMoney(code);
    if (fallback) return fallback;
  } catch (e) {}

  return null;
}

// helper to format timestamp as yyyyMMddHHmmss
function formatYMDHMS(d: Date) {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function fetchFundDataFromEastMoney(code: string): Promise<ValuationData | null> {
  const ts = formatYMDHMS(new Date());
  const url = `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${ts}`;
  try {
    const script = document.createElement('script');
    script.src = url;

    // snapshot existing window keys so we can detect what the script adds
    const beforeKeys = new Set(Object.keys(window as any));

    await new Promise<void>((resolve, reject) => {
      const timeoutLimit = 2000;
      const timeoutId = setTimeout(() => {
        if (script.parentNode) script.parentNode.removeChild(script);
        reject(new Error('TIMEOUT'));
      }, timeoutLimit);

      script.onload = () => {
        clearTimeout(timeoutId);
        resolve();
      };
      script.onerror = () => {
        clearTimeout(timeoutId);
        if (script.parentNode) script.parentNode.removeChild(script);
        reject(new Error('SCRIPT_ERROR'));
      };
      document.head.appendChild(script);
    });

    // After load, compute newly added globals
    const afterKeys = Object.keys(window as any);
    const addedKeys = afterKeys.filter(k => !beforeKeys.has(k));

    const g: any = window as any;
    // console.log('DEBUG: window.Data_netWorthTrend exists?', !!(g as any).Data_netWorthTrend);
    // try { console.log('DEBUG: Data_netWorthTrend sample:', JSON.stringify((g as any).Data_netWorthTrend && (g as any).Data_netWorthTrend.slice(-3))); } catch(e) {}

    // helper to try extract trend and name from an object
    const extractFromObj = (obj: any) => {
      if (!obj) return null as any;
      // prefer Data_netWorthTrend
      if (Array.isArray(obj.Data_netWorthTrend)) return { trend: obj.Data_netWorthTrend, name: obj.FundName || obj.fundName || obj.name || obj.fund || null };
      // some variants
      if (Array.isArray(obj.data && obj.data.netWorthTrend)) return { trend: obj.data.netWorthTrend, name: obj.data.name || obj.name || null };
      if (Array.isArray(obj.NetWorthTrend)) return { trend: obj.NetWorthTrend, name: obj.FundName || obj.name || null };
      return null;
    };

    // Try known global locations first
    let trend: any = (g as any).Data_netWorthTrend || (g as any).Data_netValueTrend || (g as any).Data_netWorth || null;
    let name: string | null = (g as any).FundName || (g as any).fundName || (g as any).name || null;
    // If not found, scan newly added globals
    if (!trend || !Array.isArray(trend)) {
      for (const k of addedKeys) {
        try {
          const val = (g as any)[k];
          const res = extractFromObj(val);
          if (res && Array.isArray(res.trend)) {
            trend = res.trend;
            if (!name && res.name) name = res.name;
            break;
          }
        } catch (e) {
          // continue
        }
      }
    }

    // also try scanning some existing globals that the script might populate directly
    if ((!trend || !Array.isArray(trend))) {
      const candidates = ['Data_fund', 'Data_netWorthTrend', 'Data_netValueTrend', 'fund', 'FundName', 'fundName'];
      for (const k of candidates) {
        try {
          const val = (g as any)[k];
          const res = extractFromObj(val);
          if (res && Array.isArray(res.trend)) {
            trend = res.trend;
            if (!name && res.name) name = res.name;
            break;
          }
          // if val itself is array and looks like trend
          if (Array.isArray(val) && val.length && val[0] && (val[0].y !== undefined || val[0].x !== undefined)) {
            trend = val;
            break;
          }
        } catch (e) {}
      }
    }

    // Fallback: sometimes the script exposes name via a small var like "fundName" or fS_name
    if (!name) {
      for (const k of addedKeys.concat(['FundName', 'fundName', 'name', 'fS_name'])) {
        try {
          const v = (g as any)[k];
          if (typeof v === 'string' && v.trim()) {
            name = v.trim();
            break;
          }
        } catch (e) {}
      }
    }

    // If trend still not found, give up
    if (!trend || !Array.isArray(trend) || trend.length === 0) {
      console.log('DEBUG fetchFundDataFromEastMoney no trend found, afterKeys:', Object.keys(window as any).slice(-20));
      // clean up script node
      if (script.parentNode) script.parentNode.removeChild(script);
      return null;
    }

    // find last and previous
    const last = trend[trend.length - 1];
    const prev = trend.length > 1 ? trend[trend.length - 2] : null;

    const parseDate = (x: any) => {
      // EastMoney sometimes provides timestamps as milliseconds (ms) or seconds (s),
      // and sometimes as strings. Normalize to JS Date using ms.
      if (x == null) return new Date();
      if (typeof x === 'number') {
        // if timestamp looks like seconds (10 digits), convert to ms
        if (x > 0 && x < 1e11) return new Date(x * 1000);
        return new Date(x);
      }
      const n = Number(x);
      if (!isNaN(n)) {
        if (n > 0 && n < 1e11) return new Date(n * 1000);
        return new Date(n);
      }
      // fallback: let Date parse the string
      return new Date(String(x));
    };

    const confirmedPrice = parseFloat(last.y) || 0; // latest confirmed net worth from history
    const prevPriceHist = prev ? (parseFloat(prev.y) || 0) : 0; // previous historical net worth (for change%)
    // For display purposes, treat `previousPrice` as the confirmed net worth when there is no realtime gsz.
    // `currentPrice` is also set to the confirmed price (used as realtime valuation fallback).
    const currentPrice = confirmedPrice;
    const previousPrice = confirmedPrice;
    // compute percentage change relative to previous historical value if available
    const changePercentage = prevPriceHist > 0 ? ((confirmedPrice - prevPriceHist) / prevPriceHist) * 100 : 0;

    // ensure d is parsed from last.x
    const d = last.x ? parseDate(last.x) : null;

    // Deterministically compute Shanghai local date/time by shifting UTC ms by +8h and using UTC getters.
    let lastUpdated = '---';
    let netWorthDate = new Date().toISOString().split('T')[0];
    if (d) {
      // shift to Shanghai by adding 8 hours (in ms)
      const shMs = d.getTime() + 8 * 3600 * 1000;
      const sh = new Date(shMs);
      const year = sh.getUTCFullYear();
      const month = String(sh.getUTCMonth() + 1).padStart(2, '0');
      const day = String(sh.getUTCDate()).padStart(2, '0');
      let hour = sh.getUTCHours();
      const minute = String(sh.getUTCMinutes()).padStart(2, '0');
      const second = String(sh.getUTCSeconds()).padStart(2, '0');

      // If the timestamp represents midnight in Shanghai, treat it as 15:00 (Shanghai)
      if (hour === 0 && minute === '00' && second === '00') {
        hour = 15;
      }

      lastUpdated = `${year}-${month}-${day} ${String(hour).padStart(2, '0')}:${minute}:${second}`;
      netWorthDate = `${year}-${month}-${day}`;
    }

    // set realtimeDate to netWorthDate for fallback (no realtime gsz)
    const realtimeDate = netWorthDate;
    // cleanup injected script tag to avoid cluttering DOM
    if (script.parentNode) script.parentNode.removeChild(script);

    return {
      symbol: code,
      name: name || `基金 ${code}`,
      // No estimated gsz in pingzhongdata fallback; use the latest confirmed net worth as "currentPrice" per spec
      currentPrice,
      previousPrice,
      changePercentage,
      lastUpdated,
      realtimeDate,
      netWorthDate,
      valuationDate: lastUpdated,
      sourceUrl: `https://fund.eastmoney.com/${code}.html`
    } as ValuationData;
  } catch (e) {
    return null;
  }
}

export async function fetchSingleIndex(symbol: string): Promise<MarketIndex | null> {
  const normalizeIndexSymbol = (raw: string): string => {
    const normalized = (raw || '').trim().toUpperCase();
    if (normalized === 'NDX') return '100.NDX';
    if (normalized === 'SPX') return '100.SPX';
    if (normalized === 'HSI') return '100.HSI';
    return normalized;
  };

  const ut = 'fa1a66105171779fbdd067425f38a7c2';
  const fields = 'f1,f2,f3,f4,f12,f13,f14,f43,f57,f58,f60,f169,f170,f124';
  const secid = normalizeIndexSymbol(symbol);

  const url = `https://push2.eastmoney.com/api/qt/stock/get?ut=${ut}&fltt=2&invt=2&secid=${secid}&fields=${fields}&_=${Date.now()}`;
  try {
    const response: any = await jsonp(url, 'cb');
    const item = response?.data;
    if (item) {
      const timestamp = item.f124 ? new Date(item.f124 * 1000) : new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      return {
        symbol: secid,
        name: item.f14 || item.f58 || "指数",
        current: parseFloat(item.f43) || 0,
        change: parseFloat(item.f169) || 0,
        changePercent: parseFloat(item.f170) || 0,
        lastUpdated: `${pad(timestamp.getHours())}:${pad(timestamp.getMinutes())}:${pad(timestamp.getSeconds())}`
      };
    }
  } catch (e) {}
  return null;
}

export async function fetchMarketIndices(symbols: string[]): Promise<MarketIndex[]> {
  if (symbols.length === 0) return [];
  const results: MarketIndex[] = [];
  for (const sym of symbols) {
    const res = await globalQueue.add(() => fetchSingleIndex(sym));
    if (res) results.push(res);
  }
  return results;
}

export async function fetchFundHistory(symbol: string): Promise<HistoricalPoint[]> {
  const code = symbol.padStart(6, '0');

  // 1. Check cacheService (in-memory + pre-loaded from localStorage)
  const cached = cacheService.getHistory(code);
  if (cached) {
    return normalizeAndSyncHistory(code, cached);
  }

  // 2. Fallback to module-level in-memory cache (populated in the same session before cacheService existed)
  if (historyCache[code]) return normalizeAndSyncHistory(code, historyCache[code]);

  // 3. Fetch from network
  const ts = formatYMDHMS(new Date());
  const url = `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${ts}`;
  try {
    return await loadHistoryFromPingzhongData(code, url);
  } catch (e) { return []; }
}

/**
 * 强制从网络重新获取历史净值，忽略所有缓存。
 * 用于定时刷新（每20分钟）和手动刷新中的历史净值更新。
 * 获取完成后自动写入 cacheService（同时更新 localStorage）。
 */
export async function forceFetchFundHistory(symbol: string): Promise<HistoricalPoint[]> {
  const code = symbol.padStart(6, '0');
  const ts = formatYMDHMS(new Date());
  const url = `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${ts}`;
  try {
    return await loadHistoryFromPingzhongData(code, url);
  } catch (e) { return []; }
}

// Index history: fetch Kline data for indices via push2his and convert to HistoricalPoint[]
export async function fetchIndexHistory(symbol: string): Promise<HistoricalPoint[]> {
  let secid = symbol;
  if (secid === 'NDX') secid = '100.NDX';
  if (secid === 'SPX') secid = '100.SPX';
  if (secid === 'HSI') secid = '100.HSI';
  // fields2: date(f51), close price(f53), change percent(f59)
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f53,f59&klt=101&fqt=1&end=20500101&lmt=90`;
  try {
    const response: any = await jsonp(url, 'cb');
    if (response?.data?.klines) {
      return response.data.klines.map((line: string) => {
        const parts = line.split(',');
        // parts[0]: date string like '2026-02-20' or '20260220', parts[1]: close price, parts[2]: change percentage
        return {
          date: new Date(parts[0]).getTime(),
          value: parseFloat(parts[1]) || 0,
          equityReturn: parseFloat(parts[2]) || 0
        };
      });
    }
  } catch (e) {}
  return [];
}

// 新增：根据历史净值计算每日净值变化（每份的日盈亏）并返回可供前端展示的数据
export interface DailyProfitPoint {
  date: string; // YYYY-MM-DD
  dailyProfit: number; // 基于每份的净值变动：today.value - yesterday.value
  cumulativeProfit?: number; // 累计净值变动（以每日净值变动求和）
  pctReturn?: number; // 当日净值收益率（%）
}

export async function fetchFundDailyProfit(symbol: string): Promise<DailyProfitPoint[]> {
  try {
    const history = await fetchFundHistory(symbol);
    if (!history || history.length === 0) return [];
    // sort by date ascending (history from oldest to newest is typical but normalize)
    const sorted = [...history].sort((a, b) => (a.date as number) - (b.date as number));
    const points: DailyProfitPoint[] = [];
    let cumulative = 0;
    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i];
      const prev = i > 0 ? sorted[i - 1] : null;
      const curVal = Number(cur.value || 0);
      const prevVal = prev ? Number(prev.value || 0) : curVal;
      const daily = curVal - prevVal;
      cumulative += daily;
      const pct = prevVal !== 0 ? (daily / prevVal) * 100 : 0;
      // normalize date to YYYY-MM-DD
      const d = new Date(cur.date as any);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      points.push({ date: `${y}-${m}-${day}`, dailyProfit: Number(daily.toFixed(4)), cumulativeProfit: Number(cumulative.toFixed(4)), pctReturn: Number(pct.toFixed(4)) });
    }
    return points;
  } catch (e) {
    return [];
  }
}

/**
 * 获取实时市场热点 (替代受限的异动接口)
 * 使用 push2 排行榜接口，通常比异动接口更稳定且无跨域限制
 */
export async function fetchMarketNews(): Promise<{ id: string, title: string, time: string, url: string, altUrls?: { label: string; url: string }[] }[]> {
  // 获取领涨板块或热门个股，作为“市场动态”展示
  const ut = 'fa1a66105171779fbdd067425f38a7c2';
  // 综合排行榜接口，获取当前涨幅前列的板块
  const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=10&po=1&np=1&ut=${ut}&fltt=2&invt=2&fid=f3&fs=m:90+t:2&type=90&fields=f12,f14,f2,f3,f4&_=${Date.now()}`;

  try {
    const response: any = await jsonp(url, 'cb');

    if (response?.data?.diff) {
      const diff = response.data.diff;
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      return Object.values(diff).map((item: any, idx: number) => {
        const code = item.f12;
        // build candidate links and altUrls
        const alt: { label: string; url: string }[] = [];
        let candidate = 'https://quote.eastmoney.com/';

        if (code && typeof code === 'string') {
          const trimmed = code.trim();
          if (/^\d{6}$/.test(trimmed)) {
            candidate = `https://fund.eastmoney.com/${trimmed}.html`;
            alt.push({ label: '基金页', url: candidate });
            alt.push({ label: '统一行情页', url: `https://quote.eastmoney.com/unify/grid.html?fixed=1&kind=2&type=90&code=${encodeURIComponent(trimmed)}` });
          } else if (/^BK\w+/i.test(trimmed)) {
            candidate = `https://quote.eastmoney.com/unify/grid.html?fixed=1&kind=2&type=90&code=${encodeURIComponent(trimmed)}`;
            alt.push({ label: '统一页', url: candidate });
            alt.push({ label: '板块页', url: `https://quote.eastmoney.com/bk/${trimmed}.html` });
          } else if (/^\d+\.\d+$/.test(trimmed)) {
            const parts = trimmed.split('.');
            const suffix = parts[1];
            if (/^\d{6}$/.test(suffix)) {
              candidate = `https://quote.eastmoney.com/zs${suffix}.html`;
              alt.push({ label: '指数页', url: candidate });
              alt.push({ label: '统一页', url: `https://quote.eastmoney.com/unify/grid.html?fixed=1&kind=2&type=90&code=${encodeURIComponent(trimmed)}` });
            } else {
              candidate = `https://quote.eastmoney.com/unify/grid.html?fixed=1&kind=2&type=90&code=${encodeURIComponent(trimmed)}`;
              alt.push({ label: '统一页', url: candidate });
            }
          } else {
            candidate = `https://quote.eastmoney.com/unify/grid.html?fixed=1&kind=2&type=90&code=${encodeURIComponent(trimmed)}`;
            alt.push({ label: '统一页', url: candidate });
          }
        }

        // fallback search if candidate is default or missing
        const searchFallback = `https://so.eastmoney.com/web/s?keyword=${encodeURIComponent(code || '')}`;
        if (!candidate || candidate === 'https://quote.eastmoney.com/') {
          candidate = searchFallback;
          alt.unshift({ label: '搜索结果', url: candidate });
        }

        // ensure primary search URL is first (per requirement)
        const primary = code ? searchFallback : candidate;
        // prefer primary as the returned url, keep altUrls for picker
        // ensure alt includes primary as first option
        const altUrls = [{ label: '搜索', url: primary }, ...alt.filter(a => a.url !== primary)];

        return {
          id: `news-${item.f12}-${idx}`,
          title: `🔥 热门领涨: ${item.f14} 涨幅 ${item.f3}%`,
          time: timeStr,
          url: primary,
          altUrls
        };
      });
    }
  } catch (e) {
    // 如果排行榜也挂了，最后保底尝试直接从上证指数获取简要状态
    try {
      const index = await fetchSingleIndex('1.000001');
      if (index) {
        return [{
          id: 'status-sh',
          title: `上证指数当前 ${index.current} (${index.changePercent > 0 ? '↑' : '↓'}${index.changePercent}%) 交易进行中`,
          time: index.lastUpdated.slice(0, 5),
          url: 'https://quote.eastmoney.com/zs000001.html'
        }];
      }
    } catch (inner) {}
    throw e;
  }

  return [];
}

/**
 * 计算整体盈亏：对一组基金按日期对各基金的累计盈亏求和，返回按日的累计与当日盈利，以及按基金的区间盈亏对比
 * - 如果没有提供 symbols，则会从 localStorage 的 'fund_portfolio' 中读取（与 App.tsx 的存储保持一致）
 * - 只有持仓起始日期位于用户选择范围内的基金会被纳入计算（若该配置不存在，则以历史净值最早日期为起始）
 */
export async function computeOverallProfit(opts: { symbols?: string[]; fromDate?: string | null; toDate?: string | null }): Promise<OverallProfitSummary> {
   const { symbols, fromDate, toDate } = opts || {};

 // if no symbols provided, try read portfolio from localStorage (same key used in App.tsx)
  let syms: string[] = [];
  let portfolioArr: any[] = [];
  if (Array.isArray(symbols) && symbols.length > 0) syms = symbols;
  else {
    try {
      const raw = localStorage.getItem('fund_portfolio');
      if (raw) {
        const arr = JSON.parse(raw) as any[];
        portfolioArr = Array.isArray(arr) ? arr : [];
        syms = portfolioArr.map(a => a.symbol).filter(Boolean);
      }
    } catch (e) { syms = []; }
  }


  const includedFundTimelines: Record<string, ProfitPoint[]> = {};
  const perFundRows: OverallFundRow[] = [];

  for (const sym of syms) {
    try {
      const history = await _deps.fetchFundHistory(sym);
      if (!history || history.length === 0) continue;

      // trades from local storage helper
      const trades = getTradesForSymbol(sym) || [];

      // read stored position config if exists
      let startDateFromStorage: string | null = null;
      let initialPosition = 0;
      let initialPrice: number | null = null;
      try {
        const key = `fund_position_${sym}`;
        const raw = localStorage.getItem(key);
        if (raw) {
          const cfg = JSON.parse(raw);
          if (cfg) {
            if (typeof cfg.startDate === 'string') startDateFromStorage = cfg.startDate;
            if (typeof cfg.initialPosition === 'number') initialPosition = Number(cfg.initialPosition) || 0;
            if (cfg.initialPrice !== undefined) initialPrice = cfg.initialPrice === null ? null : Number(cfg.initialPrice);
          }
        }
      } catch (e) {}

      // determine fund start date (use stored startDate if present, otherwise earliest history date)
      const sortedHistoryForPrice = [...history].sort((a, b) => (a.date as number) - (b.date as number));
      const earliestHistoryDate = (() => {
        const d = new Date(sortedHistoryForPrice[0].date as number);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      })();
      const fundStartDate = startDateFromStorage || earliestHistoryDate;

      // If initialPrice is null but startDate is configured, look it up from history (same as FundDetailsModal auto-fill).
      // This handles the case where the backup file was exported before history was loaded (initialPrice saved as null).
      if (initialPrice === null && startDateFromStorage) {
        // Find the history point whose local date equals startDate; fall back to latest point <= end-of-startDate.
        const targetEnd = new Date(`${startDateFromStorage} 23:59:59.999`).getTime();
        const getPriceOnDate = (isoDate: string): number | null => {
          // exact local-date match
          for (const h of sortedHistoryForPrice) {
            const hd = new Date(h.date as number);
            const hIso = `${hd.getFullYear()}-${String(hd.getMonth()+1).padStart(2,'0')}-${String(hd.getDate()).padStart(2,'0')}`;
            if (hIso === isoDate) return h.value;
          }
          // latest point whose timestamp <= end of startDate
          let best: number | null = null;
          for (const h of sortedHistoryForPrice) {
            if ((h.date as number) <= targetEnd) best = h.value;
            else break;
          }
          return best ?? (sortedHistoryForPrice.length > 0 ? sortedHistoryForPrice[0].value : null);
        };
        const resolved = getPriceOnDate(startDateFromStorage);
        if (resolved !== null) {
          initialPrice = resolved;
          // write back so subsequent exports and reads get the correct value
          try {
            const key = `fund_position_${sym}`;
            const raw = localStorage.getItem(key);
            if (raw) {
              const cfg = JSON.parse(raw);
              cfg.initialPrice = resolved;
              localStorage.setItem(key, JSON.stringify(cfg));
            }
          } catch (_) { /* ignore */ }
        }
      }

      // NEW: exclude funds that do not have an explicitly stored startDate
      if (!startDateFromStorage) {
        // skip funds without configured startDate; they should not participate in overall aggregation or table
        continue;
      }

      // filter inclusion: only include funds whose startDate is within [fromDate, toDate] if fromDate/toDate provided
      if (toDate && fundStartDate > toDate) continue;

      // Ensure history contains a point at the desired end date so overall aggregation can extend to that date.
      // Desired end date: user-specified toDate, otherwise today's date (local YYYY-MM-DD).
      const desiredEndDate = toDate || new Date().toISOString().split('T')[0];
      // Helper to check whether history already contains a point on desiredEndDate (<= end of day)
      const hasPointOnDate = (hist: HistoricalPoint[], isoDate: string) => {
        const end = new Date(isoDate);
        end.setHours(23, 59, 59, 999);
        const endTs = end.getTime();
        return hist.some(h => h.date <= endTs && (new Date(h.date)).toISOString().split('T')[0] === isoDate);
      };

      let historyToUse = history.slice();
      try {
        // 补充当天实时数据点：优先从缓存读取，避免为每个基金发起额外网络请求
        try {
          const fd = cacheService.getValuation(sym.padStart(6, '0'))
                  ?? cacheService.getValuation(sym)
                  ?? await _deps.fetchFundData(sym);
          if (fd) {
            const candidates: { iso: string; value: number }[] = [];
            if (fd.netWorthDate && fd.previousPrice !== undefined && fd.previousPrice !== null) candidates.push({ iso: fd.netWorthDate, value: fd.previousPrice });
            if (fd.realtimeDate && fd.currentPrice !== undefined && fd.currentPrice !== null) candidates.push({ iso: fd.realtimeDate, value: fd.currentPrice });
            // include desiredEndDate fallback last
            // for each candidate, if it's within [earliestHistoryDate, desiredEndDate] and not already present, append synthetic point
            for (const c of candidates) {
              try {
                if (c.iso && c.iso >= earliestHistoryDate && c.iso <= desiredEndDate && !hasPointOnDate(historyToUse, c.iso)) {
                  const ts = new Date(`${c.iso} 15:00`).getTime();
                  // append if ts greater than last history date
                  const lastTs = historyToUse.length > 0 ? historyToUse[historyToUse.length - 1].date : 0;
                  if (ts >= lastTs) historyToUse = [...historyToUse, { date: ts, value: c.value, equityReturn: 0 }];
                }
              } catch (inner) { }
            }
          }
        } catch (e) {
          // ignore fetch errors
        }

        // Finally, ensure desiredEndDate is represented (existing behavior)
        if (!hasPointOnDate(historyToUse, desiredEndDate)) {
          if (historyToUse && historyToUse.length > 0) {
            const last = historyToUse[historyToUse.length - 1];
            const chosenValue = last.value || 0;
            const d = new Date(`${desiredEndDate} 15:00`);
            const chosenTs = d.getTime();
            const lastTs = historyToUse.length > 0 ? historyToUse[historyToUse.length - 1].date : 0;
            if (chosenTs >= lastTs) historyToUse = [...historyToUse, { date: chosenTs, value: chosenValue, equityReturn: 0 }];
          }
        }
      } catch (e) {
        // ignore any unexpected errors
      }

      // compute timeline for this fund scoped to requested range (computeProfitTimeline will crop by from/to)
      // First deduplicate historyToUse by local date: keep only the last (highest-timestamp) point per date.
      // This prevents a synthetic candidate point sharing the same local date as an existing history point
      // from causing trades to be applied twice inside computeProfitTimeline.
      const deduplicatedHistory = (() => {
        const sorted = [...historyToUse].sort((a, b) => (a.date as number) - (b.date as number));
        const seen = new Map<string, typeof sorted[0]>();
        for (const h of sorted) {
          const hd = new Date(h.date as number);
          const iso = `${hd.getFullYear()}-${String(hd.getMonth()+1).padStart(2,'0')}-${String(hd.getDate()).padStart(2,'0')}`;
          seen.set(iso, h); // last writer wins (highest timestamp = most authoritative)
        }
        return Array.from(seen.values()).sort((a, b) => (a.date as number) - (b.date as number));
      })();
      const timeline = computeProfitTimeline({ history: deduplicatedHistory, trades, initialPosition: initialPosition || 0, initialPrice: initialPrice ?? null, fromDate: fromDate ?? null, toDate: toDate ?? null });
     if (!timeline || timeline.length === 0) continue;

      includedFundTimelines[sym] = timeline;

      // Determine effective fromDate used by this timeline (computeProfitTimeline may have cropped it)
      const effectiveFrom = fromDate ?? timeline[0].date;
      // Compute the baseline: raw cumulativeProfit on startDate (the last timeline point whose date <= startDate).
      // All values shown in perFundTimelines are offset by this baseline so that startDate contributes 0
      // and subsequent days show the correct incremental profit.
      let startDateBaseline = 0;
      if (startDateFromStorage) {
        for (const pt of timeline) {
          if (pt.date <= startDateFromStorage) startDateBaseline = pt.cumulativeProfit || 0;
          else break;
        }
      }
      let profitFrom = (timeline[0].cumulativeProfit || 0) - startDateBaseline;
      const profitTo = (timeline[timeline.length - 1].cumulativeProfit || 0) - startDateBaseline;
      // If the fund has a configured startDate (from storage) and it is later than effectiveFrom,
      // then its cumulative profit at effectiveFrom (date1) should be considered 0 per requirement.
      // Per latest rule: if startDate >= effectiveFrom (including equal), the cumulative at effectiveFrom is 0.
      if (startDateFromStorage && effectiveFrom && startDateFromStorage >= effectiveFrom) {
        profitFrom = 0;
      }

      // record whether startDate came from storage and the configured initialPosition
      const hasStoredStartDate = !!startDateFromStorage;
      const displayName = portfolioArr.find(p => p && p.symbol === sym)?.name || undefined;
      perFundRows.push({ symbol: sym, name: displayName, startDate: fundStartDate || null, profitFrom, profitTo, profitDiff: Number((profitTo - profitFrom).toFixed(4)), initialPosition: initialPosition || 0, hasStoredStartDate });
    } catch (e) {
      // skip failing fund
      continue;
    }
  }

  // Build per-fund date->cumulative and date->daily maps, collect all dates.
  // Also track per-fund configured start dates.
  const perFundMaps: Record<string, Record<string, number>> = {};
  const perFundDailyMaps: Record<string, Record<string, number>> = {};
  const allDatesSet = new Set<string>();
  const fundStartDates: Record<string, string | null> = {};
  for (const pf of perFundRows) {
    fundStartDates[pf.symbol] = pf.startDate || null;
  }
  for (const sym of Object.keys(includedFundTimelines)) {
    const t = includedFundTimelines[sym];
    const cumMap: Record<string, number> = {};
    const dailyMap: Record<string, number> = {};
    for (const p of t) {
      cumMap[p.date] = Number((p.cumulativeProfit || 0).toFixed(4));
      dailyMap[p.date] = Number((p.dailyProfit || 0).toFixed(4));
      allDatesSet.add(p.date);
    }
    perFundMaps[sym] = cumMap;
    perFundDailyMaps[sym] = dailyMap;
  }

  const dates = Array.from(allDatesSet).sort();

  // build perFundTimelines: ordered arrays of {date, cumulativeProfit} for each fund.
  // Reuse the fee-deferral-corrected dailyProfit from computeProfitTimeline (same logic
  // as ProfitModal) rather than re-deriving daily from cumulativeProfit differences.
  // For dates <= startDate the contribution is 0 (fund not yet started).
  // For dates in the fund's timeline: use dailyProfit directly.
  // For dates missing from the fund's timeline (gaps / forward-fill): daily = 0, cumulative carries forward.
  const perFundTimelines: Record<string, { date: string; cumulativeProfit: number }[]> = {};
  for (const sym of Object.keys(perFundMaps)) {
    const cumMap = perFundMaps[sym] || {};
    const dailyMap = perFundDailyMaps[sym] || {};
    const start = fundStartDates[sym];

    // Determine baseline cumulativeProfit on startDate so we can zero it out.
    // Walk the sorted dates up to start to find the last known raw cumulative.
    let baseline = 0;
    if (start) {
      let lastKnown: number | null = null;
      for (const d of dates) {
        if (d > start) break;
        if (cumMap[d] !== undefined) lastKnown = cumMap[d];
      }
      if (lastKnown !== null) baseline = lastKnown;
    }

    // Build output using dailyProfit to accumulate cumulative, preserving fee-deferral correction.
    const arr: { date: string; cumulativeProfit: number }[] = [];
    let runningCum = 0;
    let started = false;
    for (const d of dates) {
      if (start && d <= start) {
        // Before or on startDate: contribution is 0.
        arr.push({ date: d, cumulativeProfit: 0 });
      } else {
        if (!started) {
          // First date after startDate. Use fee-deferral-corrected dailyProfit when available.
          // Fall back to raw cumulative minus baseline only for gap dates not in the fund timeline.
          if (dailyMap[d] !== undefined) {
            runningCum = Number((runningCum + dailyMap[d]).toFixed(4));
          } else if (cumMap[d] !== undefined) {
            runningCum = Number((cumMap[d] - baseline).toFixed(4));
          } else {
            runningCum = 0;
          }
          started = true;
        } else if (dailyMap[d] !== undefined) {
          // Date is in the fund's timeline: advance by the fee-deferral-corrected daily.
          runningCum = Number((runningCum + dailyMap[d]).toFixed(4));
        }
        // else: gap date not in fund timeline → carry forward (runningCum unchanged, daily = 0)
        arr.push({ date: d, cumulativeProfit: runningCum });
      }
    }
    perFundTimelines[sym] = arr;
  }

  // compute timelineOut by summing forward-filled perFundTimelines so chart and table agree.
  // Derive dailyProfit as the change in cumulative sum (consistent with how ProfitModal does it).
  const timelineOut: { date: string; cumulativeProfit: number; dailyProfit: number }[] = [];
  let prev = 0;
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    let cumSum = 0;
    for (const sym of Object.keys(perFundTimelines)) {
      const entry = perFundTimelines[sym][i];
      if (entry && entry.cumulativeProfit !== undefined) cumSum += entry.cumulativeProfit;
    }
    const cum = Number(cumSum.toFixed(4));
    const daily = Number((cum - prev).toFixed(4));
    timelineOut.push({ date: d, cumulativeProfit: cum, dailyProfit: daily });
    prev = cum;
  }

  const totalDiff = timelineOut.length > 0 ? Number((timelineOut[timelineOut.length - 1].cumulativeProfit - (timelineOut[0].cumulativeProfit || 0)).toFixed(4)) : 0;

  return { timeline: timelineOut, perFund: perFundRows, perFundTimelines, totalDiff };
}
