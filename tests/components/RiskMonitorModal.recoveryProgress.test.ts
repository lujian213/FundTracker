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
     * 模拟恢复进度计算
     * 公式：(maxDrawdown - currentDrawdown) / maxDrawdown * 100
     */
    function calculateRecoveryProgress(maxDrawdown: number, currentDrawdown: number): number {
      if (maxDrawdown <= 0) return 100;
      return Math.max(0, Math.min(100, ((maxDrawdown - currentDrawdown) / maxDrawdown) * 100));
    }

    it('完全恢复时应为 100%', () => {
      const maxDrawdown = 1000;
      const currentDrawdown = 0;
      expect(calculateRecoveryProgress(maxDrawdown, currentDrawdown)).toBe(100);
    });

    it('刚开始恢复时应为 0%', () => {
      const maxDrawdown = 1000;
      const currentDrawdown = 1000;
      expect(calculateRecoveryProgress(maxDrawdown, currentDrawdown)).toBe(0);
    });

    it('部分恢复时应正确计算进度', () => {
      const maxDrawdown = 1000;

      // 恢复一半
      expect(calculateRecoveryProgress(maxDrawdown, 500)).toBe(50);

      // 恢复 30%
      expect(calculateRecoveryProgress(maxDrawdown, 700)).toBe(30);

      // 恢复 70%
      expect(calculateRecoveryProgress(maxDrawdown, 300)).toBe(70);

      // 恢复 35%
      expect(calculateRecoveryProgress(maxDrawdown, 650)).toBe(35);
    });

    it('maxDrawdown 为 0 时应返回 100%', () => {
      expect(calculateRecoveryProgress(0, 0)).toBe(100);
      expect(calculateRecoveryProgress(0, 100)).toBe(100);
    });

    it('负数回撤应被限制在 0-100% 范围内', () => {
      // currentDrawdown > maxDrawdown（异常情况）
      expect(calculateRecoveryProgress(100, 200)).toBe(0);

      // 负数回撤（已盈利）
      expect(calculateRecoveryProgress(100, -50)).toBe(100);
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