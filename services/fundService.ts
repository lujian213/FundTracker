import { ValuationData, MarketIndex, HistoricalPoint } from "../types";

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
  const ut = 'fa1a66105171779fbdd067425f38a7c2';
  const fields = 'f1,f2,f3,f4,f12,f13,f14,f43,f57,f58,f60,f169,f170,f124';
  let secid = symbol;
  if (secid === 'NDX') secid = '100.NDX';
  if (secid === 'SPX') secid = '100.SPX';
  if (secid === 'HSI') secid = '100.HSI';

  const url = `https://push2.eastmoney.com/api/qt/stock/get?ut=${ut}&fltt=2&invt=2&secid=${secid}&fields=${fields}&_=${Date.now()}`;
  try {
    const response: any = await jsonp(url, 'cb');
    const item = response?.data;
    if (item) {
      const timestamp = item.f124 ? new Date(item.f124 * 1000) : new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      return {
        symbol: item.f12 || secid,
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
  if (historyCache[code]) return historyCache[code];
  const ts = formatYMDHMS(new Date());
  const url = `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${ts}`;
  try {
    const script = document.createElement('script');
    script.src = url;
    await new Promise<void>((resolve, reject) => {
      script.onload = () => {
        const trendData = (window as any).Data_netWorthTrend;
        if (Array.isArray(trendData)) {
          historyCache[code] = trendData.map((item: any) => ({
            date: item.x, value: parseFloat(item.y) || 0, equityReturn: parseFloat(item.equityReturn) || 0
          }));
        }
        resolve();
      };
      script.onerror = () => reject();
      document.head.appendChild(script);
    });
    return historyCache[code] || [];
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
