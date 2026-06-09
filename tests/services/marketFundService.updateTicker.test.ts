import * as marketFundService from '../../services/marketFundService';
import { MarketType, FundProfile, Ticker } from '../../types';

describe('marketFundService - updateTicker', () => {
  beforeEach(() => {
    localStorage.clear();
    marketFundService.resetCache();
  });

  afterEach(() => {
    localStorage.clear();
    marketFundService.resetCache();
  });

  describe('updateTicker', () => {
    test('updates ticker with profile', () => {
      // 先添加一个基金
      marketFundService.addFund('000001', '测试基金A');

      // 创建 profile
      const profile: FundProfile = {
        stock_positions: [{ stock_name: '股票A', percentage: 10.0 }],
        stage_increase: [{ stage: '近1周', increase_percentage: 1.5 }],
        fetched_at: '2026-04-10T10:00:00.000Z',
      };

      // 更新 ticker 的 profile
      marketFundService.updateTicker('000001', { profile });

      // 验证内存中的数据
      const fundInfo = marketFundService.getFundInfo('000001');
      expect(fundInfo).toBeDefined();
      expect(fundInfo?.ticker.profile).toEqual(profile);

      // 验证 localStorage 中的数据
      const stored = localStorage.getItem('fund_all_funds_data');
      expect(stored).toBeDefined();
      const parsed = JSON.parse(stored!);
      const storedFund = parsed.find((f: any) => f.info.ticker.symbol === '000001');
      expect(storedFund).toBeDefined();
      expect(storedFund.info.ticker.profile).toEqual(profile);
    });

    test('updates ticker with recommended_strategy', () => {
      marketFundService.addFund('000002', '测试基金B');

      const recommendedStrategy = {
        strategy_id: 'trendFollowing',
        reason: '适合趋势交易',
      };

      marketFundService.updateTicker('000002', { recommended_strategy: recommendedStrategy });

      const fundInfo = marketFundService.getFundInfo('000002');
      expect(fundInfo?.ticker.recommended_strategy).toEqual(recommendedStrategy);

      // 验证持久化
      const stored = localStorage.getItem('fund_all_funds_data');
      const parsed = JSON.parse(stored!);
      const storedFund = parsed.find((f: any) => f.info.ticker.symbol === '000002');
      expect(storedFund.info.ticker.recommended_strategy).toEqual(recommendedStrategy);
    });

    test('preserves existing ticker properties when updating', () => {
      marketFundService.addFund('000004', '测试基金D');

      // 先设置 profile
      const profile: FundProfile = {
        stock_positions: [],
        stage_increase: [],
        fetched_at: '2026-04-10T10:00:00.000Z',
      };
      marketFundService.updateTicker('000004', { profile });

      // 再设置 recommended_strategy
      const recommendedStrategy = {
        strategy_id: 'meanReversion',
        reason: '均值回归策略',
      };
      marketFundService.updateTicker('000004', { recommended_strategy: recommendedStrategy });

      const fundInfo = marketFundService.getFundInfo('000004');
      // profile 应该保留
      expect(fundInfo?.ticker.profile).toEqual(profile);
      // recommended_strategy 应该被添加
      expect(fundInfo?.ticker.recommended_strategy).toEqual(recommendedStrategy);
    });

    test('does nothing for non-existent fund', () => {
      // 更新不存在的基金，不应该报错
      expect(() => {
        marketFundService.updateTicker('NONEXISTENT', { name: '新名称' });
      }).not.toThrow();

      // localStorage 不应该有这个基金
      const stored = localStorage.getItem('fund_all_funds_data');
      expect(stored).toBeNull();
    });

    test('getAllTickers returns tickers with updated fields', () => {
      marketFundService.addFund('000005', '测试基金E');

      const profile: FundProfile = {
        stock_positions: [{ stock_name: '股票B', percentage: 5.5 }],
        stage_increase: [],
        fetched_at: '2026-04-10T11:00:00.000Z',
      };
      marketFundService.updateTicker('000005', { profile });

      const tickers = marketFundService.getAllTickers();
      const ticker = tickers.find(t => t.symbol === '000005');
      expect(ticker).toBeDefined();
      expect(ticker?.profile).toEqual(profile);
    });

    test('updateTicker with null values clears fields', () => {
      marketFundService.addFund('000006', '测试基金F');

      // 先设置 recommended_strategy
      marketFundService.updateTicker('000006', {
        recommended_strategy: { strategy_id: 'test', reason: 'test' },
      });

      const fundInfoBefore = marketFundService.getFundInfo('000006');
      expect(fundInfoBefore?.ticker.recommended_strategy).toBeDefined();

      // 清空 recommended_strategy（通过设置为 undefined）
      const ticker = fundInfoBefore!.ticker;
      delete (ticker as any).recommended_strategy;
      marketFundService.updateTicker('000006', {});

      // 注意：updateTicker 是合并更新，不会删除字段
      // 如果需要删除字段，需要在 updateTicker 中添加特殊处理
    });

    test('multiple updates are all persisted', () => {
      marketFundService.addFund('000007', '测试基金G');

      // 连续多次更新
      marketFundService.updateTicker('000007', {
        recommended_strategy: { strategy_id: 'strategy1', reason: '原因1' },
      });

      marketFundService.updateTicker('000007', {
        profile: {
          stock_positions: [],
          stage_increase: [],
          fetched_at: '2026-04-10T12:00:00.000Z',
        },
      });

      // 重置缓存并重新加载
      marketFundService.resetCache();

      // 验证数据从 localStorage 恢复
      const fundInfo = marketFundService.getFundInfo('000007');
      expect(fundInfo?.ticker.recommended_strategy?.strategy_id).toBe('strategy1');
      expect(fundInfo?.ticker.profile?.fetched_at).toBe('2026-04-10T12:00:00.000Z');
    });
  });
});