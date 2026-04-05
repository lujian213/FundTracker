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

export function getUserPreference(): UserPreference {
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

export function saveUserPreference(pref: UserPreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
  } catch (e) {
    console.error('Error saving user preference:', e);
  }
}

export function getSortOrder(): SortOrder {
  const pref = getUserPreference();
  const order = pref.sortOrder;
  if (order === 'asc' || order === 'desc') {
    return order;
  }
  return DEFAULT_USER_PREFERENCE.sortOrder;
}

export function saveSortOrder(order: SortOrder): void {
  const pref = getUserPreference();
  pref.sortOrder = order;
  saveUserPreference(pref);
}

export function getDraftModalHeight(): number | null {
  const pref = getUserPreference();
  const height = pref.draftModalHeight;
  if (height === null || (typeof height === 'number' && height > 0)) {
    return height;
  }
  return DEFAULT_USER_PREFERENCE.draftModalHeight;
}

export function saveDraftModalHeight(height: number | null): void {
  const pref = getUserPreference();
  pref.draftModalHeight = height;
  saveUserPreference(pref);
}

// ─── 迁移接口（由 localStorageService 统一调用，迁移完成后可删除）────────────────

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

  // 清理旧 key
  Object.values(OLD_KEYS).forEach(key => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  });
}

/**
 * @deprecated 使用 ensureUserPreferenceMigration 代替
 */
export function migrateUserPreferenceFromOldKeys(): void {
  ensureUserPreferenceMigration();
}