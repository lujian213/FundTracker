import { ValuationData, MarketIndex, IndexInfo, HistoricalPoint, OverallProfitSummary, OverallFundRow, ProfitPoint, JobResult, KlinePoint } from "../types";
import { computeProfitTimeline } from '../utils/profitCalculator';
import { toLocalDateKey, resolvePreferredPrice, ResolvedPrice } from '../utils/priceResolver';
import { getTradesForSymbol } from '../hooks/useTrades';
import { extractTradingPeriodBeginTimestamp } from '../utils/dateTimeUtils';
import { formatDateISO, formatTimeISO, formatHHMM } from '../utils/dateFormat';
import * as marketFundService from './marketFundService';
import * as indexService from './indexService';
import { fetchWithProxy } from './proxyService';

/**
 * 准备用于盈亏计算的历史数据
 * - 使用优选价格（估值/确认净值）覆盖同日期的历史点
 * - 去重同日期的数据点
 * - 确保目标日期有数据点
 *
 * 此函数被 ProfitModal 和 computeOverallProfit 共同使用，确保两者计算一致。
 *
 * @param history 原始历史数据
 * @param targetDate 目标日期（通常是今天或用户选择的结束日期）
 * @param todayDate 今天的本地日期
 * @param currentPrice 估值价格
 * @param realtimeDate 估值日期
 * @param previousPrice 确认净值
 * @param netWorthDate 净值日期
 * @returns 处理后的历史数据，可直接用于 computeProfitTimeline
 */
export function prepareHistoryForProfitCalculation(params: {
  history: HistoricalPoint[];
  targetDate: string;
  todayDate: string;
  currentPrice?: number | null;
  realtimeDate?: string | null;
  previousPrice?: number | null;
  netWorthDate?: string | null;
}): HistoricalPoint[] {
  const { history, targetDate, todayDate, currentPrice, realtimeDate, previousPrice, netWorthDate } = params;

  if (!history || history.length === 0) return [];

  // 排序历史数据（去重逻辑需要按日期排序）
  const sorted = history.slice().sort((a, b) => (a.date as number) - (b.date as number));

  // 获取优选价格
  const preferred = resolvePreferredPrice({
    targetDate,
    todayDate,
    history: sorted,
    currentPrice,
    realtimeDate,
    previousPrice,
    netWorthDate,
  });

  // 按本地日期去重，并用优选价格覆盖
  const byDate = new Map<string, HistoricalPoint>();
  for (const p of sorted) {
    const localDate = toLocalDateKey(p.date);
    // 如果已有同日期的点，保留时间戳更高的
    if (!byDate.has(localDate) || p.date > (byDate.get(localDate)?.date || 0)) {
      byDate.set(localDate, p);
    }
  }

  // 用优选价格覆盖同日期的历史点
  if (preferred) {
    const preferredTs = new Date(`${preferred.date} 15:00`).getTime();
    byDate.set(preferred.date, { date: preferredTs, value: preferred.price, equityReturn: 0 });
  }

  return Array.from(byDate.values()).sort((a, b) => a.date - b.date);
}

/**
 * 将 symbol 补零到6位
 * @example padSymbol('1234') -> '001234'
 * @example padSymbol('123456') -> '123456'
 */
export function padSymbol(symbol: string): string {
  return symbol.padStart(6, '0');
}

/**
 * 解析天天基金 jsonpgz 响应为 ValuationData
 * @param data 天天基金 API 返回的原始数据
 * @returns 解析后的估值数据，如果数据无效则返回 null
 */
export function parseJsonpgzResponse(data: any): ValuationData | null {
  if (!data || !data.fundcode) return null;
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
    sourceUrl: `https://fund.eastmoney.com/${data.fundcode}.html`
  };
}

/**
 * 解析东方财富 Data_netWorthTrend 数据为 HistoricalPoint[]
 * @param trendData 东方财富返回的历史净值趋势数据
 * @returns 归一化后的历史数据点数组
 */
export function parseHistoryFromTrendData(trendData: any[]): HistoricalPoint[] {
  if (!Array.isArray(trendData)) return [];
  const rawPoints = trendData.map((item: any) => ({
    date: item?.x,
    value: parseFloat(item?.y) || 0,
    equityReturn: parseFloat(item?.equityReturn) || 0,
  }));
  return normalizeHistoryPoints(rawPoints);
}

/**
 * 从东方财富 fallback 数据构建 ValuationData
 * @param code 基金代码
 * @param trend 历史净值数据
 * @param name 基金名称（可选）
 * @returns 构建的估值数据，如果数据无效则返回 null
 */
export function buildValuationFromFallback(code: string, trend: any[], name?: string | null): ValuationData | null {
  if (!Array.isArray(trend) || trend.length === 0) return null;

  const last = trend[trend.length - 1];
  const prev = trend.length > 1 ? trend[trend.length - 2] : null;

  const confirmedPrice = parseFloat(last?.y) || 0;
  const prevPriceHist = prev ? (parseFloat(prev.y) || 0) : 0;
  const changePercentage = prevPriceHist > 0 ? ((confirmedPrice - prevPriceHist) / prevPriceHist) * 100 : 0;

  // 解析日期
  const lastDate = last?.x ? normalizeHistoryTimestamp(last.x) : null;
  const d = lastDate ? new Date(lastDate) : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const netWorthDate = `${year}-${month}-${day}`;
  const lastUpdated = `${netWorthDate} 15:00:00`;

  return {
    symbol: code,
    name: name || `基金 ${code}`,
    currentPrice: confirmedPrice,
    previousPrice: confirmedPrice,
    changePercentage,
    lastUpdated,
    realtimeDate: netWorthDate,
    netWorthDate,
    valuationDate: lastUpdated,
    sourceUrl: `https://fund.eastmoney.com/${code}.html`
  };
}

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
  forceFetchFundHistory: (symbol: string) => forceFetchFundHistory(symbol),
};

/**
 * JSONP dependency seam for testing.
 * Tests can replace this to mock the jsonp function.
 */
export const _jsonp = {
  call: <T>(url: string, callbackParam: string = 'cb', fundCode?: string, retryCount: number = 3): Promise<T> => jsonp(url, callbackParam, fundCode, retryCount),
};

// Module-level in-memory history cache (kept for backward-compat; cacheService is now the
// single source of truth and also persists to localStorage per-symbol).
const historyCache: Record<string, HistoricalPoint[]> = {};

/**
 * 基金回调注册表 (天天基金专用)
 * 使用 fundcode 作为键进行严格匹配
 * 不使用 fallback 机制，匹配失败时丢弃数据
 */
const fundRegistry: Record<string, {
  callback: (data: any) => void;
  requestTime: number;
}> = {};

/**
 * 全局回调函数 - 严格匹配 fundcode，不 fallback
 * 天天基金 API 返回固定的 jsonpgz({...}) 格式，不支持自定义回调名
 */
(window as any).jsonpgz = (data: any) => {
  if (!data) {
    console.warn('[jsonpgz] 收到空响应，已丢弃');
    return;
  }

  const fundcode = data.fundcode;
  const entry = fundRegistry[fundcode];

  if (entry) {
    // 匹配成功，调用回调并清理
    entry.callback(data);
    delete fundRegistry[fundcode];
  } else {
    // 匹配失败，丢弃数据并打印警告（不再 fallback）
    console.warn('[jsonpgz] 响应 fundcode 未匹配，已丢弃:', {
      receivedFundcode: fundcode,
      dataName: data.name,
      waitingFundcodes: Object.keys(fundRegistry),
    });
  }
};

class RequestQueue {
  private queue: (() => Promise<any>)[] = [];
  private processing = false;

  constructor(private delayMs: number = 0) {}

  async add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          if (this.delayMs > 0) {
            await new Promise(r => setTimeout(r, this.delayMs + Math.random() * 1000));
          }
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
    if (this.processing) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        try { await task(); } catch (e) {}
      }
    }
    this.processing = false;
    if (this.queue.length > 0) {
      this.process();
    }
  }
}

const globalQueue = new RequestQueue(2000);
const indexQueue = new RequestQueue(0);  // 指数请求数量少，无需额外延迟
const historyLoadQueue = new RequestQueue(0);

// 请求序列号机制：防止并发历史请求的数据混淆
let historyRequestSeq = 0;
const activeHistoryRequests = new Map<number, { code: string; resolve: (value: HistoricalPoint[]) => void; reject: (reason?: any) => void }>();

function normalizeHistoryTimestamp(input: unknown): number | null {
  // Accept numbers (ms or s), numeric strings, and common date string formats (YYYY-MM-DD or YYYYMMDD)
  try {
    if (input == null) return null;
    // number-like (including numeric string)
    const asNum = Number(input);
    if (Number.isFinite(asNum) && asNum > 0) {
      return asNum < 1e11 ? Math.trunc(asNum * 1000) : Math.trunc(asNum);
    }
    // string date like '2026-02-20' or '20260220'
    if (typeof input === 'string') {
      const s = input.trim();
      // YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const ts = Date.parse(s);
        if (!Number.isNaN(ts)) return ts;
      }
      // YYYYMMDD
      if (/^\d{8}$/.test(s)) {
        const y = Number(s.slice(0, 4));
        const m = Number(s.slice(4, 6)) - 1;
        const d = Number(s.slice(6, 8));
        const dt = new Date(y, m, d);
        if (!Number.isNaN(dt.getTime())) return dt.getTime();
      }
      // Fallback: try Date.parse (handles many formats)
      const parsed = Date.parse(s);
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch (e) {
    // fallthrough
  }
  return null;
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
      const volume = Number((p as any)?.volume ?? 0);
      const amount = Number((p as any)?.amount ?? 0);
      const result: HistoricalPoint = {
        date: ts,
        value,
        equityReturn: Number.isFinite(equityReturn) ? equityReturn : 0,
      };
      // 只有指数数据才有成交量和成交额
      // 注意：amount=0 表示数据不可用，也是有效值（如腾讯API不返回成交额）
      if (Number.isFinite(volume) && volume >= 0) result.volume = volume;
      if (Number.isFinite(amount) && amount >= 0) result.amount = amount;
      return result;
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
  marketFundService.updateHistory(code, points);
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
  // 使用请求序列号机制防止并发数据混淆
  const seq = ++historyRequestSeq;

  return new Promise((resolve, reject) => {
    // 注册活动请求
    activeHistoryRequests.set(seq, { code, resolve, reject });

    const script = document.createElement('script');
    script.src = url;
    script.setAttribute('data-history-seq', String(seq));

    // 超时机制：防止 script 既不触发 onload 也不触发 onerror
    const timeoutMs = 15000;  // 15秒超时
    let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      timeoutId = null;
      cleanup();
      reject(new Error('REQUEST_TIMEOUT'));
    }, timeoutMs);

    // 清理函数：移除脚本、清理全局变量、清理请求注册、清理超时
    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      activeHistoryRequests.delete(seq);
      if (script.parentNode) script.parentNode.removeChild(script);
      // 注意：不在这里清理全局变量，因为其他请求可能正在使用
    };

    script.onload = () => {
      // 清理超时
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      const req = activeHistoryRequests.get(seq);

      // 检查请求是否仍然有效
      if (!req) {
        // 请求已被清理（可能因为其他请求干扰或超时），拒绝数据
        cleanup();
        reject(new Error('REQUEST_STALE'));
        return;
      }

      // 验证请求的 code 是否匹配
      if (req.code !== code) {
        cleanup();
        reject(new Error('REQUEST_CODE_MISMATCH'));
        return;
      }

      const trendData = (window as any).Data_netWorthTrend;

      if (Array.isArray(trendData)) {
        resolve(normalizeAndSyncHistory(code, toRawHistoryPoints(trendData)));
      } else {
        resolve(syncHistoryCache(code, []));
      }

      // 在处理完数据后，清理全局变量
      try { delete (window as any).Data_netWorthTrend; } catch (e) {}
      cleanup();
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('SCRIPT_LOAD_ERROR'));
    };

    document.head.appendChild(script);
  });
}

/**
 * 带重试的历史数据加载函数
 * 当请求因并发竞争失败时（REQUEST_STALE），自动重试
 * @param code 基金代码
 * @param maxRetries 最大重试次数
 */
async function loadHistoryFromPingzhongDataWithRetry(code: string, maxRetries = 2): Promise<HistoricalPoint[]> {
  const ts = formatYMDHMS(new Date());
  const url = `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${ts}`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await loadHistoryFromPingzhongData(code, url);
      return result;
    } catch (e) {
      const errorMsg = (e as Error)?.message || '';

      // 如果是并发竞争导致的数据混淆，重试
      if (errorMsg === 'REQUEST_STALE' || errorMsg === 'REQUEST_CODE_MISMATCH') {
        if (attempt < maxRetries) {
          // 等待一小段时间后重试，避免立即重复竞争
          await new Promise(r => setTimeout(r, 100));
          continue;
        }
      }

      // 其他错误或重试次数耗尽，返回空数组
      console.warn(`loadHistoryFromPingzhongDataWithRetry(${code}) failed after ${attempt + 1} attempts:`, errorMsg);
      return [];
    }
  }
  return [];
}

export function jsonp<T>(url: string, callbackParam: string = 'cb', fundCode?: string, retryCount: number = 3): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let attempts = 0;

    const doRequest = () => {
      attempts++;
      const isFundGz = callbackParam === 'jsonpgz';

      // 天天基金 API 使用固定的 jsonpgz 回调名，不支持自定义
      // 其他 API 使用随机回调名
      const callbackName = isFundGz ? 'jsonpgz' : `__jp_cb_${Math.random().toString(36).slice(2, 10)}`;

      const script = document.createElement('script');
      const separator = url.includes('?') ? '&' : '?';
      // 天天基金 API 不需要 cb 参数，使用默认的 jsonpgz 回调
      const finalUrl = isFundGz ? url : `${url}${separator}${callbackParam}=${callbackName}`;

      const timeoutLimit = 15000; // K线数据可能需要更长响应时间
      const timeoutId = setTimeout(() => {
        cleanup();
        // 超时时清理注册表条目，防止后续响应匹配到过期请求
        if (isFundGz && fundCode) {
          delete fundRegistry[fundCode];
        }
        if (attempts < retryCount) {
          // 重试前等待
          setTimeout(doRequest, 1000 * attempts);
        } else {
          reject(new Error(`TIMEOUT`));
        }
      }, timeoutLimit);

      const cleanup = () => {
        clearTimeout(timeoutId);
        if (script.parentNode) script.parentNode.removeChild(script);
        if (!isFundGz) {
          // 先设为空函数防止延迟响应报错，5秒后再真正删除避免垃圾积累
          (window as any)[callbackName] = () => {};
          setTimeout(() => {
            try { delete (window as any)[callbackName]; } catch {}
          }, 5000);
        }
      };

      if (isFundGz && fundCode) {
        // 注册回调到 fundRegistry，全局 jsonpgz 会调用
        fundRegistry[fundCode] = {
          callback: (data: any) => {
            cleanup();
            resolve(data);
          },
          requestTime: Date.now(),
        };
      } else {
        (window as any)[callbackName] = (data: T) => {
          cleanup();
          resolve(data);
        };
      }

      script.src = finalUrl;
      // 不设置 referrerPolicy，让浏览器自动添加 Referer
      script.onerror = () => {
        cleanup();
        // 错误时清理注册表条目
        if (isFundGz && fundCode) {
          delete fundRegistry[fundCode];
        }
        if (attempts < retryCount) {
          // 重试前等待
          setTimeout(doRequest, 1000 * attempts);
        } else {
          reject(new Error(`SCRIPT_ERROR`));
        }
      };
      document.head.appendChild(script);
    };

    doRequest();
  });
}

// fetch 方式 - 用于替代 JSONP 解决跨域问题
async function fetchJson<T>(url: string, timeout: number = 10000): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      mode: 'cors',
      headers: {
        'Origin': 'https://quote.eastmoney.com',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchFundData(symbol: string): Promise<ValuationData | null> {
  const code = padSymbol(symbol);
  const url = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;
  try {
    // 队列控制在外层批量函数进行，这里直接执行
    const data: any = await jsonp(url, 'jsonpgz', code);
    const parsed = parseJsonpgzResponse(data);
    if (parsed) return parsed;
  } catch (e) {}

  // Fallback: try EastMoney pingzhongdata JS which contains full fund info and history
  try {
    const fallback = await fetchFundDataFromEastMoney(code);
    if (fallback) return fallback;
  } catch (e) {}

  return null;
}

/**
 * 批量获取基金估值数据
 * - 成功获取的数据会自动写入缓存
 * - 支持部分失败：成功的数据写入缓存，失败的会在 message 中报告
 * - 返回 JobResult<void>，不返回具体数据（数据已在缓存中）
 */
export async function fetchFundDatas(symbols: string[]): Promise<JobResult<void>> {
  if (symbols.length === 0) return { success: true, data: undefined };

  const errors: string[] = [];
  let successCount = 0;

  for (const sym of symbols) {
    try {
      const res = await globalQueue.add(() => fetchFundData(sym));
      if (!res) {
        errors.push(`${sym}: API返回空数据`);
      } else {
        // 写入缓存
        marketFundService.updateValuation(sym, res);
        try { marketFundService.appendIntradayPoint(sym, res.currentPrice, res.changePercentage, res.lastUpdated, res.realtimeDate); } catch (e) { /* ignore */ }
        successCount++;
      }
    } catch (e) {
      errors.push(`${sym}: ${(e as Error).message || '未知错误'}`);
    }
  }

  const failCount = errors.length;

  // 全部失败
  if (failCount === symbols.length) {
    return { success: false, message: `${failCount} 只基金估值更新失败` };
  }

  // 部分失败：返回 success: false
  if (failCount > 0) {
    return { success: false, data: undefined, message: `成功更新 ${successCount} 只基金估值，${failCount} 只更新失败` };
  }

  return { success: true, data: undefined, message: `成功更新 ${successCount} 只基金估值` };
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
      // Debug info removed: previously logged added globals when no trend found.
      // e.g. Object.keys(window).slice(-20)
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

    let lastUpdated = '---';
    let netWorthDate = toLocalDateKey(new Date());
    if (d) {
      // Compute the browser's local calendar date for the timestamp to comply with project requirements
      // that all time operations should use browser local time.
      const date = new Date(d.getTime());
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      // Display confirmed historical net worth as end-of-day 15:00:00 (local)
      lastUpdated = `${year}-${month}-${day} 15:00:00`;
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

/**
 * 标准化指数符号
 * - A股: 保持原样 (如 1.000001 -> 1.000001)
 * - 美股/港股指数别名: 转换为标准格式 (NDX -> 100.NDX, SPX -> 100.SPX, HSI -> 100.HSI)
 */
export function normalizeIndexSymbol(raw: string): string {
  const normalized = (raw || '').trim().toUpperCase();
  if (normalized === 'NDX') return '100.NDX';
  if (normalized === 'SPX') return '100.SPX';
  if (normalized === 'HSI') return '100.HSI';
  return normalized;
}

/**
 * 交易时段信息
 */
export interface TradingPeriod {
  beginDate: string;  // YYYY-MM-DD 开盘日期
  endDate: string;    // YYYY-MM-DD 收盘日期
  beginHHMM: number;  // HHMM 格式开盘时间，如 930 表示 09:30
  endHHMM: number;    // HHMM 格式收盘时间，如 1130 表示 11:30
}

/**
 * 计算结果
 */
export interface TradingHoursResult {
  tradeDate: string;      // YYYY-MM-DD
  lastUpdated: string;    // HH:mm:ss
}

/**
 * 解析 f80 字段为交易时段列表
 * f80 格式: [{"b":202605052130,"e":202605060400}]
 * @param f80 f80 字段字符串
 * @returns TradingPeriod 数组
 */
export function parseF80TradingPeriods(f80: string | null | undefined): TradingPeriod[] {
  if (!f80 || typeof f80 !== 'string') return [];

  try {
    const beginMatches = [...f80.matchAll(/"b":(\d{12})/g)] as RegExpMatchArray[];
    const endMatches = [...f80.matchAll(/"e":(\d{12})/g)] as RegExpMatchArray[];

    const periods: TradingPeriod[] = [];
    for (let i = 0; i < beginMatches.length && i < endMatches.length; i++) {
      const beginNum = beginMatches[i][1];
      const endNum = endMatches[i][1];
      periods.push({
        beginDate: `${beginNum.substring(0, 4)}-${beginNum.substring(4, 6)}-${beginNum.substring(6, 8)}`,
        endDate: `${endNum.substring(0, 4)}-${endNum.substring(4, 6)}-${endNum.substring(6, 8)}`,
        beginHHMM: parseInt(beginNum.substring(8, 12)),
        endHHMM: parseInt(endNum.substring(8, 12)),
      });
    }
    return periods;
  } catch {
    return [];
  }
}

/**
 * 根据交易时段和当前时间计算 tradeDate 和 lastUpdated
 *
 * 逻辑：
 * - 如果当前时间在交易时段内：tradeDate = 当前日期，lastUpdated = 当前时间
 * - 如果当前时间不在交易时段内：tradeDate = 最后一个时段的收盘日期，lastUpdated = 收盘时间
 *
 * 跨日交易时段处理：
 * - 如果 beginHHMM > endHHMM（如 2130 > 0400），表示跨日交易（如美股 21:30-04:00）
 * - 跨日时段判断条件：当前时间 >= 开盘时间 或 当前时间 <= 收盘时间
 *
 * 多时段处理：
 * - A股有上午（09:30-11:30）和下午（13:00-15:00）两个时段
 * - 只要当前时间在任何一个时段内，就视为在交易时段
 *
 * @param periods 交易时段列表（按时间顺序）
 * @param now 当前时间（可选，用于测试时注入；默认使用 new Date()）
 * @returns tradeDate 和 lastUpdated
 */
export function computeTradingDateAndTime(
  periods: TradingPeriod[],
  now?: Date
): TradingHoursResult {
  if (!periods || periods.length === 0) {
    const fallbackNow = now || new Date();
    return {
      tradeDate: formatDateISO(fallbackNow),
      lastUpdated: formatTimeISO(fallbackNow),
    };
  }

  const currentTime = now || new Date();
  const nowTimeNum = currentTime.getHours() * 100 + currentTime.getMinutes();
  const currentDate = formatDateISO(currentTime);

  // 判断是否在交易时段内（只考虑时间）
  let inTradingHours = false;
  let matchedPeriod: TradingPeriod | null = null;

  for (const period of periods) {
    const b = period.beginHHMM;
    const e = period.endHHMM;
    // 跨日时段（b > e）：当前时间 >= 开盘 或 <= 收盘
    // 同日时段：当前时间 >= 开盘 且 <= 收盘
    const inThisPeriod = b > e ? (nowTimeNum >= b || nowTimeNum <= e) : (nowTimeNum >= b && nowTimeNum <= e);
    if (inThisPeriod) {
      inTradingHours = true;
      matchedPeriod = period;
      break;
    }
  }

  // 判断当前日期是否为交易日
  // 对于跨日时段：当前日期应该等于 beginDate（晚间开盘日）或 endDate（次日收盘日）
  // 对于同日时段：当前日期应该等于 beginDate/endDate
  let isTradingDay = false;
  if (matchedPeriod) {
    // 在交易时段内时，判断日期是否匹配
    const b = matchedPeriod.beginHHMM;
    const e = matchedPeriod.endHHMM;
    if (b > e) {
      // 跨日时段：当前日期可以是 beginDate（晚间）或 endDate（次日凌晨）
      isTradingDay = currentDate === matchedPeriod.beginDate || currentDate === matchedPeriod.endDate;
    } else {
      // 同日时段：当前日期必须等于时段日期
      isTradingDay = currentDate === matchedPeriod.beginDate;
    }
  } else {
    // 不在任何时段内时，使用第一个时段的日期判断是否为同一天
    // 如果当前日期与任何时段的日期都不一致，说明是非交易日
    const firstBeginDate = periods[0].beginDate;
    const lastEndDate = periods[periods.length - 1].endDate;
    isTradingDay = currentDate === firstBeginDate || currentDate === lastEndDate;
  }

  // 只有在交易日且在交易时段内时，才返回当前时间
  if (isTradingDay && inTradingHours) {
    return {
      tradeDate: currentDate,
      lastUpdated: formatTimeISO(currentTime),
    };
  }

  // 非交易日或不在交易时段内
  const lastPeriod = periods[periods.length - 1];

  // 如果是交易日但不在时段内（如午休时段），返回最近的收盘时间
  if (isTradingDay && !inTradingHours) {
    // 找距离当前时间最近的收盘时间
    const allEndTimes = periods.map(p => p.endHHMM);
    const nearestClose = allEndTimes.reduce((nearest, t) => {
      const diff = Math.abs(t - nowTimeNum);
      const nearestDiff = Math.abs(nearest - nowTimeNum);
      return diff < nearestDiff ? t : nearest;
    }, allEndTimes[0]);
    return {
      tradeDate: lastPeriod.endDate,
      lastUpdated: formatHHMM(nearestClose),
    };
  }

  // 非交易日：返回交易时段的最后收盘时间
  return {
    tradeDate: lastPeriod.endDate,
    lastUpdated: formatHHMM(lastPeriod.endHHMM),
  };
}

/**
 * 开盘前数据覆盖逻辑
 * 当开盘前时，API 返回的 f169（涨跌额）和 f170（涨跌幅）都是 0
 * 应该从历史数据获取上一个交易日的涨跌幅信息
 *
 * @param currentInfo 当前从 API 获取的指数信息
 * @param history 历史数据数组
 * @param closeTime 收盘时间（HH:mm:ss 格式）
 * @returns 修改后的指数信息，如果不满足开盘前条件则返回原始信息
 */
export function applyBeforeOpenDataOverride(
  currentInfo: IndexInfo,
  history: HistoricalPoint[],
  closeTime: string
): IndexInfo {
  // 检查是否标记为开盘前（通过 __isBeforeOpen 临时变量）
  const isBeforeOpen = (currentInfo as any).__isBeforeOpen;
  if (!isBeforeOpen) return currentInfo;

  if (!history || history.length === 0) return currentInfo;

  // 确定使用哪条历史数据
  // 注意：历史数据最后一条可能是当天的集合竞价数据（如恒科在集合竞价时就有当天的指数值）
  // 所以需要验证日期，确保使用的是上一个交易日的完整收盘数据
  const lastPoint = history[history.length - 1];
  const lastPointDate = toLocalDateKey(lastPoint.date);

  let targetPoint: HistoricalPoint;
  let targetDate: string;
  let prevPoint: HistoricalPoint | undefined;

  if (lastPointDate === currentInfo.tradeDate) {
    // 历史数据最后一条是当天的（集合竞价数据），使用倒数第二条
    if (history.length < 2) return currentInfo; // 只有一条且是当天的，无法获取上一个交易日数据
    targetPoint = history[history.length - 2];
    targetDate = toLocalDateKey(targetPoint.date);
    prevPoint = history.length >= 3 ? history[history.length - 3] : undefined;
  } else {
    // 历史数据最后一条是上一个交易日的，直接使用
    targetPoint = lastPoint;
    targetDate = lastPointDate;
    prevPoint = history.length >= 2 ? history[history.length - 2] : undefined;
  }

  // 创建新的信息对象，覆盖开盘前的数据
  const result: IndexInfo = {
    ...currentInfo,
    tradeDate: targetDate,
    lastUpdated: closeTime,
    current: targetPoint.value,
    changePercent: targetPoint.equityReturn || 0,
  };

  // 前收盘价计算
  // 优先从历史数据获取 prevPoint（更精确）
  // 如果 prevPoint 不存在，使用 changePercent 反推计算（fallback）
  if (prevPoint) {
    result.previousClose = prevPoint.value;
  } else {
    // Fallback: 通过 changePercent 反推计算
    // 公式: previousClose = current / (1 + changePercent/100)
    // 注意: changePercent = 0 时计算也有效（previousClose = current, change = 0）
    result.previousClose = result.current / (1 + result.changePercent / 100);
  }
  // 涨跌额计算：统一在 previousClose 确定后计算
  result.change = result.current - result.previousClose;

  return result;
}

export async function fetchSingleIndex(symbol: string, ignoreCache: boolean = false): Promise<MarketIndex | null> {

  // 0. 检查缓存
  const normalizedSymbol = normalizeIndexSymbol(symbol);

  const cached = indexService.getMarketIndex(normalizedSymbol);

  // 默认返回缓存数据（ignoreCache为false时），由后台定时任务负责更新缓存
  // 这样做的好处是：界面始终有数据显示，不会因为API失败而空白
  if (cached && !ignoreCache) {
    return cached;
  }

  // 无缓存 或 ignoreCache为true 时，去API获取新数据并更新缓存
  const ut = 'fa1a66105171779fbdd067425f38a7c2';
  const fields = 'f1,f2,f3,f4,f12,f13,f14,f43,f57,f58,f60,f80,f169,f170,f124';
  const secid = normalizeIndexSymbol(symbol);

  // push2delay.eastmoney.com 可直接访问，使用 fetch（不是 JSONP）
  const realtimeUrl = `https://push2delay.eastmoney.com/api/qt/stock/get?ut=${ut}&fltt=2&invt=2&secid=${secid}&fields=${fields}&_=${Date.now()}`;

  // 1. 获取实时数据（队列控制在 fetchMarketIndices 中处理）
  let currentInfo: IndexInfo | null = null;
  try {
    // 使用 fetchJson 直接获取（push2delay 返回普通 JSON）
    const response: any = await fetchJson(realtimeUrl);
    const item = response?.data;

    if (item) {
      // 解析 f80 字段获取交易时段信息
      // f80 格式: [{"b":202605052130,"e":202605060400}]
      // 可能包含多个时段（如 A股有上午和下午两个时段）
      const tradingPeriods = parseF80TradingPeriods(item.f80);

      // 计算当前交易时段的开始时间戳
      const tradingPeriodBegin = extractTradingPeriodBeginTimestamp(item.f80);

      // 时间戳处理：
      // 1. 如果 f124 有效（非0），使用 f124（API 提供的实时更新时间）
      // 2. 如果 f124 无效：
      //    - 当前时间在交易时间段内：tradeDate=当前日期，lastUpdated=当前时间
      //    - 当前时间不在交易时间段内（开盘前）：需要从历史数据获取上一个交易日信息
      //    - 当前时间不在交易时间段内（收盘后）：tradeDate=收盘日期，lastUpdated=收盘时间
      const pad = (n: number) => n.toString().padStart(2, '0');
      let lastUpdated: string;
      let tradeDate: string | undefined;
      let isBeforeOpen = false; // 临时标志：是否在开盘前
      let lastPeriodCloseTime = ''; // 临时变量：最后一个时段的收盘时间

      if (item.f124 && item.f124 > 0) {
        const timestamp = new Date(item.f124 * 1000);
        lastUpdated = `${pad(timestamp.getHours())}:${pad(timestamp.getMinutes())}:${pad(timestamp.getSeconds())}`;
        tradeDate = `${timestamp.getFullYear()}-${pad(timestamp.getMonth() + 1)}-${pad(timestamp.getDate())}`;

      } else if (tradingPeriods.length > 0) {
        // 判断当前时间是否在开盘前
        const now = new Date();
        const nowTimeNum = now.getHours() * 100 + now.getMinutes();
        const currentDate = formatDateISO(now);
        const firstPeriodBegin = tradingPeriods[0].beginHHMM;

        // 如果当前日期等于第一个时段的开盘日期，且当前时间早于开盘时间
        // 说明是开盘前，computeTradingDateAndTime 会返回当天的收盘时间（未来的时间）
        // 需要在获取历史数据后，用上一个交易日的信息覆盖
        isBeforeOpen = currentDate === tradingPeriods[0].beginDate && nowTimeNum < firstPeriodBegin;

        const result = computeTradingDateAndTime(tradingPeriods);
        tradeDate = result.tradeDate;
        lastUpdated = result.lastUpdated;

        // 从 tradingPeriods 获取收盘时间（最后一个时段的收盘时间）
        if (isBeforeOpen && tradingPeriods.length > 0) {
          const lastPeriodEndHHMM = tradingPeriods[tradingPeriods.length - 1].endHHMM;
          lastPeriodCloseTime = formatHHMM(lastPeriodEndHHMM);
        }

      } else {
        // 没有 f80 数据，使用 computeTradingDateAndTime 作为 fallback（空数组）
        const result = computeTradingDateAndTime([]);
        tradeDate = result.tradeDate;
        lastUpdated = result.lastUpdated;
      }

      currentInfo = {
        symbol: secid,
        name: item.f14 || item.f58 || "指数",
        current: parseFloat(item.f43) || 0,
        change: parseFloat(item.f169) || 0,
        changePercent: parseFloat(item.f170) || 0,
        lastUpdated,
        tradeDate,
        previousClose: parseFloat(item.f60) || undefined,
        volume: 0,
        amount: 0,
        tradingPeriodBegin: tradingPeriodBegin ?? undefined,
      };

      // 存储开盘前标志和收盘时间到临时变量（后续在获取历史数据后处理）
      (currentInfo as any).__isBeforeOpen = isBeforeOpen;
      (currentInfo as any).__lastPeriodCloseTime = lastPeriodCloseTime;
    }
  } catch (e) {}

  // 2. 从历史数据获取成交量和成交额，并在开盘前时覆盖实时数据
  // 如果API调用失败（currentInfo为null），不写入任何缓存，直接返回null
  if (currentInfo) {
    try {
      const history = await fetchIndexHistory(symbol);
      if (history && history.length > 0) {
        const lastPoint = history[history.length - 1];
        const lastPointDate = toLocalDateKey(lastPoint.date);

        // 开盘前数据覆盖：使用历史数据的上一个交易日信息
        const closeTime = (currentInfo as any).__lastPeriodCloseTime || '15:00:00';
        currentInfo = applyBeforeOpenDataOverride(currentInfo, history, closeTime);

        // 只有当历史数据最后一条的日期 == 当前交易日时，才使用其 volume/amount
        // 否则当日应该没有历史数据，volume/amount 应该为 0
        const tradeDateKey = currentInfo.tradeDate || '';
        const useHistoryVolume = lastPointDate === tradeDateKey;

        const info: IndexInfo = {
          ...currentInfo,
          volume: useHistoryVolume ? (lastPoint.volume || 0) : 0,
          amount: useHistoryVolume ? (lastPoint.amount || 0) : 0,
        };

        // 更新 indexService
        indexService.updateRealtimeData(normalizedSymbol, info);
        indexService.updateHistory(normalizedSymbol, history);
        return indexService.getMarketIndex(normalizedSymbol);
      }
    } catch (e) {}
  }

  // API失败时，直接返回null，不写入任何缓存
  // 这样界面会显示已有的旧缓存（正确的名称）
  return cached;
}

export async function fetchMarketIndices(symbols: string[], ignoreCache: boolean = false, onProgress?: () => void): Promise<JobResult<MarketIndex[]>> {
  if (symbols.length === 0) return { success: true, data: [] };

  const results: MarketIndex[] = [];
  const errors: string[] = [];

  for (const sym of symbols) {
    try {
      const res = await indexQueue.add(() => fetchSingleIndex(sym, ignoreCache));
      if (res) {
        results.push(res);
      } else {
        errors.push(`${sym}: API返回空数据`);
      }
    } catch (e) {
      errors.push(`${sym}: ${(e as Error).message || '未知错误'}`);
    }
    // 每个指数完成后调用进度回调
    if (onProgress) onProgress();
  }

  const successCount = results.length;
  const failCount = errors.length;

  // 如果全部失败
  if (successCount === 0) {
    return { success: false, message: `${failCount} 只指数更新失败` };
  }

  // 部分失败：返回 success: false
  if (failCount > 0) {
    return { success: false, data: results, message: `成功更新 ${successCount} 只指数，${failCount} 只更新失败` };
  }

  return { success: true, data: results, message: `成功更新 ${successCount} 只指数` };
}

export async function fetchFundHistory(symbol: string): Promise<HistoricalPoint[]> {
  const code = symbol.padStart(6, '0');

  // 1. Check cacheService (in-memory + pre-loaded from localStorage)
  // 数据已在存储时规范化，直接返回即可
  const cached = marketFundService.getHistory(code);
  if (cached && cached.length > 0) {
    return cached;
  }

  // 2. Fallback to module-level in-memory cache (populated in the same session before cacheService existed)
  // 数据已在存储时规范化，直接返回即可
  if (historyCache[code] && historyCache[code].length > 0) {
    return historyCache[code];
  }

  // 3. Fetch from network - 通过队列执行，避免并发竞争
  return await historyLoadQueue.add(() => loadHistoryFromPingzhongDataWithRetry(code));
}

/**
 * 强制从网络重新获取历史净值，忽略所有缓存。
 * 用于定时刷新（每20分钟）和手动刷新中的历史净值更新。
 * 获取完成后自动写入 cacheService（同时更新 localStorage）。
 *
 * 注意：此函数不使用队列，由调用者决定是否需要队列控制。
 * - forceFetchFundHistories 已使用队列，调用此函数无需额外队列
 * - 单独调用时应使用 fetchFundHistory（带队列）
 */
export async function forceFetchFundHistory(symbol: string): Promise<HistoricalPoint[]> {
  const code = symbol.padStart(6, '0');
  // 直接执行，队列控制由调用者（forceFetchFundHistories 或 fetchFundHistory）负责
  return await loadHistoryFromPingzhongDataWithRetry(code);
}

/**
 * 批量强制获取基金历史数据
 * - 成功获取的数据会自动写入缓存
 * - 支持部分失败：成功的数据写入缓存，失败的会在 message 中报告
 * - 返回 JobResult<void>，不返回具体数据（数据已在缓存中）
 */
export async function forceFetchFundHistories(symbols: string[], onProgress?: () => void): Promise<JobResult<void>> {
  if (symbols.length === 0) return { success: true, data: undefined };

  const errors: string[] = [];
  let successCount = 0;

  for (const sym of symbols) {
    try {
      const res = await historyLoadQueue.add(() => forceFetchFundHistory(sym));
      if (!res || res.length === 0) {
        errors.push(`${sym}: API返回空数据`);
      } else {
        successCount++;
      }
    } catch (e) {
      errors.push(`${sym}: ${(e as Error).message || '未知错误'}`);
    }
    // 每个基金历史完成后调用进度回调
    if (onProgress) onProgress();
  }

  // 批量更新完成后，一次性存储到 localStorage
  marketFundService.saveAllToStorage();

  const failCount = errors.length;

  // 全部失败
  if (failCount === symbols.length) {
    return { success: false, message: `${failCount} 只基金历史净值更新失败` };
  }

  // 部分失败：返回 success: false
  if (failCount > 0) {
    return { success: false, data: undefined, message: `成功更新 ${successCount} 只基金历史净值，${failCount} 只更新失败` };
  }

  return { success: true, data: undefined, message: `成功更新 ${successCount} 只基金历史净值` };
}

/**
 * 将东方财富 secid 格式转换为腾讯证券指数代码格式
 * @param secid 东方财富格式如 '1.000001', '0.399001', '100.HSI'
 * @returns 腾讯格式如 'sh000001', 'sz399001', 'hkHSI'；不支持返回 null
 */
export function secidToTencentSymbol(secid: string): string | null {
  const parts = secid.split('.');
  if (parts.length !== 2) return null;

  const [marketCode, indexCode] = parts;

  // A股: 上交所(1) -> sh, 深交所(0) -> sz
  if (marketCode === '1') return `sh${indexCode}`;
  if (marketCode === '0') return `sz${indexCode}`;

  // 港股/美股特殊处理 - 恒生系列指数
  // 市场代码 100 和 124 都用于港股指数
  if (secid === '100.HSI' || secid === '124.HSI') return 'hkHSI';
  if (secid === '100.HSTECH' || secid === '124.HSTECH') return 'hkHSTECH';

  // 美股指数
  if (secid === '100.NDX' || secid === '100.NDX100') return 'usNDX';
  if (secid === '100.SPX') return 'usSPX';

  // 其他港股: 100.XXX 或 124.XXX -> hkXXX
  if (marketCode === '100' || marketCode === '124') return `hk${indexCode}`;

  // 商品期货(市场代码101) - 腾讯API暂不支持
  // 101.GC00Y = 黄金期货, 101.SI00Y = 白银期货
  // 返回 null 表示不支持此数据源

  return null;
}

/**
 * 合并腾讯证券数据与原有历史数据
 *
 * 合并规则：
 * 1. 对于每一天的数据，比较收盘价和成交量
 *    - 如果收盘价和成交量都相同，保留原有数据（包括成交额、涨跌幅等）
 *    - 否则，使用腾讯数据（成交额设为0，涨跌幅从收盘价计算）
 * 2. 如果腾讯数据包含原有数据中缺失的日期，添加该日期数据（成交额=0，涨跌幅计算）
 *
 * @param existingHistory 原有历史数据（可能包含成交额信息）
 * @param tencentHistory 腾讯API返回的历史数据
 * @returns 合并后的历史数据
 */
export function mergeHistoryWithTencentData(
  existingHistory: HistoricalPoint[],
  tencentHistory: HistoricalPoint[]
): HistoricalPoint[] {
  if (!tencentHistory || tencentHistory.length === 0) {
    return existingHistory;
  }
  if (!existingHistory || existingHistory.length === 0) {
    // 原有数据为空，返回腾讯数据（成交额已在fetchIndexHistoryFromTencent中设为0）
    return tencentHistory;
  }

  // 构建原有数据的日期映射（用日期字符串作为key）
  const existingMap = new Map<string, HistoricalPoint>();
  for (const point of existingHistory) {
    const dateKey = toLocalDateKey(point.date);
    existingMap.set(dateKey, point);
  }

  // 合并结果
  const merged: HistoricalPoint[] = [];

  for (let i = 0; i < tencentHistory.length; i++) {
    const tencentPoint = tencentHistory[i];
    const dateKey = toLocalDateKey(tencentPoint.date);
    const existingPoint = existingMap.get(dateKey);

    if (!existingPoint) {
      // 原有数据中不存在该日期，直接添加腾讯数据
      merged.push(tencentPoint);
    } else {
      // 比较收盘价和成交量
      const valueMatch = Math.abs(existingPoint.value - tencentPoint.value) < 0.01; // 允许小的浮点误差
      const volumeMatch = existingPoint.volume === tencentPoint.volume ||
                         (existingPoint.volume === undefined && tencentPoint.volume === 0);

      if (valueMatch && volumeMatch) {
        // 收盘价和成交量都匹配，保留原有数据（包括成交额信息）
        merged.push(existingPoint);
      } else {
        // 数据有更新，使用腾讯数据，成交额设为0
        const mergedPoint: HistoricalPoint = {
          date: tencentPoint.date,
          value: tencentPoint.value,
          equityReturn: tencentPoint.equityReturn,
          volume: tencentPoint.volume || 0,
          amount: 0, // 数据有更新，成交额设为0
        };
        merged.push(mergedPoint);
      }
    }
  }

  return normalizeHistoryPoints(merged);
}

/**
 * 从腾讯证券获取指数历史数据（备用数据源）
 * 腾讯API不支持涨跌幅，需从连续收盘价计算
 * @param secid 东方财富格式指数代码
 * @returns HistoricalPoint 数组，失败返回 null
 */
async function fetchIndexHistoryFromTencent(secid: string): Promise<HistoricalPoint[] | null> {
  const tencentSymbol = secidToTencentSymbol(secid);
  if (!tencentSymbol) return null;

  // 计算日期范围：从今天往前约400天（覆盖365个交易日）
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 400);

  const formatDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const url = `https://proxy.finance.qq.com/ifzqgtimg/appstock/app/fqkline/get?_var=kline_day&param=${tencentSymbol},day,${formatDate(startDate)},${formatDate(endDate)},400,&r=${Math.random()}`;

  try {
    const response = await fetch(url);
    const text = await response.text();

    // 解析 JSON (格式: kline_day={...})
    const jsonStr = text.substring(text.indexOf('{'));
    const data = JSON.parse(jsonStr);

    const dayData = data?.data?.[tencentSymbol]?.day;
    if (!Array.isArray(dayData) || dayData.length === 0) return null;

    // 转换为 HistoricalPoint
    // 字段: [日期, 开盘, 收盘, 最高, 最低, 成交量(手)]
    const points: Array<Partial<HistoricalPoint>> = dayData.map((item: string[], index: number) => {
      const close = parseFloat(item[2]) || 0;
      const prevClose = index > 0 ? (parseFloat(dayData[index - 1][2]) || 0) : (parseFloat(item[1]) || 0);
      const equityReturn = prevClose > 0 ? ((close - prevClose) / prevClose) * 100 : 0;

      return {
        date: Date.parse(item[0]),  // 将 YYYY-MM-DD 转为时间戳
        value: close,
        equityReturn,
        volume: parseFloat(item[5]) || 0,  // 腾讯API字段5是成交量(手)
        amount: 0,  // 腾讯API不返回成交额，设为0
      };
    });

    const normalized = normalizeHistoryPoints(points);
    return normalized;
  } catch (e) {
    return null;
  }
}

// Index history: fetch Kline data for indices via push2his and convert to HistoricalPoint[]
export async function fetchIndexHistory(symbol: string, ignoreCache: boolean = false): Promise<HistoricalPoint[]> {

   // 1. 先检查缓存
   const marketIndex = indexService.getMarketIndex(symbol);
   if (marketIndex && marketIndex.history.length > 0 && !ignoreCache) {
     return marketIndex.history;
   }

   let secid = symbol;
   if (secid === 'NDX') secid = '100.NDX';
   if (secid === 'SPX') secid = '100.SPX';
   if (secid === 'HSI') secid = '100.HSI';
   // fields2: date(f51), close price(f53), change percent(f59), volume(f56), amount(f57)
   // request last 365 points instead of 90 (expanded window)
   const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f53,f56,f57,f59&klt=101&fqt=1&end=20500101&lmt=365`;
   try {
     // 使用 JSONP（队列控制在外层 fetchIndexHistories/fetchMarketIndices 中进行）
     const response: any = await jsonp(url, 'cb');
     if (response?.data?.klines) {
      // Map raw klines into partial points and normalize (ensure timestamps in ms, sort, dedupe)
      // kline format: 日期,收盘价,成交量,成交额,涨跌幅
      const raw: Array<Partial<HistoricalPoint>> = response.data.klines.map((line: string) => {
        const parts = line.split(',');
        // parts[0] may be a date string like '2026-02-20' or a numeric timestamp (s|ms)
        // normalizeHistoryPoints will parse it; cast via unknown to satisfy TS here.
        return ({
          date: parts[0],
          value: parseFloat(parts[1]) || 0,
          volume: parseFloat(parts[2]) || 0,
          amount: parseFloat(parts[3]) || 0,
          equityReturn: parseFloat(parts[4]) || 0
        } as unknown) as Partial<HistoricalPoint>;
      });
      const normalized = normalizeHistoryPoints(raw as Array<Partial<HistoricalPoint>>);
      // 写入 indexService（指数历史数据）
      indexService.updateHistory(symbol, normalized);
      return normalized;
     }
   } catch (e) {
     // 尝试腾讯备用数据源
     const tencentResult = await fetchIndexHistoryFromTencent(secid);
     if (tencentResult && tencentResult.length > 0) {
       // 获取原有历史数据并合并
       const existingHistory = marketIndex?.history || [];
       const mergedResult = mergeHistoryWithTencentData(existingHistory, tencentResult);
       indexService.updateHistory(symbol, mergedResult);
       return mergedResult;
     }
     // 所有尝试都失败，返回空数组（不输出日志）
   }
   return [];
 }

/**
 * 批量获取指数历史数据
 * - 成功获取的数据会自动写入缓存
 * - 支持部分失败：成功的数据写入缓存，失败的会在 message 中报告
 * - 返回 JobResult<void>，不返回具体数据（数据已在缓存中）
 */
export async function fetchIndexHistories(symbols: string[], ignoreCache: boolean = false, onProgress?: () => void): Promise<JobResult<void>> {
  if (symbols.length === 0) return { success: true, data: undefined };


  const errors: string[] = [];
  let successCount = 0;

  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];
    try {
      const res = await indexQueue.add(() => fetchIndexHistory(sym, ignoreCache));
      if (!res || res.length === 0) {
        errors.push(`${sym}: API返回空数据`);
      } else {
        successCount++;
      }
    } catch (e) {
      errors.push(`${sym}: ${(e as Error).message || '未知错误'}`);
    }
    // 每个指数历史完成后调用进度回调
    if (onProgress) onProgress();
  }

  // 批量更新完成后，一次性存储到 localStorage
  indexService.saveAllToStorage();

  const failCount = errors.length;

  // 全部失败
  if (failCount === symbols.length) {
    return { success: false, message: `${failCount} 只指数历史更新失败` };
  }

  // 部分失败：返回 success: false
  if (failCount > 0) {
    return { success: false, data: undefined, message: `成功更新 ${successCount} 只指数历史，${failCount} 只更新失败` };
  }

  return { success: true, data: undefined, message: `成功更新 ${successCount} 只指数历史` };
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
 * 计算整体盈亏：对一组基金按日期对各基金的累计盈亏求和，返回按日的累计与当日盈利，以及按基金的区间盈亏对比
 * - 如果没有提供 symbols，则会从 marketFundService 中读取
 * - 只有持仓起始日期位于用户选择范围内的基金会被纳入计算（若该配置不存在，则以历史净值最早日期为起始）
 */
export async function computeOverallProfit(opts: { symbols?: string[]; fromDate?: string | null; toDate?: string | null }): Promise<OverallProfitSummary> {
  const { symbols, fromDate, toDate } = opts || {};

  const todayLocal = toLocalDateKey(new Date());

 // if no symbols provided, try read portfolio from marketFundService
  let syms: string[] = [];
  if (Array.isArray(symbols) && symbols.length > 0) syms = symbols;
  else {
    try {
      syms = marketFundService.getAllFundSymbols();
    } catch (e) { syms = []; }
  }

  const includedFundTimelines: Record<string, ProfitPoint[]> = {};
  const perFundRows: OverallFundRow[] = [];
  const fundStartDates: Record<string, string> = {}; // 收集每个基金的建仓日期
  const fundStartDateCumProfits: Record<string, number> = {}; // 收集每个基金建仓日期对应的累计盈利值

  for (const sym of syms) {
    try {
      const history = await _deps.fetchFundHistory(sym);
      if (!history || history.length === 0) continue;

      // trades from local storage helper
      const trades = getTradesForSymbol(sym) || [];

      // read stored position config from marketFundService
      const position = marketFundService.getPosition(sym);
      let startDateFromStorage: string | null = position?.startDate || null;
      let initialPosition = position?.initialPosition || 0;
      let initialPrice: number | null = position?.initialPrice ?? null;

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
            const existingPos = marketFundService.getPosition(sym);
            if (existingPos) {
              marketFundService.updatePosition(sym, { ...existingPos, initialPrice: resolved });
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

      // Desired end date: user-specified toDate, otherwise today's date (local YYYY-MM-DD).
      const desiredEndDate = toDate ?? todayLocal;

      // 获取估值数据（只从缓存中获取，不进行网络请求）
      // 估值数据应由后台任务定期更新并存储在 localStorage 中
      let fd: ValuationData | null = null;
      try {
        fd = marketFundService.getValuation(sym.padStart(6, '0'))
            ?? marketFundService.getValuation(sym)
            ?? null;
      } catch (e) {
        // ignore errors
      }

      // 使用公共函数准备历史数据（与 ProfitModal 一致）
      const preparedHistory = prepareHistoryForProfitCalculation({
        history,
        targetDate: desiredEndDate,
        todayDate: todayLocal,
        currentPrice: fd?.currentPrice,
        realtimeDate: fd?.realtimeDate,
        previousPrice: fd?.previousPrice,
        netWorthDate: fd?.netWorthDate,
      });

      const timeline = computeProfitTimeline({ history: preparedHistory, trades, initialPosition: initialPosition || 0, initialPrice: initialPrice ?? null, fromDate: fundStartDate, toDate: toDate ?? null });

     if (!timeline || timeline.length === 0) continue;

      includedFundTimelines[sym] = timeline;
      // 收集建仓日期及其对应的累计盈利值（timeline 从 fundStartDate 开始，所以第一个点就是建仓日期）
      fundStartDates[sym] = fundStartDate;
      fundStartDateCumProfits[sym] = timeline[0].cumulativeProfit || 0;

      // 累计盈利直接使用 timeline 的计算结果
      // 如果 fromDate < fundStartDate，使用 fundStartDate 作为起始点
      const effectiveFrom = fromDate ?? timeline[0].date;
      let profitFrom: number;
      if (fromDate && fromDate < fundStartDate) {
        // fromDate 早于建仓日期，使用建仓日期的累计盈利
        profitFrom = timeline[0].cumulativeProfit || 0;
      } else {
        // fromDate >= 建仓日期或未指定，使用 timeline 第一个点的累计盈利
        const startPoint = timeline.find(p => p.date === effectiveFrom);
        profitFrom = startPoint ? (startPoint.cumulativeProfit || 0) : (timeline[0].cumulativeProfit || 0);
      }
      const profitTo = timeline[timeline.length - 1].cumulativeProfit || 0;


      // record whether startDate came from storage and the configured initialPosition
      const hasStoredStartDate = !!startDateFromStorage;
      const fundInfo = marketFundService.getFundInfo(sym);
      const displayName = fundInfo?.ticker.name || undefined;
      perFundRows.push({ symbol: sym, name: displayName, startDate: fundStartDate || null, profitFrom, profitTo, profitDiff: Number((profitTo - profitFrom).toFixed(4)), initialPosition: initialPosition || 0, hasStoredStartDate });
    } catch (e) {
      // skip failing fund
      continue;
    }
  }

  // Build per-fund date->cumulative and date->daily maps, collect all dates.
  const perFundMaps: Record<string, Record<string, number>> = {};
  const perFundDailyMaps: Record<string, Record<string, number>> = {};
  const allDatesSet = new Set<string>();

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
  // 使用 cumMap 直接取值（与单个基金的累计盈利一致）
  // 对于 gap dates（该基金没有数据的日期），使用最近可用的 cumulativeProfit（forward-fill）
  // 不进行 startDate 零基调整（与单个基金的累计盈亏一致）
  const perFundTimelines: Record<string, { date: string; cumulativeProfit: number }[]> = {};
  for (const sym of Object.keys(perFundMaps)) {
    const cumMap = perFundMaps[sym] || {};

    const arr: { date: string; cumulativeProfit: number }[] = [];
    let lastCum = 0;
    let foundFirstData = false;
    const fundStartDate = fundStartDates[sym];
    const startDateCumProfit = fundStartDateCumProfits[sym] || 0;

    for (const d of dates) {
      if (cumMap[d] !== undefined) {
        lastCum = cumMap[d];
        foundFirstData = true;
      } else if (!foundFirstData) {
        if (fundStartDate && d < fundStartDate) {
          lastCum = startDateCumProfit;
        } else {
          lastCum = 0;
        }
      }
      arr.push({ date: d, cumulativeProfit: lastCum });
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

/**
 * 获取历史净值变动提醒
 * 检查最新净值日期与历史数据的关系，决定是否触发历史数据刷新
 * @param symbol 基金代码
 * @param netWorthDate 最新净值日期（字符串格式）
 */
export async function maybeTriggerHistoryRefresh(symbol: string, netWorthDate?: string): Promise<void> {
  try {
    const netDate = (netWorthDate || '').trim();
    if (!netDate || netDate === '---') return;
    const code = symbol.padStart ? symbol.padStart(6, '0') : symbol;
    const cachedHist = marketFundService.getHistory(code);
    let shouldTrigger = false;
    if (!cachedHist || cachedHist.length === 0) shouldTrigger = true;
    else {
      const lastCached = cachedHist[cachedHist.length - 1];
      if (!lastCached) shouldTrigger = true;
      else {
        const lastDateKey = toLocalDateKey(lastCached.date);
        if (netDate > lastDateKey) shouldTrigger = true;
      }
    }
    if (shouldTrigger) {
      // Fire-and-forget via dependency seam so tests can mock the network call
      // 更新完成后保存到 localStorage
      try {
        _deps.forceFetchFundHistory(symbol)
          .then(() => marketFundService.saveAllToStorage())
          .catch(() => {});
      } catch (e) { /* swallow */ }
    }
  } catch (e) {
    // swallow errors to avoid breaking callers
  }
}

/**
 * 解析 K线数据（提取到外部避免每次调用创建闭包）
 * @param klines K线原始数据数组（逗号分隔的字符串）
 * @param previousClose 昨日收盘价，用于计算涨跌幅
 * @returns KlinePoint 数组
 */
function parseKlines(klines: string[], previousClose?: number): KlinePoint[] {
  return klines.map((line: string) => {
    const parts = line.split(',');

    const open = parseFloat(parts[1]) || 0;
    const close = parseFloat(parts[2]) || 0;
    const high = parseFloat(parts[3]) || 0;
    const low = parseFloat(parts[4]) || 0;
    const volume = parseFloat(parts[5]) || 0;
    const amount = parseFloat(parts[6]) || 0;

    let timestamp: number;
    const timeStr = parts[0];
    if (timeStr) {
      const parsed = Date.parse(timeStr.replace(' ', 'T'));
      timestamp = Number.isNaN(parsed) ? Date.now() : parsed;
    } else {
      timestamp = Date.now();
    }

    let changePercent = 0;
    if (previousClose && previousClose > 0) {
      changePercent = (close - previousClose) / previousClose * 100;
    }

    return {
      timestamp,
      open,
      close,
      high,
      low,
      volume,
      amount,
      changePercent,
    };
  });
}

/**
 * 获取指数分时K线数据（使用fetch方式，因为JSONP可能被限制）
 * @param symbol 指数代码，格式如 '1.000001'
 * @param klt K线周期：5/15/30/60
 * @param lmt 返回条数限制
 * @param previousClose 昨日收盘价，用于计算涨跌幅
 * @returns KlinePoint 数组
 */
export async function fetchIndexIntradayKline(
  symbol: string,
  klt: number,
  lmt: number,
  previousClose?: number
): Promise<KlinePoint[]> {
  const fields1 = 'f1,f2,f3,f4,f5,f6';
  const fields2 = 'f51,f52,f53,f54,f55,f56,f57,f58,f59';
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${symbol}&fields1=${fields1}&fields2=${fields2}&klt=${klt}&fqt=1&end=20500101&lmt=${lmt}`;

  // 方式1: JSONP（主要方式）
  try {
    const response: any = await jsonp(url, 'cb');
    if (response?.data?.klines && response.data.klines.length > 0) {
      return parseKlines(response.data.klines, previousClose);
    }
  } catch (jsonpError) {
    // JSONP 失败，尝试代理服务作为 fallback
    try {
      const result = await fetchWithProxy(url, {
        preferFormat: 'raw',
        timeout: 10000,
      });

      let data: any;
      const text = result.content;
      if (text.startsWith('(') || text.includes('(')) {
        const jsonMatch = text.match(/\{.*\}/);
        if (jsonMatch) {
          data = JSON.parse(jsonMatch[0]);
        }
      } else {
        data = JSON.parse(text);
      }

      if (data?.data?.klines && data.data.klines.length > 0) {
        return parseKlines(data.data.klines, previousClose);
      }
    } catch (proxyError) {
      // 两种方式都失败
      console.error('fetchIndexIntradayKline: JSONP and proxy both failed');
    }
  }

  return [];
}

