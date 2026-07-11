/**
 * 收益归因计算函数的单元测试
 *
 * 测试范围：
 * 1. 计算盈利和亏损基金的收益占比
 * 2. 所有基金都盈利的情况
 * 3. 所有基金都亏损的情况
 * 4. 所有基金收益为零的情况
 */
import {
  calculateProfitAttribution,
  calculateKPIs,
  calculateMaxDrawdown,
  calculateVolatility,
  countTradingDays,
  calculateVolatilityFromValueWithTrades
} from '../../utils/performanceAttribution';
import { OverallFundRow, OverallProfitPoint, TradeRecord } from '../../types';

describe('calculateProfitAttribution', () => {
  // 测试1：计算盈利和亏损基金的收益占比
  describe('盈利和亏损混合情况', () => {
    it('应正确计算盈利和亏损基金的收益占比', () => {
      const fundRows: OverallFundRow[] = [
        {
          symbol: '001',
          name: '盈利基金A',
          startDate: '2024-01-01',
          profitFrom: 0,
          profitTo: 1000,
          profitDiff: 1000, // 盈利1000
        },
        {
          symbol: '002',
          name: '亏损基金B',
          startDate: '2024-01-01',
          profitFrom: 0,
          profitTo: -500,
          profitDiff: -500, // 亏损500
        },
        {
          symbol: '003',
          name: '盈利基金C',
          startDate: '2024-01-01',
          profitFrom: 0,
          profitTo: 500,
          profitDiff: 500, // 盈利500
        },
      ];

      const result = calculateProfitAttribution(fundRows);

      // 总绝对收益 = |1000| + |-500| + |500| = 2000
      expect(result.totalAbsoluteProfit).toBe(2000);
      expect(result.funds).toHaveLength(3);

      // 验证盈利基金A
      const fundA = result.funds.find(f => f.symbol === '001');
      expect(fundA).toBeDefined();
      expect(fundA!.profit).toBe(1000);
      expect(fundA!.profitShare).toBe(50); // 1000/2000 * 100 = 50%
      expect(fundA!.isProfit).toBe(true);

      // 验证亏损基金B
      const fundB = result.funds.find(f => f.symbol === '002');
      expect(fundB).toBeDefined();
      expect(fundB!.profit).toBe(-500);
      expect(fundB!.profitShare).toBe(25); // 500/2000 * 100 = 25%
      expect(fundB!.isProfit).toBe(false);

      // 验证盈利基金C
      const fundC = result.funds.find(f => f.symbol === '003');
      expect(fundC).toBeDefined();
      expect(fundC!.profit).toBe(500);
      expect(fundC!.profitShare).toBe(25); // 500/2000 * 100 = 25%
      expect(fundC!.isProfit).toBe(true);
    });
  });

  // 测试2：所有基金都盈利的情况
  describe('所有基金都盈利', () => {
    it('应正确计算所有盈利基金的收益占比', () => {
      const fundRows: OverallFundRow[] = [
        {
          symbol: '001',
          name: '基金A',
          startDate: '2024-01-01',
          profitFrom: 0,
          profitTo: 300,
          profitDiff: 300,
        },
        {
          symbol: '002',
          name: '基金B',
          startDate: '2024-01-01',
          profitFrom: 0,
          profitTo: 700,
          profitDiff: 700,
        },
      ];

      const result = calculateProfitAttribution(fundRows);

      // 总绝对收益 = 300 + 700 = 1000
      expect(result.totalAbsoluteProfit).toBe(1000);
      expect(result.funds).toHaveLength(2);

      // 验证所有基金都是盈利状态
      result.funds.forEach(fund => {
        expect(fund.isProfit).toBe(true);
        expect(fund.profit).toBeGreaterThan(0);
      });

      // 验证占比之和为100%
      const totalShare = result.funds.reduce((sum, f) => sum + f.profitShare, 0);
      expect(totalShare).toBeCloseTo(100, 1);

      // 验证基金A占比
      const fundA = result.funds.find(f => f.symbol === '001');
      expect(fundA!.profitShare).toBe(30); // 300/1000 * 100 = 30%

      // 验证基金B占比
      const fundB = result.funds.find(f => f.symbol === '002');
      expect(fundB!.profitShare).toBe(70); // 700/1000 * 100 = 70%
    });
  });

  // 测试3：所有基金都亏损的情况
  describe('所有基金都亏损', () => {
    it('应正确计算所有亏损基金的收益占比', () => {
      const fundRows: OverallFundRow[] = [
        {
          symbol: '001',
          name: '基金A',
          startDate: '2024-01-01',
          profitFrom: 0,
          profitTo: -400,
          profitDiff: -400,
        },
        {
          symbol: '002',
          name: '基金B',
          startDate: '2024-01-01',
          profitFrom: 0,
          profitTo: -600,
          profitDiff: -600,
        },
      ];

      const result = calculateProfitAttribution(fundRows);

      // 总绝对收益 = |-400| + |-600| = 1000
      expect(result.totalAbsoluteProfit).toBe(1000);
      expect(result.funds).toHaveLength(2);

      // 验证所有基金都是亏损状态
      result.funds.forEach(fund => {
        expect(fund.isProfit).toBe(false);
        expect(fund.profit).toBeLessThan(0);
      });

      // 验证占比之和为100%
      const totalShare = result.funds.reduce((sum, f) => sum + f.profitShare, 0);
      expect(totalShare).toBeCloseTo(100, 1);

      // 验证基金A占比
      const fundA = result.funds.find(f => f.symbol === '001');
      expect(fundA!.profitShare).toBe(40); // 400/1000 * 100 = 40%

      // 验证基金B占比
      const fundB = result.funds.find(f => f.symbol === '002');
      expect(fundB!.profitShare).toBe(60); // 600/1000 * 100 = 60%
    });
  });

  // 测试4：所有基金收益为零的情况
  describe('所有基金收益为零', () => {
    it('应正确处理所有基金收益为零的情况', () => {
      const fundRows: OverallFundRow[] = [
        {
          symbol: '001',
          name: '基金A',
          startDate: '2024-01-01',
          profitFrom: 0,
          profitTo: 0,
          profitDiff: 0,
        },
        {
          symbol: '002',
          name: '基金B',
          startDate: '2024-01-01',
          profitFrom: 0,
          profitTo: 0,
          profitDiff: 0,
        },
      ];

      const result = calculateProfitAttribution(fundRows);

      // 总绝对收益为0
      expect(result.totalAbsoluteProfit).toBe(0);
      expect(result.funds).toHaveLength(2);

      // 验证所有基金的占比都为0
      result.funds.forEach(fund => {
        expect(fund.profitShare).toBe(0);
        expect(fund.profit).toBe(0);
        expect(fund.isProfit).toBe(false); // 0被视为非盈利
      });
    });

    it('应正确处理单个基金收益为零的情况', () => {
      const fundRows: OverallFundRow[] = [
        {
          symbol: '001',
          name: '零收益基金',
          startDate: '2024-01-01',
          profitFrom: 0,
          profitTo: 0,
          profitDiff: 0,
        },
        {
          symbol: '002',
          name: '盈利基金',
          startDate: '2024-01-01',
          profitFrom: 0,
          profitTo: 1000,
          profitDiff: 1000,
        },
      ];

      const result = calculateProfitAttribution(fundRows);

      // 总绝对收益 = |0| + |1000| = 1000
      expect(result.totalAbsoluteProfit).toBe(1000);
      expect(result.funds).toHaveLength(2);

      // 验证零收益基金
      const zeroFund = result.funds.find(f => f.symbol === '001');
      expect(zeroFund!.profitShare).toBe(0);
      expect(zeroFund!.profit).toBe(0);
      expect(zeroFund!.isProfit).toBe(false);

      // 验证盈利基金
      const profitFund = result.funds.find(f => f.symbol === '002');
      expect(profitFund!.profitShare).toBe(100);
      expect(profitFund!.profit).toBe(1000);
      expect(profitFund!.isProfit).toBe(true);
    });
  });

  // 边界情况测试
  describe('边界情况', () => {
    it('应正确处理空数组输入', () => {
      const result = calculateProfitAttribution([]);

      expect(result.totalAbsoluteProfit).toBe(0);
      expect(result.funds).toHaveLength(0);
    });

    it('应正确处理null或undefined输入', () => {
      const resultNull = calculateProfitAttribution(null as any);
      expect(resultNull.totalAbsoluteProfit).toBe(0);
      expect(resultNull.funds).toHaveLength(0);

      const resultUndefined = calculateProfitAttribution(undefined as any);
      expect(resultUndefined.totalAbsoluteProfit).toBe(0);
      expect(resultUndefined.funds).toHaveLength(0);
    });

    it('应正确处理profitDiff为undefined或null的基金', () => {
      const fundRows: OverallFundRow[] = [
        {
          symbol: '001',
          name: '基金A',
          startDate: '2024-01-01',
          profitFrom: 0,
          profitTo: 500,
          profitDiff: 500,
        },
        {
          symbol: '002',
          name: '基金B（无profitDiff）',
          startDate: '2024-01-01',
          profitFrom: 0,
          profitTo: 0,
          // profitDiff未定义
        },
      ];

      const result = calculateProfitAttribution(fundRows);

      // 总绝对收益 = |500| + |0| = 500
      expect(result.totalAbsoluteProfit).toBe(500);
      expect(result.funds).toHaveLength(2);

      // 验证基金A
      const fundA = result.funds.find(f => f.symbol === '001');
      expect(fundA!.profitShare).toBe(100);

      // 验证基金B（无profitDiff）
      const fundB = result.funds.find(f => f.symbol === '002');
      expect(fundB!.profit).toBe(0);
      expect(fundB!.profitShare).toBe(0);
    });

    it('应正确保留基金名称', () => {
      const fundRows: OverallFundRow[] = [
        {
          symbol: '001',
          name: '测试基金A',
          startDate: '2024-01-01',
          profitFrom: 0,
          profitTo: 100,
          profitDiff: 100,
        },
        {
          symbol: '002',
          // name未定义
          startDate: '2024-01-01',
          profitFrom: 0,
          profitTo: -100,
          profitDiff: -100,
        },
      ];

      const result = calculateProfitAttribution(fundRows);

      expect(result.funds[0].name).toBe('测试基金A');
      expect(result.funds[1].name).toBeUndefined();
    });

    it('应正确处理极小数值（浮点精度）', () => {
      const fundRows: OverallFundRow[] = [
        {
          symbol: '001',
          name: '基金A',
          startDate: '2024-01-01',
          profitFrom: 0,
          profitTo: 0.333,
          profitDiff: 0.333,
        },
        {
          symbol: '002',
          name: '基金B',
          startDate: '2024-01-01',
          profitFrom: 0,
          profitTo: 0.667,
          profitDiff: 0.667,
        },
      ];

      const result = calculateProfitAttribution(fundRows);

      // 总绝对收益应约为1.0
      expect(result.totalAbsoluteProfit).toBeCloseTo(1.0, 3);

      // 验证占比（允许浮点误差）
      const totalShare = result.funds.reduce((sum, f) => sum + f.profitShare, 0);
      expect(totalShare).toBeCloseTo(100, 1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// KPI 计算函数的单元测试
// ═══════════════════════════════════════════════════════════════════════════════

describe('calculateKPIs', () => {
  // 测试1：年化收益率计算
  describe('年化收益率计算', () => {
    it('应正确计算年化收益率', () => {
      // 252个交易日，总收益率50%，初始资金10000
      const timeline: OverallProfitPoint[] = createTimeline(252, 0, 5000);

      const result = calculateKPIs(timeline, 0.03, 10000);

      // 年化收益率 = (5000/10000) × (252/252) × 100% = 50%
      expect(result.annualizedReturn).toBeCloseTo(50, 2);
    });

    it('应正确计算部分年份的年化收益率', () => {
      // 126个交易日（半年），总收益率25%，初始资金10000
      const timeline: OverallProfitPoint[] = createTimeline(126, 0, 2500);

      const result = calculateKPIs(timeline, 0.03, 10000);

      // 年化收益率 = (2500/10000) × (252/126) × 100% = 25% × 2 = 50%
      expect(result.annualizedReturn).toBeCloseTo(50, 2);
    });

    it('应正确计算负收益的年化收益率', () => {
      // 252个交易日，总收益率-20%，初始资金10000
      const timeline: OverallProfitPoint[] = createTimeline(252, 0, -2000);

      const result = calculateKPIs(timeline, 0.03, 10000);

      // 年化收益率 = (-2000/10000) × (252/252) × 100% = -20%
      expect(result.annualizedReturn).toBeCloseTo(-20, 2);
    });
  });

  // 测试2：最大回撤计算
  describe('最大回撤计算', () => {
    it('应正确计算最大回撤', () => {
      // 创建一个有回撤的时间线：0 -> 1000 -> 800 -> 1200
      const timeline: OverallProfitPoint[] = [
        { date: '2024-01-01', cumulativeProfit: 0, dailyProfit: 0 },
        { date: '2024-01-02', cumulativeProfit: 1000, dailyProfit: 1000 },
        { date: '2024-01-03', cumulativeProfit: 800, dailyProfit: -200 },
        { date: '2024-01-04', cumulativeProfit: 1200, dailyProfit: 400 },
      ];

      const result = calculateKPIs(timeline, 0.03, 10000);

      // 最大回撤 = (1000 - 800) / 1000 × 100% = 20%
      expect(result.maxDrawdown).toBeCloseTo(20, 2);
    });

    it('应正确计算多个回撤峰值', () => {
      // 创建多个回撤：0 -> 1500 -> 1200 -> 1800 -> 900
      const timeline: OverallProfitPoint[] = [
        { date: '2024-01-01', cumulativeProfit: 0, dailyProfit: 0 },
        { date: '2024-01-02', cumulativeProfit: 1500, dailyProfit: 1500 },
        { date: '2024-01-03', cumulativeProfit: 1200, dailyProfit: -300 },
        { date: '2024-01-04', cumulativeProfit: 1800, dailyProfit: 600 },
        { date: '2024-01-05', cumulativeProfit: 900, dailyProfit: -900 },
      ];

      const result = calculateKPIs(timeline, 0.03, 10000);

      // 最大回撤 = max(20%, 50%) = 50% (从1800到900)
      expect(result.maxDrawdown).toBeCloseTo(50, 2);
    });

    it('应正确处理持续增长无回撤的情况', () => {
      // 持续增长：0 -> 500 -> 1000 -> 1500
      const timeline: OverallProfitPoint[] = [
        { date: '2024-01-01', cumulativeProfit: 0, dailyProfit: 0 },
        { date: '2024-01-02', cumulativeProfit: 500, dailyProfit: 500 },
        { date: '2024-01-03', cumulativeProfit: 1000, dailyProfit: 500 },
        { date: '2024-01-04', cumulativeProfit: 1500, dailyProfit: 500 },
      ];

      const result = calculateKPIs(timeline, 0.03, 10000);

      // 无回撤，最大回撤为0
      expect(result.maxDrawdown).toBe(0);
    });
  });

  // 测试3：波动率计算
  describe('波动率计算', () => {
    it('应正确计算波动率', () => {
      // 创建一个有波动的时间线（日收益率有一定波动）
      const timeline: OverallProfitPoint[] = [
        { date: '2024-01-01', cumulativeProfit: 0, dailyProfit: 0 },
        { date: '2024-01-02', cumulativeProfit: 100, dailyProfit: 100 },
        { date: '2024-01-03', cumulativeProfit: 180, dailyProfit: 80 },
        { date: '2024-01-04', cumulativeProfit: 260, dailyProfit: 80 },
        { date: '2024-01-05', cumulativeProfit: 360, dailyProfit: 100 },
      ];

      const result = calculateKPIs(timeline, 0.03, 10000);

      // 波动率应大于0
      expect(result.volatility).toBeGreaterThan(0);
      // 波动率应该是合理的范围（对于这些数据，年化波动率可能在几百）
      expect(result.volatility).toBeLessThan(1000);
    });

    it('应正确处理所有日收益相同的零波动情况', () => {
      // 所有日收益率相同的时间线（零波动）
      const timeline: OverallProfitPoint[] = [
        { date: '2024-01-01', cumulativeProfit: 0, dailyProfit: 100 },
        { date: '2024-01-02', cumulativeProfit: 100, dailyProfit: 100 },
        { date: '2024-01-03', cumulativeProfit: 200, dailyProfit: 100 },
        { date: '2024-01-04', cumulativeProfit: 300, dailyProfit: 100 },
      ];

      const result = calculateKPIs(timeline, 0.03, 10000);

      // 所有dailyProfit相同，波动率为0
      expect(result.volatility).toBe(0);
      expect(result.sharpeRatio).toBeNull();
    });
  });

  // 测试4：夏普比率计算
  describe('夏普比率计算', () => {
    it('应正确计算夏普比率', () => {
      // 使用足够多的数据来计算夏普比率
      const timeline: OverallProfitPoint[] = createTimeline(252, 0, 5000);

      const result = calculateKPIs(timeline, 0.03, 10000);

      // 夏普比率 = (年化收益率 - 无风险利率) / 波动率
      expect(result.sharpeRatio).toBeDefined();
      // 年化收益率50%，无风险利率3%，夏普比率应为正数
      expect(result.sharpeRatio).toBeGreaterThan(0);
    });
  });

  // 测试5：卡玛比率计算
  describe('卡玛比率计算', () => {
    it('应正确计算卡玛比率', () => {
      // 有回撤的时间线
      const timeline: OverallProfitPoint[] = [
        { date: '2024-01-01', cumulativeProfit: 0, dailyProfit: 0 },
        { date: '2024-01-02', cumulativeProfit: 1000, dailyProfit: 1000 },
        { date: '2024-01-03', cumulativeProfit: 800, dailyProfit: -200 },
        { date: '2024-01-04', cumulativeProfit: 1500, dailyProfit: 700 },
      ];

      const result = calculateKPIs(timeline, 0.03, 10000);

      // 卡玛比率 = 年化收益率 / |最大回撤|
      expect(result.calmarRatio).toBeDefined();
      // 最大回撤20%，年化收益率应该为正，卡玛比率为正
      expect(result.calmarRatio).toBeGreaterThan(0);
    });

    it('当最大回撤为零时应返回null', () => {
      // 持续增长，无回撤
      const timeline: OverallProfitPoint[] = [
        { date: '2024-01-01', cumulativeProfit: 0, dailyProfit: 0 },
        { date: '2024-01-02', cumulativeProfit: 500, dailyProfit: 500 },
        { date: '2024-01-03', cumulativeProfit: 1000, dailyProfit: 500 },
        { date: '2024-01-04', cumulativeProfit: 1500, dailyProfit: 500 },
      ];

      const result = calculateKPIs(timeline, 0.03, 10000);

      // 最大回撤为0时，卡玛比率无法计算，应为null
      expect(result.maxDrawdown).toBe(0);
      expect(result.calmarRatio).toBeNull();
    });
  });

  // 测试6：边缘情况
  describe('边缘情况', () => {
    it('应正确处理空时间线', () => {
      const result = calculateKPIs([], 0.03, 10000);

      expect(result.annualizedReturn).toBeNull();
      expect(result.maxDrawdown).toBeNull();
      expect(result.volatility).toBeNull();
      expect(result.sharpeRatio).toBeNull();
      expect(result.calmarRatio).toBeNull();
    });

    it('应正确处理单日时间线', () => {
      const timeline: OverallProfitPoint[] = [
        { date: '2024-01-01', cumulativeProfit: 0, dailyProfit: 0 },
      ];

      const result = calculateKPIs(timeline, 0.03, 10000);

      // 单日无法计算年化收益率
      expect(result.annualizedReturn).toBeNull();
      // 单日无法计算波动率
      expect(result.volatility).toBeNull();
      expect(result.sharpeRatio).toBeNull();
    });

    it('应正确处理零初始资金', () => {
      const timeline: OverallProfitPoint[] = createTimeline(252, 0, 5000);

      const result = calculateKPIs(timeline, 0.03, 0);

      // 初始资金为0，无法计算年化收益率
      expect(result.annualizedReturn).toBeNull();
    });

    it('应使用默认无风险利率', () => {
      const timeline: OverallProfitPoint[] = createTimeline(252, 0, 5000);

      // 不传入riskFreeRate参数
      const result = calculateKPIs(timeline, undefined, 10000);

      // 应使用默认值3%
      expect(result.sharpeRatio).toBeDefined();
      expect(result.sharpeRatio).toBeGreaterThan(0);
    });

    it('应使用默认初始资金', () => {
      const timeline: OverallProfitPoint[] = createTimeline(252, 0, 5000);

      // 不传入initialCapital参数
      const result = calculateKPIs(timeline, 0.03);

      // 应使用默认值
      expect(result.annualizedReturn).toBeDefined();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 辅助函数的单元测试
// ═══════════════════════════════════════════════════════════════════════════════

describe('calculateMaxDrawdown', () => {
  it('应正确计算最大回撤', () => {
    const timeline: OverallProfitPoint[] = [
      { date: '2024-01-01', cumulativeProfit: 0, dailyProfit: 0 },
      { date: '2024-01-02', cumulativeProfit: 1000, dailyProfit: 1000 },
      { date: '2024-01-03', cumulativeProfit: 800, dailyProfit: -200 },
      { date: '2024-01-04', cumulativeProfit: 1200, dailyProfit: 400 },
    ];

    const drawdown = calculateMaxDrawdown(timeline);
    expect(drawdown).toBeCloseTo(20, 2);
  });

  it('应正确处理空时间线', () => {
    const drawdown = calculateMaxDrawdown([]);
    expect(drawdown).toBe(0);
  });

  it('应正确处理单点时间线', () => {
    const timeline: OverallProfitPoint[] = [
      { date: '2024-01-01', cumulativeProfit: 1000, dailyProfit: 1000 },
    ];

    const drawdown = calculateMaxDrawdown(timeline);
    expect(drawdown).toBe(0);
  });
});

describe('calculateVolatility', () => {
  it('应正确计算波动率', () => {
    const timeline: OverallProfitPoint[] = [
      { date: '2024-01-01', cumulativeProfit: 0, dailyProfit: 0 },
      { date: '2024-01-02', cumulativeProfit: 100, dailyProfit: 100 },
      { date: '2024-01-03', cumulativeProfit: 180, dailyProfit: 80 },
      { date: '2024-01-04', cumulativeProfit: 260, dailyProfit: 80 },
    ];

    const volatility = calculateVolatility(timeline, 10000);
    expect(volatility).toBeGreaterThanOrEqual(0);
  });

  it('应正确处理空时间线', () => {
    const volatility = calculateVolatility([]);
    expect(volatility).toBe(0);
  });

  it('应正确处理单点时间线', () => {
    const timeline: OverallProfitPoint[] = [
      { date: '2024-01-01', cumulativeProfit: 0, dailyProfit: 0 },
    ];

    const volatility = calculateVolatility(timeline);
    expect(volatility).toBe(0);
  });

  it('应正确处理零初始资金', () => {
    const timeline: OverallProfitPoint[] = [
      { date: '2024-01-01', cumulativeProfit: 0, dailyProfit: 0 },
      { date: '2024-01-02', cumulativeProfit: 100, dailyProfit: 100 },
    ];

    const volatility = calculateVolatility(timeline, 0);
    expect(volatility).toBe(0);
  });
});

describe('countTradingDays', () => {
  it('应正确计算交易日数', () => {
    const timeline: OverallProfitPoint[] = [
      { date: '2024-01-01', cumulativeProfit: 0, dailyProfit: 0 },
      { date: '2024-01-02', cumulativeProfit: 100, dailyProfit: 100 },
      { date: '2024-01-03', cumulativeProfit: 200, dailyProfit: 100 },
    ];

    const days = countTradingDays(timeline);
    expect(days).toBe(3);
  });

  it('应正确处理空时间线', () => {
    const days = countTradingDays([]);
    expect(days).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 创建测试用的时间线数据
 * @param days - 交易日数
 * @param startProfit - 起始累计盈利
 * @param endProfit - 结束累计盈利
 * @returns 时间线数据
 */
function createTimeline(days: number, startProfit: number, endProfit: number): OverallProfitPoint[] {
  const timeline: OverallProfitPoint[] = [];

  // 如果只有一天，特殊处理
  if (days === 1) {
    timeline.push({
      date: '2024-01-01',
      cumulativeProfit: endProfit,
      dailyProfit: endProfit - startProfit,
    });
    return timeline;
  }

  // 计算每日盈利增量
  const dailyProfitIncrement = (endProfit - startProfit) / (days - 1);

  for (let i = 0; i < days; i++) {
    const date = new Date(2024, 0, i + 1).toISOString().split('T')[0];
    const cumulativeProfit = startProfit + dailyProfitIncrement * i;
    const dailyProfit = i === 0 ? cumulativeProfit - startProfit : dailyProfitIncrement;

    timeline.push({
      date,
      cumulativeProfit,
      dailyProfit,
    });
  }

  return timeline;
}

// ═══════════════════════════════════════════════════════════════════════════════
// calculateVolatilityFromValueWithTrades 的单元测试（考虑现金流影响）
// ═══════════════════════════════════════════════════════════════════════════════

describe('calculateVolatilityFromValueWithTrades', () => {
  describe('现金流符号处理', () => {
    it('买入应视为正现金流（资金投入组合）', () => {
      // 场景：第一天市值10000，第二天买入11000，市值变为21000
      // 实际收益 = (21000 - 10000 - 11000) / 10000 = 0
      // 波动率应该为0（无真实收益波动）
      const dailyValues = [
        { date: '2024-01-01', value: 10000 },
        { date: '2024-01-02', value: 21000 },
      ];
      const trades: TradeRecord[] = [
        { id: '1', date: '2024-01-02', type: 'buy', shares: 1000, price: 11, fee: 0, total: 11000 },
      ];

      const volatility = calculateVolatilityFromValueWithTrades(dailyValues, trades);

      // 买入导致的市值增加不应计入收益波动
      expect(volatility).toBe(0);
    });

    it('卖出应视为负现金流（资金从组合取出）', () => {
      // 场景：第一天市值20000，第二天卖出10000，市值变为10000
      // 实际收益 = (10000 - 20000 - (-10000)) / 20000 = 0
      // 波动率应该为0（无真实收益波动）
      const dailyValues = [
        { date: '2024-01-01', value: 20000 },
        { date: '2024-01-02', value: 10000 },
      ];
      const trades: TradeRecord[] = [
        { id: '1', date: '2024-01-02', type: 'sell', shares: 1000, price: 10, fee: 0, total: 10000 },
      ];

      const volatility = calculateVolatilityFromValueWithTrades(dailyValues, trades);

      // 卖出导致的市值减少不应计入收益波动
      expect(volatility).toBe(0);
    });

    it('大额买入不应导致异常高的日收益率', () => {
      // 场景：模拟用户遇到的问题 - 连续大额买入
      // 5/25: 市值12022（初始）
      // 5/26: 买入11000，市值变为22947，真实收益约4255
      // 真实收益率 = 4255 / 12022 ≈ 35%，而不是 182%
      const dailyValues = [
        { date: '2026-05-25', value: 12022 },
        { date: '2026-05-26', value: 22947 },
      ];
      const trades: TradeRecord[] = [
        { id: '1', date: '2026-05-26', type: 'buy', shares: 6500, price: 1.68, fee: 11, total: 10925 },
      ];

      const volatility = calculateVolatilityFromValueWithTrades(dailyValues, trades);

      // 波动率应该在正常范围内（年化波动率通常不超过50%）
      // 如果现金流符号错误，波动率会异常高（>100%）
      expect(volatility).toBeLessThan(50);
    });
  });

  describe('正常市场波动', () => {
    it('无交易时应正确计算市值波动', () => {
      // 场景：市值每天变化1%，无交易
      const dailyValues = [
        { date: '2024-01-01', value: 10000 },
        { date: '2024-01-02', value: 10100 }, // +1%
        { date: '2024-01-03', value: 10000 }, // -1%
        { date: '2024-01-04', value: 10200 }, // +2%
      ];

      const volatility = calculateVolatilityFromValueWithTrades(dailyValues, []);

      // 应有波动率，且在正常范围
      expect(volatility).toBeGreaterThan(0);
      expect(volatility).toBeLessThan(100);
    });

    it('有真实收益波动时应正确计算', () => {
      // 场景：市值变化包含真实收益波动和现金流
      // Day1: 10000
      // Day2: 买入5000，市值15000，真实收益-100（15000 - 10000 - 5000 - 100）
      // Day3: 无交易，市值15100，真实收益+100
      const dailyValues = [
        { date: '2024-01-01', value: 10000 },
        { date: '2024-01-02', value: 15000 },
        { date: '2024-01-03', value: 15100 },
      ];
      const trades: TradeRecord[] = [
        { id: '1', date: '2024-01-02', type: 'buy', shares: 500, price: 10, fee: 0, total: 5000 },
      ];

      const volatility = calculateVolatilityFromValueWithTrades(dailyValues, trades);

      // 应有波动率（真实收益在波动）
      expect(volatility).toBeGreaterThan(0);
    });
  });

  describe('边界情况', () => {
    it('应正确处理空数据', () => {
      const volatility = calculateVolatilityFromValueWithTrades([], []);
      expect(volatility).toBe(0);
    });

    it('应正确处理单日数据', () => {
      const dailyValues = [
        { date: '2024-01-01', value: 10000 },
      ];
      const volatility = calculateVolatilityFromValueWithTrades(dailyValues, []);
      expect(volatility).toBe(0);
    });

    it('应过滤异常收益率', () => {
      // 场景：包含一个异常高的收益率（可能数据错误），但有多个正常收益率
      const dailyValues = [
        { date: '2024-01-01', value: 10000 },
        { date: '2024-01-02', value: 20000 }, // +100%（无交易，异常，会被过滤）
        { date: '2024-01-03', value: 20100 }, // +0.5%（正常）
        { date: '2024-01-04', value: 20200 }, // +0.5%（正常）
      ];

      const volatility = calculateVolatilityFromValueWithTrades(dailyValues, []);

      // 100%的日收益率应该被过滤掉（>30%阈值）
      // 剩下的正常收益率应该产生合理的波动率
      expect(volatility).toBeGreaterThan(0);
      expect(volatility).toBeLessThan(50);
    });

    it('应正确处理手续费', () => {
      // 买入含手续费
      const dailyValues = [
        { date: '2024-01-01', value: 10000 },
        { date: '2024-01-02', value: 21012 }, // 买入10000+12手续费
      ];
      const trades: TradeRecord[] = [
        { id: '1', date: '2024-01-02', type: 'buy', shares: 1000, price: 10, fee: 12, total: 10012 },
      ];

      // 真实收益 = 21012 - 10000 - 10012 = 0
      const volatility = calculateVolatilityFromValueWithTrades(dailyValues, trades);
      expect(volatility).toBe(0);
    });
  });
});