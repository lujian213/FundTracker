
import { ValuationData, MarketIndex } from "../types";

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
 * 提取 JS 变量值的辅助函数 - 增强兼容性
 */
function extractVar(content: string, varName: string): string {
  // 匹配 var varName = "value"; 或 varName = "value";
  const regex = new RegExp(`(?:var|const|let)?\\s*${varName}\\s*=\\s*["']([^"']*)["']`, 'i');
  const match = content.match(regex);
  if (match && match[1]) {
    return match[1].trim();
  }
  // 匹配数字型变量
  const numRegex = new RegExp(`(?:var|const|let)?\\s*${varName}\\s*=\\s*([\\d\\.-]+)`, 'i');
  const numMatch = content.match(numRegex);
  return numMatch ? numMatch[1] : '';
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
 * 通用代理获取函数 - 优化稳定性
 */
async function fetchWithProxy(targetUrl: string, validator: (text: string) => boolean): Promise<string | null> {
  const proxies = [
    (url: string) => url, // 尝试直接请求
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
  ];

  for (let i = 0; i < proxies.length; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);
    const proxyUrl = proxies[i](targetUrl);

    try {
      const response = await fetch(proxyUrl, {
        cache: 'no-cache',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        const text = await response.text();
        if (text && validator(text)) return text;
      }
    } catch (e) {
      clearTimeout(timeoutId);
    }
  }
  return null;
}

/**
 * 获取大盘指数数据
 */
export async function fetchMarketIndices(): Promise<MarketIndex[]> {
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
      if (d.f124) {
        dataTime = new Date(d.f124 * 1000);
      }

      return {
        name: d.f58 || (secid.includes('HSTECH') ? '恒生科技' : '指数'),
        symbol: d.f57 || secid.split('.')[1],
        current: parseValue(d.f43),
        change: parseValue(d.f169),
        changePercent: parseValue(d.f170),
        lastUpdated: formatFullDateTime(dataTime)
      };
    } catch (e) {
      return null;
    }
  };

  const results = await Promise.all([
    fetchIndex('1.000001'),
    fetchIndex('124.HSTECH')
  ]);

  return results.filter((i): i is MarketIndex => i !== null);
}

export async function fetchFundData(symbol: string): Promise<ValuationData | null> {
  const code = symbol.padStart(6, '0');
  const timestamp = getTimestamp();
  const urlPrimary = `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${timestamp}`;
  const urlValuation = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${timestamp}`;

  try {
    // 两个接口并行获取，只要有一个成功就尝试解析
    const [resPrimary, resValuation] = await Promise.allSettled([
      fetchWithProxy(urlPrimary, (t) => t.includes('fS_code') || t.includes('fS_name') || t.includes('dwjz')),
      fetchWithProxy(urlValuation, (t) => t.includes('jsonpgz'))
    ]);

    const contentPrimary = resPrimary.status === 'fulfilled' ? resPrimary.value : null;
    const contentValuation = resValuation.status === 'fulfilled' ? resValuation.value : null;

    if (!contentPrimary && !contentValuation) return null;

    // 解析实时估值接口 (最关键的数据源)
    const valInfo = contentValuation ? parseJsonpgz(contentValuation) : null;

    // 解析基础资料接口
    const baseInfo = contentPrimary ? {
      name: extractVar(contentPrimary, 'fS_name'),
      dwjz: extractVar(contentPrimary, 'dwjz'),
      gsz: extractVar(contentPrimary, 'gsz'),
      gszzl: extractVar(contentPrimary, 'gszzl'),
      gztime: extractVar(contentPrimary, 'gztime'),
      jzrq: extractVar(contentPrimary, 'fs_jzrq')
    } : null;

    // 数据合并与回退机制
    const name = valInfo?.name || baseInfo?.name || `基金(${code})`;
    const dwjz = parseFloat(valInfo?.dwjz || baseInfo?.dwjz || "0");
    const gszRaw = valInfo?.gsz || baseInfo?.gsz;
    const gsz = gszRaw ? parseFloat(gszRaw) : dwjz;
    const gszzl = parseFloat(valInfo?.gszzl || baseInfo?.gszzl || "0");
    const gztime = valInfo?.gztime || baseInfo?.gztime || "数据加载中";
    const jzrq = valInfo?.jzrq || baseInfo?.jzrq || "---";

    // 确定估值日期
    let finalValuationDate = jzrq;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    if (gszRaw && gztime && gztime !== "数据加载中") {
        if (gztime.includes('-') && gztime.length > 10) {
            finalValuationDate = gztime.split(' ')[0];
        } else {
            finalValuationDate = todayStr;
        }
    }

    // 格式化时间显示
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
    console.error(`Fetch error for ${symbol}:`, error);
    return null;
  }
}
