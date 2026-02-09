
import { ValuationData, MarketIndex, HistoricalPoint } from "../types";
import { GoogleGenAI, Type } from "@google/genai";

const historyCache: Record<string, HistoricalPoint[]> = {};

/**
 * 基金回调注册表 (天天基金专用，匹配其返回的 jsonpgz 函数)
 */
const fundRegistry: Record<string, (data: any) => void> = {};

// 初始化天天基金固定回调函数
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

/**
 * 请求队列控制：防止并发过高，同时保持流畅度
 */
class RequestQueue {
  private queue: (() => Promise<any>)[] = [];
  private processing = false;

  async add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          // 优化延迟：保持请求间隔以防反爬，但减小数值提升体验
          await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
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

/**
 * 通用 JSONP 请求器
 */
function jsonp<T>(url: string, callbackParam: string = 'cb', fundCode?: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const isFundGz = callbackParam === 'jsonpgz';
    const callbackName = isFundGz ? 'jsonpgz' : `__jp_cb_${Math.random().toString(36).slice(2, 10)}`;

    const script = document.createElement('script');
    const separator = url.includes('?') ? '&' : '?';
    const finalUrl = isFundGz ? url : `${url}${separator}cb=${callbackName}`;

    const timeoutLimit = isFundGz ? 15000 : 10000;
    const timeoutId = setTimeout(() => {
      cleanup();
      if (fundCode) delete fundRegistry[fundCode];
      reject(new Error(`Timeout`));
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
    if (!url.includes('1234567.com.cn')) {
      script.referrerPolicy = "no-referrer-when-downgrade";
    }

    script.onerror = () => {
      cleanup();
      if (fundCode) delete fundRegistry[fundCode];
      reject(new Error(`Script Load Error`));
    };

    document.head.appendChild(script);
  });
}

/**
 * 获取基金估值
 */
export async function fetchFundData(symbol: string, retryCount: number = 2): Promise<ValuationData | null> {
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
  } catch (e) {
    if (retryCount > 0) return fetchFundData(symbol, retryCount - 1);
  }
  return null;
}

/**
 * 获取单个指数
 */
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
      const timeStr = `${pad(timestamp.getHours())}:${pad(timestamp.getMinutes())}:${pad(timestamp.getSeconds())}`;

      return {
        symbol: item.f12 || secid,
        name: item.f14 || item.f58 || "指数",
        current: parseFloat(item.f43) || 0,
        change: parseFloat(item.f169) || 0,
        changePercent: parseFloat(item.f170) || 0,
        lastUpdated: timeStr
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
    const loadScript = () => new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => {
        const trendData = (window as any).Data_netWorthTrend;
        if (Array.isArray(trendData)) {
          historyCache[code] = trendData.map((item: any) => ({
            date: item.x,
            value: parseFloat(item.y) || 0,
            equityReturn: parseFloat(item.equityReturn) || 0
          }));
        }
        if (script.parentNode) script.parentNode.removeChild(script);
        resolve();
      };
      script.onerror = () => {
        if (script.parentNode) script.parentNode.removeChild(script);
        reject(new Error("History Load Error"));
      };
      document.head.appendChild(script);
    });
    await loadScript();
    return historyCache[code] || [];
  } catch (e) {
    return [];
  }
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
        return {
          date: new Date(parts[0]).getTime(),
          value: parseFloat(parts[1]) || 0,
          equityReturn: 0
        };
      });
    }
  } catch (e) {}
  return [];
}

export async function fetchMarketNews(): Promise<{ id: string, title: string, time: string, url: string }[]> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "Gather the top 10 most recent and impactful financial news headlines from the last 24 hours focusing on Chinese and Global stock markets. Provide them in a list format suitable for a ticker.",
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              title: { type: Type.STRING },
              time: { type: Type.STRING },
              url: { type: Type.STRING }
            },
            required: ["id", "title", "time", "url"]
          }
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text.trim());
    }
  } catch (e) {}

  return [
    { id: 'fb1', title: '市场震荡运行，关注大盘蓝筹底部机会', time: '10:30', url: '#' },
    { id: 'fb2', title: '纳指期货小幅走高，美股科技股盘前活跃', time: '15:45', url: '#' },
    { id: 'fb3', title: '公募基金规模持续增长，长线资金积极入场', time: '16:20', url: '#' }
  ];
}
