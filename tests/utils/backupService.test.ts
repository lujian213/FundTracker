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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadBackupService() {
  jest.resetModules();
  return require('../../utils/backupService');
}

function loadCacheService() {
  jest.resetModules();
  return require('../../services/cacheService');
}

// Re-load both together so they share the same module registry
function loadBoth() {
  jest.resetModules();
  const cs = require('../../services/cacheService');
  const bs = require('../../utils/backupService');
  return { cs, bs };
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
  config: { autoExportTime: '16:00', autoBackupEnabled: false },
};

// ─── readBackupConfig / writeBackupConfig ─────────────────────────────────────

describe('readBackupConfig', () => {
  const STORAGE_KEY = 'fund_system_config';

  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { localStorage.clear(); jest.resetModules(); });

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

  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { localStorage.clear(); jest.resetModules(); });

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
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { localStorage.clear(); jest.resetModules(); });

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

  test('fills optional valuation fields from cacheService when available', async () => {
    const { cs, bs } = loadBoth();
    cs.setValuation('000001', SAMPLE_VALUATION);

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

  test('includes trades from localStorage fund_trades', async () => {
    const { bs } = loadBoth();
    localStorage.setItem('fund_trades', JSON.stringify({
      '000001': [{ id: 't1', date: '2026-01-01', type: 'buy', shares: 500, price: 1.48, fee: 0.5 }],
    }));
    const result = await bs.buildBackupData([], [], []);
    expect(result.trades['000001']).toHaveLength(1);
    expect(result.trades['000001'][0].shares).toBe(500);
  });

  test('includes positions from localStorage fund_position_* keys', async () => {
    const { bs } = loadBoth();
    localStorage.setItem('fund_position_000001', JSON.stringify({
      fullCapacity: 10000, initialPosition: 2000, startDate: '2025-01-01', initialPrice: 1.48,
    }));
    const result = await bs.buildBackupData([], [], []);
    expect(result.positions['000001']).toEqual({
      fullCapacity: 10000, initialPosition: 2000, startDate: '2025-01-01', initialPrice: 1.48,
    });
  });

  test('reads autoExportTime and autoBackupEnabled from fund_system_config', async () => {
    const { bs } = loadBoth();
    localStorage.setItem('fund_system_config', JSON.stringify({
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
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { localStorage.clear(); jest.resetModules(); });

  // Helper: pre-populate some old data to verify overwrite
  function seedOldData() {
    localStorage.setItem('fund_portfolio', JSON.stringify([{ id: 'old', symbol: '999999', name: '旧基金', market: 'Fund' }]));
    localStorage.setItem('fund_trades', JSON.stringify({ '999999': [{ id: 'old-t', date: '2024-01-01', type: 'buy', shares: 100, price: 1, fee: 0 }] }));
    localStorage.setItem('fund_position_999999', JSON.stringify({ fullCapacity: 5000, initialPosition: 0, startDate: null, initialPrice: null }));
    localStorage.setItem('fund_indices_config', JSON.stringify(['9.999999']));
    localStorage.setItem('fund_global_indices_config', JSON.stringify(['999.OLD']));
    localStorage.setItem('fund_history_999999', JSON.stringify([{ date: 1000000, value: 1, equityReturn: 0 }]));
  }

  test('returns correct portfolio, indicesConfig', async () => {
    const { bs } = loadBoth();
    const result = await bs.applyBackupData(BASE_BACKUP);
    expect(result.portfolio).toHaveLength(1);
    expect(result.portfolio[0].symbol).toBe('000001');
    expect(result.portfolio[0].market).toBe(MarketType.FUND);
    expect(result.indicesConfig).toEqual(['1.000001', '100.NDX']);
  });

  test('completely overwrites old portfolio in localStorage', async () => {
    const { bs } = loadBoth();
    seedOldData();
    await bs.applyBackupData(BASE_BACKUP);

    const raw = localStorage.getItem('fund_portfolio');
    const portfolio = JSON.parse(raw!);
    const symbols = portfolio.map((p: any) => p.symbol);
    expect(symbols).not.toContain('999999');
    expect(symbols).toContain('000001');
  });

  test('completely overwrites old trades in localStorage', async () => {
    const { bs } = loadBoth();
    seedOldData();
    await bs.applyBackupData(BASE_BACKUP);

    const raw = localStorage.getItem('fund_trades');
    const trades = JSON.parse(raw!);
    expect(trades['999999']).toBeUndefined();
    expect(trades['000001']).toHaveLength(1);
    expect(trades['000001'][0].id).toBe('t1');
  });

  test('removes old fund_position_* keys and writes new ones', async () => {
    const { bs } = loadBoth();
    seedOldData();
    await bs.applyBackupData(BASE_BACKUP);

    expect(localStorage.getItem('fund_position_999999')).toBeNull();
    const newPos = localStorage.getItem('fund_position_000001');
    expect(newPos).not.toBeNull();
    const pos = JSON.parse(newPos!);
    expect(pos.fullCapacity).toBe(10000);
    expect(pos.startDate).toBe('2025-01-01');
  });

  test('preserves fund_history_* keys (not cleared)', async () => {
    const { bs } = loadBoth();
    seedOldData();
    await bs.applyBackupData(BASE_BACKUP);

    // History for old fund is preserved
    expect(localStorage.getItem('fund_history_999999')).not.toBeNull();
  });

  test('writes new indices config to localStorage', async () => {
    const { bs } = loadBoth();
    seedOldData();
    await bs.applyBackupData(BASE_BACKUP);

    // 检查新 key: fund_all_indices_data（完整 MarketIndex[]）
    const idx = JSON.parse(localStorage.getItem('fund_all_indices_data')!);
    const symbols = idx.map((m: any) => m.info.symbol);
    expect(symbols).toEqual(['1.000001', '100.NDX']);
  });

  test('evicts old valuations from cacheService for removed symbols', async () => {
    const { cs, bs } = loadBoth();
    // Seed old symbol in cache
    cs.setValuation('999999', { ...SAMPLE_VALUATION, symbol: '999999' });
    expect(cs.getValuation('999999')).toBeDefined();

    await bs.applyBackupData(BASE_BACKUP);

    expect(cs.getValuation('999999')).toBeUndefined();
  });

  test('fallback: writes valuation to cache when cache is empty', async () => {
    const { cs, bs } = loadBoth();
    // Cache is empty
    expect(cs.getValuation('000001')).toBeUndefined();

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
    const cached = cs.getValuation('000001');
    expect(cached).toBeDefined();
    expect(cached!.previousPrice).toBeCloseTo(1.48);
  });

  test('fallback: does NOT overwrite existing valuation in cache', async () => {
    const { cs, bs } = loadBoth();
    // Seed a "live" valuation with up-to-date data
    const liveVal = { ...SAMPLE_VALUATION, previousPrice: 9.99 };
    cs.setValuation('000001', liveVal);

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
    expect(cs.getValuation('000001')!.previousPrice).toBeCloseTo(9.99);
  });

  test('writes config.autoExportTime and autoBackupEnabled to fund_system_config', async () => {
    const { bs } = loadBoth();
    const backup = { ...BASE_BACKUP, config: { autoExportTime: '08:30', autoBackupEnabled: true } };
    await bs.applyBackupData(backup);

    const raw = localStorage.getItem('fund_system_config');
    const parsed = JSON.parse(raw!);
    expect(parsed.backup).toEqual({ autoExportTime: '08:30', autoBackupEnabled: true });
  });

  test('writes config with autoBackupEnabled as false', async () => {
    const { bs } = loadBoth();
    const backup = { ...BASE_BACKUP, config: { autoExportTime: '08:30', autoBackupEnabled: false } };
    await bs.applyBackupData(backup);

    const raw = localStorage.getItem('fund_system_config');
    const parsed = JSON.parse(raw!);
    expect(parsed.backup).toEqual({ autoExportTime: '08:30', autoBackupEnabled: false });
  });

  test('handles missing autoBackupEnabled during import by defaulting to false', async () => {
    const { bs } = loadBoth();
    const backup = { ...BASE_BACKUP, config: { autoExportTime: '08:30' } }; // No autoBackupEnabled
    await bs.applyBackupData(backup);

    const raw = localStorage.getItem('fund_system_config');
    const parsed = JSON.parse(raw!);
    expect(parsed.backup).toEqual({ autoExportTime: '08:30', autoBackupEnabled: false });
  });

  test('normalizes missing trade price to 0', async () => {
    const { bs } = loadBoth();
    const backup: BackupData = {
      ...BASE_BACKUP,
      trades: {
        '000001': [{ id: 't2', date: '2025-02-01', type: 'sell', shares: 200, fee: 0 } as any],
      },
    };
    await bs.applyBackupData(backup);
    const trades = JSON.parse(localStorage.getItem('fund_trades')!);
    expect(trades['000001'][0].price).toBe(0);
  });

  test('normalizes missing position initialPrice to null', async () => {
    const { bs } = loadBoth();
    const backup: BackupData = {
      ...BASE_BACKUP,
      positions: {
        '000001': { fullCapacity: 5000, initialPosition: 0, startDate: null, initialPrice: null },
      },
    };
    await bs.applyBackupData(backup);
    const pos = JSON.parse(localStorage.getItem('fund_position_000001')!);
    expect(pos.initialPrice).toBeNull();
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
      config: { autoExportTime: '16:00' },
    };
    const result = await bs.applyBackupData(oldFormat);
    expect(result.portfolio[0].symbol).toBe('000001');
    expect(result.portfolio[0].name).toBe('');
  });

  test('compat: missing config field uses stored default', async () => {
    const { bs } = loadBoth();
    localStorage.setItem('fund_backup_config', JSON.stringify({ autoExportTime: '07:00' }));
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
});