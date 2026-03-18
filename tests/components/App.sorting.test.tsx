import { toLocalDateKey } from '../../utils/priceResolver';
import { ValuationData, Ticker, MarketType } from '../../types';

/**
 * 排序算法测试
 * 规则：
 * 1. 按是否有当日估值分为两类：A类（有当日估值）排在B类（无当日估值）前面
 * 2. 同类内部按涨跌幅排序
 */
describe('基金排序算法', () => {
  // 模拟 App.tsx 中的排序逻辑
  const sortPortfolio = (
    portfolio: Ticker[],
    marketData: Record<string, ValuationData>,
    sortOrder: 'asc' | 'desc'
  ): Ticker[] => {
    const today = toLocalDateKey(new Date('2026-03-17'));

    return [...portfolio].sort((a, b) => {
      const valA = marketData[a.symbol];
      const valB = marketData[b.symbol];

      // 判断是否有当日估值：realtimeDate 等于今天日期
      const hasTodayValuationA = valA?.realtimeDate === today;
      const hasTodayValuationB = valB?.realtimeDate === today;

      // A类（有当日估值）排在B类（无当日估值）前面
      if (hasTodayValuationA && !hasTodayValuationB) return -1;
      if (!hasTodayValuationA && hasTodayValuationB) return 1;

      // 同类内部按涨跌幅排序
      const changeA = valA?.changePercentage ?? -9999;
      const changeB = valB?.changePercentage ?? -9999;
      return sortOrder === 'asc' ? changeA - changeB : changeB - changeA;
    });
  };

  const mockPortfolio: Ticker[] = [
    { id: '1', symbol: '000001', name: '华夏成长混合', market: MarketType.FUND },
    { id: '2', symbol: '000002', name: '易方达消费行业', market: MarketType.FUND },
    { id: '3', symbol: '000003', name: '南方稳健成长', market: MarketType.FUND },
  ];

  test('有当日估值(A类)排在无当日估值(B类)前面', () => {
    const marketData: Record<string, ValuationData> = {
      '000001': {
        symbol: '000001', name: '华夏成长混合', currentPrice: 2.5, previousPrice: 2.4,
        changePercentage: 1.0, lastUpdated: '2026-03-17 15:00',
        realtimeDate: '2026-03-17', netWorthDate: '2026-03-16', valuationDate: '2026-03-17', sourceUrl: ''
      },
      '000002': {
        symbol: '000002', name: '易方达消费行业', currentPrice: 3.2, previousPrice: 3.1,
        changePercentage: 5.0, lastUpdated: '2026-03-16 15:00',
        realtimeDate: '2026-03-16', netWorthDate: '2026-03-15', valuationDate: '2026-03-16', sourceUrl: ''
      },
      '000003': {
        symbol: '000003', name: '南方稳健成长', currentPrice: 1.5, previousPrice: 1.4,
        changePercentage: 2.0, lastUpdated: '2026-03-17 15:00',
        realtimeDate: '2026-03-17', netWorthDate: '2026-03-16', valuationDate: '2026-03-17', sourceUrl: ''
      },
    };

    const result = sortPortfolio(mockPortfolio, marketData, 'desc');

    // A类（当日估值）：000003(涨2%), 000001(涨1%) -> 000003排在前面（降序）
    // B类（历史估值）：000002(涨5%)
    // 顺序：南方稳健成长, 华夏成长混合, 易方达消费行业
    expect(result[0].symbol).toBe('000003');
    expect(result[1].symbol).toBe('000001');
    expect(result[2].symbol).toBe('000002');
  });

  test('同类内部按涨跌幅降序排序', () => {
    const marketData: Record<string, ValuationData> = {
      '000001': {
        symbol: '000001', name: '华夏成长混合', currentPrice: 2.5, previousPrice: 2.4,
        changePercentage: 3.0, lastUpdated: '2026-03-17 15:00',
        realtimeDate: '2026-03-17', netWorthDate: '2026-03-16', valuationDate: '2026-03-17', sourceUrl: ''
      },
      '000002': {
        symbol: '000002', name: '易方达消费行业', currentPrice: 3.2, previousPrice: 3.1,
        changePercentage: 1.0, lastUpdated: '2026-03-17 15:00',
        realtimeDate: '2026-03-17', netWorthDate: '2026-03-16', valuationDate: '2026-03-17', sourceUrl: ''
      },
    };

    const result = sortPortfolio([mockPortfolio[0], mockPortfolio[1]], marketData, 'desc');

    // 降序：涨幅高的排在前面
    expect(result[0].symbol).toBe('000001'); // 涨幅3%
    expect(result[1].symbol).toBe('000002'); // 涨幅1%
  });

  test('同类内部按涨跌幅升序排序', () => {
    const marketData: Record<string, ValuationData> = {
      '000001': {
        symbol: '000001', name: '华夏成长混合', currentPrice: 2.5, previousPrice: 2.4,
        changePercentage: 3.0, lastUpdated: '2026-03-17 15:00',
        realtimeDate: '2026-03-17', netWorthDate: '2026-03-16', valuationDate: '2026-03-17', sourceUrl: ''
      },
      '000002': {
        symbol: '000002', name: '易方达消费行业', currentPrice: 3.2, previousPrice: 3.1,
        changePercentage: 1.0, lastUpdated: '2026-03-17 15:00',
        realtimeDate: '2026-03-17', netWorthDate: '2026-03-16', valuationDate: '2026-03-17', sourceUrl: ''
      },
    };

    const result = sortPortfolio([mockPortfolio[0], mockPortfolio[1]], marketData, 'asc');

    // 升序：涨幅低的排在前面
    expect(result[0].symbol).toBe('000002'); // 涨幅1%
    expect(result[1].symbol).toBe('000001'); // 涨幅3%
  });

  test('全部为历史估值时按涨跌幅排序', () => {
    const marketData: Record<string, ValuationData> = {
      '000001': {
        symbol: '000001', name: '华夏成长混合', currentPrice: 2.5, previousPrice: 2.4,
        changePercentage: 3.0, lastUpdated: '2026-03-16 15:00',
        realtimeDate: '2026-03-16', netWorthDate: '2026-03-15', valuationDate: '2026-03-16', sourceUrl: ''
      },
      '000002': {
        symbol: '000002', name: '易方达消费行业', currentPrice: 3.2, previousPrice: 3.1,
        changePercentage: 1.0, lastUpdated: '2026-03-16 15:00',
        realtimeDate: '2026-03-16', netWorthDate: '2026-03-15', valuationDate: '2026-03-16', sourceUrl: ''
      },
    };

    const result = sortPortfolio([mockPortfolio[0], mockPortfolio[1]], marketData, 'desc');

    // 都是B类，按涨幅降序
    expect(result[0].symbol).toBe('000001'); // 涨幅3%
    expect(result[1].symbol).toBe('000002'); // 涨幅1%
  });

  test('多个A类和多个B类混合排序', () => {
    const portfolio: Ticker[] = [
      { id: '1', symbol: '000001', name: 'A1-涨幅1%', market: MarketType.FUND },
      { id: '2', symbol: '000002', name: 'B1-涨幅5%', market: MarketType.FUND },
      { id: '3', symbol: '000003', name: 'A2-涨幅3%', market: MarketType.FUND },
      { id: '4', symbol: '000004', name: 'B2-涨幅2%', market: MarketType.FUND },
    ];

    const marketData: Record<string, ValuationData> = {
      '000001': {
        symbol: '000001', name: 'A1', currentPrice: 1, previousPrice: 1,
        changePercentage: 1.0, lastUpdated: '2026-03-17',
        realtimeDate: '2026-03-17', netWorthDate: '2026-03-16', valuationDate: '2026-03-17', sourceUrl: ''
      },
      '000002': {
        symbol: '000002', name: 'B1', currentPrice: 1, previousPrice: 1,
        changePercentage: 5.0, lastUpdated: '2026-03-16',
        realtimeDate: '2026-03-16', netWorthDate: '2026-03-15', valuationDate: '2026-03-16', sourceUrl: ''
      },
      '000003': {
        symbol: '000003', name: 'A2', currentPrice: 1, previousPrice: 1,
        changePercentage: 3.0, lastUpdated: '2026-03-17',
        realtimeDate: '2026-03-17', netWorthDate: '2026-03-16', valuationDate: '2026-03-17', sourceUrl: ''
      },
      '000004': {
        symbol: '000004', name: 'B2', currentPrice: 1, previousPrice: 1,
        changePercentage: 2.0, lastUpdated: '2026-03-16',
        realtimeDate: '2026-03-16', netWorthDate: '2026-03-15', valuationDate: '2026-03-16', sourceUrl: ''
      },
    };

    const result = sortPortfolio(portfolio, marketData, 'desc');

    // A类（当日估值）：000003(涨3%), 000001(涨1%) -> 降序后：000003, 000001
    // B类（历史估值）：000002(涨5%), 000004(涨2%) -> 降序后：000002, 000004
    // 最终顺序：A类在前，B类在后
    expect(result[0].symbol).toBe('000003'); // A类，涨幅3%
    expect(result[1].symbol).toBe('000001'); // A类，涨幅1%
    expect(result[2].symbol).toBe('000002'); // B类，涨幅5%
    expect(result[3].symbol).toBe('000004'); // B类，涨幅2%
  });
});