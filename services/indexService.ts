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
 */
function migrateFromOldKeys(): void {
  const OLD_KEYS = OLD_STORAGE_KEYS.INDEX;
  const indexInfoMap = new Map<string, IndexInfo>();

  // 1. 从 fund_all_indices_info 读取 IndexInfo（Phase 1 的迁移结果）
  try {
    const unifiedRaw = localStorage.getItem(OLD_KEYS.INDEX_INFO_UNIFIED);
    if (unifiedRaw) {
      const infos: IndexInfo[] = JSON.parse(unifiedRaw);
      infos.forEach(info => indexInfoMap.set(info.symbol, info));
    }
  } catch { /* ignore */ }

  // 2. 如果没有统一的 IndexInfo，尝试从分开的两个key合并（更早的旧格式）
  if (indexInfoMap.size === 0) {
    try {
      const domesticRaw = localStorage.getItem(OLD_KEYS.INDEX_INFO_DOMESTIC);
      const globalRaw = localStorage.getItem(OLD_KEYS.INDEX_INFO_GLOBAL);
      if (domesticRaw) {
        const domesticInfos: IndexInfo[] = JSON.parse(domesticRaw);
        domesticInfos.forEach(info => indexInfoMap.set(info.symbol, info));
      }
      if (globalRaw) {
        const globalInfos: IndexInfo[] = JSON.parse(globalRaw);
        globalInfos.forEach(info => indexInfoMap.set(info.symbol, info));
      }
    } catch { /* ignore */ }
  }

  // 3. 如果还是没有数据，尝试从更早的旧格式迁移
  if (indexInfoMap.size === 0) {
    migrateFromVeryOldFormat(indexInfoMap);
  }

  // 4. 构建 MarketIndex，合并 history 和 intraday
  const marketIndices: MarketIndex[] = [];
  indexInfoMap.forEach((info, symbol) => {
    // 读取历史数据
    let history: HistoricalPoint[] = [];
    try {
      const historyRaw = localStorage.getItem(`${OLD_KEYS.HISTORY_PREFIX}${symbol}`);
      if (historyRaw) {
        history = JSON.parse(historyRaw);
      }
    } catch { /* ignore */ }

    // 读取日内数据
    let intraday: IntradayPoint[] = [];
    try {
      const intradayRaw = localStorage.getItem(`${OLD_KEYS.INTRADAY_PREFIX}${symbol}`);
      if (intradayRaw) {
        const parsed: IntradayPoint[] = JSON.parse(intradayRaw);
        // 只保留当天的日内数据
        intraday = filterTodayIntraday(parsed);
      }
    } catch { /* ignore */ }

    marketIndices.push({ info, intraday, history });
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
 */
function migrateFromVeryOldFormat(indexInfoMap: Map<string, IndexInfo>): void {
  const OLD_KEYS = OLD_STORAGE_KEYS.INDEX;

  // 读取旧的配置列表
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

  const allSymbols = new Set([...domesticSymbols, ...globalSymbols]);

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

  // 构建 IndexInfo 列表
  allSymbols.forEach(symbol => {
    const data = dataMap.get(symbol);
    indexInfoMap.set(symbol, {
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
    });
  });
}

/**
 * 过滤只保留当天的日内数据
 */
function filterTodayIntraday(points: IntradayPoint[]): IntradayPoint[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayEnd = todayStart + 24 * 60 * 60 * 1000;

  return points.filter(pt => {
    const ts = Number(pt.timestamp) || 0;
    return ts >= todayStart && ts < todayEnd;
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
 */
export function saveAllIndexInfos(infos: IndexInfo[]): void {
  const newSymbols = new Set(infos.map(i => i.symbol));
  // 删除不在新列表中的指数
  indices.forEach((_, symbol) => {
    if (!newSymbols.has(symbol)) {
      indices.delete(symbol);
    }
  });
  // 更新或新增指数
  infos.forEach(info => {
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
  const existing = indices.get(symbol);
  if (existing) {
    existing.intraday = todayPoints;
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
    indices.set(symbol, { info: newInfo, intraday: todayPoints, history: [] });
  }
  saveToStorage();
}

/**
 * Helper: floor timestamp to minute (ms)
 */
const floorToMinute = (ts: number) => Math.floor(ts / 60000) * 60000;

/**
 * Helper: check if timestamp is same local day as now
 */
const isSameLocalDay = (ts: number) => {
  const d = new Date(ts);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

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
  // 检查 tradeDate：如果不是今天，不添加日内点
  if (tradeDate) {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (tradeDate !== todayStr) {
      return;
    }
  }

  // 构建 timestamp
  let ts = Date.now();
  if (lastUpdated) {
    // 如果 lastUpdated 只包含时间格式 (HH:mm:ss)，需要结合 tradeDate 或使用当前日期
    if (typeof lastUpdated === 'string' && /^\d{1,2}:\d{2}:\d{2}$/.test(lastUpdated)) {
      let dateStr = '';
      if (tradeDate) {
        dateStr = `${tradeDate} ${lastUpdated}`;
      } else {
        const now = new Date();
        dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${lastUpdated}`;
      }
      const parsed = Date.parse(dateStr);
      if (!Number.isNaN(parsed)) ts = parsed;
    } else {
      const parsed = typeof lastUpdated === 'number' ? lastUpdated : Date.parse(String(lastUpdated));
      if (!Number.isNaN(parsed)) ts = parsed;
    }
  }
  const minuteTs = floorToMinute(ts);

  const existing = indices.get(symbol);
  if (!existing) return;

  // 过滤掉非当天数据和比新时间戳更晚的脏数据
  let intraday = existing.intraday.filter(p => isSameLocalDay(p.timestamp) && p.timestamp <= minuteTs);

  // 检查是否与上一个点值相同（跳过连续相同值）
  const last = intraday[intraday.length - 1];
  if (last && Object.is(last.value, value)) {
    // 值相同，不添加（保留最早的）
    return;
  }

  const point: IntradayPoint = { timestamp: minuteTs, value, equityReturn };

  // 如果同一分钟已有数据，替换；否则添加
  if (last && floorToMinute(last.timestamp) === minuteTs) {
    intraday[intraday.length - 1] = point;
  } else {
    intraday.push(point);
  }

  // 更新并保存
  existing.intraday = intraday;
  saveToStorage();
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

  // 读取新数据（MarketIndex[]）
  let newIndexSymbols: string[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.INDEX_DATA);
    if (raw) {
      const items: MarketIndex[] = JSON.parse(raw);
      newIndexSymbols = Array.isArray(items) ? items.map(m => m.info.symbol) : [];
    }
  } catch { /* ignore */ }

  // 计算分类
  const newDomesticSymbols = newIndexSymbols.filter(s => isDomesticIndex(s));
  const newGlobalSymbols = newIndexSymbols.filter(s => isGlobalIndex(s));

  // 判断成功条件
  let success = newIndexSymbols.length > 0;
  if (success) {
    details.push(`迁移成功: ${newIndexSymbols.length} 个指数`);
    details.push(`国内指数: ${newDomesticSymbols.length} 个`);
    details.push(`全球指数: ${newGlobalSymbols.length} 个`);
  } else {
    details.push('迁移失败：新 key 无数据');
  }

  // 删除旧 key
  if (deleteOldKeys && success) {
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

  console.log('[IndexMigration] 验证结果:', { success, oldKeysFound, newIndexCount: newIndexSymbols.length, details });

  return {
    success,
    oldKeysFound,
    newIndexCount: newIndexSymbols.length,
    details,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 重置缓存（用于测试）
// ═══════════════════════════════════════════════════════════════════════════════

export function resetCache(): void {
  indices.clear();
  init();
}