/**
 * 盈利占比回撤计算单元测试
 */

import {
  calculateProfitRatioDrawdown,
  ProfitRatioDrawdownResult,
} from '../../utils/performanceAttribution';

describe('calculateProfitRatioDrawdown', () => {
  describe('正常情况', () => {
    it('应该正确计算盈利占比时间线', () => {
      const profits = [
        { date: '2026-01-01', value: 1000 },
        { date: '2026-01-02', value: 1500 },
        { date: '2026-01-03', value: 1200 },
      ];
      const positions = [
        { date: '2026-01-01', value: 10000 },
        { date: '2026-01-02', value: 12000 },
        { date: '2026-01-03', value: 11000 },
      ];

      const result = calculateProfitRatioDrawdown(profits, positions);

      // 峰值盈利占比: 1500/12000 = 0.125
      expect(result.peakRatio).toBeCloseTo(0.125, 4);
      expect(result.peakDate).toBe('2026-01-02');

      // 当前盈利占比: 1200/11000 = 0.1091
      expect(result.currentRatio).toBeCloseTo(0.1091, 4);

      // 回撤: (0.125 - 0.1091) * 100 = 1.59%
      expect(result.currentDrawdown).toBeCloseTo(1.59, 2);
    });

    it('应该正确识别峰值日期', () => {
      const profits = [
        { date: '2026-01-01', value: 1000 },
        { date: '2026-01-02', value: 2000 },  // 峰值
        { date: '2026-01-03', value: 1500 },
      ];
      const positions = [
        { date: '2026-01-01', value: 10000 },
        { date: '2026-01-02', value: 10000 },
        { date: '2026-01-03', value: 10000 },
      ];

      const result = calculateProfitRatioDrawdown(profits, positions);

      expect(result.peakDate).toBe('2026-01-02');
      expect(result.peakRatio).toBeCloseTo(0.2, 4);
    });

    it('应该正确计算回撤深度', () => {
      const profits = [
        { date: '2026-01-01', value: 1000 },
        { date: '2026-01-02', value: 2000 },  // 峰值
        { date: '2026-01-03', value: 1000 },  // 回撤
      ];
      const positions = [
        { date: '2026-01-01', value: 10000 },
        { date: '2026-01-02', value: 10000 },
        { date: '2026-01-03', value: 10000 },
      ];

      const result = calculateProfitRatioDrawdown(profits, positions);

      // 峰值占比: 2000/10000 = 0.2
      // 当前占比: 1000/10000 = 0.1
      // 回撤: (0.2 - 0.1) * 100 = 10%
      expect(result.currentDrawdown).toBeCloseTo(10, 2);
    });
  });

  describe('边界情况：持仓为0', () => {
    it('持仓为0时，盈利占比应为0', () => {
      const profits = [
        { date: '2026-01-01', value: 1000 },
        { date: '2026-01-02', value: 0 },  // 清仓
        { date: '2026-01-03', value: 500 }, // 重新建仓
      ];
      const positions = [
        { date: '2026-01-01', value: 10000 },
        { date: '2026-01-02', value: 0 },  // 持仓为0
        { date: '2026-01-03', value: 5000 },
      ];

      const result = calculateProfitRatioDrawdown(profits, positions);

      // 持仓为0时，盈利占比为0
      expect(result.currentRatio).toBe(500 / 5000);
      expect(result.currentDrawdown).toBeGreaterThanOrEqual(0);
    });

    it('第一天持仓为0时，应正确处理', () => {
      const profits = [
        { date: '2026-01-01', value: 0 },
        { date: '2026-01-02', value: 500 },
        { date: '2026-01-03', value: 800 },
      ];
      const positions = [
        { date: '2026-01-01', value: 0 },
        { date: '2026-01-02', value: 5000 },
        { date: '2026-01-03', value: 6000 },
      ];

      const result = calculateProfitRatioDrawdown(profits, positions);

      expect(result).toBeDefined();
      expect(result.currentRatio).toBe(800 / 6000);
    });
  });

  describe('边界情况：盈利为负', () => {
    it('盈利为负时，应正确计算', () => {
      const profits = [
        { date: '2026-01-01', value: -500 },
        { date: '2026-01-02', value: -200 },
        { date: '2026-01-03', value: -800 },
      ];
      const positions = [
        { date: '2026-01-01', value: 10000 },
        { date: '2026-01-02', value: 10000 },
        { date: '2026-01-03', value: 10000 },
      ];

      const result = calculateProfitRatioDrawdown(profits, positions);

      // 峰值应该是最大的盈利占比（-200/10000 = -0.02）
      expect(result.peakRatio).toBeCloseTo(-0.02, 4);
      expect(result.peakDate).toBe('2026-01-02');

      // 当前盈利占比: -800/10000 = -0.08
      expect(result.currentRatio).toBeCloseTo(-0.08, 4);

      // 回撤: (-0.02 - (-0.08)) * 100 = 6%
      expect(result.currentDrawdown).toBeCloseTo(6, 2);
    });
  });

  describe('数据对齐', () => {
    it('应该只使用共同日期的数据', () => {
      const profits = [
        { date: '2026-01-01', value: 1000 },
        { date: '2026-01-02', value: 1200 },
        { date: '2026-01-03', value: 1000 },
      ];
      const positions = [
        { date: '2026-01-02', value: 11000 },
        { date: '2026-01-03', value: 10500 },
        { date: '2026-01-04', value: 10000 },
      ];

      const result = calculateProfitRatioDrawdown(profits, positions);

      // 只保留共同日期: 2026-01-02, 2026-01-03
      expect(result).toBeDefined();
      expect(result.peakDate).toBe('2026-01-02');
    });

    it('没有共同日期时，应返回空结果', () => {
      const profits = [
        { date: '2026-01-01', value: 1000 },
        { date: '2026-01-02', value: 1200 },
      ];
      const positions = [
        { date: '2026-01-03', value: 11000 },
        { date: '2026-01-04', value: 10000 },
      ];

      const result = calculateProfitRatioDrawdown(profits, positions);

      expect(result.currentDrawdown).toBe(0);
      expect(result.peakRatio).toBe(0);
      expect(result.peakDate).toBeNull();
    });

    it('空数组时，应返回空结果', () => {
      const result1 = calculateProfitRatioDrawdown([], []);
      expect(result1.currentDrawdown).toBe(0);

      const result2 = calculateProfitRatioDrawdown([{ date: '2026-01-01', value: 1000 }], []);
      expect(result2.currentDrawdown).toBe(0);
    });
  });

  describe('历史最大回撤', () => {
    it('应该正确计算历史最大回撤', () => {
      const profits = [
        { date: '2026-01-01', value: 1000 },
        { date: '2026-01-02', value: 2000 },  // 第一个峰值
        { date: '2026-01-03', value: 1500 },  // 第一个回撤
        { date: '2026-01-04', value: 3000 },  // 新峰值
        { date: '2026-01-05', value: 1000 },  // 更大回撤
      ];
      const positions = [
        { date: '2026-01-01', value: 10000 },
        { date: '2026-01-02', value: 10000 },
        { date: '2026-01-03', value: 10000 },
        { date: '2026-01-04', value: 10000 },
        { date: '2026-01-05', value: 10000 },
      ];

      const result = calculateProfitRatioDrawdown(profits, positions);

      // 历史最大回撤应该是从 3000 到 1000
      // (0.3 - 0.1) * 100 = 20%
      expect(result.maxDrawdown).toBeCloseTo(20, 2);
    });
  });
});