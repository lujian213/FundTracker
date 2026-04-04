/**
 * tests/services/userPreferenceService.test.ts
 *
 * 测试 userPreferenceService 的核心行为
 */

import { DEFAULT_USER_PREFERENCE } from '../../types/userPreferenceTypes';
import { STORAGE_KEYS, OLD_STORAGE_KEYS } from '../../services/localStorageService';

describe('userPreferenceService', () => {
  const STORAGE_KEY = STORAGE_KEYS.USER_PREFERENCE;
  const OLD_KEYS = OLD_STORAGE_KEYS.USER_PREFERENCE;

  beforeEach(() => {
    localStorage.clear();
    jest.resetModules();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('getUserPreference', () => {
    test('should return default config when no saved data', () => {
      const { getUserPreference } = require('../../services/userPreferenceService');
      const pref = getUserPreference();
      expect(pref.version).toBe(1);
      expect(pref.sortOrder).toBe(DEFAULT_USER_PREFERENCE.sortOrder);
      expect(pref.draftModalHeight).toBe(DEFAULT_USER_PREFERENCE.draftModalHeight);
    });

    test('should return saved config', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 1,
        sortOrder: 'asc',
        draftModalHeight: 450,
      }));
      const { getUserPreference } = require('../../services/userPreferenceService');
      const pref = getUserPreference();
      expect(pref.sortOrder).toBe('asc');
      expect(pref.draftModalHeight).toBe(450);
    });

    test('should handle broken JSON', () => {
      localStorage.setItem(STORAGE_KEY, '{broken json');
      const { getUserPreference } = require('../../services/userPreferenceService');
      const pref = getUserPreference();
      expect(pref.sortOrder).toBe('desc');
    });
  });

  describe('saveUserPreference', () => {
    test('should save config correctly', () => {
      const { saveUserPreference, getUserPreference } = require('../../services/userPreferenceService');
      saveUserPreference({
        version: 1,
        sortOrder: 'asc',
        draftModalHeight: 500,
      });

      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      expect(saved.sortOrder).toBe('asc');
      expect(saved.draftModalHeight).toBe(500);
    });
  });

  describe('getSortOrder / saveSortOrder', () => {
    test('should return default sort order', () => {
      const { getSortOrder } = require('../../services/userPreferenceService');
      expect(getSortOrder()).toBe('desc');
    });

    test('should save and get sort order', () => {
      const { saveSortOrder, getSortOrder } = require('../../services/userPreferenceService');
      saveSortOrder('asc');
      expect(getSortOrder()).toBe('asc');
    });

    test('should ignore invalid sort order value', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 1,
        sortOrder: 'invalid',
      }));
      const { getSortOrder } = require('../../services/userPreferenceService');
      expect(getSortOrder()).toBe('desc');
    });
  });

  describe('getDraftModalHeight / saveDraftModalHeight', () => {
    test('should return default height (null)', () => {
      const { getDraftModalHeight } = require('../../services/userPreferenceService');
      expect(getDraftModalHeight()).toBeNull();
    });

    test('should save and get height', () => {
      const { saveDraftModalHeight, getDraftModalHeight } = require('../../services/userPreferenceService');
      saveDraftModalHeight(400);
      expect(getDraftModalHeight()).toBe(400);
    });

    test('should ignore invalid height value', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 1,
        draftModalHeight: -100,
      }));
      const { getDraftModalHeight } = require('../../services/userPreferenceService');
      expect(getDraftModalHeight()).toBeNull();
    });
  });

  describe('needsUserPreferenceMigration', () => {
    test('should detect need for migration', () => {
      localStorage.setItem(OLD_KEYS.SORT_ORDER, 'asc');
      const { needsUserPreferenceMigration } = require('../../services/userPreferenceService');
      expect(needsUserPreferenceMigration()).toBe(true);
    });

    test('should detect no migration needed when new key exists', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1 }));
      const { needsUserPreferenceMigration } = require('../../services/userPreferenceService');
      expect(needsUserPreferenceMigration()).toBe(false);
    });
  });

  describe('migrateUserPreferenceFromOldKeys', () => {
    test('should migrate old data correctly', () => {
      localStorage.setItem(OLD_KEYS.SORT_ORDER, 'asc');
      localStorage.setItem(OLD_KEYS.DRAFT_MODAL_HEIGHT, '450');

      const { migrateUserPreferenceFromOldKeys, getUserPreference } = require('../../services/userPreferenceService');
      migrateUserPreferenceFromOldKeys();

      const pref = getUserPreference();
      expect(pref.sortOrder).toBe('asc');
      expect(pref.draftModalHeight).toBe(450);

      expect(localStorage.getItem(OLD_KEYS.SORT_ORDER)).toBeNull();
      expect(localStorage.getItem(OLD_KEYS.DRAFT_MODAL_HEIGHT)).toBeNull();
    });

    test('should ignore invalid old data', () => {
      localStorage.setItem(OLD_KEYS.SORT_ORDER, 'invalid');
      localStorage.setItem(OLD_KEYS.DRAFT_MODAL_HEIGHT, 'invalid');

      const { migrateUserPreferenceFromOldKeys, getUserPreference } = require('../../services/userPreferenceService');
      migrateUserPreferenceFromOldKeys();

      const pref = getUserPreference();
      expect(pref.sortOrder).toBe('desc');
      expect(pref.draftModalHeight).toBeNull();
    });
  });
});