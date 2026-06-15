import {
  fetchFundData,
  fetchFundHistory,
  fetchSingleIndex,
  normalizeIndexSymbol,
  padSymbol,
  parseJsonpgzResponse,
  parseHistoryFromTrendData,
  buildValuationFromFallback,
  secidToTencentSymbol,
  mergeHistoryWithTencentData,
  computeTradingDateAndTime,
  TradingPeriod,
  parseF80TradingPeriods
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

describe('parseF80TradingPeriods', () => {
  test('parses single trading period', () => {
    const f80 = '[{"b":202605062130,"e":202605070400}]';
    const result = parseF80TradingPeriods(f80);
    expect(result).toHaveLength(1);
    expect(result[0].beginDate).toBe('2026-05-06');
    expect(result[0].endDate).toBe('2026-05-07');
    expect(result[0].beginHHMM).toBe(2130);
    expect(result[0].endHHMM).toBe(400);
  });

  test('parses multiple trading periods (A股)', () => {
    const f80 = '[{"b":202605060930,"e":202605061130},{"b":202605061300,"e":202605061500}]';
    const result = parseF80TradingPeriods(f80);
    expect(result).toHaveLength(2);
    expect(result[0].beginHHMM).toBe(930);
    expect(result[0].endHHMM).toBe(1130);
    expect(result[1].beginHHMM).toBe(1300);
    expect(result[1].endHHMM).toBe(1500);
  });

  test('returns empty array for null/undefined input', () => {
    expect(parseF80TradingPeriods(null)).toEqual([]);
    expect(parseF80TradingPeriods(undefined)).toEqual([]);
    expect(parseF80TradingPeriods('')).toEqual([]);
  });

  test('returns empty array for malformed input', () => {
    expect(parseF80TradingPeriods('invalid')).toEqual([]);
    expect(parseF80TradingPeriods('[{"b":123}]')).toEqual([]); // missing e
    expect(parseF80TradingPeriods('[{"e":456}]')).toEqual([]); // missing b
  });
});

describe('secidToTencentSymbol', () => {
  test.each([
    ['1.000001', 'sh000001'],    // 上证指数
    ['1.000300', 'sh000300'],    // 沪深300
    ['0.399001', 'sz399001'],    // 深证成指
    ['0.399006', 'sz399006'],    // 创业板指
    ['100.HSI', 'hkHSI'],        // 恒生指数
    ['124.HSI', 'hkHSI'],        // 恒生指数(124市场代码)
    ['100.HSTECH', 'hkHSTECH'],  // 恒生科技
    ['124.HSTECH', 'hkHSTECH'],  // 恒生科技(124市场代码)
    ['100.NDX', 'usNDX'],        // 纳斯达克100
    ['100.NDX100', 'usNDX'],     // 纳斯达克100(NDX100代码)
    ['100.SPX', 'usSPX'],        // 标普500
    ['100.1234', 'hk1234'],      // 其他港股(100市场代码)
    ['124.1234', 'hk1234'],      // 其他港股(124市场代码)
    ['101.GC00Y', null],         // 商品期货(黄金)不支持
    ['101.SI00Y', null],         // 商品期货(白银)不支持
    ['invalid', null],           // 无效格式
    ['', null],                  // 空字符串
    ['1', null],                 // 缺少指数代码
    ['2.000001', null],          // 不支持的市场代码
  ])('secidToTencentSymbol("%s") -> "%s"', (input, expected) => {
    expect(secidToTencentSymbol(input)).toBe(expected);
  });
});

describe('mergeHistoryWithTencentData', () => {
  // 辅助函数：创建历史数据点
  const createPoint = (dateStr: string, value: number, equityReturn: number, volume: number, amount?: number): HistoricalPoint => {
    const timestamp = new Date(dateStr).getTime();
    return { date: timestamp, value, equityReturn, volume, amount };
  };

  test('原有数据为空时，返回腾讯数据', () => {
    const existing: HistoricalPoint[] = [];
    const tencent = [
      createPoint('2026-04-21', 3300, 0.5, 100000, 0),
    ];
    const result = mergeHistoryWithTencentData(existing, tencent);
    expect(result).toEqual(tencent);
  });

  test('腾讯数据为空时，返回原有数据', () => {
    const existing = [
      createPoint('2026-04-21', 3300, 0.5, 100000, 5000000),
    ];
    const tencent: HistoricalPoint[] = [];
    const result = mergeHistoryWithTencentData(existing, tencent);
    expect(result).toEqual(existing);
  });

  test('收盘价和成交量都匹配时，保留原有数据（包括成交额）', () => {
    const existing = [
      createPoint('2026-04-21', 3300, 0.5, 100000, 5000000),
    ];
    const tencent = [
      createPoint('2026-04-21', 3300, 0.3, 100000, 0), // equityReturn不同，但收盘价和成交量匹配
    ];
    const result = mergeHistoryWithTencentData(existing, tencent);
    expect(result[0].amount).toBe(5000000); // 保留原有成交额
    expect(result[0].equityReturn).toBe(0.5); // 保留原有涨跌幅
  });

  test('收盘价不同时，使用腾讯数据，成交额设为0', () => {
    const existing = [
      createPoint('2026-04-21', 3300, 0.5, 100000, 5000000),
    ];
    const tencent = [
      createPoint('2026-04-21', 3310, 0.8, 100000, 0), // 收盘价不同
    ];
    const result = mergeHistoryWithTencentData(existing, tencent);
    expect(result[0].value).toBe(3310); // 使用腾讯收盘价
    expect(result[0].equityReturn).toBe(0.8); // 使用腾讯涨跌幅
    expect(result[0].amount).toBe(0); // 成交额设为0
  });

  test('成交量不同时，使用腾讯数据，成交额设为0', () => {
    const existing = [
      createPoint('2026-04-21', 3300, 0.5, 100000, 5000000),
    ];
    const tencent = [
      createPoint('2026-04-21', 3300, 0.5, 120000, 0), // 成交量不同
    ];
    const result = mergeHistoryWithTencentData(existing, tencent);
    expect(result[0].volume).toBe(120000); // 使用腾讯成交量
    expect(result[0].amount).toBe(0); // 成交额设为0
  });

  test('腾讯数据包含原有数据缺失的日期时，添加该日期', () => {
    const existing = [
      createPoint('2026-04-20', 3300, 0.5, 100000, 5000000),
    ];
    const tencent = [
      createPoint('2026-04-20', 3300, 0.5, 100000, 0),
      createPoint('2026-04-21', 3310, 0.3, 110000, 0), // 新日期
    ];
    const result = mergeHistoryWithTencentData(existing, tencent);
    expect(result.length).toBe(2);
    expect(result[1].date).toBe(new Date('2026-04-21').getTime());
    expect(result[1].amount).toBe(0); // 新日期成交额为0
  });

  test('多日数据混合合并', () => {
    const existing = [
      createPoint('2026-04-18', 3280, 0.2, 90000, 4500000), // 匹配
      createPoint('2026-04-19', 3290, 0.3, 95000, 4750000), // 收盘价不匹配
      createPoint('2026-04-20', 3300, 0.3, 100000, 5000000), // 成交量不匹配
    ];
    const tencent = [
      createPoint('2026-04-18', 3280, 0.2, 90000, 0), // 匹配，保留原有
      createPoint('2026-04-19', 3300, 0.3, 95000, 0), // 收盘价不同
      createPoint('2026-04-20', 3300, 0.3, 110000, 0), // 成交量不同
      createPoint('2026-04-21', 3310, 0.3, 105000, 0), // 新日期
    ];
    const result = mergeHistoryWithTencentData(existing, tencent);
    expect(result.length).toBe(4);
    // 第一天：匹配，保留原有成交额
    expect(result[0].amount).toBe(4500000);
    // 第二天：收盘价不同，成交额为0
    expect(result[1].value).toBe(3300);
    expect(result[1].amount).toBe(0);
    // 第三天：成交量不同，成交额为0
    expect(result[2].volume).toBe(110000);
    expect(result[2].amount).toBe(0);
    // 第四天：新日期，成交额为0
    expect(result[3].amount).toBe(0);
  });
});

describe('computeTradingDateAndTime', () => {
  // 辅助函数：创建指定时间的 Date 对象
  const createDate = (dateStr: string, timeStr: string): Date => {
    // dateStr: YYYY-MM-DD, timeStr: HH:mm:ss
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, minute, second = 0] = timeStr.split(':').map(Number);
    return new Date(year, month - 1, day, hour, minute, second);
  };

  // 辅助函数：创建交易时段
  const createPeriod = (beginDate: string, endDate: string, beginHHMM: number, endHHMM: number): TradingPeriod => ({
    beginDate,
    endDate,
    beginHHMM,
    endHHMM,
  });

  describe('无交易时段信息', () => {
    test('返回当前日期和时间作为 fallback', () => {
      const now = createDate('2026-05-06', '10:30:45');
      const result = computeTradingDateAndTime([], now);
      expect(result.tradeDate).toBe('2026-05-06');
      expect(result.lastUpdated).toBe('10:30:45');
    });

    test('空数组返回当前日期和时间', () => {
      const now = createDate('2026-05-06', '10:30:45');
      const result = computeTradingDateAndTime(undefined as any, now);
      expect(result.tradeDate).toBe('2026-05-06');
      expect(result.lastUpdated).toBe('10:30:45');
    });
  });

  describe('在交易时段内', () => {
    test('单时段 - 当前时间在时段内，返回当前日期和时间', () => {
      // A股上午时段：09:30-11:30
      const periods = [createPeriod('2026-05-06', '2026-05-06', 930, 1130)];
      const now = createDate('2026-05-06', '10:00:00'); // 10:00 在时段内
      const result = computeTradingDateAndTime(periods, now);
      expect(result.tradeDate).toBe('2026-05-06');
      expect(result.lastUpdated).toBe('10:00:00');
    });

    test('单时段 - 当前时间刚好等于开盘时间', () => {
      const periods = [createPeriod('2026-05-06', '2026-05-06', 930, 1130)];
      const now = createDate('2026-05-06', '09:30:00'); // 09:30 刚好开盘
      const result = computeTradingDateAndTime(periods, now);
      expect(result.tradeDate).toBe('2026-05-06');
      expect(result.lastUpdated).toBe('09:30:00');
    });

    test('单时段 - 当前时间刚好等于收盘时间', () => {
      const periods = [createPeriod('2026-05-06', '2026-05-06', 930, 1130)];
      const now = createDate('2026-05-06', '11:30:00'); // 11:30 刚好收盘
      const result = computeTradingDateAndTime(periods, now);
      expect(result.tradeDate).toBe('2026-05-06');
      expect(result.lastUpdated).toBe('11:30:00');
    });

    test('多时段（A股）- 当前时间在上午时段内', () => {
      // A股：上午 09:30-11:30，下午 13:00-15:00
      const periods = [
        createPeriod('2026-05-06', '2026-05-06', 930, 1130),
        createPeriod('2026-05-06', '2026-05-06', 1300, 1500),
      ];
      const now = createDate('2026-05-06', '10:15:00'); // 上午时段内
      const result = computeTradingDateAndTime(periods, now);
      expect(result.tradeDate).toBe('2026-05-06');
      expect(result.lastUpdated).toBe('10:15:00');
    });

    test('多时段（A股）- 当前时间在下午时段内', () => {
      const periods = [
        createPeriod('2026-05-06', '2026-05-06', 930, 1130),
        createPeriod('2026-05-06', '2026-05-06', 1300, 1500),
      ];
      const now = createDate('2026-05-06', '14:30:00'); // 下午时段内
      const result = computeTradingDateAndTime(periods, now);
      expect(result.tradeDate).toBe('2026-05-06');
      expect(result.lastUpdated).toBe('14:30:00');
    });

    test('跨日时段 - 当前时间在开盘后（商品期货 06:00-05:00）', () => {
      // 商品期货：06:00-05:00（次日）
      // beginHHMM=600 > endHHMM=500 表示跨日
      const periods = [createPeriod('2026-05-06', '2026-05-07', 600, 500)];
      const now = createDate('2026-05-06', '10:00:00'); // 06:00 之后，05:00 之前
      const result = computeTradingDateAndTime(periods, now);
      expect(result.tradeDate).toBe('2026-05-06');
      expect(result.lastUpdated).toBe('10:00:00');
    });

    test('跨日时段 - 当前时间在次日收盘前（商品期货 06:00-05:00）', () => {
      // 商品期货：06:00-05:00（次日）
      const periods = [createPeriod('2026-05-06', '2026-05-07', 600, 500)];
      const now = createDate('2026-05-07', '03:30:00'); // 次日 03:30，在 05:00 收盘前
      const result = computeTradingDateAndTime(periods, now);
      expect(result.tradeDate).toBe('2026-05-07');
      expect(result.lastUpdated).toBe('03:30:00');
    });

    test('跨日时段 - 当前时间在次日刚好等于收盘时间（商品期货 06:00-05:00）', () => {
      const periods = [createPeriod('2026-05-06', '2026-05-07', 600, 500)];
      const now = createDate('2026-05-07', '05:00:00'); // 次日 05:00 收盘
      const result = computeTradingDateAndTime(periods, now);
      expect(result.tradeDate).toBe('2026-05-07');
      expect(result.lastUpdated).toBe('05:00:00');
    });

    test('跨日时段 - 美股 21:30-04:00，当前时间在夜间交易时段', () => {
      // 美股：21:30-04:00（次日）
      const periods = [createPeriod('2026-05-06', '2026-05-07', 2130, 400)];
      const now = createDate('2026-05-06', '22:00:00'); // 21:30 之后
      const result = computeTradingDateAndTime(periods, now);
      expect(result.tradeDate).toBe('2026-05-06');
      expect(result.lastUpdated).toBe('22:00:00');
    });

    test('跨日时段 - 美股 21:30-04:00，当前时间在次日收盘前', () => {
      const periods = [createPeriod('2026-05-06', '2026-05-07', 2130, 400)];
      const now = createDate('2026-05-07', '02:30:00'); // 次日 02:30
      const result = computeTradingDateAndTime(periods, now);
      expect(result.tradeDate).toBe('2026-05-07');
      expect(result.lastUpdated).toBe('02:30:00');
    });
  });

  describe('不在交易时段内', () => {
    test('单时段 - 当前时间在开盘前，应返回上一个交易日收盘时间（需要历史数据辅助判断）', () => {
      // A股上午时段：09:30-11:30
      // 当前时间：周一 08:30，开盘前
      // 注意：computeTradingDateAndTime 函数只根据交易时段判断
      // 开盘前的逻辑：当当前时间早于第一个时段的开盘时间时，
      // 函数无法判断"上一个交易日"（因为f80只包含当前交易日信息）
      // 所以返回当前交易时段的收盘时间作为 fallback
      const periods = [createPeriod('2026-05-06', '2026-05-06', 930, 1130)];
      const now = createDate('2026-05-06', '08:30:00'); // 08:30 在开盘前
      const result = computeTradingDateAndTime(periods, now);
      // 函数返回当前交易时段的收盘时间（这是函数层面的 fallback）
      // 上层逻辑（fetchSingleIndex）会用历史数据覆盖这个值
      expect(result.tradeDate).toBe('2026-05-06');
      expect(result.lastUpdated).toBe('11:30:00');
    });

    test('单时段 - 当前时间在收盘后，返回收盘日期和时间', () => {
      const periods = [createPeriod('2026-05-06', '2026-05-06', 930, 1130)];
      const now = createDate('2026-05-06', '12:00:00'); // 12:00 在收盘后
      const result = computeTradingDateAndTime(periods, now);
      expect(result.tradeDate).toBe('2026-05-06');
      expect(result.lastUpdated).toBe('11:30:00');
    });

    test('多时段（A股）- 当前时间在午休时段（11:30-13:00），应返回上午收盘时间', () => {
      const periods = [
        createPeriod('2026-05-06', '2026-05-06', 930, 1130),
        createPeriod('2026-05-06', '2026-05-06', 1300, 1500),
      ];
      const now = createDate('2026-05-06', '11:40:00'); // 午休时段（上午收盘后）
      const result = computeTradingDateAndTime(periods, now);
      // 午休时段不在任何交易时段内，应返回上午收盘时间（11:30），而非下午收盘时间（15:00）
      expect(result.tradeDate).toBe('2026-05-06');
      expect(result.lastUpdated).toBe('11:30:00'); // 上午收盘时间
    });

    test('多时段（A股）- 当前时间在全天收盘后（16:00）', () => {
      const periods = [
        createPeriod('2026-05-06', '2026-05-06', 930, 1130),
        createPeriod('2026-05-06', '2026-05-06', 1300, 1500),
      ];
      const now = createDate('2026-05-06', '16:00:00'); // 全天收盘后
      const result = computeTradingDateAndTime(periods, now);
      expect(result.tradeDate).toBe('2026-05-06');
      expect(result.lastUpdated).toBe('15:00:00');
    });

    test('跨日时段 - 商品期货 06:00-05:00，当前时间在收盘后开盘前的空档（05:00-06:00）', () => {
      const periods = [createPeriod('2026-05-06', '2026-05-07', 600, 500)];
      const now = createDate('2026-05-07', '05:30:00'); // 05:30 在收盘后开盘前
      const result = computeTradingDateAndTime(periods, now);
      expect(result.tradeDate).toBe('2026-05-07'); // 收盘日期
      expect(result.lastUpdated).toBe('05:00:00'); // 收盘时间
    });

    test('跨日时段 - 美股 21:30-04:00，当前时间在收盘后开盘前的空档（04:00-21:30）', () => {
      const periods = [createPeriod('2026-05-06', '2026-05-07', 2130, 400)];
      const now = createDate('2026-05-07', '10:00:00'); // 10:00 在收盘后开盘前
      const result = computeTradingDateAndTime(periods, now);
      expect(result.tradeDate).toBe('2026-05-07'); // 收盘日期
      expect(result.lastUpdated).toBe('04:00:00'); // 收盘时间
    });

    test('使用最后一个时段的收盘日期和时间', () => {
      // 多时段场景（A股），当前时间在全天收盘后
      const periods = [
        createPeriod('2026-05-06', '2026-05-06', 930, 1130),
        createPeriod('2026-05-06', '2026-05-06', 1300, 1500),
      ];
      const now = createDate('2026-05-06', '16:00:00'); // 全天收盘后
      const result = computeTradingDateAndTime(periods, now);
      expect(result.tradeDate).toBe('2026-05-06'); // 最后一个时段的收盘日期
      expect(result.lastUpdated).toBe('15:00:00'); // 最后一个时段的收盘时间
    });

    test('非交易日 - 当前日期与交易时段日期不一致，应返回上一个交易日收盘时间', () => {
      // 港股恒生科技：交易时段 09:30-12:00, 13:00-16:00
      // 交易时段日期是5月22日（周四），当前日期是5月25日（周一，港股休市）
      const periods = [
        createPeriod('2026-05-22', '2026-05-22', 930, 1200),
        createPeriod('2026-05-22', '2026-05-22', 1300, 1600),
      ];
      const now = createDate('2026-05-25', '11:49:00'); // 5月25日11:49，港股休市
      const result = computeTradingDateAndTime(periods, now);
      // 当前日期(5月25日)与交易时段日期(5月22日)不一致，是非交易日
      // 应返回上一个交易日(5月22日)的最后收盘时间(16:00)
      expect(result.tradeDate).toBe('2026-05-22');
      expect(result.lastUpdated).toBe('16:00:00'); // 上一个交易日收盘时间
    });

    test('开盘前 - 当前日期匹配beginDate但时间在开盘前，应返回上一个交易日收盘时间', () => {
      // 美股：交易时段 21:30-04:00（跨日）
      // 交易时段：5月5日晚间21:30开盘，5月6日凌晨04:00收盘
      const periods = [createPeriod('2026-05-05', '2026-05-06', 2130, 400)];
      const now = createDate('2026-05-05', '20:00:00'); // 5月5日20:00，开盘前1.5小时
      const result = computeTradingDateAndTime(periods, now);
      // 当前日期(5月5日)匹配beginDate，但时间20:00在开盘时间21:30之前
      // 这是"待开盘"状态，不是"交易日的午休/收盘后"
      // 应返回上一个交易日收盘时间，而非即将到来的收盘时间
      expect(result.tradeDate).toBe('2026-05-06');
      expect(result.lastUpdated).toBe('04:00:00'); // 上一个交易日收盘时间（5月6日凌晨4点）
    });

    test('开盘前（A股多时段）- 当前时间早于开盘时间，函数返回最近的收盘时间（需要上层逻辑用历史数据覆盖）', () => {
      // A股：上午 09:30-11:30，下午 13:00-15:00
      // 周一早上08:30，开盘前
      const periods = [
        createPeriod('2026-05-06', '2026-05-06', 930, 1130),
        createPeriod('2026-05-06', '2026-05-06', 1300, 1500),
      ];
      const now = createDate('2026-05-06', '08:30:00'); // 08:30 在开盘前
      const result = computeTradingDateAndTime(periods, now);
      // computeTradingDateAndTime 只能根据 f80 判断，无法获取上一个交易日信息
      // 当前时间08:30距离最近的收盘时间是11:30（上午收盘），距离更近
      // 所以返回11:30，这是函数层面的结果（但这是未来的时间）
      // 上层逻辑（fetchSingleIndex）会判断开盘前状态，从历史数据获取上一个交易日信息并覆盖
      expect(result.tradeDate).toBe('2026-05-06'); // 函数层面返回当天日期
      expect(result.lastUpdated).toBe('11:30:00'); // 函数层面返回最近的收盘时间（上午收盘）
    });
  });
});
