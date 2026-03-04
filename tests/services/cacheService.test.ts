/**
 * tests/services/cacheService.test.ts
 *
 * 测试 cacheService 的核心行为：
 *  - 从 localStorage 预加载数据到内存 Map
 *  - 读写接口正确性
 *  - 写入时同步更新对应 localStorage key
 */

// We need to reset module state between tests that manipulate localStorage before import.
// Use jest.resetModules() + require() to force re-initialisation.

import { ValuationData, HistoricalPoint } from '../../types';

const SAMPLE_VALUATION: ValuationData = {
  symbol: '000001',
  name: '测试基金',
  currentPrice: 1.23,
  previousPrice: 1.20,
  changePercentage: 2.5,
  lastUpdated: '2026-03-03 15:00',
  realtimeDate: '2026-03-03',
  netWorthDate: '2026-03-02',
  valuationDate: '2026-03-03',
  sourceUrl: 'https://example.com',
};

const SAMPLE_HISTORY: HistoricalPoint[] = [
  { date: 1700000000000, value: 1.00, equityReturn: 0.0 },
  { date: 1700086400000, value: 1.01, equityReturn: 0.01 },
  { date: 1700172800000, value: 1.02, equityReturn: 0.01 },
];

// Helper: re-import cacheService so its init() runs with the current localStorage state
function loadCacheService() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../services/cacheService');
}

describe('cacheService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    jest.resetModules();
  });

  // ── Valuation ────────────────────────────────────────────────────────────────

  describe('valuation cache', () => {
    test('getValuation returns undefined when nothing cached', () => {
      const cs = loadCacheService();
      expect(cs.getValuation('000001')).toBeUndefined();
    });

    test('setValuation stores in memory and writes to localStorage', () => {
      const cs = loadCacheService();
      cs.setValuation('000001', SAMPLE_VALUATION);

      // in-memory
      expect(cs.getValuation('000001')).toEqual(SAMPLE_VALUATION);

      // localStorage: fund_market_data should contain the entry
      const raw = localStorage.getItem('fund_market_data');
      expect(raw).not.toBeNull();
      const obj = JSON.parse(raw!);
      expect(obj['000001']).toEqual(SAMPLE_VALUATION);
    });

    test('getAllValuations returns all stored entries', () => {
      const cs = loadCacheService();
      const v2 = { ...SAMPLE_VALUATION, symbol: '000002' };
      cs.setValuation('000001', SAMPLE_VALUATION);
      cs.setValuation('000002', v2);

      const all = cs.getAllValuations();
      expect(all['000001']).toEqual(SAMPLE_VALUATION);
      expect(all['000002']).toEqual(v2);
    });

    test('preloads valuation data from localStorage on init', () => {
      // Pre-populate localStorage before loading the module
      localStorage.setItem('fund_market_data', JSON.stringify({ '000001': SAMPLE_VALUATION }));

      const cs = loadCacheService();
      expect(cs.getValuation('000001')).toEqual(SAMPLE_VALUATION);
    });
  });

  // ── History ──────────────────────────────────────────────────────────────────

  describe('history cache', () => {
    test('getHistory returns undefined when nothing cached', () => {
      const cs = loadCacheService();
      expect(cs.getHistory('000001')).toBeUndefined();
    });

    test('setHistory stores in memory and writes to fund_history_{symbol} key', () => {
      const cs = loadCacheService();
      cs.setHistory('000001', SAMPLE_HISTORY);

      // in-memory
      expect(cs.getHistory('000001')).toEqual(SAMPLE_HISTORY);

      // localStorage: fund_history_000001
      const raw = localStorage.getItem('fund_history_000001');
      expect(raw).not.toBeNull();
      const arr = JSON.parse(raw!);
      expect(arr).toEqual(SAMPLE_HISTORY);
    });

    test('preloads history from fund_history_{symbol} localStorage key on init', () => {
      localStorage.setItem('fund_history_000001', JSON.stringify(SAMPLE_HISTORY));

      const cs = loadCacheService();
      expect(cs.getHistory('000001')).toEqual(SAMPLE_HISTORY);
    });

    test('getAllHistories returns all stored history maps', () => {
      const cs = loadCacheService();
      const h2 = [{ date: 1700000000000, value: 2.00, equityReturn: 0 }];
      cs.setHistory('000001', SAMPLE_HISTORY);
      cs.setHistory('000002', h2);

      const all: Map<string, HistoricalPoint[]> = cs.getAllHistories();
      expect(all.get('000001')).toEqual(SAMPLE_HISTORY);
      expect(all.get('000002')).toEqual(h2);
    });
  });

  // ── News ─────────────────────────────────────────────────────────────────────

  describe('news cache', () => {
    test('getNews returns empty array by default', () => {
      const cs = loadCacheService();
      expect(cs.getNews()).toEqual([]);
    });

    test('setNews and getNews round-trip correctly', () => {
      const cs = loadCacheService();
      const items = [{ id: 'n1', title: '热门', time: '10:00', url: 'https://example.com' }];
      cs.setNews(items);
      expect(cs.getNews()).toEqual(items);
    });

    test('news is not persisted to localStorage', () => {
      const cs = loadCacheService();
      cs.setNews([{ id: 'n1', title: '测试', time: '09:30', url: 'https://example.com' }]);
      // No localStorage key for news
      const keys = Object.keys(localStorage);
      expect(keys.some(k => k.includes('news'))).toBe(false);
    });
  });

  // ── setValuationIfAbsent ─────────────────────────────────────────────────────

  describe('setValuationIfAbsent', () => {
    test('writes to cache when symbol is absent', () => {
      const cs = loadCacheService();
      expect(cs.getValuation('000001')).toBeUndefined();
      cs.setValuationIfAbsent('000001', SAMPLE_VALUATION);
      expect(cs.getValuation('000001')).toEqual(SAMPLE_VALUATION);
    });

    test('does NOT overwrite existing valuation', () => {
      const cs = loadCacheService();
      const original = { ...SAMPLE_VALUATION, previousPrice: 9.99 };
      cs.setValuation('000001', original);
      // Try to overwrite with a different value
      cs.setValuationIfAbsent('000001', { ...SAMPLE_VALUATION, previousPrice: 1.11 });
      // Should still be the original
      expect(cs.getValuation('000001')!.previousPrice).toBeCloseTo(9.99);
    });

    test('also persists to localStorage when absent', () => {
      const cs = loadCacheService();
      cs.setValuationIfAbsent('000001', SAMPLE_VALUATION);
      const raw = localStorage.getItem('fund_market_data');
      const obj = JSON.parse(raw!);
      expect(obj['000001']).toEqual(SAMPLE_VALUATION);
    });

    test('does NOT touch localStorage when symbol already cached', () => {
      const cs = loadCacheService();
      const original = { ...SAMPLE_VALUATION, previousPrice: 9.99 };
      cs.setValuation('000001', original);
      cs.setValuationIfAbsent('000001', { ...SAMPLE_VALUATION, previousPrice: 1.11 });
      const raw = localStorage.getItem('fund_market_data');
      const obj = JSON.parse(raw!);
      expect(obj['000001'].previousPrice).toBeCloseTo(9.99);
    });
  });

  // ── setHistoryIfAbsent ───────────────────────────────────────────────────────

  describe('setHistoryIfAbsent', () => {
    test('writes to cache when symbol is absent', () => {
      const cs = loadCacheService();
      expect(cs.getHistory('000001')).toBeUndefined();
      cs.setHistoryIfAbsent('000001', SAMPLE_HISTORY);
      expect(cs.getHistory('000001')).toEqual(SAMPLE_HISTORY);
    });

    test('does NOT overwrite existing history', () => {
      const cs = loadCacheService();
      const original = [{ date: 1700000000000, value: 9.99, equityReturn: 0 }];
      cs.setHistory('000001', original);
      cs.setHistoryIfAbsent('000001', SAMPLE_HISTORY);
      expect(cs.getHistory('000001')).toEqual(original);
    });

    test('also persists to localStorage when absent', () => {
      const cs = loadCacheService();
      cs.setHistoryIfAbsent('000001', SAMPLE_HISTORY);
      const raw = localStorage.getItem('fund_history_000001');
      expect(JSON.parse(raw!)).toEqual(SAMPLE_HISTORY);
    });

    test('does NOT touch localStorage when symbol already cached', () => {
      const cs = loadCacheService();
      const original = [{ date: 9999999999999, value: 2.5, equityReturn: 0.1 }];
      cs.setHistory('000001', original);
      cs.setHistoryIfAbsent('000001', SAMPLE_HISTORY);
      const raw = localStorage.getItem('fund_history_000001');
      expect(JSON.parse(raw!)).toEqual(original);
    });
  });

  // ── evictValuations ──────────────────────────────────────────────────────────

  describe('evictValuations', () => {
    test('removes symbols not in keepSymbols from memory', () => {
      const cs = loadCacheService();
      const v2 = { ...SAMPLE_VALUATION, symbol: '000002' };
      cs.setValuation('000001', SAMPLE_VALUATION);
      cs.setValuation('000002', v2);

      cs.evictValuations(new Set(['000001']));

      expect(cs.getValuation('000001')).toEqual(SAMPLE_VALUATION);
      expect(cs.getValuation('000002')).toBeUndefined();
    });

    test('updates fund_market_data in localStorage after eviction', () => {
      const cs = loadCacheService();
      const v2 = { ...SAMPLE_VALUATION, symbol: '000002' };
      cs.setValuation('000001', SAMPLE_VALUATION);
      cs.setValuation('000002', v2);

      cs.evictValuations(new Set(['000001']));

      const raw = localStorage.getItem('fund_market_data');
      const obj = JSON.parse(raw!);
      expect(obj['000001']).toBeDefined();
      expect(obj['000002']).toBeUndefined();
    });

    test('keeps all symbols when keepSymbols contains all', () => {
      const cs = loadCacheService();
      cs.setValuation('000001', SAMPLE_VALUATION);
      cs.evictValuations(new Set(['000001']));
      expect(cs.getValuation('000001')).toEqual(SAMPLE_VALUATION);
    });

    test('clears all symbols when keepSymbols is empty', () => {
      const cs = loadCacheService();
      cs.setValuation('000001', SAMPLE_VALUATION);
      cs.setValuation('000002', { ...SAMPLE_VALUATION, symbol: '000002' });
      cs.evictValuations(new Set());
      expect(cs.getValuation('000001')).toBeUndefined();
      expect(cs.getValuation('000002')).toBeUndefined();
      // localStorage should also be empty
      const raw = localStorage.getItem('fund_market_data');
      expect(JSON.parse(raw!)).toEqual({});
    });

    test('no-op when cache is already empty', () => {
      const cs = loadCacheService();
      expect(() => cs.evictValuations(new Set(['000001']))).not.toThrow();
    });
  });
});

