/**
 * services/indexService.ts
 *
 * 指数数据管理服务
 * - 管理指数配置（IndexInfo 列表）
 * - 提供运行时 MarketIndex（包含历史数据）
 * - 处理数据迁移
 */

import { IndexInfo, MarketIndex, HistoricalPoint } from '../types';
import { STORAGE_KEYS, OLD_STORAGE_KEYS } from './storageKeys';

// ═══════════════════════════════════════════════════════════════════════════════
// 内存缓存
// ═══════════════════════════════════════════════════════════════════════════════

// 统一指数缓存：Map<string, MarketIndex>
const indices = new Map<string, MarketIndex>();

// 默认指数配置（统一列表）
export const DEFAULT_INDICES: IndexInfo[] = [
  { symbol: '1.000001', name: '上证指数', current: 0, change: 0, changePercent: 0, lastUpdated: '' },
  { symbol: '0.399001', name: '深证成指', current: 0, change: 0, changePercent: 0, lastUpdated: '' },
  { symbol: '0.399006', name: '创业板指', current: 0, change: 0, changePercent: 0, lastUpdated: '' },
  { symbol: '100.HSI', name: '恒生指数', current: 0, change: 0, changePercent: 0, lastUpdated: '' },
  { symbol: '100.NDX', name: '纳斯达克100', current: 0, change: 0, changePercent: 0, lastUpdated: '' },
  { symbol: '100.SPX', name: '标普500', current: 0, change: 0, changePercent: 0, lastUpdated: '' },
];

export const DEFAULT_INDEX_SYMBOLS = DEFAULT_INDICES.map(i => i.symbol);

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
  if (!localStorage.getItem(STORAGE_KEYS.INDEX_INFO)) {
    // 尝试从旧 key 迁移
    migrateFromOldKeys();
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.INDEX_INFO);
    if (raw) {
      const infos: IndexInfo[] = JSON.parse(raw);
      infos.forEach(info => {
        indices.set(info.symbol, { info, history: [] });
      });
    }
  } catch { /* ignore */ }

  // 加载历史数据
  loadHistoryData();
}

/**
 * 从旧 key 迁移数据
 */
function migrateFromOldKeys(): void {
  const OLD_KEYS = OLD_STORAGE_KEYS.INDEX;
  const allInfos: IndexInfo[] = [];

  // 从 fund_indices_info 和 fund_global_indices_info 合并
  try {
    const domesticRaw = localStorage.getItem(OLD_KEYS.INDEX_INFO_DOMESTIC);
    const globalRaw = localStorage.getItem(OLD_KEYS.INDEX_INFO_GLOBAL);
    if (domesticRaw) {
      const domesticInfos: IndexInfo[] = JSON.parse(domesticRaw);
      allInfos.push(...domesticInfos);
    }
    if (globalRaw) {
      const globalInfos: IndexInfo[] = JSON.parse(globalRaw);
      allInfos.push(...globalInfos);
    }
  } catch { /* ignore */ }

  // 如果有数据，保存到新 key
  if (allInfos.length > 0) {
    try {
      localStorage.setItem(STORAGE_KEYS.INDEX_INFO, JSON.stringify(allInfos));
    } catch (e) {
      console.error('Error during index migration:', e);
    }
  }
}

/**
 * 从 localStorage 加载历史数据到缓存
 */
function loadHistoryData(): void {
  for (const index of indices.values()) {
    const historyKey = `${OLD_STORAGE_KEYS.INDEX.HISTORY_PREFIX}${index.info.symbol}`;
    try {
      const raw = localStorage.getItem(historyKey);
      if (raw) {
        const history: HistoricalPoint[] = JSON.parse(raw);
        if (Array.isArray(history)) {
          index.history = history;
        }
      }
    } catch { /* ignore */ }
  }
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
 * 保存指数配置
 */
export function saveIndexInfo(info: IndexInfo): void {
  const existing = indices.get(info.symbol);
  if (existing) {
    existing.info = info;
  } else {
    indices.set(info.symbol, { info, history: [] });
  }
  saveToStorage();
}

/**
 * 批量保存指数配置
 */
export function saveAllIndexInfos(infos: IndexInfo[]): void {
  indices.clear();
  infos.forEach(info => {
    indices.set(info.symbol, { info, history: [] });
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
  saveAllIndexInfos(DEFAULT_INDICES);
}

/**
 * 保存到 localStorage
 */
function saveToStorage(): void {
  const infos = Array.from(indices.values()).map(m => m.info);
  try {
    localStorage.setItem(STORAGE_KEYS.INDEX_INFO, JSON.stringify(infos));
  } catch (e) {
    console.error('Error saving index info:', e);
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
 * 更新指数实时数据
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
    indices.set(symbol, { info: newInfo, history: [] });
    saveToStorage();
  }
}

/**
 * 批量更新指数实时数据
 */
export function batchUpdateRealtimeData(indexInfos: IndexInfo[]): void {
  indexInfos.forEach(info => {
    const existing = indices.get(info.symbol);
    if (existing) {
      existing.info = info;
    } else {
      indices.set(info.symbol, { info, history: [] });
    }
  });
  saveToStorage();
}

/**
 * 更新指数历史数据
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
    indices.set(symbol, { info: newInfo, history });
  }

  // 同时保存到 localStorage（历史数据单独存储）
  const historyKey = `${OLD_STORAGE_KEYS.INDEX.HISTORY_PREFIX}${symbol}`;
  try {
    localStorage.setItem(historyKey, JSON.stringify(history));
  } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 迁移
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 检查是否需要迁移
 */
export function needsIndexMigration(): boolean {
  // 新 key 已存在则无需迁移
  if (localStorage.getItem(STORAGE_KEYS.INDEX_INFO)) {
    return false;
  }

  // 检查旧 key（包括分开存储的两个key和更早的旧格式）
  const oldKeys = [
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
 * 执行迁移
 */
export function ensureIndexMigration(): void {
  // 已有新 key 则跳过
  if (localStorage.getItem(STORAGE_KEYS.INDEX_INFO)) {
    return;
  }

  const OLD_KEYS = OLD_STORAGE_KEYS.INDEX;
  const allInfos: IndexInfo[] = [];

  // 1. 尝试从分开存储的两个新key合并
  try {
    const domesticRaw = localStorage.getItem(OLD_KEYS.INDEX_INFO_DOMESTIC);
    const globalRaw = localStorage.getItem(OLD_KEYS.INDEX_INFO_GLOBAL);
    if (domesticRaw) {
      const domesticInfos: IndexInfo[] = JSON.parse(domesticRaw);
      allInfos.push(...domesticInfos);
    }
    if (globalRaw) {
      const globalInfos: IndexInfo[] = JSON.parse(globalRaw);
      allInfos.push(...globalInfos);
    }
  } catch { /* ignore */ }

  // 2. 如果没有从新key读取到数据，从更早的旧格式迁移
  if (allInfos.length === 0) {
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

    // 去重
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
      allInfos.push({
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

  // 3. 如果没有配置，使用默认值
  if (allInfos.length === 0) {
    DEFAULT_INDICES.forEach(info => allInfos.push(info));
  }

  // 4. 保存到新 key
  try {
    localStorage.setItem(STORAGE_KEYS.INDEX_INFO, JSON.stringify(allInfos));
  } catch (e) {
    console.error('Error during index migration:', e);
  }

  // 5. 更新内存缓存
  indices.clear();
  allInfos.forEach(info => {
    indices.set(info.symbol, { info, history: [] });
  });

  // 6. 加载历史数据
  loadHistoryData();
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

  // 读取旧数据用于对比
  let oldDomesticSymbols: string[] = [];
  let oldGlobalSymbols: string[] = [];

  try {
    const domesticRaw = localStorage.getItem(OLD_KEYS.INDEX_INFO_DOMESTIC);
    if (domesticRaw) {
      const items = JSON.parse(domesticRaw);
      oldDomesticSymbols = items.map((i: any) => i.symbol);
      oldKeysFound.push(OLD_KEYS.INDEX_INFO_DOMESTIC);
    }
  } catch { /* ignore */ }

  try {
    const globalRaw = localStorage.getItem(OLD_KEYS.INDEX_INFO_GLOBAL);
    if (globalRaw) {
      const items = JSON.parse(globalRaw);
      oldGlobalSymbols = items.map((i: any) => i.symbol);
      oldKeysFound.push(OLD_KEYS.INDEX_INFO_GLOBAL);
    }
  } catch { /* ignore */ }

  // 检查其他旧 key
  const otherOldKeys = [
    OLD_KEYS.INDICES_CONFIG,
    OLD_KEYS.GLOBAL_INDICES_CONFIG,
    OLD_KEYS.MARKET_INDICES_CACHE,
    OLD_KEYS.GLOBAL_INDICES_CACHE,
    OLD_KEYS.INDEX_MARKET_DATA,
  ];
  for (const key of otherOldKeys) {
    if (localStorage.getItem(key) !== null) {
      oldKeysFound.push(key);
    }
  }

  // 读取新数据
  let newIndexSymbols: string[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.INDEX_INFO);
    if (raw) {
      const items = JSON.parse(raw);
      newIndexSymbols = Array.isArray(items) ? items.map((i: any) => i.symbol) : [];
    }
  } catch { /* ignore */ }

  // 计算新的分类
  const newDomesticSymbols = newIndexSymbols.filter(s => isDomesticIndex(s));
  const newGlobalSymbols = newIndexSymbols.filter(s => isGlobalIndex(s));

  // 验证总数
  const oldTotalCount = oldDomesticSymbols.length + oldGlobalSymbols.length;
  const newTotalCount = newIndexSymbols.length;

  // 验证分类一致性
  const domesticMatch = arraysEqual(oldDomesticSymbols.sort(), newDomesticSymbols.sort());
  const globalMatch = arraysEqual(oldGlobalSymbols.sort(), newGlobalSymbols.sort());

  // 判断成功条件
  let success = true;
  if (newTotalCount === 0) {
    // 新数据为空，失败
    success = false;
    details.push('迁移失败：新 key 无数据');
  } else if (oldTotalCount > 0) {
    // 有旧数据需要迁移，验证一致性
    if (newTotalCount !== oldTotalCount) {
      success = false;
      details.push(`迁移失败：总数不一致 (旧: ${oldTotalCount}, 新: ${newTotalCount})`);
    } else if (!domesticMatch) {
      success = false;
      details.push(`迁移失败：国内指数不一致`);
      details.push(`  旧: ${oldDomesticSymbols.join(', ')}`);
      details.push(`  新: ${newDomesticSymbols.join(', ')}`);
    } else if (!globalMatch) {
      success = false;
      details.push(`迁移失败：全球指数不一致`);
      details.push(`  旧: ${oldGlobalSymbols.join(', ')}`);
      details.push(`  新: ${newGlobalSymbols.join(', ')}`);
    } else {
      details.push(`迁移成功: ${newTotalCount} 个指数`);
      details.push(`国内指数: ${newDomesticSymbols.length} 个`);
      details.push(`全球指数: ${newGlobalSymbols.length} 个`);
    }
  } else {
    // 首次安装，没有旧数据需要迁移
    details.push(`首次安装: ${newTotalCount} 个指数`);
    details.push(`国内指数: ${newDomesticSymbols.length} 个`);
    details.push(`全球指数: ${newGlobalSymbols.length} 个`);
  }

  // 删除旧 key
  if (deleteOldKeys && success) {
    oldKeysFound.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch { /* ignore */ }
    });
    details.push(`已删除旧 key: ${oldKeysFound.join(', ')}`);
  }

  console.log('[IndexMigration] 验证结果:', { success, oldKeysFound, newIndexCount: newTotalCount, details });

  return {
    success,
    oldKeysFound,
    newIndexCount: newTotalCount,
    details,
  };
}

// 辅助函数：比较两个数组是否相等
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 重置缓存（用于测试）
// ═══════════════════════════════════════════════════════════════════════════════

export function resetCache(): void {
  indices.clear();
  init();
}