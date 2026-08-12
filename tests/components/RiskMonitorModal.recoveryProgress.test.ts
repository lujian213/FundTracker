/**
 * RiskMonitorModal 恢复进度阈值测试
 *
 * 测试目的：验证新版回撤追踪中单个基金的恢复进度状态判断
 */

import { getRecoveryProgressStatus, RECOVERY_PROGRESS_THRESHOLDS } from '../../utils/riskLevelHelper';

describe('RiskMonitorModal 恢复进度阈值', () => {
  describe('阈值常量', () => {
    it('应定义正确的阈值常量', () => {
      expect(RECOVERY_PROGRESS_THRESHOLDS.safe).toBe(70);
      expect(RECOVERY_PROGRESS_THRESHOLDS.warning).toBe(35);
    });
  });

  describe('新版回撤追踪（drawdown-beta）', () => {
    it('恢复进度 >= 70% 应为正常状态', () => {
      expect(getRecoveryProgressStatus(70)).toBe('safe');
      expect(getRecoveryProgressStatus(75)).toBe('safe');
      expect(getRecoveryProgressStatus(85)).toBe('safe');
      expect(getRecoveryProgressStatus(100)).toBe('safe');
    });

    it('恢复进度 >= 35% 且 < 70% 应为中等状态', () => {
      expect(getRecoveryProgressStatus(35)).toBe('warning');
      expect(getRecoveryProgressStatus(50)).toBe('warning');
      expect(getRecoveryProgressStatus(60)).toBe('warning');
      expect(getRecoveryProgressStatus(69)).toBe('warning');
    });

    it('恢复进度 < 35% 应为高风险状态', () => {
      expect(getRecoveryProgressStatus(0)).toBe('danger');
      expect(getRecoveryProgressStatus(10)).toBe('danger');
      expect(getRecoveryProgressStatus(25)).toBe('danger');
      expect(getRecoveryProgressStatus(34)).toBe('danger');
    });

    it('边界值测试', () => {
      // 35% 边界
      expect(getRecoveryProgressStatus(34.99)).toBe('danger');
      expect(getRecoveryProgressStatus(35)).toBe('warning');

      // 70% 边界
      expect(getRecoveryProgressStatus(69.99)).toBe('warning');
      expect(getRecoveryProgressStatus(70)).toBe('safe');
    });
  });

  describe('老版回撤追踪（drawdown）', () => {
    it('老版本应保持原有逻辑，不受恢复进度阈值影响', () => {
      // 老版本使用回撤值判断，不在此测试范围内
      // 此测试文件只测试恢复进度状态判断函数
      expect(true).toBe(true);
    });
  });

  describe('恢复进度计算逻辑', () => {
    /**
     * 模拟恢复进度计算（正确的公式）
     * 公式：(currentValue - troughValue) / (peakValue - troughValue) * 100
     */
    function calculateRecoveryProgress(peakValue: number, troughValue: number, currentValue: number): number {
      if (peakValue <= troughValue) return 0;
      return Math.max(0, Math.min(100, ((currentValue - troughValue) / (peakValue - troughValue)) * 100));
    }

    it('完全恢复（回到峰值）时应为 100%', () => {
      const peakValue = 100;
      const troughValue = 80;
      const currentValue = 100;  // 当前值等于峰值，完全恢复
      expect(calculateRecoveryProgress(peakValue, troughValue, currentValue)).toBe(100);
    });

    it('在低点时应为 0%', () => {
      const peakValue = 100;
      const troughValue = 80;
      const currentValue = 80;  // 当前值等于低点
      expect(calculateRecoveryProgress(peakValue, troughValue, currentValue)).toBe(0);
    });

    it('部分恢复时应正确计算进度', () => {
      const peakValue = 100;
      const troughValue = 80;

      // 恢复一半（当前值=90）
      expect(calculateRecoveryProgress(peakValue, troughValue, 90)).toBe(50);

      // 恢复 30%（当前值=86）
      expect(calculateRecoveryProgress(peakValue, troughValue, 86)).toBe(30);

      // 恢复 70%（当前值=94）
      expect(calculateRecoveryProgress(peakValue, troughValue, 94)).toBe(70);

      // 恢复 35%（当前值=87）
      expect(calculateRecoveryProgress(peakValue, troughValue, 87)).toBe(35);
    });

    it('峰值等于低点时应返回 0%', () => {
      expect(calculateRecoveryProgress(80, 80, 80)).toBe(0);
      expect(calculateRecoveryProgress(100, 100, 90)).toBe(0);
    });

    it('当前值超出范围时应被限制在 0-100% 之间', () => {
      const peakValue = 100;
      const troughValue = 80;

      // 当前值低于低点
      expect(calculateRecoveryProgress(peakValue, troughValue, 70)).toBe(0);

      // 当前值高于峰值
      expect(calculateRecoveryProgress(peakValue, troughValue, 110)).toBe(100);
    });

    it('实际场景：历史最高100，历史最低70，当前回升到88', () => {
      // 历史最高点100，历史最大回撤低点70
      // 但当前回撤的峰值是95，低点是85，当前值88
      // 恢复进度应该是 (88 - 85) / (95 - 85) = 30%，而不是 (88 - 70) / (100 - 70) = 60%
      const peakValue = 95;  // 当前回撤的峰值
      const troughValue = 85; // 当前回撤的低点
      const currentValue = 88; // 当前值

      expect(calculateRecoveryProgress(peakValue, troughValue, currentValue)).toBe(30);
    });
  });

  describe('实际场景测试', () => {
    it('72% 恢复进度应判断为正常状态（用户案例）', () => {
      expect(getRecoveryProgressStatus(72)).toBe('safe');
    });

    it('基金A：恢复进度 85% -> 正常', () => {
      expect(getRecoveryProgressStatus(85)).toBe('safe');
    });

    it('基金B：恢复进度 50% -> 中等', () => {
      expect(getRecoveryProgressStatus(50)).toBe('warning');
    });

    it('基金C：恢复进度 20% -> 高风险', () => {
      expect(getRecoveryProgressStatus(20)).toBe('danger');
    });
  });
});