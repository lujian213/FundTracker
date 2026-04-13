/**
 * tests/services/appDataService.test.ts
 *
 * 测试应用数据服务
 */

import {
  loadCalendarData,
  saveCalendarData,
  loadInvestmentDraft,
  loadAllDrafts,
  saveInvestmentDraft,
  saveAllDraftsToStorage,
  cleanOldDrafts,
  needsAppDataMigration,
  ensureAppDataMigration,
  resetCache,
} from '../../services/appDataService';
import { DEFAULT_APP_DATA } from '../../types/appDataTypes';
import { STORAGE_KEYS } from '../../services/localStorageService';

describe('appDataService', () => {
  beforeEach(() => {
    localStorage.clear();
    resetCache();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('日历数据', () => {
    test('loadCalendarData 返回空对象当无数据', () => {
      const calendar = loadCalendarData();
      expect(calendar).toEqual({});
    });

    test('saveCalendarData 和 loadCalendarData 正常读写', () => {
      const testCalendar = {
        '2026-04-01': [{ type: 'holiday_china', content: '清明节', description: '假期' }],
        '2026-05-01': [{ type: 'holiday_china', content: '劳动节', description: '假期' }],
      };

      saveCalendarData(testCalendar);
      const loaded = loadCalendarData();

      expect(loaded).toEqual(testCalendar);
      // 验证独立存储
      expect(localStorage.getItem(STORAGE_KEYS.CALENDAR)).toBeTruthy();
    });
  });

  describe('投资草稿', () => {
    test('loadInvestmentDraft 返回空对象当无数据', () => {
      const draft = loadInvestmentDraft('2026-01-01');
      expect(draft).toEqual({});
    });

    test('saveInvestmentDraft 更新内存缓存', () => {
      const testDraft = {
        '000001': { fundSymbol: '000001', operation: '买入', amount: '1000', note: '测试' },
      };

      saveInvestmentDraft('2026-04-01', testDraft);
      const loaded = loadInvestmentDraft('2026-04-01');

      expect(loaded).toEqual(testDraft);
    });

    test('saveAllDraftsToStorage 写入 localStorage', () => {
      const testDraft = {
        '000001': { fundSymbol: '000001', operation: '买入', amount: '1000', note: '' },
      };

      saveInvestmentDraft('2026-04-01', testDraft);
      saveAllDraftsToStorage();

      const stored = localStorage.getItem(STORAGE_KEYS.INVESTMENT_DRAFT);
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed['2026-04-01']).toEqual(testDraft);
    });

    test('不同日期的草稿独立存储', () => {
      const draft1 = { '000001': { fundSymbol: '000001', operation: '买入', amount: '1000', note: '' } };
      const draft2 = { '000002': { fundSymbol: '000002', operation: '卖出', amount: '500', note: '' } };

      saveInvestmentDraft('2026-04-01', draft1);
      saveInvestmentDraft('2026-04-02', draft2);
      saveAllDraftsToStorage();

      expect(loadInvestmentDraft('2026-04-01')).toEqual(draft1);
      expect(loadInvestmentDraft('2026-04-02')).toEqual(draft2);
    });

    test('loadAllDrafts 返回所有草稿', () => {
      const draft1 = { '000001': { fundSymbol: '000001', operation: '买入', amount: '1000', note: '' } };
      const draft2 = { '000002': { fundSymbol: '000002', operation: '卖出', amount: '500', note: '' } };

      saveInvestmentDraft('2026-04-01', draft1);
      saveInvestmentDraft('2026-04-02', draft2);

      const allDrafts = loadAllDrafts();
      expect(allDrafts['2026-04-01']).toEqual(draft1);
      expect(allDrafts['2026-04-02']).toEqual(draft2);
    });
  });

  describe('清理过期草稿', () => {
    test('cleanOldDrafts 无草稿时不报错', () => {
      // 空草稿情况（最先运行，确保干净状态）
      cleanOldDrafts('2026-04-13');

      const allDrafts = loadAllDrafts();
      expect(allDrafts).toEqual({});
    });

    test('cleanOldDrafts 只保留指定日期的草稿', () => {
      // 模拟多天的草稿
      const draft1 = { '000001': { fundSymbol: '000001', operation: '买入', amount: '1000', note: '' } };
      const draft2 = { '000002': { fundSymbol: '000002', operation: '卖出', amount: '500', note: '' } };
      const draftToday = { '000003': { fundSymbol: '000003', operation: '买入', amount: '2000', note: '' } };

      saveInvestmentDraft('2026-04-01', draft1);
      saveInvestmentDraft('2026-04-02', draft2);
      saveInvestmentDraft('2026-04-13', draftToday);
      saveAllDraftsToStorage();

      // 清理只保留 2026-04-13
      cleanOldDrafts('2026-04-13');

      const allDrafts = loadAllDrafts();
      // 只有当天的草稿保留
      expect(Object.keys(allDrafts)).toEqual(['2026-04-13']);
      expect(allDrafts['2026-04-13']).toEqual(draftToday);
      // 其他日期的草稿被删除
      expect(allDrafts['2026-04-01']).toBeUndefined();
      expect(allDrafts['2026-04-02']).toBeUndefined();
    });

    test('cleanOldDrafts 不删除当天草稿', () => {
      const draftToday = { '000001': { fundSymbol: '000001', operation: '买入', amount: '1000', note: '' } };
      saveInvestmentDraft('2026-04-13', draftToday);
      saveAllDraftsToStorage();

      cleanOldDrafts('2026-04-13');

      const allDrafts = loadAllDrafts();
      expect(Object.keys(allDrafts)).toEqual(['2026-04-13']);
      expect(allDrafts['2026-04-13']).toEqual(draftToday);
    });

    test('cleanOldDrafts 清理后 localStorage 同步更新', () => {
      const draft1 = { '000001': { fundSymbol: '000001', operation: '买入', amount: '1000', note: '' } };
      const draftToday = { '000002': { fundSymbol: '000002', operation: '卖出', amount: '500', note: '' } };

      saveInvestmentDraft('2026-04-01', draft1);
      saveInvestmentDraft('2026-04-13', draftToday);
      saveAllDraftsToStorage();

      cleanOldDrafts('2026-04-13');

      const stored = localStorage.getItem(STORAGE_KEYS.INVESTMENT_DRAFT);
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(Object.keys(parsed)).toEqual(['2026-04-13']);
    });
  });

  describe('迁移', () => {
    test('needsAppDataMigration 返回 false 当新 key 已存在', () => {
      localStorage.setItem(STORAGE_KEYS.CALENDAR, '{}');
      localStorage.setItem(STORAGE_KEYS.INVESTMENT_DRAFT, '{}');
      expect(needsAppDataMigration()).toBe(false);
    });

    test('needsAppDataMigration 返回 true 当旧 key 存在', () => {
      localStorage.setItem('fund_tracker_calendar', '{}');
      expect(needsAppDataMigration()).toBe(true);
    });

    test('ensureAppDataMigration 正确迁移日历数据', () => {
      const oldCalendar = { '2026-04-01': [{ type: 'holiday_china', content: '清明节' }] };
      localStorage.setItem('fund_tracker_calendar', JSON.stringify(oldCalendar));

      ensureAppDataMigration();

      const stored = localStorage.getItem(STORAGE_KEYS.CALENDAR);
      expect(stored).toBeTruthy();
      expect(JSON.parse(stored!)).toEqual(oldCalendar);
      // 旧 key 由 verifyStorageMigration() 统一删除，迁移后仍然存在
      expect(localStorage.getItem('fund_tracker_calendar')).toBeTruthy();
    });

    test('ensureAppDataMigration 正确迁移投资草稿', () => {
      // 完全重置状态
      localStorage.clear();
      resetCache();

      const oldDraft = { '000001': { fundSymbol: '000001', operation: '买入', amount: '1000', note: '' } };
      localStorage.setItem('investment_draft_2026-04-01', JSON.stringify(oldDraft));

      // 确保没有其他 key 干扰
      expect(localStorage.getItem(STORAGE_KEYS.INVESTMENT_DRAFT)).toBeNull();

      ensureAppDataMigration();

      const stored = localStorage.getItem(STORAGE_KEYS.INVESTMENT_DRAFT);
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed['2026-04-01']).toEqual(oldDraft);
      // 旧 key 由 verifyStorageMigration() 统一删除，迁移后仍然存在
      expect(localStorage.getItem('investment_draft_2026-04-01')).toBeTruthy();
    });

    test('ensureAppDataMigration 从旧的统一存储迁移', () => {
      const oldData = {
        calendar: { '2026-04-01': [{ type: 'holiday_china', content: '清明节' }] },
        investmentDrafts: { '2026-04-01': { '000001': { fundSymbol: '000001', operation: '买入', amount: '1000', note: '' } } },
        aiTemplatesCache: { templates: [], timestamp: 0 },
      };
      localStorage.setItem('fund_app_data', JSON.stringify(oldData));

      ensureAppDataMigration();

      expect(localStorage.getItem(STORAGE_KEYS.CALENDAR)).toBeTruthy();
      expect(localStorage.getItem(STORAGE_KEYS.INVESTMENT_DRAFT)).toBeTruthy();
      // 旧 key 由 verifyStorageMigration() 统一删除，迁移后仍然存在
      expect(localStorage.getItem('fund_app_data')).toBeTruthy();
    });
  });
});