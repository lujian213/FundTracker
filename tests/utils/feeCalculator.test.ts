import { calculateFee, findRecentTradeByType, calculateFeeRate, findExactMatchTrade } from '../../utils/feeCalculator';

describe('calculateFee', () => {
  test('无历史记录时返回0', () => {
    const result = calculateFee({
      historicalTrades: [],
      type: 'buy',
      currentDate: '2026-06-15',
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
      currentDate: '2026-06-15',
      price: 1.0,
      total: 1000,
    });
    expect(result).toBe(0);
  });

  test('买入场景正确计算手续费（费率计算）', () => {
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

    // 当前买入总额 2000（与历史不同，无法精确匹配）
    const result = calculateFee({
      historicalTrades,
      type: 'buy',
      currentDate: '2026-06-15',
      price: 1.0,
      total: 2000,
    });

    // 手续费 = 2000 × 0.0909 ≈ 181.82
    expect(result).toBeCloseTo(181.82, 1);
  });

  test('卖出场景正确计算手续费（费率计算）', () => {
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

    // 当前卖出：价格1×份额200（与历史不同，无法精确匹配）
    const result = calculateFee({
      historicalTrades,
      type: 'sell',
      currentDate: '2026-06-15',
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
      currentDate: '2026-06-15',
      price: 1.0,
      total: 1234.567,
    });

    // 应该四舍五入到两位小数
    expect(result).toBeCloseTo(112.23, 1);
  });

  // 新增测试：精确匹配场景
  test('买入精确匹配时直接使用历史手续费', () => {
    // 历史买入：总额 = 100×1 + 10 = 110
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

    // 当前买入总额也是 110，精确匹配
    const result = calculateFee({
      historicalTrades,
      type: 'buy',
      currentDate: '2026-06-15',
      price: 1.0,
      total: 110,
    });

    // 直接返回历史手续费 10，不使用费率计算
    expect(result).toBe(10);
  });

  test('卖出精确匹配时直接使用历史手续费', () => {
    // 历史卖出：份额 100
    const historicalTrades = [
      {
        id: '1',
        date: '2026-06-01',
        type: 'sell',
        shares: 100,
        price: 1.0,
        fee: 5,
      },
    ];

    // 当前卖出份额也是 100，精确匹配
    const result = calculateFee({
      historicalTrades,
      type: 'sell',
      currentDate: '2026-06-15',
      price: 2.0, // 价格不同不影响精确匹配（卖出只看份额）
      shares: 100,
    });

    // 直接返回历史手续费 5
    expect(result).toBe(5);
  });

  test('超过3个月的记录不用于精确匹配', () => {
    // 历史买入：总额 = 110，但日期超过3个月
    const historicalTrades = [
      {
        id: '1',
        date: '2026-01-01', // 超过3个月
        type: 'buy',
        shares: 100,
        price: 1.0,
        fee: 10,
      },
    ];

    // 当前买入总额也是 110，但历史记录超过3个月，无法精确匹配
    const result = calculateFee({
      historicalTrades,
      type: 'buy',
      currentDate: '2026-06-15',
      price: 1.0,
      total: 110,
    });

    // 使用费率计算：110 × (10/110) = 10
    expect(result).toBe(10);
  });

  test('多条精确匹配记录返回最近的一条', () => {
    // 多条历史买入记录，总额都是 110
    // 总额 = shares * price + fee = 110
    const historicalTrades = [
      {
        id: '1',
        date: '2026-05-01',
        type: 'buy',
        shares: 90,
        price: 1.0,
        fee: 20, // 90*1 + 20 = 110
      },
      {
        id: '2',
        date: '2026-05-20',
        type: 'buy',
        shares: 100,
        price: 1.0,
        fee: 10, // 100*1 + 10 = 110
      },
      {
        id: '3',
        date: '2026-05-10',
        type: 'buy',
        shares: 80,
        price: 1.0,
        fee: 30, // 80*1 + 30 = 110
      },
    ];

    // 当前买入总额 110，精确匹配多条，返回最近的（id:2, fee:10）
    const result = calculateFee({
      historicalTrades,
      type: 'buy',
      currentDate: '2026-06-15',
      price: 1.0,
      total: 110,
    });

    // 返回最近一条的手续费 10
    expect(result).toBe(10);
  });

  test('精确匹配优先于费率计算', () => {
    // 历史买入1：总额 110，手续费 10（可用于精确匹配）
    // 历史买入2：总额 200，手续费 20（费率计算会用这条）
    const historicalTrades = [
      {
        id: '1',
        date: '2026-05-01',
        type: 'buy',
        shares: 100,
        price: 1.0,
        fee: 10,
      },
      {
        id: '2',
        date: '2026-05-20',
        type: 'buy',
        shares: 200,
        price: 1.0,
        fee: 20,
      },
    ];

    // 当前买入总额 110，精确匹配历史1
    const result = calculateFee({
      historicalTrades,
      type: 'buy',
      currentDate: '2026-06-15',
      price: 1.0,
      total: 110,
    });

    // 精确匹配历史1，返回手续费 10（不是费率计算）
    expect(result).toBe(10);
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

describe('findExactMatchTrade', () => {
  test('买入精确匹配 - 总额相同', () => {
    // 历史买入：总额 = 100×1 + 10 = 110
    const trades = [
      { id: '1', date: '2026-05-01', type: 'buy', shares: 100, price: 1.0, fee: 10 },
    ];

    const result = findExactMatchTrade({
      historicalTrades: trades,
      type: 'buy',
      currentDate: '2026-06-15',
      total: 110,
    });

    expect(result?.id).toBe('1');
    expect(result?.fee).toBe(10);
  });

  test('卖出精确匹配 - 份额相同', () => {
    const trades = [
      { id: '1', date: '2026-05-01', type: 'sell', shares: 100, price: 1.0, fee: 5 },
    ];

    const result = findExactMatchTrade({
      historicalTrades: trades,
      type: 'sell',
      currentDate: '2026-06-15',
      shares: 100,
    });

    expect(result?.id).toBe('1');
    expect(result?.fee).toBe(5);
  });

  test('超过3个月不匹配', () => {
    const trades = [
      { id: '1', date: '2026-02-01', type: 'buy', shares: 100, price: 1.0, fee: 10 },
    ];

    const result = findExactMatchTrade({
      historicalTrades: trades,
      type: 'buy',
      currentDate: '2026-06-15', // 超过3个月
      total: 110,
    });

    expect(result).toBeNull();
  });

  test('未来日期不匹配', () => {
    const trades = [
      { id: '1', date: '2026-06-20', type: 'buy', shares: 100, price: 1.0, fee: 10 },
    ];

    const result = findExactMatchTrade({
      historicalTrades: trades,
      type: 'buy',
      currentDate: '2026-06-15', // 历史记录在当前日期之后
      total: 110,
    });

    expect(result).toBeNull();
  });

  test('多条匹配返回最近一条', () => {
    // 三条记录总额都是 110，日期不同
    const trades = [
      { id: '1', date: '2026-05-01', type: 'buy', shares: 90, price: 1.0, fee: 20 }, // 90+20=110
      { id: '2', date: '2026-05-20', type: 'buy', shares: 100, price: 1.0, fee: 10 }, // 100+10=110
      { id: '3', date: '2026-05-10', type: 'buy', shares: 80, price: 1.0, fee: 30 }, // 80+30=110
    ];

    const result = findExactMatchTrade({
      historicalTrades: trades,
      type: 'buy',
      currentDate: '2026-06-15',
      total: 110,
    });

    // 返回日期最近的 id:2
    expect(result?.id).toBe('2');
    expect(result?.fee).toBe(10);
  });

  test('类型不同不匹配', () => {
    const trades = [
      { id: '1', date: '2026-05-01', type: 'sell', shares: 100, price: 1.0, fee: 10 },
    ];

    const result = findExactMatchTrade({
      historicalTrades: trades,
      type: 'buy', // 类型不同
      currentDate: '2026-06-15',
      total: 110,
    });

    expect(result).toBeNull();
  });

  test('买入总额不同不匹配', () => {
    const trades = [
      { id: '1', date: '2026-05-01', type: 'buy', shares: 100, price: 1.0, fee: 10 },
    ];

    const result = findExactMatchTrade({
      historicalTrades: trades,
      type: 'buy',
      currentDate: '2026-06-15',
      total: 200, // 总额不同
    });

    expect(result).toBeNull();
  });

  test('卖出份额不同不匹配', () => {
    const trades = [
      { id: '1', date: '2026-05-01', type: 'sell', shares: 100, price: 1.0, fee: 5 },
    ];

    const result = findExactMatchTrade({
      historicalTrades: trades,
      type: 'sell',
      currentDate: '2026-06-15',
      shares: 200, // 份额不同
    });

    expect(result).toBeNull();
  });

  test('允许误差范围内匹配（考虑浮点数精度）', () => {
    const trades = [
      { id: '1', date: '2026-05-01', type: 'buy', shares: 100, price: 1.0, fee: 10 },
    ];

    // 总额 110.01，误差约 0.01，在允许范围内（0.02）
    const result = findExactMatchTrade({
      historicalTrades: trades,
      type: 'buy',
      currentDate: '2026-06-15',
      total: 110.01,
    });

    expect(result?.id).toBe('1');
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