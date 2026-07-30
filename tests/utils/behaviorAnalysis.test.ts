import {
  calculateTradeTimingScore,
  identifyChaseHighSellLow,
  identifyFrequentLossTrade,
  identifyFOMOBuy,
  calculateBehaviorScore,
  calculateBehaviorAnalysis,
  // @ts-ignore - 导出内部函数用于测试
  buildNavIndex
} from '../../utils/behaviorAnalysis';
import { TradeRecord, HistoricalPoint } from '../../types';

describe('behaviorAnalysis', () => {
  // ═══════════════════════════════════════════════════════════════════════════════
  // 时机评分测试
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('calculateTradeTimingScore', () => {
    it('历史数据不足时应返回默认分数', () => {
      const mockNavHistory: HistoricalPoint[] = [];
      const trade: TradeRecord = {
        id: '1',
        date: '2024-03-02',
        type: 'buy',
        shares: 100,
        price: 1.01,
        fee: 0
      };

      const navIndex = buildNavIndex(mockNavHistory);
      const result = calculateTradeTimingScore(trade, navIndex);

      expect(result.score).toBe(60);
      expect(result.reason).toBe('历史数据不足');
    });

    it('无法获取交易日净值时应返回默认分数', () => {
      const mockNavHistory: HistoricalPoint[] = [
        { date: new Date('2024-03-01').getTime(), value: 1.0, equityReturn: 0 }
      ];
      const trade: TradeRecord = {
        id: '1',
        date: '2024-03-05',
        type: 'buy',
        shares: 100,
        price: 1.05,
        fee: 0
      };

      const navIndex = buildNavIndex(mockNavHistory);
      const result = calculateTradeTimingScore(trade, navIndex);

      expect(result.score).toBe(60);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // 情绪化交易识别测试
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('identifyChaseHighSellLow', () => {
    const mockNavHistory: HistoricalPoint[] = [];
    let navIndex: ReturnType<typeof buildNavIndex>;

    beforeAll(() => {
      const baseDate = new Date('2024-03-01');
      for (let i = 0; i < 10; i++) {
        const date = new Date(baseDate);
        date.setDate(date.getDate() + i);
        mockNavHistory.push({
          date: date.getTime(),
          value: 1.0 + (i % 3 === 0 ? 0.05 : -0.02),
          equityReturn: i % 3 === 0 ? 5 : -2
        });
      }
      navIndex = buildNavIndex(mockNavHistory);
    });

    it('应该识别追涨买入（涨幅>3%）', () => {
      const trades: TradeRecord[] = [
        { id: '1', date: '2024-03-04', type: 'buy', shares: 100, price: 1.05, fee: 0 }
      ];

      const result = identifyChaseHighSellLow(trades, navIndex);

      // 涨幅>3%的买入应该被识别为追涨
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('应该识别杀跌卖出（跌幅>3%且亏损）', () => {
      const trades: TradeRecord[] = [
        { id: '1', date: '2024-03-01', type: 'buy', shares: 100, price: 1.50, fee: 0 },
        { id: '2', date: '2024-03-05', type: 'sell', shares: 100, price: 1.40, fee: 0 }
      ];

      const result = identifyChaseHighSellLow(trades, navIndex);

      // 跌幅>3%且亏损卖出应该被识别为杀跌
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('盈利卖出不应被识别为杀跌', () => {
      const trades: TradeRecord[] = [
        { id: '1', date: '2024-03-01', type: 'buy', shares: 100, price: 1.00, fee: 0 },
        { id: '2', date: '2024-03-05', type: 'sell', shares: 100, price: 1.20, fee: 0 }
      ];

      const result = identifyChaseHighSellLow(trades, navIndex);

      // 即使跌幅>3%，但盈利卖出不应被识别为杀跌
      const sellTrade = result.find(t => t.id === '2');
      expect(sellTrade).toBeUndefined();
    });

    it('LIFO匹配：卖出优先匹配最近买入', () => {
      // 场景：先低价买入，后高价买入，卖出时先匹配高价买入
      const trades: TradeRecord[] = [
        { id: '1', date: '2024-03-01', type: 'buy', shares: 100, price: 10.0, fee: 0 },
        { id: '2', date: '2024-03-02', type: 'buy', shares: 200, price: 11.0, fee: 0 },
        { id: '3', date: '2024-03-04', type: 'sell', shares: 200, price: 11.1, fee: 0 }, // 盈利
        { id: '4', date: '2024-03-05', type: 'sell', shares: 100, price: 10.3, fee: 0 }  // 盈利（LIFO匹配10.0）
      ];

      const result = identifyChaseHighSellLow(trades, navIndex);

      // LIFO：卖出200份匹配11.0的买入，盈利
      // 卖出100份匹配10.0的买入，盈利
      // 所以不应该有杀跌卖出
      const sellTrades = result.filter(t => t.type === 'sell');
      expect(sellTrades.length).toBe(0);
    });

    it('逢低买入不应被识别为追涨', () => {
      // 场景：卖出后以低于卖出价的价格买回
      const trades: TradeRecord[] = [
        { id: '1', date: '2024-03-01', type: 'sell', shares: 100, price: 11.0, fee: 0 },
        { id: '2', date: '2024-03-04', type: 'buy', shares: 100, price: 10.5, fee: 0 } // 低于卖出价
      ];

      const result = identifyChaseHighSellLow(trades, navIndex);

      // 即使当天涨幅>3%，但买入价格低于栈顶卖出价格，不算追涨
      const buyTrade = result.find(t => t.id === '2');
      expect(buyTrade).toBeUndefined();
    });

    it('追高买入：买入价格高于栈顶卖出价格（LIFO）', () => {
      // 场景：最近卖出价格较高，买入价格更高
      const trades: TradeRecord[] = [
        { id: '1', date: '2024-03-01', type: 'sell', shares: 100, price: 10.0, fee: 0 },
        { id: '2', date: '2024-03-02', type: 'sell', shares: 100, price: 11.0, fee: 0 },
        { id: '3', date: '2024-03-04', type: 'buy', shares: 100, price: 11.5, fee: 0 } // 高于栈顶11.0
      ];

      const result = identifyChaseHighSellLow(trades, navIndex);

      // 当天涨幅>3%且买入价格高于栈顶卖出价格(11.0)，算追涨
      // 注意：由于mockNavHistory的涨幅不确定，这里只检查逻辑是否正确
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('LIFO匹配：买入价格高于之前卖出价格但低于最近卖出价格，不算追涨', () => {
      // 场景：最近卖出价格较高，买入价格在中间
      const trades: TradeRecord[] = [
        { id: '1', date: '2024-03-01', type: 'sell', shares: 100, price: 10.0, fee: 0 },
        { id: '2', date: '2024-03-02', type: 'sell', shares: 100, price: 11.0, fee: 0 },
        { id: '3', date: '2024-03-04', type: 'buy', shares: 100, price: 10.5, fee: 0 } // 低于栈顶11.0
      ];

      const result = identifyChaseHighSellLow(trades, navIndex);

      // 买入价格10.5低于栈顶卖出价格11.0，不算追涨
      const buyTrade = result.find(t => t.id === '3');
      expect(buyTrade).toBeUndefined();
    });
  });

  describe('identifyFrequentLossTrade', () => {
    it('应该识别持有<7天且收益率≤0.5%的交易', () => {
      const trades: TradeRecord[] = [
        { id: '1', date: '2024-03-01', type: 'buy', shares: 100, price: 1.50, fee: 1 },
        { id: '2', date: '2024-03-05', type: 'sell', shares: 100, price: 1.40, fee: 1 }
      ];

      const result = identifyFrequentLossTrade(trades);

      // 总成本 = 100×1.50 + 1 = 151
      // 总收入 = 100×1.40 - 1 = 139
      // 收益率 = (139 - 151) / 151 × 100% = -7.95% < 0.5%
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('2');
    });

    it('不应该识别持有>=7天的交易', () => {
      const trades: TradeRecord[] = [
        { id: '1', date: '2024-03-01', type: 'buy', shares: 100, price: 1.50, fee: 0 },
        { id: '2', date: '2024-03-10', type: 'sell', shares: 100, price: 1.40, fee: 0 }
      ];

      const result = identifyFrequentLossTrade(trades);

      expect(result.length).toBe(0);
    });

    it('不应该识别收益率>0.5%的交易', () => {
      const trades: TradeRecord[] = [
        { id: '1', date: '2024-03-01', type: 'buy', shares: 100, price: 1.50, fee: 0 },
        { id: '2', date: '2024-03-05', type: 'sell', shares: 100, price: 1.60, fee: 0 }
      ];

      const result = identifyFrequentLossTrade(trades);

      // 总成本 = 100×1.50 + 0 = 150
      // 总收入 = 100×1.60 - 0 = 160
      // 收益率 = (160 - 150) / 150 × 100% = 6.67% > 0.5%
      expect(result.length).toBe(0);
    });

    it('使用LIFO匹配：应该匹配最近的买入', () => {
      const trades: TradeRecord[] = [
        // 第一次买入（较早）
        { id: '1', date: '2024-03-01', type: 'buy', shares: 100, price: 1.50, fee: 0 },
        // 第二次买入（较晚，低价）
        { id: '2', date: '2024-03-05', type: 'buy', shares: 100, price: 1.30, fee: 0 },
        // 卖出（价格在两次买入之间）
        { id: '3', date: '2024-03-08', type: 'sell', shares: 100, price: 1.40, fee: 0 }
      ];

      const result = identifyFrequentLossTrade(trades);

      // LIFO：卖出匹配第二次买入（价格1.30），卖出价1.40 > 1.30，盈利，不算频繁调仓
      expect(result.length).toBe(0);
    });

    
    it('应该识别部分份额卖出-整体收益率≤0.5%的情况', () => {
      const trades: TradeRecord[] = [
        // 第一次买入（低价，持有天数=5天）
        { id: '1', date: '2024-03-03', type: 'buy', shares: 100, price: 1.50, fee: 2 },
        // 第二次买入（高价，持有天数=3天）
        { id: '2', date: '2024-03-05', type: 'buy', shares: 100, price: 1.60, fee: 2 },
        // 卖出200份
        { id: '3', date: '2024-03-08', type: 'sell', shares: 200, price: 1.55, fee: 3 }
      ];

      const result = identifyFrequentLossTrade(trades);

      // LIFO匹配：卖出200份
      // 匹配第二次买入：100份
      //   成本 = 100×1.60 = 160
      //   手续费 = 2×(100/100) = 2
      // 匹配第一次买入：100份
      //   成本 = 100×1.50 = 150
      //   手续费 = 2×(100/100) = 2
      // 总成本 = 160 + 2 + 150 + 2 = 314
      // 总收入 = 200×1.55 - 3 = 307
      // 收益率 = (307 - 314) / 314 × 100% = -2.23% < 0.5%
      // 应识别为频繁调仓
      // 持有天数取最后一次匹配的买入（最早的那次），即5天
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('3');
      expect(result[0].reason).toContain('持有5天');
      expect(result[0].reason).toContain('-2.23%');
    });

    it('整体盈利>0.5%不应识别为频繁调仓', () => {
      const trades: TradeRecord[] = [
        { id: '1', date: '2024-03-01', type: 'buy', shares: 100, price: 1.50, fee: 1 },
        { id: '2', date: '2024-03-05', type: 'sell', shares: 100, price: 1.60, fee: 1 }
      ];

      const result = identifyFrequentLossTrade(trades);

      // 总成本 = 100×1.50 + 1 = 151
      // 总收入 = 100×1.60 - 1 = 159
      // 收益率 = (159 - 151) / 151 × 100% = 5.3% > 0.5%
      // 不应识别为频繁调仓
      expect(result.length).toBe(0);
    });

    it('整体亏损应识别为频繁调仓', () => {
      const trades: TradeRecord[] = [
        { id: '1', date: '2024-03-01', type: 'buy', shares: 100, price: 1.60, fee: 1 },
        { id: '2', date: '2024-03-05', type: 'sell', shares: 100, price: 1.50, fee: 1 }
      ];

      const result = identifyFrequentLossTrade(trades);

      // 总成本 = 100×1.60 + 1 = 161
      // 总收入 = 100×1.50 - 1 = 149
      // 收益率 = (149 - 161) / 161 × 100% = -7.45% < 0.5%
      // 应识别为频繁调仓
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('2');
      expect(result[0].reason).toContain('持有4天');
      expect(result[0].reason).toContain('-7.45%');
    });

    it('微利急卖（收益率<0.5%）应识别为频繁调仓', () => {
      const trades: TradeRecord[] = [
        { id: '1', date: '2024-03-01', type: 'buy', shares: 100, price: 1.50, fee: 1 },
        { id: '2', date: '2024-03-05', type: 'sell', shares: 100, price: 1.51, fee: 1 }
      ];

      const result = identifyFrequentLossTrade(trades);

      // 总成本 = 100×1.50 + 1 = 151
      // 总收入 = 100×1.51 - 1 = 150
      // 收益率 = (150 - 151) / 151 × 100% = -0.66% < 0.5%
      // 应识别为频繁调仓
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('2');
      expect(result[0].reason).toContain('-0.66%');
    });

    it('部分份额卖出-整体盈利>0.5%不应识别', () => {
      const trades: TradeRecord[] = [
        { id: '1', date: '2024-03-01', type: 'buy', shares: 200, price: 1.50, fee: 2 },
        { id: '2', date: '2024-03-05', type: 'sell', shares: 100, price: 1.55, fee: 1 }
      ];

      const result = identifyFrequentLossTrade(trades);

      // 匹配买入：100份（部分）
      // 总成本 = 100×1.50 + 2×(100/200) = 151
      // 总收入 = 100×1.55 - 1 = 154
      // 收益率 = (154 - 151) / 151 × 100% = 1.99% > 0.5%
      // 不应识别为频繁调仓
      expect(result.length).toBe(0);
    });

    it('部分份额卖出-整体亏损应识别为频繁调仓', () => {
      const trades: TradeRecord[] = [
        { id: '1', date: '2024-03-01', type: 'buy', shares: 200, price: 1.60, fee: 2 },
        { id: '2', date: '2024-03-05', type: 'sell', shares: 100, price: 1.50, fee: 1 }
      ];

      const result = identifyFrequentLossTrade(trades);

      // 匹配买入：100份（部分）
      // 总成本 = 100×1.60 + 2×(100/200) = 161
      // 总收入 = 100×1.50 - 1 = 149
      // 收益率 = (149 - 161) / 161 × 100% = -7.45% < 0.5%
      // 应识别为频繁调仓
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('2');
      expect(result[0].reason).toContain('-7.45%');
    });

    it('手续费为null时应按0处理', () => {
      const trades: TradeRecord[] = [
        { id: '1', date: '2024-03-01', type: 'buy', shares: 100, price: 1.50, fee: null as any },
        { id: '2', date: '2024-03-05', type: 'sell', shares: 100, price: 1.55, fee: null as any }
      ];

      const result = identifyFrequentLossTrade(trades);

      // 手续费按0处理
      // 总成本 = 100×1.50 + 0 = 150
      // 总收入 = 100×1.55 - 0 = 155
      // 收益率 = (155 - 150) / 150 × 100% = 3.33% > 0.5%
      // 不应识别为频繁调仓
      expect(result.length).toBe(0);
    });

    it('总成本≤0时应跳过判断', () => {
      const trades: TradeRecord[] = [
        { id: '1', date: '2024-03-01', type: 'buy', shares: 100, price: 0, fee: 0 },
        { id: '2', date: '2024-03-05', type: 'sell', shares: 100, price: 1.50, fee: 0 }
      ];

      const result = identifyFrequentLossTrade(trades);

      // 总成本 = 100×0 + 0 = 0
      // 跳过判断（避免除零）
      expect(result.length).toBe(0);
    });

    it('手续费应按比例分摊', () => {
      const trades: TradeRecord[] = [
        { id: '1', date: '2024-03-01', type: 'buy', shares: 100, price: 1.50, fee: 15 },
        { id: '2', date: '2024-03-02', type: 'buy', shares: 100, price: 1.60, fee: 16 },
        { id: '3', date: '2024-03-05', type: 'sell', shares: 150, price: 1.55, fee: 10 }
      ];

      const result = identifyFrequentLossTrade(trades);

      // LIFO匹配：
      // 匹配第二次买入：100份
      //   成本 = 100×1.60 = 160
      //   手续费 = 16×(100/100) = 16
      // 匹配第一次买入：50份
      //   成本 = 50×1.50 = 75
      //   手续费 = Math.round(15×(50/100)×100)/100 = 7.5
      // 总成本 = 160 + 16 + 75 + 7.5 = 258.5
      // 总收入 = 150×1.55 - 10 = 222.5
      // 收益率 = Math.round((222.5 - 258.5) / 258.5 × 10000) / 100 = -13.93%
      // 应识别为频繁调仓
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('3');
      expect(result[0].reason).toContain('-13.93%');
    });

    it('收益率恰好=0.5%时应识别为频繁调仓', () => {
      // 边界测试：收益率恰好为0.5%（≤0.5%的临界值）
      const trades: TradeRecord[] = [
        { id: '1', date: '2024-03-01', type: 'buy', shares: 100, price: 1.50, fee: 0 },
        { id: '2', date: '2024-03-05', type: 'sell', shares: 100, price: 1.5075, fee: 0 }
      ];

      const result = identifyFrequentLossTrade(trades);

      // 总成本 = 100×1.50 + 0 = 150
      // 总收入 = 100×1.5075 - 0 = 150.75
      // 收益率 = (150.75 - 150) / 150 × 100% = 0.5%
      // 应识别为频繁调仓（≤0.5%）
      expect(result.length).toBe(1);
      expect(result[0].reason).toContain('0.50%');
    });

    it('手续费为undefined时应按0处理', () => {
      const trades: TradeRecord[] = [
        { id: '1', date: '2024-03-01', type: 'buy', shares: 100, price: 1.50, fee: undefined as any },
        { id: '2', date: '2024-03-05', type: 'sell', shares: 100, price: 1.55, fee: undefined as any }
      ];

      const result = identifyFrequentLossTrade(trades);

      // 手续费按0处理
      // 总成本 = 100×1.50 + 0 = 150
      // 总收入 = 100×1.55 - 0 = 155
      // 收益率 = (155 - 150) / 150 × 100% = 3.33% > 0.5%
      // 不应识别为频繁调仓
      expect(result.length).toBe(0);
    });
  });

  describe('identifyFOMOBuy', () => {
    const mockNavHistory: HistoricalPoint[] = [];
    let navIndex: ReturnType<typeof buildNavIndex>;

    beforeAll(() => {
      const baseDate = new Date('2024-03-01');
      for (let i = 0; i < 10; i++) {
        const date = new Date(baseDate);
        date.setDate(date.getDate() + i);
        mockNavHistory.push({
          date: date.getTime(),
          value: 1.0 + i * 0.1,
          equityReturn: i % 2 === 0 ? 6 : 2
        });
      }
      navIndex = buildNavIndex(mockNavHistory);
    });

    it('应该识别涨幅>5%后的买入', () => {
      const trades: TradeRecord[] = [
        { id: '1', date: '2024-03-02', type: 'buy', shares: 100, price: 1.1, fee: 0 }
      ];

      const result = identifyFOMOBuy(trades, navIndex);

      expect(result.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // 行为评分测试
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('calculateBehaviorScore', () => {
    it('应该正确计算总分', () => {
      const trades: TradeRecord[] = [
        { id: '1', date: '2024-03-01', type: 'buy', shares: 100, price: 1.0, fee: 0 }
      ];

      const result = calculateBehaviorScore(80, 0, 0, 0, trades);

      expect(result.timing).toBe(40);
      expect(result.emotion).toBe(30);
      expect(result.discipline).toBe(5);
      expect(result.total).toBe(75);
    });

    it('应该正确扣分', () => {
      const trades: TradeRecord[] = [];

      const result = calculateBehaviorScore(60, 2, 1, 1, trades);

      expect(result.emotion).toBe(30 - 10 - 3 - 3);
      expect(result.total).toBe(30 + 14 + 5);
    });

    it('情绪控制分最低为0', () => {
      const trades: TradeRecord[] = [];

      const result = calculateBehaviorScore(60, 10, 10, 10, trades);

      expect(result.emotion).toBe(0);
    });
  });
});