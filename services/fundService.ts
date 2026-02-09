
import { ValuationData, MarketIndex, HistoricalPoint } from "../types";

const historyCache: Record<string, HistoricalPoint[]> = {};

function getTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function formatFullDateTime(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (isNaN(date.getTime())) return "---";
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function extractComplexVar(content: string, varName: string): any {
  const regex = new RegExp(`var\\s+${varName}\\s*=\\s*(\\[[\\s\\S]*?\\]);`, 'm');
  const match = content.match(regex);
  if (match && match[1]) {
    try {
      return new Function(`return ${match[1]}`)();
    } catch (e) {}
  }
  return null;
}

function parseJsonpgz(content: string): any {
  try {
    const start = content.indexOf('(') + 1;
    const end = content.lastIndexOf(')');
    if (start > 0 && end > start) {
      const jsonStr = content.substring(start, end);
      return JSON.parse(jsonStr);
    }
  } catch (e) {}
  return null;
}

/**
 * Sequential proxy fetcher to avoid overwhelming public proxies and handle CORS issues better.
 */
async function fetchWithProxy(targetUrl: string, validator: (text: string) => boolean): Promise<string | null> {
  const proxyTemplates = [
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    // Fallback direct for local dev or if target suddenly allows it
    (url: string) => url
  ];

  for (const template of proxyTemplates) {
    const proxyUrl = template(targetUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(proxyUrl, {
        cache: 'no-cache',
        signal: controller.signal,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        }
      });

      if (!response.ok) continue;

      const text = await response.text();
      if (text && validator(text)) {
        clearTimeout(timeoutId);
        return text;
      }
    } catch (e) {
      // CORS or Network error, try next proxy
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return null;
}

export async function fetchFundHistory(symbol: string): Promise<HistoricalPoint[]> {
  const code = symbol.padStart(6, '0');
  let baseHistory = historyCache[code];
  if (!baseHistory) {
    const url = `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${getTimestamp()}`;
    const content = await fetchWithProxy(url, (t) => t.includes('Data_netWorthTrend'));
    if (content) {
      const trendData = extractComplexVar(content, 'Data_netWorthTrend');
      if (Array.isArray(trendData)) {
        baseHistory = trendData.map((item: any) => ({
          date: item.x,
          value: item.y,
          equityReturn: item.equityReturn || 0
        }));
        historyCache[code] = baseHistory;
      }
    }
  }
  return baseHistory || [];
}

/**
 * 获取指数/个股的历史 K 线数据
 */
export async function fetchIndexHistory(secid: string): Promise<HistoricalPoint[]> {
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f53&klt=101&fqt=1&end=20500101&lmt=90`;
  const content = await fetchWithProxy(url, (t) => t.includes('"klines"'));
  if (content) {
    try {
      const json = JSON.parse(content);
      const klines = json.data?.klines;
      if (Array.isArray(klines)) {
        return klines.map((k: string) => {
          const parts = k.split(',');
          return {
            date: new Date(parts[0]).getTime(),
            value: parseFloat(parts[1]),
            equityReturn: 0
          };
        });
      }
    } catch (e) {}
  }
  return [];
}

function safeParseFloat(val: any): number {
  if (val === undefined || val === null || val === "-" || val === "" || val === "NaN") return 0;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? 0 : parsed;
}

export async function fetchMarketIndices(secids: string[]): Promise<MarketIndex[]> {
  const fetchIndex = async (rawSecid: string): Promise<MarketIndex | null> => {
    let secid = rawSecid.trim().toUpperCase();
    if (/^[A-Z]+$/.test(secid)) secid = `100.${secid}`;
    const isGlobal = secid.startsWith('100.') || secid.startsWith('101.') || secid.startsWith('102.');
    const utOptions = isGlobal
      ? ['b2a84d46797b5e4c8d451421f57f4951', '70f12f01f422830f269a83a00f1c3f9f']
      : ['fa5fd1943c7b386f172d6893dbf244b0'];
    const fields = 'f43,f169,f170,f58,f124,f116,f60';

    for (const ut of utOptions) {
      const invt = isGlobal ? 2 : 2;
      const targetUrl = `https://push2.eastmoney.com/api/qt/stock/get?ut=${ut}&fltt=2&invt=${invt}&secid=${secid}&fields=${fields}&_=${Date.now()}`;
      const content = await fetchWithProxy(targetUrl, (t) => t.includes('"data":'));
      if (!content) continue;
      try {
        const json = JSON.parse(content);
        const d = json.data;
        if (d) {
          const currentPrice = safeParseFloat(d.f43 || d.f116 || d.f60);
          let dataTime = new Date();
          if (d.f124) dataTime = new Date(d.f124 > 2000000000 ? d.f124 : d.f124 * 1000);
          return {
            name: d.f58 || `指数(${secid})`,
            symbol: secid,
            current: currentPrice,
            change: safeParseFloat(d.f169),
            changePercent: safeParseFloat(d.f170),
            lastUpdated: formatFullDateTime(dataTime)
          };
        }
      } catch (e) {}
    }
    return null;
  };
  const results = await Promise.all(secids.map(id => fetchIndex(id)));
  return results.filter((r): r is MarketIndex => r !== null);
}

export async function fetchFundData(symbol: string): Promise<ValuationData | null> {
  const code = symbol.padStart(6, '0');
  const url = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;
  const content = await fetchWithProxy(url, (t) => t.includes('jsonpgz'));
  if (content) {
    const data = parseJsonpgz(content);
    if (data) {
      const realtimeDate = data.gztime ? data.gztime.split(' ')[0] : '---';
      return {
        symbol: data.fundcode,
        name: data.name,
        currentPrice: safeParseFloat(data.gsz),
        previousPrice: safeParseFloat(data.dwjz),
        changePercentage: safeParseFloat(data.gszzl),
        lastUpdated: data.gztime || '---',
        realtimeDate: realtimeDate,
        netWorthDate: data.jzrq || '---',
        valuationDate: realtimeDate,
        sourceUrl: `https://pinzhong.eastmoney.com/fund/${code}.html`
      };
    }
  }
  return null;
}
