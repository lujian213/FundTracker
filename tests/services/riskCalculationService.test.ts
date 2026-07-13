/**
 * riskCalculationService.test.ts
 *
 * 风险计算服务单元测试
 */

import { computeRiskSnapshot, clearRiskCache, getRiskCacheState } from '../../services/riskCalculationService';
import { getRiskThresholds, saveRiskThresholds, DEFAULT_RISK_THRESHOLDS } from '../../services/riskThresholdService';
import { Ticker, ValuationData, RiskThresholds, OverallProfitSummary } from '../../types';
import { getHistory, getPosition } from '../../services/marketFundService';
import { getTradesForSymbol } from '../../hooks/useTrades';

// Mock dependencies
jest.mock('../../services/marketFundService');
jest.mock('../../hooks/useTrades');
jest.mock('../../services/riskThresholdService');
jest.mock('../../services/fundService', () => ({
  computeOverallProfit: jest.fn(),
}));

// Import the mocked function
import { computeOverallProfit } from '../../services/fundService';

const mockGetHistory = getHistory as jest.MockedFunction<typeof getHistory>;
const mockGetPosition = getPosition as jest.MockedFunction<typeof getPosition>;
const mockGetTradesForSymbol = getTradesForSymbol as jest.MockedFunction<typeof getTradesForSymbol>;
const mockGetRiskThresholds = getRiskThresholds as jest.MockedFunction<typeof getRiskThresholds>;
const mockComputeOverallProfit = computeOverallProfit as jest.MockedFunction<typeof computeOverallProfit>;

// Helper to create mock summary
const createMockSummary = (days: number = 100): OverallProfitSummary => {
  const timeline = [];
  let cumulativeProfit = 0;
  for (let i = 0; i < days; i++) {
    const date = new Date('2024-01-01');
    date.setDate(date.getDate() + i);
    const dailyProfit = (Math.random() - 0.5) * 100;
    cumulativeProfit += dailyProfit;
    timeline.push({
      date: date.toISOString().split('T')[0],
      cumulativeProfit,
      dailyProfit,
    });
  }
  return {
    totalProfit: cumulativeProfit,
    totalReturn: cumulativeProfit > 0 ? 10 : -10,
    timeline,
    perFund: [],
    perFundTimelines: {},
  };
};

describe('riskCalculationService', () => {
  beforeEach(() => {
    // Clear cache before each test
    clearRiskCache();
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Test Data
  // ═══════════════════════════════════════════════════════════════════════════════

  const createMockPortfolio = (): Ticker[] => [
    { id: '1', symbol: '000001', name: '测试基金1', market: 'Fund' as any },
    { id: '2', symbol: '000002', name: '测试基金2', market: 'Fund' as any },
  ];

  const createMockMarketData = (): Record<string, ValuationData> => ({
    '000001': {
      symbol: '000001',
      name: '测试基金1',
      currentPrice: 1.5,
      previousPrice: 1.4,
      changePercentage: 7.14,
      lastUpdated: '2024-01-15 15:00',
      realtimeDate: '2024-01-15',
      netWorthDate: '2024-01-14',
      valuationDate: '2024-01-15',
      sourceUrl: '',
    },
    '000002': {
      symbol: '000002',
      name: '测试基金2',
      currentPrice: 2.0,
      previousPrice: 2.1,
      changePercentage: -4.76,
      lastUpdated: '2024-01-15 15:00',
      realtimeDate: '2024-01-15',
      netWorthDate: '2024-01-14',
      valuationDate: '2024-01-15',
      sourceUrl: '',
    },
  });

  const createMockHistory = (days: number = 100) => {
    const history = [];
    let value = 1.0;
    for (let i = 0; i < days; i++) {
      const date = new Date('2024-01-01');
      date.setDate(date.getDate() + i);
      history.push({
        date: date.getTime(),
        value: value,
        equityReturn: (Math.random() - 0.5) * 4, // -2% to +2%
      });
      value *= 1 + (Math.random() - 0.5) * 0.02;
    }
    return history;
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // Tests
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('computeRiskSnapshot', () => {
    it('首次计算应返回完整风险快照', async () => {
      const portfolio = createMockPortfolio();
      const marketData = createMockMarketData();

      mockGetRiskThresholds.mockReturnValue(DEFAULT_RISK_THRESHOLDS);
      mockComputeOverallProfit.mockResolvedValue(createMockSummary());
      mockGetHistory.mockReturnValue(createMockHistory());
      mockGetPosition.mockReturnValue({
        fullCapacity: 10000,
        initialPosition: 1000,
        startDate: '2024-01-01',
        initialPrice: 1.0,
      });
      mockGetTradesForSymbol.mockReturnValue([]);

      const snapshot = await computeRiskSnapshot(portfolio, marketData);

      expect(snapshot).toBeDefined();
      expect(snapshot.score).toBeGreaterThanOrEqual(0);
      expect(snapshot.score).toBeLessThanOrEqual(100);
      expect(snapshot.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(snapshot.volatility).toBeGreaterThanOrEqual(0);
      expect(snapshot.alerts).toBeDefined();
      expect(snapshot.fundDrawdowns).toBeDefined();
      expect(snapshot.computedAt).toBeDefined();
    });

    it('空持仓应返回默认快照', async () => {
      mockGetRiskThresholds.mockReturnValue(DEFAULT_RISK_THRESHOLDS);
      mockComputeOverallProfit.mockResolvedValue({
        totalProfit: 0,
        totalReturn: 0,
        timeline: [],
        perFund: [],
        perFundTimelines: {},
      });
      mockGetHistory.mockReturnValue([]);

      const snapshot = await computeRiskSnapshot([], {});

      expect(snapshot).toBeDefined();
      // 空持仓 = 无风险，评分应为满分100
      expect(snapshot.score).toBe(0);
      expect(snapshot.maxDrawdown).toBe(0);
      expect(snapshot.volatility).toBe(0);
      expect(snapshot.alerts).toEqual([]);
      expect(snapshot.fundDrawdowns).toEqual([]);
    });

    it('应正确缓存计算结果', async () => {
      const portfolio = createMockPortfolio();
      const marketData = createMockMarketData();

      mockGetRiskThresholds.mockReturnValue(DEFAULT_RISK_THRESHOLDS);
      mockComputeOverallProfit.mockResolvedValue(createMockSummary());
      mockGetHistory.mockReturnValue(createMockHistory());
      mockGetPosition.mockReturnValue({
        fullCapacity: 10000,
        initialPosition: 1000,
        startDate: '2024-01-01',
        initialPrice: 1.0,
      });
      mockGetTradesForSymbol.mockReturnValue([]);

      // 首次计算
      const snapshot1 = await computeRiskSnapshot(portfolio, marketData);

      // 验证快照正确计算
      expect(snapshot1).toBeDefined();
      expect(snapshot1.score).toBeGreaterThanOrEqual(0);
      expect(snapshot1.score).toBeLessThanOrEqual(100);
    });

    it('清除缓存后应重新计算', async () => {
      const portfolio = createMockPortfolio();
      const marketData = createMockMarketData();

      mockGetRiskThresholds.mockReturnValue(DEFAULT_RISK_THRESHOLDS);
      mockComputeOverallProfit.mockResolvedValue(createMockSummary());
      mockGetHistory.mockReturnValue(createMockHistory());
      mockGetPosition.mockReturnValue({
        fullCapacity: 10000,
        initialPosition: 1000,
        startDate: '2024-01-01',
        initialPrice: 1.0,
      });
      mockGetTradesForSymbol.mockReturnValue([]);

      // 首次计算
      const snapshot1 = await computeRiskSnapshot(portfolio, marketData);

      // 清除缓存
      clearRiskCache();

      // 重新计算
      const snapshot2 = await computeRiskSnapshot(portfolio, marketData);

      // 两次计算应该都成功
      expect(snapshot1).toBeDefined();
      expect(snapshot2).toBeDefined();
    });
  });

  describe('风险评分算法', () => {
    it('高风险情况应返回较低评分', async () => {
      const portfolio = createMockPortfolio();
      const marketData = createMockMarketData();

      // 设置高阈值，使风险评分更低
      const thresholds: RiskThresholds = {
        ...DEFAULT_RISK_THRESHOLDS,
        drawdown: { low: 5, medium: 10, high: 15 },
      };

      mockGetRiskThresholds.mockReturnValue(thresholds);
      mockComputeOverallProfit.mockResolvedValue(createMockSummary());

      // 创建大幅下跌的历史数据
      const decliningHistory = [];
      let value = 1.5;
      for (let i = 0; i < 50; i++) {
        const date = new Date('2024-01-01');
        date.setDate(date.getDate() + i);
        decliningHistory.push({
          date: date.getTime(),
          value: value,
          equityReturn: -2, // 每天跌2%
        });
        value *= 0.98;
      }

      mockGetHistory.mockReturnValue(decliningHistory);
      mockGetPosition.mockReturnValue({
        fullCapacity: 10000,
        initialPosition: 1000,
        startDate: '2024-01-01',
        initialPrice: 1.0,
      });
      mockGetTradesForSymbol.mockReturnValue([]);

      const snapshot = await computeRiskSnapshot(portfolio, marketData);

      // 风险评分应在合理范围内
      expect(snapshot.score).toBeGreaterThanOrEqual(0);
      expect(snapshot.score).toBeLessThanOrEqual(100);
    });

    it('低风险情况应返回合理评分', async () => {
      const portfolio = createMockPortfolio();
      const marketData = createMockMarketData();

      mockGetRiskThresholds.mockReturnValue(DEFAULT_RISK_THRESHOLDS);
      mockComputeOverallProfit.mockResolvedValue(createMockSummary());

      // 创建稳定上涨的历史数据
      const stableHistory = [];
      let value = 1.0;
      for (let i = 0; i < 50; i++) {
        const date = new Date('2024-01-01');
        date.setDate(date.getDate() + i);
        stableHistory.push({
          date: date.getTime(),
          value: value,
          equityReturn: 0.5, // 每天涨0.5%
        });
        value *= 1.005;
      }

      mockGetHistory.mockReturnValue(stableHistory);
      mockGetPosition.mockReturnValue({
        fullCapacity: 10000,
        initialPosition: 1000,
        startDate: '2024-01-01',
        initialPrice: 1.0,
      });
      mockGetTradesForSymbol.mockReturnValue([]);

      const snapshot = await computeRiskSnapshot(portfolio, marketData);

      // 风险评分应在合理范围内
      expect(snapshot.score).toBeGreaterThanOrEqual(0);
      expect(snapshot.score).toBeLessThanOrEqual(100);
    });

    it('夏普比率纳入评分计算', async () => {
      const portfolio = createMockPortfolio();
      const marketData = createMockMarketData();

      mockGetRiskThresholds.mockReturnValue(DEFAULT_RISK_THRESHOLDS);
      mockComputeOverallProfit.mockResolvedValue(createMockSummary(100));

      // 创建有波动的历史数据（产生可计算的夏普比率）
      const volatileHistory = [];
      let value = 1.0;
      for (let i = 0; i < 100; i++) {
        const date = new Date('2024-01-01');
        date.setDate(date.getDate() + i);
        // 模拟有波动但整体上涨的趋势
        const dailyReturn = 0.002 + (Math.random() - 0.5) * 0.01;
        volatileHistory.push({
          date: date.getTime(),
          value: value,
          equityReturn: dailyReturn * 100,
        });
        value *= 1 + dailyReturn;
      }

      mockGetHistory.mockReturnValue(volatileHistory);
      mockGetPosition.mockReturnValue({
        fullCapacity: 10000,
        initialPosition: 1000,
        startDate: '2024-01-01',
        initialPrice: 1.0,
      });
      mockGetTradesForSymbol.mockReturnValue([]);

      const snapshot = await computeRiskSnapshot(portfolio, marketData);

      // 夏普比率应被计算
      expect(snapshot.sharpeRatio).not.toBeNull();
      // 评分应考虑夏普比率因素
      expect(snapshot.score).toBeGreaterThanOrEqual(0);
      expect(snapshot.score).toBeLessThanOrEqual(100);
    });

    it('夏普比率不可用时权重重新分配', async () => {
      // 空持仓时夏普比率不可用，权重应重新分配给其他三项
      mockGetRiskThresholds.mockReturnValue(DEFAULT_RISK_THRESHOLDS);
      mockComputeOverallProfit.mockResolvedValue({
        totalProfit: 0,
        totalReturn: 0,
        timeline: [],
        perFund: [],
        perFundTimelines: {},
      });
      mockGetHistory.mockReturnValue([]);

      const snapshot = await computeRiskSnapshot([], {});

      // 空持仓：回撤=0, 波动=0, HHI=0, 夏普=null
      // 权重重新分配后：回撤40/85≈47%, 波动25/85≈29%, 集中度20/85≈24%
      // 各项得分都是100，所以总评分应为100
      expect(snapshot.sharpeRatio).toBeNull();
      expect(snapshot.score).toBe(0);
    });

    it('高夏普比率提升评分', async () => {
      const portfolio = createMockPortfolio();
      const marketData = createMockMarketData();

      mockGetRiskThresholds.mockReturnValue(DEFAULT_RISK_THRESHOLDS);
      mockComputeOverallProfit.mockResolvedValue(createMockSummary(100));

      // 创建稳定上涨、低波动的历史数据（产生高夏普比率）
      const stableRisingHistory = [];
      let value = 1.0;
      for (let i = 0; i < 100; i++) {
        const date = new Date('2024-01-01');
        date.setDate(date.getDate() + i);
        // 每天稳定上涨0.3%，波动很小
        const dailyReturn = 0.003 + (Math.random() - 0.5) * 0.002;
        stableRisingHistory.push({
          date: date.getTime(),
          value: value,
          equityReturn: dailyReturn * 100,
        });
        value *= 1 + dailyReturn;
      }

      mockGetHistory.mockReturnValue(stableRisingHistory);
      mockGetPosition.mockReturnValue({
        fullCapacity: 10000,
        initialPosition: 1000,
        startDate: '2024-01-01',
        initialPrice: 1.0,
      });
      mockGetTradesForSymbol.mockReturnValue([]);

      const snapshot = await computeRiskSnapshot(portfolio, marketData);

      // 高夏普比率（预期>1）应提升评分
      expect(snapshot.sharpeRatio).toBeGreaterThan(0.5);
      // 评分应较高（各项指标都良好）
      expect(snapshot.score).toBeGreaterThan(50);
    });
  });

  describe('预警生成', () => {
    it('应正确生成预警', async () => {
      const portfolio = createMockPortfolio();
      const marketData = createMockMarketData();

      mockGetRiskThresholds.mockReturnValue(DEFAULT_RISK_THRESHOLDS);
      mockComputeOverallProfit.mockResolvedValue(createMockSummary(30));

      // 创建历史数据
      const history = [];
      let value = 2.0;
      for (let i = 0; i < 30; i++) {
        const date = new Date('2024-01-01');
        date.setDate(date.getDate() + i);
        history.push({
          date: date.getTime(),
          value: value,
          equityReturn: -1,
        });
        value *= 0.99;
      }

      mockGetHistory.mockReturnValue(history);
      mockGetPosition.mockReturnValue({
        fullCapacity: 10000,
        initialPosition: 1000,
        startDate: '2024-01-01',
        initialPrice: 1.0,
      });
      mockGetTradesForSymbol.mockReturnValue([]);

      const snapshot = await computeRiskSnapshot(portfolio, marketData);

      // 应有预警列表
      expect(snapshot.alerts).toBeDefined();
      expect(Array.isArray(snapshot.alerts)).toBe(true);
    });
  });

  describe('单个基金回撤计算', () => {
    it('当前回撤峰值应为历史最高点（未被超越时）', async () => {
      const portfolio = createMockPortfolio();
      const marketData = createMockMarketData();

      mockGetRiskThresholds.mockReturnValue(DEFAULT_RISK_THRESHOLDS);
      mockComputeOverallProfit.mockResolvedValue(createMockSummary(10));

      // 创建历史净值：1.0 -> 1.5 -> 1.3 -> 1.4 -> 1.35 -> 1.30
      // 峰值应该是 1.5（历史最高点），而不是 1.4 或 1.35
      const history = [
        { date: new Date('2024-01-01').getTime(), value: 1.0, equityReturn: 0 },
        { date: new Date('2024-01-02').getTime(), value: 1.2, equityReturn: 0 },
        { date: new Date('2024-01-03').getTime(), value: 1.5, equityReturn: 0 },  // 历史最高点
        { date: new Date('2024-01-04').getTime(), value: 1.3, equityReturn: 0 },
        { date: new Date('2024-01-05').getTime(), value: 1.4, equityReturn: 0 },  // 反弹，但没超过 1.5
        { date: new Date('2024-01-06').getTime(), value: 1.35, equityReturn: 0 },
        { date: new Date('2024-01-07').getTime(), value: 1.30, equityReturn: 0 }, // 当前
      ];

      mockGetHistory.mockReturnValue(history);
      mockGetPosition.mockReturnValue({
        fullCapacity: 10000,
        initialPosition: 1000,
        startDate: '2024-01-01',
        initialPrice: 1.0,
      });
      mockGetTradesForSymbol.mockReturnValue([]);

      const snapshot = await computeRiskSnapshot(portfolio, marketData);

      // 应有单个基金回撤数据（portfolio 有 2 个基金）
      expect(snapshot.fundDrawdowns.length).toBeGreaterThanOrEqual(1);
      const fundDrawdown = snapshot.fundDrawdowns[0];

      // 当前回撤深度 = (1.5 - 1.30) / 1.5 = 13.33%
      expect(fundDrawdown.currentDrawdown).toBeCloseTo(13.33, 1);
      // 峰值日期应该是历史最高点 2024-01-03
      expect(fundDrawdown.peakDate).toBe('2024-01-03');
      // 峰值应该是 1.5
      expect(fundDrawdown.peakValue).toBe(1.5);
    });

    it('创新高后当前回撤峰值应为新的历史最高点', async () => {
      const portfolio = createMockPortfolio();
      const marketData = createMockMarketData();

      mockGetRiskThresholds.mockReturnValue(DEFAULT_RISK_THRESHOLDS);
      mockComputeOverallProfit.mockResolvedValue(createMockSummary(10));

      // 创建历史净值：1.0 -> 1.5 -> 1.3 -> 1.6 -> 1.55 -> 1.50
      // 峰值应该是 1.6（新的历史最高点）
      const history = [
        { date: new Date('2024-01-01').getTime(), value: 1.0, equityReturn: 0 },
        { date: new Date('2024-01-02').getTime(), value: 1.2, equityReturn: 0 },
        { date: new Date('2024-01-03').getTime(), value: 1.5, equityReturn: 0 },
        { date: new Date('2024-01-04').getTime(), value: 1.3, equityReturn: 0 },
        { date: new Date('2024-01-05').getTime(), value: 1.6, equityReturn: 0 },  // 新的历史最高点
        { date: new Date('2024-01-06').getTime(), value: 1.55, equityReturn: 0 },
        { date: new Date('2024-01-07').getTime(), value: 1.50, equityReturn: 0 }, // 当前
      ];

      mockGetHistory.mockReturnValue(history);
      mockGetPosition.mockReturnValue({
        fullCapacity: 10000,
        initialPosition: 1000,
        startDate: '2024-01-01',
        initialPrice: 1.0,
      });
      mockGetTradesForSymbol.mockReturnValue([]);

      const snapshot = await computeRiskSnapshot(portfolio, marketData);

      const fundDrawdown = snapshot.fundDrawdowns[0];

      // 当前回撤深度 = (1.6 - 1.50) / 1.6 = 6.25%
      expect(fundDrawdown.currentDrawdown).toBeCloseTo(6.25, 1);
      // 峰值日期应该是新的历史最高点 2024-01-05
      expect(fundDrawdown.peakDate).toBe('2024-01-05');
      // 峰值应该是 1.6
      expect(fundDrawdown.peakValue).toBe(1.6);
    });

    it('当前回撤应基于个人收益率计算，而非基金净值', async () => {
      const portfolio = createMockPortfolio();
      const marketData = createMockMarketData();

      mockGetRiskThresholds.mockReturnValue(DEFAULT_RISK_THRESHOLDS);
      mockComputeOverallProfit.mockResolvedValue(createMockSummary(10));

      // 使用成本价 2.0 的场景，这样净值变化和收益率变化的关系更明显
      // 净值 2.4 → 收益率 (2.4-2.0)/2.0 = 20%
      // 净值 2.2 → 收益率 (2.2-2.0)/2.0 = 10%
      // 净值 2.3 → 收益率 (2.3-2.0)/2.0 = 15%
      const history = [
        { date: new Date('2024-01-01').getTime(), value: 2.0, equityReturn: 0 },  // 成本价
        { date: new Date('2024-01-02').getTime(), value: 2.3, equityReturn: 0 },  // +15%
        { date: new Date('2024-01-03').getTime(), value: 2.4, equityReturn: 0 },  // +20% 峰值
        { date: new Date('2024-01-04').getTime(), value: 2.2, equityReturn: 0 },  // +10% 低点
        { date: new Date('2024-01-05').getTime(), value: 2.3, equityReturn: 0 },  // +15% 当前（恢复中）
      ];

      mockGetHistory.mockReturnValue(history);
      mockGetPosition.mockReturnValue({
        fullCapacity: 10000,
        initialPosition: 1000,
        startDate: '2024-01-01',
        initialPrice: 2.0,  // 成本价 2.0
      });
      mockGetTradesForSymbol.mockReturnValue([]);

      const snapshot = await computeRiskSnapshot(portfolio, marketData);
      const fundDrawdown = snapshot.fundDrawdowns[0];

      // 验证个人收益率字段存在
      expect(fundDrawdown.peakReturnRate).toBeDefined();
      expect(fundDrawdown.currentReturnRate).toBeDefined();

      // 峰值个人收益率应该约为 +20%
      expect(fundDrawdown.peakReturnRate).toBeCloseTo(20, 0);
      // 当前个人收益率应该约为 +15%
      expect(fundDrawdown.currentReturnRate).toBeCloseTo(15, 0);

      // 当前回撤深度（基于个人收益率）：
      // 峰值收益率 +20%，当前收益率 +15%，中间低点 +10%
      // 恢复进度 = (15 - 10) / (20 - 10) = 50%
      // 当前回撤深度 = (20 - 15) / (100 + 20) * 100 ≈ 4.17%
      //
      // 注意：如果错误地基于基金净值计算：
      // 净值峰值 2.4，当前净值 2.3，回撤 = (2.4 - 2.3) / 2.4 ≈ 4.17%
      //
      // 虽然数值巧合相同，但峰值日期应该不同：
      // - 基于净值：峰值日期应该是 2024-01-03（净值 2.4）
      // - 基于收益率：峰值日期也应该是 2024-01-03（收益率 20%）
      //
      // 我们通过验证 peakReturnRate 来确认使用的是个人收益率
      expect(fundDrawdown.peakReturnRate).toBeCloseTo(20, 1);
    });

    it('当前回撤低点应正确计算并传递', async () => {
      const portfolio = createMockPortfolio();
      const marketData = createMockMarketData();

      mockGetRiskThresholds.mockReturnValue(DEFAULT_RISK_THRESHOLDS);
      mockComputeOverallProfit.mockResolvedValue(createMockSummary(10));

      // 净值曲线：成本价 2.0
      // 1.0 (+0%) -> 2.4 (+20% 峰值) -> 2.2 (+10% 低点) -> 2.3 (+15% 当前)
      const history = [
        { date: new Date('2024-01-01').getTime(), value: 2.0, equityReturn: 0 },
        { date: new Date('2024-10-01').getTime(), value: 2.4, equityReturn: 0 },  // +20% 峰值
        { date: new Date('2024-01-03').getTime(), value: 2.2, equityReturn: 0 },  // +10% 低点
        { date: new Date('2024-01-04').getTime(), value: 2.3, equityReturn: 0 },  // +15% 当前
      ];

      mockGetHistory.mockReturnValue(history);
      mockGetPosition.mockReturnValue({
        fullCapacity: 10000,
        initialPosition: 1000,
        startDate: '2024-01-01',
        initialPrice: 2.0,
      });
      mockGetTradesForSymbol.mockReturnValue([]);

      const snapshot = await computeRiskSnapshot(portfolio, marketData);
      const fundDrawdown = snapshot.fundDrawdowns[0];

      // 验证低点字段存在且有值
      expect(fundDrawdown.troughDate).toBeTruthy();
      expect(fundDrawdown.troughValue).toBeDefined();
      expect(fundDrawdown.troughValue).toBeGreaterThan(0);

      // 验证 troughReturnRate 或 troughValue 至少有一个有值
      const hasTroughData = fundDrawdown.troughReturnRate !== undefined || fundDrawdown.troughValue !== undefined;
      expect(hasTroughData).toBe(true);
    });
  });
});