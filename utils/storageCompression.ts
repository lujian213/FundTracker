/**
 * utils/storageCompression.ts
 *
 * localStorage 压缩存储工具
 * - LZString 压缩/解压
 * - 历史数据截断
 */

import LZString from 'lz-string';

/** 历史数据最大保留条数 */
export const MAX_HISTORY_POINTS = 500;

/**
 * 截断数组至最大长度
 * @param arr 待截断的数组
 * @param maxLen 最大长度，默认 MAX_HISTORY_POINTS
 * @returns 截断后的数组（保留末尾元素）
 */
export function truncateArray<T>(arr: T[], maxLen: number = MAX_HISTORY_POINTS): T[] {
  return arr.length > maxLen ? arr.slice(-maxLen) : arr;
}

/**
 * 压缩数据并存储到 localStorage
 */
export function compressToStorage(key: string, data: unknown): void {
  try {
    const jsonStr = JSON.stringify(data);
    const compressed = LZString.compress(jsonStr);
    localStorage.setItem(key, compressed);
  } catch (e) {
    console.error(`Error saving to ${key}:`, e);
  }
}

/**
 * 从 localStorage 解压数据
 * 兼容旧版未压缩数据
 */
export function decompressFromStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const decompressed = LZString.decompress(raw);
    const jsonStr = decompressed || raw;
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

/**
 * 截断历史数据
 */
export function truncateHistory<T extends { history?: unknown[] }>(item: T): T {
  if (!item.history) return item;
  return {
    ...item,
    history: item.history.length > MAX_HISTORY_POINTS
      ? item.history.slice(-MAX_HISTORY_POINTS)
      : item.history,
  };
}