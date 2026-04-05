/**
 * services/localStorageService.ts
 *
 * localStorage 统一入口服务
 * - 提供迁移协调
 */

import { ensureUserPreferenceMigration, needsUserPreferenceMigration } from './userPreferenceService';
import { ensureSystemConfigMigration, needsSystemConfigMigration } from './systemConfigService';
import { ensureAppDataMigration, needsAppDataMigration } from './appDataService';

// 导出 key 常量（从 storageKeys.ts）
export { STORAGE_KEYS, OLD_STORAGE_KEYS } from './storageKeys';

/**
 * 执行所有必要的 localStorage 数据迁移
 * 应在应用初始化时、任何状态读取前调用
 */
export function ensureMigration(): void {
  ensureUserPreferenceMigration();
  ensureSystemConfigMigration();
  ensureAppDataMigration();
}

/**
 * 检查是否需要任何迁移
 */
export function needsAnyMigration(): boolean {
  return needsUserPreferenceMigration() || needsSystemConfigMigration() || needsAppDataMigration();
}