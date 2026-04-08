/**
 * services/userPreferenceService.ts
 *
 * 用户偏好服务 - 统一管理所有界面偏好配置的读写
 */

import {
  UserPreference,
  SortOrder,
  DEFAULT_USER_PREFERENCE,
} from '../types/userPreferenceTypes';
import { STORAGE_KEYS, OLD_STORAGE_KEYS } from './storageKeys';

export type { UserPreference, SortOrder };

const STORAGE_KEY = STORAGE_KEYS.USER_PREFERENCE;
const OLD_KEYS = OLD_STORAGE_KEYS.USER_PREFERENCE;

// ═══════════════════════════════════════════════════════════════════════════════
// 内存缓存
// ═══════════════════════════════════════════════════════════════════════════════

let cachedPreference: UserPreference | null = null;

/**
 * 重置内存缓存（仅用于测试）
 */
export function resetCache(): void {
  cachedPreference = null;
}

/**
 * 从 localStorage 加载数据到缓存
 */
function loadFromStorage(): UserPreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_USER_PREFERENCE, ...parsed };
    }
  } catch (e) {
    console.error('Error reading user preference:', e);
  }
  return { ...DEFAULT_USER_PREFERENCE };
}

/**
 * 获取缓存（懒加载）
 */
function getCache(): UserPreference {
  if (!cachedPreference) {
    cachedPreference = loadFromStorage();
  }
  return cachedPreference;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 公共 API
// ═══════════════════════════════════════════════════════════════════════════════

export function getUserPreference(): UserPreference {
  return getCache();
}

export function saveUserPreference(pref: UserPreference): void {
  cachedPreference = pref;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
  } catch (e) {
    console.error('Error saving user preference:', e);
  }
}

export function getSortOrder(): SortOrder {
  const pref = getCache();
  const order = pref.sortOrder;
  if (order === 'asc' || order === 'desc') {
    return order;
  }
  return DEFAULT_USER_PREFERENCE.sortOrder;
}

export function saveSortOrder(order: SortOrder): void {
  const pref = getCache();
  pref.sortOrder = order;
  saveUserPreference(pref);
}

export function getDraftModalHeight(): number | null {
  const pref = getCache();
  const height = pref.draftModalHeight;
  if (height === null || (typeof height === 'number' && height > 0)) {
    return height;
  }
  return DEFAULT_USER_PREFERENCE.draftModalHeight;
}

export function saveDraftModalHeight(height: number | null): void {
  const pref = getCache();
  pref.draftModalHeight = height;
  saveUserPreference(pref);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 迁移接口（由 localStorageService 统一调用，迁移完成后可删除）
// ═══════════════════════════════════════════════════════════════════════════════

export function needsUserPreferenceMigration(): boolean {
  if (localStorage.getItem(STORAGE_KEY)) return false;
  return Object.values(OLD_KEYS).some(key => localStorage.getItem(key) !== null);
}

export function ensureUserPreferenceMigration(): void {
  if (localStorage.getItem(STORAGE_KEY)) return;

  const hasOldKeys = Object.values(OLD_KEYS).some(key => localStorage.getItem(key) !== null);
  if (!hasOldKeys) return;

  const newPref: UserPreference = { ...DEFAULT_USER_PREFERENCE };

  try {
    const sortRaw = localStorage.getItem(OLD_KEYS.SORT_ORDER);
    if (sortRaw === 'asc' || sortRaw === 'desc') {
      newPref.sortOrder = sortRaw;
    }
  } catch { /* ignore */ }

  try {
    const heightRaw = localStorage.getItem(OLD_KEYS.DRAFT_MODAL_HEIGHT);
    if (heightRaw) {
      const height = parseFloat(heightRaw);
      if (!isNaN(height) && height > 0) {
        newPref.draftModalHeight = height;
      }
    }
  } catch { /* ignore */ }

  saveUserPreference(newPref);
  // 不删除旧 key，由 verifyStorageMigration() 决定是否删除
}

/**
 * @deprecated 使用 ensureUserPreferenceMigration 代替
 */
export function migrateUserPreferenceFromOldKeys(): void {
  ensureUserPreferenceMigration();
}