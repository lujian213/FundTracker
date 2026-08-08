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

      expect(result.method).toBe('profit' as DrawdownMethod);
      expect(result.currentDrawdown).toBeCloseTo(50, 2); // (1000-500)/1000*100 = 50%
      expect(result.currentPeakValue).toBe(1000);
      expect(result.currentValue).toBe(500);
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
  });
});