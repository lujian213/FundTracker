/**
 * dataSnapshotService.ts
 *
 * 测试数据快照生成服务
 * - 收集 localStorage 数据和新闻缓存
 * - Mask 敏感信息（用户名、密码、API Key）
 * - 生成 JSON 文件并触发下载
 *
 * 数据格式与 testDataPrepare 测试用例一致
 */

import { STORAGE_KEYS } from '../services/storageKeys';
import { getNews, NewsItem } from '../services/marketNewsService';

// 需导出的 localStorage key（7个整合后的key，与 testDataPrepare.spec.ts 一致）
const KEYS_TO_DUMP = [
  STORAGE_KEYS.USER_PREFERENCE,      // fund_user_preference
  STORAGE_KEYS.SYSTEM_CONFIG,        // fund_system_config
  STORAGE_KEYS.CALENDAR,             // fund_calendar
  STORAGE_KEYS.INVESTMENT_DRAFT,     // fund_investment_draft
  STORAGE_KEYS.COMBO_TRADE,          // fund_combo_trade
  STORAGE_KEYS.FUND_DATA,            // fund_all_funds_data
  STORAGE_KEYS.INDEX_DATA,           // fund_all_indices_data
];

export interface MockDataSnapshot {
  timestamp: string;
  data: Record<string, string>;
  newsCache: NewsItem[];
}

/**
 * 格式化时间戳为文件名格式：yyyy-MM-dd_HH-mm-ss
 */
function formatTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

/**
 * Mask 系统配置中的敏感信息
 *
 * 与 testDataPrepare.spec.ts 第75-105行逻辑一致：
 * - sync.eggfundUsername → ***MASKED***
 * - sync.eggfundPassword → ***MASKED***
 * - ai.manager.configs[].apiKey → ***MASKED***
 */
function maskSystemConfig(rawConfig: string): string {
  try {
    const config = JSON.parse(rawConfig);

    // Mask 同步配置中的用户名和密码
    if (config.sync) {
      if (config.sync.eggfundUsername) {
        config.sync.eggfundUsername = '***MASKED***';
      }
      if (config.sync.eggfundPassword) {
        config.sync.eggfundPassword = '***MASKED***';
      }
    }

    // Mask AI 配置中的 API 密钥
    if (config.ai?.manager?.configs) {
      config.ai.manager.configs = config.ai.manager.configs.map((c: any) => ({
        ...c,
        apiKey: '***MASKED***',
      }));
    }

    return JSON.stringify(config);
  } catch {
    // 解析失败则返回原始数据
    return rawConfig;
  }
}

/**
 * 构建测试数据快照
 *
 * 收集 localStorage 数据、新闻缓存和时间戳
 * 自动 Mask 敏感信息
 */
export function buildSnapshotData(): MockDataSnapshot {
  const data: Record<string, string> = {};

  // 收集 7 个 localStorage key
  for (const key of KEYS_TO_DUMP) {
    const rawValue = localStorage.getItem(key);
    if (rawValue) {
      // 只有 fund_system_config 需要 mask
      if (key === STORAGE_KEYS.SYSTEM_CONFIG) {
        data[key] = maskSystemConfig(rawValue);
      } else {
        data[key] = rawValue;
      }
    }
  }

  // 获取新闻缓存
  const newsCache = getNews();

  return {
    timestamp: new Date().toISOString(),
    data,
    newsCache,
  };
}

/**
 * 下载测试数据快照文件
 *
 * 文件名格式：mock-data_yyyy-MM-dd_HH-mm-ss.json
 */
export function downloadSnapshotFile(snapshotData: MockDataSnapshot): void {
  const now = new Date();
  const filename = `mock-data_${formatTimestamp(now)}.json`;

  const blob = new Blob([JSON.stringify(snapshotData, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();

  // 释放 URL 对象
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}