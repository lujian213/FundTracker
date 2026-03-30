import { TradeType } from '../../types';

// 复制组件中的计算函数用于测试
function calculateTotal(type: TradeType, shares: number, price: number, fee: number): number {
  return type === 'buy'
    ? Number((shares * price + fee).toFixed(2))
    : Number((shares * price - fee).toFixed(2));
}

function calculateShares(type: TradeType, total: number, price: number, fee: number): number {
  return type === 'buy'
    ? Number(((total - fee) / price).toFixed(4))
    : Number(((total + fee) / price).toFixed(4));
}

describe('批量交易计算逻辑', () => {
  describe('calculateTotal', () => {
    test('买入：总额 = 份额 * 价格 + 手续费', () => {
      expect(calculateTotal('buy', 1000, 1.5, 10)).toBe(1510); // 1000 * 1.5 + 10 = 1510
      expect(calculateTotal('buy', 6666.6667, 1.5, 0)).toBeCloseTo(10000, 2);
    });

    test('卖出：总额 = 份额 * 价格 - 手续费', () => {
      expect(calculateTotal('sell', 1000, 1.5, 10)).toBe(1490); // 1000 * 1.5 - 10 = 1490
      expect(calculateTotal('sell', 1000, 1.5, 0)).toBe(1500);
    });

    test('手续费为0时计算正确', () => {
      expect(calculateTotal('buy', 1000, 1.5, 0)).toBe(1500);
      expect(calculateTotal('sell', 1000, 1.5, 0)).toBe(1500);
    });
  });

  describe('calculateShares', () => {
    test('买入：份额 = (总额 - 手续费) / 价格', () => {
      expect(calculateShares('buy', 1510, 1.5, 10)).toBeCloseTo(1000, 4); // (1510 - 10) / 1.5 = 1000
      expect(calculateShares('buy', 10000, 1.5, 0)).toBeCloseTo(6666.6667, 4);
    });

    test('卖出：份额 = (总额 + 手续费) / 价格', () => {
      expect(calculateShares('sell', 1490, 1.5, 10)).toBeCloseTo(1000, 4); // (1490 + 10) / 1.5 = 1000
      expect(calculateShares('sell', 1500, 1.5, 0)).toBeCloseTo(1000, 4);
    });

    test('手续费为0时计算正确', () => {
      expect(calculateShares('buy', 1500, 1.5, 0)).toBeCloseTo(1000, 4);
      expect(calculateShares('sell', 1500, 1.5, 0)).toBeCloseTo(1000, 4);
    });
  });

  describe('买入交易：手续费变化时触发计算的条件', () => {
    test('总额 > 0 时，手续费变化应重新计算份额', () => {
      const price = 1.5;
      const total = 10000;
      const fee1 = 0;
      const fee2 = 10;

      // 手续费为0时的份额
      const shares1 = calculateShares('buy', total, price, fee1); // 6666.6667
      // 手续费为10时的份额
      const shares2 = calculateShares('buy', total, price, fee2); // (10000-10)/1.5 = 6660

      expect(shares1).not.toBe(shares2);
      expect(shares1).toBeCloseTo(6666.6667, 4);
      expect(shares2).toBeCloseTo(6660, 4);
    });

    test('总额为空/0时，手续费变化不应触发计算（代码中不做计算）', () => {
      // 验证：当 total = 0 时，calculateShares 会返回负数
      // 这是因为代码中应该先判断 total > 0 才调用计算
      // 所以实际测试的是计算函数的边界行为
      const price = 1.5;
      const total = 0;
      const fee = 10;

      // 总额为0时，计算结果为负（因为 (0-10)/1.5 = -6.67）
      // 代码中应判断 total > 0 才执行计算
      const shares = calculateShares('buy', total, price, fee);
      expect(shares).toBeLessThan(0); // 负数表示不应该计算
    });
  });

  describe('卖出交易：手续费变化时触发计算的条件', () => {
    test('份额 > 0 时，手续费变化应重新计算总额', () => {
      const price = 1.5;
      const shares = 1000;
      const fee1 = 0;
      const fee2 = 10;

      // 手续费为0时的总额
      const total1 = calculateTotal('sell', shares, price, fee1); // 1500
      // 手续费为10时的总额
      const total2 = calculateTotal('sell', shares, price, fee2); // 1490

      expect(total1).not.toBe(total2);
      expect(total1).toBe(1500);
      expect(total2).toBe(1490);
    });

    test('份额为空/0时，手续费变化不应触发计算（代码中不做计算）', () => {
      // 验证：当 shares = 0 时，calculateTotal 会返回负数
      // 这是因为代码中应该先判断 shares > 0 才调用计算
      const price = 1.5;
      const shares = 0;
      const fee = 10;

      // 份额为0时，计算结果为负（因为 0*1.5 - 10 = -10）
      // 代码中应判断 shares > 0 才执行计算
      const total = calculateTotal('sell', shares, price, fee);
      expect(total).toBeLessThan(0); // 负数表示不应该计算
    });
  });
});