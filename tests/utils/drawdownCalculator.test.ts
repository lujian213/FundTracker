import { calculateDrawdownWithFallback } from '../../utils/drawdownCalculator';
import { DrawdownMethod } from '../../types';

describe('drawdownCalculator', () => {
  describe('calculateDrawdownWithFallback', () => {
    it('should use profit-based method when peak profit > 0', () => {
      const cumulativeProfits = [
        { date: '2026-01-01', profit: 0 },
        { date: '2026-01-02', profit: 1000 },  // 峰值
        { date: '2026-01-03', profit: 500 },   // 当前
      ];
      const navCurve = [
        { date: '2026-01-01', nav: 1.0 },
        { date: '2026-01-02', nav: 1.1 },
        { date: '2026-01-03', nav: 1.05 },
      ];

      const result = calculateDrawdownWithFallback(cumulativeProfits, navCurve);

      // 验证使用profit方法
      expect(result.method).toBe('profit' as DrawdownMethod);

      // 验证当前回撤
      expect(result.currentDrawdown).toBeCloseTo(50, 2); // (1000-500)/1000*100 = 50%
      expect(result.currentPeakValue).toBe(1000);
      expect(result.currentValue).toBe(500);
      expect(result.currentTroughValue).toBe(500); // 当前值即为低点值
      expect(result.currentTroughDate).toBe('2026-01-03');
      expect(result.currentDrawdownDays).toBe(1); // 01-02 到 01-03 = 1天

      // 验证最大回撤（与当前回撤相同）
      expect(result.maxDrawdown).toBeCloseTo(50, 2);
      expect(result.maxPeakValue).toBe(1000);
      expect(result.maxTroughValue).toBe(500);
      expect(result.maxDrawdownDays).toBe(1);
    });

    it('should fallback to nav method when peak profit = 0', () => {
      const cumulativeProfits = [
        { date: '2026-01-01', profit: 0 },
        { date: '2026-01-02', profit: -500 },
      ];
      const navCurve = [
        { date: '2026-01-01', nav: 1.0 },
        { date: '2026-01-02', nav: 0.95 },
      ];

      const result = calculateDrawdownWithFallback(cumulativeProfits, navCurve);

      expect(result.method).toBe('nav' as DrawdownMethod);
    });

    it('should fallback to nav method when peak profit < 0', () => {
      const cumulativeProfits = [
        { date: '2026-01-01', profit: -100 },
        { date: '2026-01-02', profit: -600 },
      ];
      const navCurve = [
        { date: '2026-01-01', nav: 1.0 },
        { date: '2026-01-02', nav: 0.94 },
      ];

      const result = calculateDrawdownWithFallback(cumulativeProfits, navCurve);

      expect(result.method).toBe('nav' as DrawdownMethod);
    });

    it('should fallback to nav method when cumulative profits is empty', () => {
      const cumulativeProfits: { date: string; profit: number }[] = [];
      const navCurve = [
        { date: '2026-01-01', nav: 1.0 },
      ];

      const result = calculateDrawdownWithFallback(cumulativeProfits, navCurve);

      expect(result.method).toBe('nav' as DrawdownMethod);
    });

    it('should return empty result when nav curve is empty', () => {
      const cumulativeProfits = [
        { date: '2026-01-01', profit: 1000 },
      ];
      const navCurve: { date: string; nav: number }[] = [];

      const result = calculateDrawdownWithFallback(cumulativeProfits, navCurve);

      expect(result.currentDrawdown).toBe(0);
    });

    it('should have null trough when no drawdown in profit method', () => {
      const cumulativeProfits = [
        { date: '2026-01-01', profit: 1000 },  // 峰值
        { date: '2026-01-02', profit: 1200 },  // 新峰值
      ];
      const navCurve = [
        { date: '2026-01-01', nav: 1.0 },
        { date: '2026-01-02', nav: 1.2 },
      ];

      const result = calculateDrawdownWithFallback(cumulativeProfits, navCurve);

      expect(result.method).toBe('profit' as DrawdownMethod);
      expect(result.currentDrawdown).toBe(0); // 无回撤
      expect(result.currentTroughDate).toBeNull(); // 无低点
      expect(result.currentTroughValue).toBe(0);
      expect(result.maxDrawdown).toBe(0); // 历史也无回撤
    });
  });
});