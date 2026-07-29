/**
 * fundConfigExportService.ts
 *
 * 基金配置导出服务
 * - 从系统导出基金配置（持仓配置信息）
 * - 生成 JSON 文件供下载
 */

import * as marketFundService from '../services/marketFundService';
import { downloadJsonFile, localTimestamp } from './fileDownload';
import type { FundPosition } from '../types';

// ═══════════════════════════════════════════════════════════════════════════════
// 接口定义
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 基金配置项（导出格式）
 * 只包含需求要求的四项基本信息
 */
export interface FundConfigItem {
  symbol: string;              // 基金代码
  name: string;                // 基金名称
  aliasName: string | null;    // 常用名称（用于OCR匹配）
  trackingIndex: string | null; // 跟踪指数，格式 "market.code"
}

/**
 * 导出数据结构
 */
export interface FundConfigExport {
  version: string;             // 导出格式版本
  exportedAt: string;          // 导出时间（本地时间）
  funds: FundConfigItem[];     // 基金配置列表
}

// ═══════════════════════════════════════════════════════════════════════════════
// 导出功能
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 导出基金配置
 *
 * 从系统获取所有基金的基本信息，生成导出数据结构。
 * - 导出所有基金
 * - 只导出基金代码、基金名称、常用名称、跟踪指数四项内容
 *
 * @returns 基金配置导出数据
 */
export function exportFundConfig(): FundConfigExport {
  const allFundInfos = marketFundService.getAllFundInfos();
  const funds: FundConfigItem[] = [];

  for (const info of allFundInfos) {
    const configItem: FundConfigItem = {
      symbol: info.ticker.symbol,
      name: info.ticker.name,
      // aliasName 和 trackingIndex 可能为 undefined，统一转换为 null
      aliasName: info.position?.aliasName ?? null,
      trackingIndex: info.position?.trackingIndex ?? null,
    };

    funds.push(configItem);
  }

  return {
    version: '1.0',
    exportedAt: localTimestamp(new Date()),
    funds,
  };
}

/**
 * 下载基金配置文件
 *
 * 将导出数据转换为 JSON 文件并触发下载。
 * - 文件名使用本地时间戳
 * - JSON 格式化使用 2 空格缩进
 *
 * @param data 基金配置导出数据
 */
export function downloadFundConfig(data: FundConfigExport): void {
  downloadJsonFile(data, 'fund_config');
}

// ═══════════════════════════════════════════════════════════════════════════════
// 导入功能
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 导入结果接口
 */
export interface ImportResult {
  imported: number;          // 成功导入的基金数量
  skipped: number;           // 跳过的基金数量（系统中不存在）
  errors: string[];          // 错误信息列表
}

/**
 * 验证基金配置项的基本格式
 *
 * @param item 待验证的配置项
 * @param index 配置项在数组中的索引（用于错误信息）
 * @returns 错误信息，如果验证通过则返回 null
 */
function validateConfigItem(item: unknown, index: number): string | null {
  if (typeof item !== 'object' || item === null) {
    return `第 ${index + 1} 项不是有效对象`;
  }

  const config = item as Record<string, unknown>;

  // symbol 必须是非空字符串
  if (typeof config.symbol !== 'string' || config.symbol.trim() === '') {
    return `第 ${index + 1} 项缺少有效的 symbol 字段`;
  }

  return null;
}

/**
 * 导入基金配置
 *
 * 从导出数据导入基金配置到系统。
 * - 验证数据格式
 * - 静默跳过系统中不存在的基金
 * - 只在字段为非空字符串时才更新（空字符串或 null 不更新现有值）
 *
 * @param data 导入的基金配置数据
 * @returns 导入结果
 */
export function importFundConfig(data: unknown): ImportResult {
  const result: ImportResult = {
    imported: 0,
    skipped: 0,
    errors: [],
  };

  // 验证顶层结构
  if (typeof data !== 'object' || data === null) {
    result.errors.push('导入数据不是有效对象');
    return result;
  }

  const importData = data as Record<string, unknown>;

  // 验证 version 字段
  if (typeof importData.version !== 'string') {
    result.errors.push('缺少 version 字段');
    return result;
  }

  // 验证 funds 数组
  if (!Array.isArray(importData.funds)) {
    result.errors.push('缺少 funds 数组字段');
    return result;
  }

  // 遍历导入的基金配置
  for (let i = 0; i < importData.funds.length; i++) {
    const item = importData.funds[i];

    // 验证配置项格式
    const validationError = validateConfigItem(item, i);
    if (validationError) {
      result.errors.push(validationError);
      continue;
    }

    const config = item as FundConfigItem;

    // 直接获取现有持仓配置（不存在则跳过）
    const existingPosition = marketFundService.getPosition(config.symbol);
    if (!existingPosition) {
      result.skipped++;
      continue;
    }

    // 只更新aliasName和trackingIndex（非空字符串才更新）
    const newPosition: FundPosition = { ...existingPosition };

    if (typeof config.aliasName === 'string' && config.aliasName.trim() !== '') {
      newPosition.aliasName = config.aliasName;
    }

    if (typeof config.trackingIndex === 'string' && config.trackingIndex.trim() !== '') {
      newPosition.trackingIndex = config.trackingIndex;
    }

    // 更新持仓配置
    marketFundService.updatePosition(config.symbol, newPosition);
    result.imported++;
  }

  return result;
}