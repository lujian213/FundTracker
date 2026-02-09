
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
  return null;
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
  const url = `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`;
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

export async function fetchIndexHistory(symbol: string): Promise<HistoricalPoint[]> {
  let secid = symbol;
  if (secid === 'NDX') secid = '100.NDX';
  if (secid === 'SPX') secid = '100.SPX';
  if (secid === 'HSI') secid = '100.HSI';
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52&klt=101&fqt=1&end=20500101&lmt=90`;
  try {
    const response: any = await jsonp(url, 'cb');
    if (response?.data?.klines) {
      return response.data.klines.map((line: string) => {
        const parts = line.split(',');
        return { date: new Date(parts[0]).getTime(), value: parseFloat(parts[1]) || 0, equityReturn: 0 };
      });
    }
  } catch (e) {}
  return [];
}

/**
 * 获取实时市场热点 (替代受限的异动接口)
 * 使用 push2 排行榜接口，通常比异动接口更稳定且无跨域限制
 */
export async function fetchMarketNews(): Promise<{ id: string, title: string, time: string, url: string }[]> {
  // 获取领涨板块或热门个股，作为“市场动态”展示
  const ut = 'fa1a66105171779fbdd067425f38a7c2';
  // 综合排行榜接口，获取当前涨幅前列的板块
  const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=10&po=1&np=1&ut=${ut}&fltt=2&invt=2&fid=f3&fs=m:90+t:2&fields=f12,f14,f2,f3,f4&_=${Date.now()}`;

  try {
    const response: any = await jsonp(url, 'cb');

    if (response?.data?.diff) {
      const diff = response.data.diff;
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      return Object.values(diff).map((item: any, idx: number) => ({
        id: `news-${item.f12}-${idx}`,
        title: `🔥 热门领涨: ${item.f14} 涨幅 ${item.f3}%`,
        time: timeStr,
        url: `https://quote.eastmoney.com/unify/grid.html?fixed=1&kind=2&type=90&code=${item.f12}`
      }));
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
