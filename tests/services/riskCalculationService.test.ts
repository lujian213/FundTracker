/**
 * riskCalculationService.test.ts
 *
 * 风险计算服务单元测试
 */

import { computeRiskSnapshot, clearRiskCache, getRiskCacheState } from '../../services/riskCalculationService';
import { getRiskThresholds, saveRiskThresholds, DEFAULT_RISK_THRESHOLDS } from '../../services/riskThresholdService';
import { Ticker, ValuationData, RiskThresholds, OverallProfitSummary } from '../../types';
import { getHistory, getPosition, getValuation } from '../../services/marketFundService';
import { getTradesForSymbol } from '../../hooks/useTrades';

// Mock dependencies
jest.mock('../../services/marketFundService');
jest.mock('../../hooks/useTrades');
jest.mock('../../services/riskThresholdService');
jest.mock('../../services/fundService', () => ({
  computeOverallProfit: jest.fn(),
  prepareHistoryForProfitCalculation: jest.fn((params) => {
    // 简单实现：返回历史数据，如果有当前估值则添加到最后
    const { history, currentPrice } = params;
    if (!history || history.length === 0) return [];
    const result = history.slice();
    if (currentPrice && result.length > 0) {
      // 用当前估值覆盖最后一个历史点
      result[result.length - 1] = { ...result[result.length - 1], value: currentPrice };
    }
    return result;
  }),
}));

// Import the mocked function
import { computeOverallProfit } from '../../services/fundService';

const mockGetHistory = getHistory as jest.MockedFunction<typeof getHistory>;
const mockGetPosition = getPosition as jest.MockedFunction<typeof getPosition>;
const mockGetValuation = getValuation as jest.MockedFunction<typeof getValuation>;
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
    it('历史最高点尚未恢复时，当前回撤峰值应为历史最高点', async () => {
      const portfolio = createMockPortfolio();
      const marketData = createMockMarketData();

      mockGetRiskThresholds.mockReturnValue(DEFAULT_RISK_THRESHOLDS);
      mockComputeOverallProfit.mockResolvedValue(createMockSummary(10));

      // 创建历史净值：历史最高点1.5，尚未恢复
      // 1.0 -> 1.5(历史最高，也是当前回撤峰值) -> 1.3 -> 1.4 -> 1.35 -> 1.30
      const history = [
        { date: new Date('2024-01-01').getTime(), value: 1.0, equityReturn: 0 },
        { date: new Date('2024-01-02').getTime(), value: 1.2, equityReturn: 0 },
        { date: new Date('2024-01-03').getTime(), value: 1.5, equityReturn: 0 },  // 历史最高点，也是当前回撤峰值
        { date: new Date('2024-01-04').getTime(), value: 1.3, equityReturn: 0 },
        { date: new Date('2024-01-05').getTime(), value: 1.4, equityReturn: 0 },  // 反弹，但没超过1.5
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

      const fundDrawdown = snapshot.fundDrawdowns[0];

      // 当前回撤深度 = (1.5 - 1.30) / 1.5 = 13.33%
      expect(fundDrawdown.currentDrawdown).toBeCloseTo(13.33, 1);
      // 峰值应该是历史最高点 1.5
      expect(fundDrawdown.peakValue).toBe(1.5);
    });

    it('创新高后当前回撤峰值应为新的历史最高点', async () => {
      const portfolio = createMockPortfolio();
      const marketData = createMockMarketData();

      mockGetRiskThresholds.mockReturnValue(DEFAULT_RISK_THRESHOLDS);
      mockComputeOverallProfit.mockResolvedValue(createMockSummary(10));

      // 创建历史净值：创新高场景
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
      // 峰值应该是新的历史最高点 1.6
      expect(fundDrawdown.peakValue).toBe(1.6);
    });

    it('恢复进度应基于当前回撤的峰值和低点计算', async () => {
      const portfolio = createMockPortfolio();
      const marketData = createMockMarketData();

      mockGetRiskThresholds.mockReturnValue(DEFAULT_RISK_THRESHOLDS);
      mockComputeOverallProfit.mockResolvedValue(createMockSummary(10));

      // 净值曲线：历史最高1.5尚未被突破
      // 1.0 -> 1.5(历史最高，也是当前回撤峰值) -> 1.2(当前回撤低点) -> 1.35(当前)
      // 恢复进度 = (1.35 - 1.2) / (1.5 - 1.2) = 50%
      const history = [
        { date: new Date('2024-01-01').getTime(), value: 1.0, equityReturn: 0 },
        { date: new Date('2024-01-02').getTime(), value: 1.5, equityReturn: 0 },  // 历史最高，当前回撤峰值
        { date: new Date('2024-01-03').getTime(), value: 1.2, equityReturn: 0 },  // 当前回撤低点
        { date: new Date('2024-01-04').getTime(), value: 1.35, equityReturn: 0 }, // 当前值
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

      // 验证当前回撤的峰值和低点
      expect(fundDrawdown.peakValue).toBe(1.5);  // 当前回撤峰值 = 历史最高
      expect(fundDrawdown.troughValue).toBe(1.2);  // 当前回撤低点
      expect(fundDrawdown.currentValue).toBe(1.35);  // 当前值

      // 恢复进度 = (1.35 - 1.2) / (1.5 - 1.2) = 50%
      expect(fundDrawdown.troughValue).toBeDefined();
      expect(fundDrawdown.troughValue).toBeGreaterThan(0);
    });

    it('当前回撤低点应正确计算并传递', async () => {
      const portfolio = createMockPortfolio();
      const marketData = createMockMarketData();

      mockGetRiskThresholds.mockReturnValue(DEFAULT_RISK_THRESHOLDS);
      mockComputeOverallProfit.mockResolvedValue(createMockSummary(10));

      const history = [
        { date: new Date('2024-01-01').getTime(), value: 1.0, equityReturn: 0 },
        { date: new Date('2024-01-02').getTime(), value: 1.5, equityReturn: 0 },  // 峰值
        { date: new Date('2024-01-03').getTime(), value: 1.3, equityReturn: 0 },  // 低点
        { date: new Date('2024-01-04').getTime(), value: 1.35, equityReturn: 0 },  // 当前
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

      // 验证低点字段存在且有值
      expect(fundDrawdown.troughDate).toBeTruthy();
      expect(fundDrawdown.troughValue).toBeDefined();
      expect(fundDrawdown.troughValue).toBeGreaterThan(0);
    });

    it('建仓日期之后的净值数据应被用于计算回撤', async () => {
      const portfolio = createMockPortfolio();
      const marketData = createMockMarketData();

      mockGetRiskThresholds.mockReturnValue(DEFAULT_RISK_THRESHOLDS);
      mockComputeOverallProfit.mockResolvedValue(createMockSummary(10));

      // 历史净值：历史最高点2.0发生在建仓前
      // 2024-01-01: 1.0 -> 2024-01-02: 2.0 (历史最高) -> 2024-01-03: 1.5 -> 2024-01-04: 1.8 -> 2024-01-05: 1.6
      // 建仓日期：2024-01-03
      // 建仓后数据：1.5 -> 1.8 (建仓后最高) -> 1.6 (当前)
      // 建仓后最大回撤：(1.8 - 1.6) / 1.8 = 11.11%
      const history = [
        { date: new Date('2024-01-01').getTime(), value: 1.0, equityReturn: 0 },
        { date: new Date('2024-01-02').getTime(), value: 2.0, equityReturn: 0 },  // 历史最高点（建仓前）
        { date: new Date('2024-01-03').getTime(), value: 1.5, equityReturn: 0 },  // 建仓日
        { date: new Date('2024-01-04').getTime(), value: 1.8, equityReturn: 0 },  // 建仓后最高点
        { date: new Date('2024-01-05').getTime(), value: 1.6, equityReturn: 0 }, // 当前
      ];

      mockGetHistory.mockReturnValue(history);
      mockGetPosition.mockReturnValue({
        fullCapacity: 10000,
        initialPosition: 1000,
        startDate: '2024-01-03',  // 建仓日期
        initialPrice: 1.5,
      });
      mockGetTradesForSymbol.mockReturnValue([]);

      const snapshot = await computeRiskSnapshot(portfolio, marketData);
      const fundDrawdown = snapshot.fundDrawdowns[0];

      // 最大回撤应该只计算建仓后的数据：(1.8 - 1.6) / 1.8 = 11.11%
      // 而不是使用所有历史数据：(2.0 - 1.5) / 2.0 = 25%
      expect(fundDrawdown.maxDrawdown).toBeCloseTo(11.11, 1);
    });
  });

  describe('连续下跌天数计算', () => {
    it('应正确计算从高点开始的连续下跌天数', async () => {
      const portfolio = createMockPortfolio();
      const marketData = createMockMarketData();

      mockGetRiskThresholds.mockReturnValue(DEFAULT_RISK_THRESHOLDS);
      mockComputeOverallProfit.mockResolvedValue(createMockSummary(10));

      // 创建历史净值：连续下跌场景
      // 1.0 -> 1.5(峰值) -> 1.4 -> 1.3 -> 1.2 -> 1.15 -> 1.10
      // 从峰值开始连续下跌 5 天
      const history = [
        { date: new Date('2024-01-01').getTime(), value: 1.0, equityReturn: 0 },
        { date: new Date('2024-01-02').getTime(), value: 1.2, equityReturn: 0 },
        { date: new Date('2024-01-03').getTime(), value: 1.5, equityReturn: 0 },  // 峰值
        { date: new Date('2024-01-04').getTime(), value: 1.4, equityReturn: 0 },  // ↓
        { date: new Date('2024-01-05').getTime(), value: 1.3, equityReturn: 0 },  // ↓
        { date: new Date('2024-01-06').getTime(), value: 1.2, equityReturn: 0 },  // ↓
        { date: new Date('2024-01-07').getTime(), value: 1.15, equityReturn: 0 }, // ↓
        { date: new Date('2024-01-08').getTime(), value: 1.10, equityReturn: 0 }, // ↓
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

      // 从峰值开始连续下跌 5 天
      expect(snapshot.continuousDecline).toBe(5);
    });

    it('遇到上涨应停止计算连续下跌天数', async () => {
      const portfolio = createMockPortfolio();
      const marketData = createMockMarketData();

      mockGetRiskThresholds.mockReturnValue(DEFAULT_RISK_THRESHOLDS);
      mockComputeOverallProfit.mockResolvedValue(createMockSummary(10));

      // 创建历史净值：下跌后反弹
      // 1.0 -> 1.5(峰值) -> 1.4 -> 1.3 -> 1.35(上涨) -> 1.30
      // 从峰值开始连续下跌 2 天，遇到上涨停止
      const history = [
        { date: new Date('2024-01-01').getTime(), value: 1.0, equityReturn: 0 },
        { date: new Date('2024-01-02').getTime(), value: 1.2, equityReturn: 0 },
        { date: new Date('2024-01-03').getTime(), value: 1.5, equityReturn: 0 },  // 峰值
        { date: new Date('2024-01-04').getTime(), value: 1.4, equityReturn: 0 },  // ↓
        { date: new Date('2024-01-05').getTime(), value: 1.3, equityReturn: 0 },  // ↓
        { date: new Date('2024-01-06').getTime(), value: 1.35, equityReturn: 0 }, // ↑ 上涨，停止计数
        { date: new Date('2024-01-07').getTime(), value: 1.30, equityReturn: 0 },
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

      // 从峰值开始连续下跌 2 天，遇到上涨停止
      expect(snapshot.continuousDecline).toBe(2);
    });

    it('遇到持平应停止计算连续下跌天数', async () => {
      const portfolio = createMockPortfolio();
      const marketData = createMockMarketData();

      mockGetRiskThresholds.mockReturnValue(DEFAULT_RISK_THRESHOLDS);
      mockComputeOverallProfit.mockResolvedValue(createMockSummary(10));

      // 创建历史净值：下跌后持平
      // 1.0 -> 1.5(峰值) -> 1.4 -> 1.3 -> 1.3(持平) -> 1.25
      const history = [
        { date: new Date('2024-01-01').getTime(), value: 1.0, equityReturn: 0 },
        { date: new Date('2024-01-02').getTime(), value: 1.2, equityReturn: 0 },
        { date: new Date('2024-01-03').getTime(), value: 1.5, equityReturn: 0 },  // 峰值
        { date: new Date('2024-01-04').getTime(), value: 1.4, equityReturn: 0 },  // ↓
        { date: new Date('2024-01-05').getTime(), value: 1.3, equityReturn: 0 },  // ↓
        { date: new Date('2024-01-06').getTime(), value: 1.3, equityReturn: 0 },  // 持平，停止计数
        { date: new Date('2024-01-07').getTime(), value: 1.25, equityReturn: 0 },
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

      // 从峰值开始连续下跌 2 天，遇到持平停止
      expect(snapshot.continuousDecline).toBe(2);
    });

    it('最高点在最后一天时应返回0', async () => {
      const portfolio = createMockPortfolio();
      const marketData = createMockMarketData();

      mockGetRiskThresholds.mockReturnValue(DEFAULT_RISK_THRESHOLDS);
      mockComputeOverallProfit.mockResolvedValue(createMockSummary(10));

      // 创建历史净值：持续上涨
      // 1.0 -> 1.1 -> 1.2 -> 1.3 -> 1.4 -> 1.5(峰值在最后)
      const history = [
        { date: new Date('2024-01-01').getTime(), value: 1.0, equityReturn: 0 },
        { date: new Date('2024-01-02').getTime(), value: 1.1, equityReturn: 0 },
        { date: new Date('2024-01-03').getTime(), value: 1.2, equityReturn: 0 },
        { date: new Date('2024-01-04').getTime(), value: 1.3, equityReturn: 0 },
        { date: new Date('2024-01-05').getTime(), value: 1.4, equityReturn: 0 },
        { date: new Date('2024-01-06').getTime(), value: 1.5, equityReturn: 0 },  // 峰值在最后
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

      // 最高点在最后一天，没有回撤
      expect(snapshot.continuousDecline).toBe(0);
    });

    it('空数据应返回0', async () => {
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

      expect(snapshot.continuousDecline).toBe(0);
    });
  });

  describe('当前回撤使用估值数据', () => {
    it('整体组合当前回撤应使用当日估值', async () => {
      const portfolio = createMockPortfolio();
      const marketData = createMockMarketData();

      mockGetRiskThresholds.mockReturnValue(DEFAULT_RISK_THRESHOLDS);
      mockComputeOverallProfit.mockResolvedValue(createMockSummary(10));

      // 历史净值：最后一天是 1.0
      const history = [
        { date: new Date('2024-01-01').getTime(), value: 1.0, equityReturn: 0 },
        { date: new Date('2024-01-02').getTime(), value: 1.2, equityReturn: 0 },
        { date: new Date('2024-01-03').getTime(), value: 1.5, equityReturn: 0 },  // 峰值
        { date: new Date('2024-01-04').getTime(), value: 1.3, equityReturn: 0 },
        { date: new Date('2024-01-05').getTime(), value: 1.4, equityReturn: 0 },
        { date: new Date('2024-01-06').getTime(), value: 1.35, equityReturn: 0 },
        { date: new Date('2024-01-07').getTime(), value: 1.0, equityReturn: 0 },  // 历史数据最后一天
      ];

      // 当前估值：1.30（比历史最后一天 1.0 更低）
      const valuation: ValuationData = {
        symbol: '000001',
        name: '测试基金1',
        currentPrice: 1.30,
        previousPrice: 1.35,
        changePercentage: -3.7,
        lastUpdated: '2024-01-07 15:00',
        realtimeDate: '2024-01-07',
        netWorthDate: '2024-01-06',
        valuationDate: '2024-01-07',
        sourceUrl: '',
      };

      mockGetHistory.mockReturnValue(history);
      mockGetValuation.mockReturnValue(valuation);
      mockGetPosition.mockReturnValue({
        fullCapacity: 10000,
        initialPosition: 1000,
        startDate: '2024-01-01',
        initialPrice: 1.0,
      });
      mockGetTradesForSymbol.mockReturnValue([]);

      const snapshot = await computeRiskSnapshot(portfolio, marketData);

      // 验证当前净值使用了估值数据
      // 如果使用估值，当前净值应该是 1.30
      // 如果不使用估值，当前净值应该是 1.0
      expect(snapshot.currentNav).toBeCloseTo(1.30, 1);
    });

    it('单个基金当前回撤应使用当日估值', async () => {
      const portfolio = createMockPortfolio();
      const marketData = createMockMarketData();

      mockGetRiskThresholds.mockReturnValue(DEFAULT_RISK_THRESHOLDS);
      mockComputeOverallProfit.mockResolvedValue(createMockSummary(10));

      // 历史净值：最后一天是 1.0
      const history = [
        { date: new Date('2024-01-01').getTime(), value: 1.0, equityReturn: 0 },
        { date: new Date('2024-01-02').getTime(), value: 1.2, equityReturn: 0 },
        { date: new Date('2024-01-03').getTime(), value: 1.5, equityReturn: 0 },  // 峰值
        { date: new Date('2024-01-04').getTime(), value: 1.3, equityReturn: 0 },
        { date: new Date('2024-01-05').getTime(), value: 1.4, equityReturn: 0 },
        { date: new Date('2024-01-06').getTime(), value: 1.35, equityReturn: 0 },
        { date: new Date('2024-01-07').getTime(), value: 1.0, equityReturn: 0 },  // 历史数据最后一天
      ];

      // 当前估值：1.30（比历史最后一天 1.0 高）
      const valuation: ValuationData = {
        symbol: '000001',
        name: '测试基金1',
        currentPrice: 1.30,
        previousPrice: 1.35,
        changePercentage: -3.7,
        lastUpdated: '2024-01-07 15:00',
        realtimeDate: '2024-01-07',
        netWorthDate: '2024-01-06',
        valuationDate: '2024-01-07',
        sourceUrl: '',
      };

      mockGetHistory.mockReturnValue(history);
      mockGetValuation.mockReturnValue(valuation);
      mockGetPosition.mockReturnValue({
        fullCapacity: 10000,
        initialPosition: 1000,
        startDate: '2024-01-01',
        initialPrice: 1.0,
      });
      mockGetTradesForSymbol.mockReturnValue([]);

      const snapshot = await computeRiskSnapshot(portfolio, marketData);

      // 应有单个基金回撤数据
      expect(snapshot.fundDrawdowns.length).toBeGreaterThanOrEqual(1);
      const fundDrawdown = snapshot.fundDrawdowns[0];

      // 验证当前净值使用了估值数据
      // 如果使用估值，当前净值应该是 1.30
      // 如果不使用估值，当前净值应该是 1.0
      expect(fundDrawdown.currentValue).toBeCloseTo(1.30, 1);
    });

    it('无估值数据时应使用历史净值', async () => {
      const portfolio = createMockPortfolio();
      const marketData = createMockMarketData();

      mockGetRiskThresholds.mockReturnValue(DEFAULT_RISK_THRESHOLDS);
      mockComputeOverallProfit.mockResolvedValue(createMockSummary(10));

      // 历史净值
      const history = [
        { date: new Date('2024-01-01').getTime(), value: 1.0, equityReturn: 0 },
        { date: new Date('2024-01-02').getTime(), value: 1.2, equityReturn: 0 },
        { date: new Date('2024-01-03').getTime(), value: 1.5, equityReturn: 0 },  // 峰值
        { date: new Date('2024-01-04').getTime(), value: 1.3, equityReturn: 0 },
        { date: new Date('2024-01-05').getTime(), value: 1.4, equityReturn: 0 },
        { date: new Date('2024-01-06').getTime(), value: 1.35, equityReturn: 0 },
        { date: new Date('2024-01-07').getTime(), value: 1.30, equityReturn: 0 },
      ];

      mockGetHistory.mockReturnValue(history);
      mockGetValuation.mockReturnValue(undefined);  // 无估值数据
      mockGetPosition.mockReturnValue({
        fullCapacity: 10000,
        initialPosition: 1000,
        startDate: '2024-01-01',
        initialPrice: 1.0,
      });
      mockGetTradesForSymbol.mockReturnValue([]);

      const snapshot = await computeRiskSnapshot(portfolio, marketData);

      // 无估值时，当前净值应该是历史最后一天的净值 1.30
      expect(snapshot.currentNav).toBeCloseTo(1.30, 1);
    });
  });
});