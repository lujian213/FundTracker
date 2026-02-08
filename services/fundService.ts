
import { ValuationData, MarketIndex, HistoricalPoint } from "../types";

/**
 * 内存缓存，减少重复请求
 */
const historyCache: Record<string, HistoricalPoint[]> = {};

/**
 * 获取当前时间戳 YYYYMMDDHHmmss
 */
function getTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/**
 * 格式化日期时间为 MM-DD HH:mm:ss
 */
function formatFullDateTime(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * 提取 JS 变量值的辅助函数
 */
function extractVar(content: string, varName: string): string {
  const regex = new RegExp(`(?:var|const|let)?\\s*${varName}\\s*=\\s*["']([^"']*)["']`, 'i');
  const match = content.match(regex);
  if (match && match[1]) {
    return match[1].trim();
  }
  const numRegex = new RegExp(`(?:var|const|let)?\\s*${varName}\\s*=\\s*([\\d\\.-]+)`, 'i');
  const numMatch = content.match(numRegex);
  return numMatch ? numMatch[1] : '';
}

/**
 * 提取复杂 JS 对象 (Array/Object)
 */
function extractComplexVar(content: string, varName: string): any {
  const regex = new RegExp(`var\\s+${varName}\\s*=\\s*(\\[[\\s\\S]*?\\]);`, 'm');
  const match = content.match(regex);
  if (match && match[1]) {
    try {
      return new Function(`return ${match[1]}`)();
    } catch (e) {
      console.error(`Failed to parse complex var: ${varName}`, e);
    }
  }
  return null;
}

/**
 * 解析 jsonpgz 格式
 */
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
 * 竞速代理获取函数：并发请求多个代理，取最快的一个
 */
async function fetchWithProxy(targetUrl: string, validator: (text: string) => boolean): Promise<string | null> {
  const proxyTemplates = [
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url: string) => url // 最后的兜底，通常在非浏览器环境有效
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 整体超时限制

  const fetchFromProxy = async (template: (url: string) => string): Promise<string> => {
    const proxyUrl = template(targetUrl);
    const innerController = new AbortController();

    // 手动关联信号，替代 AbortSignal.any，修复某些环境不支持该静态方法的问题
    const linkAbort = () => innerController.abort();
    controller.signal.addEventListener('abort', linkAbort);

    const innerTimeout = setTimeout(() => innerController.abort(), 4500); // 单个请求激进超时

    try {
      const response = await fetch(proxyUrl, {
        cache: 'no-cache',
        signal: innerController.signal
      });

      if (!response.ok) throw new Error('Proxy failed');
      const text = await response.text();
      if (text && validator(text)) return text;
      throw new Error('Invalid content');
    } finally {
      // 这里的 finally 确保了计时器被清除以及事件监听器被移除，防止内存泄漏
      clearTimeout(innerTimeout);
      controller.signal.removeEventListener('abort', linkAbort);
    }
  };

  try {
    // 使用手动实现的 Promise.any 逻辑，修复某些环境不支持 Promise.any 的问题
    const fastestResult = await new Promise<string>((resolve, reject) => {
      let rejectedCount = 0;
      const tasks = proxyTemplates.map(t => fetchFromProxy(t));
      tasks.forEach(task => {
        task.then(resolve).catch(() => {
          rejectedCount++;
          if (rejectedCount === tasks.length) {
            reject(new Error('All proxies failed'));
          }
        });
      });
    });

    clearTimeout(timeoutId);
    // 成功获取结果后，终止其他正在进行的代理请求
    controller.abort();
    return fastestResult;
  } catch (e) {
    clearTimeout(timeoutId);
    return null;
  }
}

/**
 * 获取历史趋势数据 (增加内存缓存)
 */
export async function fetchFundHistory(symbol: string): Promise<HistoricalPoint[]> {
  const code = symbol.padStart(6, '0');

  // 命中缓存直接返回
  if (historyCache[code]) return historyCache[code];

  const url = `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${getTimestamp()}`;
  const content = await fetchWithProxy(url, (t) => t.includes('Data_netWorthTrend'));

  if (!content) return [];

  const trendData = extractComplexVar(content, 'Data_netWorthTrend');
  if (!Array.isArray(trendData)) return [];

  const results = trendData.map((item: any) => ({
    date: item.x,
    value: item.y,
    equityReturn: item.equityReturn || 0
  }));

  // 存入缓存
  if (results.length > 0) historyCache[code] = results;

  return results;
}

/**
 * 获取大盘指数数据
 */
export async function fetchMarketIndices(secids: string[]): Promise<MarketIndex[]> {
  const fetchIndex = async (secid: string): Promise<MarketIndex | null> => {
    const ut = 'fa5fd1943c7b386f172d6893dbf244b0';
    const fields = 'f43,f169,f170,f58,f57,f124';
    const targetUrl = `https://push2.eastmoney.com/api/qt/stock/get?ut=${ut}&fltt=2&invt=2&secid=${secid}&fields=${fields}&_=${Date.now()}`;

    const content = await fetchWithProxy(targetUrl, (t) => t.includes('"data":') || t.includes('f43'));
    if (!content) return null;

    try {
      const json = JSON.parse(content);
      const d = json.data;
      if (!d) return null;

      const parseValue = (val: any) => {
        if (val === undefined || val === null || val === "-") return 0;
        return parseFloat(val);
      };

      let dataTime = new Date();
      if (d.f124) dataTime = new Date(d.f124 * 1000);

      return {
        name: d.f58 || `指数(${secid})`,
        symbol: secid,
        current: parseValue(d.f43),
        change: parseValue(d.f169),
        changePercent: parseValue(d.f170),
        lastUpdated: formatFullDateTime(dataTime)
      };
    } catch (e) {
      return null;
    }
  };

  const results = await Promise.all(secids.map(id => fetchIndex(id)));
  return results.filter((i): i is MarketIndex => i !== null);
}

export async function fetchFundData(symbol: string): Promise<ValuationData | null> {
  const code = symbol.padStart(6, '0');
  const timestamp = getTimestamp();
  const urlPrimary = `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${timestamp}`;
  const urlValuation = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${timestamp}`;

  try {
    const [resPrimary, resValuation] = await Promise.allSettled([
      fetchWithProxy(urlPrimary, (t) => t.includes('fS_code') || t.includes('dwjz')),
      fetchWithProxy(urlValuation, (t) => t.includes('jsonpgz'))
    ]);

    const contentPrimary = resPrimary.status === 'fulfilled' ? resPrimary.value : null;
    const contentValuation = resValuation.status === 'fulfilled' ? resValuation.value : null;

    if (!contentPrimary && !contentValuation) return null;

    const valInfo = contentValuation ? parseJsonpgz(contentValuation) : null;
    const baseInfo = contentPrimary ? {
      name: extractVar(contentPrimary, 'fS_name'),
      dwjz: extractVar(contentPrimary, 'dwjz'),
      gsz: extractVar(contentPrimary, 'gsz'),
      gszzl: extractVar(contentPrimary, 'gszzl'),
      gztime: extractVar(contentPrimary, 'gztime'),
      jzrq: extractVar(contentPrimary, 'fs_jzrq')
    } : null;

    const name = valInfo?.name || baseInfo?.name || `基金(${code})`;
    const dwjz = parseFloat(valInfo?.dwjz || baseInfo?.dwjz || "0");
    const gszRaw = valInfo?.gsz || baseInfo?.gsz;
    const gsz = gszRaw ? parseFloat(gszRaw) : dwjz;
    const gszzl = parseFloat(valInfo?.gszzl || baseInfo?.gszzl || "0");
    const gztime = valInfo?.gztime || baseInfo?.gztime || "数据加载中";
    const jzrq = valInfo?.jzrq || baseInfo?.jzrq || "---";

    let finalValuationDate = jzrq;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    if (gszRaw && gztime && gztime !== "数据加载中") {
        if (gztime.includes('-') && gztime.length > 10) finalValuationDate = gztime.split(' ')[0];
        else finalValuationDate = todayStr;
    }

    let finalGzTime = gztime;
    if (gztime && gztime.length <= 5 && gztime.includes(':')) {
        const dateStrForDisplay = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        finalGzTime = `${dateStrForDisplay} ${gztime}`;
    } else if (gztime && gztime.length > 10) {
        finalGzTime = gztime.substring(5);
    }

    return {
      symbol: code,
      name: name,
      currentPrice: gsz,
      previousPrice: dwjz,
      changePercentage: gszzl,
      lastUpdated: finalGzTime,
      valuationDate: finalValuationDate,
      sourceUrl: `https://fund.eastmoney.com/${code}.html`
    };
  } catch (error) {
    return null;
  }
}