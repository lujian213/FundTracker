import { calculateYAxisRange, YAxisRangeResult } from '../../utils/chartYAxisHelper';

describe('calculateYAxisRange', () => {
  describe('基于百分比变化的动态Y轴', () => {
    test('小净值小波动：使用数据实际范围', () => {
      // 净值从1.00到1.05，变化5%
      // 数据范围0.05 > 最小百分比范围(1.00*0.05=0.05)
      const values = [1.00, 1.01, 1.02, 1.03, 1.04, 1.05];

      const result = calculateYAxisRange(values);

      // 数据实际范围应该被使用
      expect(result.min).toBeLessThan(1.00);
      expect(result.max).toBeGreaterThan(1.05);
      expect(result.range).toBeGreaterThan(0.05);
    });

    test('大净值小波动：使用最小百分比范围', () => {
      // 净值从10.00到10.10，变化1%
      // 数据范围0.10 < 最小百分比范围(10.00*0.05=0.50)
      // 应该使用最小百分比范围0.50
      const values = [10.00, 10.02, 10.05, 10.08, 10.10];

      const result = calculateYAxisRange(values);

      // 应该使用最小百分比范围（约0.50）
      expect(result.range).toBeGreaterThanOrEqual(0.50);
      expect(result.min).toBeLessThan(10.00);
      expect(result.max).toBeGreaterThan(10.10);
    });

    test('极端案例：净值100变化2%', () => {
      // 净值从100到102，变化2%
      // 数据范围2 < 最小百分比范围(100*0.05=5)
      // 应该使用最小百分比范围5
      const values = [100.00, 100.50, 101.00, 101.50, 102.00];

      const result = calculateYAxisRange(values);

      // 应该使用最小百分比范围（约5）
      expect(result.range).toBeGreaterThanOrEqual(5);
      expect(result.min).toBeLessThan(100);
      expect(result.max).toBeGreaterThan(102);
    });

    test('考虑成本价：成本价在数据范围外', () => {
      const values = [1.00, 1.02, 1.04, 1.06, 1.08];
      const costPrices = [0.95, 0.96, 0.97, 0.98, 0.99]; // 成本价低于数据最小值

      const result = calculateYAxisRange(values, costPrices);

      // Y轴应该包含成本价（考虑浮点数精度）
      expect(result.min).toBeLessThanOrEqual(0.95 + 0.001);
      expect(result.max).toBeGreaterThanOrEqual(1.08 - 0.001);
    });

    test('考虑成本价：成本价在数据范围内', () => {
      const values = [1.00, 1.02, 1.04, 1.06, 1.08];
      const costPrices = [1.03, 1.04, 1.05, null, null]; // 成本价在数据范围内

      const result = calculateYAxisRange(values, costPrices);

      // Y轴应该正常包含数据和成本价（考虑浮点数精度）
      expect(result.min).toBeLessThanOrEqual(1.00 + 0.001);
      expect(result.max).toBeGreaterThanOrEqual(1.08 - 0.001);
    });

    test('空数据：返回默认范围', () => {
      const result = calculateYAxisRange([]);

      expect(result.min).toBe(0);
      expect(result.max).toBe(1);
      expect(result.range).toBe(1);
    });

    test('单个数据点：使用最小百分比范围', () => {
      const values = [10.00];

      const result = calculateYAxisRange(values);

      // 单个点应该使用最小百分比范围
      expect(result.range).toBeGreaterThanOrEqual(0.50); // 10.00 * 0.05
    });

    test('大波动基金：使用数据实际范围', () => {
      // 净值从1.00到1.20，变化20%
      // 数据范围0.20 > 最小百分比范围(1.00*0.05=0.05)
      const values = [1.00, 1.05, 1.10, 1.15, 1.20];

      const result = calculateYAxisRange(values);

      // 应该使用数据实际范围（考虑浮点数精度）
      expect(result.range).toBeGreaterThanOrEqual(0.20 - 0.001);
      expect(result.min).toBeLessThanOrEqual(1.00 + 0.001);
      expect(result.max).toBeGreaterThanOrEqual(1.20 - 0.001);
    });

    test('验证Y轴范围包含所有数据点', () => {
      const values = [10.00, 10.05, 10.10, 10.15, 10.20];

      const result = calculateYAxisRange(values);

      // 所有数据点都应该在Y轴范围内
      values.forEach(v => {
        expect(v).toBeGreaterThanOrEqual(result.min);
        expect(v).toBeLessThanOrEqual(result.max);
      });
    });
  });

  describe('边界情况处理', () => {
    test('零值和负值处理', () => {
      const values = [0, 0.01, 0.02];

      const result = calculateYAxisRange(values);

      // 应该能处理零值
      expect(result.min).toBeDefined();
      expect(result.max).toBeDefined();
      expect(result.range).toBeGreaterThan(0);
    });

    test('所有值相同：使用最小百分比范围', () => {
      const values = [10.00, 10.00, 10.00, 10.00];

      const result = calculateYAxisRange(values);

      // 数据范围为0，应该使用最小百分比范围
      expect(result.range).toBeGreaterThanOrEqual(0.50); // 10.00 * 0.05
    });
  });
});