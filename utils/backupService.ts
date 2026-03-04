/**
 * backupService.ts
 *
 * Core logic for export (build + download) and import (apply) of backup data.
 * Keeps all side-effectful localStorage / cacheService interactions in one place,
 * so App.tsx only handles React state updates.
 */

import {
  BackupData, BackupFund, BackupIndex, BackupPosition, BackupTrade,
  MarketIndex, Ticker, MarketType,
} from '../types';
import * as cacheService from '../services/cacheService';
import { readAll as readAllTrades } from '../hooks/useTrades';

// ─── Constants ────────────────────────────────────────────────────────────────
const BACKUP_CONFIG_KEY = 'fund_backup_config';
const DEFAULT_AUTO_EXPORT_TIME = '16:00';

// ─── Config helpers ───────────────────────────────────────────────────────────
export function readBackupConfig(): { autoExportTime: string } {
  try {
    const raw = localStorage.getItem(BACKUP_CONFIG_KEY);
    if (raw) {
      const cfg = JSON.parse(raw);
      if (typeof cfg.autoExportTime === 'string' && /^\d{2}:\d{2}$/.test(cfg.autoExportTime)) {
        return { autoExportTime: cfg.autoExportTime };
      }
    }
  } catch { /* ignore */ }
  return { autoExportTime: DEFAULT_AUTO_EXPORT_TIME };
}

export function writeBackupConfig(cfg: { autoExportTime: string }): void {
  try {
    localStorage.setItem(BACKUP_CONFIG_KEY, JSON.stringify(cfg));
  } catch { /* ignore */ }
}

// ─── Build ────────────────────────────────────────────────────────────────────

/**
 * Assemble a complete BackupData snapshot from current in-memory state and
 * localStorage.  Optional fields are populated from cacheService where
 * available, so the backup is as complete as possible.
 */
export function buildBackupData(
  portfolio: Ticker[],
  indicesConfig: string[],
  globalIndicesConfig: string[],
  marketIndices: MarketIndex[],
  globalIndices: MarketIndex[],
): BackupData {
  const valuations = cacheService.getAllValuations();

  // 1. portfolio → BackupFund[]
  const backupPortfolio: BackupFund[] = portfolio.map(t => {
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

  // 2. indices → BackupIndex[]
  const indexMap = new Map<string, MarketIndex>(marketIndices.map(i => [i.symbol, i]));
  const globalIndexMap = new Map<string, MarketIndex>(globalIndices.map(i => [i.symbol, i]));

  const toBackupIndex = (sym: string, map: Map<string, MarketIndex>): BackupIndex => {
    const idx = map.get(sym);
    return {
      symbol: sym,
      name: idx?.name,
      current: idx?.current,
      change: idx?.change,
      changePercent: idx?.changePercent,
      lastUpdated: idx?.lastUpdated,
    };
  };

  const backupIndices: BackupIndex[] = indicesConfig.map(s => toBackupIndex(s, indexMap));
  const backupGlobalIndices: BackupIndex[] = globalIndicesConfig.map(s => toBackupIndex(s, globalIndexMap));

  // 3. positions — one entry per fund_position_* key
  const positions: Record<string, BackupPosition> = {};
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('fund_position_'))
      .forEach(k => {
        const sym = k.replace('fund_position_', '');
        try {
          const raw = localStorage.getItem(k);
          if (raw) {
            const cfg = JSON.parse(raw);
            positions[sym] = {
              fullCapacity: Number(cfg.fullCapacity) || 0,
              initialPosition: Number(cfg.initialPosition) || 0,
              startDate: typeof cfg.startDate === 'string' ? cfg.startDate : null,
              initialPrice: cfg.initialPrice === null || cfg.initialPrice === undefined
                ? null
                : Number(cfg.initialPrice),
            };
          }
        } catch { /* skip single key */ }
      });
  } catch { /* ignore */ }

  // 4. trades — from fund_trades
  const rawTrades = readAllTrades();
  const trades: Record<string, BackupTrade[]> = {};
  Object.entries(rawTrades).forEach(([sym, arr]) => {
    trades[sym] = arr.map(t => ({
      id: t.id,
      date: t.date,
      type: t.type,
      shares: t.shares,
      price: t.price,
      fee: t.fee,
    }));
  });

  // 5. config
  const config = readBackupConfig();

  return {
    portfolio: backupPortfolio,
    indices: backupIndices,
    globalIndices: backupGlobalIndices,
    positions,
    trades,
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
  portfolio: Ticker[];
  indicesConfig: string[];
  globalIndicesConfig: string[];
}

/**
 * Completely replace all user data with the contents of `imported`.
 *
 * Storage actions:
 *   - CLEAR: fund_portfolio, fund_trades, all fund_position_*, fund_indices_config,
 *            fund_global_indices_config
 *   - PRESERVE: fund_history_*, fund_market_data (managed via cacheService.evictValuations)
 *   - WRITE:  new portfolio, trades, positions, indices
 *   - FALLBACK: optional fields are written to cacheService only if the symbol
 *               is not already cached (setValuationIfAbsent / setHistoryIfAbsent)
 *
 * Returns the new React state values to be applied by the caller.
 */
export function applyBackupData(imported: BackupData): AppliedData {
  // ── 1. Build the new portfolio (Ticker[]) ──────────────────────────────────
  const newPortfolio: Ticker[] = (imported.portfolio || []).map((f, i) => ({
    id: Math.random().toString(36).substr(2, 9),
    symbol: f.symbol,
    name: f.name || '',
    market: MarketType.FUND,
  }));

  const newSymbolSet = new Set(newPortfolio.map(t => t.symbol));

  // ── 2. Evict valuations that no longer belong to the portfolio ─────────────
  cacheService.evictValuations(newSymbolSet);

  // ── 3. Apply optional fallback valuations (only if absent from cache) ──────
  (imported.portfolio || []).forEach(f => {
    if (f.previousPrice !== undefined || f.currentPrice !== undefined) {
      // Reconstruct a minimal ValuationData from optional fields
      cacheService.setValuationIfAbsent(f.symbol, {
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
    }
  });

  // ── 4. Clear old localStorage keys ────────────────────────────────────────
  try { localStorage.removeItem('fund_portfolio'); } catch { /* ignore */ }
  try { localStorage.removeItem('fund_trades'); } catch { /* ignore */ }
  try { localStorage.removeItem('fund_indices_config'); } catch { /* ignore */ }
  try { localStorage.removeItem('fund_global_indices_config'); } catch { /* ignore */ }

  // Remove all fund_position_* keys
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('fund_position_'))
      .forEach(k => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
  } catch { /* ignore */ }

  // ── 5. Write new portfolio to localStorage ─────────────────────────────────
  try {
    localStorage.setItem('fund_portfolio', JSON.stringify(newPortfolio));
  } catch { /* ignore */ }

  // ── 6. Write new indices config ────────────────────────────────────────────
  // Compatibility: old format stored indices as string[], new format as BackupIndex[]
  const toSymbol = (item: any): string =>
    typeof item === 'string' ? item : (typeof item?.symbol === 'string' ? item.symbol : '');

  const newIndicesConfig = (imported.indices || []).map(toSymbol).filter(Boolean);
  const newGlobalIndicesConfig = (imported.globalIndices || []).map(toSymbol).filter(Boolean);
  try { localStorage.setItem('fund_indices_config', JSON.stringify(newIndicesConfig)); } catch { /* ignore */ }
  try { localStorage.setItem('fund_global_indices_config', JSON.stringify(newGlobalIndicesConfig)); } catch { /* ignore */ }

  // ── 7. Write positions ─────────────────────────────────────────────────────
  const positions: Record<string, BackupPosition> = imported.positions || {};
  Object.entries(positions).forEach(([sym, pos]) => {
    try {
      localStorage.setItem(`fund_position_${sym}`, JSON.stringify({
        fullCapacity: Number(pos.fullCapacity) || 0,
        initialPosition: Number(pos.initialPosition) || 0,
        startDate: pos.startDate ?? null,
        initialPrice: pos.initialPrice === undefined ? null : pos.initialPrice,
      }));
    } catch { /* ignore */ }
  });

  // ── 8. Write trades ────────────────────────────────────────────────────────
  const trades: Record<string, BackupTrade[]> = imported.trades || {};
  const normalizedTrades: Record<string, any[]> = {};
  Object.entries(trades).forEach(([sym, arr]) => {
    normalizedTrades[sym] = (Array.isArray(arr) ? arr : []).map(t => ({
      id: t.id,
      date: t.date,
      type: t.type,
      shares: Number(t.shares) || 0,
      price: t.price === undefined ? 0 : Number(t.price),
      fee: Number(t.fee) || 0,
    }));
  });
  try { localStorage.setItem('fund_trades', JSON.stringify(normalizedTrades)); } catch { /* ignore */ }

  // ── 9. Write config ────────────────────────────────────────────────────────
  if (imported.config?.autoExportTime) {
    writeBackupConfig({ autoExportTime: imported.config.autoExportTime });
  }

  return {
    portfolio: newPortfolio,
    indicesConfig: newIndicesConfig,
    globalIndicesConfig: newGlobalIndicesConfig,
  };
}


