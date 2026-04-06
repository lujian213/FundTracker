/**
 * services/localStorageService.ts
 *
 * localStorage 统一入口服务
 * - 提供迁移协调
 */

import { ensureUserPreferenceMigration, needsUserPreferenceMigration } from './userPreferenceService';
import { ensureSystemConfigMigration, needsSystemConfigMigration } from './systemConfigService';
import { ensureAppDataMigration, needsAppDataMigration } from './appDataService';
import { ensureIndexMigration, needsIndexMigration, verifyIndexMigration } from './indexService';
import { ensureFundMigration, needsFundMigration, verifyFundMigration } from './marketFundService';

// 导出 key 常量（从 storageKeys.ts）
export { STORAGE_KEYS, OLD_STORAGE_KEYS } from './storageKeys';

/**
 * 执行所有必要的 localStorage 数据迁移
 * 应在应用初始化时、任何状态读取前调用
 */
export function ensureMigration(): void {
  ensureFundMigration();       // 基金数据迁移（最先执行，因为其他服务可能依赖）
  ensureUserPreferenceMigration();
  ensureSystemConfigMigration();
  ensureAppDataMigration();
  ensureIndexMigration();
}

/**
 * 检查是否需要任何迁移
 */
export function needsAnyMigration(): boolean {
  return needsFundMigration() || needsUserPreferenceMigration() || needsSystemConfigMigration() || needsAppDataMigration() || needsIndexMigration();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 迁移验证
// ═══════════════════════════════════════════════════════════════════════════════

interface MigrationCheckResult {
  success: boolean;
  oldKeysFound: string[];
  newKeysData: Record<string, any>;
  details: string[];
}

/**
 * 验证所有 localStorage 迁移结果
 * @param deleteOldKeys 是否删除旧 key，默认 false
 * @returns 迁移验证报告
 */
export function verifyStorageMigration(deleteOldKeys: boolean = false): {
  success: boolean;
  categories: {
    fund: MigrationCheckResult;
    userPreference: MigrationCheckResult;
    systemConfig: MigrationCheckResult;
    appData: MigrationCheckResult;
    index: MigrationCheckResult;
  };
} {
  // 验证结果汇总
  const fundResult = verifyFundMigration(deleteOldKeys);
  const indexResult = verifyIndexMigration(deleteOldKeys);
  const results = {
    fund: {
      success: fundResult.success,
      oldKeysFound: fundResult.oldKeysFound,
      newKeysData: { count: fundResult.newFundCount },
      details: fundResult.details,
    } as MigrationCheckResult,
    userPreference: verifyUserPreferenceMigration(deleteOldKeys),
    systemConfig: verifySystemConfigMigration(deleteOldKeys),
    appData: verifyAppDataMigration(deleteOldKeys),
    index: {
      success: indexResult.success,
      oldKeysFound: indexResult.oldKeysFound,
      newKeysData: { count: indexResult.newIndexCount },
      details: indexResult.details,
    } as MigrationCheckResult,
  };

  const success = Object.values(results).every(r => r.success);

  console.log('[StorageMigration] 验证结果汇总:', JSON.stringify({
    success,
    fund: { success: results.fund.success, details: results.fund.details },
    userPreference: { success: results.userPreference.success, details: results.userPreference.details },
    systemConfig: { success: results.systemConfig.success, details: results.systemConfig.details },
    appData: { success: results.appData.success, details: results.appData.details },
    index: { success: results.index.success, details: results.index.details, oldKeysFound: results.index.oldKeysFound },
  }, null, 2));

  return { success, categories: results };
}

/**
 * 验证用户偏好迁移
 * 验证：1. 新key有数据；2. 内容一致（sortOrder、draftModalHeight）
 */
function verifyUserPreferenceMigration(deleteOldKeys: boolean): MigrationCheckResult {
  const details: string[] = [];
  const oldKeysFound: string[] = [];
  const OLD_KEYS = {
    SORT_ORDER: 'fund_sort_order',
    DRAFT_MODAL_HEIGHT: 'draft_modal_matched_height',
  };

  // 检查旧key是否存在
  for (const [, key] of Object.entries(OLD_KEYS)) {
    if (localStorage.getItem(key) !== null) {
      oldKeysFound.push(key);
    }
  }

  // 如果旧key不存在，跳过验证
  if (oldKeysFound.length === 0) {
    details.push('老的key已经不存在，无需验证');
    return { success: true, oldKeysFound, newKeysData: {}, details };
  }

  // 读取旧数据
  const oldSortOrder = localStorage.getItem(OLD_KEYS.SORT_ORDER);
  const oldDraftModalHeight = localStorage.getItem(OLD_KEYS.DRAFT_MODAL_HEIGHT);

  // 读取新数据
  const newDataRaw = localStorage.getItem('fund_user_preference');
  let newData: { sortOrder?: string; draftModalHeight?: number | null } | null = null;
  if (newDataRaw) {
    try {
      newData = JSON.parse(newDataRaw);
    } catch { /* ignore */ }
  }

  // 验证内容一致性
  const contentMismatches: string[] = [];

  if (newData !== null) {
    // 比较 sortOrder
    if (oldSortOrder !== null) {
      const expected = oldSortOrder === 'asc' || oldSortOrder === 'desc' ? oldSortOrder : undefined;
      const actual = newData?.sortOrder;
      if (expected !== actual) {
        contentMismatches.push(`sortOrder: 期望 '${expected}', 实际 '${actual}'`);
      } else {
        details.push('sortOrder 迁移一致');
      }
    }

    // 比较 draftModalHeight
    if (oldDraftModalHeight !== null) {
      const expectedHeight = parseFloat(oldDraftModalHeight);
      const actualHeight = newData?.draftModalHeight;
      if (!isNaN(expectedHeight) && expectedHeight !== actualHeight) {
        contentMismatches.push(`draftModalHeight: 期望 ${expectedHeight}, 实际 ${actualHeight}`);
      } else {
        details.push('draftModalHeight 迁移一致');
      }
    }

    details.push('用户偏好迁移验证完成');
  } else {
    details.push('用户偏好迁移验证失败：有旧数据但新 key 无数据');
  }

  if (contentMismatches.length > 0) {
    details.push(`内容不一致: ${contentMismatches.join('; ')}`);
  }

  // 成功条件：有新数据且内容一致
  const success = newData !== null && contentMismatches.length === 0;

  // 删除旧key只取决于deleteOldKeys参数，与验证结果无关
  if (deleteOldKeys && oldKeysFound.length > 0) {
    oldKeysFound.forEach(key => {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    });
    details.push(`已删除旧 key: ${oldKeysFound.join(', ')}`);
  }

  return { success, oldKeysFound, newKeysData: { hasData: newData !== null, sortOrder: newData?.sortOrder, draftModalHeight: newData?.draftModalHeight }, details };
}

/**
 * 验证系统配置迁移
 * 验证：1. 新key有数据；2. 内容一致（backup、sync、ai、features 各section）
 */
function verifySystemConfigMigration(deleteOldKeys: boolean): MigrationCheckResult {
  const details: string[] = [];
  const oldKeysFound: string[] = [];
  const OLD_KEYS = {
    BACKUP_CONFIG: 'fund_backup_config',
    SYNC_CONFIG: 'fund_sync_config',
    EGGFUND_SYNC_CONFIG: 'eggfund_sync_config',
    SYNC_FILTER_CONFIG: 'sync_filter_config',
    AI_CONFIGS: 'ai_configs',
    SYSTEM_SETTINGS: 'fund_system_settings',
  };

  // 检查旧key是否存在
  for (const [, key] of Object.entries(OLD_KEYS)) {
    if (localStorage.getItem(key) !== null) {
      oldKeysFound.push(key);
    }
  }

  // 如果旧key不存在，跳过验证
  if (oldKeysFound.length === 0) {
    details.push('老的key已经不存在，无需验证');
    return { success: true, oldKeysFound, newKeysData: {}, details };
  }

  // 读取旧数据
  const oldBackupRaw = localStorage.getItem(OLD_KEYS.BACKUP_CONFIG);
  const oldSyncRaw = localStorage.getItem(OLD_KEYS.SYNC_CONFIG);
  const oldEggfundSyncRaw = localStorage.getItem(OLD_KEYS.EGGFUND_SYNC_CONFIG);
  const oldSyncFilterRaw = localStorage.getItem(OLD_KEYS.SYNC_FILTER_CONFIG);
  const oldAIRaw = localStorage.getItem(OLD_KEYS.AI_CONFIGS);
  const oldSettingsRaw = localStorage.getItem(OLD_KEYS.SYSTEM_SETTINGS);

  // 读取新数据
  const newDataRaw = localStorage.getItem('fund_system_config');
  let newData: any = null;
  if (newDataRaw) {
    try {
      newData = JSON.parse(newDataRaw);
    } catch { /* ignore */ }
  }

  // 解析旧数据
  let oldBackup: any = null;
  let oldSync: any = null;
  let oldSyncFilter: any = null;
  let oldAI: any = null;
  let oldFeatures: any = null;

  try { if (oldBackupRaw) oldBackup = JSON.parse(oldBackupRaw); } catch { /* ignore */ }
  try { if (oldSyncRaw) oldSync = JSON.parse(oldSyncRaw); } catch { /* ignore */ }
  try { if (oldEggfundSyncRaw) oldSync = JSON.parse(oldEggfundSyncRaw); } catch { /* ignore */ }
  try { if (oldSyncFilterRaw) oldSyncFilter = JSON.parse(oldSyncFilterRaw); } catch { /* ignore */ }
  try { if (oldAIRaw) oldAI = JSON.parse(oldAIRaw); } catch { /* ignore */ }
  try { if (oldSettingsRaw) oldFeatures = JSON.parse(oldSettingsRaw); } catch { /* ignore */ }

  // 验证内容一致性
  const contentMismatches: string[] = [];

  if (newData !== null) {
    // 比较 backup section
    if (oldBackup) {
      const expectedTime = oldBackup.autoExportTime;
      const actualTime = newData.backup?.autoExportTime;
      const expectedEnabled = oldBackup.autoBackupEnabled === true;
      const actualEnabled = newData.backup?.autoBackupEnabled === true;
      if (expectedTime !== actualTime) {
        contentMismatches.push(`backup.autoExportTime: 期望 '${expectedTime}', 实际 '${actualTime}'`);
      } else {
        details.push('backup.autoExportTime 迁移一致');
      }
      if (expectedEnabled !== actualEnabled) {
        contentMismatches.push(`backup.autoBackupEnabled: 期望 ${expectedEnabled}, 实际 ${actualEnabled}`);
      } else {
        details.push('backup.autoBackupEnabled 迁移一致');
      }
    }

    // 比较 sync section
    const syncSource = oldSync || (oldEggfundSyncRaw ? JSON.parse(oldEggfundSyncRaw) : null);
    if (syncSource) {
      const expectedUsername = syncSource.eggfundUsername;
      const actualUsername = newData.sync?.eggfundUsername;
      if (expectedUsername !== actualUsername) {
        contentMismatches.push(`sync.eggfundUsername: 期望 '${expectedUsername}', 实际 '${actualUsername}'`);
      } else {
        details.push('sync.eggfundUsername 迁移一致');
      }
    }

    // 比较 sync.filter section
    if (oldSyncFilter) {
      const expectedFunds = oldSyncFilter.selectedFunds || [];
      const actualFunds = newData.sync?.filter?.selectedFunds || [];
      if (JSON.stringify(expectedFunds.sort()) !== JSON.stringify(actualFunds.sort())) {
        contentMismatches.push(`sync.filter.selectedFunds: 数量期望 ${expectedFunds.length}, 实际 ${actualFunds.length}`);
      } else {
        details.push(`sync.filter.selectedFunds 迁移一致 (${actualFunds.length} 个)`);
      }
    }

    // 比较 ai.manager section
    if (oldAI) {
      const expectedConfigs = (oldAI.configs || []).length;
      const actualConfigs = (newData.ai?.manager?.configs || []).length;
      if (expectedConfigs !== actualConfigs) {
        contentMismatches.push(`ai.manager.configs: 数量期望 ${expectedConfigs}, 实际 ${actualConfigs}`);
      } else {
        details.push(`ai.manager.configs 迁移一致 (${actualConfigs} 个)`);
      }
    }

    // 比较 features section
    if (oldFeatures) {
      const expectedInitAdj = oldFeatures.initialPriceAdjustmentEnabled === true;
      const actualInitAdj = newData.features?.initialPriceAdjustmentEnabled === true;
      if (expectedInitAdj !== actualInitAdj) {
        contentMismatches.push(`features.initialPriceAdjustmentEnabled: 期望 ${expectedInitAdj}, 实际 ${actualInitAdj}`);
      } else {
        details.push('features.initialPriceAdjustmentEnabled 迁移一致');
      }
    }

    details.push('系统配置迁移验证完成');
  } else {
    details.push('系统配置迁移验证失败：有旧数据但新 key 无数据');
  }

  if (contentMismatches.length > 0) {
    details.push(`内容不一致: ${contentMismatches.join('; ')}`);
  }

  // 成功条件：有新数据且内容一致
  const success = newData !== null && contentMismatches.length === 0;

  // 删除旧key只取决于deleteOldKeys参数，与验证结果无关
  if (deleteOldKeys && oldKeysFound.length > 0) {
    oldKeysFound.forEach(key => {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    });
    details.push(`已删除旧 key: ${oldKeysFound.join(', ')}`);
  }

  return { success, oldKeysFound, newKeysData: { hasData: newData !== null }, details };
}

/**
 * 验证应用数据迁移
 * 验证：1. 新key有数据；2. 条数一致；3. 内容一致（calendar、investmentDrafts、comboTrades）
 */
function verifyAppDataMigration(deleteOldKeys: boolean): MigrationCheckResult {
  const details: string[] = [];
  const oldKeysFound: string[] = [];
  const OLD_KEYS = {
    APP_DATA: 'fund_app_data',
    CALENDAR: 'fund_tracker_calendar',
    AI_TEMPLATES_CACHE: 'ai_templates_cached_data',
    COMBO_TRADE: 'fund_combo_trades',
    INVESTMENT_DRAFT_PREFIX: 'investment_draft_',
  };

  // 检查旧key是否存在
  for (const [, key] of Object.entries(OLD_KEYS)) {
    if (key === OLD_KEYS.INVESTMENT_DRAFT_PREFIX) continue; // prefix 不直接检查
    if (localStorage.getItem(key) !== null) {
      oldKeysFound.push(key);
    }
  }

  // 检查 investment_draft_ 前缀的 key
  const oldDraftKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('investment_draft_')) {
      oldKeysFound.push(key);
      oldDraftKeys.push(key);
    }
  }

  // 如果旧key不存在，跳过验证
  if (oldKeysFound.length === 0) {
    details.push('老的key已经不存在，无需验证');
    return { success: true, oldKeysFound, newKeysData: {}, details };
  }

  // 读取旧数据
  const oldAppDataRaw = localStorage.getItem(OLD_KEYS.APP_DATA);
  const oldCalendarRaw = localStorage.getItem(OLD_KEYS.CALENDAR);
  const oldComboRaw = localStorage.getItem(OLD_KEYS.COMBO_TRADE);

  // 解析旧日历数据
  let oldCalendar: any = null;
  try { if (oldCalendarRaw) oldCalendar = JSON.parse(oldCalendarRaw); } catch { /* ignore */ }
  // 如果有 fund_app_data，优先使用其中的 calendar
  try {
    if (oldAppDataRaw) {
      const appData = JSON.parse(oldAppDataRaw);
      if (appData.calendar) oldCalendar = appData.calendar;
    }
  } catch { /* ignore */ }

  // 解析旧草稿数据
  let oldDrafts: Record<string, any> = {};
  try {
    if (oldAppDataRaw) {
      const appData = JSON.parse(oldAppDataRaw);
      if (appData.investmentDrafts) oldDrafts = appData.investmentDrafts;
    }
  } catch { /* ignore */ }
  // 如果没有从 fund_app_data 获取到，从分散的 key 获取
  if (Object.keys(oldDrafts).length === 0) {
    for (const key of oldDraftKeys) {
      try {
        const date = key.replace('investment_draft_', '');
        const raw = localStorage.getItem(key);
        if (raw) oldDrafts[date] = JSON.parse(raw);
      } catch { /* ignore */ }
    }
  }

  // 解析旧组合交易数据
  let oldCombo: any = null;
  try { if (oldComboRaw) oldCombo = JSON.parse(oldComboRaw); } catch { /* ignore */ }

  // 读取新数据
  const calendarDataRaw = localStorage.getItem('fund_calendar');
  const draftDataRaw = localStorage.getItem('fund_investment_draft');
  const comboDataRaw = localStorage.getItem('fund_combo_trade');

  let newCalendar: any = null;
  let newDrafts: Record<string, any> = {};
  let newCombo: any = null;

  try { if (calendarDataRaw) newCalendar = JSON.parse(calendarDataRaw); } catch { /* ignore */ }
  try { if (draftDataRaw) newDrafts = JSON.parse(draftDataRaw); } catch { /* ignore */ }
  try { if (comboDataRaw) newCombo = JSON.parse(comboDataRaw); } catch { /* ignore */ }

  const hasNewData = (calendarDataRaw !== null) || (draftDataRaw !== null) || (comboDataRaw !== null);

  // 验证内容一致性
  const contentMismatches: string[] = [];

  if (hasNewData) {
    // 比较日历数据
    if (oldCalendar) {
      const oldCalendarCount = Object.keys(oldCalendar).length;
      const newCalendarCount = Object.keys(newCalendar || {}).length;
      if (oldCalendarCount !== newCalendarCount) {
        contentMismatches.push(`calendar: 条数期望 ${oldCalendarCount}, 实际 ${newCalendarCount}`);
      } else {
        details.push(`calendar 迁移一致 (${newCalendarCount} 条)`);
      }
    }

    // 比较草稿数据
    if (Object.keys(oldDrafts).length > 0) {
      const oldDraftCount = Object.keys(oldDrafts).length;
      const newDraftCount = Object.keys(newDrafts).length;
      if (oldDraftCount !== newDraftCount) {
        contentMismatches.push(`investmentDrafts: 条数期望 ${oldDraftCount}, 实际 ${newDraftCount}`);
      } else {
        details.push(`investmentDrafts 迁移一致 (${newDraftCount} 条)`);
      }
    }

    // 比较组合交易数据
    if (oldCombo) {
      const oldComboCount = Object.keys(oldCombo).length;
      const newComboCount = Object.keys(newCombo || {}).length;
      if (oldComboCount !== newComboCount) {
        contentMismatches.push(`comboTrades: 条数期望 ${oldComboCount}, 实际 ${newComboCount}`);
      } else {
        details.push(`comboTrades 迁移一致 (${newComboCount} 条)`);
      }
    }

    details.push('应用数据迁移验证完成');
  } else {
    details.push('应用数据迁移验证失败：有旧数据但新 key 无数据');
  }

  if (contentMismatches.length > 0) {
    details.push(`内容不一致: ${contentMismatches.join('; ')}`);
  }

  // 成功条件：有新数据且内容一致
  const success = hasNewData && contentMismatches.length === 0;

  // 删除旧key只取决于deleteOldKeys参数，与验证结果无关
  if (deleteOldKeys && oldKeysFound.length > 0) {
    oldKeysFound.forEach(key => {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    });
    details.push(`已删除旧 key: ${oldKeysFound.join(', ')}`);
  }

  return {
    success,
    oldKeysFound,
    newKeysData: {
      hasCalendar: calendarDataRaw !== null,
      calendarCount: Object.keys(newCalendar || {}).length,
      hasDraft: draftDataRaw !== null,
      draftCount: Object.keys(newDrafts).length,
      hasCombo: comboDataRaw !== null,
      comboCount: Object.keys(newCombo || {}).length,
    },
    details,
  };
}