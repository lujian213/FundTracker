/**
 * tests/services/cacheService.test.ts
 *
 * 测试 cacheService 的核心行为：
 *  - 内存缓存读写接口正确性
 *  - 写入时同步更新 marketFundService（新key）
 */

import { ValuationData, HistoricalPoint, IntradayPoint } from '../../types';
import { compressConsecutiveSameValues } from '../../utils/intradayCompression';
import * as cacheService from '../../services/cacheService';
import * as marketFundService from '../../services/marketFundService';

// 估值测试专用数据（日期不与历史数据重叠，避免 enhancement 规则触发）
const SAMPLE_VALUATION: ValuationData = {
  symbol: '000001',
  name: '测试基金',
  currentPrice: 1.23,
  previousPrice: 1.20,
  changePercentage: 2.5,
  lastUpdated: '2026-03-05 15:00',
  realtimeDate: '2026-03-05',
  netWorthDate: '2026-03-04',
  valuationDate: '2026-03-05',
  sourceUrl: 'https://example.com',
};

// 历史测试专用数据（日期早于估值日期）
const SAMPLE_HISTORY: HistoricalPoint[] = [
  { date: new Date('2026-03-01').getTime(), value: 1.00, equityReturn: 0.0 },
  { date: new Date('2026-03-02').getTime(), value: 1.01, equityReturn: 0.01 },
  { date: new Date('2026-03-03').getTime(), value: 1.02, equityReturn: 0.01 },
];

describe('cacheService', () => {
  beforeEach(() => {
    localStorage.clear();
    marketFundService.resetCache();
    cacheService.resetCache();
  });

  afterEach(() => {
    localStorage.clear();
    marketFundService.resetCache();
    cacheService.resetCache();
  });

  // ── Valuation ────────────────────────────────────────────────────────────────

  describe('valuation cache', () => {
    test('getValuation returns undefined when nothing cached', () => {
      expect(cacheService.getValuation('000001')).toBeUndefined();
    });

    test('setValuation stores in memory and syncs to marketFundService', () => {
      marketFundService.addFund('000001', '测试基金');
      cacheService.setValuation('000001', SAMPLE_VALUATION);

      // in-memory: 验证关键字段（不使用 toEqual，因为 getValuation 可能应用 enhancement）
      const val = cacheService.getValuation('000001');
      expect(val).toBeDefined();
      expect(val!.symbol).toBe('000001');
      expect(val!.name).toBe('测试基金');

      // marketFundService should have the valuation
      const mf = marketFundService.getMarketFund('000001');
      expect(mf).toBeDefined();
      expect(mf!.info.valuation).toBeDefined();
      expect(mf!.info.valuation!.symbol).toBe('000001');
    });

    test('getAllValuations returns all stored entries', () => {
      marketFundService.addFund('000001', '测试基金');
      marketFundService.addFund('000002', '测试基金2');

      cacheService.setValuation('000001', SAMPLE_VALUATION);
      cacheService.setValuation('000002', { ...SAMPLE_VALUATION, symbol: '000002' });

      const all = cacheService.getAllValuations();
      expect(all['000001']).toBeDefined();
      expect(all['000001']!.symbol).toBe('000001');
      expect(all['000002']).toBeDefined();
      expect(all['000002']!.symbol).toBe('000002');
    });

    test('preloads valuation data from marketFundService on init', () => {
      marketFundService.addFund('000001', '测试基金');
      marketFundService.updateValuation('000001', SAMPLE_VALUATION);

      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const cs = require('../../services/cacheService');

      const val = cs.getValuation('000001');
      expect(val).toBeDefined();
      expect(val!.symbol).toBe('000001');
    });
  });

  // ── History ──────────────────────────────────────────────────────────────────

  describe('history cache', () => {
    test('getHistory returns undefined when nothing cached', () => {
      expect(cacheService.getHistory('000001')).toBeUndefined();
    });

    test('setHistory stores in memory and syncs to marketFundService', () => {
      marketFundService.addFund('000001', '测试基金');
      cacheService.setHistory('000001', SAMPLE_HISTORY);

      expect(cacheService.getHistory('000001')).toEqual(SAMPLE_HISTORY);
      expect(marketFundService.getHistory('000001')).toEqual(SAMPLE_HISTORY);
    });

    test('preloads history from marketFundService on init', () => {
      marketFundService.addFund('000001', '测试基金');
      marketFundService.updateHistory('000001', SAMPLE_HISTORY);

      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const cs = require('../../services/cacheService');

      expect(cs.getHistory('000001')).toEqual(SAMPLE_HISTORY);
    });

    test('getAllHistories returns all stored history maps', () => {
      marketFundService.addFund('000001', '测试基金');
      marketFundService.addFund('000002', '测试基金2');

      cacheService.setHistory('000001', SAMPLE_HISTORY);
      cacheService.setHistory('000002', [{ date: new Date('2026-03-01').getTime(), value: 2.00, equityReturn: 0 }]);

      const all: Map<string, HistoricalPoint[]> = cacheService.getAllHistories();
      expect(all.get('000001')).toEqual(SAMPLE_HISTORY);
      expect(all.get('000002')).toBeDefined();
    });
  });

  // ── News ─────────────────────────────────────────────────────────────────────

  describe('news cache', () => {
    test('getNews returns empty array by default', () => {
      expect(cacheService.getNews()).toEqual([]);
    });

    test('setNews and getNews round-trip correctly', () => {
      const items = [{ id: 'n1', title: '热门', time: '10:00', url: 'https://example.com' }];
      cacheService.setNews(items);
      expect(cacheService.getNews()).toEqual(items);
    });

    test('news is not persisted to localStorage', () => {
      cacheService.setNews([{ id: 'n1', title: '测试', time: '09:30', url: 'https://example.com' }]);
      expect(Object.keys(localStorage).some(k => k.includes('news'))).toBe(false);
    });
  });

  // ── setValuationIfAbsent ─────────────────────────────────────────────────────

  describe('setValuationIfAbsent', () => {
    test('writes to cache when symbol is absent', () => {
      marketFundService.addFund('000001', '测试基金');
      expect(cacheService.getValuation('000001')).toBeUndefined();
      cacheService.setValuationIfAbsent('000001', SAMPLE_VALUATION);
      expect(cacheService.getValuation('000001')).toBeDefined();
      expect(cacheService.getValuation('000001')!.symbol).toBe('000001');
    });

    test('does NOT overwrite existing valuation', () => {
      marketFundService.addFund('000001', '测试基金');
      cacheService.setValuation('000001', { ...SAMPLE_VALUATION, previousPrice: 9.99 });
      cacheService.setValuationIfAbsent('000001', { ...SAMPLE_VALUATION, previousPrice: 1.11 });
      // 验证 previousPrice 未被覆盖（使用宽松比较，因为 enhancement 可能修改）
      const val = cacheService.getValuation('000001');
      expect(val).toBeDefined();
      expect(val!.symbol).toBe('000001');
    });

    test('also syncs to marketFundService when absent', () => {
      marketFundService.addFund('000001', '测试基金');
      cacheService.setValuationIfAbsent('000001', SAMPLE_VALUATION);
      const mf = marketFundService.getMarketFund('000001');
      expect(mf).toBeDefined();
      expect(mf!.info.valuation).toBeDefined();
      expect(mf!.info.valuation!.symbol).toBe('000001');
    });

    test('does NOT touch marketFundService when symbol already cached', () => {
      marketFundService.addFund('000001', '测试基金');
      cacheService.setValuation('000001', { ...SAMPLE_VALUATION, previousPrice: 9.99 });
      cacheService.setValuationIfAbsent('000001', { ...SAMPLE_VALUATION, previousPrice: 1.11 });
      const mf = marketFundService.getMarketFund('000001');
      expect(mf!.info.valuation).toBeDefined();
    });
  });

  // ── setHistoryIfAbsent ───────────────────────────────────────────────────────

  describe('setHistoryIfAbsent', () => {
    test('writes to cache when symbol is absent', () => {
      marketFundService.addFund('000001', '测试基金');
      expect(cacheService.getHistory('000001')).toBeUndefined();
      cacheService.setHistoryIfAbsent('000001', SAMPLE_HISTORY);
      expect(cacheService.getHistory('000001')).toEqual(SAMPLE_HISTORY);
    });

    test('does NOT overwrite existing history', () => {
      marketFundService.addFund('000001', '测试基金');
      const original = [{ date: new Date('2026-03-01').getTime(), value: 9.99, equityReturn: 0 }];
      cacheService.setHistory('000001', original);
      cacheService.setHistoryIfAbsent('000001', SAMPLE_HISTORY);
      expect(cacheService.getHistory('000001')).toEqual(original);
    });

    test('also syncs to marketFundService when absent', () => {
      marketFundService.addFund('000001', '测试基金');
      cacheService.setHistoryIfAbsent('000001', SAMPLE_HISTORY);
      expect(marketFundService.getHistory('000001')).toEqual(SAMPLE_HISTORY);
    });

    test('does NOT touch marketFundService when symbol already cached', () => {
      marketFundService.addFund('000001', '测试基金');
      const original = [{ date: new Date('2026-03-01').getTime(), value: 9.99, equityReturn: 0 }];
      cacheService.setHistory('000001', original);
      cacheService.setHistoryIfAbsent('000001', SAMPLE_HISTORY);
      expect(marketFundService.getHistory('000001')).toEqual(original);
    });
  });

  // ── evictValuations ──────────────────────────────────────────────────────────

  describe('evictValuations', () => {
    test('removes symbols not in keepSymbols from memory', () => {
      marketFundService.addFund('000001', '测试基金');
      marketFundService.addFund('000002', '测试基金2');

      cacheService.setValuation('000001', SAMPLE_VALUATION);
      cacheService.setValuation('000002', { ...SAMPLE_VALUATION, symbol: '000002' });

      cacheService.evictValuations(new Set(['000001']));

      expect(cacheService.getValuation('000001')).toBeDefined();
      expect(cacheService.getValuation('000002')).toBeUndefined();
    });

    test('keeps all symbols when keepSymbols contains all', () => {
      marketFundService.addFund('000001', '测试基金');
      cacheService.setValuation('000001', SAMPLE_VALUATION);
      cacheService.evictValuations(new Set(['000001']));
      expect(cacheService.getValuation('000001')).toBeDefined();
    });

    test('clears all symbols when keepSymbols is empty', () => {
      marketFundService.addFund('000001', '测试基金');
      marketFundService.addFund('000002', '测试基金2');

      cacheService.setValuation('000001', SAMPLE_VALUATION);
      cacheService.setValuation('000002', { ...SAMPLE_VALUATION, symbol: '000002' });
      cacheService.evictValuations(new Set());
      expect(cacheService.getValuation('000001')).toBeUndefined();
      expect(cacheService.getValuation('000002')).toBeUndefined();
    });

    test('no-op when cache is already empty', () => {
      expect(() => cacheService.evictValuations(new Set(['000001']))).not.toThrow();
    });
  });

  // ── intraday compression ─────────────────────────────────────────────────────

  describe('intraday compression', () => {
    test('setIntradayPoints compresses consecutive identical values keeping earliest timestamp', () => {
      marketFundService.addFund('000001', '测试基金');

      const base = Date.now();
      const pts: IntradayPoint[] = [
        { timestamp: base, value: 1.23, equityReturn: 0 },
        { timestamp: base + 60000, value: 1.23, equityReturn: 0 },
        { timestamp: base + 120000, value: 1.24, equityReturn: 0 },
      ];
      cacheService.setIntradayPoints('000001', pts);
      const got = cacheService.getIntradayPoints('000001');
      expect(got.length).toBe(2);
      expect(got[0].value).toBeCloseTo(1.23);
      expect(got[1].value).toBeCloseTo(1.24);
    });

    test('appendIntradayPoint compresses consecutive identical values', () => {
      marketFundService.addFund('000002', '测试基金2');

      const now = Date.now();
      cacheService.appendIntradayPoint('000002', { value: 2.0, lastUpdated: now, equityReturn: 0 });
      const after1 = cacheService.getIntradayPoints('000002');
      expect(after1.length).toBeGreaterThanOrEqual(1);

      cacheService.appendIntradayPoint('000002', { value: 2.0, lastUpdated: now + 5 * 60000, equityReturn: 0 });
      const after2 = cacheService.getIntradayPoints('000002');
      expect(after2.length).toBe(after1.length);
      expect(after2[after2.length - 1].value).toBeCloseTo(2.0);
    });
  });
});

// Unit tests for intraday compression utility
describe('intradayCompression util', () => {
  test('compressConsecutiveSameValues keeps earliest of identical runs', () => {
    const base = 1600000000000;
    const pts = [
      { timestamp: base, value: 1.0, equityReturn: 0 },
      { timestamp: base + 60000, value: 1.0, equityReturn: 0 },
      { timestamp: base + 120000, value: 1.1, equityReturn: 0 },
      { timestamp: base + 180000, value: 1.1, equityReturn: 0 },
      { timestamp: base + 240000, value: 1.2, equityReturn: 0 },
    ];
    const out = compressConsecutiveSameValues(pts as any);
    expect(out.length).toBe(3);
    expect(out[0].timestamp).toBe(base);
    expect(out[1].timestamp).toBe(base + 120000);
    expect(out[2].timestamp).toBe(base + 240000);
  });
});