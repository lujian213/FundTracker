/**
 * services/indexService.ts
 *
 * 指数数据管理服务
 * - 管理指数配置（完整MarketIndex：info + intraday + history）
 * - 提供运行时 MarketIndex（包含历史数据和日内数据）
 * - 处理数据迁移
 */

import { IndexInfo, MarketIndex, HistoricalPoint, IntradayPoint } from '../types';
import { STORAGE_KEYS, OLD_STORAGE_KEYS } from './storageKeys';
import { floorToMinute, isSameLocalDay, filterTodayIntraday, dedupeByMinute } from '../utils/dateTimeUtils';
import { compressConsecutiveSameValues } from '../utils/intradayCompression';
import { toLocalDateKey } from '../utils/priceResolver';

// ═══════════════════════════════════════════════════════════════════════════════
// 内存缓存
// ═══════════════════════════════════════════════════════════════════════════════

// 统一指数缓存：Map<string, MarketIndex>（含info、intraday、history）
const indices = new Map<string, MarketIndex>();

// 默认指数配置（统一列表）
export const DEFAULT_INDICES: MarketIndex[] = [
  { info: { symbol: '1.000001', name: '上证指数', current: 0, change: 0, changePercent: 0, lastUpdated: '' }, intraday: [], history: [] },
  { info: { symbol: '0.399001', name: '深证成指', current: 0, change: 0, changePercent: 0, lastUpdated: '' }, intraday: [], history: [] },
  { info: { symbol: '0.399006', name: '创业板指', current: 0, change: 0, changePercent: 0, lastUpdated: '' }, intraday: [], history: [] },
  { info: { symbol: '100.HSI', name: '恒生指数', current: 0, change: 0, changePercent: 0, lastUpdated: '' }, intraday: [], history: [] },
  { info: { symbol: '100.NDX', name: '纳斯达克100', current: 0, change: 0, changePercent: 0, lastUpdated: '' }, intraday: [], history: [] },
  { info: { symbol: '100.SPX', name: '标普500', current: 0, change: 0, changePercent: 0, lastUpdated: '' }, intraday: [], history: [] },
];

export const DEFAULT_INDEX_SYMBOLS = DEFAULT_INDICES.map(m => m.info.symbol);

// 判断是否为国内指数（A股 + 港股）
export const isDomesticIndex = (symbol: string): boolean => {
  // A股指数：1.xxxxxx 或 0.xxxxxx
  if (symbol.startsWith('1.') || symbol.startsWith('0.')) return true;
  // 港股指数：恒生指数 HSI、恒生科技指数 HSTECH
  if (symbol === '100.HSI' || symbol === '124.HSTECH') return true;
  return false;
};

// 判断是否为全球指数（美股 + 商品期货等）
export const isGlobalIndex = (symbol: string): boolean => !isDomesticIndex(symbol);

// 指数名称映射（用于迁移时填充名称）
export const INDEX_NAME_MAP: Record<string, string> = {
  '1.000001': '上证指数',
  '0.399001': '深证成指',
  '0.399006': '创业板指',
  '0.399005': '中小板指',
  '100.NDX': '纳斯达克100',
  '100.SPX': '标普500',
  '100.HSI': '恒生指数',
  '124.HSTECH': '恒生科技',
};

// ═══════════════════════════════════════════════════════════════════════════════
// 初始化
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 从 localStorage 加载数据并初始化缓存
 */
function init(): void {
  // 先检查是否需要迁移
  if (!localStorage.getItem(STORAGE_KEYS.INDEX_DATA)) {
    // 尝试从旧 key 迁移
    migrateFromOldKeys();
  }

  // 从新 key 加载完整 MarketIndex 数据
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.INDEX_DATA);
    if (raw) {
      const marketIndices: MarketIndex[] = JSON.parse(raw);
      marketIndices.forEach(m => {
        // 确保每个 MarketIndex 都有 intraday 和 history 字段
        indices.set(m.info.symbol, {
          info: m.info,
          intraday: m.intraday || [],
          history: m.history || [],
        });
      });
    }
  } catch { /* ignore */ }

  // 如果没有数据，使用默认值
  if (indices.size === 0) {
    DEFAULT_INDICES.forEach(m => {
      indices.set(m.info.symbol, { info: m.info, intraday: [], history: [] });
    });
    saveToStorage();
  }
}

/**
 * 从旧 key 迁移数据到新 key
 * 合并 IndexInfo + history + intraday 为完整 MarketIndex
 * 保持原有指数顺序
 */
function migrateFromOldKeys(): void {
  const OLD_KEYS = OLD_STORAGE_KEYS.INDEX;
  // 使用数组存储 IndexInfo，保持原有顺序
  let indexInfoList: IndexInfo[] = [];

  // 1. 从 fund_all_indices_info 读取 IndexInfo（Phase 1 的迁移结果）
  try {
    const unifiedRaw = localStorage.getItem(OLD_KEYS.INDEX_INFO_UNIFIED);
    if (unifiedRaw) {
      indexInfoList = JSON.parse(unifiedRaw);
    }
  } catch { /* ignore */ }

  // 2. 如果没有统一的 IndexInfo，尝试从分开的两个key合并（更早的旧格式）
  if (indexInfoList.length === 0) {
    try {
      const domesticRaw = localStorage.getItem(OLD_KEYS.INDEX_INFO_DOMESTIC);
      const globalRaw = localStorage.getItem(OLD_KEYS.INDEX_INFO_GLOBAL);
      if (domesticRaw) {
        const domesticInfos: IndexInfo[] = JSON.parse(domesticRaw);
        indexInfoList = indexInfoList.concat(domesticInfos);
      }
      if (globalRaw) {
        const globalInfos: IndexInfo[] = JSON.parse(globalRaw);
        indexInfoList = indexInfoList.concat(globalInfos);
      }
    } catch { /* ignore */ }
  }

  // 3. 如果还是没有数据，尝试从更早的旧格式迁移
  if (indexInfoList.length === 0) {
    indexInfoList = migrateFromVeryOldFormat();
  }

  // 4. 构建 MarketIndex，合并 history 和 intraday，保持顺序
  const marketIndices: MarketIndex[] = indexInfoList.map(info => {
    // 读取历史数据
    let history: HistoricalPoint[] = [];
    try {
      const historyRaw = localStorage.getItem(`${OLD_KEYS.HISTORY_PREFIX}${info.symbol}`);
      if (historyRaw) {
        history = JSON.parse(historyRaw);
      }
    } catch { /* ignore */ }

    // 读取日内数据
    let intraday: IntradayPoint[] = [];
    try {
      const intradayRaw = localStorage.getItem(`${OLD_KEYS.INTRADAY_PREFIX}${info.symbol}`);
      if (intradayRaw) {
        const parsed: IntradayPoint[] = JSON.parse(intradayRaw);
        // 只保留当天的日内数据
        intraday = filterTodayIntraday(parsed);
      }
    } catch { /* ignore */ }

    return { info, intraday, history };
  });

  // 5. 如果没有数据，使用默认值
  if (marketIndices.length === 0) {
    DEFAULT_INDICES.forEach(m => {
      marketIndices.push({ info: m.info, intraday: [], history: [] });
    });
  }

  // 6. 保存到新 key
  try {
    localStorage.setItem(STORAGE_KEYS.INDEX_DATA, JSON.stringify(marketIndices));
  } catch (e) {
    console.error('Error during index migration:', e);
  }
}

/**
 * 从非常旧的格式迁移（fund_indices_config + fund_market_indices_cache 等）
 * 返回保持原有顺序的 IndexInfo 数组
 */
function migrateFromVeryOldFormat(): IndexInfo[] {
  const OLD_KEYS = OLD_STORAGE_KEYS.INDEX;

  // 读取旧的配置列表（保持顺序）
  let domesticSymbols: string[] = [];
  let globalSymbols: string[] = [];

  try {
    const raw = localStorage.getItem(OLD_KEYS.INDICES_CONFIG);
    if (raw) domesticSymbols = JSON.parse(raw);
  } catch { /* ignore */ }

  try {
    const raw = localStorage.getItem(OLD_KEYS.GLOBAL_INDICES_CONFIG);
    if (raw) globalSymbols = JSON.parse(raw);
  } catch { /* ignore */ }

  // 保持原有顺序：国内指数 + 全球指数
  const allSymbols = [...domesticSymbols, ...globalSymbols];

  // 读取旧的实时数据
  const dataMap = new Map<string, any>();

  // 从 fund_market_indices_cache
  try {
    const raw = localStorage.getItem(OLD_KEYS.MARKET_INDICES_CACHE);
    if (raw) {
      const items = JSON.parse(raw);
      if (Array.isArray(items)) {
        items.forEach((item: any) => {
          if (item.symbol) dataMap.set(item.symbol, item);
        });
      }
    }
  } catch { /* ignore */ }

  // 从 fund_global_indices_cache
  try {
    const raw = localStorage.getItem(OLD_KEYS.GLOBAL_INDICES_CACHE);
    if (raw) {
      const items = JSON.parse(raw);
      if (Array.isArray(items)) {
        items.forEach((item: any) => {
          if (item.symbol) dataMap.set(item.symbol, item);
        });
      }
    }
  } catch { /* ignore */ }

  // 从 fund_index_market_data
  try {
    const raw = localStorage.getItem(OLD_KEYS.INDEX_MARKET_DATA);
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        Object.entries(obj).forEach(([symbol, data]: [string, any]) => {
          dataMap.set(symbol, data);
        });
      }
    }
  } catch { /* ignore */ }

  // 按 allSymbols 的顺序构建 IndexInfo 数组
  return allSymbols.map(symbol => {
    const data = dataMap.get(symbol);
    return {
      symbol,
      name: data?.name || INDEX_NAME_MAP[symbol] || symbol,
      current: data?.current || 0,
      change: data?.change || 0,
      changePercent: data?.changePercent || 0,
      lastUpdated: data?.lastUpdated || '',
      tradeDate: data?.tradeDate,
      previousClose: data?.previousClose,
      volume: data?.volume,
      amount: data?.amount,
    };
  });
}

// 初始化
init();

// ═══════════════════════════════════════════════════════════════════════════════
// 配置管理
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 获取所有指数配置列表
 */
export function getAllIndexInfos(): IndexInfo[] {
  return Array.from(indices.values()).map(m => m.info);
}

/**
 * 获取所有指数符号列表
 */
export function getAllIndexSymbols(): string[] {
  return Array.from(indices.keys());
}

/**
 * 获取分类后的指数符号（供兼容使用）
 */
export function getIndexSymbolsByCategory(): { domestic: string[]; global: string[] } {
  const all = Array.from(indices.keys());
  return {
    domestic: all.filter(s => isDomesticIndex(s)),
    global: all.filter(s => isGlobalIndex(s)),
  };
}

/**
 * 保存指数配置（保留已有的 intraday 和 history）
 */
export function saveIndexInfo(info: IndexInfo): void {
  const existing = indices.get(info.symbol);
  if (existing) {
    existing.info = info;
  } else {
    indices.set(info.symbol, { info, intraday: [], history: [] });
  }
  saveToStorage();
}

/**
 * 批量保存指数配置（创建新的 MarketIndex，保留已有的 intraday 和 history）
 * 保持传入的 infos 数组顺序
 */
export function saveAllIndexInfos(infos: IndexInfo[]): void {
  // 先保存现有的 intraday 和 history 数据
  const existingData = new Map<string, { intraday: IntradayPoint[]; history: HistoricalPoint[] }>();
  indices.forEach((m, symbol) => {
    existingData.set(symbol, { intraday: m.intraday, history: m.history });
  });

  // 清空 Map
  indices.clear();

  // 按新顺序重新添加
  infos.forEach(info => {
    const existing = existingData.get(info.symbol);
    indices.set(info.symbol, {
      info,
      intraday: existing?.intraday || [],
      history: existing?.history || []
    });
  });

  saveToStorage();
}

/**
 * 删除指数配置
 */
export function removeIndexInfo(symbol: string): void {
  indices.delete(symbol);
  saveToStorage();
}

/**
 * 批量删除指数配置
 */
export function removeIndexInfos(symbols: string[]): void {
  symbols.forEach(symbol => indices.delete(symbol));
  saveToStorage();
}

/**
 * 重置为默认指数配置
 */
export function resetToDefaults(): void {
  indices.clear();
  DEFAULT_INDICES.forEach(m => {
    indices.set(m.info.symbol, { info: m.info, intraday: [], history: [] });
  });
  saveToStorage();
}

/**
 * 保存到 localStorage（保存完整 MarketIndex[]）
 */
function saveToStorage(): void {
  const marketIndices = Array.from(indices.values());
  try {
    localStorage.setItem(STORAGE_KEYS.INDEX_DATA, JSON.stringify(marketIndices));
  } catch (e) {
    console.error('Error saving index data:', e);
  }
}

/**
 * 保存所有数据到 localStorage
 */
export function saveAllToStorage(): void {
  saveToStorage();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 运行时数据访问
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 获取单个指数的完整数据
 */
export function getMarketIndex(symbol: string): MarketIndex | null {
  return indices.get(symbol) || null;
}

/**
 * 获取所有指数的完整数据
 */
export function getAllMarketIndices(): MarketIndex[] {
  return Array.from(indices.values());
}

/**
 * 获取国内指数的完整数据（动态过滤）
 */
export function getDomesticMarketIndices(): MarketIndex[] {
  return Array.from(indices.values()).filter(m => isDomesticIndex(m.info.symbol));
}

/**
 * 获取全球指数的完整数据（动态过滤）
 */
export function getGlobalMarketIndices(): MarketIndex[] {
  return Array.from(indices.values()).filter(m => isGlobalIndex(m.info.symbol));
}

// ═══════════════════════════════════════════════════════════════════════════════
// 数据更新
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 更新指数实时数据（保留已有的 intraday 和 history）
 */
export function updateRealtimeData(symbol: string, data: Partial<IndexInfo>): void {
  const existing = indices.get(symbol);
  if (existing) {
    existing.info = { ...existing.info, ...data };
    saveToStorage();
  } else {
    // 新指数，创建完整记录
    const newInfo: IndexInfo = {
      symbol,
      name: data.name || INDEX_NAME_MAP[symbol] || symbol,
      current: data.current || 0,
      change: data.change || 0,
      changePercent: data.changePercent || 0,
      lastUpdated: data.lastUpdated || '',
      tradeDate: data.tradeDate,
      previousClose: data.previousClose,
      volume: data.volume,
      amount: data.amount,
    };
    indices.set(symbol, { info: newInfo, intraday: [], history: [] });
    saveToStorage();
  }
}

/**
 * 批量更新指数实时数据（保留已有的 intraday 和 history）
 */
export function batchUpdateRealtimeData(indexInfos: IndexInfo[]): void {
  indexInfos.forEach(info => {
    const existing = indices.get(info.symbol);
    if (existing) {
      existing.info = info;
    } else {
      indices.set(info.symbol, { info, intraday: [], history: [] });
    }
  });
  saveToStorage();
}

/**
 * 更新指数历史数据（统一保存到 fund_all_indices_data）
 */
export function updateHistory(symbol: string, history: HistoricalPoint[]): void {
  const existing = indices.get(symbol);
  if (existing) {
    existing.history = history;
  } else {
    // 创建新记录（使用默认 info）
    const newInfo: IndexInfo = {
      symbol,
      name: INDEX_NAME_MAP[symbol] || symbol,
      current: 0,
      change: 0,
      changePercent: 0,
      lastUpdated: '',
    };
    indices.set(symbol, { info: newInfo, intraday: [], history });
  }
  saveToStorage();
}

/**
 * 获取指数日内数据
 */
export function getIntraday(symbol: string): IntradayPoint[] {
  const existing = indices.get(symbol);
  return existing?.intraday || [];
}

/**
 * 更新指数日内数据（统一保存到 fund_all_indices_data）
 */
export function updateIntraday(symbol: string, points: IntradayPoint[]): void {
  // 只保留当天的数据
  const todayPoints = filterTodayIntraday(points);
  // 同一分钟内去重，保留最后一个
  const dedupedPoints = dedupeByMinute(todayPoints);
  // 压缩连续相同值
  const compressedPoints = compressConsecutiveSameValues(dedupedPoints);
  const existing = indices.get(symbol);
  if (existing) {
    existing.intraday = compressedPoints;
  } else {
    // 创建新记录（使用默认 info）
    const newInfo: IndexInfo = {
      symbol,
      name: INDEX_NAME_MAP[symbol] || symbol,
      current: 0,
      change: 0,
      changePercent: 0,
      lastUpdated: '',
    };
    indices.set(symbol, { info: newInfo, intraday: compressedPoints, history: [] });
  }
  saveToStorage();
}


/**
 * 添加单个日内数据点（用于实时更新）
 */
export function appendIntradayPoint(
  symbol: string,
  value: number,
  equityReturn: number,
  lastUpdated?: string | number,
  tradeDate?: string
): void {
  // DEBUG_START: 2026-04-13 调试appendIntradayPoint入参
  console.log('[DEBUG] appendIntradayPoint 入参:', {
    symbol,
    value,
    lastUpdated,
    tradeDate,
    currentTime: new Date().toLocaleTimeString(),
    todayStr: toLocalDateKey(new Date()),
  });
  // DEBUG_END

  // 检查 tradeDate：如果不是今天，不添加日内点
  if (tradeDate) {
    const todayStr = toLocalDateKey(new Date());
    // DEBUG_START: 2026-04-13 tradeDate检查结果
    console.log('[DEBUG] tradeDate检查:', {
      tradeDate,
      todayStr,
      result: tradeDate !== todayStr ? 'REJECT (直接return)' : 'PASS (继续执行)',
    });
    // DEBUG_END
    if (tradeDate !== todayStr) {
      return;
    }
  }

  // 构建 timestamp
  let ts = Date.now();
  // DEBUG_START: 2026-04-13 时间戳构建过程
  console.log('[DEBUG] 时间戳构建:', {
    lastUpdated_type: typeof lastUpdated,
    lastUpdated_value: lastUpdated,
    isHHmmss: typeof lastUpdated === 'string' && /^\d{1,2}:\d{2}:\d{2}$/.test(lastUpdated),
    default_ts: new Date(ts).toLocaleString(),
  });
  // DEBUG_END
  if (lastUpdated) {
    // 如果 lastUpdated 只包含时间格式 (HH:mm:ss)，需要结合 tradeDate 或使用当前日期
    if (typeof lastUpdated === 'string' && /^\d{1,2}:\d{2}:\d{2}$/.test(lastUpdated)) {
      let dateStr = '';
      if (tradeDate) {
        dateStr = `${tradeDate} ${lastUpdated}`;
      } else {
        dateStr = `${toLocalDateKey(new Date())} ${lastUpdated}`;
      }
      // DEBUG_START: 2026-04-13 HH:mm:ss格式解析
      console.log('[DEBUG] HH:mm:ss解析:', {
        dateStr,
        parsedTime: Date.parse(dateStr) ? new Date(Date.parse(dateStr)).toLocaleString() : '解析失败',
      });
      // DEBUG_END
      const parsed = Date.parse(dateStr);
      if (!Number.isNaN(parsed)) ts = parsed;
    } else {
      const parsed = typeof lastUpdated === 'number' ? lastUpdated : Date.parse(String(lastUpdated));
      if (!Number.isNaN(parsed)) ts = parsed;
    }
  }
  const minuteTs = floorToMinute(ts);
  // DEBUG_START: 2026-04-13 最终minuteTs
  console.log('[DEBUG] 最终minuteTs:', new Date(minuteTs).toLocaleString());
  // DEBUG_END

  const existing = indices.get(symbol);
  if (!existing) return;

  // DEBUG_START: 2026-04-13 过滤前数据
  console.log('[DEBUG] 过滤前数据:', {
    symbol,
    count: existing.intraday.length,
    data: existing.intraday.slice(-5).map(p => ({
      time: new Date(p.timestamp).toLocaleTimeString(),
      value: p.value,
    })),
  });
  // DEBUG_END

  // 过滤掉非当天数据和比新时间戳更晚的脏数据
  let intraday = existing.intraday.filter(p => isSameLocalDay(p.timestamp) && p.timestamp <= minuteTs);

  // DEBUG_START: 2026-04-13 过滤后数据
  console.log('[DEBUG] 过滤后数据:', {
    symbol,
    count: intraday.length,
    minuteTs: new Date(minuteTs).toLocaleTimeString(),
    filterCondition: `isSameLocalDay && timestamp <= ${minuteTs}`,
    cleared: existing.intraday.length > 0 && intraday.length === 0 ? '*** 数据被清空！***' : '数据保留',
  });
  // DEBUG_END

  // 检查是否与上一个点值相同（跳过连续相同值）
  const last = intraday[intraday.length - 1];
  if (last && Object.is(last.value, value)) {
    // DEBUG_START: 2026-04-13 值相同跳过
    console.log('[DEBUG] 值相同跳过:', { value, lastValue: last.value });
    // DEBUG_END
    // 值相同，不添加（保留最早的）
    return;
  }

  const point: IntradayPoint = { timestamp: minuteTs, value, equityReturn };

  // 如果同一分钟已有数据，替换；否则添加
  if (last && floorToMinute(last.timestamp) === minuteTs) {
    intraday[intraday.length - 1] = point;
    // DEBUG_START: 2026-04-13 替换同分钟数据
    console.log('[DEBUG] 替换同分钟数据:', new Date(minuteTs).toLocaleTimeString());
    // DEBUG_END
  } else {
    intraday.push(point);
    // DEBUG_START: 2026-04-13 新增数据点
    console.log('[DEBUG] 新增数据点:', new Date(minuteTs).toLocaleTimeString());
    // DEBUG_END
  }

  // 更新并保存
  existing.intraday = intraday;
  saveToStorage();
  // DEBUG_START: 2026-04-13 最终保存结果
  console.log('[DEBUG] 最终保存:', {
    symbol,
    count: existing.intraday.length,
    lastPoint: existing.intraday.length > 0 ? new Date(existing.intraday[existing.intraday.length - 1].timestamp).toLocaleTimeString() : '无数据',
  });
  // DEBUG_END
}

// ═══════════════════════════════════════════════════════════════════════════════
// 迁移
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 检查是否需要迁移
 */
export function needsIndexMigration(): boolean {
  // 新 key 已存在则无需迁移
  if (localStorage.getItem(STORAGE_KEYS.INDEX_DATA)) {
    return false;
  }

  // 检查旧 key（包括 Phase 1 的统一 key 和更早的旧格式）
  const oldKeys = [
    OLD_STORAGE_KEYS.INDEX.INDEX_INFO_UNIFIED,
    OLD_STORAGE_KEYS.INDEX.INDEX_INFO_DOMESTIC,
    OLD_STORAGE_KEYS.INDEX.INDEX_INFO_GLOBAL,
    OLD_STORAGE_KEYS.INDEX.INDICES_CONFIG,
    OLD_STORAGE_KEYS.INDEX.GLOBAL_INDICES_CONFIG,
    OLD_STORAGE_KEYS.INDEX.MARKET_INDICES_CACHE,
    OLD_STORAGE_KEYS.INDEX.GLOBAL_INDICES_CACHE,
    OLD_STORAGE_KEYS.INDEX.INDEX_MARKET_DATA,
  ];
  for (const key of oldKeys) {
    if (localStorage.getItem(key)) return true;
  }

  return false;
}

/**
 * 执行迁移（由 init() 自动执行，此函数可用于手动触发）
 */
export function ensureIndexMigration(): void {
  // 已有新 key 则跳过
  if (localStorage.getItem(STORAGE_KEYS.INDEX_DATA)) {
    return;
  }

  // 执行迁移（调用 init 中的迁移逻辑）
  migrateFromOldKeys();

  // 重新加载缓存
  loadFromStorage();
}

/**
 * 从 localStorage 加载数据到缓存
 */
function loadFromStorage(): void {
  indices.clear();
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.INDEX_DATA);
    if (raw) {
      const marketIndices: MarketIndex[] = JSON.parse(raw);
      marketIndices.forEach(m => {
        indices.set(m.info.symbol, {
          info: m.info,
          intraday: m.intraday || [],
          history: m.history || [],
        });
      });
    }
  } catch { /* ignore */ }
}

/**
 * 验证迁移结果
 * 验证：1. 新key有数据；2. 指数数量一致；3. 每个指数的info、history、intraday 内容一致
 */
export function verifyIndexMigration(deleteOldKeys: boolean = false): {
  success: boolean;
  oldKeysFound: string[];
  newIndexCount: number;
  details: string[];
} {
  const OLD_KEYS = OLD_STORAGE_KEYS.INDEX;
  const details: string[] = [];
  const oldKeysFound: string[] = [];

  // 检查旧 key
  const allOldKeys = [
    OLD_KEYS.INDEX_INFO_UNIFIED,
    OLD_KEYS.INDEX_INFO_DOMESTIC,
    OLD_KEYS.INDEX_INFO_GLOBAL,
    OLD_KEYS.INDICES_CONFIG,
    OLD_KEYS.GLOBAL_INDICES_CONFIG,
    OLD_KEYS.MARKET_INDICES_CACHE,
    OLD_KEYS.GLOBAL_INDICES_CACHE,
    OLD_KEYS.INDEX_MARKET_DATA,
  ];
  for (const key of allOldKeys) {
    if (localStorage.getItem(key) !== null) {
      oldKeysFound.push(key);
    }
  }

  // 如果旧key不存在，跳过验证
  if (oldKeysFound.length === 0) {
    details.push('老的key已经不存在，无需验证');
    return { success: true, oldKeysFound, newIndexCount: 0, details };
  }

  // 读取旧 IndexInfo 数据
  let oldIndexInfos: IndexInfo[] = [];
  // 优先从统一 key 读取
  try {
    const unifiedRaw = localStorage.getItem(OLD_KEYS.INDEX_INFO_UNIFIED);
    if (unifiedRaw) {
      oldIndexInfos = JSON.parse(unifiedRaw);
    }
  } catch { /* ignore */ }
  // 如果没有统一 key，从分开的两个 key 读取
  if (oldIndexInfos.length === 0) {
    try {
      const domesticRaw = localStorage.getItem(OLD_KEYS.INDEX_INFO_DOMESTIC);
      const globalRaw = localStorage.getItem(OLD_KEYS.INDEX_INFO_GLOBAL);
      if (domesticRaw) {
        const domesticInfos: IndexInfo[] = JSON.parse(domesticRaw);
        oldIndexInfos = oldIndexInfos.concat(domesticInfos);
      }
      if (globalRaw) {
        const globalInfos: IndexInfo[] = JSON.parse(globalRaw);
        oldIndexInfos = oldIndexInfos.concat(globalInfos);
      }
    } catch { /* ignore */ }
  }
  // 如果还是没有，从最旧的格式读取
  if (oldIndexInfos.length === 0) {
    try {
      const configRaw = localStorage.getItem(OLD_KEYS.INDICES_CONFIG);
      const globalConfigRaw = localStorage.getItem(OLD_KEYS.GLOBAL_INDICES_CONFIG);
      const cacheRaw = localStorage.getItem(OLD_KEYS.MARKET_INDICES_CACHE);
      const globalCacheRaw = localStorage.getItem(OLD_KEYS.GLOBAL_INDICES_CACHE);
      const marketDataRaw = localStorage.getItem(OLD_KEYS.INDEX_MARKET_DATA);

      const domesticSymbols: string[] = configRaw ? JSON.parse(configRaw) : [];
      const globalSymbols: string[] = globalConfigRaw ? JSON.parse(globalConfigRaw) : [];
      const allSymbols = [...domesticSymbols, ...globalSymbols];

      const dataMap = new Map<string, any>();
      if (cacheRaw) {
        const items = JSON.parse(cacheRaw);
        if (Array.isArray(items)) items.forEach((item: any) => { if (item.symbol) dataMap.set(item.symbol, item); });
      }
      if (globalCacheRaw) {
        const items = JSON.parse(globalCacheRaw);
        if (Array.isArray(items)) items.forEach((item: any) => { if (item.symbol) dataMap.set(item.symbol, item); });
      }
      if (marketDataRaw) {
        const obj = JSON.parse(marketDataRaw);
        if (obj && typeof obj === 'object') {
          Object.entries(obj).forEach(([symbol, data]: [string, any]) => { dataMap.set(symbol, data); });
        }
      }

      oldIndexInfos = allSymbols.map(symbol => {
        const data = dataMap.get(symbol);
        return {
          symbol,
          name: data?.name || INDEX_NAME_MAP[symbol] || symbol,
          current: data?.current || 0,
          change: data?.change || 0,
          changePercent: data?.changePercent || 0,
          lastUpdated: data?.lastUpdated || '',
          tradeDate: data?.tradeDate,
          previousClose: data?.previousClose,
          volume: data?.volume,
          amount: data?.amount,
        };
      });
    } catch { /* ignore */ }
  }

  // 读取旧历史数据
  const oldHistoryMap = new Map<string, HistoricalPoint[]>();
  oldIndexInfos.forEach(info => {
    try {
      const historyRaw = localStorage.getItem(`${OLD_KEYS.HISTORY_PREFIX}${info.symbol}`);
      if (historyRaw) {
        oldHistoryMap.set(info.symbol, JSON.parse(historyRaw));
      }
    } catch { /* ignore */ }
  });

  // 读取旧日内数据
  const oldIntradayMap = new Map<string, IntradayPoint[]>();
  oldIndexInfos.forEach(info => {
    try {
      const intradayRaw = localStorage.getItem(`${OLD_KEYS.INTRADAY_PREFIX}${info.symbol}`);
      if (intradayRaw) {
        const parsed: IntradayPoint[] = JSON.parse(intradayRaw);
        // 只保留当天的
        oldIntradayMap.set(info.symbol, filterTodayIntraday(parsed));
      }
    } catch { /* ignore */ }
  });

  // 读取新数据（MarketIndex[]）
  let newMarketIndices: MarketIndex[] = [];
  let newIndexSymbols: string[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.INDEX_DATA);
    if (raw) {
      newMarketIndices = JSON.parse(raw);
      newIndexSymbols = Array.isArray(newMarketIndices) ? newMarketIndices.map(m => m.info.symbol) : [];
    }
  } catch { /* ignore */ }

  // 验证内容一致性
  const contentMismatches: string[] = [];

  // 比较指数数量
  const oldIndexCount = oldIndexInfos.length;
  const newIndexCount = newIndexSymbols.length;
  if (oldIndexCount > 0 && oldIndexCount !== newIndexCount) {
    contentMismatches.push(`指数数量: 期望 ${oldIndexCount}, 实际 ${newIndexCount}`);
  } else if (newIndexCount > 0) {
    details.push(`指数数量一致: ${newIndexCount} 个`);
  }

  // 比较指数顺序
  if (oldIndexInfos.length > 0 && newIndexSymbols.length > 0) {
    const oldSymbols = oldIndexInfos.map(info => info.symbol);
    const orderMismatches: string[] = [];
    for (let i = 0; i < Math.min(oldSymbols.length, newIndexSymbols.length); i++) {
      if (oldSymbols[i] !== newIndexSymbols[i]) {
        orderMismatches.push(`位置 ${i}: 期望 '${oldSymbols[i]}', 实际 '${newIndexSymbols[i]}'`);
      }
    }
    if (orderMismatches.length > 0) {
      // 只打印警告，不触发重新迁移
      // 原因：重新迁移会删除新key的完整intraday数据，导致数据丢失
      // 顺序不一致是正常情况（用户可能通过备份导入或界面操作调整了顺序）
      details.push(`检测到顺序不一致（警告）`);
      contentMismatches.push(`顺序不一致: ${orderMismatches.join(', ')}`);
    } else if (oldSymbols.length === newIndexSymbols.length) {
      details.push('指数顺序一致');
    }
  }

  // 比较每个指数的 info 内容（排除实时数据字段）
  if (oldIndexInfos.length > 0 && newMarketIndices.length > 0) {
    const oldInfoMap = new Map<string, IndexInfo>();
    oldIndexInfos.forEach(info => oldInfoMap.set(info.symbol, info));

    // 实时数据字段，不严格比较（因为每次刷新都会变化）
    const realtimeFields = ['current', 'change', 'changePercent', 'lastUpdated', 'tradeDate', 'previousClose', 'volume', 'amount'];

    newMarketIndices.forEach(newMI => {
      const oldInfo = oldInfoMap.get(newMI.info.symbol);
      if (oldInfo) {
        // 比较非实时字段（只有 name 需要比较）
        if (oldInfo.name !== newMI.info.name) {
          contentMismatches.push(`${newMI.info.symbol} name: 期望 '${oldInfo.name}', 实际 '${newMI.info.name}'`);
        }
      }
    });
    if (contentMismatchCount(contentMismatches, 'name') === 0) {
      details.push('所有指数 info 内容一致（name 匹配，实时数据不比较）');
    }
  }

  // 比较历史数据
  if (oldHistoryMap.size > 0 && newMarketIndices.length > 0) {
    let historyMatchCount = 0;
    newMarketIndices.forEach(newMI => {
      const oldHistory = oldHistoryMap.get(newMI.info.symbol);
      if (oldHistory && newMI.history) {
        if (oldHistory.length === newMI.history.length) {
          historyMatchCount++;
        } else {
          contentMismatches.push(`${newMI.info.symbol} history: 条数期望 ${oldHistory.length}, 实际 ${newMI.history.length}`);
        }
      }
    });
    if (historyMatchCount > 0) {
      details.push(`${historyMatchCount} 个指数历史数据条数一致`);
    }
  }

  // 比较日内数据（只比较当天的）
  if (oldIntradayMap.size > 0 && newMarketIndices.length > 0) {
    let intradayMatchCount = 0;
    newMarketIndices.forEach(newMI => {
      const oldIntraday = oldIntradayMap.get(newMI.info.symbol);
      if (oldIntraday && newMI.intraday) {
        if (oldIntraday.length === newMI.intraday.length) {
          intradayMatchCount++;
        } else {
          contentMismatches.push(`${newMI.info.symbol} intraday: 条数期望 ${oldIntraday.length}, 实际 ${newMI.intraday.length}`);
        }
      }
    });
    if (intradayMatchCount > 0) {
      details.push(`${intradayMatchCount} 个指数日内数据条数一致`);
    }
  }

  // 计算分类
  const newDomesticSymbols = newIndexSymbols.filter(s => isDomesticIndex(s));
  const newGlobalSymbols = newIndexSymbols.filter(s => isGlobalIndex(s));

  // 判断成功条件
  let success = newIndexCount > 0 && contentMismatches.length === 0;
  if (success) {
    details.push(`迁移成功: ${newIndexSymbols.length} 个指数`);
    details.push(`国内指数: ${newDomesticSymbols.length} 个`);
    details.push(`全球指数: ${newGlobalSymbols.length} 个`);
  } else if (newIndexCount === 0) {
    details.push('迁移失败：新 key 无数据');
  } else {
    details.push('迁移存在问题');
  }

  if (contentMismatches.length > 0) {
    details.push(`内容不一致: ${contentMismatches.join('; ')}`);
  }

  // 删除旧 key（只取决于deleteOldKeys参数，与验证结果无关）
  if (deleteOldKeys) {
    // 删除固定的旧 key
    oldKeysFound.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch { /* ignore */ }
    });
    if (oldKeysFound.length > 0) {
      details.push(`已删除旧 key: ${oldKeysFound.join(', ')}`);
    }

    // 删除指数历史数据动态 key: fund_index_history_{symbol}
    const historyKeysToDelete: string[] = [];
    Object.keys(localStorage)
      .filter(k => k.startsWith('fund_index_history_'))
      .forEach(k => {
        historyKeysToDelete.push(k);
        try { localStorage.removeItem(k); } catch { /* ignore */ }
      });
    if (historyKeysToDelete.length > 0) {
      details.push(`已删除指数历史 key: ${historyKeysToDelete.length} 个`);
    }

    // 删除指数日内数据动态 key: fund_intraday_{symbol}（只删除指数符号的，保留基金的）
    const intradayKeysToDelete: string[] = [];
    Object.keys(localStorage)
      .filter(k => k.startsWith('fund_intraday_'))
      .forEach(k => {
        const symbol = k.replace('fund_intraday_', '');
        // 判断是否为指数符号（已迁移的指数列表或符合指数格式）
        if (newIndexSymbols.includes(symbol) || isDomesticIndex(symbol) || isGlobalIndex(symbol)) {
          intradayKeysToDelete.push(k);
          try { localStorage.removeItem(k); } catch { /* ignore */ }
        }
      });
    if (intradayKeysToDelete.length > 0) {
      details.push(`已删除指数日内 key: ${intradayKeysToDelete.length} 个`);
    }
  }

  return {
    success,
    oldKeysFound,
    newIndexCount: newIndexSymbols.length,
    details,
  };
}

/**
 * Helper: 统计包含某关键词的 mismatch 数量
 */
function contentMismatchCount(mismatches: string[], keyword: string): number {
  return mismatches.filter(m => m.includes(keyword)).length;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 重置缓存（用于测试）
// ═══════════════════════════════════════════════════════════════════════════════

export function resetCache(): void {
  indices.clear();
  init();
}