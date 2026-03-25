import { prepareChartData } from '../../utils/chartDataHelper';
import { HistoricalPoint } from '../../types';

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