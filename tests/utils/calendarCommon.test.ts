import { findExtremeProfitIndexes } from '../../utils/calendarCommon';

describe('findExtremeProfitIndexes', () => {
  test('正常情况 - 有最赚和最亏', () => {
    const items = [
      { profit: 100 },
      { profit: -50 },
      { profit: 50 }
    ];
    const result = findExtremeProfitIndexes(items);
    expect(result).toEqual({ maxIndex: 0, minIndex: 1 });
  });

  test('所有值相同 - 只返回maxIndex', () => {
    const items = [
      { profit: 100 },
      { profit: 100 }
    ];
    const result = findExtremeProfitIndexes(items);
    expect(result).toEqual({ maxIndex: 0, minIndex: null });
  });

  test('多个相同最值 - 返回第一个索引', () => {
    const items = [
      { profit: 100 },
      { profit: 50 },
      { profit: 100 }
    ];
    const result = findExtremeProfitIndexes(items);
    expect(result).toEqual({ maxIndex: 0, minIndex: 1 });
  });

  test('isInRange过滤 - 只考虑有效范围内的项', () => {
    const items = [
      { profit: 100, isInRange: true },
      { profit: -50, isInRange: false }
    ];
    const result = findExtremeProfitIndexes(items);
    expect(result).toEqual({ maxIndex: 0, minIndex: null });
  });

  test('空数组 - 返回null', () => {
    const items: Array<{ profit: number; isInRange?: boolean }> = [];
    const result = findExtremeProfitIndexes(items);
    expect(result).toEqual({ maxIndex: null, minIndex: null });
  });

  test('混合有效和无效项 - 只统计有效项', () => {
    const items = [
      { profit: -100, isInRange: false },
      { profit: 50, isInRange: true },
      { profit: -30, isInRange: true },
      { profit: 100, isInRange: false }
    ];
    const result = findExtremeProfitIndexes(items);
    expect(result).toEqual({ maxIndex: 1, minIndex: 2 });
  });

  test('没有isInRange属性 - 视为有效', () => {
    const items = [
      { profit: 100 },
      { profit: -50 }
    ];
    const result = findExtremeProfitIndexes(items);
    expect(result).toEqual({ maxIndex: 0, minIndex: 1 });
  });

  test('所有有效项盈利相同 - 只返回maxIndex', () => {
    const items = [
      { profit: 50, isInRange: true },
      { profit: 50, isInRange: true },
      { profit: 100, isInRange: false }
    ];
    const result = findExtremeProfitIndexes(items);
    expect(result).toEqual({ maxIndex: 0, minIndex: null });
  });
});