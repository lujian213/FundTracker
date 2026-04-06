/**
 * backupService.ts
 *
 * Core logic for export (build + download) and import (apply) of backup data.
 * Keeps all side-effectful localStorage / cacheService interactions in one place,
 * so App.tsx only handles React state updates.
 */

import {
  BackupData, BackupFund, BackupIndex, BackupPosition, BackupTrade, BackupConfig,
  ComboTrade, ComboTradeRecord
} from '../types';
import * as cacheService from '../services/cacheService';
import { readAll as readAllTrades, setTradesForSymbol } from '../hooks/useTrades';
import { normalizeComboTrades } from './comboTradeService';
import {
  getBackupConfig,
  saveBackupConfig,
  getSyncConfig,
  saveSyncConfig,
  getSyncFilterConfig,
  saveSyncFilterConfig,
} from '../services/systemConfigService';
import type { BackupConfigSection, SyncFilterConfigSection } from '../types/systemConfigTypes';
import { INDEX_NAME_MAP, saveAllIndexInfos } from '../services/indexService';
import { STORAGE_KEYS } from '../services/storageKeys';
import * as marketFundService from '../services/marketFundService';
import { loadComboTrades, saveAllComboTradesToStorage } from '../services/appDataService';

// ─── Config helpers ───────────────────────────────────────────────────────────
// 配置读写已迁移到 systemConfigService，这里仅保留兼容导出

export { getBackupConfig as readBackupConfig, saveBackupConfig as writeBackupConfig } from '../services/systemConfigService';
export { getSyncConfig as readSyncConfig, saveSyncConfig as writeSyncConfig } from '../services/systemConfigService';
export { getSyncFilterConfig as readSyncFilterConfig, saveSyncFilterConfig as writeSyncFilterConfig } from '../services/systemConfigService';

// ─── Build ────────────────────────────────────────────────────────────────────

/**
 * Assemble a complete BackupData snapshot from current in-memory state and
 * localStorage.  Optional fields are populated from cacheService where
 * available, so the backup is as complete as possible.
 */
export async function buildBackupData(
  portfolio: any[],  // 使用 any 类型避免复杂类型导入
  indicesConfig: string[],  // 所有指数符号（统一）
  marketIndices: any[],     // 所有指数数据（统一）
): Promise<BackupData> {
  // 获取缓存的估值数据
  let valuations: any = {};
  try {
    valuations = (cacheService as any).getAllValuations();
  } catch { /* ignore */ }

  // 1. portfolio → BackupFund[]
  const backupPortfolio: BackupFund[] = portfolio.map((t: any) => {
    const v = valuations[t.symbol];
    return {
      symbol: t.symbol,
      name: t.name || v?.name,
      previousPrice: v?.previousPrice,
      netWorthDate: v?.netWorthDate,
      currentPrice: v?.currentPrice,
      realtimeDate: v?.realtimeDate,
    };
  });

  // 2. indices → BackupIndex[] (统一存储)
  const indexMap = new Map<string, any>(marketIndices.map((i: any) => [i.info?.symbol, i]));

  const toBackupIndex = (sym: string): BackupIndex => {
    const idx = indexMap.get(sym);
    return {
      symbol: sym,
      name: idx?.info?.name,
      current: idx?.info?.current,
      change: idx?.info?.change,
      changePercent: idx?.info?.changePercent,
      lastUpdated: idx?.info?.lastUpdated,
    };
  };

  const backupIndices: BackupIndex[] = indicesConfig.map(s => toBackupIndex(s));

  // 3. positions — 从 marketFundService 获取（已统一到 MarketFund）
  const positions: Record<string, BackupPosition> = {};
  const allFundSymbols = marketFundService.getAllFundSymbols();
  allFundSymbols.forEach(sym => {
    const pos = marketFundService.getPosition(sym);
    if (pos) {
      positions[sym] = {
        fullCapacity: pos.fullCapacity || 0,
        initialPosition: pos.initialPosition || 0,
        startDate: pos.startDate ?? null,
        initialPrice: pos.initialPrice === null || pos.initialPrice === undefined
          ? null
          : Number(pos.initialPrice),
      };
    }
  });

  // 4. trades — from fund_trades
  const rawTrades = readAllTrades();
  const trades: Record<string, BackupTrade[]> = {};
  Object.entries(rawTrades).forEach(([sym, arr]) => {
    trades[sym] = arr.map((t: any) => ({
      id: t.id,
      date: t.date,
      type: t.type,
      shares: t.shares,
      price: t.price,
      fee: t.fee,
    }));
  });

  // 5. config - including sync filter config (not sync credentials)
  const backupConfig = getBackupConfig();
  const syncFilterConfig = getSyncFilterConfig();

  // 合并配置
  const config: BackupConfig = {
    ...backupConfig,
    syncFilterConfig: syncFilterConfig || undefined
  };

  // 4. comboTrades - 从 appDataService 读取（使用新 key）
  const comboTrades: Record<string, ComboTrade> = {};
  try {
    const allComboTrades = loadComboTrades();
    Object.entries(allComboTrades).forEach(([id, combo]) => {
      comboTrades[id] = combo;
    });
  } catch { /* ignore */ }

  return {
    portfolio: backupPortfolio,
    indices: backupIndices,
    positions,
    trades,
    comboTrades: comboTrades,
    config,
  };
}

// ─── Download ─────────────────────────────────────────────────────────────────

/** Format a local Date as "yyyy-MM-dd_HH-mm-ss" */
function localTimestamp(d: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return [
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`,
  ].join('_');
}

/** Format a local Date as "yyyy-MM-dd" */
function localDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function downloadBackupFile(data: BackupData, isAuto: boolean): void {
  const now = new Date();
  const filename = isAuto
    ? `fund_backup_auto_${localDateStr(now)}.json`
    : `fund_backup_${localTimestamp(now)}.json`;

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Revoke after a short delay to allow the download to start
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ─── Apply (Import) ───────────────────────────────────────────────────────────

export interface AppliedData {
  portfolio: any[];  // 使用 any 类型避免复杂类型导入
  indicesConfig: string[];  // 所有指数符号（统一）
}

/**
 * Completely replace all user data with the contents of `imported`.
 *
 * Storage actions:
 *   - CLEAR: fund_portfolio, fund_trades, all fund_position_*
 *   - PRESERVE: fund_history_*, fund_market_data (managed via cacheService.evictValuations)
 *   - WRITE:  new portfolio, trades, positions, indices (via indexService)
 *   - FALLBACK: optional fields are written to cacheService only if the symbol
 *               is not already cached (setValuationIfAbsent / setHistoryIfAbsent)
 *
 * Returns the new React state values to be applied by the caller.
 */
export async function applyBackupData(imported: BackupData): Promise<AppliedData> {
  // ── 1. Build the new portfolio (Ticker[]) ──────────────────────────────────
  const newPortfolio: any[] = (imported.portfolio || []).map((f: any, i: number) => ({
    id: Math.random().toString(36).substr(2, 9),
    symbol: f.symbol,
    name: f.name || '',
    market: 'Fund', // 使用字符串而非枚举以简化类型导入
  }));

  const newSymbolSet = new Set(newPortfolio.map((t: any) => t.symbol));

  // ── 2. Evict valuations that no longer belong to the portfolio ─────────────
  try {
    (cacheService as any).evictValuations(newSymbolSet);
  } catch { /* ignore */ }

  // ── 3. Apply optional fallback valuations (only if absent from cache) ──────
  (imported.portfolio || []).forEach((f: any) => {
    if (f.previousPrice !== undefined || f.currentPrice !== undefined) {
      // Reconstruct a minimal ValuationData from optional fields
      try {
        (cacheService as any).setValuationIfAbsent(f.symbol, {
          symbol: f.symbol,
          name: f.name || f.symbol,
          currentPrice: f.currentPrice ?? 0,
          previousPrice: f.previousPrice ?? 0,
          changePercentage: 0,
          lastUpdated: f.realtimeDate ?? '',
          realtimeDate: f.realtimeDate ?? '',
          netWorthDate: f.netWorthDate ?? '',
          valuationDate: f.realtimeDate ?? '',
          sourceUrl: '',
        });
      } catch { /* ignore */ }
    }
  });

  // ── 4. Clear old localStorage keys ────────────────────────────────────────
  // 清理旧的基金相关 keys（迁移后不再需要）
  try { localStorage.removeItem('fund_portfolio'); } catch { /* ignore */ }
  try { localStorage.removeItem('fund_trades'); } catch { /* ignore */ }

  // Remove all fund_position_* keys (已迁移到 MarketFund)
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('fund_position_'))
      .forEach(k => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
  } catch { /* ignore */ }

  // 注意：fund_history_* 和 fund_intraday_* keys 保留，供迁移使用
  // fund_market_data 也保留，供 cacheService 兼容

  // ── 5. Write new portfolio via marketFundService ─────────────────────────────────
  // 创建新基金（如果不存在）
  newPortfolio.forEach((t: any) => {
    if (!marketFundService.getFundInfo(t.symbol)) {
      marketFundService.addFund(t.symbol, t.name || '');
    }
  });

  // 删除不在新 portfolio 中的基金
  const newSymbolSet2 = new Set(newPortfolio.map((t: any) => t.symbol));
  const existingSymbols = marketFundService.getAllFundSymbols();
  existingSymbols.forEach(sym => {
    if (!newSymbolSet2.has(sym)) {
      marketFundService.removeFund(sym);
    }
  });

  // ── 6. Write new indices config (unified) ───────────────────────────────────
  // Compatibility: old format stored indices as string[], new format as BackupIndex[]
  // Also compatibility: old format had separate indices/globalIndices fields
  const toIndexInfo = (item: any): { symbol: string; name: string; current: number; change: number; changePercent: number; lastUpdated: string } | null => {
    if (typeof item === 'string') {
      return {
        symbol: item,
        name: INDEX_NAME_MAP[item] || item,
        current: 0,
        change: 0,
        changePercent: 0,
        lastUpdated: '',
      };
    }
    if (typeof item?.symbol === 'string') {
      return {
        symbol: item.symbol,
        name: item.name || INDEX_NAME_MAP[item.symbol] || item.symbol,
        current: item.current || 0,
        change: item.change || 0,
        changePercent: item.changePercent || 0,
        lastUpdated: item.lastUpdated || '',
      };
    }
    return null;
  };

  // 合并 indices 和 globalIndices（兼容旧格式）
  const mainIndices = (imported.indices || []).map(toIndexInfo).filter(Boolean) as Array<{ symbol: string; name: string; current: number; change: number; changePercent: number; lastUpdated: string }>;
  const oldGlobalIndices = (imported.globalIndices || []).map(toIndexInfo).filter(Boolean) as Array<{ symbol: string; name: string; current: number; change: number; changePercent: number; lastUpdated: string }>;
  const allIndexInfos = [...mainIndices, ...oldGlobalIndices];

  // 使用 indexService 保存到新 key (fund_all_indices_info)
  if (allIndexInfos.length > 0) {
    saveAllIndexInfos(allIndexInfos);
  }

  const newIndicesConfig = allIndexInfos.map(i => i.symbol);

  // ── 7. Write positions (通过 marketFundService 写入) ─────────────────────────────
  const positions: Record<string, any> = imported.positions || {};
  Object.entries(positions).forEach(([sym, pos]) => {
    try {
      marketFundService.updatePosition(sym, {
        fullCapacity: Number(pos.fullCapacity) || 0,
        initialPosition: Number(pos.initialPosition) || 0,
        startDate: pos.startDate ?? null,
        initialPrice: pos.initialPrice === undefined ? null : pos.initialPrice,
      });
    } catch { /* ignore */ }
  });

  // ── 8. Write trades (通过 useTrades hook 写入 marketFundService) ────────────────
  const trades: Record<string, any[]> = imported.trades || {};
  Object.entries(trades).forEach(([sym, arr]) => {
    const normalizedTrades = (Array.isArray(arr) ? arr : []).map((t: any) => ({
      id: t.id,
      date: t.date,
      type: t.type,
      shares: Number(t.shares) || 0,
      price: t.price === undefined ? 0 : Number(t.price),
      fee: Number(t.fee) || 0,
    }));
    setTradesForSymbol(sym, normalizedTrades);
  });

  // ── 9. Write config including sync filter config ────────────────────────────────────
  if (imported.config) {
    // 保存备份配置到新的统一配置服务
    try {
      saveBackupConfig({
        autoExportTime: imported.config.autoExportTime,
        autoBackupEnabled: imported.config.autoBackupEnabled !== undefined ? imported.config.autoBackupEnabled : false,
      });
    } catch { /* ignore */ }

    // 恢复同步过滤条件配置
    if (imported.config.syncFilterConfig) {
      try {
        saveSyncFilterConfig(imported.config.syncFilterConfig);
      } catch { /* ignore */ }
    }
  }

  // ── 10. Write comboTrades ──────────────────────────────────────────────────────
  // 只有当导入数据中包含 comboTrades 时才覆盖，否则保留现有的组合交易数据
  if (imported.comboTrades && Object.keys(imported.comboTrades).length > 0) {
    try {
      // 使用公共函数过滤并规范化导入数据
      const filteredComboTrades = normalizeComboTrades(imported.comboTrades);
      if (Object.keys(filteredComboTrades).length > 0) {
        // 使用 appDataService 保存到新 key
        const appDataComboTrades: Record<string, ComboTrade> = {};
        Object.assign(appDataComboTrades, filteredComboTrades);
        // 直接写入 localStorage 使用新 key，并更新 appDataService 缓存
        localStorage.setItem(STORAGE_KEYS.COMBO_TRADE, JSON.stringify(appDataComboTrades));
      }
    } catch { /* ignore */ }
  }

  return {
    portfolio: newPortfolio,
    indicesConfig: newIndicesConfig,
  };
}


