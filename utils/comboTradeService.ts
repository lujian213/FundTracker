/**
 * comboTradeService.ts
 *
 * 组合交易相关的公共函数，包括数据校验、过滤、格式化等。
 */

import { ComboTrade, ComboTradeRecord } from '../types';
import {
  loadComboTrades,
  loadComboTradeList,
  saveComboTrade as saveComboTradeToCache,
  deleteComboTrade as deleteComboTradeFromCache,
  saveAllComboTradesToStorage,
} from '../services/appDataService';

/**
 * 校验单条组合交易记录是否合法
 * 合法的记录：fundId 是非空字符串，amount 是有效正数，fee 是有效非负数字
 */
export function isValidComboTradeRecord(record: any): boolean {
  if (!record) return false;

  const fundId = record.fundId;
  const amount = record.amount;
  const fee = record.fee;

  return (
    typeof fundId === 'string' &&
    fundId.trim().length > 0 &&
    typeof amount === 'number' &&
    !isNaN(amount) &&
    amount > 0 &&
    typeof fee === 'number' &&
    !isNaN(fee) &&
    fee >= 0
  );
}

/**
 * 校验单个组合交易是否合法
 */
export function isValidComboTrade(combo: any): boolean {
  return combo && typeof combo.name === 'string' && combo.name.trim().length > 0;
}

/**
 * 过滤并规范化组合交易记录数组
 * - 过滤掉不合法的记录
 * - 保留 amount > 0 的记录
 * - 格式化 amount 和 fee 为 2 位小数
 */
export function normalizeComboTradeRecords(records: any[]): ComboTradeRecord[] {
  return (records || [])
    .filter(isValidComboTradeRecord)
    .map(r => ({
      fundId: r.fundId.trim(),
      amount: Number(r.amount.toFixed(2)),
      fee: Number(r.fee.toFixed(2)),
    }));
}

/**
 * 过滤并规范化组合交易
 * - 过滤掉不合法的组合交易
 * - 规范化每条记录
 */
export function normalizeComboTrade(id: string, combo: any): ComboTrade | null {
  if (!isValidComboTrade(combo)) {
    return null;
  }

  return {
    id,
    name: combo.name.trim(),
    records: normalizeComboTradeRecords(combo.records),
  };
}

/**
 * 过滤并规范化组合交易字典
 */
export function normalizeComboTrades(comboTrades: Record<string, any>): Record<string, ComboTrade> {
  const result: Record<string, ComboTrade> = {};

  Object.entries(comboTrades).forEach(([id, combo]) => {
    const normalized = normalizeComboTrade(id, combo);
    if (normalized && normalized.records.length > 0) {
      result[id] = normalized;
    }
  });

  return result;
}

/**
 * 从 localStorage 加载组合交易数据
 */
export function loadComboTradesFromStorage(): ComboTrade[] {
  return loadComboTradeList();
}

/**
 * 保存组合交易数据到 localStorage
 */
export function saveComboTradesToStorage(comboTrades: Record<string, ComboTrade>): void {
  // 更新内存缓存
  Object.entries(comboTrades).forEach(([id, combo]) => {
    saveComboTradeToCache(id, combo);
  });
  // 写入 localStorage
  saveAllComboTradesToStorage();
}

/**
 * 保存单个组合交易
 */
export function saveComboTrade(id: string, combo: ComboTrade): void {
  saveComboTradeToCache(id, combo);
  saveAllComboTradesToStorage();
}

/**
 * 删除单个组合交易
 */
export function deleteComboTrade(id: string): void {
  deleteComboTradeFromCache(id);
  saveAllComboTradesToStorage();
}

/**
 * 从记录数组中过滤出有效的记录
 * 使用 normalizeComboTradeRecords（内部调用 isValidComboTradeRecord）
 * 用于保存时过滤
 */
export function filterValidRecords(records: ComboTradeRecord[]): ComboTradeRecord[] {
  return normalizeComboTradeRecords(records);
}

/**
 * 校验结果类型
 */
export interface ValidationResult {
  valid: boolean;
  errorMessage?: string;
}

/**
 * 校验组合交易的完整数据
 * - 校验组合名称是否为空
 * - 校验组合名称是否重复
 * - 过滤掉 amount = 0 且 fee = 0 的记录
 * - 对剩余记录校验 fundId、amount > 0、fee >= 0
 *
 * @param name - 组合名称
 * @param records - 记录数组
 * @param existingNames - 已存在的组合名称列表（用于检查重复）
 * @param currentName - 当前组合的名称（更新时用于排除自身）
 * @param fullCapacityFunds - 满仓基金列表（用于获取基金名称）
 */
export function validateComboTrade(
  name: string,
  records: any[],
  existingNames: string[],
  currentName?: string,
  fullCapacityFunds?: { symbol: string; name: string }[]
): ValidationResult {
  // 校验组合名称
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { valid: false, errorMessage: '组合名称不能为空' };
  }

  // 校验组合名称是否重复（排除当前组合名称）
  const isDuplicate = existingNames.some(
    n => n.trim() === trimmedName && n.trim() !== (currentName?.trim() || '')
  );
  if (isDuplicate) {
    return { valid: false, errorMessage: '组合名称已存在，请使用其他名称' };
  }

  // 过滤掉 amount = 0 且 fee = 0 的记录
  const nonEmptyRecords = records.filter(r => r.amount > 0 || r.fee > 0);

  // 检查是否有有效记录
  if (nonEmptyRecords.length === 0) {
    return { valid: false, errorMessage: '没有有效的交易记录，请至少输入一条买入金额大于0的记录' };
  }

  // 对剩余记录做校验
  for (const record of nonEmptyRecords) {
    // 检查 fundId
    if (!record.fundId || record.fundId.trim().length === 0) {
      return { valid: false, errorMessage: '数据校验失败：基金代码不能为空' };
    }
    // 检查 amount > 0
    if (record.amount <= 0) {
      const fund = fullCapacityFunds?.find(f => f.symbol === record.fundId);
      const fundName = fund?.name || record.fundId;
      return { valid: false, errorMessage: `数据校验失败：${fundName} 的买入金额必须大于0` };
    }
    // 检查 fee >= 0
    if (record.fee < 0) {
      const fund = fullCapacityFunds?.find(f => f.symbol === record.fundId);
      const fundName = fund?.name || record.fundId;
      return { valid: false, errorMessage: `数据校验失败：${fundName} 的手续费不能为负数` };
    }
  }

  return { valid: true };
}