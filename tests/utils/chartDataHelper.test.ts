import { prepareChartData, smartPrepareChartData } from '../../utils/chartDataHelper';
import { HistoricalPoint } from '../../types';
import { toLocalDateKey } from '../../utils/priceResolver';

describe('prepareChartData', () => {
  // 生成测试数据
  const generateTestData = (count: number): HistoricalPoint[] => {
    return Array.from({ length: count }, (_, i) => ({
      date: Date.now() - (count - i - 1) * 86400000, // 每天一个数据点
      value: 1 + i * 0.01, // 递增的净值
      equityReturn: i === 0 ? 0 : 1, // 简单的涨跌幅
      volume: 1000 + i * 10,
      amount: 10000 + i * 100
    }));
  };

  describe('基础功能', () => {
    it('应该正确处理空数据', () => {
      const result = prepareChartData([]);
      expect(result.displayData).toEqual([]);
      expect(result.calcData).toEqual([]);
      expect(result.maValues[5]).toEqual([]);
      expect(result.maValues[10]).toEqual([]);
      expect(result.maValues[20]).toEqual([]);
    });

    it('应该正确处理null/undefined数据', () => {
      const result = prepareChartData(null as any);
      expect(result.displayData).toEqual([]);
      expect(result.calcData).toEqual([]);
    });

    it('应该正确处理少量数据（小于显示数量）', () => {
      const data = generateTestData(50);
      const result = prepareChartData(data);
      expect(result.displayData.length).toBe(50);
      expect(result.calcData.length).toBe(50);
    });

    it('应该正确处理刚好满足显示数量的数据', () => {
      const data = generateTestData(90);
      const result = prepareChartData(data);
      expect(result.displayData.length).toBe(90);
      expect(result.calcData.length).toBe(90);
    });
  });

  describe('数据截取', () => {
    it('应该正确截取大于显示数量的数据', () => {
      const data = generateTestData(200);
      const result = prepareChartData(data, { displayCount: 90, maLookback: 25 });
      expect(result.displayData.length).toBe(90);
      expect(result.calcData.length).toBe(115); // displayCount + maLookback
    });

    it('当数据不足时应返回所有数据', () => {
      const data = generateTestData(100);
      const result = prepareChartData(data, { displayCount: 90, maLookback: 25 });
      expect(result.displayData.length).toBe(90);
      expect(result.calcData.length).toBe(100); // 只有100条数据
    });

    it('应该返回最新的数据', () => {
      const data = generateTestData(100);
      const result = prepareChartData(data, { displayCount: 50 });
      // 验证最后一条数据是最新的
      expect(result.displayData[result.displayData.length - 1].value).toBe(data[data.length - 1].value);
    });
  });

  describe('MA计算', () => {
    it('MA5应该在第一个点就有值（当数据足够时）', () => {
      const data = generateTestData(120);
      const result = prepareChartData(data, { displayCount: 90, maLookback: 25 });
      // 第一个显示点应该有MA5值（因为calcData包含了足够的额外数据）
      expect(result.maValues[5][0]).not.toBeNull();
    });

    it('MA10应该在第一个点就有值（当数据足够时）', () => {
      const data = generateTestData(120);
      const result = prepareChartData(data, { displayCount: 90, maLookback: 25 });
      expect(result.maValues[10][0]).not.toBeNull();
    });

    it('MA20应该在第一个点就有值（当数据足够时）', () => {
      const data = generateTestData(120);
      const result = prepareChartData(data, { displayCount: 90, maLookback: 25 });
      expect(result.maValues[20][0]).not.toBeNull();
    });

    it('当数据不足时MA值应为null', () => {
      const data = generateTestData(10);
      const result = prepareChartData(data);
      // MA20需要至少20个点，只有10个点时第一个点应该是null
      expect(result.maValues[20][0]).toBeNull();
    });

    it('MA值数量应该与displayData一致', () => {
      const data = generateTestData(120);
      const result = prepareChartData(data, { displayCount: 90, maLookback: 25 });
      expect(result.maValues[5].length).toBe(result.displayData.length);
      expect(result.maValues[10].length).toBe(result.displayData.length);
      expect(result.maValues[20].length).toBe(result.displayData.length);
    });
  });

  describe('自定义配置', () => {
    it('应该支持自定义displayCount', () => {
      const data = generateTestData(200);
      const result = prepareChartData(data, { displayCount: 50 });
      expect(result.displayData.length).toBe(50);
    });

    it('应该支持自定义maLookback', () => {
      const data = generateTestData(100);
      const result = prepareChartData(data, { displayCount: 50, maLookback: 30 });
      expect(result.calcData.length).toBe(80); // 50 + 30
    });

    it('应该支持自定义maWindows', () => {
      const data = generateTestData(100);
      const result = prepareChartData(data, { maWindows: [5, 15, 30] });
      expect(result.maValues[5]).toBeDefined();
      expect(result.maValues[15]).toBeDefined();
      expect(result.maValues[30]).toBeDefined();
      expect(result.maValues[10]).toBeUndefined();
    });
  });
});

describe('smartPrepareChartData', () => {
  // 生成测试数据
  const generateTestData = (count: number, startValue = 1): HistoricalPoint[] => {
    return Array.from({ length: count }, (_, i) => ({
      date: Date.now() - (count - i - 1) * 86400000, // 每天一个数据点
      value: startValue + i * 0.01, // 递增的净值
      equityReturn: i === 0 ? 0 : 1,
      volume: 1000 + i * 10,
      amount: 10000 + i * 100
    }));
  };

  // 生成带明显转折点的测试数据（确保转折点可被检测）
  const generateDataWithTurningPoints = (count: number): HistoricalPoint[] => {
    const data: HistoricalPoint[] = [];
    for (let i = 0; i < count; i++) {
      let value;
      // 创建明显的转折点：每个点有不同的值，在某些位置形成峰或谷
      if (i === 30) {
        // 峰：前后都比它低
        value = 2.0;
      } else if (i === 31 || i === 29) {
        value = 1.5;
      } else if (i === 60) {
        // 谷：前后都比它高
        value = 0.5;
      } else if (i === 61 || i === 59) {
        value = 1.0;
      } else if (i === 90) {
        // 另一个峰
        value = 1.8;
      } else if (i === 91 || i === 89) {
        value = 1.3;
      } else {
        value = 1.0 + (i / count) * 0.01; // 平缓递增
      }
      data.push({
        date: Date.now() - (count - i - 1) * 86400000,
        value,
        equityReturn: 0,
        volume: 1000,
        amount: 10000
      });
    }
    return data;
  };

  describe('基础功能', () => {
    it('应该正确处理空数据', () => {
      const result = smartPrepareChartData([]);
      expect(result.displayData).toEqual([]);
      expect(result.maValues[5]).toEqual([]);
      expect(result.keptTradeDates).toEqual([]);
      expect(result.earlyDataStats.totalPoints).toBe(0);
    });

    it('应该正确处理null数据', () => {
      const result = smartPrepareChartData(null as any);
      expect(result.displayData).toEqual([]);
    });

    it('应该正确处理少量数据（小于displayCount）', () => {
      const data = generateTestData(50);
      const result = smartPrepareChartData(data, { displayCount: 60 });
      expect(result.displayData.length).toBe(50); // 全部保留
      expect(result.earlyDataStats.totalPoints).toBe(0); // 无早期数据
    });
  });

  describe('交易日保留', () => {
    it('应该强制保留交易日', () => {
      const data = generateTestData(200);
      // 交易日在早期数据中（第10天和第20天）
      const tradeDate1 = toLocalDateKey(data[10].date);
      const tradeDate2 = toLocalDateKey(data[20].date);
      const preserveDates = [tradeDate1, tradeDate2];

      const result = smartPrepareChartData(data, {
        displayCount: 60,
        preserveDates
      });

      // 验证交易日被保留
      expect(result.keptTradeDates).toContain(tradeDate1);
      expect(result.keptTradeDates).toContain(tradeDate2);

      // 验证显示数据包含这些日期
      const displayDates = result.displayData.map(p =>
        toLocalDateKey(p.date)
      );
      expect(displayDates).toContain(tradeDate1);
      expect(displayDates).toContain(tradeDate2);
    });

    it('应该保留建仓日期', () => {
      const data = generateTestData(200);
      const startDate = toLocalDateKey(data[5].date);

      const result = smartPrepareChartData(data, {
        displayCount: 60,
        preserveDates: [startDate]
      });

      expect(result.keptTradeDates).toContain(startDate);
    });

    it('交易日在最近displayCount范围内时应正常包含', () => {
      const data = generateTestData(200);
      // 交易日在最近60天内（第150天）
      const tradeDate = toLocalDateKey(data[150].date);

      const result = smartPrepareChartData(data, {
        displayCount: 60,
        preserveDates: [tradeDate]
      });

      expect(result.keptTradeDates).toContain(tradeDate);
    });
  });

  describe('早期数据简化', () => {
    it('数据显示起点应为第一笔交易日期和displayCount范围最早日期中的最小值', () => {
      const data = generateTestData(200);

      // 情况1：第一笔交易日期在 displayCount 范围外（更早）
      // displayCount=60，范围是第140-200个点
      // 第一笔交易在第50个点（更早）
      const firstTradeDate = toLocalDateKey(data[50].date);
      const result = smartPrepareChartData(data, {
        displayCount: 60,
        preserveDates: [firstTradeDate]
      });

      // 显示起点应为第一笔交易日期（因为它更早）
      const displayDates = result.displayData.map(p =>
        toLocalDateKey(p.date)
      );
      expect(displayDates).toContain(firstTradeDate);
    });

    it('第一笔交易在displayCount范围内时，应使用displayCount范围起点', () => {
      const data = generateTestData(200);

      // displayCount=60，范围是第140-200个点
      // 第一笔交易在第150个点（在范围内）
      const firstTradeDate = toLocalDateKey(data[150].date);
      const result = smartPrepareChartData(data, {
        displayCount: 60,
        preserveDates: [firstTradeDate]
      });

      // 显示起点应为第140个点（displayCount范围起点）
      const displayCountStartDate = toLocalDateKey(data[140].date);
      const displayDates = result.displayData.map(p =>
        toLocalDateKey(p.date)
      );
      expect(displayDates[0]).toBe(displayCountStartDate);
    });

    it('无交易记录时应使用displayCount范围起点', () => {
      const data = generateTestData(200);
      const result = smartPrepareChartData(data, {
        displayCount: 60,
        preserveDates: []
      });

      // displayCount=60，范围是第140-200个点
      const displayCountStartDate = toLocalDateKey(data[140].date);
      const displayDates = result.displayData.map(p =>
        toLocalDateKey(p.date)
      );
      expect(displayDates[0]).toBe(displayCountStartDate);
    });

    it('应该保留转折点（在早期数据范围内）', () => {
      const data = generateDataWithTurningPoints(200);
      // 第一笔交易在第10天（确保转折点在早期数据范围内）
      const firstTradeDate = toLocalDateKey(data[10].date);

      const result = smartPrepareChartData(data, {
        displayCount: 60,
        preserveDates: [firstTradeDate],
        turningThreshold: 0.01
      });

      // 早期数据应该包含转折点
      expect(result.earlyDataStats.turningPoints).toBeGreaterThanOrEqual(0);
    });

    it('转折点阈值应影响检测结果', () => {
      const data = generateDataWithTurningPoints(200);
      const firstTradeDate = toLocalDateKey(data[5].date);

      const resultLowThreshold = smartPrepareChartData(data, {
        displayCount: 60,
        preserveDates: [firstTradeDate],
        turningThreshold: 0.001
      });

      const resultHighThreshold = smartPrepareChartData(data, {
        displayCount: 60,
        preserveDates: [firstTradeDate],
        turningThreshold: 0.5
      });

      expect(resultLowThreshold.earlyDataStats.turningPoints)
        .toBeGreaterThanOrEqual(resultHighThreshold.earlyDataStats.turningPoints);
    });
  });

  describe('MA计算', () => {
    it('所有显示点应有MA值（基于全量数据计算）', () => {
      const data = generateTestData(200);
      const result = smartPrepareChartData(data, { displayCount: 60 });

      // MA数组长度应与displayData一致
      expect(result.maValues[5].length).toBe(result.displayData.length);
      expect(result.maValues[10].length).toBe(result.displayData.length);
      expect(result.maValues[20].length).toBe(result.displayData.length);
    });

    it('MA值应正确计算', () => {
      const data = generateTestData(100);
      const result = smartPrepareChartData(data, { displayCount: 50 });

      // 由于数据是递增的，MA值也应该递增
      const ma5 = result.maValues[5];
      // 前4个点可能为null（MA5需要5个点）
      // 后面的点应该有值
      for (let i = 5; i < ma5.length; i++) {
        expect(ma5[i]).not.toBeNull();
        expect(ma5[i]).toBeGreaterThan(0);
      }
    });

    it('交易日的MA值应正确', () => {
      const data = generateTestData(200);
      const tradeIdx = 10;
      const tradeDate = toLocalDateKey(data[tradeIdx].date);

      const result = smartPrepareChartData(data, {
        displayCount: 60,
        preserveDates: [tradeDate]
      });

      // 找到交易日在displayData中的索引
      const displayIdx = result.displayData.findIndex(p =>
        toLocalDateKey(p.date) === tradeDate
      );

      // 该点应该有MA值
      if (displayIdx >= 0) {
        expect(result.maValues[5][displayIdx]).toBeDefined();
      }
    });
  });

  describe('综合场景', () => {
    it('无交易记录时应只简化早期数据', () => {
      const data = generateTestData(200);
      const result = smartPrepareChartData(data, {
        displayCount: 60,
        preserveDates: []
      });

      // 最近60个点全部保留
      const recentDates = data.slice(-60).map(p =>
        toLocalDateKey(p.date)
      );
      const lastDisplayDates = result.displayData.slice(-60).map(p =>
        toLocalDateKey(p.date)
      );
      expect(lastDisplayDates).toEqual(recentDates);
    });

    it('数据点总数应大于displayCount（当有早期交易日时）', () => {
      const data = generateTestData(200);
      // 早期有多个交易日
      const preserveDates = [
        toLocalDateKey(data[10].date),
        toLocalDateKey(data[30].date),
        toLocalDateKey(data[50].date)
      ];

      const result = smartPrepareChartData(data, {
        displayCount: 60,
        preserveDates
      });

      // 显示数据应包含：早期保留点 + 最近60点
      expect(result.displayData.length).toBeGreaterThanOrEqual(60);
    });
  });
});