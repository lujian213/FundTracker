/**
 * tests/services/localStorageService.test.ts
 *
 * 测试 localStorage 统一入口服务
 */

import { STORAGE_KEYS, OLD_STORAGE_KEYS } from '../../services/localStorageService';

describe('localStorageService', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.resetModules();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('ensureMigration', () => {
    test('should call all sub-migration functions', () => {
      localStorage.setItem(OLD_STORAGE_KEYS.USER_PREFERENCE.SORT_ORDER, 'asc');
      localStorage.setItem(OLD_STORAGE_KEYS.SYSTEM_CONFIG.SYSTEM_SETTINGS, JSON.stringify({ jobLogEnabled: true }));

      const { ensureMigration } = require('../../services/localStorageService');
      ensureMigration();

      expect(localStorage.getItem(STORAGE_KEYS.USER_PREFERENCE)).not.toBeNull();
      expect(localStorage.getItem(STORAGE_KEYS.SYSTEM_CONFIG)).not.toBeNull();
    });

    test('should be safe to call multiple times', () => {
      localStorage.setItem(OLD_STORAGE_KEYS.USER_PREFERENCE.SORT_ORDER, 'asc');

      const { ensureMigration } = require('../../services/localStorageService');
      ensureMigration();
      ensureMigration();

      const userPref = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER_PREFERENCE) || '{}');
      expect(userPref.sortOrder).toBe('asc');
    });
  });

  describe('needsAnyMigration', () => {
    test('should return true when any migration is needed', () => {
      localStorage.setItem(OLD_STORAGE_KEYS.USER_PREFERENCE.SORT_ORDER, 'asc');

      const { needsAnyMigration } = require('../../services/localStorageService');
      expect(needsAnyMigration()).toBe(true);
    });

    test('should return false when no migration is needed', () => {
      localStorage.setItem(STORAGE_KEYS.USER_PREFERENCE, JSON.stringify({ version: 1 }));
      localStorage.setItem(STORAGE_KEYS.SYSTEM_CONFIG, JSON.stringify({ version: 1 }));

      const { needsAnyMigration } = require('../../services/localStorageService');
      expect(needsAnyMigration()).toBe(false);
    });
  });

  describe('STORAGE_KEYS', () => {
    test('should have correct key names', () => {
      expect(STORAGE_KEYS.USER_PREFERENCE).toBe('fund_user_preference');
      expect(STORAGE_KEYS.SYSTEM_CONFIG).toBe('fund_system_config');
    });
  });

  describe('OLD_STORAGE_KEYS', () => {
    test('should have correct old key names', () => {
      expect(OLD_STORAGE_KEYS.USER_PREFERENCE.SORT_ORDER).toBe('fund_sort_order');
      expect(OLD_STORAGE_KEYS.SYSTEM_CONFIG.BACKUP_CONFIG).toBe('fund_backup_config');
    });
  });
});