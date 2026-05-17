import { buildCashFlows, computeXIRR, computeSimpleAnnualizedReturn, CashFlow } from '../../utils/xirrHelper';
import { TradeRecord } from '../../types';

describe('XIRR high return scenario', () => {
  // 高收益率场景（用户提供的数据）
  test('calculates XIRR for high return scenario correctly', () => {
    // 用户提供的数据：初始以 0.7335 买入 166145.72 份
    // 最终 125,829.62 份，价格 1.9697
    // 时间跨度：2026-02-13 → 2026-05-15，约 91 天
    //
    // 关键发现：中间交易贡献了约 80,885 元盈利
    // - 早期(Day 1-35): 净投入 29,579 元
    // - 中期(Day 36-70): 净回收 12,934 元
    // - 后期(Day 71-91): 净回收 98,530 元
    //
    // XIRR = 4000%+: 反映资金流的时间效率（短期高收益）
    // 简单年化 = 260%: 假设所有资金占用相同时间
    // 另一个AI的267.3%应该是简单年化收益率，不是XIRR

    const trades: TradeRecord[] = [
      { id: 't1', date: '2026-02-26', type: 'sell', shares: 6000, price: 1.6936, fee: 0 },
      { id: 't2', date: '2026-02-27', type: 'buy', shares: 5943.18, price: 1.6826, fee: 0 },
      { id: 't3', date: '2026-03-02', type: 'buy', shares: 12068.55, price: 1.6572, fee: 0 },
      { id: 't4', date: '2026-03-03', type: 'buy', shares: 15906.34, price: 1.5717, fee: 0 },
      { id: 't5', date: '2026-03-05', type: 'sell', shares: 10000, price: 1.5948, fee: 0 },
      { id: 't6', date: '2026-03-09', type: 'buy', shares: 6416.43, price: 1.5585, fee: 0 },
      { id: 't7', date: '2026-03-10', type: 'sell', shares: 13000, price: 1.5935, fee: 0 },
      { id: 't8', date: '2026-03-11', type: 'buy', shares: 4438.53, price: 1.5771, fee: 0 },
      { id: 't9', date: '2026-03-12', type: 'buy', shares: 4485.17, price: 1.5607, fee: 0 },
      { id: 't10', date: '2026-03-13', type: 'buy', shares: 3230.6, price: 1.5477, fee: 0 },
      { id: 't11', date: '2026-03-16', type: 'sell', shares: 8000, price: 1.5745, fee: 0 },
      { id: 't12', date: '2026-03-19', type: 'buy', shares: 3273.11, price: 1.5276, fee: 0 },
      { id: 't13', date: '2026-03-31', type: 'buy', shares: 7140.31, price: 1.4005, fee: 0 },
      { id: 't14', date: '2026-04-01', type: 'sell', shares: 7000, price: 1.4451, fee: 0 },
      { id: 't15', date: '2026-04-02', type: 'buy', shares: 7120.99, price: 1.4043, fee: 0 },
      { id: 't16', date: '2026-04-07', type: 'sell', shares: 7000, price: 1.4201, fee: 0 },
      { id: 't17', date: '2026-04-09', type: 'buy', shares: 3325.13, price: 1.5037, fee: 0 },
      { id: 't18', date: '2026-04-10', type: 'sell', shares: 3200, price: 1.5305, fee: 0 },
      { id: 't19', date: '2026-04-14', type: 'sell', shares: 3200, price: 1.5699, fee: 0 },
      { id: 't20', date: '2026-04-15', type: 'buy', shares: 6398.36, price: 1.5629, fee: 0 },
      { id: 't21', date: '2026-04-16', type: 'sell', shares: 6300, price: 1.5794, fee: 0 },
      { id: 't22', date: '2026-04-20', type: 'sell', shares: 4400, price: 1.6164, fee: 0 },
      { id: 't23', date: '2026-04-21', type: 'buy', shares: 6274.31, price: 1.5938, fee: 0 },
      { id: 't24', date: '2026-04-22', type: 'sell', shares: 6100, price: 1.6359, fee: 0 },
      { id: 't25', date: '2026-04-23', type: 'buy', shares: 9293.68, price: 1.614, fee: 0 },
      { id: 't26', date: '2026-04-24', type: 'sell', shares: 9700, price: 1.6407, fee: 0 },
      { id: 't27', date: '2026-04-27', type: 'sell', shares: 11500, price: 1.716, fee: 0 },
      { id: 't28', date: '2026-04-28', type: 'buy', shares: 8832.88, price: 1.6982, fee: 0 },
      { id: 't29', date: '2026-04-29', type: 'buy', shares: 2961.21, price: 1.6885, fee: 0 },
      { id: 't30', date: '2026-04-30', type: 'sell', shares: 22000, price: 1.7736, fee: 0 },
      { id: 't31', date: '2026-05-06', type: 'sell', shares: 16000, price: 1.8827, fee: 0 },
      { id: 't32', date: '2026-05-07', type: 'sell', shares: 5200, price: 1.9084, fee: 0 },
      { id: 't33', date: '2026-05-08', type: 'buy', shares: 16175.12, price: 1.8547, fee: 0 },
      { id: 't34', date: '2026-05-11', type: 'sell', shares: 15000, price: 1.9648, fee: 0 },
      { id: 't35', date: '2026-05-13', type: 'sell', shares: 10000, price: 2.0258, fee: 0 },
    ];

    const result = buildCashFlows({
      initialPosition: 166145.72,
      initialPrice: 0.7335,
      startDate: '2026-02-13',
      trades,
      currentShares: 125829.62,
      currentPrice: 1.9697,
      currentDate: '2026-05-15'
    });

    console.log('High return scenario cash flows:', result);
    console.log('Cash flows count:', result.length);
    const totalOutflow = Math.abs(result.filter(c => c.amount < 0).reduce((s, c) => s + c.amount, 0));
    const totalInflow = result.filter(c => c.amount > 0).reduce((s, c) => s + c.amount, 0);
    console.log('Total outflow:', totalOutflow);
    console.log('Total inflow:', totalInflow);
    console.log('Net profit:', totalInflow - totalOutflow);

    const xirrResult = computeXIRR(result);
    console.log('XIRR result:', xirrResult);

    expect(result).toHaveLength(37); // 1 initial + 35 trades + 1 final
    expect(xirrResult).not.toBeNull();
    expect(typeof xirrResult).toBe('number');
    // XIRR 应该在 3000% 到 5000% 之间
    // 由于中间交易贡献了高收益（短期回收），XIRR远高于简单年化收益率
    expect(xirrResult).toBeGreaterThan(3000);
    expect(xirrResult).toBeLessThan(5000);
  });
});

describe('buildCashFlows', () => {
  test('returns empty array when no initial position and no trades', () => {
    const result = buildCashFlows({
      initialPosition: 0,
      initialPrice: null,
      startDate: null,
      trades: [],
      currentShares: 0,
      currentPrice: 1.5,
      currentDate: '2026-05-17'
    });
    expect(result).toEqual([]);
  });

  test('builds cash flows with only initial position and final market value', () => {
    const result = buildCashFlows({
      initialPosition: 10000,
      initialPrice: 1.0,
      startDate: '2026-01-01',
      trades: [],
      currentShares: 10000,
      currentPrice: 1.2,
      currentDate: '2026-05-17'
    });
    // Initial investment: -10000 * 1.0 = -10000
    // Final market value: 10000 * 1.2 = 12000
    expect(result).toHaveLength(2);
    expect(result[0].amount).toBe(-10000);
    expect(result[1].amount).toBe(12000);
  });

  test('builds cash flows with trades', () => {
    const trades: TradeRecord[] = [
      { id: 't1', date: '2026-02-01', type: 'buy', shares: 1000, price: 1.1, fee: 10 },
      { id: 't2', date: '2026-03-01', type: 'sell', shares: 500, price: 1.3, fee: 5 },
    ];
    const result = buildCashFlows({
      initialPosition: 10000,
      initialPrice: 1.0,
      startDate: '2026-01-01',
      trades,
      currentShares: 10500, // 10000 + 1000 - 500
      currentPrice: 1.5,
      currentDate: '2026-05-17'
    });
    expect(result).toHaveLength(4);
    // Initial: -10000
    expect(result[0].amount).toBe(-10000);
    // Buy: -1.1 * 1000 - 10 = -1110
    expect(result[1].amount).toBe(-1110);
    // Sell: 1.3 * 500 - 5 = 645
    expect(result[2].amount).toBe(645);
    // Final: 10500 * 1.5 = 15750
    expect(result[3].amount).toBe(15750);
  });

  test('builds cash flows without initial position (only trades)', () => {
    const trades: TradeRecord[] = [
      { id: 't1', date: '2026-01-01', type: 'buy', shares: 1000, price: 1.0, fee: 0 },
    ];
    const result = buildCashFlows({
      initialPosition: 0,
      initialPrice: null,
      startDate: null,
      trades,
      currentShares: 1000,
      currentPrice: 1.2,
      currentDate: '2026-05-17'
    });
    expect(result).toHaveLength(2);
    // Buy: -1.0 * 1000 - 0 = -1000
    expect(result[0].amount).toBe(-1000);
    // Final: 1000 * 1.2 = 1200
    expect(result[1].amount).toBe(1200);
  });
});

describe('computeXIRR', () => {
  test('returns null for empty cash flows', () => {
    expect(computeXIRR([])).toBeNull();
  });

  test('returns null for single cash flow', () => {
    const cashFlows: CashFlow[] = [
      { date: new Date('2026-01-01'), amount: -10000 }
    ];
    expect(computeXIRR(cashFlows)).toBeNull();
  });

  test('calculates simple return when all cash flows on same day', () => {
    const cashFlows: CashFlow[] = [
      { date: new Date('2026-01-01'), amount: -10000 },
      { date: new Date('2026-01-01'), amount: 10500 }
    ];
    // Simple return: (10500 - 10000) / 10000 * 100 = 5%
    const result = computeXIRR(cashFlows);
    expect(result).toBe(5);
  });

  test('calculates XIRR for normal case (positive return)', () => {
    const cashFlows: CashFlow[] = [
      { date: new Date('2026-01-01'), amount: -10000 },
      { date: new Date('2026-05-17'), amount: 12000 }
    ];
    // About 4.5 months, should return positive XIRR
    const result = computeXIRR(cashFlows);
    expect(result).not.toBeNull();
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThan(0);
  });

  test('calculates XIRR for cleared position (zero final value)', () => {
    const cashFlows: CashFlow[] = [
      { date: new Date('2026-01-01'), amount: -10000 },
      { date: new Date('2026-02-01'), amount: 8000 }, // sell at loss
      { date: new Date('2026-05-17'), amount: 0 } // remaining shares = 0
    ];
    const result = computeXIRR(cashFlows);
    expect(result).not.toBeNull();
    // Should be negative (lost money)
    expect(result).toBeLessThan(0);
  });

  // 新增测试：负收益率场景（类似 015283 的实际情况）
  test('calculates XIRR for negative return scenario (like 015283)', () => {
    // 模拟 015283 的现金流特征：初始大额买入，中间频繁小额交易，最终亏损
    // 91天时间跨度，亏损约 -14.8%，年化约 -47%
    const cashFlows: CashFlow[] = [
      { date: new Date('2026-02-13'), amount: -100000 }, // 初始投入
      { date: new Date('2026-02-24'), amount: -1000 },    // 小额买入
      { date: new Date('2026-03-06'), amount: 1020 },    // 小额卖出
      { date: new Date('2026-04-15'), amount: 1200 },    // 卖出
      { date: new Date('2026-04-28'), amount: -5000 },   // 大额买入
      { date: new Date('2026-05-15'), amount: 85200 },   // 最终市值（亏损）
    ];
    // 总投入: 100000 + 1000 + 5000 = 106000
    // 总流入: 1020 + 1200 + 85200 = 87420
    // 净亏损: 87420 - 106000 = -18580 (约 -17.5%)
    const result = computeXIRR(cashFlows);
    expect(result).not.toBeNull();
    expect(typeof result).toBe('number');
    // 应该是负收益率
    expect(result).toBeLessThan(0);
    // 年化应该在 -30% 到 -80% 之间（粗略估算）
    expect(result).toBeGreaterThan(-100);
    expect(result).toBeLessThan(-20);
  });

  // 新增测试：复杂现金流（频繁交易）负收益率
  test('calculates XIRR for complex negative return cash flows', () => {
    // 更复杂的现金流：多笔小额交易穿插
    const cashFlows: CashFlow[] = [
      { date: new Date('2026-02-13'), amount: -409564.80 },           // 初始大额投入
      { date: new Date('2026-02-24'), amount: -5000 },   // 定投
      { date: new Date('2026-03-06'), amount: 5172 },    // 卖出
      { date: new Date('2026-03-10'), amount: 5162 },    // 卖出
      { date: new Date('2026-04-15'), amount: 5936.5 },  // 卖出
      { date: new Date('2026-04-28'), amount: -20000 },  // 大额买入
      { date: new Date('2026-05-15'), amount: 352046 },  // 最终市值
    ];
    const result = computeXIRR(cashFlows);
    expect(result).not.toBeNull();
    expect(typeof result).toBe('number');
    // 应该是负收益率
    expect(result).toBeLessThan(0);
  });

  // 新增测试：同一天多笔现金流（买入卖出）
  test('calculates simple return for multiple same-day cash flows', () => {
    const sameDay = new Date('2026-05-15');
    const cashFlows: CashFlow[] = [
      { date: sameDay, amount: -10000 },  // 买入
      { date: sameDay, amount: -5000 },   // 再买入
      { date: sameDay, amount: 8000 },    // 卖出
      { date: sameDay, amount: 12000 },   // 最终市值
    ];
    // 总投入: 10000 + 5000 = 15000
    // 总流入: 8000 + 12000 = 20000
    // 简单收益率: (20000 - 15000) / 15000 * 100 = 33.33%
    const result = computeXIRR(cashFlows);
    expect(result).not.toBeNull();
    expect(result).toBeCloseTo(33.33, 1);
  });
});

describe('computeSimpleAnnualizedReturn', () => {
  test('returns null for empty cash flows', () => {
    expect(computeSimpleAnnualizedReturn([])).toBeNull();
  });

  test('returns null for single cash flow', () => {
    const cashFlows: CashFlow[] = [
      { date: new Date('2026-01-01'), amount: -10000 }
    ];
    expect(computeSimpleAnnualizedReturn(cashFlows)).toBeNull();
  });

  test('calculates simple annualized return for positive return', () => {
    const cashFlows: CashFlow[] = [
      { date: new Date('2026-01-01'), amount: -10000 },
      { date: new Date('2026-05-15'), amount: 12000 } // ~134 days
    ];
    // 简单收益率: (12000 - 10000) / 10000 = 20%
    // 年化: 20% * (365 / 134) ≈ 54.48%
    const result = computeSimpleAnnualizedReturn(cashFlows);
    expect(result).not.toBeNull();
    expect(result).toBeCloseTo(54.48, 1);
  });

  test('calculates simple annualized return for negative return', () => {
    const cashFlows: CashFlow[] = [
      { date: new Date('2026-01-01'), amount: -10000 },
      { date: new Date('2026-05-15'), amount: 8000 } // ~134 days
    ];
    // 简单收益率: (8000 - 10000) / 10000 = -20%
    // 年化: -20% * (365 / 134) ≈ -54.48%
    const result = computeSimpleAnnualizedReturn(cashFlows);
    expect(result).not.toBeNull();
    expect(result).toBeCloseTo(-54.48, 1);
  });

  test('calculates simple annualized return for high return scenario', () => {
    // 用户提供的数据：91天，收益约64.78%
    // 年化约 260%
    const cashFlows: CashFlow[] = [
      { date: new Date('2026-02-13'), amount: -121867.88562 },
      { date: new Date('2026-02-26'), amount: 10161.6 },
      { date: new Date('2026-02-27'), amount: -9999.994668 },
      { date: new Date('2026-03-02'), amount: -20000.00106 },
      { date: new Date('2026-03-03'), amount: -24999.994578 },
      { date: new Date('2026-03-05'), amount: 15948 },
      { date: new Date('2026-03-09'), amount: -10000.006155 },
      { date: new Date('2026-03-10'), amount: 20715.5 },
      { date: new Date('2026-03-11'), amount: -7000.005663 },
      { date: new Date('2026-03-12'), amount: -7000.004819 },
      { date: new Date('2026-03-13'), amount: -4999.99962 },
      { date: new Date('2026-03-16'), amount: 12596 },
      { date: new Date('2026-03-19'), amount: -5000.002836 },
      { date: new Date('2026-03-31'), amount: -10000.004155 },
      { date: new Date('2026-04-01'), amount: 10115.7 },
      { date: new Date('2026-04-02'), amount: -10000.006257 },
      { date: new Date('2026-04-07'), amount: 9940.7 },
      { date: new Date('2026-04-09'), amount: -4999.997981 },
      { date: new Date('2026-04-10'), amount: 4897.6 },
      { date: new Date('2026-04-14'), amount: 5023.68 },
      { date: new Date('2026-04-15'), amount: -9999.996844 },
      { date: new Date('2026-04-16'), amount: 9950.22 },
      { date: new Date('2026-04-20'), amount: 7112.16 },
      { date: new Date('2026-04-21'), amount: -9999.995278 },
      { date: new Date('2026-04-22'), amount: 9978.99 },
      { date: new Date('2026-04-23'), amount: -14999.99952 },
      { date: new Date('2026-04-24'), amount: 15914.79 },
      { date: new Date('2026-04-27'), amount: 19734 },
      { date: new Date('2026-04-28'), amount: -14999.996816 },
      { date: new Date('2026-04-29'), amount: -5000.003085 },
      { date: new Date('2026-04-30'), amount: 39019.2 },
      { date: new Date('2026-05-06'), amount: 30123.2 },
      { date: new Date('2026-05-07'), amount: 9923.68 },
      { date: new Date('2026-05-08'), amount: -29999.995064 },
      { date: new Date('2026-05-11'), amount: 29472 },
      { date: new Date('2026-05-13'), amount: 20258 },
      { date: new Date('2026-05-15'), amount: 247846.602514 }
    ];
    const result = computeSimpleAnnualizedReturn(cashFlows);
    expect(result).not.toBeNull();
    // 简单年化收益率约 260%
    expect(result).toBeGreaterThan(200);
    expect(result).toBeLessThan(300);
  });

  test('calculates simple annualized return with multiple trades', () => {
    const cashFlows: CashFlow[] = [
      { date: new Date('2026-01-01'), amount: -10000 }, // 初始投入
      { date: new Date('2026-02-01'), amount: -1000 },  // 加仓
      { date: new Date('2026-03-01'), amount: 500 },    // 减仓
      { date: new Date('2026-05-01'), amount: 15000 }   // 最终市值
    ];
    // 总投入: 10000 + 1000 = 11000
    // 总回收: 500 + 15000 = 15500
    // 简单收益率: (15500 - 11000) / 11000 = 40.91%
    // 天数: 121天
    // 年化: 40.91% * (365 / 121) ≈ 122.5%
    const result = computeSimpleAnnualizedReturn(cashFlows);
    expect(result).not.toBeNull();
    expect(result).toBeGreaterThan(100);
    expect(result).toBeLessThan(130);
  });
});