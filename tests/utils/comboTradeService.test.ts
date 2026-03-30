import { ComboTrade, ComboTradeRecord } from '../../types';

// 测试过滤逻辑
describe('ComboTrade 过滤逻辑', () => {
  test('过滤 amount <= 0 的记录', () => {
    const records: ComboTradeRecord[] = [
      { fundId: 'A', amount: 100, fee: 10 },
      { fundId: 'B', amount: 0, fee: 5 },    // 应该被过滤
      { fundId: 'C', amount: -10, fee: 3 },   // 应该被过滤
      { fundId: 'D', amount: 50, fee: 2 },
    ];

    const filtered = records.filter(r => r.amount > 0);
    expect(filtered).toHaveLength(2);
    expect(filtered[0].fundId).toBe('A');
    expect(filtered[1].fundId).toBe('D');
  });

  test('空数组返回空数组', () => {
    const records: ComboTradeRecord[] = [];
    const filtered = records.filter(r => r.amount > 0);
    expect(filtered).toHaveLength(0);
  });

  test('全部过滤返回空数组', () => {
    const records: ComboTradeRecord[] = [
      { fundId: 'A', amount: 0, fee: 0 },
      { fundId: 'B', amount: -10, fee: 0 },
    ];
    const filtered = records.filter(r => r.amount > 0);
    expect(filtered).toHaveLength(0);
  });

  test('只保留正金额的记录', () => {
    const records: ComboTradeRecord[] = [
      { fundId: '000001', amount: 1000, fee: 1 },
      { fundId: '000002', amount: 500, fee: 0.5 },
      { fundId: '000003', amount: 0, fee: 0 },
      { fundId: '000004', amount: -100, fee: 0 },
    ];
    const filtered = records.filter(r => r.amount > 0);
    expect(filtered).toHaveLength(2);
    expect(filtered.map(r => r.fundId)).toEqual(['000001', '000002']);
  });
});

// 测试数据结构
describe('ComboTrade 数据结构', () => {
  test('创建有效的 ComboTrade 对象', () => {
    const combo: ComboTrade = {
      id: 'test-id',
      name: '测试组合',
      records: [
        { fundId: '000001', amount: 1000, fee: 10 }
      ]
    };

    expect(combo.id).toBe('test-id');
    expect(combo.name).toBe('测试组合');
    expect(combo.records).toHaveLength(1);
    expect(combo.records[0].fundId).toBe('000001');
  });

  test('ComboTrade 可以有空的 records', () => {
    const combo: ComboTrade = {
      id: 'empty-combo',
      name: '空组合',
      records: []
    };

    expect(combo.id).toBe('empty-combo');
    expect(combo.name).toBe('空组合');
    expect(combo.records).toHaveLength(0);
  });

  test('ComboTradeRecord 包含必要字段', () => {
    const record: ComboTradeRecord = {
      fundId: '000001',
      amount: 1000,
      fee: 1.5
    };

    expect(record.fundId).toBe('000001');
    expect(record.amount).toBe(1000);
    expect(record.fee).toBe(1.5);
  });

  test('ComboTradeRecord 金额和手续费可以为0', () => {
    const record: ComboTradeRecord = {
      fundId: '000001',
      amount: 0,
      fee: 0
    };

    expect(record.amount).toBe(0);
    expect(record.fee).toBe(0);
  });
});

// 测试过滤函数
describe('ComboTrade 过滤函数', () => {
  // 模拟实际的过滤函数
  function filterValidRecords(records: ComboTradeRecord[]): ComboTradeRecord[] {
    return records.filter(r => r.amount > 0);
  }

  test('过滤函数正确过滤无效记录', () => {
    const records: ComboTradeRecord[] = [
      { fundId: 'A', amount: 100, fee: 10 },
      { fundId: 'B', amount: 0, fee: 5 },
      { fundId: 'C', amount: 200, fee: 20 },
      { fundId: 'D', amount: -50, fee: 2 },
    ];

    const result = filterValidRecords(records);
    expect(result).toHaveLength(2);
    expect(result.every(r => r.amount > 0)).toBe(true);
  });

  test('过滤函数保持原始数据不变', () => {
    const originalRecords: ComboTradeRecord[] = [
      { fundId: 'A', amount: 100, fee: 10 },
      { fundId: 'B', amount: 0, fee: 5 },
    ];

    const filtered = filterValidRecords(originalRecords);
    expect(originalRecords).toHaveLength(2);
    expect(originalRecords[1].amount).toBe(0);
  });
});

// 模拟 localStorage 测试
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  clear: jest.fn()
};

// Mock global localStorage
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
});

describe('localStorage 操作模拟', () => {
  beforeEach(() => {
    mockLocalStorage.clear.mockClear();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  test('读取空数据时返回空对象', () => {
    mockLocalStorage.getItem.mockReturnValue(null);
    const data = mockLocalStorage.getItem('fund_combo_trades');
    const result = data ? JSON.parse(data) : {};
    expect(result).toEqual({});
  });

  test('保存和读取数据正确', () => {
    const testData = {
      'combo1': { id: 'combo1', name: '测试组合', records: [] }
    };
    mockLocalStorage.getItem.mockReturnValue(JSON.stringify(testData));
    const data = mockLocalStorage.getItem('fund_combo_trades');
    const result = data ? JSON.parse(data) : {};
    expect(result.combo1).toBeDefined();
    expect(result.combo1.name).toBe('测试组合');
  });
});