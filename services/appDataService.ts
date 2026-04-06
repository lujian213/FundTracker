/**
 * services/appDataService.ts
 *
 * 应用数据服务 - 统一管理应用数据的读写
 * - 内存中维护统一的 AppData 结构
 * - localStorage 使用独立 key，提供细粒度存储控制
 */

import {
  AppData,
  CalendarData,
  InvestmentDrafts,
  DraftEntry,
  ComboTrades,
  DEFAULT_APP_DATA,
} from '../types/appDataTypes';
import { ComboTrade } from '../types';
import { STORAGE_KEYS, OLD_STORAGE_KEYS } from './storageKeys';

// ═══════════════════════════════════════════════════════════════════════════════
// 内存缓存
// ═══════════════════════════════════════════════════════════════════════════════

let cachedData: AppData | null = null;

/**
 * 重置内存缓存（仅用于测试）
 */
export function resetCache(): void {
  cachedData = null;
}

function getAppDataCache(): AppData {
  if (!cachedData) {
    cachedData = loadFromStorage();
  }
  return cachedData;
}

function loadFromStorage(): AppData {
  const data: AppData = { ...DEFAULT_APP_DATA };

  // 加载日历
  try {
    const calendarRaw = localStorage.getItem(STORAGE_KEYS.CALENDAR);
    if (calendarRaw) {
      data.calendar = JSON.parse(calendarRaw);
    }
  } catch { /* ignore */ }

  // 加载草稿
  try {
    const draftRaw = localStorage.getItem(STORAGE_KEYS.INVESTMENT_DRAFT);
    if (draftRaw) {
      data.investmentDrafts = JSON.parse(draftRaw);
    }
  } catch { /* ignore */ }

  // 加载组合交易
  try {
    const comboRaw = localStorage.getItem(STORAGE_KEYS.COMBO_TRADE);
    if (comboRaw) {
      data.comboTrades = JSON.parse(comboRaw);
    }
  } catch { /* ignore */ }

  return data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 日历数据 - 独立存储
// ═══════════════════════════════════════════════════════════════════════════════

export function loadCalendarData(): CalendarData {
  return getAppDataCache().calendar || {};
}

export function saveCalendarData(calendar: CalendarData): void {
  const data = getAppDataCache();
  data.calendar = calendar;
  try {
    localStorage.setItem(STORAGE_KEYS.CALENDAR, JSON.stringify(calendar));
  } catch (e) {
    console.error('Error saving calendar data:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 投资草稿 - 独立存储
// ═══════════════════════════════════════════════════════════════════════════════

export function loadInvestmentDraft(date: string): Record<string, DraftEntry> {
  return getAppDataCache().investmentDrafts?.[date] || {};
}

export function loadAllDrafts(): InvestmentDrafts {
  return getAppDataCache().investmentDrafts || {};
}

export function saveInvestmentDraft(date: string, draft: Record<string, DraftEntry>): void {
  const data = getAppDataCache();
  if (!data.investmentDrafts) {
    data.investmentDrafts = {};
  }
  data.investmentDrafts[date] = draft;
}

export function saveAllDraftsToStorage(): void {
  try {
    localStorage.setItem(STORAGE_KEYS.INVESTMENT_DRAFT, JSON.stringify(getAppDataCache().investmentDrafts));
  } catch (e) {
    console.error('Error saving drafts:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 组合交易 - 独立存储
// ═══════════════════════════════════════════════════════════════════════════════

export function loadComboTrades(): ComboTrades {
  return getAppDataCache().comboTrades || {};
}

export function loadComboTradeList(): ComboTrade[] {
  return Object.values(getAppDataCache().comboTrades || {});
}

export function saveComboTrade(id: string, combo: ComboTrade): void {
  const data = getAppDataCache();
  if (!data.comboTrades) {
    data.comboTrades = {};
  }
  data.comboTrades[id] = combo;
}

export function deleteComboTrade(id: string): void {
  const data = getAppDataCache();
  if (data.comboTrades && data.comboTrades[id]) {
    delete data.comboTrades[id];
  }
}

export function saveAllComboTradesToStorage(): void {
  try {
    localStorage.setItem(STORAGE_KEYS.COMBO_TRADE, JSON.stringify(getAppDataCache().comboTrades));
  } catch (e) {
    console.error('Error saving combo trades:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 迁移接口（由 localStorageService 统一调用）
// ═══════════════════════════════════════════════════════════════════════════════

const OLD_KEYS = OLD_STORAGE_KEYS.APP_DATA;

export function needsAppDataMigration(): boolean {
  // 新 key 已存在则无需迁移
  if (localStorage.getItem(STORAGE_KEYS.CALENDAR) &&
      localStorage.getItem(STORAGE_KEYS.INVESTMENT_DRAFT) &&
      localStorage.getItem(STORAGE_KEYS.COMBO_TRADE)) {
    return false;
  }

  // 检查旧 key
  if (localStorage.getItem(OLD_KEYS.CALENDAR)) return true;
  if (localStorage.getItem(OLD_KEYS.APP_DATA)) return true;
  if (localStorage.getItem(OLD_KEYS.AI_TEMPLATES_CACHE)) return true;
  if (localStorage.getItem(OLD_KEYS.COMBO_TRADE)) return true;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(OLD_KEYS.INVESTMENT_DRAFT_PREFIX)) {
      return true;
    }
  }

  return false;
}

export function ensureAppDataMigration(): void {
  // 已有新 key 则跳过
  if (localStorage.getItem(STORAGE_KEYS.CALENDAR) &&
      localStorage.getItem(STORAGE_KEYS.INVESTMENT_DRAFT) &&
      localStorage.getItem(STORAGE_KEYS.COMBO_TRADE)) {
    return;
  }

  const newData: AppData = { ...DEFAULT_APP_DATA };

  // 从旧的统一存储迁移
  try {
    const appDataRaw = localStorage.getItem(OLD_KEYS.APP_DATA);
    if (appDataRaw) {
      const parsed = JSON.parse(appDataRaw);
      if (parsed.calendar) newData.calendar = parsed.calendar;
      if (parsed.investmentDrafts) newData.investmentDrafts = parsed.investmentDrafts;
    }
  } catch { /* ignore */ }

  // 从分散的旧 key 迁移（兼容更早版本）
  if (!Object.keys(newData.calendar).length) {
    try {
      const calendarRaw = localStorage.getItem(OLD_KEYS.CALENDAR);
      if (calendarRaw) {
        newData.calendar = JSON.parse(calendarRaw);
      }
    } catch { /* ignore */ }
  }

  if (!Object.keys(newData.investmentDrafts).length) {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(OLD_KEYS.INVESTMENT_DRAFT_PREFIX)) {
        try {
          const date = key.replace(OLD_KEYS.INVESTMENT_DRAFT_PREFIX, '');
          const draftRaw = localStorage.getItem(key);
          if (draftRaw) {
            newData.investmentDrafts[date] = JSON.parse(draftRaw);
          }
        } catch { /* ignore */ }
      }
    }
  }

  // 迁移组合交易
  if (!Object.keys(newData.comboTrades).length) {
    try {
      const comboRaw = localStorage.getItem(OLD_KEYS.COMBO_TRADE);
      if (comboRaw) {
        newData.comboTrades = JSON.parse(comboRaw);
      }
    } catch { /* ignore */ }
  }

  // 保存到新 key
  try {
    localStorage.setItem(STORAGE_KEYS.CALENDAR, JSON.stringify(newData.calendar));
    localStorage.setItem(STORAGE_KEYS.INVESTMENT_DRAFT, JSON.stringify(newData.investmentDrafts));
    localStorage.setItem(STORAGE_KEYS.COMBO_TRADE, JSON.stringify(newData.comboTrades));
  } catch (e) {
    console.error('Error during migration:', e);
  }

  // 更新内存缓存
  cachedData = newData;
  // 不删除旧 key，由 verifyStorageMigration() 决定是否删除
}