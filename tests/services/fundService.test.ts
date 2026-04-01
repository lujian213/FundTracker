import {
  fetchFundData,
  fetchFundHistory,
  fetchSingleIndex,
  normalizeIndexSymbol,
  padSymbol,
  parseJsonpgzResponse,
  parseHistoryFromTrendData,
  buildValuationFromFallback
} from '../../services/fundService';
import { ValuationData, HistoricalPoint } from '../../types';

describe('padSymbol', () => {
  test.each([
    ['1234', '001234'],
    ['12345', '012345'],
    ['123456', '123456'],
    ['1234567', '1234567'],
    ['', '000000'],
    ['1', '000001'],
  ])('padSymbol("%s") -> "%s"', (input, expected) => {
    expect(padSymbol(input)).toBe(expected);
  });
});

describe('parseJsonpgzResponse', () => {
  test('parses valid jsonpgz response into ValuationData', () => {
    const input = {
      fundcode: '123456',
      name: 'Test Fund',
      gsz: '1.2345',
      dwjz: '1.0000',
      gszzl: '23.45',
      gztime: '2026-02-11 15:30:00',
      jzrq: '2026-02-11'
    };

    const result = parseJsonpgzResponse(input);

    expect(result).not.toBeNull();
    expect(result!.symbol).toBe('123456');
    expect(result!.name).toBe('Test Fund');
    expect(result!.currentPrice).toBeCloseTo(1.2345);
    expect(result!.previousPrice).toBeCloseTo(1.0);
    expect(result!.changePercentage).toBeCloseTo(23.45);
    expect(result!.lastUpdated).toBe('2026-02-11 15:30:00');
    expect(result!.realtimeDate).toBe('2026-02-11');
    expect(result!.netWorthDate).toBe('2026-02-11');
    expect(result!.sourceUrl).toBe('https://fund.eastmoney.com/123456.html');
  });

  test('returns null for null input', () => {
    expect(parseJsonpgzResponse(null)).toBeNull();
  });

  test('returns null for undefined input', () => {
    expect(parseJsonpgzResponse(undefined)).toBeNull();
  });

  test('returns null for empty object', () => {
    expect(parseJsonpgzResponse({})).toBeNull();
  });

  test('returns null for object without fundcode', () => {
    expect(parseJsonpgzResponse({ name: 'Test' })).toBeNull();
  });

  test('handles missing optional fields with defaults', () => {
    const input = {
      fundcode: '123456',
      // name is missing
      gsz: '', // invalid number
      dwjz: 'invalid',
      gszzl: '',
      gztime: '',
      jzrq: ''
    };

    const result = parseJsonpgzResponse(input);

    expect(result).not.toBeNull();
    expect(result!.name).toBe('未知基金');
    expect(result!.currentPrice).toBe(0);
    expect(result!.previousPrice).toBe(0);
    expect(result!.changePercentage).toBe(0);
    expect(result!.lastUpdated).toBe('---');
    expect(result!.realtimeDate).toBe('---');
    expect(result!.netWorthDate).toBe('---');
  });

  test('extracts realtimeDate from gztime', () => {
    const input = {
      fundcode: '123456',
      name: 'Test',
      gsz: '1.0',
      dwjz: '1.0',
      gszzl: '0',
      gztime: '2026-03-15 09:30:00',
      jzrq: '2026-03-14'
    };

    const result = parseJsonpgzResponse(input);

    expect(result!.realtimeDate).toBe('2026-03-15');
    expect(result!.netWorthDate).toBe('2026-03-14');
  });
});

describe('parseHistoryFromTrendData', () => {
  test('parses valid trend data into HistoricalPoint[]', () => {
    const input = [
      { x: 1670000000000, y: '1.1000', equityReturn: '0.01' },
      { x: 1670000001000, y: '1.2000', equityReturn: '0.02' }
    ];

    const result = parseHistoryFromTrendData(input);

    expect(result).toHaveLength(2);
    expect(result[0].date).toBe(1670000000000);
    expect(result[0].value).toBeCloseTo(1.1);
    expect(result[0].equityReturn).toBeCloseTo(0.01);
    expect(result[1].date).toBe(1670000001000);
    expect(result[1].value).toBeCloseTo(1.2);
    expect(result[1].equityReturn).toBeCloseTo(0.02);
  });

  test('returns empty array for null input', () => {
    expect(parseHistoryFromTrendData(null)).toEqual([]);
  });

  test('returns empty array for undefined input', () => {
    expect(parseHistoryFromTrendData(undefined)).toEqual([]);
  });

  test('returns empty array for non-array input', () => {
    expect(parseHistoryFromTrendData({})).toEqual([]);
    expect(parseHistoryFromTrendData('string')).toEqual([]);
  });

  test('returns empty array for empty array', () => {
    expect(parseHistoryFromTrendData([])).toEqual([]);
  });

  test('normalizes second-level timestamps to milliseconds', () => {
    const input = [
      { x: 1699999000, y: '1.00', equityReturn: '0.00' },  // seconds -> 1699999000000
      { x: 1700000000000, y: '1.10', equityReturn: '0.10' } // milliseconds
    ];

    const result = parseHistoryFromTrendData(input);

    expect(result).toHaveLength(2);
    expect(result[0].date).toBe(1699999000000); // converted to ms
    expect(result[1].date).toBe(1700000000000);
  });

  test('sorts data ascending by date', () => {
    const input = [
      { x: 1700000200, y: '1.20', equityReturn: '0.10' },
      { x: 1700000000, y: '1.00', equityReturn: '0.00' },
      { x: 1700000100, y: '1.10', equityReturn: '0.05' }
    ];

    const result = parseHistoryFromTrendData(input);

    expect(result).toHaveLength(3);
    expect(result.map(p => p.date)).toEqual([1700000000000, 1700000100000, 1700000200000]);
  });

  test('deduplicates same timestamp keeping latest value', () => {
    const input = [
      { x: 1700000100, y: '1.10', equityReturn: '0.10' },
      { x: 1700000100, y: '1.15', equityReturn: '0.15' }  // duplicate timestamp
    ];

    const result = parseHistoryFromTrendData(input);

    expect(result).toHaveLength(1);
    expect(result[0].value).toBeCloseTo(1.15); // keeps latest
    expect(result[0].equityReturn).toBeCloseTo(0.15);
  });

  test('handles missing fields gracefully', () => {
    const input = [
      { x: 1670000000000 }, // missing y and equityReturn
      { y: '1.5' }, // missing x
    ];

    const result = parseHistoryFromTrendData(input);

    // First point has valid date but missing value -> value=0
    // Second point missing date -> filtered out
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe(1670000000000);
    expect(result[0].value).toBe(0);
    expect(result[0].equityReturn).toBe(0);
  });
});

describe('buildValuationFromFallback', () => {
  test('builds ValuationData from valid trend data', () => {
    const code = '019005';
    const trend = [
      { x: 1700000000000, y: '1.0000', equityReturn: '0' },
      { x: 1700000001000, y: '1.1000', equityReturn: '0.1' }
    ];

    const result = buildValuationFromFallback(code, trend, '东方基金 019005');

    expect(result).not.toBeNull();
    expect(result!.symbol).toBe('019005');
    expect(result!.name).toBe('东方基金 019005');
    expect(result!.currentPrice).toBeCloseTo(1.1);
    expect(result!.previousPrice).toBeCloseTo(1.1);
    expect(result!.changePercentage).toBeCloseTo(10); // (1.1-1.0)/1.0 * 100
  });

  test('builds ValuationData with default name when name is null', () => {
    const code = '123456';
    const trend = [
      { x: 1700000000000, y: '1.0000', equityReturn: '0' }
    ];

    const result = buildValuationFromFallback(code, trend, null);

    expect(result).not.toBeNull();
    expect(result!.name).toBe('基金 123456');
  });

  test('returns null for null trend', () => {
    expect(buildValuationFromFallback('123456', null)).toBeNull();
  });

  test('returns null for undefined trend', () => {
    expect(buildValuationFromFallback('123456', undefined)).toBeNull();
  });

  test('returns null for empty array', () => {
    expect(buildValuationFromFallback('123456', [])).toBeNull();
  });

  test('returns null for non-array trend', () => {
    expect(buildValuationFromFallback('123456', {} as any)).toBeNull();
  });

  test('handles single trend point with zero change percentage', () => {
    const code = '019005';
    const trend = [
      { x: 1700000000000, y: '2.0000', equityReturn: '0' }
    ];

    const result = buildValuationFromFallback(code, trend);

    expect(result).not.toBeNull();
    expect(result!.currentPrice).toBeCloseTo(2.0);
    expect(result!.previousPrice).toBeCloseTo(2.0);
    expect(result!.changePercentage).toBe(0); // no previous point
  });

  test('handles invalid y values gracefully', () => {
    const code = '019005';
    const trend = [
      { x: 1700000000000, y: 'invalid', equityReturn: '0' },
      { x: 1700000001000, y: '1.1000', equityReturn: '0.1' }
    ];

    const result = buildValuationFromFallback(code, trend);

    expect(result).not.toBeNull();
    expect(result!.currentPrice).toBeCloseTo(1.1);
    expect(result!.previousPrice).toBeCloseTo(1.1);
  });

  test('uses latest history point date as netWorthDate', () => {
    const code = '019005';
    // Use timestamps representing later in the day to ensure consistent local date across timezones
    const trend = [
      { x: 1770955200000, y: '2.1904', equityReturn: '-4.98' },  // Feb 23, 2026 12:00 UTC
      { x: 1771905600000, y: '2.4405', equityReturn: '11.42' }   // Feb 24, 2026 12:00 UTC
    ];

    const result = buildValuationFromFallback(code, trend);

    expect(result).not.toBeNull();
    expect(result!.currentPrice).toBeCloseTo(2.4405);
    expect(result!.previousPrice).toBeCloseTo(2.4405);
    expect(result!.netWorthDate).toBe('2026-02-24');
    expect(result!.lastUpdated).toBe('2026-02-24 15:00:00');
  });

  test('extracts name from fS_name style', () => {
    const code = '019005';
    const trend = [
      { x: 1700000000000, y: '1.0000', equityReturn: '0' },
      { x: 1700000001000, y: '1.1000', equityReturn: '0.1' }
    ];

    const result = buildValuationFromFallback(code, trend, '国投瑞银白银期货(LOF)C');

    expect(result!.name).toBe('国投瑞银白银期货(LOF)C');
  });
});

describe('normalizeIndexSymbol', () => {
  test('keeps domestic secid symbol stable (1.000001)', () => {
    expect(normalizeIndexSymbol('1.000001')).toBe('1.000001');
  });

  test('keeps domestic secid symbol stable (0.000001)', () => {
    expect(normalizeIndexSymbol('0.000001')).toBe('0.000001');
  });

  test('normalizes alias NDX to 100.NDX', () => {
    expect(normalizeIndexSymbol('NDX')).toBe('100.NDX');
  });

  test('normalizes alias SPX to 100.SPX', () => {
    expect(normalizeIndexSymbol('SPX')).toBe('100.SPX');
  });

  test('normalizes alias HSI to 100.HSI', () => {
    expect(normalizeIndexSymbol('HSI')).toBe('100.HSI');
  });

  test('keeps already normalized symbols unchanged', () => {
    expect(normalizeIndexSymbol('100.NDX')).toBe('100.NDX');
    expect(normalizeIndexSymbol('100.SPX')).toBe('100.SPX');
    expect(normalizeIndexSymbol('100.HSI')).toBe('100.HSI');
  });

  test('handles lowercase input', () => {
    expect(normalizeIndexSymbol('ndx')).toBe('100.NDX');
    expect(normalizeIndexSymbol('spx')).toBe('100.SPX');
  });

  test('handles empty and whitespace input', () => {
    expect(normalizeIndexSymbol('')).toBe('');
    expect(normalizeIndexSymbol('   ')).toBe('');
  });
});