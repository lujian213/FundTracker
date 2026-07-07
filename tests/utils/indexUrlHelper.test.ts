import {
  parseIndexCode,
  generateEastmoneyIndexUrl,
  getIndexDetailUrl,
  getMarketDescription,
  isDomesticIndex,
  isGlobalIndex,
  isAStockIndex,
  getIndexMarketType,
  getIndexName,
  convertIndexCode,
  INDEX_NAME_MAP,
  INDEX_CODE_DICT,
  IndexMarket,
} from '../../src/utils/indexUrlHelper';

describe('Index URL Helper', () => {
  describe('parseIndexCode', () => {
    test('解析上证指数代码', () => {
      const result = parseIndexCode('1.000001');
      expect(result.marketCode).toBe(1);
      expect(result.indexCode).toBe('000001');
    });

    test('解析深证成指代码', () => {
      const result = parseIndexCode('0.399001');
      expect(result.marketCode).toBe(0);
      expect(result.indexCode).toBe('399001');
    });

    test('解析恒生科技指数代码', () => {
      const result = parseIndexCode('124.HSTECH');
      expect(result.marketCode).toBe(124);
      expect(result.indexCode).toBe('HSTECH');
    });

    test('解析纳斯达克100代码', () => {
      const result = parseIndexCode('100.NDX100');
      expect(result.marketCode).toBe(100);
      expect(result.indexCode).toBe('NDX100');
    });

    test('解析COMEX黄金代码', () => {
      const result = parseIndexCode('101.GC00Y');
      expect(result.marketCode).toBe(101);
      expect(result.indexCode).toBe('GC00Y');
    });

    test('无效格式应该抛出错误', () => {
      expect(() => parseIndexCode('000001')).toThrow('Invalid index code format');
      expect(() => parseIndexCode('invalid')).toThrow('Invalid index code format');
    });
  });

  describe('generateEastmoneyIndexUrl', () => {
    test('生成上交所指数URL', () => {
      const url = generateEastmoneyIndexUrl(1, '000001');
      expect(url).toBe('https://quote.eastmoney.com/zs000001.html');
    });

    test('生成深交所指数URL', () => {
      const url = generateEastmoneyIndexUrl(0, '399001');
      expect(url).toBe('https://quote.eastmoney.com/unify/r/0.399001.html');
    });

    test('生成深交所创业板指数URL', () => {
      const url = generateEastmoneyIndexUrl(0, '399006');
      expect(url).toBe('https://quote.eastmoney.com/unify/r/0.399006.html');
    });

    test('生成港股恒生指数URL（特殊情况：市场代码100）', () => {
      const url = generateEastmoneyIndexUrl(100, 'HSI');
      expect(url).toBe('https://quote.eastmoney.com/gb/zsHSI.html');
    });

    test('生成港股恒生科技指数URL（市场代码124）', () => {
      const url = generateEastmoneyIndexUrl(124, 'HSTECH');
      expect(url).toBe('https://quote.eastmoney.com/gb/zsHSTECH.html');
    });

    test('生成美股指数URL', () => {
      const url = generateEastmoneyIndexUrl(100, 'NDX100');
      expect(url).toBe('https://quote.eastmoney.com/gb/zsNDX100.html');
    });

    test('生成全球期货URL - COMEX黄金', () => {
      const url = generateEastmoneyIndexUrl(101, 'GC00Y');
      expect(url).toBe('https://quote.eastmoney.com/globalfuture/GC00Y.html');
    });

    test('生成全球期货URL - COMEX白银', () => {
      const url = generateEastmoneyIndexUrl(101, 'SI00Y');
      expect(url).toBe('https://quote.eastmoney.com/globalfuture/SI00Y.html');
    });

    test('生成全球期货URL - NYMEX原油', () => {
      const url = generateEastmoneyIndexUrl(102, 'CL00Y');
      expect(url).toBe('https://quote.eastmoney.com/globalfuture/CL00Y.html');
    });

    test('未知市场代码 - 纯数字指数代码使用上交所格式', () => {
      const url = generateEastmoneyIndexUrl(999, '123456');
      expect(url).toBe('https://quote.eastmoney.com/zs123456.html');
    });

    test('未知市场代码 - 字母指数代码使用全球格式', () => {
      const url = generateEastmoneyIndexUrl(999, 'TEST');
      expect(url).toBe('https://quote.eastmoney.com/gb/zsTEST.html');
    });
  });

  describe('getIndexDetailUrl', () => {
    test('完整流程：上证指数', () => {
      const url = getIndexDetailUrl('1.000001');
      expect(url).toBe('https://quote.eastmoney.com/zs000001.html');
    });

    test('完整流程：深证成指', () => {
      const url = getIndexDetailUrl('0.399001');
      expect(url).toBe('https://quote.eastmoney.com/unify/r/0.399001.html');
    });

    test('完整流程：创业板指', () => {
      const url = getIndexDetailUrl('0.399006');
      expect(url).toBe('https://quote.eastmoney.com/unify/r/0.399006.html');
    });

    test('完整流程：恒生科技指数', () => {
      const url = getIndexDetailUrl('124.HSTECH');
      expect(url).toBe('https://quote.eastmoney.com/gb/zsHSTECH.html');
    });

    test('完整流程：纳斯达克100', () => {
      const url = getIndexDetailUrl('100.NDX100');
      expect(url).toBe('https://quote.eastmoney.com/gb/zsNDX100.html');
    });

    test('完整流程：COMEX黄金', () => {
      const url = getIndexDetailUrl('101.GC00Y');
      expect(url).toBe('https://quote.eastmoney.com/globalfuture/GC00Y.html');
    });

    test('完整流程：COMEX白银', () => {
      const url = getIndexDetailUrl('101.SI00Y');
      expect(url).toBe('https://quote.eastmoney.com/globalfuture/SI00Y.html');
    });
  });

  describe('getMarketDescription', () => {
    test('上交所描述', () => {
      expect(getMarketDescription(1)).toBe('上海证券交易所');
    });

    test('深交所描述', () => {
      expect(getMarketDescription(0)).toBe('深圳证券交易所');
    });

    test('港股恒生指数描述（特殊情况）', () => {
      expect(getMarketDescription(100, 'HSI')).toBe('香港交易所（恒生指数）');
    });

    test('港股恒生科技指数描述', () => {
      expect(getMarketDescription(124)).toBe('香港交易所（恒生科技）');
    });

    test('美股指数描述（市场代码100）', () => {
      expect(getMarketDescription(100, 'NDX')).toBe('全球指数（美股）');
    });

    test('COMEX期货描述', () => {
      expect(getMarketDescription(101)).toBe('全球期货（COMEX）');
    });

    test('NYMEX期货描述', () => {
      expect(getMarketDescription(102)).toBe('全球期货（NYMEX）');
    });
  });

  describe('IndexMarket Enum', () => {
    test('枚举值正确', () => {
      expect(IndexMarket.SHSE).toBe(1);
      expect(IndexMarket.SZSE).toBe(0);
      expect(IndexMarket.GLOBAL_INDEX).toBe(100);
      expect(IndexMarket.HKEX_TECH).toBe(124);
      expect(IndexMarket.GLOBAL_FUTURE_COMMEX).toBe(101);
      expect(IndexMarket.GLOBAL_FUTURE_NYMEX).toBe(102);
    });
  });

  describe('isDomesticIndex', () => {
    test('A股指数 - 上交所', () => {
      expect(isDomesticIndex('1.000001')).toBe(true);
      expect(isDomesticIndex('1.000300')).toBe(true);
    });

    test('A股指数 - 深交所', () => {
      expect(isDomesticIndex('0.399001')).toBe(true);
      expect(isDomesticIndex('0.399006')).toBe(true);
    });

    test('港股指数 - 恒生指数', () => {
      expect(isDomesticIndex('100.HSI')).toBe(true);
    });

    test('港股指数 - 恒生科技', () => {
      expect(isDomesticIndex('124.HSTECH')).toBe(true);
    });

    test('全球指数 - 美股', () => {
      expect(isDomesticIndex('100.NDX')).toBe(false);
      expect(isDomesticIndex('100.SPX')).toBe(false);
    });

    test('全球期货', () => {
      expect(isDomesticIndex('101.GC00Y')).toBe(false);
      expect(isDomesticIndex('102.CL00Y')).toBe(false);
    });
  });

  describe('isGlobalIndex', () => {
    test('全球指数 - 美股', () => {
      expect(isGlobalIndex('100.NDX')).toBe(true);
      expect(isGlobalIndex('100.SPX')).toBe(true);
    });

    test('全球期货', () => {
      expect(isGlobalIndex('101.GC00Y')).toBe(true);
      expect(isGlobalIndex('102.CL00Y')).toBe(true);
    });

    test('A股指数', () => {
      expect(isGlobalIndex('1.000001')).toBe(false);
      expect(isGlobalIndex('0.399001')).toBe(false);
    });

    test('港股指数', () => {
      expect(isGlobalIndex('100.HSI')).toBe(false);
      expect(isGlobalIndex('124.HSTECH')).toBe(false);
    });
  });

  describe('isAStockIndex', () => {
    test('A股指数 - 上交所', () => {
      expect(isAStockIndex('1.000001')).toBe(true);
      expect(isAStockIndex('1.000300')).toBe(true);
    });

    test('A股指数 - 深交所', () => {
      expect(isAStockIndex('0.399001')).toBe(true);
      expect(isAStockIndex('0.399006')).toBe(true);
      expect(isAStockIndex('0.399005')).toBe(true);
    });

    test('港股指数 - 不属于A股', () => {
      expect(isAStockIndex('100.HSI')).toBe(false);
      expect(isAStockIndex('124.HSTECH')).toBe(false);
    });

    test('美股指数 - 不属于A股', () => {
      expect(isAStockIndex('100.NDX')).toBe(false);
      expect(isAStockIndex('100.SPX')).toBe(false);
      expect(isAStockIndex('100.DJI')).toBe(false);
      expect(isAStockIndex('100.IXIC')).toBe(false);
    });

    test('全球期货 - 不属于A股', () => {
      expect(isAStockIndex('101.GC00Y')).toBe(false);
      expect(isAStockIndex('102.CL00Y')).toBe(false);
    });

    test('无效格式返回false', () => {
      expect(isAStockIndex('invalid')).toBe(false);
      expect(isAStockIndex('000001')).toBe(false); // 缺少市场代码前缀
    });
  });

  describe('getIndexMarketType', () => {
    test('上交所市场代码', () => {
      expect(getIndexMarketType('1.000001')).toBe(1);
    });

    test('深交所市场代码', () => {
      expect(getIndexMarketType('0.399001')).toBe(0);
    });

    test('全球指数市场代码', () => {
      expect(getIndexMarketType('100.NDX')).toBe(100);
      expect(getIndexMarketType('100.HSI')).toBe(100);
    });

    test('港股科技市场代码', () => {
      expect(getIndexMarketType('124.HSTECH')).toBe(124);
    });

    test('期货市场代码', () => {
      expect(getIndexMarketType('101.GC00Y')).toBe(101);
      expect(getIndexMarketType('102.CL00Y')).toBe(102);
    });

    test('无效格式默认返回1', () => {
      expect(getIndexMarketType('invalid')).toBe(1);
    });
  });

  describe('getIndexName', () => {
    test('已知的指数名称', () => {
      expect(getIndexName('1.000001')).toBe('上证指数');
      expect(getIndexName('0.399001')).toBe('深证成指');
      expect(getIndexName('100.HSI')).toBe('恒生指数');
      expect(getIndexName('124.HSTECH')).toBe('恒生科技');
    });

    test('未知的指数返回原代码', () => {
      expect(getIndexName('999.UNKNOWN')).toBe('999.UNKNOWN');
    });
  });

  describe('convertIndexCode', () => {
    test('已经是完整格式，直接返回', () => {
      expect(convertIndexCode('1.000001')).toBe('1.000001');
      expect(convertIndexCode('100.NDX')).toBe('100.NDX');
    });

    test('简码转换为完整代码', () => {
      expect(convertIndexCode('000001')).toBe('1.000001');
      expect(convertIndexCode('399001')).toBe('0.399001');
      expect(convertIndexCode('NDX')).toBe('100.NDX');
      expect(convertIndexCode('NDX100')).toBe('100.NDX100');
      expect(convertIndexCode('HSI')).toBe('100.HSI');
      expect(convertIndexCode('HSTECH')).toBe('124.HSTECH');
    });

    test('未知简码返回原代码', () => {
      expect(convertIndexCode('UNKNOWN')).toBe('UNKNOWN');
    });
  });

  describe('INDEX_NAME_MAP', () => {
    test('包含常见的指数映射', () => {
      expect(INDEX_NAME_MAP['1.000001']).toBe('上证指数');
      expect(INDEX_NAME_MAP['0.399001']).toBe('深证成指');
      expect(INDEX_NAME_MAP['100.HSI']).toBe('恒生指数');
      expect(INDEX_NAME_MAP['124.HSTECH']).toBe('恒生科技');
    });
  });

  describe('INDEX_CODE_DICT', () => {
    test('包含常见的代码转换', () => {
      expect(INDEX_CODE_DICT['000001']).toBe('1.000001');
      expect(INDEX_CODE_DICT['NDX']).toBe('100.NDX');
      expect(INDEX_CODE_DICT['HSI']).toBe('100.HSI');
      expect(INDEX_CODE_DICT['HSTECH']).toBe('124.HSTECH');
    });
  });
});