/**
 * tests/utils/backupService.test.ts
 *
 * 覆盖 backupService 的以下功能：
 *  - readBackupConfig / writeBackupConfig
 *  - buildBackupData（含 optional 字段填充）
 *  - downloadBackupFile（文件名格式：手动 vs 自动）
 *  - applyBackupData（完全覆盖语义、fallback 写入、旧格式兼容）
 */

import { BackupData, MarketType, ValuationData, HistoricalPoint } from '../../types';
import { STORAGE_KEYS, OLD_STORAGE_KEYS } from '../../services/storageKeys';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadBackupService() {
  jest.resetModules();
  return require('../../utils/backupService');
}

function resetFundCache() {
  try {
    const mfs = require('../../services/marketFundService');
    mfs.resetCache();
  } catch (e) { /* ignore */ }
}

// Re-load both together so they share the same module registry
function loadBoth() {
  jest.resetModules();
  const mfs = require('../../services/marketFundService');
  const bs = require('../../utils/backupService');
  return { mfs, bs };
}

const SAMPLE_VALUATION: ValuationData = {
  symbol: '000001',
  name: '华夏成长混合',
  currentPrice: 1.5000,
  previousPrice: 1.4800,
  changePercentage: 1.35,
  lastUpdated: '2026-03-03 15:00',
  realtimeDate: '2026-03-03',
  netWorthDate: '2026-03-02',
  valuationDate: '2026-03-03',
  sourceUrl: 'https://example.com',
};

const SAMPLE_HISTORY: HistoricalPoint[] = [
  { date: 1740000000000, value: 1.48, equityReturn: 0.01 },
  { date: 1740086400000, value: 1.50, equityReturn: 0.014 },
];

const BASE_BACKUP: BackupData = {
  portfolio: [{ symbol: '000001', name: '华夏成长混合' }],
  indices: [
    { symbol: '1.000001', name: '上证指数', current: 3200, change: 10, changePercent: 0.31, lastUpdated: '15:00' },
    { symbol: '100.NDX', name: '纳斯达克', current: 18000, change: -50, changePercent: -0.28, lastUpdated: '22:00' }
  ],
  positions: {
    '000001': { fullCapacity: 10000, initialPosition: 2000, startDate: '2025-01-01', initialPrice: 1.48 },
  },
  trades: {
    '000001': [
      { id: 't1', date: '2025-01-01', type: 'buy', shares: 1000, price: 1.48, fee: 1 },
    ],
  },
  comboTrades: {},
  config: { autoExportTime: '16:00', autoBackupEnabled: false },
};

// ─── readBackupConfig / writeBackupConfig ─────────────────────────────────────

describe('readBackupConfig', () => {
  const STORAGE_KEY = 'fund_system_config';

  beforeEach(() => { localStorage.clear(); resetFundCache(); });
  afterEach(() => { localStorage.clear(); jest.resetModules(); resetFundCache(); });

  test('returns default when nothing stored', () => {
    const bs = loadBackupService();
    expect(bs.readBackupConfig()).toEqual({ autoExportTime: '16:00', autoBackupEnabled: false });
  });

  test('returns stored config when valid with autoBackupEnabled', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      backup: { autoExportTime: '09:30', autoBackupEnabled: true }
    }));
    const bs = loadBackupService();
    expect(bs.readBackupConfig()).toEqual({ autoExportTime: '09:30', autoBackupEnabled: true });
  });

  test('defaults to false when autoBackupEnabled is not present', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      backup: { autoExportTime: '09:30' }
    }));
    const bs = loadBackupService();
    expect(bs.readBackupConfig()).toEqual({ autoExportTime: '09:30', autoBackupEnabled: false });
  });

  test('returns default when stored value has invalid format', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      backup: { autoExportTime: 'invalid' }
    }));
    const bs = loadBackupService();
    expect(bs.readBackupConfig()).toEqual({ autoExportTime: '16:00', autoBackupEnabled: false });
  });

  test('returns default when localStorage contains malformed JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{broken json');
    const bs = loadBackupService();
    expect(bs.readBackupConfig()).toEqual({ autoExportTime: '16:00', autoBackupEnabled: false });
  });
});

describe('writeBackupConfig', () => {
  const STORAGE_KEY = 'fund_system_config';

  beforeEach(() => { localStorage.clear(); resetFundCache(); });
  afterEach(() => { localStorage.clear(); jest.resetModules(); resetFundCache(); });

  test('persists config to fund_system_config with autoBackupEnabled', () => {
    const bs = loadBackupService();
    bs.writeBackupConfig({ autoExportTime: '08:00', autoBackupEnabled: true });
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.backup).toEqual({ autoExportTime: '08:00', autoBackupEnabled: true });
  });

  test('persists config to fund_system_config with autoBackupEnabled disabled', () => {
    const bs = loadBackupService();
    bs.writeBackupConfig({ autoExportTime: '08:00', autoBackupEnabled: false });
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.backup).toEqual({ autoExportTime: '08:00', autoBackupEnabled: false });
  });
});

// ─── buildBackupData ──────────────────────────────────────────────────────────

describe('buildBackupData', () => {
  beforeEach(() => { localStorage.clear(); resetFundCache(); });
  afterEach(() => { localStorage.clear(); jest.resetModules(); resetFundCache(); });

  test('basic structure: portfolio, indices, config', async () => {
    const { bs } = loadBoth();
    const portfolio = [{ id: 'a1', symbol: '000001', name: '华夏成长', market: MarketType.FUND }];
    const indicesConfig = ['1.000001', '100.NDX'];
    const result = await bs.buildBackupData(portfolio, indicesConfig, []);
    expect(result.portfolio).toHaveLength(1);
    expect(result.portfolio[0].symbol).toBe('000001');
    expect(result.indices).toEqual([
      { symbol: '1.000001', name: undefined, current: undefined, change: undefined, changePercent: undefined, lastUpdated: undefined },
      { symbol: '100.NDX', name: undefined, current: undefined, change: undefined, changePercent: undefined, lastUpdated: undefined }
    ]);
  });

  test('fills optional valuation fields from marketFundService when available', async () => {
    const { mfs, bs } = loadBoth();
    mfs.resetCache();
    mfs.updateValuation('000001', SAMPLE_VALUATION);

    const portfolio = [{ id: 'a1', symbol: '000001', name: '', market: MarketType.FUND }];
    const result = await bs.buildBackupData(portfolio, [], []);

    const fund = result.portfolio[0];
    expect(fund.previousPrice).toBeCloseTo(1.48);
    expect(fund.currentPrice).toBeCloseTo(1.5);
    expect(fund.netWorthDate).toBe('2026-03-02');
    expect(fund.realtimeDate).toBe('2026-03-03');
  });

  test('fills index optional fields from marketIndices state', async () => {
    const { bs } = loadBoth();
    const indicesConfig = ['1.000001'];
    const marketIndices = [{ info: { symbol: '1.000001', name: '上证指数', current: 3200, change: 10, changePercent: 0.31, lastUpdated: '15:00' }, history: [] }];
    const result = await bs.buildBackupData([], indicesConfig, marketIndices);
    expect(result.indices[0].name).toBe('上证指数');
    expect(result.indices[0].current).toBe(3200);
  });

  test('includes trades from marketFundService', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    mfs.resetCache();
    // 通过 marketFundService 设置交易数据
    mfs.addFund('000001', '测试基金');
    mfs.updateTrades('000001', [{ id: 't1', date: '2026-01-01', type: 'buy', shares: 500, price: 1.48, fee: 0.5 }]);
    const result = await bs.buildBackupData([], [], []);
    expect(result.trades['000001']).toHaveLength(1);
    expect(result.trades['000001'][0].shares).toBe(500);
  });

  test('includes positions from marketFundService', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    // 先重置缓存确保测试干净
    mfs.resetCache();
    // 通过 marketFundService 设置 position
    mfs.updatePosition('000001', {
      fullCapacity: 10000, initialPosition: 2000, startDate: '2025-01-01', initialPrice: 1.48,
    });
    const result = await bs.buildBackupData([], [], []);
    expect(result.positions['000001']).toEqual({
      fullCapacity: 10000, initialPosition: 2000, startDate: '2025-01-01', initialPrice: 1.48,
    });
  });

  test('reads autoExportTime and autoBackupEnabled from fund_system_config', async () => {
    const { bs } = loadBoth();
    localStorage.setItem(STORAGE_KEYS.SYSTEM_CONFIG, JSON.stringify({
      version: 1,
      backup: { autoExportTime: '09:30', autoBackupEnabled: true }
    }));
    const result = await bs.buildBackupData([], [], []);
    expect(result.config.autoExportTime).toBe('09:30');
    expect(result.config.autoBackupEnabled).toBe(true);
  });

  test('uses default autoBackupEnabled when config not stored', async () => {
    const { bs } = loadBoth();
    const result = await bs.buildBackupData([], [], []);
    expect(result.config.autoExportTime).toBe('16:00');
    expect(result.config.autoBackupEnabled).toBe(false);
  });
});

// ─── downloadBackupFile ───────────────────────────────────────────────────────

describe('downloadBackupFile', () => {
  let createdUrl: string;
  let clickedLink: HTMLAnchorElement | null;
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;

  beforeEach(() => {
    jest.resetModules();
    createdUrl = 'blob:mock-url';
    clickedLink = null;

    // jsdom may not have these; define them unconditionally
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = jest.fn().mockReturnValue(createdUrl);
    URL.revokeObjectURL = jest.fn();

    // Intercept link creation and click
    const origCreate = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'a') {
        jest.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(() => {
          clickedLink = el as HTMLAnchorElement;
        });
      }
      return el;
    });

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    localStorage.clear();
    jest.resetModules();
    resetFundCache();
  });

  test('manual export filename contains timestamp pattern (not _auto_)', () => {
    const bs = loadBackupService();
    bs.downloadBackupFile(BASE_BACKUP, false);
    expect(clickedLink).not.toBeNull();
    expect(clickedLink!.download).toMatch(/^fund_backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/);
    expect(clickedLink!.download).not.toContain('_auto_');
  });

  test('auto export filename contains _auto_ and date pattern', () => {
    const bs = loadBackupService();
    bs.downloadBackupFile(BASE_BACKUP, true);
    expect(clickedLink).not.toBeNull();
    expect(clickedLink!.download).toMatch(/^fund_backup_auto_\d{4}-\d{2}-\d{2}\.json$/);
  });

  test('creates Blob and sets href to objectURL', () => {
    const bs = loadBackupService();
    bs.downloadBackupFile(BASE_BACKUP, false);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickedLink!.href).toBe(createdUrl);
  });

  test('revokes objectURL after timeout', () => {
    const bs = loadBackupService();
    bs.downloadBackupFile(BASE_BACKUP, false);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    jest.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(createdUrl);
  });
});

// ─── applyBackupData ─────────────────────────────────────────────────────────

describe('applyBackupData', () => {
  beforeEach(() => { localStorage.clear(); resetFundCache(); });
  afterEach(() => { localStorage.clear(); jest.resetModules(); resetFundCache(); });

  // Helper: pre-populate some old data to verify overwrite
  function seedOldData() {
    localStorage.setItem(OLD_STORAGE_KEYS.FUND.PORTFOLIO, JSON.stringify([{ id: 'old', symbol: '999999', name: '旧基金', market: 'Fund' }]));
    localStorage.setItem(OLD_STORAGE_KEYS.FUND.TRADES, JSON.stringify({ '999999': [{ id: 'old-t', date: '2024-01-01', type: 'buy', shares: 100, price: 1, fee: 0 }] }));
    localStorage.setItem(`${OLD_STORAGE_KEYS.FUND.POSITION_PREFIX}999999`, JSON.stringify({ fullCapacity: 5000, initialPosition: 0, startDate: null, initialPrice: null }));
    localStorage.setItem(OLD_STORAGE_KEYS.INDEX.INDICES_CONFIG, JSON.stringify(['9.999999']));
    localStorage.setItem(OLD_STORAGE_KEYS.INDEX.GLOBAL_INDICES_CONFIG, JSON.stringify(['999.OLD']));
    localStorage.setItem(`${OLD_STORAGE_KEYS.INDEX.HISTORY_PREFIX}999999`, JSON.stringify([{ date: 1000000, value: 1, equityReturn: 0 }]));
  }

  test('returns correct portfolio, indicesConfig', async () => {
    const { bs } = loadBoth();
    const result = await bs.applyBackupData(BASE_BACKUP);
    expect(result.portfolio).toHaveLength(1);
    expect(result.portfolio[0].symbol).toBe('000001');
    expect(result.portfolio[0].market).toBe(MarketType.FUND);
    expect(result.indicesConfig).toEqual(['1.000001', '100.NDX']);
  });

  test('completely overwrites old portfolio via marketFundService', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    mfs.resetCache();
    seedOldData();
    await bs.applyBackupData(BASE_BACKUP);

    // 验证通过 marketFundService 获取 portfolio
    const symbols = mfs.getAllFundSymbols();
    expect(symbols).not.toContain('999999');
    expect(symbols).toContain('000001');
  });

  test('completely overwrites old trades via marketFundService', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    mfs.resetCache();
    seedOldData();
    await bs.applyBackupData(BASE_BACKUP);

    // 验证通过 marketFundService 获取 trades
    const trades999999 = mfs.getTrades('999999');
    const trades000001 = mfs.getTrades('000001');
    expect(trades999999).toHaveLength(0);
    expect(trades000001).toHaveLength(1);
    expect(trades000001[0].id).toBe('t1');
  });

  test('removes old fund_position_* keys and writes new ones via marketFundService', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    mfs.resetCache();
    seedOldData();
    await bs.applyBackupData(BASE_BACKUP);

    // 旧的 localStorage key 应被清理
    expect(localStorage.getItem(`${OLD_STORAGE_KEYS.FUND.POSITION_PREFIX}999999`)).toBeNull();
    // 验证通过 marketFundService 获取新 position
    const pos = mfs.getPosition('000001');
    expect(pos).not.toBeNull();
    expect(pos!.fullCapacity).toBe(10000);
    expect(pos!.startDate).toBe('2025-01-01');
  });

  test('preserves fund_history_* keys (not cleared)', async () => {
    const { bs } = loadBoth();
    seedOldData();
    await bs.applyBackupData(BASE_BACKUP);

    // History for old fund is preserved
    expect(localStorage.getItem(`${OLD_STORAGE_KEYS.INDEX.HISTORY_PREFIX}999999`)).not.toBeNull();
  });

  test('writes new indices config to localStorage', async () => {
    const { bs } = loadBoth();
    seedOldData();
    await bs.applyBackupData(BASE_BACKUP);

    // 检查新 key: fund_all_indices_data（完整 MarketIndex[]）
    const idx = JSON.parse(localStorage.getItem(STORAGE_KEYS.INDEX_DATA)!);
    const symbols = idx.map((m: any) => m.info.symbol);
    expect(symbols).toEqual(['1.000001', '100.NDX']);
  });

  test('evicts old funds from marketFundService for removed symbols', async () => {
    const { mfs, bs } = loadBoth();
    mfs.resetCache();
    // Seed old symbol in cache
    mfs.updateValuation('999999', { ...SAMPLE_VALUATION, symbol: '999999' });
    expect(mfs.getValuation('999999')).toBeDefined();

    await bs.applyBackupData(BASE_BACKUP);

    // Fund 999999 should be removed since it's not in the backup
    expect(mfs.getValuation('999999')).toBeUndefined();
  });

  test('fallback: writes valuation to cache when cache is empty', async () => {
    const { mfs, bs } = loadBoth();
    mfs.resetCache();
    // Cache is empty
    expect(mfs.getValuation('000001')).toBeUndefined();

    // Use a backup that includes the optional price fields
    const backupWithPrices: BackupData = {
      ...BASE_BACKUP,
      portfolio: [{
        symbol: '000001',
        name: '华夏成长混合',
        previousPrice: 1.48,
        netWorthDate: '2026-03-02',
        currentPrice: 1.50,
        realtimeDate: '2026-03-03',
      }],
    };
    await bs.applyBackupData(backupWithPrices);

    // Backup has previousPrice=1.48, should be written as fallback
    const cached = mfs.getValuation('000001');
    expect(cached).toBeDefined();
    expect(cached!.previousPrice).toBeCloseTo(1.48);
  });

  test('fallback: does NOT overwrite existing valuation in cache', async () => {
    const { mfs, bs } = loadBoth();
    mfs.resetCache();
    // Seed a "live" valuation with up-to-date data
    const liveVal = { ...SAMPLE_VALUATION, previousPrice: 9.99 };
    mfs.updateValuation('000001', liveVal);

    const backupWithPrices: BackupData = {
      ...BASE_BACKUP,
      portfolio: [{
        symbol: '000001',
        name: '华夏成长混合',
        previousPrice: 1.48,
        currentPrice: 1.50,
      }],
    };
    await bs.applyBackupData(backupWithPrices);

    // Cache should still have the live value, not the backup fallback
    expect(mfs.getValuation('000001')!.previousPrice).toBeCloseTo(9.99);
  });

  test('writes config.autoExportTime and autoBackupEnabled to fund_system_config', async () => {
    const { bs } = loadBoth();
    const backup = { ...BASE_BACKUP, config: { autoExportTime: '08:30', autoBackupEnabled: true } };
    await bs.applyBackupData(backup);

    const raw = localStorage.getItem(STORAGE_KEYS.SYSTEM_CONFIG);
    const parsed = JSON.parse(raw!);
    expect(parsed.backup).toEqual({ autoExportTime: '08:30', autoBackupEnabled: true });
  });

  test('writes config with autoBackupEnabled as false', async () => {
    const { bs } = loadBoth();
    const backup = { ...BASE_BACKUP, config: { autoExportTime: '08:30', autoBackupEnabled: false } };
    await bs.applyBackupData(backup);

    const raw = localStorage.getItem(STORAGE_KEYS.SYSTEM_CONFIG);
    const parsed = JSON.parse(raw!);
    expect(parsed.backup).toEqual({ autoExportTime: '08:30', autoBackupEnabled: false });
  });

  test('handles missing autoBackupEnabled during import by defaulting to false', async () => {
    const { bs } = loadBoth();
    const backup = { ...BASE_BACKUP, config: { autoExportTime: '08:30' } }; // No autoBackupEnabled
    await bs.applyBackupData(backup);

    const raw = localStorage.getItem(STORAGE_KEYS.SYSTEM_CONFIG);
    const parsed = JSON.parse(raw!);
    expect(parsed.backup).toEqual({ autoExportTime: '08:30', autoBackupEnabled: false });
  });

  test('normalizes missing trade price to 0', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    mfs.resetCache();
    const backup: BackupData = {
      ...BASE_BACKUP,
      trades: {
        '000001': [{ id: 't2', date: '2025-02-01', type: 'sell', shares: 200, fee: 0 } as any],
      },
    };
    await bs.applyBackupData(backup);
    const trades = mfs.getTrades('000001');
    expect(trades[0].price).toBe(0);
  });

  test('normalizes missing position initialPrice to null', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    mfs.resetCache();
    const backup: BackupData = {
      ...BASE_BACKUP,
      positions: {
        '000001': { fullCapacity: 5000, initialPosition: 0, startDate: null, initialPrice: null },
      },
    };
    await bs.applyBackupData(backup);
    const pos = mfs.getPosition('000001');
    expect(pos).not.toBeNull();
    expect(pos!.initialPrice).toBeNull();
  });

  // ── Old-format compatibility ───────────────────────────────────────────────

  test('compat: old format indices as string[] (not BackupIndex[])', async () => {
    const { bs } = loadBoth();
    const oldFormat = {
      ...BASE_BACKUP,
      indices: ['1.000001', '0.399001'] as any,
      globalIndices: ['100.NDX'] as any,
    };
    const result = await bs.applyBackupData(oldFormat);
    // Should merge indices and globalIndices
    expect(result.indicesConfig).toEqual(['1.000001', '0.399001', '100.NDX']);
  });

  test('compat: old format portfolio as plain array without optional fields', async () => {
    const { bs } = loadBoth();
    const oldFormat: BackupData = {
      portfolio: [{ symbol: '000001' } as any],
      indices: [],
      positions: {},
      trades: {},
      comboTrades: {},
      config: { autoExportTime: '16:00' },
    };
    const result = await bs.applyBackupData(oldFormat);
    expect(result.portfolio[0].symbol).toBe('000001');
    expect(result.portfolio[0].name).toBe('');
  });

  test('compat: missing config field uses stored default', async () => {
    const { bs } = loadBoth();
    localStorage.setItem(OLD_STORAGE_KEYS.SYSTEM_CONFIG.BACKUP_CONFIG, JSON.stringify({ autoExportTime: '07:00' }));
    const backup = { ...BASE_BACKUP, config: undefined as any };
    // Should not throw; config not written if absent
    await expect(bs.applyBackupData(backup)).resolves.not.toThrow();
  });

  test('compat: empty portfolio and indices produce empty arrays', async () => {
    const { bs } = loadBoth();
    const result = await bs.applyBackupData({
      portfolio: [],
      indices: [],
      positions: {},
      trades: {},
      config: { autoExportTime: '16:00' },
    });
    expect(result.portfolio).toEqual([]);
    expect(result.indicesConfig).toEqual([]);
  });

  test('compat: indices array with mixed string and object entries', async () => {
    const { bs } = loadBoth();
    const mixedFormat = {
      ...BASE_BACKUP,
      indices: ['1.000001', { symbol: '0.399001', name: '深证成指' }] as any,
    };
    const result = await bs.applyBackupData(mixedFormat);
    expect(result.indicesConfig).toContain('1.000001');
    expect(result.indicesConfig).toContain('0.399001');
  });

  // ── Profile 保留测试 ───────────────────────────────────────────────────────────

  test('导入备份后，applyBackupData 返回的 portfolio 应包含 localStorage 中已有的 profile', async () => {
    const { mfs, bs } = loadBoth();
    mfs.resetCache();

    // 步骤1：模拟已有基金，并添加 profile 数据
    mfs.addFund('000001', '华夏成长混合');
    mfs.updateTicker('000001', {
      profile: {
        stock_positions: [{ stock_name: '腾讯控股', percentage: 10 }],
        stage_increase: [{ stage: '近1周', increase_percentage: 1.5 }],
        fetched_at: '2026-04-01T10:00:00Z',
      },
    });

    // 验证 marketFundService 内存缓存中有 profile
    const tickersBefore = mfs.getAllTickers();
    expect(tickersBefore[0].profile).toBeDefined();
    expect(tickersBefore[0].profile?.stock_positions).toHaveLength(1);

    // 步骤2：导入不含 profile 的备份文件
    const backupWithoutProfile: BackupData = {
      portfolio: [{ symbol: '000001', name: '华夏成长混合' }],
      indices: [],
      positions: {},
      trades: {},
      comboTrades: {},
      config: { autoExportTime: '16:00' },
    };

    const result = await bs.applyBackupData(backupWithoutProfile);

    // 步骤3：验证 marketFundService 内存缓存中 profile 还在（没有被覆盖）
    const tickersAfter = mfs.getAllTickers();
    expect(tickersAfter[0].profile).toBeDefined();
    expect(tickersAfter[0].profile?.stock_positions).toHaveLength(1);
    expect(tickersAfter[0].profile?.stock_positions[0].stock_name).toBe('腾讯控股');

    // 步骤4：验证 applyBackupData 返回的 portfolio 包含 profile
    // BUG：当前返回的 portfolio 不包含 profile，因为是从备份文件构造的
    expect(result.portfolio[0].profile).toBeDefined();
    expect(result.portfolio[0].profile?.stock_positions).toHaveLength(1);
  });

  test('导入备份后，applyBackupData 返回的 portfolio 应包含 localStorage 中已有的 recommended_strategy', async () => {
    const { mfs, bs } = loadBoth();
    mfs.resetCache();

    // 步骤1：模拟已有基金，并添加 recommended_strategy 数据
    mfs.addFund('000001', '华夏成长混合');
    mfs.updateTicker('000001', {
      recommended_strategy: {
        strategy_id: 'trendFollowing',
        reason: '适合趋势追踪',
      },
    });

    // 验证 marketFundService 内存缓存中有 recommended_strategy
    const tickersBefore = mfs.getAllTickers();
    expect(tickersBefore[0].recommended_strategy).toBeDefined();
    expect(tickersBefore[0].recommended_strategy?.strategy_id).toBe('trendFollowing');

    // 步骤2：导入不含 recommended_strategy 的备份文件
    const backupWithoutStrategy: BackupData = {
      portfolio: [{ symbol: '000001', name: '华夏成长混合' }],
      indices: [],
      positions: {},
      trades: {},
      comboTrades: {},
      config: { autoExportTime: '16:00' },
    };

    const result = await bs.applyBackupData(backupWithoutStrategy);

    // 步骤3：验证 marketFundService 内存缓存中 recommended_strategy 还在
    const tickersAfter = mfs.getAllTickers();
    expect(tickersAfter[0].recommended_strategy).toBeDefined();
    expect(tickersAfter[0].recommended_strategy?.strategy_id).toBe('trendFollowing');

    // 步骤4：验证 applyBackupData 返回的 portfolio 包含 recommended_strategy
    // BUG：当前返回的 portfolio 不包含 recommended_strategy
    expect(result.portfolio[0].recommended_strategy).toBeDefined();
    expect(result.portfolio[0].recommended_strategy?.strategy_id).toBe('trendFollowing');
  });
});

// ─── 真实备份文件导入测试 ─────────────────────────────────────────────────────────

describe('真实备份文件导入测试', () => {
  // 从备份文件提取的数据
  const REAL_BACKUP: BackupData = {
    portfolio: [
      { symbol: '023832', name: '华泰柏瑞中证油气产业ETF发起式联接A', previousPrice: 1.4866, netWorthDate: '2026-04-02', currentPrice: 1.4799, realtimeDate: '2026-04-03' },
      { symbol: '004433', name: '南方有色金属ETF联接C', previousPrice: 1.8977, netWorthDate: '2026-04-02', currentPrice: 1.8793, realtimeDate: '2026-04-03' },
      { symbol: '022364', name: '永赢科技智选混合发起A', previousPrice: 3.8018, netWorthDate: '2026-04-02', currentPrice: 3.8894, realtimeDate: '2026-04-03' },
      { symbol: '012328', name: '天弘中证新能源指数增强A', previousPrice: 0.7523, netWorthDate: '2026-04-02', currentPrice: 0.7357, realtimeDate: '2026-04-03' },
      { symbol: '008888', name: '华夏国证半导体芯片ETF联接C', previousPrice: 1.4043, netWorthDate: '2026-04-02', currentPrice: 1.3993, realtimeDate: '2026-04-03' },
      { symbol: '012734', name: '易方达中证人工智能主题ETF联接C', previousPrice: 1.6582, netWorthDate: '2026-04-02', currentPrice: 1.6698, realtimeDate: '2026-04-03' },
      { symbol: '024194', name: '永赢国证商用卫星通信产业ETF发起联接A', previousPrice: 1.4861, netWorthDate: '2026-04-02', currentPrice: 1.4745, realtimeDate: '2026-04-03' },
      { symbol: '011592', name: '博时军工主题股票C', previousPrice: 1.991, netWorthDate: '2026-04-02', currentPrice: 1.988, realtimeDate: '2026-04-03' },
      { symbol: '002611', name: '博时黄金ETF联接C', previousPrice: 3.235, netWorthDate: '2026-04-02', currentPrice: 3.2546, realtimeDate: '2026-04-03' },
      { symbol: '012349', name: '天弘恒生科技ETF联接C', previousPrice: 0.6506, netWorthDate: '2026-04-02', currentPrice: 0.6391, realtimeDate: '2026-04-02' },
      { symbol: '270023', name: '广发全球精选股票(QDII)人民币A', previousPrice: 4.9572, netWorthDate: '2026-04-02', currentPrice: 4.9532, realtimeDate: '2026-04-03' },
      { symbol: '530018', name: '建信深证100指数增强', previousPrice: 2.6475, netWorthDate: '2026-04-02', currentPrice: 2.6287, realtimeDate: '2026-04-03' },
      { symbol: '020640', name: '广发半导体设备ETF联接C', previousPrice: 1.8627, netWorthDate: '2026-04-02', currentPrice: 1.8602, realtimeDate: '2026-04-03' },
      { symbol: '025833', name: '天弘中证电网设备主题指数发起C', previousPrice: 1.2731, netWorthDate: '2026-04-02', currentPrice: 1.2725, realtimeDate: '2026-04-03' },
      { symbol: '270042', name: '广发纳斯达克100ETF联接人民币(QDII)A', previousPrice: 6.8214, netWorthDate: '2026-04-02', currentPrice: 6.8283, realtimeDate: '2026-04-03' },
      { symbol: '015283', name: '华安恒生科技ETF发起式联接(QDII)C', previousPrice: 1.1553, netWorthDate: '2026-04-02', currentPrice: 1.1342, realtimeDate: '2026-04-02' },
      { symbol: '019005', name: '国投瑞银白银期货(LOF)C', previousPrice: 2.0556, netWorthDate: '2026-04-03', currentPrice: 2.0046, realtimeDate: '2026-04-03' },
      { symbol: '161226', name: '国投瑞银白银期货(LOF)A', previousPrice: 2.0758, netWorthDate: '2026-04-03', currentPrice: 2.0243, realtimeDate: '2026-04-03' },
      { symbol: '019173', name: '摩根纳斯达克100指数(QDII)人民币C', previousPrice: 1.455, netWorthDate: '2026-04-02', currentPrice: 1.4565, realtimeDate: '2026-04-03' },
      { symbol: '017437', name: '华宝纳斯达克精选股票发起式(QDII)C', previousPrice: 1.9927, netWorthDate: '2026-04-02', currentPrice: 1.9904, realtimeDate: '2026-04-03' },
      { symbol: '019524', name: '华泰柏瑞纳斯达克100ETF发起式联接(QDII)A', previousPrice: 1.3791, netWorthDate: '2026-04-02', currentPrice: 1.3805, realtimeDate: '2026-04-03' },
    ],
    indices: [
      { symbol: '1.000001', name: '上证指数', current: 3880.1, change: -39.19, changePercent: -1, lastUpdated: '12:50:21' },
      { symbol: '124.HSTECH', name: '恒生科技指数', current: 4679.1, change: -77.35, changePercent: -1.63, lastUpdated: '12:50:23' },
      { symbol: '0.399001', name: '深证成指', current: 13352.9, change: -134.04, changePercent: -0.99, lastUpdated: '12:50:25' },
      { symbol: '0.399006', name: '创业板指', current: 3149.6, change: -23.05, changePercent: -0.73, lastUpdated: '12:50:27' },
    ],
    globalIndices: [
      { symbol: '100.NDX100', name: '纳斯达克100', current: 24045.53, change: 25.54, changePercent: 0.11, lastUpdated: '12:50:29' },
      { symbol: '101.GC00Y', name: 'COMEX黄金', current: 4673.2, change: -6.5, changePercent: -0.14, lastUpdated: '12:50:31' },
      { symbol: '101.SI00Y', name: 'COMEX白银', current: 72.335, change: -0.589, changePercent: -0.81, lastUpdated: '12:50:33' },
    ],
    positions: {
      '161226': { fullCapacity: 2000, initialPosition: 1822.95, startDate: '2026-02-13', initialPrice: 2.139392081516224 },
      '270023': { fullCapacity: 50000, initialPosition: 34196.93, startDate: '2026-02-12', initialPrice: 4.1962830748842075 },
      '270042': { fullCapacity: 25000, initialPosition: 20429.64, startDate: '2026-02-12', initialPrice: 4.975368787115191 },
      '530018': { fullCapacity: 200000, initialPosition: 167924.68, startDate: '2026-02-13', initialPrice: 2.427787463558067 },
      '019173': { fullCapacity: 20000, initialPosition: 15735.89, startDate: '2026-02-13', initialPrice: 1.5804963442804951 },
      '020640': { fullCapacity: 100000, initialPosition: 49633.27, startDate: '2026-02-13', initialPrice: 2.164525998851175 },
      '022364': { fullCapacity: 100000, initialPosition: 84795.12, startDate: '2026-02-13', initialPrice: 3.6066299320644872 },
      '004433': { fullCapacity: 150000, initialPosition: 60232.52, startDate: '2026-02-13', initialPrice: 1.7460963172551975 },
      '011592': { fullCapacity: 100000, initialPosition: 67887.27, startDate: '2026-02-13', initialPrice: 2.173897384443358 },
      '025833': { fullCapacity: 100000, initialPosition: 49322.23, startDate: '2026-02-13', initialPrice: 1.2348668114357348 },
      '019005': { fullCapacity: 50000, initialPosition: 46456.25, startDate: '2026-02-13', initialPrice: -0.012373456208798525 },
      '024194': { fullCapacity: 200000, initialPosition: 130941.01, startDate: '2026-02-13', initialPrice: 1.6770785942158233 },
      '012328': { fullCapacity: 250000, initialPosition: 236814.96, startDate: '2026-02-13', initialPrice: 0.7393785804621464 },
      '019524': { fullCapacity: 200000, initialPosition: 153488.55, startDate: '2026-02-13', initialPrice: 1.4756800672516617 },
      '002611': { fullCapacity: 200000, initialPosition: 131568.67, startDate: '2026-02-13', initialPrice: 2.078414162186181 },
      '023832': { fullCapacity: 100000, initialPosition: 37467.96, startDate: '2026-02-13', initialPrice: 1.266045634536815 },
      '017437': { fullCapacity: 15000, initialPosition: 14833.73, startDate: '2026-02-13', initialPrice: 2.2010815878406853 },
      '012349': { fullCapacity: 300000, initialPosition: 277278.7, startDate: '2026-02-13', initialPrice: 0.7012855644122682 },
      '008888': { fullCapacity: 200000, initialPosition: 166145.72, startDate: '2026-02-13', initialPrice: 0.7335156607825948 },
      '015283': { fullCapacity: 300000, initialPosition: 277163.7, startDate: '2026-02-13', initialPrice: 1.4777354911086844 },
      '012734': { fullCapacity: 280000, initialPosition: 241205.07, startDate: '2026-02-13', initialPrice: 1.3620450888325026 },
    },
    trades: {
      '270023': [
        { id: 'ihi279ajq', date: '2026-04-01', type: 'buy', shares: 990.93, price: 5.0377, fee: 7.99 },
        { id: 'r24df4bc8', date: '2026-03-30', type: 'buy', shares: 1052.72, price: 4.742, fee: 7.99 },
      ],
      '270042': [
        { id: 'trade_1775193600393_op03gbn8v', date: '2026-04-01', type: 'buy', shares: 1.46, price: 6.8274, fee: 0.01 },
      ],
    },
    comboTrades: {},
    config: { autoExportTime: '16:00', autoBackupEnabled: false },
  };

  beforeEach(() => { localStorage.clear(); resetFundCache(); });
  afterEach(() => { localStorage.clear(); jest.resetModules(); resetFundCache(); });

  test('导入真实备份文件后验证 fund_all_funds_data 结构', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    mfs.resetCache();

    // 执行导入
    const result = await bs.applyBackupData(REAL_BACKUP);

    // 验证返回的 portfolio 数量
    expect(result.portfolio).toHaveLength(21);

    // 验证 fund_all_funds_data 中的数据
    const fundData = JSON.parse(localStorage.getItem(STORAGE_KEYS.FUND_DATA)!);
    expect(fundData).toHaveLength(21);

    // 验证第一个基金的结构
    const firstFund = fundData.find((f: any) => f.info.ticker.symbol === '023832');
    expect(firstFund).toBeDefined();
    expect(firstFund.info.ticker.name).toBe('华泰柏瑞中证油气产业ETF发起式联接A');
    expect(firstFund.info.position).toBeDefined();
    expect(firstFund.info.position.fullCapacity).toBe(100000);
    expect(firstFund.trades).toBeDefined();
    expect(Array.isArray(firstFund.trades)).toBe(true);
    expect(Array.isArray(firstFund.intraday)).toBe(true);
    expect(Array.isArray(firstFund.history)).toBe(true);
  });

  test('导入真实备份文件后验证基金持仓数据', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    mfs.resetCache();

    await bs.applyBackupData(REAL_BACKUP);

    // 验证通过 marketFundService 获取的持仓数据
    const pos_270023 = mfs.getPosition('270023');
    expect(pos_270023).not.toBeNull();
    expect(pos_270023.fullCapacity).toBe(50000);
    expect(pos_270023.initialPosition).toBeCloseTo(34196.93, 1);
    expect(pos_270023.startDate).toBe('2026-02-12');

    const pos_161226 = mfs.getPosition('161226');
    expect(pos_161226).not.toBeNull();
    expect(pos_161226.fullCapacity).toBe(2000);
    expect(pos_161226.initialPosition).toBeCloseTo(1822.95, 1);
  });

  test('导入真实备份文件后验证基金交易记录', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    mfs.resetCache();

    await bs.applyBackupData(REAL_BACKUP);

    // 验证通过 marketFundService 获取的交易记录
    const trades_270023 = mfs.getTrades('270023');
    expect(trades_270023).toHaveLength(2);
    expect(trades_270023[0].id).toBe('ihi279ajq');
    expect(trades_270023[0].type).toBe('buy');
    expect(trades_270023[0].shares).toBeCloseTo(990.93, 2);

    const trades_270042 = mfs.getTrades('270042');
    expect(trades_270042).toHaveLength(1);
    expect(trades_270042[0].shares).toBeCloseTo(1.46, 2);
  });

  test('导入真实备份文件后验证 fund_all_indices_data 结构', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    mfs.resetCache();

    await bs.applyBackupData(REAL_BACKUP);

    // 验证 fund_all_indices_data 中的数据
    const indexData = JSON.parse(localStorage.getItem(STORAGE_KEYS.INDEX_DATA)!);
    // 4个国内指数 + 3个全球指数 = 7个
    expect(indexData).toHaveLength(7);

    // 验证指数符号
    const symbols = indexData.map((m: any) => m.info.symbol);
    expect(symbols).toContain('1.000001');
    expect(symbols).toContain('0.399001');
    expect(symbols).toContain('0.399006');
    expect(symbols).toContain('124.HSTECH');
    expect(symbols).toContain('100.NDX100');
    expect(symbols).toContain('101.GC00Y');
    expect(symbols).toContain('101.SI00Y');

    // 验证指数结构
    const shIndex = indexData.find((m: any) => m.info.symbol === '1.000001');
    expect(shIndex).toBeDefined();
    expect(shIndex.info.name).toBe('上证指数');
    expect(shIndex.info.current).toBe(3880.1);
    expect(Array.isArray(shIndex.intraday)).toBe(true);
    expect(Array.isArray(shIndex.history)).toBe(true);
  });

  test('导入真实备份文件后验证指数顺序', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    mfs.resetCache();

    await bs.applyBackupData(REAL_BACKUP);

    // 验证指数顺序：国内指数 + 全球指数
    const indexData = JSON.parse(localStorage.getItem(STORAGE_KEYS.INDEX_DATA)!);
    const symbols = indexData.map((m: any) => m.info.symbol);

    // 验证顺序：先国内（4个），后全球（3个）
    expect(symbols.slice(0, 4)).toEqual(['1.000001', '124.HSTECH', '0.399001', '0.399006']);
    expect(symbols.slice(4)).toEqual(['100.NDX100', '101.GC00Y', '101.SI00Y']);
  });
});

// ─── 导入后导出一致性测试 ─────────────────────────────────────────────────────────

describe('导入后导出一致性测试', () => {
  // 从备份文件提取的数据（同上）
  const REAL_BACKUP: BackupData = {
    portfolio: [
      { symbol: '023832', name: '华泰柏瑞中证油气产业ETF发起式联接A', previousPrice: 1.4866, netWorthDate: '2026-04-02', currentPrice: 1.4799, realtimeDate: '2026-04-03' },
      { symbol: '004433', name: '南方有色金属ETF联接C', previousPrice: 1.8977, netWorthDate: '2026-04-02', currentPrice: 1.8793, realtimeDate: '2026-04-03' },
      { symbol: '022364', name: '永赢科技智选混合发起A', previousPrice: 3.8018, netWorthDate: '2026-04-02', currentPrice: 3.8894, realtimeDate: '2026-04-03' },
      { symbol: '012328', name: '天弘中证新能源指数增强A', previousPrice: 0.7523, netWorthDate: '2026-04-02', currentPrice: 0.7357, realtimeDate: '2026-04-03' },
      { symbol: '008888', name: '华夏国证半导体芯片ETF联接C', previousPrice: 1.4043, netWorthDate: '2026-04-02', currentPrice: 1.3993, realtimeDate: '2026-04-03' },
      { symbol: '012734', name: '易方达中证人工智能主题ETF联接C', previousPrice: 1.6582, netWorthDate: '2026-04-02', currentPrice: 1.6698, realtimeDate: '2026-04-03' },
      { symbol: '024194', name: '永赢国证商用卫星通信产业ETF发起联接A', previousPrice: 1.4861, netWorthDate: '2026-04-02', currentPrice: 1.4745, realtimeDate: '2026-04-03' },
      { symbol: '011592', name: '博时军工主题股票C', previousPrice: 1.991, netWorthDate: '2026-04-02', currentPrice: 1.988, realtimeDate: '2026-04-03' },
      { symbol: '002611', name: '博时黄金ETF联接C', previousPrice: 3.235, netWorthDate: '2026-04-02', currentPrice: 3.2546, realtimeDate: '2026-04-03' },
      { symbol: '012349', name: '天弘恒生科技ETF联接C', previousPrice: 0.6506, netWorthDate: '2026-04-02', currentPrice: 0.6391, realtimeDate: '2026-04-02' },
      { symbol: '270023', name: '广发全球精选股票(QDII)人民币A', previousPrice: 4.9572, netWorthDate: '2026-04-02', currentPrice: 4.9532, realtimeDate: '2026-04-03' },
      { symbol: '530018', name: '建信深证100指数增强', previousPrice: 2.6475, netWorthDate: '2026-04-02', currentPrice: 2.6287, realtimeDate: '2026-04-03' },
      { symbol: '020640', name: '广发半导体设备ETF联接C', previousPrice: 1.8627, netWorthDate: '2026-04-02', currentPrice: 1.8602, realtimeDate: '2026-04-03' },
      { symbol: '025833', name: '天弘中证电网设备主题指数发起C', previousPrice: 1.2731, netWorthDate: '2026-04-02', currentPrice: 1.2725, realtimeDate: '2026-04-03' },
      { symbol: '270042', name: '广发纳斯达克100ETF联接人民币(QDII)A', previousPrice: 6.8214, netWorthDate: '2026-04-02', currentPrice: 6.8283, realtimeDate: '2026-04-03' },
      { symbol: '015283', name: '华安恒生科技ETF发起式联接(QDII)C', previousPrice: 1.1553, netWorthDate: '2026-04-02', currentPrice: 1.1342, realtimeDate: '2026-04-02' },
      { symbol: '019005', name: '国投瑞银白银期货(LOF)C', previousPrice: 2.0556, netWorthDate: '2026-04-03', currentPrice: 2.0046, realtimeDate: '2026-04-03' },
      { symbol: '161226', name: '国投瑞银白银期货(LOF)A', previousPrice: 2.0758, netWorthDate: '2026-04-03', currentPrice: 2.0243, realtimeDate: '2026-04-03' },
      { symbol: '019173', name: '摩根纳斯达克100指数(QDII)人民币C', previousPrice: 1.455, netWorthDate: '2026-04-02', currentPrice: 1.4565, realtimeDate: '2026-04-03' },
      { symbol: '017437', name: '华宝纳斯达克精选股票发起式(QDII)C', previousPrice: 1.9927, netWorthDate: '2026-04-02', currentPrice: 1.9904, realtimeDate: '2026-04-03' },
      { symbol: '019524', name: '华泰柏瑞纳斯达克100ETF发起式联接(QDII)A', previousPrice: 1.3791, netWorthDate: '2026-04-02', currentPrice: 1.3805, realtimeDate: '2026-04-03' },
    ],
    indices: [
      { symbol: '1.000001', name: '上证指数', current: 3880.1, change: -39.19, changePercent: -1, lastUpdated: '12:50:21' },
      { symbol: '124.HSTECH', name: '恒生科技指数', current: 4679.1, change: -77.35, changePercent: -1.63, lastUpdated: '12:50:23' },
      { symbol: '0.399001', name: '深证成指', current: 13352.9, change: -134.04, changePercent: -0.99, lastUpdated: '12:50:25' },
      { symbol: '0.399006', name: '创业板指', current: 3149.6, change: -23.05, changePercent: -0.73, lastUpdated: '12:50:27' },
    ],
    globalIndices: [
      { symbol: '100.NDX100', name: '纳斯达克100', current: 24045.53, change: 25.54, changePercent: 0.11, lastUpdated: '12:50:29' },
      { symbol: '101.GC00Y', name: 'COMEX黄金', current: 4673.2, change: -6.5, changePercent: -0.14, lastUpdated: '12:50:31' },
      { symbol: '101.SI00Y', name: 'COMEX白银', current: 72.335, change: -0.589, changePercent: -0.81, lastUpdated: '12:50:33' },
    ],
    positions: {
      '161226': { fullCapacity: 2000, initialPosition: 1822.95, startDate: '2026-02-13', initialPrice: 2.139392081516224 },
      '270023': { fullCapacity: 50000, initialPosition: 34196.93, startDate: '2026-02-12', initialPrice: 4.1962830748842075 },
      '270042': { fullCapacity: 25000, initialPosition: 20429.64, startDate: '2026-02-12', initialPrice: 4.975368787115191 },
      '530018': { fullCapacity: 200000, initialPosition: 167924.68, startDate: '2026-02-13', initialPrice: 2.427787463558067 },
      '019173': { fullCapacity: 20000, initialPosition: 15735.89, startDate: '2026-02-13', initialPrice: 1.5804963442804951 },
      '020640': { fullCapacity: 100000, initialPosition: 49633.27, startDate: '2026-02-13', initialPrice: 2.164525998851175 },
      '022364': { fullCapacity: 100000, initialPosition: 84795.12, startDate: '2026-02-13', initialPrice: 3.6066299320644872 },
      '004433': { fullCapacity: 150000, initialPosition: 60232.52, startDate: '2026-02-13', initialPrice: 1.7460963172551975 },
      '011592': { fullCapacity: 100000, initialPosition: 67887.27, startDate: '2026-02-13', initialPrice: 2.173897384443358 },
      '025833': { fullCapacity: 100000, initialPosition: 49322.23, startDate: '2026-02-13', initialPrice: 1.2348668114357348 },
      '019005': { fullCapacity: 50000, initialPosition: 46456.25, startDate: '2026-02-13', initialPrice: -0.012373456208798525 },
      '024194': { fullCapacity: 200000, initialPosition: 130941.01, startDate: '2026-02-13', initialPrice: 1.6770785942158233 },
      '012328': { fullCapacity: 250000, initialPosition: 236814.96, startDate: '2026-02-13', initialPrice: 0.7393785804621464 },
      '019524': { fullCapacity: 200000, initialPosition: 153488.55, startDate: '2026-02-13', initialPrice: 1.4756800672516617 },
      '002611': { fullCapacity: 200000, initialPosition: 131568.67, startDate: '2026-02-13', initialPrice: 2.078414162186181 },
      '023832': { fullCapacity: 100000, initialPosition: 37467.96, startDate: '2026-02-13', initialPrice: 1.266045634536815 },
      '017437': { fullCapacity: 15000, initialPosition: 14833.73, startDate: '2026-02-13', initialPrice: 2.2010815878406853 },
      '012349': { fullCapacity: 300000, initialPosition: 277278.7, startDate: '2026-02-13', initialPrice: 0.7012855644122682 },
      '008888': { fullCapacity: 200000, initialPosition: 166145.72, startDate: '2026-02-13', initialPrice: 0.7335156607825948 },
      '015283': { fullCapacity: 300000, initialPosition: 277163.7, startDate: '2026-02-13', initialPrice: 1.4777354911086844 },
      '012734': { fullCapacity: 280000, initialPosition: 241205.07, startDate: '2026-02-13', initialPrice: 1.3620450888325026 },
    },
    trades: {
      '270023': [
        { id: 'ihi279ajq', date: '2026-04-01', type: 'buy', shares: 990.93, price: 5.0377, fee: 7.99 },
        { id: 'r24df4bc8', date: '2026-03-30', type: 'buy', shares: 1052.72, price: 4.742, fee: 7.99 },
      ],
      '270042': [
        { id: 'trade_1775193600393_op03gbn8v', date: '2026-04-01', type: 'buy', shares: 1.46, price: 6.8274, fee: 0.01 },
      ],
    },
    comboTrades: {},
    config: { autoExportTime: '16:00', autoBackupEnabled: false },
  };

  beforeEach(() => { localStorage.clear(); resetFundCache(); });
  afterEach(() => { localStorage.clear(); jest.resetModules(); resetFundCache(); });

  test('导入后导出数据一致性：基金列表', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    mfs.resetCache();

    // 先导入
    await bs.applyBackupData(REAL_BACKUP);

    // 从 marketFundService 获取当前状态
    const symbols = mfs.getAllFundSymbols();
    const portfolio = symbols.map(sym => {
      const info = mfs.getFundInfo(sym);
      return { id: 'test-id', symbol: sym, name: info?.name || '', market: 'Fund' };
    });

    // 构建导出数据
    const indexData = JSON.parse(localStorage.getItem(STORAGE_KEYS.INDEX_DATA) || '[]');
    const indicesConfig = indexData.map((m: any) => m.info.symbol);
    const marketIndices = indexData;

    const exportedData = await bs.buildBackupData(portfolio, indicesConfig, marketIndices);

    // 比较基金列表
    expect(exportedData.portfolio).toHaveLength(REAL_BACKUP.portfolio.length);

    // 比较每个基金的符号和名称
    const importSymbols = REAL_BACKUP.portfolio.map(f => f.symbol);
    const exportSymbols = exportedData.portfolio.map(f => f.symbol);
    expect(exportSymbols).toEqual(importSymbols);

    // 比较名称
    for (const exportedFund of exportedData.portfolio) {
      const importedFund = REAL_BACKUP.portfolio.find(f => f.symbol === exportedFund.symbol);
      expect(importedFund).toBeDefined();
      expect(exportedFund.name).toBe(importedFund!.name);
    }
  });

  test('导入后导出数据一致性：指数列表', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    mfs.resetCache();

    // 先导入
    await bs.applyBackupData(REAL_BACKUP);

    // 从 localStorage 获取当前指数状态
    const indexData = JSON.parse(localStorage.getItem(STORAGE_KEYS.INDEX_DATA) || '[]');
    const indicesConfig = indexData.map((m: any) => m.info.symbol);
    const marketIndices = indexData;

    // 构建导出数据
    const symbols = mfs.getAllFundSymbols();
    const portfolio = symbols.map(sym => {
      const info = mfs.getFundInfo(sym);
      return { id: 'test-id', symbol: sym, name: info?.name || '', market: 'Fund' };
    });
    const exportedData = await bs.buildBackupData(portfolio, indicesConfig, marketIndices);

    // 合并导入时的 indices 和 globalIndices
    const importedIndices = [...REAL_BACKUP.indices, ...REAL_BACKUP.globalIndices];

    // 比较指数数量
    expect(exportedData.indices).toHaveLength(importedIndices.length);

    // 比较每个指数的符号
    const importSymbols = importedIndices.map(i => i.symbol);
    const exportSymbols = exportedData.indices.map(i => i.symbol);
    expect(exportSymbols).toEqual(importSymbols);

    // 比较指数名称
    for (const exportedIdx of exportedData.indices) {
      const importedIdx = importedIndices.find(i => i.symbol === exportedIdx.symbol);
      expect(importedIdx).toBeDefined();
      expect(exportedIdx.name).toBe(importedIdx!.name);
    }
  });

  test('导入后导出数据一致性：持仓数据', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    mfs.resetCache();

    // 先导入
    await bs.applyBackupData(REAL_BACKUP);

    // 从 localStorage 获取当前状态
    const indexData = JSON.parse(localStorage.getItem(STORAGE_KEYS.INDEX_DATA) || '[]');
    const indicesConfig = indexData.map((m: any) => m.info.symbol);
    const marketIndices = indexData;
    const symbols = mfs.getAllFundSymbols();
    const portfolio = symbols.map(sym => {
      const info = mfs.getFundInfo(sym);
      return { id: 'test-id', symbol: sym, name: info?.name || '', market: 'Fund' };
    });

    // 构建导出数据
    const exportedData = await bs.buildBackupData(portfolio, indicesConfig, marketIndices);

    // 比较持仓数量（导入时有21个持仓）
    const importedPositionKeys = Object.keys(REAL_BACKUP.positions);
    const exportedPositionKeys = Object.keys(exportedData.positions);
    expect(exportedPositionKeys.sort()).toEqual(importedPositionKeys.sort());

    // 比较每个持仓的关键字段
    for (const sym of importedPositionKeys) {
      const importedPos = REAL_BACKUP.positions[sym];
      const exportedPos = exportedData.positions[sym];
      expect(exportedPos).toBeDefined();
      expect(exportedPos.fullCapacity).toBe(importedPos.fullCapacity);
      expect(exportedPos.initialPosition).toBeCloseTo(importedPos.initialPosition, 1);
      expect(exportedPos.startDate).toBe(importedPos.startDate);
      // initialPrice 精度可能略有差异，允许小误差
      if (importedPos.initialPrice !== null && importedPos.initialPrice !== undefined) {
        expect(exportedPos.initialPrice).toBeCloseTo(importedPos.initialPrice, 5);
      }
    }
  });

  test('导入后导出数据一致性：交易记录', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    mfs.resetCache();

    // 先导入
    await bs.applyBackupData(REAL_BACKUP);

    // 从 localStorage 获取当前状态
    const indexData = JSON.parse(localStorage.getItem(STORAGE_KEYS.INDEX_DATA) || '[]');
    const indicesConfig = indexData.map((m: any) => m.info.symbol);
    const marketIndices = indexData;
    const symbols = mfs.getAllFundSymbols();
    const portfolio = symbols.map(sym => {
      const info = mfs.getFundInfo(sym);
      return { id: 'test-id', symbol: sym, name: info?.name || '', market: 'Fund' };
    });

    // 构建导出数据
    const exportedData = await bs.buildBackupData(portfolio, indicesConfig, marketIndices);

    // 比较交易记录
    const importedTradeKeys = Object.keys(REAL_BACKUP.trades);
    const exportedTradeKeys = Object.keys(exportedData.trades);
    expect(exportedTradeKeys.sort()).toEqual(importedTradeKeys.sort());

    // 比较每个基金的交易记录
    for (const sym of importedTradeKeys) {
      const importedTrades = REAL_BACKUP.trades[sym];
      const exportedTrades = exportedData.trades[sym];
      expect(exportedTrades).toHaveLength(importedTrades.length);

      // 比较每条交易记录的关键字段
      for (let i = 0; i < importedTrades.length; i++) {
        const imported = importedTrades[i];
        const exported = exportedTrades[i];
        expect(exported.id).toBe(imported.id);
        expect(exported.date).toBe(imported.date);
        expect(exported.type).toBe(imported.type);
        expect(exported.shares).toBeCloseTo(imported.shares, 2);
        expect(exported.price).toBeCloseTo(imported.price, 4);
        expect(exported.fee).toBeCloseTo(imported.fee, 2);
      }
    }
  });

  test('导入后导出数据一致性：配置', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    mfs.resetCache();

    // 先导入
    await bs.applyBackupData(REAL_BACKUP);

    // 从 localStorage 获取当前状态
    const indexData = JSON.parse(localStorage.getItem(STORAGE_KEYS.INDEX_DATA) || '[]');
    const indicesConfig = indexData.map((m: any) => m.info.symbol);
    const marketIndices = indexData;
    const symbols = mfs.getAllFundSymbols();
    const portfolio = symbols.map(sym => {
      const info = mfs.getFundInfo(sym);
      return { id: 'test-id', symbol: sym, name: info?.name || '', market: 'Fund' };
    });

    // 构建导出数据
    const exportedData = await bs.buildBackupData(portfolio, indicesConfig, marketIndices);

    // 比较配置
    expect(exportedData.config.autoExportTime).toBe(REAL_BACKUP.config.autoExportTime);
    expect(exportedData.config.autoBackupEnabled).toBe(REAL_BACKUP.config.autoBackupEnabled);
  });

  test('导入后导出数据一致性：完整数据比对', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    mfs.resetCache();

    // 先导入
    await bs.applyBackupData(REAL_BACKUP);

    // 从 localStorage 获取当前状态
    const indexData = JSON.parse(localStorage.getItem(STORAGE_KEYS.INDEX_DATA) || '[]');
    const indicesConfig = indexData.map((m: any) => m.info.symbol);
    const marketIndices = indexData;
    const symbols = mfs.getAllFundSymbols();
    const portfolio = symbols.map(sym => {
      const info = mfs.getFundInfo(sym);
      return { id: 'test-id', symbol: sym, name: info?.name || '', market: 'Fund' };
    });

    // 构建导出数据
    const exportedData = await bs.buildBackupData(portfolio, indicesConfig, marketIndices);

    // 合并导入时的 indices 和 globalIndices
    const importedIndices = [...REAL_BACKUP.indices, ...REAL_BACKUP.globalIndices];

    // 整体数量验证
    expect(exportedData.portfolio).toHaveLength(REAL_BACKUP.portfolio.length);
    expect(exportedData.indices).toHaveLength(importedIndices.length);
    expect(Object.keys(exportedData.positions)).toHaveLength(Object.keys(REAL_BACKUP.positions).length);
    expect(Object.keys(exportedData.trades)).toHaveLength(Object.keys(REAL_BACKUP.trades).length);

    // 验证所有基金符号都包含
    const allImportedSymbols = REAL_BACKUP.portfolio.map(f => f.symbol);
    const allExportedSymbols = exportedData.portfolio.map(f => f.symbol);
    expect(allExportedSymbols.sort()).toEqual(allImportedSymbols.sort());

    // 验证所有指数符号都包含
    const allImportedIndexSymbols = importedIndices.map(i => i.symbol);
    const allExportedIndexSymbols = exportedData.indices.map(i => i.symbol);
    expect(allExportedIndexSymbols.sort()).toEqual(allImportedIndexSymbols.sort());

    // 验证所有持仓符号都包含
    const allImportedPositionSymbols = Object.keys(REAL_BACKUP.positions);
    const allExportedPositionSymbols = Object.keys(exportedData.positions);
    expect(allExportedPositionSymbols.sort()).toEqual(allImportedPositionSymbols.sort());
  });
});

// ─── 导入-导出-再导入循环一致性测试 ─────────────────────────────────────────────

describe('导入-导出-再导入循环一致性测试', () => {
  // 从备份文件提取的数据（同上）
  const ORIGINAL_BACKUP: BackupData = {
    portfolio: [
      { symbol: '023832', name: '华泰柏瑞中证油气产业ETF发起式联接A', previousPrice: 1.4866, netWorthDate: '2026-04-02', currentPrice: 1.4799, realtimeDate: '2026-04-03' },
      { symbol: '004433', name: '南方有色金属ETF联接C', previousPrice: 1.8977, netWorthDate: '2026-04-02', currentPrice: 1.8793, realtimeDate: '2026-04-03' },
      { symbol: '022364', name: '永赢科技智选混合发起A', previousPrice: 3.8018, netWorthDate: '2026-04-02', currentPrice: 3.8894, realtimeDate: '2026-04-03' },
      { symbol: '012328', name: '天弘中证新能源指数增强A', previousPrice: 0.7523, netWorthDate: '2026-04-02', currentPrice: 0.7357, realtimeDate: '2026-04-03' },
      { symbol: '008888', name: '华夏国证半导体芯片ETF联接C', previousPrice: 1.4043, netWorthDate: '2026-04-02', currentPrice: 1.3993, realtimeDate: '2026-04-03' },
      { symbol: '012734', name: '易方达中证人工智能主题ETF联接C', previousPrice: 1.6582, netWorthDate: '2026-04-02', currentPrice: 1.6698, realtimeDate: '2026-04-03' },
      { symbol: '024194', name: '永赢国证商用卫星通信产业ETF发起联接A', previousPrice: 1.4861, netWorthDate: '2026-04-02', currentPrice: 1.4745, realtimeDate: '2026-04-03' },
      { symbol: '011592', name: '博时军工主题股票C', previousPrice: 1.991, netWorthDate: '2026-04-02', currentPrice: 1.988, realtimeDate: '2026-04-03' },
      { symbol: '002611', name: '博时黄金ETF联接C', previousPrice: 3.235, netWorthDate: '2026-04-02', currentPrice: 3.2546, realtimeDate: '2026-04-03' },
      { symbol: '012349', name: '天弘恒生科技ETF联接C', previousPrice: 0.6506, netWorthDate: '2026-04-02', currentPrice: 0.6391, realtimeDate: '2026-04-02' },
      { symbol: '270023', name: '广发全球精选股票(QDII)人民币A', previousPrice: 4.9572, netWorthDate: '2026-04-02', currentPrice: 4.9532, realtimeDate: '2026-04-03' },
      { symbol: '530018', name: '建信深证100指数增强', previousPrice: 2.6475, netWorthDate: '2026-04-02', currentPrice: 2.6287, realtimeDate: '2026-04-03' },
      { symbol: '020640', name: '广发半导体设备ETF联接C', previousPrice: 1.8627, netWorthDate: '2026-04-02', currentPrice: 1.8602, realtimeDate: '2026-04-03' },
      { symbol: '025833', name: '天弘中证电网设备主题指数发起C', previousPrice: 1.2731, netWorthDate: '2026-04-02', currentPrice: 1.2725, realtimeDate: '2026-04-03' },
      { symbol: '270042', name: '广发纳斯达克100ETF联接人民币(QDII)A', previousPrice: 6.8214, netWorthDate: '2026-04-02', currentPrice: 6.8283, realtimeDate: '2026-04-03' },
      { symbol: '015283', name: '华安恒生科技ETF发起式联接(QDII)C', previousPrice: 1.1553, netWorthDate: '2026-04-02', currentPrice: 1.1342, realtimeDate: '2026-04-02' },
      { symbol: '019005', name: '国投瑞银白银期货(LOF)C', previousPrice: 2.0556, netWorthDate: '2026-04-03', currentPrice: 2.0046, realtimeDate: '2026-04-03' },
      { symbol: '161226', name: '国投瑞银白银期货(LOF)A', previousPrice: 2.0758, netWorthDate: '2026-04-03', currentPrice: 2.0243, realtimeDate: '2026-04-03' },
      { symbol: '019173', name: '摩根纳斯达克100指数(QDII)人民币C', previousPrice: 1.455, netWorthDate: '2026-04-02', currentPrice: 1.4565, realtimeDate: '2026-04-03' },
      { symbol: '017437', name: '华宝纳斯达克精选股票发起式(QDII)C', previousPrice: 1.9927, netWorthDate: '2026-04-02', currentPrice: 1.9904, realtimeDate: '2026-04-03' },
      { symbol: '019524', name: '华泰柏瑞纳斯达克100ETF发起式联接(QDII)A', previousPrice: 1.3791, netWorthDate: '2026-04-02', currentPrice: 1.3805, realtimeDate: '2026-04-03' },
    ],
    indices: [
      { symbol: '1.000001', name: '上证指数', current: 3880.1, change: -39.19, changePercent: -1, lastUpdated: '12:50:21' },
      { symbol: '124.HSTECH', name: '恒生科技指数', current: 4679.1, change: -77.35, changePercent: -1.63, lastUpdated: '12:50:23' },
      { symbol: '0.399001', name: '深证成指', current: 13352.9, change: -134.04, changePercent: -0.99, lastUpdated: '12:50:25' },
      { symbol: '0.399006', name: '创业板指', current: 3149.6, change: -23.05, changePercent: -0.73, lastUpdated: '12:50:27' },
    ],
    globalIndices: [
      { symbol: '100.NDX100', name: '纳斯达克100', current: 24045.53, change: 25.54, changePercent: 0.11, lastUpdated: '12:50:29' },
      { symbol: '101.GC00Y', name: 'COMEX黄金', current: 4673.2, change: -6.5, changePercent: -0.14, lastUpdated: '12:50:31' },
      { symbol: '101.SI00Y', name: 'COMEX白银', current: 72.335, change: -0.589, changePercent: -0.81, lastUpdated: '12:50:33' },
    ],
    positions: {
      '161226': { fullCapacity: 2000, initialPosition: 1822.95, startDate: '2026-02-13', initialPrice: 2.139392081516224 },
      '270023': { fullCapacity: 50000, initialPosition: 34196.93, startDate: '2026-02-12', initialPrice: 4.1962830748842075 },
      '270042': { fullCapacity: 25000, initialPosition: 20429.64, startDate: '2026-02-12', initialPrice: 4.975368787115191 },
      '530018': { fullCapacity: 200000, initialPosition: 167924.68, startDate: '2026-02-13', initialPrice: 2.427787463558067 },
      '019173': { fullCapacity: 20000, initialPosition: 15735.89, startDate: '2026-02-13', initialPrice: 1.5804963442804951 },
      '020640': { fullCapacity: 100000, initialPosition: 49633.27, startDate: '2026-02-13', initialPrice: 2.164525998851175 },
      '022364': { fullCapacity: 100000, initialPosition: 84795.12, startDate: '2026-02-13', initialPrice: 3.6066299320644872 },
      '004433': { fullCapacity: 150000, initialPosition: 60232.52, startDate: '2026-02-13', initialPrice: 1.7460963172551975 },
      '011592': { fullCapacity: 100000, initialPosition: 67887.27, startDate: '2026-02-13', initialPrice: 2.173897384443358 },
      '025833': { fullCapacity: 100000, initialPosition: 49322.23, startDate: '2026-02-13', initialPrice: 1.2348668114357348 },
      '019005': { fullCapacity: 50000, initialPosition: 46456.25, startDate: '2026-02-13', initialPrice: -0.012373456208798525 },
      '024194': { fullCapacity: 200000, initialPosition: 130941.01, startDate: '2026-02-13', initialPrice: 1.6770785942158233 },
      '012328': { fullCapacity: 250000, initialPosition: 236814.96, startDate: '2026-02-13', initialPrice: 0.7393785804621464 },
      '019524': { fullCapacity: 200000, initialPosition: 153488.55, startDate: '2026-02-13', initialPrice: 1.4756800672516617 },
      '002611': { fullCapacity: 200000, initialPosition: 131568.67, startDate: '2026-02-13', initialPrice: 2.078414162186181 },
      '023832': { fullCapacity: 100000, initialPosition: 37467.96, startDate: '2026-02-13', initialPrice: 1.266045634536815 },
      '017437': { fullCapacity: 15000, initialPosition: 14833.73, startDate: '2026-02-13', initialPrice: 2.2010815878406853 },
      '012349': { fullCapacity: 300000, initialPosition: 277278.7, startDate: '2026-02-13', initialPrice: 0.7012855644122682 },
      '008888': { fullCapacity: 200000, initialPosition: 166145.72, startDate: '2026-02-13', initialPrice: 0.7335156607825948 },
      '015283': { fullCapacity: 300000, initialPosition: 277163.7, startDate: '2026-02-13', initialPrice: 1.4777354911086844 },
      '012734': { fullCapacity: 280000, initialPosition: 241205.07, startDate: '2026-02-13', initialPrice: 1.3620450888325026 },
    },
    trades: {
      '270023': [
        { id: 'ihi279ajq', date: '2026-04-01', type: 'buy', shares: 990.93, price: 5.0377, fee: 7.99 },
        { id: 'r24df4bc8', date: '2026-03-30', type: 'buy', shares: 1052.72, price: 4.742, fee: 7.99 },
      ],
      '270042': [
        { id: 'trade_1775193600393_op03gbn8v', date: '2026-04-01', type: 'buy', shares: 1.46, price: 6.8274, fee: 0.01 },
      ],
    },
    comboTrades: {},
    config: { autoExportTime: '16:00', autoBackupEnabled: false },
  };

  beforeEach(() => { localStorage.clear(); resetFundCache(); });
  afterEach(() => { localStorage.clear(); jest.resetModules(); resetFundCache(); });

  // 辅助函数：保存localStorage快照
  function saveLocalStorageSnapshot(): {
    fund_all_funds_data: any;
    fund_all_indices_data: any;
    fund_system_config: any;
  } {
    return {
      fund_all_funds_data: JSON.parse(localStorage.getItem(STORAGE_KEYS.FUND_DATA) || '[]'),
      fund_all_indices_data: JSON.parse(localStorage.getItem(STORAGE_KEYS.INDEX_DATA) || '[]'),
      fund_system_config: JSON.parse(localStorage.getItem(STORAGE_KEYS.SYSTEM_CONFIG) || '{}'),
    };
  }

  test('导入-导出-再导入循环一致性：基金顺序保持', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    mfs.resetCache();

    // 步骤1：用原始文件导入
    await bs.applyBackupData(ORIGINAL_BACKUP);

    // 步骤2：保存快照1
    const snapshot1 = saveLocalStorageSnapshot();
    const snapshot1FundSymbols = snapshot1.fund_all_funds_data.map((f: any) => f.info.ticker.symbol);

    // 步骤3：构建导出数据
    const symbols = mfs.getAllFundSymbols();
    const portfolio = symbols.map(sym => {
      const info = mfs.getFundInfo(sym);
      return { id: 'test-id', symbol: sym, name: info?.name || '', market: 'Fund' };
    });
    const indicesConfig = snapshot1.fund_all_indices_data.map((m: any) => m.info.symbol);
    const exportedData = await bs.buildBackupData(portfolio, indicesConfig, snapshot1.fund_all_indices_data);

    // 步骤4：清空localStorage
    localStorage.clear();
    resetFundCache();

    // 步骤5：用导出数据导入
    await bs.applyBackupData(exportedData);

    // 步骤6：保存快照2
    const snapshot2 = saveLocalStorageSnapshot();
    const snapshot2FundSymbols = snapshot2.fund_all_funds_data.map((f: any) => f.info.ticker.symbol);

    // 步骤7：验证基金顺序一致
    expect(snapshot2FundSymbols).toEqual(snapshot1FundSymbols);
  });

  test('导入-导出-再导入循环一致性：指数顺序保持', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    mfs.resetCache();

    // 步骤1：用原始文件导入
    await bs.applyBackupData(ORIGINAL_BACKUP);

    // 步骤2：保存快照1
    const snapshot1 = saveLocalStorageSnapshot();
    const snapshot1IndexSymbols = snapshot1.fund_all_indices_data.map((m: any) => m.info.symbol);

    // 步骤3：构建导出数据
    const symbols = mfs.getAllFundSymbols();
    const portfolio = symbols.map(sym => {
      const info = mfs.getFundInfo(sym);
      return { id: 'test-id', symbol: sym, name: info?.name || '', market: 'Fund' };
    });
    const indicesConfig = snapshot1.fund_all_indices_data.map((m: any) => m.info.symbol);
    const exportedData = await bs.buildBackupData(portfolio, indicesConfig, snapshot1.fund_all_indices_data);

    // 步骤4：清空localStorage
    localStorage.clear();
    resetFundCache();

    // 步骤5：用导出数据导入
    await bs.applyBackupData(exportedData);

    // 步骤6：保存快照2
    const snapshot2 = saveLocalStorageSnapshot();
    const snapshot2IndexSymbols = snapshot2.fund_all_indices_data.map((m: any) => m.info.symbol);

    // 步骤7：验证指数顺序一致
    expect(snapshot2IndexSymbols).toEqual(snapshot1IndexSymbols);
  });

  test('导入-导出-再导入循环一致性：持仓数据完整性', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    mfs.resetCache();

    // 步骤1：用原始文件导入
    await bs.applyBackupData(ORIGINAL_BACKUP);

    // 步骤2：保存快照1（基金数据中的持仓）
    const snapshot1 = saveLocalStorageSnapshot();

    // 构建快照1中的持仓数据（从 fund_all_funds_data 中提取）
    const snapshot1Positions: Record<string, any> = {};
    snapshot1.fund_all_funds_data.forEach((f: any) => {
      if (f.info.position) {
        snapshot1Positions[f.info.ticker.symbol] = {
          fullCapacity: f.info.position.fullCapacity,
          initialPosition: f.info.position.initialPosition,
          startDate: f.info.position.startDate,
          initialPrice: f.info.position.initialPrice,
        };
      }
    });

    // 步骤3：构建导出数据
    const symbols = mfs.getAllFundSymbols();
    const portfolio = symbols.map(sym => {
      const info = mfs.getFundInfo(sym);
      return { id: 'test-id', symbol: sym, name: info?.name || '', market: 'Fund' };
    });
    const indicesConfig = snapshot1.fund_all_indices_data.map((m: any) => m.info.symbol);
    const exportedData = await bs.buildBackupData(portfolio, indicesConfig, snapshot1.fund_all_indices_data);

    // 步骤4：清空localStorage
    localStorage.clear();
    resetFundCache();

    // 步骤5：用导出数据导入
    await bs.applyBackupData(exportedData);

    // 步骤6：保存快照2
    const snapshot2 = saveLocalStorageSnapshot();

    // 构建快照2中的持仓数据
    const snapshot2Positions: Record<string, any> = {};
    snapshot2.fund_all_funds_data.forEach((f: any) => {
      if (f.info.position) {
        snapshot2Positions[f.info.ticker.symbol] = {
          fullCapacity: f.info.position.fullCapacity,
          initialPosition: f.info.position.initialPosition,
          startDate: f.info.position.startDate,
          initialPrice: f.info.position.initialPrice,
        };
      }
    });

    // 步骤7：验证持仓数据完整性和一致性
    // 验证持仓数量一致
    const snapshot1PositionKeys = Object.keys(snapshot1Positions);
    const snapshot2PositionKeys = Object.keys(snapshot2Positions);
    expect(snapshot2PositionKeys.sort()).toEqual(snapshot1PositionKeys.sort());

    // 验证每个持仓的数据一致
    for (const sym of snapshot1PositionKeys) {
      const pos1 = snapshot1Positions[sym];
      const pos2 = snapshot2Positions[sym];
      expect(pos2).toBeDefined();
      expect(pos2.fullCapacity).toBe(pos1.fullCapacity);
      expect(pos2.initialPosition).toBeCloseTo(pos1.initialPosition, 1);
      expect(pos2.startDate).toBe(pos1.startDate);
      if (pos1.initialPrice !== null && pos1.initialPrice !== undefined) {
        expect(pos2.initialPrice).toBeCloseTo(pos1.initialPrice, 5);
      }
    }
  });

  test('导入-导出-再导入循环一致性：交易记录完整性', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    mfs.resetCache();

    // 步骤1：用原始文件导入
    await bs.applyBackupData(ORIGINAL_BACKUP);

    // 步骤2：保存快照1（基金数据中的交易）
    const snapshot1 = saveLocalStorageSnapshot();

    // 构建快照1中的交易数据（从 fund_all_funds_data 中提取）
    const snapshot1Trades: Record<string, any[]> = {};
    snapshot1.fund_all_funds_data.forEach((f: any) => {
      if (f.trades && f.trades.length > 0) {
        snapshot1Trades[f.info.ticker.symbol] = f.trades.map((t: any) => ({
          id: t.id,
          date: t.date,
          type: t.type,
          shares: t.shares,
          price: t.price,
          fee: t.fee,
        }));
      }
    });

    // 步骤3：构建导出数据
    const symbols = mfs.getAllFundSymbols();
    const portfolio = symbols.map(sym => {
      const info = mfs.getFundInfo(sym);
      return { id: 'test-id', symbol: sym, name: info?.name || '', market: 'Fund' };
    });
    const indicesConfig = snapshot1.fund_all_indices_data.map((m: any) => m.info.symbol);
    const exportedData = await bs.buildBackupData(portfolio, indicesConfig, snapshot1.fund_all_indices_data);

    // 步骤4：清空localStorage
    localStorage.clear();
    resetFundCache();

    // 步骤5：用导出数据导入
    await bs.applyBackupData(exportedData);

    // 步骤6：保存快照2
    const snapshot2 = saveLocalStorageSnapshot();

    // 构建快照2中的交易数据
    const snapshot2Trades: Record<string, any[]> = {};
    snapshot2.fund_all_funds_data.forEach((f: any) => {
      if (f.trades && f.trades.length > 0) {
        snapshot2Trades[f.info.ticker.symbol] = f.trades.map((t: any) => ({
          id: t.id,
          date: t.date,
          type: t.type,
          shares: t.shares,
          price: t.price,
          fee: t.fee,
        }));
      }
    });

    // 步骤7：验证交易记录完整性和一致性
    const snapshot1TradeKeys = Object.keys(snapshot1Trades);
    const snapshot2TradeKeys = Object.keys(snapshot2Trades);
    expect(snapshot2TradeKeys.sort()).toEqual(snapshot1TradeKeys.sort());

    // 验证每个基金的交易记录
    for (const sym of snapshot1TradeKeys) {
      const trades1 = snapshot1Trades[sym];
      const trades2 = snapshot2Trades[sym];
      expect(trades2).toBeDefined();
      expect(trades2.length).toBe(trades1.length);

      // 验证每条交易记录
      for (let i = 0; i < trades1.length; i++) {
        expect(trades2[i].id).toBe(trades1[i].id);
        expect(trades2[i].date).toBe(trades1[i].date);
        expect(trades2[i].type).toBe(trades1[i].type);
        expect(trades2[i].shares).toBeCloseTo(trades1[i].shares, 2);
        expect(trades2[i].price).toBeCloseTo(trades1[i].price, 4);
        expect(trades2[i].fee).toBeCloseTo(trades1[i].fee, 2);
      }
    }
  });

  test('导入-导出-再导入循环一致性：指数数据完整性', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    mfs.resetCache();

    // 步骤1：用原始文件导入
    await bs.applyBackupData(ORIGINAL_BACKUP);

    // 步骤2：保存快照1
    const snapshot1 = saveLocalStorageSnapshot();

    // 步骤3：构建导出数据
    const symbols = mfs.getAllFundSymbols();
    const portfolio = symbols.map(sym => {
      const info = mfs.getFundInfo(sym);
      return { id: 'test-id', symbol: sym, name: info?.name || '', market: 'Fund' };
    });
    const indicesConfig = snapshot1.fund_all_indices_data.map((m: any) => m.info.symbol);
    const exportedData = await bs.buildBackupData(portfolio, indicesConfig, snapshot1.fund_all_indices_data);

    // 步骤4：清空localStorage
    localStorage.clear();
    resetFundCache();

    // 步骤5：用导出数据导入
    await bs.applyBackupData(exportedData);

    // 步骤6：保存快照2
    const snapshot2 = saveLocalStorageSnapshot();

    // 步骤7：验证指数数据完整性
    // 验证指数数量一致
    expect(snapshot2.fund_all_indices_data.length).toBe(snapshot1.fund_all_indices_data.length);

    // 验证每个指数的数据
    for (let i = 0; i < snapshot1.fund_all_indices_data.length; i++) {
      const idx1 = snapshot1.fund_all_indices_data[i];
      const idx2 = snapshot2.fund_all_indices_data[i];

      // 验证符号一致
      expect(idx2.info.symbol).toBe(idx1.info.symbol);

      // 验证名称一致
      expect(idx2.info.name).toBe(idx1.info.name);

      // 验证实时数据一致
      expect(idx2.info.current).toBe(idx1.info.current);
      expect(idx2.info.change).toBe(idx1.info.change);
      expect(idx2.info.changePercent).toBe(idx1.info.changePercent);
      expect(idx2.info.lastUpdated).toBe(idx1.info.lastUpdated);
    }
  });

  test('导入-导出-再导入循环一致性：配置数据完整性', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    mfs.resetCache();

    // 步骤1：用原始文件导入
    await bs.applyBackupData(ORIGINAL_BACKUP);

    // 步骤2：保存快照1
    const snapshot1 = saveLocalStorageSnapshot();

    // 步骤3：构建导出数据
    const symbols = mfs.getAllFundSymbols();
    const portfolio = symbols.map(sym => {
      const info = mfs.getFundInfo(sym);
      return { id: 'test-id', symbol: sym, name: info?.name || '', market: 'Fund' };
    });
    const indicesConfig = snapshot1.fund_all_indices_data.map((m: any) => m.info.symbol);
    const exportedData = await bs.buildBackupData(portfolio, indicesConfig, snapshot1.fund_all_indices_data);

    // 步骤4：清空localStorage
    localStorage.clear();
    resetFundCache();

    // 步骤5：用导出数据导入
    await bs.applyBackupData(exportedData);

    // 步骤6：保存快照2
    const snapshot2 = saveLocalStorageSnapshot();

    // 步骤7：验证配置数据完整性
    // 验证 autoExportTime
    expect(snapshot2.fund_system_config?.backup?.autoExportTime)
      .toBe(snapshot1.fund_system_config?.backup?.autoExportTime);

    // 验证 autoBackupEnabled
    expect(snapshot2.fund_system_config?.backup?.autoBackupEnabled)
      .toBe(snapshot1.fund_system_config?.backup?.autoBackupEnabled);
  });

  test('导入-导出-再导入循环一致性：完整数据比对', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    mfs.resetCache();

    // 步骤1：用原始文件导入
    await bs.applyBackupData(ORIGINAL_BACKUP);

    // 步骤2：保存快照1
    const snapshot1 = saveLocalStorageSnapshot();

    // 步骤3：构建导出数据
    const symbols = mfs.getAllFundSymbols();
    const portfolio = symbols.map(sym => {
      const info = mfs.getFundInfo(sym);
      return { id: 'test-id', symbol: sym, name: info?.name || '', market: 'Fund' };
    });
    const indicesConfig = snapshot1.fund_all_indices_data.map((m: any) => m.info.symbol);
    const exportedData = await bs.buildBackupData(portfolio, indicesConfig, snapshot1.fund_all_indices_data);

    // 步骤4：清空localStorage
    localStorage.clear();
    resetFundCache();

    // 步骤5：用导出数据导入
    await bs.applyBackupData(exportedData);

    // 步骤6：保存快照2
    const snapshot2 = saveLocalStorageSnapshot();

    // 步骤7：完整数据比对

    // 7.1 基金数据
    expect(snapshot2.fund_all_funds_data.length).toBe(snapshot1.fund_all_funds_data.length);
    for (let i = 0; i < snapshot1.fund_all_funds_data.length; i++) {
      const f1 = snapshot1.fund_all_funds_data[i];
      const f2 = snapshot2.fund_all_funds_data[i];

      // 验证符号顺序一致
      expect(f2.info.ticker.symbol).toBe(f1.info.ticker.symbol);

      // 验证名称一致
      expect(f2.info.ticker.name).toBe(f1.info.ticker.name);

      // 验证持仓存在性一致
      if (f1.info.position) {
        expect(f2.info.position).toBeDefined();
      } else {
        expect(f2.info.position).toBeUndefined();
      }

      // 验证交易数量一致
      expect(f2.trades.length).toBe(f1.trades.length);
    }

    // 7.2 指数数据
    expect(snapshot2.fund_all_indices_data.length).toBe(snapshot1.fund_all_indices_data.length);
    for (let i = 0; i < snapshot1.fund_all_indices_data.length; i++) {
      const idx1 = snapshot1.fund_all_indices_data[i];
      const idx2 = snapshot2.fund_all_indices_data[i];

      // 验证符号顺序一致
      expect(idx2.info.symbol).toBe(idx1.info.symbol);

      // 验证名称一致
      expect(idx2.info.name).toBe(idx1.info.name);
    }

    // 7.3 配置数据
    expect(snapshot2.fund_system_config?.backup?.autoExportTime)
      .toBe(snapshot1.fund_system_config?.backup?.autoExportTime);
    });
  });

// ─── aliasName 导入导出测试 ───────────────────────────────────────────────────

describe('aliasName 导入导出测试', () => {
  beforeEach(() => { localStorage.clear(); resetFundCache(); });
  afterEach(() => { localStorage.clear(); jest.resetModules(); resetFundCache(); });

  test('导出时 aliasName 被包含在备份文件', async () => {
    const { mfs, bs } = loadBoth();
    mfs.resetCache();

    // 设置一个带有 aliasName 的持仓
    mfs.addFund('000001', '华夏成长混合');
    mfs.updatePosition('000001', {
      fullCapacity: 10000,
      initialPosition: 2000,
      startDate: '2025-01-01',
      initialPrice: 1.48,
      aliasName: '我的科技基金',
    });

    // 构建导出数据
    const portfolio = [{ id: 'a1', symbol: '000001', name: '华夏成长混合', market: MarketType.FUND }];
    const result = await bs.buildBackupData(portfolio, [], []);

    // 验证 aliasName 被包含
    expect(result.positions['000001']).toBeDefined();
    expect(result.positions['000001'].aliasName).toBe('我的科技基金');
  });

  test('导入新格式（含 aliasName）时正确读取', async () => {
    const { mfs, bs } = loadBoth();
    mfs.resetCache();

    // 导入包含 aliasName 的备份
    const backup: BackupData = {
      portfolio: [{ symbol: '000001', name: '华夏成长混合' }],
      indices: [],
      positions: {
        '000001': {
          fullCapacity: 10000,
          initialPosition: 2000,
          startDate: '2025-01-01',
          initialPrice: 1.48,
          aliasName: '我的科技基金',
        },
      },
      trades: {},
      comboTrades: {},
      config: { autoExportTime: '16:00' },
    };

    await bs.applyBackupData(backup);

    // 验证 aliasName 正确读取
    const pos = mfs.getPosition('000001');
    expect(pos).not.toBeNull();
    expect(pos!.aliasName).toBe('我的科技基金');
  });

  test('导入旧格式（无 aliasName）时兼容处理', async () => {
    const { mfs, bs } = loadBoth();
    mfs.resetCache();

    // 导入不含 aliasName 的旧格式备份
    const backup: BackupData = {
      portfolio: [{ symbol: '000001', name: '华夏成长混合' }],
      indices: [],
      positions: {
        '000001': {
          fullCapacity: 10000,
          initialPosition: 2000,
          startDate: '2025-01-01',
          initialPrice: 1.48,
        },
      },
      trades: {},
      comboTrades: {},
      config: { autoExportTime: '16:00' },
    };

    await bs.applyBackupData(backup);

    // 验证 aliasName 为 undefined（兼容处理）
    const pos = mfs.getPosition('000001');
    expect(pos).not.toBeNull();
    expect(pos!.aliasName).toBeUndefined();
  });

  test('导入后导出 aliasName 保持一致', async () => {
    const { mfs, bs } = loadBoth();
    mfs.resetCache();

    // 导入包含 aliasName 的备份
    const backup: BackupData = {
      portfolio: [{ symbol: '000001', name: '华夏成长混合' }],
      indices: [],
      positions: {
        '000001': {
          fullCapacity: 10000,
          initialPosition: 2000,
          startDate: '2025-01-01',
          initialPrice: 1.48,
          aliasName: '我的科技基金',
        },
      },
      trades: {},
      comboTrades: {},
      config: { autoExportTime: '16:00' },
    };

    await bs.applyBackupData(backup);

    // 构建导出数据
    const portfolio = [{ id: 'a1', symbol: '000001', name: '华夏成长混合', market: MarketType.FUND }];
    const exported = await bs.buildBackupData(portfolio, [], []);

    // 验证 aliasName 保持一致
    expect(exported.positions['000001'].aliasName).toBe('我的科技基金');
  });
});

// ─── features 导入导出测试 ───────────────────────────────────────────────────

describe('features 导入导出测试', () => {
  beforeEach(() => { localStorage.clear(); resetFundCache(); });
  afterEach(() => { localStorage.clear(); jest.resetModules(); resetFundCache(); });

  test('导出时 features 被包含在备份文件', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    const scs = require('../../services/systemConfigService');
    mfs.resetCache();
    scs.resetCache();

    // 设置系统开关状态
    scs.saveFeatureConfig({
      initialPriceAdjustmentEnabled: true,
      jobLogEnabled: false,
      ocrDebugPanelEnabled: true,
    });

    // 构建导出数据
    const result = await bs.buildBackupData([], [], []);

    // 验证 features 被包含
    expect(result.config.features).toBeDefined();
    expect(result.config.features?.ocrDebugPanelEnabled).toBe(true);
    expect(result.config.features?.initialPriceAdjustmentEnabled).toBe(true);
  });

  test('导入新格式（含 features）时正确读取', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    const scs = require('../../services/systemConfigService');
    mfs.resetCache();
    scs.resetCache();

    // 导入包含 features 的备份
    const backup: BackupData = {
      ...BASE_BACKUP,
      config: {
        ...BASE_BACKUP.config,
        features: {
          initialPriceAdjustmentEnabled: false,
          jobLogEnabled: true,
          ocrDebugPanelEnabled: true,
        },
      },
    };

    await bs.applyBackupData(backup);

    // 验证 features 被正确恢复
    const features = scs.getFeatureConfig();
    expect(features.jobLogEnabled).toBe(true);
    expect(features.ocrDebugPanelEnabled).toBe(true);
    expect(features.initialPriceAdjustmentEnabled).toBe(false);
  });

  test('导入旧格式（无 features）时兼容处理', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    const scs = require('../../services/systemConfigService');
    mfs.resetCache();
    scs.resetCache();

    // 导入不含 features 的旧备份
    const backup: BackupData = { ...BASE_BACKUP };
    await bs.applyBackupData(backup);

    // 验证默认值保持不变
    const features = scs.getFeatureConfig();
    expect(features.initialPriceAdjustmentEnabled).toBe(false);
    expect(features.jobLogEnabled).toBe(false);
    expect(features.ocrDebugPanelEnabled).toBe(false);
  });

  test('ocrDebugPanelEnabled 导出导入一致性', async () => {
    const { bs } = loadBoth();
    const mfs = require('../../services/marketFundService');
    const scs = require('../../services/systemConfigService');
    mfs.resetCache();
    scs.resetCache();

    // 设置开关状态
    scs.saveFeatureConfig({
      initialPriceAdjustmentEnabled: false,
      jobLogEnabled: false,
      ocrDebugPanelEnabled: true,
    });

    // 导出
    const exported = await bs.buildBackupData([], [], []);

    // 清空
    localStorage.clear();
    mfs.resetCache();
    scs.resetCache();

    // 导入
    await bs.applyBackupData(exported);

    // 验证状态保持
    const features = scs.getFeatureConfig();
    expect(features.ocrDebugPanelEnabled).toBe(true);
  });
});