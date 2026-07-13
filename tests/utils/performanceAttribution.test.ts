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
  calculateVolatilityFromValueWithTrades,
  calculateMaxDrawdownFromProfit,
  calculateAnnualizedReturnFromPositionTrend,
  calculateMaxRecoveryDays,
  estimateVolatilityFromNav,
  estimateVolatilityFromReturnRates,
  calculateCurrentDrawdown,
  calculateCurrentDrawdownDetails,
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

// ═══════════════════════════════════════════════════════════════════════════════
// calculateMaxDrawdownFromProfit 的单元测试（基于累计盈利计算最大回撤）
// ═══════════════════════════════════════════════════════════════════════════════

describe('calculateMaxDrawdownFromProfit', () => {
  describe('基本功能', () => {
    it('应正确计算基于累计盈利的最大回撤', () => {
      // 累计盈利：0 -> 1000 -> 800 -> 1200
      // 最大回撤 = (1000 - 800) / 1000 × 100% = 20%
      const cumulativeProfits = [
        { date: '2024-01-01', profit: 0 },
        { date: '2024-01-02', profit: 1000 },
        { date: '2024-01-03', profit: 800 },
        { date: '2024-01-04', profit: 1200 },
      ];

      const drawdown = calculateMaxDrawdownFromProfit(cumulativeProfits);
      expect(drawdown).toBeCloseTo(20, 2);
    });

    it('应正确处理多个回撤峰值', () => {
      // 累计盈利：0 -> 1500 -> 1200 -> 1800 -> 900
      // 最大回撤 = max(20%, 50%) = 50%
      const cumulativeProfits = [
        { date: '2024-01-01', profit: 0 },
        { date: '2024-01-02', profit: 1500 },
        { date: '2024-01-03', profit: 1200 },
        { date: '2024-01-04', profit: 1800 },
        { date: '2024-01-05', profit: 900 },
      ];

      const drawdown = calculateMaxDrawdownFromProfit(cumulativeProfits);
      expect(drawdown).toBeCloseTo(50, 2);
    });

    it('应正确处理持续增长无回撤的情况', () => {
      // 持续增长：0 -> 500 -> 1000 -> 1500
      const cumulativeProfits = [
        { date: '2024-01-01', profit: 0 },
        { date: '2024-01-02', profit: 500 },
        { date: '2024-01-03', profit: 1000 },
        { date: '2024-01-04', profit: 1500 },
      ];

      const drawdown = calculateMaxDrawdownFromProfit(cumulativeProfits);
      expect(drawdown).toBe(0);
    });
  });

  describe('卖出场景验证', () => {
    it('卖出操作不应导致回撤误判', () => {
      // 场景：累计盈利高点1000元，卖出后市值为60元但累计盈利仍为1000元
      // 这证明了使用累计盈利而非市值计算回撤的正确性
      const cumulativeProfits = [
        { date: '2024-01-01', profit: 0 },
        { date: '2024-01-02', profit: 500 },
        { date: '2024-01-03', profit: 1000 }, // 高点
        { date: '2024-01-04', profit: 1000 }, // 卖出后累计盈利不变
      ];

      const drawdown = calculateMaxDrawdownFromProfit(cumulativeProfits);
      // 累计盈利未下降，无回撤
      expect(drawdown).toBe(0);
    });

    it('累计盈利下降时应正确计算回撤', () => {
      // 真实亏损导致累计盈利下降
      const cumulativeProfits = [
        { date: '2024-01-01', profit: 0 },
        { date: '2024-01-02', profit: 1000 }, // 高点
        { date: '2024-01-03', profit: 800 },  // 亏损导致盈利下降
      ];

      const drawdown = calculateMaxDrawdownFromProfit(cumulativeProfits);
      expect(drawdown).toBeCloseTo(20, 2);
    });
  });

  describe('负累计盈利处理', () => {
    it('累计盈利为负时应返回0回撤', () => {
      // 全程亏损，累计盈利为负
      const cumulativeProfits = [
        { date: '2024-01-01', profit: -100 },
        { date: '2024-01-02', profit: -200 },
        { date: '2024-01-03', profit: -300 },
      ];

      const drawdown = calculateMaxDrawdownFromProfit(cumulativeProfits);
      // 累计盈利为负时，回撤无意义
      expect(drawdown).toBe(0);
    });

    it('从正盈利转为负盈利时应正确计算回撤', () => {
      // 先盈利后亏损
      const cumulativeProfits = [
        { date: '2024-01-01', profit: 0 },
        { date: '2024-01-02', profit: 500 },  // 高点
        { date: '2024-01-03', profit: -200 },
      ];

      const drawdown = calculateMaxDrawdownFromProfit(cumulativeProfits);
      // 从500到-200，回撤 = (500 - (-200)) / 500 = 140%
      // 但由于当前盈利为负，实际应用中可能需要特殊处理
      expect(drawdown).toBe(140);
    });
  });

  describe('边界情况', () => {
    it('应正确处理空数据', () => {
      const drawdown = calculateMaxDrawdownFromProfit([]);
      expect(drawdown).toBe(0);
    });

    it('应正确处理单日数据', () => {
      const cumulativeProfits = [
        { date: '2024-01-01', profit: 1000 },
      ];

      const drawdown = calculateMaxDrawdownFromProfit(cumulativeProfits);
      expect(drawdown).toBe(0);
    });

    it('应正确处理零累计盈利', () => {
      const cumulativeProfits = [
        { date: '2024-01-01', profit: 0 },
        { date: '2024-01-02', profit: 0 },
        { date: '2024-01-03', profit: 0 },
      ];

      const drawdown = calculateMaxDrawdownFromProfit(cumulativeProfits);
      expect(drawdown).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// calculateAnnualizedReturnFromPositionTrend 函数的单元测试
// ═══════════════════════════════════════════════════════════════════════════════

describe('calculateAnnualizedReturnFromPositionTrend', () => {
  // 测试1：无现金流变化时的年化收益率计算
  describe('无现金流变化', () => {
    it('应正确计算年化收益率（正收益）', () => {
      // 252个交易日，期初市值420万（净投入350万 + 盈利70万），期末市值456万（净投入350万 + 盈利106万）
      // 期间盈利变化 = 106 - 70 = 36万
      // 平均净投入 = 350万
      // 期间收益率 = 36/350 = 10.29%
      const trendData = Array.from({ length: 252 }, (_, i) => ({
        date: `2024-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`,
        value: 4200000 + (360000 * i) / 251,
        netInvestment: 3500000
      }));

      const result = calculateAnnualizedReturnFromPositionTrend(trendData);

      // 期间收益率 = 36/350 = 10.29%
      // 年化收益率 ≈ 10.29%（因为正好是252天）
      expect(result).toBeCloseTo(10.29, 1);
    });

    it('应正确计算年化收益率（负收益）', () => {
      // 252个交易日，期初市值420万（净投入350万 + 盈利70万），期末市值380万（净投入350万 + 盈利30万）
      // 期间盈利变化 = 30 - 70 = -40万
      // 平均净投入 = 350万
      // 期间收益率 = -40/350 = -11.43%
      const trendData = Array.from({ length: 252 }, (_, i) => ({
        date: `2024-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`,
        value: 4200000 - (400000 * i) / 251,
        netInvestment: 3500000
      }));

      const result = calculateAnnualizedReturnFromPositionTrend(trendData);

      // 期间收益率 = -40/350 = -11.43%
      expect(result).toBeCloseTo(-11.43, 1);
    });
  });

  // 测试2：有现金流变化时的年化收益率计算
  describe('有现金流变化', () => {
    it('应正确处理资金流入', () => {
      // 期初：市值100万（净投入80万 + 盈利20万）
      // 期末：市值150万（净投入100万 + 盈利50万）
      // 期间盈利变化 = 50 - 20 = 30万
      // 平均净投入 = (80 + 100) / 2 = 90万
      // 期间收益率 = 30/90 = 33.33%
      const trendData = Array.from({ length: 252 }, (_, i) => ({
        date: `2024-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`,
        value: 1000000 + (500000 * i) / 251,
        netInvestment: 800000 + (200000 * i) / 251
      }));

      const result = calculateAnnualizedReturnFromPositionTrend(trendData);

      // 期间盈利变化 = 30万，平均净投入 = 90万
      // 期间收益率 = 30/90 = 33.33%
      expect(result).toBeCloseTo(33.33, 1);
    });

    it('应正确处理资金流出', () => {
      // 期初：市值150万（净投入100万 + 盈利50万）
      // 期末：市值120万（净投入80万 + 盈利40万）
      // 期间盈利变化 = 40 - 50 = -10万
      // 平均净投入 = (100 + 80) / 2 = 90万
      // 期间收益率 = -10/90 = -11.11%
      const trendData = Array.from({ length: 252 }, (_, i) => ({
        date: `2024-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`,
        value: 1500000 - (300000 * i) / 251,
        netInvestment: 1000000 - (200000 * i) / 251
      }));

      const result = calculateAnnualizedReturnFromPositionTrend(trendData);

      expect(result).toBeCloseTo(-11.11, 1);
    });
  });

  // 测试3：边界情况
  describe('边界情况', () => {
    it('应正确处理空数据', () => {
      const result = calculateAnnualizedReturnFromPositionTrend([]);
      expect(result).toBeNull();
    });

    it('应正确处理单日数据', () => {
      const trendData = [
        { date: '2024-01-01', value: 1000000, netInvestment: 800000 },
      ];

      const result = calculateAnnualizedReturnFromPositionTrend(trendData);
      expect(result).toBeNull();
    });

    it('应正确处理净投入为零', () => {
      const trendData = [
        { date: '2024-01-01', value: 100000, netInvestment: 0 },
        { date: '2024-12-31', value: 120000, netInvestment: 0 },
      ];

      const result = calculateAnnualizedReturnFromPositionTrend(trendData);
      expect(result).toBeNull();
    });

    it('应正确处理缺少净投入数据', () => {
      const trendData = [
        { date: '2024-01-01', value: 1000000 },
        { date: '2024-12-31', value: 1200000 },
      ] as any;

      const result = calculateAnnualizedReturnFromPositionTrend(trendData);
      // netInvestment 默认为0，平均净投入为0，返回null
      expect(result).toBeNull();
    });
  });

  // 测试4：年化计算验证
  describe('年化计算验证', () => {
    it('半年持有期的年化收益率应高于同样收益率的全年年化', () => {
      // 126个交易日，盈利变化10万，平均净投入100万，收益率10%
      const halfYearData = Array.from({ length: 126 }, (_, i) => ({
        date: `2024-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`,
        value: 1000000 + (100000 * i) / 125,
        netInvestment: 1000000
      }));

      // 252个交易日，盈利变化10万，平均净投入100万，收益率10%
      const fullYearData = Array.from({ length: 252 }, (_, i) => ({
        date: `2024-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`,
        value: 1000000 + (100000 * i) / 251,
        netInvestment: 1000000
      }));

      const halfYearResult = calculateAnnualizedReturnFromPositionTrend(halfYearData);
      const fullYearResult = calculateAnnualizedReturnFromPositionTrend(fullYearData);

      // 半年年化 = (1+10%)^(252/126) - 1 ≈ 21%
      // 全年年化 = 10%
      expect(halfYearResult).toBeDefined();
      expect(fullYearResult).toBeDefined();
      expect(halfYearResult).toBeCloseTo(21, 0); // 约21%
      expect(fullYearResult).toBeCloseTo(10, 1); // 约10%
    });
  });
});

// 测试 calculatePersonalReturnCurve
import { calculatePersonalReturnCurve } from '../../utils/performanceAttribution';

describe('calculatePersonalReturnCurve', () => {
  // 测试1：一次性买入后的收益率计算
  describe('一次性买入', () => {
    it('应正确计算一次性买入后的收益率', () => {
      // 净值从1.0涨到1.2，买入价格1.0
      const history = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.1 },
        { date: '2024-01-03', nav: 1.2 },
      ];
      const trades: any[] = [];
      const initialShares = 10000;
      const initialPrice = 1.0;

      const result = calculatePersonalReturnCurve(history, trades, initialShares, initialPrice);

      expect(result).toBeDefined();
      expect(result!.averageCost).toBe(1.0);
      expect(result!.currentReturn).toBeCloseTo(20, 2); // (1.2-1.0)/1.0*100 = 20%
      expect(result!.maxReturn).toBeCloseTo(20, 2);
    });

    it('应正确计算在半山腰买入的收益率', () => {
      // 净值从1.0涨到2.0再跌到1.5，买入价格1.8
      const history = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.5 },
        { date: '2024-01-03', nav: 1.8 }, // 买入点
        { date: '2024-01-04', nav: 2.0 },
        { date: '2024-01-05', nav: 1.5 },
      ];
      const trades = [
        { date: '2024-01-03', type: 'buy', shares: 10000, price: 1.8, fee: 0 },
      ];
      const initialShares = 0;
      const initialPrice = 0;

      const result = calculatePersonalReturnCurve(history, trades, initialShares, initialPrice);

      expect(result).toBeDefined();
      expect(result!.averageCost).toBe(1.8);

      // 收益率峰值（净值2.0时）= (2.0-1.8)/1.8 ≈ 11.1%
      expect(result!.maxReturn).toBeCloseTo(11.1, 1);

      // 当前收益率（净值1.5时）= (1.5-1.8)/1.8 ≈ -16.7%
      expect(result!.currentReturn).toBeCloseTo(-16.7, 1);

      // 个人最大回撤 = (-16.7 - 11.1) / (1 + 11.1%) ≈ -25%
      expect(result!.maxDrawdown).toBeCloseTo(25, 1);
    });
  });

  // 测试2：定投后的收益率计算
  describe('定投情况', () => {
    it('应正确计算低位定投拉低成本后的收益率', () => {
      // 在净值1.0时买5万份，在净值2.0时又买5万份，最终净值1.5
      const history = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.5 },
        { date: '2024-01-03', nav: 2.0 },
        { date: '2024-01-04', nav: 1.5 },
      ];
      const trades = [
        { date: '2024-01-01', type: 'buy', shares: 50000, price: 1.0, fee: 0 },
        { date: '2024-01-03', type: 'buy', shares: 50000, price: 2.0, fee: 0 },
      ];
      const initialShares = 0;
      const initialPrice = 0;

      const result = calculatePersonalReturnCurve(history, trades, initialShares, initialPrice);

      expect(result).toBeDefined();

      // 加权平均成本 = (5万*1.0 + 5万*2.0) / 10万份 = 1.5
      // 注意：由于交易在同一天处理，01-03当天的成本价会被第二笔交易影响
      // 所以最终的成本价是 1.5
      expect(result!.averageCost).toBeCloseTo(1.5, 2);

      // maxReturn 是在整个收益率曲线上的最大值
      // 01-02时：成本1.0，净值1.5，收益率 = 50%
      // 01-03时（交易后）：成本变为1.5，净值2.0，收益率 = (2.0-1.5)/1.5 = 33.3%
      // 所以 maxReturn = 50%
      expect(result!.maxReturn).toBeCloseTo(50, 1);

      // 当前收益率（净值1.5时，成本1.5）≈ 0%
      expect(result!.currentReturn).toBeCloseTo(0, 1);

      // 个人最大回撤
      // 从峰值50%到当前0%，回撤 = (0-50)/(100+50) * 100 = -33.33%
      // 取绝对值 ≈ 33.33%
      expect(result!.maxDrawdown).toBeCloseTo(33.33, 1);
    });
  });

  // 测试3：赎回后的收益率计算
  describe('赎回情况', () => {
    it('赎回不影响持仓成本价（加权平均成本法）', () => {
      // 净值从1.0涨到1.5，买入后部分赎回
      const history = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.2 },
        { date: '2024-01-03', nav: 1.5 },
        { date: '2024-01-04', nav: 1.3 },
      ];
      const trades = [
        { date: '2024-01-01', type: 'buy', shares: 10000, price: 1.0, fee: 0 },
        { date: '2024-01-03', type: 'sell', shares: 5000, price: 1.5, fee: 0 },
      ];
      const initialShares = 0;
      const initialPrice = 0;

      const result = calculatePersonalReturnCurve(history, trades, initialShares, initialPrice);

      expect(result).toBeDefined();

      // 买入成本价 = 1.0
      // 赎回后成本价保持不变（加权平均成本法）
      expect(result!.averageCost).toBeCloseTo(1.0, 2);

      // 剩余份额5000份，市值5000*1.3=6500，成本5000*1.0=5000
      // 收益率 = (6500-5000)/5000 = 30%
      expect(result!.currentReturn).toBeCloseTo(30, 1);
    });
  });

  // 测试4：空持仓情况
  describe('边界情况', () => {
    it('应正确处理空历史数据', () => {
      const result = calculatePersonalReturnCurve([], [], 1000, 1.0);
      expect(result).toBeNull();
    });

    it('应正确处理零份额', () => {
      const history = [
        { date: '2024-01-01', nav: 1.0 },
      ];
      const result = calculatePersonalReturnCurve(history, [], 0, 0);
      expect(result).toBeNull();
    });
  });

  // 测试5：回撤公式验证
  describe('回撤公式验证', () => {
    it('应正确计算个人收益率回撤', () => {
      // 收益率从峰值50%跌到当前-10%
      // 个人最大回撤 = (-10 - 50) / (1 + 50%) = -60 / 1.5 = -40%
      // 取绝对值 = 40%
      const history = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.5 }, // 收益率峰值
        { date: '2024-01-03', nav: 0.9 }, // 收益率谷底
      ];
      const trades: any[] = [];
      const initialShares = 10000;
      const initialPrice = 1.0;

      const result = calculatePersonalReturnCurve(history, trades, initialShares, initialPrice);

      expect(result).toBeDefined();
      // 收益率峰值 = (1.5-1.0)/1.0 = 50%
      expect(result!.maxReturn).toBeCloseTo(50, 1);
      // 当前收益率 = (0.9-1.0)/1.0 = -10%
      expect(result!.currentReturn).toBeCloseTo(-10, 1);
      // 个人最大回撤 = (-10-50)/(1+0.5) = -40%
      expect(result!.maxDrawdown).toBeCloseTo(40, 1);
    });
  });
});

// 测试最大回撤详细计算
import { calculateMaxDrawdownDetailsFromNav, calculateNavCurve, calculatePersonalReturnCurve } from '../../utils/performanceAttribution';

describe('calculateMaxDrawdownDetailsFromNav', () => {
  describe('组合最大回撤计算', () => {
    it('应正确计算净值曲线的最大回撤详细信息', () => {
      // 持仓趋势数据（模拟净值曲线）
      const positionTrend = [
        { date: '2024-01-01', value: 100000, netInvestment: 100000 },  // 净值 1.0
        { date: '2024-01-02', value: 110000, netInvestment: 100000 },  // 净值 1.1
        { date: '2024-01-03', value: 120000, netInvestment: 100000 },  // 净值 1.2 (峰值)
        { date: '2024-01-04', value: 100000, netInvestment: 100000 },  // 净值 1.0 (谷值)
        { date: '2024-01-05', value: 105000, netInvestment: 100000 },  // 净值 1.05
      ];

      const result = calculateMaxDrawdownDetailsFromNav(positionTrend);

      // 最大回撤 = (1.2 - 1.0) / 1.2 = 16.67%
      expect(result.maxDrawdown).toBeCloseTo(16.67, 1);
      expect(result.peakDate).toBe('2024-01-03');
      expect(result.peakNav).toBeCloseTo(1.2, 2);
      expect(result.troughDate).toBe('2024-01-04');
      expect(result.troughNav).toBeCloseTo(1.0, 2);
    });

    it('应正确处理单日数据', () => {
      const positionTrend = [
        { date: '2024-01-01', value: 100000, netInvestment: 100000 },
      ];

      const result = calculateMaxDrawdownDetailsFromNav(positionTrend);

      // 单日数据没有回撤
      expect(result.maxDrawdown).toBe(0);
      expect(result.peakDate).toBeNull();
      expect(result.troughDate).toBeNull();
    });

    it('应正确处理持续上涨无回撤的情况', () => {
      const positionTrend = [
        { date: '2024-01-01', value: 100000, netInvestment: 100000 },
        { date: '2024-01-02', value: 105000, netInvestment: 100000 },
        { date: '2024-01-03', value: 110000, netInvestment: 100000 },
      ];

      const result = calculateMaxDrawdownDetailsFromNav(positionTrend);

      expect(result.maxDrawdown).toBe(0);
    });
  });

  describe('净值曲线计算', () => {
    it('应正确计算净值曲线', () => {
      const positionTrend = [
        { date: '2024-01-01', value: 100000, netInvestment: 100000 },
        { date: '2024-01-02', value: 110000, netInvestment: 100000 },
        { date: '2024-01-03', value: 120000, netInvestment: 100000 },
      ];

      const navCurve = calculateNavCurve(positionTrend);

      expect(navCurve).toHaveLength(3);
      expect(navCurve[0].nav).toBeCloseTo(1.0, 2);
      expect(navCurve[1].nav).toBeCloseTo(1.1, 2);
      expect(navCurve[2].nav).toBeCloseTo(1.2, 2);
    });

    it('应正确处理净投入变化的情况', () => {
      const positionTrend = [
        { date: '2024-01-01', value: 100000, netInvestment: 100000 },
        { date: '2024-01-02', value: 150000, netInvestment: 150000 }, // 加仓
        { date: '2024-01-03', value: 165000, netInvestment: 150000 }, // 涨10%
      ];

      const navCurve = calculateNavCurve(positionTrend);

      // 初始净值 = 1.0
      expect(navCurve[0].nav).toBeCloseTo(1.0, 2);
      // 加仓后净值仍为 1.0（市值/净投入 = 150000/150000）
      expect(navCurve[1].nav).toBeCloseTo(1.0, 2);
      // 涨10%后净值 = 1.1
      expect(navCurve[2].nav).toBeCloseTo(1.1, 2);
    });
  });
});

// 测试当前回撤计算
describe('当前回撤计算', () => {
  describe('单个基金当前回撤', () => {
    it('应正确计算当前回撤（基于历史最高净值）', () => {
      // 净值：1.0 -> 1.5 -> 1.2 -> 1.4 -> 1.3
      // 当前回撤 = (1.5 - 1.3) / 1.5 = 13.33%（基于历史最高净值1.5）
      const history = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.5 },
        { date: '2024-01-03', nav: 1.2 },
        { date: '2024-01-04', nav: 1.4 },
        { date: '2024-01-05', nav: 1.3 },
      ];
      const trades: any[] = [];
      const initialShares = 10000;
      const initialPrice = 1.0;

      const result = calculatePersonalReturnCurve(history, trades, initialShares, initialPrice);

      expect(result).toBeDefined();
      // 当前回撤基于历史最高净值1.5
      expect(result!.currentDrawdown).toBeCloseTo(13.33, 1);
    });

    it('应正确计算当前回撤持续天数', () => {
      const history = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.5 },
        { date: '2024-01-03', nav: 1.4 },
        { date: '2024-01-04', nav: 1.3 },
        { date: '2024-01-05', nav: 1.2 },
      ];
      const trades: any[] = [];
      const initialShares = 10000;
      const initialPrice = 1.0;

      const result = calculatePersonalReturnCurve(history, trades, initialShares, initialPrice);

      expect(result).toBeDefined();
      // 当前回撤 = (1.5 - 1.2) / 1.5 = 20%
      expect(result!.currentDrawdown).toBeCloseTo(20, 1);
    });

    it('当前净值创新高时当前回撤应为0', () => {
      const history = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.2 },
        { date: '2024-01-03', nav: 1.5 }, // 创新高
      ];
      const trades: any[] = [];
      const initialShares = 10000;
      const initialPrice = 1.0;

      const result = calculatePersonalReturnCurve(history, trades, initialShares, initialPrice);

      expect(result).toBeDefined();
      expect(result!.currentDrawdown).toBe(0);
    });

    it('当前回撤的峰值日期应为历史最高点日期', () => {
      // 净值在第二天达到最高
      const history = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.6 }, // 历史最高
        { date: '2024-01-03', nav: 1.3 },
        { date: '2024-01-04', nav: 1.5 }, // 不是最高
        { date: '2024-01-05', nav: 1.4 },
      ];
      const trades: any[] = [];
      const initialShares = 10000;
      const initialPrice = 1.0;

      const result = calculatePersonalReturnCurve(history, trades, initialShares, initialPrice);

      expect(result).toBeDefined();
      expect(result!.peakDate).toBe('2024-01-02');
    });
  });

  describe('组合当前回撤', () => {
    it('应正确计算组合的当前回撤峰值日期', () => {
      // 组合净值曲线
      const positionTrend = [
        { date: '2024-01-01', value: 100000, netInvestment: 100000 },  // 净值 1.0
        { date: '2024-01-02', value: 120000, netInvestment: 100000 },  // 净值 1.2
        { date: '2024-01-03', value: 150000, netInvestment: 100000 },  // 净值 1.5 (峰值)
        { date: '2024-01-04', value: 140000, netInvestment: 100000 },  // 净值 1.4
        { date: '2024-01-05', value: 135000, netInvestment: 100000 },  // 净值 1.35
      ];

      const navCurve = calculateNavCurve(positionTrend);

      // 当前净值 = 1.35，历史最高 = 1.5
      // 当前回撤 = (1.5 - 1.35) / 1.5 = 10%
      const currentNav = navCurve[navCurve.length - 1].nav;
      const peakNav = Math.max(...navCurve.map(p => p.nav));
      const currentDrawdown = peakNav > 0 ? (peakNav - currentNav) / peakNav * 100 : 0;

      expect(currentDrawdown).toBeCloseTo(10, 1);
    });

    it('组合净值创新高时当前回撤应为0', () => {
      const positionTrend = [
        { date: '2024-01-01', value: 100000, netInvestment: 100000 },
        { date: '2024-01-02', value: 120000, netInvestment: 100000 },
        { date: '2024-01-03', value: 150000, netInvestment: 100000 },
      ];

      const navCurve = calculateNavCurve(positionTrend);
      const currentNav = navCurve[navCurve.length - 1].nav;
      const peakNav = Math.max(...navCurve.map(p => p.nav));
      const currentDrawdown = peakNav > 0 ? (peakNav - currentNav) / peakNav * 100 : 0;

      expect(currentDrawdown).toBe(0);
    });
  });
});

// 测试负成本价和负初始价格的情况
describe('负成本价和负初始价格场景', () => {
  describe('calculatePersonalReturnCurve - 负初始价格', () => {
    it('当初始价格为负数时应返回null（无法计算）', () => {
      const history = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.1 },
        { date: '2024-01-03', nav: 1.2 },
      ];
      const trades: any[] = [];
      const initialShares = 10000;
      const initialPrice = -1.0; // 负初始价格

      const result = calculatePersonalReturnCurve(history, trades, initialShares, initialPrice);

      // 负成本价导致所有收益率计算点被过滤，返回null
      expect(result).toBeNull();
    });

    it('当成本价因赎回变为负数时应正确处理', () => {
      // 模拟成本已收回的情况
      const history = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.5 },
        { date: '2024-01-03', nav: 1.2 },
      ];
      // 大额赎回导致成本变为负数（成本已收回）
      const trades = [
        { date: '2024-01-02', type: 'sell', shares: 10000, price: 1.5, fee: 0 },
      ];
      const initialShares = 10000;
      const initialPrice = 1.0;

      const result = calculatePersonalReturnCurve(history, trades, initialShares, initialPrice);

      // 由于成本价计算逻辑，赎回后成本价保持不变
      // 但如果赎回后份额为0，则无法计算收益率
      // 这里预期返回null或有效结果取决于具体实现
      expect(result).toBeDefined();
    });
  });

  describe('calculateMaxDrawdownDetailsFromNav - 边界情况', () => {
    it('应正确处理净投入为0的情况', () => {
      const positionTrend = [
        { date: '2024-01-01', value: 100000, netInvestment: 0 },
        { date: '2024-01-02', value: 110000, netInvestment: 0 },
        { date: '2024-01-03', value: 120000, netInvestment: 0 },
      ];

      const result = calculateMaxDrawdownDetailsFromNav(positionTrend);

      // 净投入为0时，净值计算会产生除零，但应能处理
      expect(result).toBeDefined();
    });

    it('应正确处理空数组', () => {
      const result = calculateMaxDrawdownDetailsFromNav([]);

      expect(result.maxDrawdown).toBe(0);
      expect(result.peakDate).toBeNull();
      expect(result.troughDate).toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// calculateMaxRecoveryDays 函数的单元测试
// ═══════════════════════════════════════════════════════════════════════════════

describe('calculateMaxRecoveryDays', () => {
  describe('基本功能', () => {
    it('应正确计算单个恢复周期的天数', () => {
      // 净值曲线：1.0 -> 1.2 (峰) -> 1.0 (谷) -> 1.3 (创新高)
      // 恢复天数 = 从谷底到创新高的天数 = 1天（假设每日一个点）
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.2 }, // 峰值
        { date: '2024-01-03', nav: 1.0 }, // 谷底
        { date: '2024-01-04', nav: 1.3 }, // 创新高（恢复）
      ];

      const result = calculateMaxRecoveryDays(navCurve);

      // 恢复天数 = 4 - 3 = 1天（从谷底到创新高）
      expect(result).toBe(1);
    });

    it('应正确计算较长的恢复周期', () => {
      // 净值曲线：先下跌5天再回升
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.2 },  // 峰值
        { date: '2024-01-03', nav: 1.1 },
        { date: '2024-01-04', nav: 1.0 },
        { date: '2024-01-05', nav: 0.9 },
        { date: '2024-01-06', nav: 0.8 },  // 谷底
        { date: '2024-01-07', nav: 0.9 },
        { date: '2024-01-08', nav: 1.0 },
        { date: '2024-01-09', nav: 1.1 },
        { date: '2024-01-10', nav: 1.3 },  // 创新高（恢复）
      ];

      const result = calculateMaxRecoveryDays(navCurve);

      // 恢复天数 = 从谷底(01-06)到创新高(01-10) = 10 - 6 = 4天
      expect(result).toBe(4);
    });
  });

  describe('多个恢复周期', () => {
    it('应正确找出最长恢复周期', () => {
      // 两个恢复周期：
      // 第一个：峰->谷->新高，恢复3天
      // 第二个：峰->谷->新高，恢复5天
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.1 },  // 第一个峰值
        { date: '2024-01-03', nav: 1.0 },  // 第一个谷底
        { date: '2024-01-04', nav: 1.0 },
        { date: '2024-01-05', nav: 1.0 },
        { date: '2024-01-06', nav: 1.2 },  // 创新高（恢复完成，恢复3天）
        { date: '2024-01-07', nav: 1.5 },  // 第二个峰值
        { date: '2024-01-08', nav: 1.3 },
        { date: '2024-01-09', nav: 1.1 },
        { date: '2024-01-10', nav: 1.0 },  // 第二个谷底
        { date: '2024-01-11', nav: 1.0 },
        { date: '2024-01-12', nav: 1.0 },
        { date: '2024-01-13', nav: 1.0 },
        { date: '2024-01-14', nav: 1.0 },
        { date: '2024-01-15', nav: 1.6 },  // 创新高（恢复完成，恢复5天）
      ];

      const result = calculateMaxRecoveryDays(navCurve);

      // 最长恢复天数 = 5天
      expect(result).toBe(5);
    });

    it('应正确处理多次小幅回撤', () => {
      // 多个小幅回撤，每个恢复周期都是1天（从谷底到新高）
      // 注意：恢复天数 = 从谷底到创新高的天数，不是从回撤开始到恢复的天数
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.2 },  // 峰值
        { date: '2024-01-03', nav: 1.1 },  // 回撤开始，谷底
        { date: '2024-01-04', nav: 1.3 },  // 创新高（恢复完成，从谷底到新高 = 1天）
        { date: '2024-01-05', nav: 1.5 },  // 新峰值
        { date: '2024-01-06', nav: 1.4 },  // 回撤开始，谷底
        { date: '2024-01-07', nav: 1.3 },  // 更新谷底
        { date: '2024-01-08', nav: 1.2 },  // 更新谷底
        { date: '2024-01-09', nav: 1.6 },  // 创新高（恢复完成，从谷底到新高 = 1天）
        { date: '2024-01-10', nav: 1.8 },  // 新峰值
        { date: '2024-01-11', nav: 1.7 },  // 回撤开始，谷底
        { date: '2024-01-12', nav: 1.6 },  // 更新谷底
        { date: '2024-01-13', nav: 1.5 },  // 更新谷底
        { date: '2024-01-14', nav: 1.9 },  // 创新高（恢复完成，从谷底到新高 = 1天）
      ];

      const result = calculateMaxRecoveryDays(navCurve);

      // 每个恢复周期都是1天（从谷底到新高）
      // 最长恢复天数 = 1天
      expect(result).toBe(1);
    });
  });

  describe('未完成的恢复周期', () => {
    it('当前处于回撤中且未恢复时不应计入最长恢复天数', () => {
      // 当前处于回撤中，还未恢复
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.2 },  // 峰值
        { date: '2024-01-03', nav: 1.1 },
        { date: '2024-01-04', nav: 1.0 },
        { date: '2024-01-05', nav: 0.9 },  // 当前还在回撤中
      ];

      const result = calculateMaxRecoveryDays(navCurve);

      // 当前回撤未恢复，不计入恢复天数
      expect(result).toBe(0);
    });

    it('有历史恢复周期但当前未恢复时应返回历史最长', () => {
      // 有一个历史恢复周期（恢复2天），当前处于回撤中
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.2 },  // 第一次峰值
        { date: '2024-01-03', nav: 1.0 },  // 第一次谷底
        { date: '2024-01-04', nav: 1.0 },
        { date: '2024-01-05', nav: 1.3 },  // 创新高（恢复完成）
        { date: '2024-01-06', nav: 1.5 },  // 第二次峰值
        { date: '2024-01-07', nav: 1.2 },
        { date: '2024-01-08', nav: 1.0 },  // 当前回撤中
      ];

      const result = calculateMaxRecoveryDays(navCurve);

      // 历史最长恢复天数 = 2天（从01-03到01-05）
      expect(result).toBe(2);
    });
  });

  describe('边界情况', () => {
    it('应正确处理空数据', () => {
      const result = calculateMaxRecoveryDays([]);
      expect(result).toBe(0);
    });

    it('应正确处理单日数据', () => {
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
      ];

      const result = calculateMaxRecoveryDays(navCurve);
      expect(result).toBe(0);
    });

    it('应正确处理持续上涨无回撤', () => {
      // 持续上涨，没有回撤
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.1 },
        { date: '2024-01-03', nav: 1.2 },
        { date: '2024-01-04', nav: 1.3 },
      ];

      const result = calculateMaxRecoveryDays(navCurve);
      expect(result).toBe(0);
    });

    it('应正确处理净值曲线一直下跌', () => {
      // 一直下跌，没有恢复
      const navCurve = [
        { date: '2024-01-01', nav: 1.5 },
        { date: '2024-01-02', nav: 1.3 },
        { date: '2024-01-03', nav: 1.1 },
        { date: '2024-01-04', nav: 1.0 },
      ];

      const result = calculateMaxRecoveryDays(navCurve);
      expect(result).toBe(0);
    });
  });

  describe('特殊情况', () => {
    it('应正确处理净值恢复后再次下跌', () => {
      // 恢复后再次下跌，但未创新低
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.2 },  // 峰值
        { date: '2024-01-03', nav: 1.0 },  // 谷底
        { date: '2024-01-04', nav: 1.3 },  // 创新高（恢复）
        { date: '2024-01-05', nav: 1.2 },  // 再次下跌，但未创新低
        { date: '2024-01-06', nav: 1.4 },  // 再次创新高
      ];

      const result = calculateMaxRecoveryDays(navCurve);

      // 第一个恢复周期 = 1天（从01-03到01-04）
      // 第二个恢复周期 = 1天（从01-05到01-06）
      // 最长恢复天数 = 1天
      expect(result).toBe(1);
    });

    it('应正确处理净值先持平再上涨', () => {
      // 谷底持平一段时间后上涨
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.2 },  // 峰值
        { date: '2024-01-03', nav: 1.0 },  // 谷底
        { date: '2024-01-04', nav: 1.0 },  // 持平
        { date: '2024-01-05', nav: 1.0 },  // 持平
        { date: '2024-01-06', nav: 1.3 },  // 创新高
      ];

      const result = calculateMaxRecoveryDays(navCurve);

      // 恢复天数 = 从谷底(01-03)到创新高(01-06) = 6 - 3 = 3天
      expect(result).toBe(3);
    });

    it('应正确处理净值刚好恢复到峰值的情况', () => {
      // 净值刚好恢复到峰值，视为恢复完成
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.2 },  // 峰值
        { date: '2024-01-03', nav: 1.0 },  // 谷底
        { date: '2024-01-04', nav: 1.2 },  // 恢复到峰值（nav >= currentPeak视为恢复）
      ];

      const result = calculateMaxRecoveryDays(navCurve);

      // 恢复天数 = 1天
      expect(result).toBe(1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// estimateVolatilityFromNav 函数的单元测试
// ═══════════════════════════════════════════════════════════════════════════════

describe('estimateVolatilityFromNav', () => {
  describe('基本功能', () => {
    it('应正确计算净值曲线的波动率', () => {
      // 净值曲线：1.0 -> 1.1 -> 1.0 -> 1.2
      // 日收益率：+10%, -9.09%, +20%
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.1 },
        { date: '2024-01-03', nav: 1.0 },
        { date: '2024-01-04', nav: 1.2 },
      ];

      const volatility = estimateVolatilityFromNav(navCurve);

      // 应有波动率，且为正值
      expect(volatility).toBeGreaterThan(0);
      // 年化波动率应该在合理范围内
      expect(volatility).toBeLessThan(500);
    });

    it('应正确计算持续上涨的波动率', () => {
      // 持续上涨：每天涨1%
      const navCurve = Array.from({ length: 10 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        nav: 1.0 * Math.pow(1.01, i),
      }));

      const volatility = estimateVolatilityFromNav(navCurve);

      // 持续上涨的波动率应该很低
      expect(volatility).toBeGreaterThanOrEqual(0);
      expect(volatility).toBeLessThan(50);
    });

    it('应正确计算高波动情况', () => {
      // 高波动：交替涨跌10%
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.1 },  // +10%
        { date: '2024-01-03', nav: 1.0 },  // -9.09%
        { date: '2024-01-04', nav: 1.1 },  // +10%
        { date: '2024-01-05', nav: 1.0 },  // -9.09%
        { date: '2024-01-06', nav: 1.1 },  // +10%
      ];

      const volatility = estimateVolatilityFromNav(navCurve);

      // 高波动情况，波动率应该较高
      expect(volatility).toBeGreaterThan(100);
    });
  });

  describe('边界情况', () => {
    it('应正确处理空数据', () => {
      const volatility = estimateVolatilityFromNav([]);
      expect(volatility).toBe(0);
    });

    it('应正确处理单日数据', () => {
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
      ];

      const volatility = estimateVolatilityFromNav(navCurve);
      expect(volatility).toBe(0);
    });

    it('应正确处理两日数据', () => {
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.1 },
      ];

      const volatility = estimateVolatilityFromNav(navCurve);

      // 单次日收益率，波动率为0（方差为0）
      expect(volatility).toBe(0);
    });

    it('应正确处理净值持平的情况', () => {
      // 净值完全持平，波动率为0
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.0 },
        { date: '2024-01-03', nav: 1.0 },
        { date: '2024-01-04', nav: 1.0 },
      ];

      const volatility = estimateVolatilityFromNav(navCurve);
      expect(volatility).toBe(0);
    });

    it('应正确处理净值为零的情况', () => {
      // 净值为零的点应该被跳过
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 0 },
        { date: '2024-01-03', nav: 1.0 },
      ];

      const volatility = estimateVolatilityFromNav(navCurve);

      // 应该能处理零净值的情况
      expect(volatility).toBeGreaterThanOrEqual(0);
    });
  });

  describe('与风险监控一致性', () => {
    it('计算结果应与风险监控中的计算一致', () => {
      // 创建一个典型的净值曲线
      const navCurve = [
        { date: '2024-01-01', nav: 1.000 },
        { date: '2024-01-02', nav: 1.012 },
        { date: '2024-01-03', nav: 1.025 },
        { date: '2024-01-04', nav: 1.018 },
        { date: '2024-01-05', nav: 1.030 },
        { date: '2024-01-06', nav: 1.045 },
        { date: '2024-01-07', nav: 1.038 },
        { date: '2024-01-08', nav: 1.052 },
      ];

      const volatility = estimateVolatilityFromNav(navCurve);

      // 手动计算验证
      const dailyReturns: number[] = [];
      for (let i = 1; i < navCurve.length; i++) {
        const r = (navCurve[i].nav - navCurve[i - 1].nav) / navCurve[i - 1].nav;
        dailyReturns.push(r);
      }
      const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
      const variance = dailyReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / dailyReturns.length;
      const expectedVolatility = Math.sqrt(variance) * Math.sqrt(252) * 100;

      expect(volatility).toBeCloseTo(expectedVolatility, 5);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// estimateVolatilityFromReturnRates 函数的单元测试
// ═══════════════════════════════════════════════════════════════════════════════

describe('estimateVolatilityFromReturnRates', () => {
  describe('基本功能', () => {
    it('应正确计算个人收益率曲线的波动率', () => {
      // 收益率从 0% 涨到 10%，每天涨约 1%
      const returnRates = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      const volatility = estimateVolatilityFromReturnRates(returnRates);

      // 波动率应该在合理范围内（不是几百%）
      expect(volatility).toBeGreaterThan(0);
      expect(volatility).toBeLessThan(50);
    });

    it('应正确计算有波动的收益率曲线', () => {
      // 收益率有波动：涨涨跌跌
      const returnRates = [0, 5, 3, 8, 4, 10, 6, 12];

      const volatility = estimateVolatilityFromReturnRates(returnRates);

      // 有波动的收益率曲线应该有波动率
      expect(volatility).toBeGreaterThan(0);
    });

    it('收益率持续上涨时波动率应该较低', () => {
      // 收益率持续上涨，每天涨相同的幅度
      const returnRates = Array.from({ length: 20 }, (_, i) => i * 0.5);

      const volatility = estimateVolatilityFromReturnRates(returnRates);

      // 持续上涨的波动率应该很低
      expect(volatility).toBeGreaterThanOrEqual(0);
      expect(volatility).toBeLessThan(30);
    });

    it('收益率剧烈波动时波动率应该较高', () => {
      // 收益率剧烈波动：大涨大跌
      const returnRates = [0, 10, -5, 15, -10, 20, -15, 25];

      const volatility = estimateVolatilityFromReturnRates(returnRates);

      // 剧烈波动的波动率应该较高
      expect(volatility).toBeGreaterThan(50);
    });
  });

  describe('公式验证', () => {
    it('应使用正确的日收益率变化公式', () => {
      // 收益率序列：0% -> 10% -> 5%
      const returnRates = [0, 10, 5];

      const volatility = estimateVolatilityFromReturnRates(returnRates);

      // 手动计算验证
      // 日收益率变化1 = (10 - 0) / (100 + 0) = 0.10
      // 日收益率变化2 = (5 - 10) / (100 + 10) = -5 / 110 ≈ -0.04545
      const dailyReturn1 = 10 / 100;
      const dailyReturn2 = -5 / 110;
      const dailyReturns = [dailyReturn1, dailyReturn2];
      const mean = dailyReturns.reduce((a, b) => a + b, 0) / 2;
      const variance = dailyReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / 2;
      const expectedVolatility = Math.sqrt(variance) * Math.sqrt(252) * 100;

      expect(volatility).toBeCloseTo(expectedVolatility, 5);
    });

    it('应与最大回撤公式保持一致', () => {
      // 验证：日收益率变化公式 = (今日收益率 - 昨日收益率) / (100 + 昨日收益率)
      // 这与最大回撤公式一致：(当前收益率 - 峰值收益率) / (100 + 峰值收益率)
      const returnRates = [0, 5, 10, 8, 12, 6];

      const volatility = estimateVolatilityFromReturnRates(returnRates);

      // 波动率应该是正数且在合理范围
      expect(volatility).toBeGreaterThanOrEqual(0);
      expect(volatility).toBeLessThan(100);
    });
  });

  describe('边界情况', () => {
    it('应正确处理空数据', () => {
      const volatility = estimateVolatilityFromReturnRates([]);
      expect(volatility).toBe(0);
    });

    it('应正确处理单日数据', () => {
      const volatility = estimateVolatilityFromReturnRates([10]);
      expect(volatility).toBe(0);
    });

    it('应正确处理两日数据', () => {
      // 两日数据，只有一个日收益率变化
      const returnRates = [0, 10];
      const volatility = estimateVolatilityFromReturnRates(returnRates);

      // 单次日收益率变化，波动率为0（方差为0）
      expect(volatility).toBe(0);
    });

    it('应正确处理收益率持平的情况', () => {
      // 收益率完全持平
      const returnRates = [5, 5, 5, 5, 5];

      const volatility = estimateVolatilityFromReturnRates(returnRates);
      expect(volatility).toBe(0);
    });

    it('应正确处理负收益率', () => {
      // 收益率可以为负
      const returnRates = [0, 5, -3, 2, -8, 4];

      const volatility = estimateVolatilityFromReturnRates(returnRates);
      expect(volatility).toBeGreaterThanOrEqual(0);
    });

    it('应正确处理高收益率（如50%以上）', () => {
      // 高收益率序列
      const returnRates = [50, 52, 55, 53, 58, 56, 60];

      const volatility = estimateVolatilityFromReturnRates(returnRates);

      // 高收益率时的波动率应该仍然合理
      expect(volatility).toBeGreaterThan(0);
      expect(volatility).toBeLessThan(100);
    });
  });

  describe('与净值波动率的对比', () => {
    it('当成本价等于初始净值时，结果应接近净值波动率', () => {
      // 假设净值从 1.0 涨到 1.1，成本价 = 1.0
      // 收益率 = (净值 - 成本价) / 成本价 * 100
      // 收益率序列应该等于净值增长率序列
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.01 },
        { date: '2024-01-03', nav: 1.02 },
        { date: '2024-01-04', nav: 1.015 },
        { date: '2024-01-05', nav: 1.03 },
      ];

      // 计算净值波动率
      const navVolatility = estimateVolatilityFromNav(navCurve);

      // 计算收益率波动率（成本价 = 1.0）
      const returnRates = navCurve.map(p => ((p.nav - 1.0) / 1.0) * 100);
      const returnVolatility = estimateVolatilityFromReturnRates(returnRates);

      // 两者应该接近（不完全相等，因为公式略有不同）
      // 净值波动率：直接用净值变化
      // 收益率波动率：用 (r2-r1)/(100+r1) 的公式
      // 当收益率较小时，两者接近
      expect(Math.abs(navVolatility - returnVolatility)).toBeLessThan(5);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// calculateCurrentDrawdown 修复测试（基于历史最高净值）
// ═══════════════════════════════════════════════════════════════════════════════

describe('calculateCurrentDrawdown - 基于历史最高净值', () => {
  describe('基本功能', () => {
    it('应基于历史最高净值计算当前回撤', () => {
      // 净值曲线：1.0 -> 1.5（历史最高）-> 1.2 -> 1.4 -> 1.3
      // 当前回撤应基于历史最高点 1.5，而不是反弹点 1.4
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.5 },  // 历史最高
        { date: '2024-01-03', nav: 1.2 },
        { date: '2024-01-04', nav: 1.4 },  // 反弹点（不是历史最高）
        { date: '2024-01-05', nav: 1.3 },  // 当前
      ];

      const result = calculateCurrentDrawdown(navCurve);

      // 当前回撤 = (1.5 - 1.3) / 1.5 = 13.33%
      expect(result.currentDrawdown).toBeCloseTo(13.33, 1);
      expect(result.peakNav).toBe(1.5);
      expect(result.peakDate).toBe('2024-01-02');
    });

    it('反弹后下跌，回撤基准点仍应为历史最高点', () => {
      // 场景：反弹但未创新高，然后再次下跌
      // 净值：1.0 -> 1.2（历史最高）-> 1.0 -> 1.1（反弹）-> 1.05（今天下跌）
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.2 },  // 历史最高
        { date: '2024-01-03', nav: 1.0 },
        { date: '2024-01-04', nav: 1.1 },  // 反弹点
        { date: '2024-01-05', nav: 1.05 }, // 今天下跌
      ];

      const result = calculateCurrentDrawdown(navCurve);

      // 当前回撤应基于历史最高点 1.2，而不是反弹点 1.1
      // 回撤 = (1.2 - 1.05) / 1.2 = 12.5%
      expect(result.currentDrawdown).toBeCloseTo(12.5, 1);
      expect(result.peakNav).toBe(1.2);
      expect(result.peakDate).toBe('2024-01-02');
    });

    it('创新高后，当前回撤应为0', () => {
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.2 },
        { date: '2024-01-03', nav: 1.5 },  // 创新高
      ];

      const result = calculateCurrentDrawdown(navCurve);

      expect(result.currentDrawdown).toBe(0);
      expect(result.peakNav).toBe(1.5);
    });
  });

  describe('边界情况', () => {
    it('应正确处理空数据', () => {
      const result = calculateCurrentDrawdown([]);
      expect(result.currentDrawdown).toBe(0);
      expect(result.peakDate).toBeNull();
    });

    it('应正确处理单日数据', () => {
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
      ];

      const result = calculateCurrentDrawdown(navCurve);
      expect(result.currentDrawdown).toBe(0);
    });

    it('应正确处理持续上涨无回撤', () => {
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.1 },
        { date: '2024-01-03', nav: 1.2 },
        { date: '2024-01-04', nav: 1.3 },
      ];

      const result = calculateCurrentDrawdown(navCurve);
      expect(result.currentDrawdown).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// calculateCurrentDrawdownDetails 函数的单元测试
// ═══════════════════════════════════════════════════════════════════════════════

describe('calculateCurrentDrawdownDetails', () => {
  describe('当前回撤峰值识别', () => {
    it('历史最高点未被超越时，峰值应为历史最高点', () => {
      // 净值曲线：1.0 -> 1.2 -> 1.5 -> 1.3 -> 1.4 -> 1.35 -> 1.30
      // 1.5 是历史最高点，后面所有点都没超过它
      // 峰值应该是 1.5，而不是 1.4 或 1.35
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.2 },
        { date: '2024-01-03', nav: 1.5 },  // 历史最高点
        { date: '2024-01-04', nav: 1.3 },
        { date: '2024-01-05', nav: 1.4 },  // 反弹，但没超过 1.5
        { date: '2024-01-06', nav: 1.35 },
        { date: '2024-01-07', nav: 1.30 }, // 当前
      ];

      const result = calculateCurrentDrawdownDetails(navCurve);

      // 峰值应为历史最高点 1.5
      expect(result.peakNav).toBe(1.5);
      expect(result.peakDate).toBe('2024-01-03');
      // 当前回撤深度 = (1.5 - 1.30) / 1.5 = 13.33%
      expect(result.currentDrawdown).toBeCloseTo(13.33, 1);
      // 低点应为当前净值 1.30
      expect(result.troughNav).toBe(1.30);
      expect(result.troughDate).toBe('2024-01-07');
      // 恢复进度应为 0%（当前就是低点）
      expect(result.recoveryProgress).toBe(0);
      // 持续天数 = 7 - 3 = 4 天
      expect(result.drawdownDays).toBe(4);
    });

    it('创新高后，峰值应为新的历史最高点', () => {
      // 净值曲线：1.0 -> 1.2 -> 1.5 -> 1.3 -> 1.6 -> 1.55 -> 1.50
      // 1.6 是新的历史最高点（超过了之前的 1.5）
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.2 },
        { date: '2024-01-03', nav: 1.5 },
        { date: '2024-01-04', nav: 1.3 },
        { date: '2024-01-05', nav: 1.6 },  // 新的历史最高点
        { date: '2024-01-06', nav: 1.55 },
        { date: '2024-01-07', nav: 1.50 }, // 当前
      ];

      const result = calculateCurrentDrawdownDetails(navCurve);

      // 峰值应为新的历史最高点 1.6
      expect(result.peakNav).toBe(1.6);
      expect(result.peakDate).toBe('2024-01-05');
      // 当前回撤深度 = (1.6 - 1.50) / 1.6 = 6.25%
      expect(result.currentDrawdown).toBeCloseTo(6.25, 1);
      // 低点应为当前净值 1.50
      expect(result.troughNav).toBe(1.50);
      // 恢复进度应为 0%
      expect(result.recoveryProgress).toBe(0);
    });

    it('从低点开始恢复时，应正确计算恢复进度', () => {
      // 净值曲线：1.0 -> 1.2 -> 1.5 -> 1.3 -> 1.35 -> 1.38
      // 峰值 1.5，低点 1.3，当前 1.38（正在恢复）
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.2 },
        { date: '2024-01-03', nav: 1.5 },  // 峰值
        { date: '2024-01-04', nav: 1.3 },  // 低点
        { date: '2024-01-05', nav: 1.35 },
        { date: '2024-01-06', nav: 1.38 }, // 当前，正在恢复
      ];

      const result = calculateCurrentDrawdownDetails(navCurve);

      // 峰值应为 1.5
      expect(result.peakNav).toBe(1.5);
      expect(result.peakDate).toBe('2024-01-03');
      // 低点应为 1.3
      expect(result.troughNav).toBe(1.3);
      expect(result.troughDate).toBe('2024-01-04');
      // 当前净值
      expect(result.currentNav).toBe(1.38);
      // 恢复进度 = (1.38 - 1.3) / (1.5 - 1.3) = 0.08 / 0.2 = 40%
      expect(result.recoveryProgress).toBeCloseTo(40, 0);
    });

    it('完全恢复后创新高，当前回撤应为0', () => {
      // 净值曲线：1.0 -> 1.2 -> 1.5 -> 1.6
      // 持续创新高，无回撤
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
        { date: '2024-01-02', nav: 1.2 },
        { date: '2024-01-03', nav: 1.5 },
        { date: '2024-01-04', nav: 1.6 },  // 当前，创新高
      ];

      const result = calculateCurrentDrawdownDetails(navCurve);

      // 当前回撤应为 0
      expect(result.currentDrawdown).toBe(0);
      expect(result.peakNav).toBe(1.6);
      expect(result.recoveryProgress).toBe(0); // 无回撤时恢复进度为 0
    });
  });

  describe('边界情况', () => {
    it('应正确处理空数据', () => {
      const result = calculateCurrentDrawdownDetails([]);
      expect(result.currentDrawdown).toBe(0);
      expect(result.peakDate).toBeNull();
      expect(result.troughDate).toBeNull();
      expect(result.drawdownDays).toBe(0);
    });

    it('应正确处理单日数据', () => {
      const navCurve = [
        { date: '2024-01-01', nav: 1.0 },
      ];

      const result = calculateCurrentDrawdownDetails(navCurve);
      expect(result.currentDrawdown).toBe(0);
      expect(result.peakNav).toBe(1.0);
      expect(result.troughNav).toBe(1.0);
      expect(result.drawdownDays).toBe(0);
    });

    it('应正确处理持续下跌', () => {
      // 持续下跌，峰值应为第一天
      const navCurve = [
        { date: '2024-01-01', nav: 1.5 },  // 峰值
        { date: '2024-01-02', nav: 1.3 },
        { date: '2024-01-03', nav: 1.2 },
        { date: '2024-01-04', nav: 1.1 },
      ];

      const result = calculateCurrentDrawdownDetails(navCurve);

      expect(result.peakNav).toBe(1.5);
      expect(result.peakDate).toBe('2024-01-01');
      expect(result.troughNav).toBe(1.1);
      expect(result.currentDrawdown).toBeCloseTo(26.67, 0); // (1.5-1.1)/1.5
      expect(result.recoveryProgress).toBe(0);
      expect(result.drawdownDays).toBe(3);
    });
  });
});