import { getLevelIconByThresholds, isValidNumber, formatKPIValue, getColorClassByRule } from '../../components/KPICardDisplay';

// 测试配置数据
const sharpeThresholds = [0, 1, 2, 3];
const sharpeLevels = [
  { icon: '🔴', title: '不佳' },
  { icon: '🟡', title: '一般' },
  { icon: '🟢', title: '良好' },
  { icon: '🟣', title: '优秀' },
  { icon: '🌟', title: '卓越' },
];

const volatilityThresholds = [15, 25, 35];
const volatilityLevels = [
  { icon: '🟢', title: '低风险' },
  { icon: '🟡', title: '中低风险' },
  { icon: '🟠', title: '中等风险' },
  { icon: '🔴', title: '较高风险' },
];

describe('KPICardDisplay helper functions', () => {
  describe('isValidNumber', () => {
    test('returns true for valid numbers', () => {
      expect(isValidNumber(0)).toBe(true);
      expect(isValidNumber(1.5)).toBe(true);
      expect(isValidNumber(-3.14)).toBe(true);
    });

    test('returns false for null and non-finite values', () => {
      expect(isValidNumber(null)).toBe(false);
      expect(isValidNumber(Infinity)).toBe(false);
      expect(isValidNumber(NaN)).toBe(false);
    });
  });

  describe('getLevelIconByThresholds', () => {
    describe('夏普比率 (gt 类型)', () => {
      test('负数夏普比率显示🔴（不佳）', () => {
        const result = getLevelIconByThresholds(-1.05, sharpeThresholds, sharpeLevels, 'gt');
        expect(result).not.toBeNull();
        // 验证返回的是🔴图标
        expect(result).toMatchObject({
          props: {
            title: '不佳',
            children: '🔴',
          },
        });
      });

      test('负数卡玛比率显示🔴（不佳）', () => {
        const result = getLevelIconByThresholds(-1.11, sharpeThresholds, sharpeLevels, 'gt');
        expect(result).not.toBeNull();
        expect(result).toMatchObject({
          props: {
            title: '不佳',
            children: '🔴',
          },
        });
      });

      test('夏普比率0.5显示🟡（一般）', () => {
        const result = getLevelIconByThresholds(0.5, sharpeThresholds, sharpeLevels, 'gt');
        expect(result).not.toBeNull();
        expect(result).toMatchObject({
          props: {
            title: '一般',
            children: '🟡',
          },
        });
      });

      test('夏普比率1.5显示🟢（良好）', () => {
        const result = getLevelIconByThresholds(1.5, sharpeThresholds, sharpeLevels, 'gt');
        expect(result).not.toBeNull();
        expect(result).toMatchObject({
          props: {
            title: '良好',
            children: '🟢',
          },
        });
      });

      test('夏普比率2.5显示🟣（优秀）', () => {
        const result = getLevelIconByThresholds(2.5, sharpeThresholds, sharpeLevels, 'gt');
        expect(result).not.toBeNull();
        expect(result).toMatchObject({
          props: {
            title: '优秀',
            children: '🟣',
          },
        });
      });

      test('夏普比率4显示🌟（卓越）', () => {
        const result = getLevelIconByThresholds(4, sharpeThresholds, sharpeLevels, 'gt');
        expect(result).not.toBeNull();
        expect(result).toMatchObject({
          props: {
            title: '卓越',
            children: '🌟',
          },
        });
      });

      test('夏普比率0显示🟡（一般，刚好在阈值边界）', () => {
        const result = getLevelIconByThresholds(0, sharpeThresholds, sharpeLevels, 'gt');
        expect(result).not.toBeNull();
        expect(result).toMatchObject({
          props: {
            title: '一般',
            children: '🟡',
          },
        });
      });
    });

    describe('波动率 (lt 类型)', () => {
      test('波动率10显示🟢（低风险）', () => {
        const result = getLevelIconByThresholds(10, volatilityThresholds, volatilityLevels, 'lt');
        expect(result).not.toBeNull();
        expect(result).toMatchObject({
          props: {
            title: '低风险',
            children: '🟢',
          },
        });
      });

      test('波动率20显示🟡（中低风险）', () => {
        const result = getLevelIconByThresholds(20, volatilityThresholds, volatilityLevels, 'lt');
        expect(result).not.toBeNull();
        expect(result).toMatchObject({
          props: {
            title: '中低风险',
            children: '🟡',
          },
        });
      });

      test('波动率30显示🟠（中等风险）', () => {
        const result = getLevelIconByThresholds(30, volatilityThresholds, volatilityLevels, 'lt');
        expect(result).not.toBeNull();
        expect(result).toMatchObject({
          props: {
            title: '中等风险',
            children: '🟠',
          },
        });
      });

      test('波动率40显示🔴（较高风险）', () => {
        const result = getLevelIconByThresholds(40, volatilityThresholds, volatilityLevels, 'lt');
        expect(result).not.toBeNull();
        expect(result).toMatchObject({
          props: {
            title: '较高风险',
            children: '🔴',
          },
        });
      });
    });

    test('null值返回null', () => {
      expect(getLevelIconByThresholds(null, sharpeThresholds, sharpeLevels, 'gt')).toBeNull();
    });
  });

  describe('getColorClassByRule', () => {
    test('profit规则：正数红色，负数绿色', () => {
      expect(getColorClassByRule(10, 'profit')).toBe('text-red-600');
      expect(getColorClassByRule(-10, 'profit')).toBe('text-green-600');
      expect(getColorClassByRule(0, 'profit')).toBe('text-gray-700');
    });

    test('risk规则：正值绿色（表示有风险）', () => {
      expect(getColorClassByRule(10, 'risk')).toBe('text-green-600');
      expect(getColorClassByRule(0, 'risk')).toBe('text-gray-800');
    });

    test('neutral规则：灰色', () => {
      expect(getColorClassByRule(10, 'neutral')).toBe('text-gray-800');
      expect(getColorClassByRule(-10, 'neutral')).toBe('text-gray-800');
    });

    test('null值返回灰色', () => {
      expect(getColorClassByRule(null, 'profit')).toBe('text-gray-500');
    });
  });
});