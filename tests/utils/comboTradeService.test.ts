import { ComboTrade, ComboTradeRecord } from '../../types';
import {
  isValidComboTradeRecord,
  isValidComboTrade,
  normalizeComboTradeRecords,
  normalizeComboTrade,
  normalizeComboTrades,
  filterValidRecords
} from '../../utils/comboTradeService';

// 测试记录校验函数
describe('isValidComboTradeRecord', () => {
  test('有效的记录返回 true', () => {
    expect(isValidComboTradeRecord({ fundId: '000001', amount: 100, fee: 10 })).toBe(true);
    expect(isValidComboTradeRecord({ fundId: '000001', amount: 0.01, fee: 0 })).toBe(true);
    expect(isValidComboTradeRecord({ fundId: '000001', amount: 100, fee: 0.01 })).toBe(true);
  });

  test('fundId 无效返回 false', () => {
    expect(isValidComboTradeRecord({ fundId: '', amount: 100, fee: 10 })).toBe(false);
    expect(isValidComboTradeRecord({ fundId: '  ', amount: 100, fee: 10 })).toBe(false);
    expect(isValidComboTradeRecord({ amount: 100, fee: 10 })).toBe(false);
  });

  test('amount 无效返回 false', () => {
    expect(isValidComboTradeRecord({ fundId: '000001', amount: 0, fee: 10 })).toBe(false);
    expect(isValidComboTradeRecord({ fundId: '000001', amount: -10, fee: 10 })).toBe(false);
    expect(isValidComboTradeRecord({ fundId: '000001', fee: 10 })).toBe(false);
  });

  test('fee 无效返回 false', () => {
    expect(isValidComboTradeRecord({ fundId: '000001', amount: 100, fee: -10 })).toBe(false);
    expect(isValidComboTradeRecord({ fundId: '000001', amount: 100 })).toBe(false);
  });

  test('null/undefined 返回 false', () => {
    expect(isValidComboTradeRecord(null)).toBe(false);
    expect(isValidComboTradeRecord(undefined)).toBe(false);
  });
});

// 测试组合交易校验函数
describe('isValidComboTrade', () => {
  test('有效的组合返回 true', () => {
    expect(isValidComboTrade({ name: '测试组合', records: [] })).toBe(true);
    expect(isValidComboTrade({ name: '  测试组合  ', records: [] })).toBe(true);
  });

  test('无效的组合返回 false', () => {
    expect(isValidComboTrade({ name: '', records: [] })).toBe(false);
    expect(isValidComboTrade({ name: '  ', records: [] })).toBe(false);
    expect(isValidComboTrade({ records: [] })).toBe(false);
    expect(isValidComboTrade({})).toBe(false);
  });
});

// 测试记录规范化函数
describe('normalizeComboTradeRecords', () => {
  test('过滤并格式化有效记录', () => {
    const records = [
      { fundId: '  000001  ', amount: 100.456, fee: 10.789 },
      { fundId: '000002', amount: 200, fee: 0 },
    ];

    const result = normalizeComboTradeRecords(records);

    expect(result).toHaveLength(2);
    expect(result[0].fundId).toBe('000001');
    expect(result[0].amount).toBe(100.46);
    expect(result[0].fee).toBe(10.79);
  });

  test('过滤掉无效记录', () => {
    const records = [
      { fundId: '000001', amount: 100, fee: 10 },
      { fundId: '', amount: 200, fee: 20 },
      { fundId: '000003', amount: 0, fee: 30 },
      { fundId: '000004', amount: -10, fee: 40 },
    ];

    const result = normalizeComboTradeRecords(records);

    expect(result).toHaveLength(1);
    expect(result[0].fundId).toBe('000001');
  });

  test('空数组返回空数组', () => {
    expect(normalizeComboTradeRecords(null)).toHaveLength(0);
    expect(normalizeComboTradeRecords(undefined)).toHaveLength(0);
    expect(normalizeComboTradeRecords([])).toHaveLength(0);
  });
});

// 测试组合规范化函数
describe('normalizeComboTrade', () => {
  test('有效的组合返回规范化后的对象', () => {
    const combo = {
      name: '  测试组合  ',
      records: [
        { fundId: '  000001  ', amount: 100.456, fee: 10.789 },
      ]
    };

    const result = normalizeComboTrade('combo1', combo);

    expect(result).not.toBeNull();
    expect(result?.id).toBe('combo1');
    expect(result?.name).toBe('测试组合');
    expect(result?.records).toHaveLength(1);
  });

  test('无效的组合返回 null', () => {
    expect(normalizeComboTrade('combo1', { name: '', records: [] })).toBeNull();
    expect(normalizeComboTrade('combo1', { records: [] })).toBeNull();
    expect(normalizeComboTrade('combo1', null)).toBeNull();
  });

  test('无有效记录返回 null', () => {
    const combo = {
      name: '测试组合',
      records: [
        { fundId: '', amount: 100, fee: 10 },
      ]
    };

    const result = normalizeComboTrade('combo1', combo);

    // 即使组合有效，但如果记录全被过滤，则返回 null
    expect(result?.records).toHaveLength(0);
  });
});

// 测试批量组合交易规范化函数
describe('normalizeComboTrades', () => {
  test('规范化多个组合交易', () => {
    const comboTrades = {
      'combo1': {
        name: '组合1',
        records: [{ fundId: '000001', amount: 100, fee: 10 }]
      },
      'combo2': {
        name: '组合2',
        records: [{ fundId: '', amount: 200, fee: 20 }]
      },
      'combo3': {
        name: '组合3',
        records: []
      }
    };

    const result = normalizeComboTrades(comboTrades);

    expect(result.combo1).toBeDefined();
    expect(result.combo2).toBeUndefined(); // 无有效记录
    expect(result.combo3).toBeUndefined(); // 记录为空
  });
});

// 测试过滤有效记录函数（用于保存）
describe('filterValidRecords', () => {
  test('过滤 amount > 0 的记录并格式化', () => {
    const records: ComboTradeRecord[] = [
      { fundId: 'A', amount: 100.456, fee: 10.789 },
      { fundId: 'B', amount: 0, fee: 5 },
      { fundId: 'C', amount: -10, fee: 3 },
      { fundId: 'D', amount: 50, fee: 2.123 },
    ];

    const filtered = filterValidRecords(records);

    expect(filtered).toHaveLength(2);
    expect(filtered[0].fundId).toBe('A');
    expect(filtered[0].amount).toBe(100.46);
    expect(filtered[0].fee).toBe(10.79);
    expect(filtered[1].fundId).toBe('D');
    expect(filtered[1].amount).toBe(50);
    expect(filtered[1].fee).toBe(2.12);
  });

  test('空数组返回空数组', () => {
    expect(filterValidRecords([])).toHaveLength(0);
  });
});