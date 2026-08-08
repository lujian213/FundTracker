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

      // 验证使用profit方法（金额策略）
      expect(result.method).toBe('profit' as DrawdownMethod);

      // 验证当前回撤（金额）
      expect(result.currentDrawdown).toBe(500); // 1000-500 = 500元
      expect(result.currentPeakValue).toBe(1000);
      expect(result.currentValue).toBe(500);
      expect(result.currentTroughValue).toBe(500); // 当前值即为低点值
      expect(result.currentTroughDate).toBe('2026-01-03');
      expect(result.currentDrawdownDays).toBe(1); // 01-02 到 01-03 = 1天

      // 验证最大回撤（金额，与当前回撤相同）
      expect(result.maxDrawdown).toBe(500);
      expect(result.maxPeakValue).toBe(1000);
      expect(result.maxTroughValue).toBe(500);
      expect(result.maxDrawdownDays).toBe(1);
    });

    it('should use profit method even when peak profit <= 0 (amount strategy always works)', () => {
      const cumulativeProfits = [
        { date: '2026-01-01', profit: 0 },
        { date: '2026-01-02', profit: -500 },
      ];
      const navCurve = [
        { date: '2026-01-01', nav: 1.0 },
        { date: '2026-01-02', nav: 0.95 },
      ];

      const result = calculateDrawdownWithFallback(cumulativeProfits, navCurve);

      // 新逻辑：金额策略总是有效，即使峰值≤0
      expect(result.method).toBe('profit' as DrawdownMethod);
      expect(result.currentDrawdown).toBe(500); // 0 - (-500) = 500元
    });

    it('should use profit method even when peak profit < 0 (amount strategy always works)', () => {
      const cumulativeProfits = [
        { date: '2026-01-01', profit: -100 },
        { date: '2026-01-02', profit: -600 },
      ];
      const navCurve = [
        { date: '2026-01-01', nav: 1.0 },
        { date: '2026-01-02', nav: 0.94 },
      ];

      const result = calculateDrawdownWithFallback(cumulativeProfits, navCurve);

      // 新逻辑：金额策略总是有效
      expect(result.method).toBe('profit' as DrawdownMethod);
      expect(result.currentDrawdown).toBe(500); // -100 - (-600) = 500元
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

    it('should find correct trough when profit recovering from bottom', () => {
      // 测试谷底回升的场景：
      // 峰值：1000 → 谷底：400 → 当前：800（回升中）
      const cumulativeProfits = [
        { date: '2026-01-01', profit: 1000 },  // 峰值
        { date: '2026-01-02', profit: 700 },
        { date: '2026-01-03', profit: 400 },    // 历史最低点（真正的谷底）
        { date: '2026-01-04', profit: 600 },   // 开始回升
        { date: '2026-01-05', profit: 800 },   // 当前（继续回升）
      ];
      const navCurve = [
        { date: '2026-01-01', nav: 1.1 },
        { date: '2026-01-02', nav: 1.07 },
        { date: '2026-01-03', nav: 1.04 },
        { date: '2026-01-04', nav: 1.06 },
        { date: '2026-01-05', nav: 1.08 },
      ];

      const result = calculateDrawdownWithFallback(cumulativeProfits, navCurve);

      expect(result.method).toBe('profit' as DrawdownMethod);

      // 当前回撤（金额）：1000-800 = 200元
      expect(result.currentDrawdown).toBe(200);
      expect(result.currentPeakValue).toBe(1000);
      expect(result.currentValue).toBe(800);

      // 关键：谷底应该是历史最低点400，而不是当前值800
      expect(result.currentTroughValue).toBe(400);
      expect(result.currentTroughDate).toBe('2026-01-03');

      // 最大回撤（金额）：1000-400 = 600元
      expect(result.maxDrawdown).toBe(600);
      expect(result.maxTroughValue).toBe(400);
      expect(result.maxTroughDate).toBe('2026-01-03');

      // 回撤持续天数：从峰值(01-01)到当前(01-05) = 4天
      expect(result.currentDrawdownDays).toBe(4);
    });
  });
});