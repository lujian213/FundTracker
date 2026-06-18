import { calculateFee, findRecentTradeByType, calculateFeeRate } from '../../utils/feeCalculator';

describe('calculateFee', () => {
  test('无历史记录时返回0', () => {
    const result = calculateFee({
      historicalTrades: [],
      type: 'buy',
      price: 1.0,
      total: 1000,
    });
    expect(result).toBe(0);
  });

  test('历史手续费为0时返回0', () => {
    const historicalTrades = [
      {
        id: '1',
        date: '2026-06-01',
        type: 'buy',
        shares: 100,
        price: 1.0,
        fee: 0,
      },
    ];

    const result = calculateFee({
      historicalTrades,
      type: 'buy',
      price: 1.0,
      total: 1000,
    });
    expect(result).toBe(0);
  });

  test('买入场景正确计算手续费', () => {
    // 历史买入：总额 = 100×1 + 10 = 110，手续费率 = 10/110 ≈ 0.0909
    const historicalTrades = [
      {
        id: '1',
        date: '2026-06-01',
        type: 'buy',
        shares: 100,
        price: 1.0,
        fee: 10,
      },
    ];

    // 当前买入总额 2000
    const result = calculateFee({
      historicalTrades,
      type: 'buy',
      price: 1.0,
      total: 2000,
    });

    // 手续费 = 2000 × 0.0909 ≈ 181.82
    expect(result).toBeCloseTo(181.82, 1);
  });

  test('卖出场景正确计算手续费', () => {
    // 历史卖出：价格1×份额100，手续费率 = 1/100 = 0.01
    const historicalTrades = [
      {
        id: '1',
        date: '2026-06-01',
        type: 'sell',
        shares: 100,
        price: 1.0,
        fee: 1,
      },
    ];

    // 当前卖出：价格1×份额200
    const result = calculateFee({
      historicalTrades,
      type: 'sell',
      price: 1.0,
      shares: 200,
    });

    // 手续费 = 1 × 200 × 0.01 = 2.00
    expect(result).toBe(2.00);
  });

  test('保留两位小数精度', () => {
    const historicalTrades = [
      {
        id: '1',
        date: '2026-06-01',
        type: 'buy',
        shares: 100,
        price: 1.0,
        fee: 10,
      },
    ];

    const result = calculateFee({
      historicalTrades,
      type: 'buy',
      price: 1.0,
      total: 1234.567,
    });

    // 应该四舍五入到两位小数
    expect(result).toBeCloseTo(112.23, 1);
  });
});

describe('findRecentTradeByType', () => {
  test('按日期降序查找最近的交易', () => {
    const trades = [
      { id: '1', date: '2026-06-01', type: 'buy', shares: 100, price: 1, fee: 10 },
      { id: '2', date: '2026-06-05', type: 'buy', shares: 50, price: 1, fee: 5 },
      { id: '3', date: '2026-06-03', type: 'sell', shares: 30, price: 1, fee: 3 },
    ];

    const result = findRecentTradeByType(trades, 'buy');
    expect(result?.id).toBe('2'); // 最近的买入记录
  });

  test('无匹配类型时返回null', () => {
    const trades = [
      { id: '1', date: '2026-06-01', type: 'buy', shares: 100, price: 1, fee: 10 },
    ];

    const result = findRecentTradeByType(trades, 'sell');
    expect(result).toBeNull();
  });
});

describe('calculateFeeRate', () => {
  test('买入手续费率计算', () => {
    const trade = { id: '1', date: '2026-06-01', type: 'buy', shares: 100, price: 1, fee: 10 };
    // 总额 = 100×1 + 10 = 110，手续费率 = 10/110 ≈ 0.0909
    const result = calculateFeeRate(trade);
    expect(result).toBeCloseTo(0.0909, 4);
  });

  test('卖出手续费率计算', () => {
    const trade = { id: '1', date: '2026-06-01', type: 'sell', shares: 100, price: 1, fee: 1 };
    // 基础金额 = 1×100 = 100，手续费率 = 1/100 = 0.01
    const result = calculateFeeRate(trade);
    expect(result).toBe(0.01);
  });

  test('手续费为0时返回0', () => {
    const trade = { id: '1', date: '2026-06-01', type: 'buy', shares: 100, price: 1, fee: 0 };
    const result = calculateFeeRate(trade);
    expect(result).toBe(0);
  });
});