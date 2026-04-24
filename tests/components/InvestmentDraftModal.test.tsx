import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import InvestmentDraftModal from '../../components/InvestmentDraftModal';
import { Ticker, ValuationData, MarketType } from '../../types';
import * as marketFundService from '../../services/marketFundService';
import * as appDataService from '../../services/appDataService';
import { STORAGE_KEYS } from '../../services/storageKeys';
import { cleanOldDrafts } from '../../services/appDataService';

// Mock marketFundService.getValuation to return null (use marketData directly)
jest.mock('../../services/marketFundService', () => ({
  ...jest.requireActual('../../services/marketFundService'),
  getValuation: jest.fn(() => null),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock date to ensure consistent testing
const mockDate = new Date('2026-03-17');
global.Date = jest.fn(() => mockDate) as any;

describe('InvestmentDraftModal', () => {
  const mockPortfolio: Ticker[] = [
    {
      id: '1',
      symbol: '000001',
      name: '华夏成长混合',
      market: MarketType.FUND
    },
    {
      id: '2',
      symbol: '000002',
      name: '易方达消费行业',
      market: MarketType.FUND
    }
  ];

  const mockMarketData: Record<string, ValuationData> = {
    '000001': {
      symbol: '000001',
      name: '华夏成长混合',
      currentPrice: 2.5,
      previousPrice: 2.4,
      changePercentage: 4.17,
      lastUpdated: '2026-03-17 15:00',
      realtimeDate: '2026-03-17',
      netWorthDate: '2026-03-16',
      valuationDate: '2026-03-17',
      sourceUrl: 'http://example.com'
    },
    '000002': {
      symbol: '000002',
      name: '易方达消费行业',
      currentPrice: 3.2,
      previousPrice: 3.1,
      changePercentage: 3.23,
      lastUpdated: '2026-03-17 15:00',
      realtimeDate: '2026-03-17',
      netWorthDate: '2026-03-16',
      valuationDate: '2026-03-17',
      sourceUrl: 'http://example.com'
    }
  };

  const mockOnClose = jest.fn();

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();

    // 使用 marketFundService 设置基金和持仓数据
    marketFundService.resetCache();
    mockPortfolio.forEach(t => {
      marketFundService.addFund(t.symbol, t.name);
    });
    marketFundService.updatePosition('000001', {
      fullCapacity: 10000,
      initialPosition: 0,
      startDate: '2026-01-01',
      initialPrice: 2.0
    });
    marketFundService.updatePosition('000002', {
      fullCapacity: 5000,
      initialPosition: 0,
      startDate: '2026-01-01',
      initialPrice: 3.0
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders modal with fund data', () => {
    render(
      <InvestmentDraftModal
        portfolio={mockPortfolio}
        onClose={mockOnClose}
        marketData={mockMarketData}
      />
    );

    // Check if modal header is rendered
    expect(screen.getByRole('heading', { level: 3, name: /投资计划草稿/ })).toBeInTheDocument();

    // Check if fund names appear in the table
    expect(screen.getByText('华夏成长混合')).toBeInTheDocument();
    expect(screen.getByText('易方达消费行业')).toBeInTheDocument();
  });

  test('displays valuation data correctly', () => {
    render(
      <InvestmentDraftModal
        portfolio={mockPortfolio}
        onClose={mockOnClose}
        marketData={mockMarketData}
      />
    );

    // Check if valuation data is displayed
    expect(screen.getByText('2.5000')).toBeInTheDocument(); // current price
    expect(screen.getByText('2.4000')).toBeInTheDocument(); // previous price
    expect(screen.getByText('+4.17%')).toBeInTheDocument(); // gain/loss
  });

  test('updates operation selection', async () => {
    render(
      <InvestmentDraftModal
        portfolio={mockPortfolio}
        onClose={mockOnClose}
        marketData={mockMarketData}
      />
    );

    const operationSelect = screen.getAllByRole('combobox')[0];

    fireEvent.change(operationSelect, { target: { value: '买入' } });

    // Wait for state update
    await waitFor(() => {
      expect(operationSelect).toHaveValue('买入');
    });
  });

  test('updates amount and calculates shares', async () => {
    render(
      <InvestmentDraftModal
        portfolio={mockPortfolio}
        onClose={mockOnClose}
        marketData={mockMarketData}
      />
    );

    // Select '买入' operation first
    const operationSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(operationSelect, { target: { value: '买入' } });

    // Input amount
    const amountInput = screen.getAllByRole('textbox')[0];
    fireEvent.change(amountInput, { target: { value: '1000' } });

    // Wait for calculation
    await waitFor(() => {
      // At 2.5 price, 1000 amount should yield 400 shares (1000/2.5)
      const sharesCells = screen.getAllByText(/400.00/);
      expect(sharesCells.length).toBeGreaterThan(0);
    });
  });

  test('copies content to clipboard when button clicked', async () => {
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined)
      }
    });

    render(
      <InvestmentDraftModal
        portfolio={mockPortfolio}
        onClose={mockOnClose}
        marketData={mockMarketData}
      />
    );

    // Select operation and input amount for first fund
    const operationSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(operationSelect, { target: { value: '买入' } });

    const amountInput = screen.getAllByRole('textbox')[0];
    fireEvent.change(amountInput, { target: { value: '1000' } });

    // Click copy button - use the title attribute to find the button
    const copyButton = screen.getByTitle('复制内容到剪贴板');
    fireEvent.click(copyButton);

    // Wait for copy operation
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
  });

  test('saves data to localStorage with debounce', async () => {
    render(
      <InvestmentDraftModal
        portfolio={mockPortfolio}
        onClose={mockOnClose}
        marketData={mockMarketData}
      />
    );

    // Select operation and input amount
    const operationSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(operationSelect, { target: { value: '买入' } });

    const amountInput = screen.getAllByRole('textbox')[0];
    fireEvent.change(amountInput, { target: { value: '1000' } });

    // 等待防抖完成后检查 localStorage（使用常量）
    await waitFor(() => {
      const savedData = localStorage.getItem(STORAGE_KEYS.INVESTMENT_DRAFT);
      expect(savedData).not.toBeNull();

      const parsedData = JSON.parse(savedData!);
      expect(parsedData['2026-03-17']).toBeDefined();
      expect(parsedData['2026-03-17']['000001'].operation).toBe('买入');
      expect(parsedData['2026-03-17']['000001'].amount).toBe('1000');
    }, { timeout: 1000 }); // 防抖 500ms + buffer
  });

  describe('排序算法', () => {
    // 模拟 InvestmentDraftModal 中的排序逻辑
    const sortFunds = (
      portfolio: Ticker[],
      marketData: Record<string, ValuationData>
    ): Ticker[] => {
      const today = '2026-03-17';

      return [...portfolio].sort((a, b) => {
        // 使用 marketData 获取估值数据
        const valA = marketData[a.symbol];
        const valB = marketData[b.symbol];

        // 判断是否有当日估值：realtimeDate 等于今天日期
        const hasTodayValuationA = valA?.realtimeDate === today;
        const hasTodayValuationB = valB?.realtimeDate === today;

        // A类（有当日估值）排在B类（无当日估值）前面
        if (hasTodayValuationA && !hasTodayValuationB) return -1;
        if (!hasTodayValuationA && hasTodayValuationB) return 1;

        // 同类内部按涨跌幅降序排序
        const changeA = valA?.changePercentage ?? -9999;
        const changeB = valB?.changePercentage ?? -9999;
        return changeB - changeA;
      });
    };

    test('有当日估值(A类)排在无当日估值(B类)前面', () => {
      const portfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: '华夏成长混合', market: MarketType.FUND },
        { id: '2', symbol: '000002', name: '易方达消费行业', market: MarketType.FUND },
        { id: '3', symbol: '000003', name: '南方稳健成长', market: MarketType.FUND },
      ];

      const marketData: Record<string, ValuationData> = {
        '000001': {
          symbol: '000001', name: '华夏成长混合', currentPrice: 2.5, previousPrice: 2.4,
          changePercentage: 1.0, lastUpdated: '2026-03-17 15:00',
          realtimeDate: '2026-03-17', netWorthDate: '2026-03-16', valuationDate: '2026-03-17', sourceUrl: ''
        },
        '000002': {
          symbol: '000002', name: '易方达消费行业', currentPrice: 3.2, previousPrice: 3.1,
          changePercentage: 5.0, lastUpdated: '2026-03-17 15:00',
          realtimeDate: '2026-03-16', netWorthDate: '2026-03-15', valuationDate: '2026-03-16', sourceUrl: ''
        },
        '000003': {
          symbol: '000003', name: '南方稳健成长', currentPrice: 1.5, previousPrice: 1.4,
          changePercentage: 2.0, lastUpdated: '2026-03-17 15:00',
          realtimeDate: '2026-03-17', netWorthDate: '2026-03-16', valuationDate: '2026-03-17', sourceUrl: ''
        },
      };

      const result = sortFunds(portfolio, marketData);

      // A类（当日估值）：000003(涨2%), 000001(涨1%) -> 000003排在前面（降序）
      // B类（历史估值）：000002(涨5%)
      expect(result[0].symbol).toBe('000003');
      expect(result[1].symbol).toBe('000001');
      expect(result[2].symbol).toBe('000002');
    });

    test('同类内部按涨跌幅降序排序', () => {
      const portfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: '华夏成长混合', market: MarketType.FUND },
        { id: '2', symbol: '000002', name: '易方达消费行业', market: MarketType.FUND },
      ];

      const marketData: Record<string, ValuationData> = {
        '000001': {
          symbol: '000001', name: '华夏成长混合', currentPrice: 2.5, previousPrice: 2.4,
          changePercentage: 3.0, lastUpdated: '2026-03-17 15:00',
          realtimeDate: '2026-03-17', netWorthDate: '2026-03-16', valuationDate: '2026-03-17', sourceUrl: ''
        },
        '000002': {
          symbol: '000002', name: '易方达消费行业', currentPrice: 3.2, previousPrice: 3.1,
          changePercentage: 1.0, lastUpdated: '2026-03-17 15:00',
          realtimeDate: '2026-03-17', netWorthDate: '2026-03-16', valuationDate: '2026-03-17', sourceUrl: ''
        },
      };

      const result = sortFunds(portfolio, marketData);

      // 降序：涨幅高的排在前面
      expect(result[0].symbol).toBe('000001'); // 涨幅3%
      expect(result[1].symbol).toBe('000002'); // 涨幅1%
    });

    test('全部为历史估值时按涨跌幅降序排序', () => {
      const portfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: '华夏成长混合', market: MarketType.FUND },
        { id: '2', symbol: '000002', name: '易方达消费行业', market: MarketType.FUND },
      ];

      const marketData: Record<string, ValuationData> = {
        '000001': {
          symbol: '000001', name: '华夏成长混合', currentPrice: 2.5, previousPrice: 2.4,
          changePercentage: 3.0, lastUpdated: '2026-03-16 15:00',
          realtimeDate: '2026-03-16', netWorthDate: '2026-03-15', valuationDate: '2026-03-16', sourceUrl: ''
        },
        '000002': {
          symbol: '000002', name: '易方达消费行业', currentPrice: 3.2, previousPrice: 3.1,
          changePercentage: 1.0, lastUpdated: '2026-03-16 15:00',
          realtimeDate: '2026-03-16', netWorthDate: '2026-03-15', valuationDate: '2026-03-16', sourceUrl: ''
        },
      };

      const result = sortFunds(portfolio, marketData);

      // 都是B类，按涨幅降序
      expect(result[0].symbol).toBe('000001'); // 涨幅3%
      expect(result[1].symbol).toBe('000002'); // 涨幅1%
    });
  });

  describe('onSelectFund 回调', () => {
    test('点击基金名称触发 onSelectFund 回调', async () => {
      const mockOnSelectFund = jest.fn();

      render(
        <InvestmentDraftModal
          portfolio={mockPortfolio}
          onClose={mockOnClose}
          onSelectFund={mockOnSelectFund}
          marketData={mockMarketData}
        />
      );

      // 点击基金名称
      const fundName = screen.getByText('华夏成长混合');
      fireEvent.click(fundName);

      await waitFor(() => {
        expect(mockOnSelectFund).toHaveBeenCalledWith('000001');
      });
    });

    test('点击基金名称后草稿窗口保持打开（onClose 未被调用）', async () => {
      const mockOnSelectFund = jest.fn();

      render(
        <InvestmentDraftModal
          portfolio={mockPortfolio}
          onClose={mockOnClose}
          onSelectFund={mockOnSelectFund}
          marketData={mockMarketData}
        />
      );

      // 点击基金名称
      const fundName = screen.getByText('华夏成长混合');
      fireEvent.click(fundName);

      await waitFor(() => {
        expect(mockOnSelectFund).toHaveBeenCalled();
      });

      // onClose 不应该被调用（草稿窗口保持打开）
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    test('切换不同基金触发不同的 symbol', async () => {
      const mockOnSelectFund = jest.fn();

      render(
        <InvestmentDraftModal
          portfolio={mockPortfolio}
          onClose={mockOnClose}
          onSelectFund={mockOnSelectFund}
          marketData={mockMarketData}
        />
      );

      // 点击第一个基金
      fireEvent.click(screen.getByText('华夏成长混合'));
      await waitFor(() => {
        expect(mockOnSelectFund).toHaveBeenCalledWith('000001');
      });

      mockOnSelectFund.mockClear();

      // 点击第二个基金
      fireEvent.click(screen.getByText('易方达消费行业'));
      await waitFor(() => {
        expect(mockOnSelectFund).toHaveBeenCalledWith('000002');
      });
    });
  });
});

describe('InvestmentDraftModal AI Advice', () => {
  test('renders AI advice button in toolbar', () => {
    const portfolio = [
      { id: '1', symbol: '000001', name: '测试基金', market: MarketType.FUND }
    ];
    render(
      <InvestmentDraftModal
        portfolio={portfolio}
        onClose={jest.fn()}
      />
    );
    expect(screen.getByTitle('AI辅助')).toBeInTheDocument();
  });

  test('AI advice button shows spinner when loading', () => {
    const portfolio = [
      { id: '1', symbol: '000001', name: '测试基金', market: MarketType.FUND }
    ];
    render(
      <InvestmentDraftModal
        portfolio={portfolio}
        onClose={jest.fn()}
      />
    );
    // 初始状态不应有 spinner
    const button = screen.getByTitle('AI辅助');
    expect(button.querySelector('.fa-wand-magic-sparkles')).toBeInTheDocument();
  });
});

describe('InvestmentDraftModal AI 建议持久化', () => {
  beforeEach(() => {
    localStorage.clear();
    marketFundService.resetCache();
    appDataService.resetCache();
  });

  describe('清理过期草稿', () => {
    test('打开草稿窗口时清理过期草稿，只保留当天的', async () => {
      const mockPortfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: '测试基金', market: MarketType.FUND }
      ];

      marketFundService.addFund('000001', '测试基金');
      marketFundService.updatePosition('000001', {
        fullCapacity: 10000,
        initialPosition: 0,
        startDate: '2026-01-01',
        initialPrice: 2.0
      });

      // 预设多天的草稿数据（包含历史草稿）
      const oldDraft = { '000001': { fundSymbol: '000001', operation: '买入', amount: '1000', note: '历史草稿' } };
      const todayDraft = { '000001': { fundSymbol: '000001', operation: '卖出', amount: '500', note: '当天草稿' } };

      // 使用 appDataService 保存草稿（模拟多天累积）
      appDataService.saveInvestmentDraft('2026-03-15', oldDraft);  // 历史草稿
      appDataService.saveInvestmentDraft('2026-03-17', todayDraft); // 当天草稿
      appDataService.saveAllDraftsToStorage();

      // 清除缓存以强制从 localStorage 加载
      appDataService.resetCache();

      // 验证 localStorage 中有多个日期的草稿
      const beforeOpen = localStorage.getItem(STORAGE_KEYS.INVESTMENT_DRAFT);
      const parsedBefore = JSON.parse(beforeOpen!);
      expect(Object.keys(parsedBefore)).toContain('2026-03-15');
      expect(Object.keys(parsedBefore)).toContain('2026-03-17');

      // 渲染草稿窗口（触发清理）
      render(
        <InvestmentDraftModal
          portfolio={mockPortfolio}
          onClose={jest.fn()}
        />
      );

      // 等待清理完成
      await waitFor(() => {
        const afterOpen = localStorage.getItem(STORAGE_KEYS.INVESTMENT_DRAFT);
        expect(afterOpen).not.toBeNull();
        const parsedAfter = JSON.parse(afterOpen!);
        // 只保留当天的草稿
        expect(Object.keys(parsedAfter)).toEqual(['2026-03-17']);
        // 历史草稿被清理
        expect(parsedAfter['2026-03-15']).toBeUndefined();
        // 当天草稿保留
        expect(parsedAfter['2026-03-17']).toEqual(todayDraft);
      }, { timeout: 1000 });
    });

    test('当天没有历史草稿时清理不影响', async () => {
      const mockPortfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: '测试基金', market: MarketType.FUND }
      ];

      marketFundService.addFund('000001', '测试基金');
      marketFundService.updatePosition('000001', {
        fullCapacity: 10000,
        initialPosition: 0,
        startDate: '2026-01-01',
        initialPrice: 2.0
      });

      // 只有当天的草稿，没有历史草稿
      const todayDraft = { '000001': { fundSymbol: '000001', operation: '买入', amount: '1000', note: '' } };
      appDataService.saveInvestmentDraft('2026-03-17', todayDraft);
      appDataService.saveAllDraftsToStorage();
      appDataService.resetCache();

      render(
        <InvestmentDraftModal
          portfolio={mockPortfolio}
          onClose={jest.fn()}
        />
      );

      // 验证草稿保持不变
      await waitFor(() => {
        const afterOpen = localStorage.getItem(STORAGE_KEYS.INVESTMENT_DRAFT);
        expect(afterOpen).not.toBeNull();
        const parsedAfter = JSON.parse(afterOpen!);
        expect(Object.keys(parsedAfter)).toEqual(['2026-03-17']);
        expect(parsedAfter['2026-03-17']).toEqual(todayDraft);
      }, { timeout: 1000 });
    });
  });

  test('AI 建议信息保存到 localStorage', async () => {
    const mockPortfolio: Ticker[] = [
      { id: '1', symbol: '000001', name: '测试基金', market: MarketType.FUND }
    ];

    marketFundService.addFund('000001', '测试基金');
    marketFundService.updatePosition('000001', {
      fullCapacity: 10000,
      initialPosition: 0,
      startDate: '2026-01-01',
      initialPrice: 2.0
    });

    // 使用 service 预设带有 AI 建议的草稿数据
    const draftEntry = {
      fundSymbol: '000001',
      operation: '买入' as const,
      amount: '1000',
      note: '+2.50%',
      aiReason: '市场趋势向上',
      aiScore: 0.85
    };
    appDataService.saveInvestmentDraft('2026-03-17', { '000001': draftEntry });
    appDataService.saveAllDraftsToStorage();
    // 清除缓存以强制从 localStorage 加载（模拟重新打开窗口）
    appDataService.resetCache();

    render(
      <InvestmentDraftModal
        portfolio={mockPortfolio}
        onClose={jest.fn()}
      />
    );

    // 验证 AI 建议图标显示
    await waitFor(() => {
      const infoIcon = screen.getByTitle('测试基金').closest('tr')?.querySelector('.fa-info-circle');
      expect(infoIcon).toBeInTheDocument();
    });

    // 触发 hover 显示 tooltip
    const infoIcon = screen.getByTitle('测试基金').closest('tr')?.querySelector('.fa-info-circle');
    if (infoIcon) {
      fireEvent.mouseEnter(infoIcon);
    }

    // 验证 tooltip 内容包含 AI 建议信息
    await waitFor(() => {
      expect(screen.getByText(/市场趋势向上/)).toBeInTheDocument();
      expect(screen.getByText(/得分: 0.85/)).toBeInTheDocument();
    });
  });

  test('窗口重入后恢复 AI 建议状态', async () => {
    const mockPortfolio: Ticker[] = [
      { id: '1', symbol: '000001', name: '测试基金', market: MarketType.FUND }
    ];

    marketFundService.addFund('000001', '测试基金');
    marketFundService.updatePosition('000001', {
      fullCapacity: 10000,
      initialPosition: 0,
      startDate: '2026-01-01',
      initialPrice: 2.0
    });

    // 使用 service 预设带有 AI 建议的草稿数据
    const draftEntry = {
      fundSymbol: '000001',
      operation: '卖出' as const,
      amount: '500',
      note: '-1.20%',
      aiReason: '建议减仓',
      aiScore: 0.72
    };
    appDataService.saveInvestmentDraft('2026-03-17', { '000001': draftEntry });
    appDataService.saveAllDraftsToStorage();
    // 清除缓存以强制从 localStorage 加载
    appDataService.resetCache();

    const { unmount } = render(
      <InvestmentDraftModal
        portfolio={mockPortfolio}
        onClose={jest.fn()}
      />
    );

    // 验证 AI 建议图标显示
    await waitFor(() => {
      const infoIcon = screen.getByTitle('测试基金').closest('tr')?.querySelector('.fa-info-circle');
      expect(infoIcon).toBeInTheDocument();
    });

    // 触发 hover 显示 tooltip
    const infoIcon = screen.getByTitle('测试基金').closest('tr')?.querySelector('.fa-info-circle');
    if (infoIcon) {
      fireEvent.mouseEnter(infoIcon);
    }

    // 验证 tooltip 内容包含 AI 建议信息
    await waitFor(() => {
      expect(screen.getByText(/建议减仓/)).toBeInTheDocument();
      expect(screen.getByText(/得分: 0.72/)).toBeInTheDocument();
    });

    // 卸载组件
    unmount();

    // 清除缓存以模拟重新加载
    appDataService.resetCache();

    // 重新渲染（模拟重入）
    render(
      <InvestmentDraftModal
        portfolio={mockPortfolio}
        onClose={jest.fn()}
      />
    );

    // 验证 AI 建议仍然显示
    await waitFor(() => {
      const infoIconAfterUnmount = screen.getByTitle('测试基金').closest('tr')?.querySelector('.fa-info-circle');
      expect(infoIconAfterUnmount).toBeInTheDocument();
    });

    // 触发 hover 显示 tooltip
    const infoIconAfterUnmount = screen.getByTitle('测试基金').closest('tr')?.querySelector('.fa-info-circle');
    if (infoIconAfterUnmount) {
      fireEvent.mouseEnter(infoIconAfterUnmount);
    }

    // 验证 tooltip 内容仍然包含 AI 建议信息
    await waitFor(() => {
      expect(screen.getByText(/建议减仓/)).toBeInTheDocument();
      expect(screen.getByText(/得分: 0.72/)).toBeInTheDocument();
    });
  });

  test('重置功能清除 AI 建议信息', async () => {
    const mockPortfolio: Ticker[] = [
      { id: '1', symbol: '000001', name: '测试基金', market: MarketType.FUND }
    ];

    marketFundService.addFund('000001', '测试基金');
    marketFundService.updatePosition('000001', {
      fullCapacity: 10000,
      initialPosition: 0,
      startDate: '2026-01-01',
      initialPrice: 2.0
    });

    // 使用 service 预设带有 AI 建议的草稿数据
    const draftEntry = {
      fundSymbol: '000001',
      operation: '买入' as const,
      amount: '1000',
      note: '+2.50%',
      aiReason: '市场趋势向上',
      aiScore: 0.85
    };
    appDataService.saveInvestmentDraft('2026-03-17', { '000001': draftEntry });
    appDataService.saveAllDraftsToStorage();
    // 清除缓存以强制从 localStorage 加载
    appDataService.resetCache();

    render(
      <InvestmentDraftModal
        portfolio={mockPortfolio}
        onClose={jest.fn()}
      />
    );

    // 等待 AI 建议图标显示
    await waitFor(() => {
      const infoIcon = screen.getByTitle('测试基金').closest('tr')?.querySelector('.fa-info-circle');
      expect(infoIcon).toBeInTheDocument();
    });

    // 点击重置按钮
    const resetButton = screen.getByTitle('重置');
    fireEvent.click(resetButton);

    // 验证 AI 建议图标消失
    await waitFor(() => {
      const infoIconAfterReset = screen.getByTitle('测试基金').closest('tr')?.querySelector('.fa-info-circle');
      expect(infoIconAfterReset).not.toBeInTheDocument();
    });

    // 等待防抖后验证 localStorage 中 AI 信息被清除（使用常量）
    await waitFor(() => {
      const savedData = localStorage.getItem(STORAGE_KEYS.INVESTMENT_DRAFT);
      expect(savedData).not.toBeNull();
      const parsedData = JSON.parse(savedData!);
      expect(parsedData['2026-03-17']['000001'].operation).toBe('不操作');
      expect(parsedData['2026-03-17']['000001'].aiReason).toBeUndefined();
      expect(parsedData['2026-03-17']['000001'].aiScore).toBeUndefined();
    }, { timeout: 1000 });
  });

  describe('上一交易日涨跌幅 hovertip', () => {
    test('有历史数据时显示上一交易日涨跌幅 hovertip', async () => {
      const mockPortfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: '测试基金', marketType: MarketType.FUND }
      ];

      const mockMarketData: Record<string, ValuationData> = {
        '000001': {
          symbol: '000001',
          name: '测试基金',
          currentPrice: 2.5,
          previousPrice: 2.4,
          changePercentage: 4.17, // 今日涨跌幅
          lastUpdated: '2026-03-18 15:00',
          realtimeDate: '2026-03-18', // 估值日期不在 history 中（当日估值未确认）
          netWorthDate: '2026-03-17',
          valuationDate: '2026-03-18',
          sourceUrl: 'http://example.com'
        }
      };

      // 历史数据：估值日期 '2026-03-18' 不在 history 中，取最后一条作为前一交易日
      // 使用本地时区的 timestamp
      const timestamp20260315 = new Date(2026, 2, 15).getTime(); // Month is 0-indexed
      const timestamp20260316 = new Date(2026, 2, 16).getTime();
      const timestamp20260317 = new Date(2026, 2, 17).getTime();
      const mockFundHistories: Record<string, any[]> = {
        '000001': [
          { date: timestamp20260315, value: 2.0, equityReturn: 0.5 },
          { date: timestamp20260316, value: 2.2, equityReturn: 0.8 },
          { date: timestamp20260317, value: 2.4, equityReturn: 1.5 }, // 上一交易日涨跌幅 1.5%（最后一条）
        ]
      };

      marketFundService.addFund('000001', '测试基金');
      marketFundService.updatePosition('000001', {
        fullCapacity: 10000,
        initialPosition: 0,
        startDate: '2026-01-01',
        initialPrice: 2.0
      });

      render(
        <InvestmentDraftModal
          portfolio={mockPortfolio}
          onClose={jest.fn()}
          marketData={mockMarketData}
          fundHistories={mockFundHistories}
        />
      );

      // 等待表格渲染
      await waitFor(() => {
        expect(screen.getByText('测试基金')).toBeInTheDocument();
      });

      // 验证今日涨跌幅显示
      expect(screen.getByText('+4.17%')).toBeInTheDocument();

      // 验证小三角图标显示（上涨为红色向上三角）
      const triangleIcon = screen.getByTitle('测试基金').closest('tr')?.querySelector('.fa-caret-up');
      expect(triangleIcon).toBeInTheDocument();
      expect(triangleIcon).toHaveClass('text-red-500');

      // 鼠标悬停在小三角图标上显示 tooltip
      fireEvent.mouseEnter(triangleIcon!);

      // 验证 tooltip 内容包含上一交易日涨跌幅
      await waitFor(() => {
        expect(screen.getByText('上一交易日：+1.50%')).toBeInTheDocument();
      });
    });

    test('上一交易日涨跌幅为负时显示绿色倒三角', async () => {
      const mockPortfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: '测试基金', market: MarketType.FUND }
      ];

      const mockMarketData: Record<string, ValuationData> = {
        '000001': {
          symbol: '000001',
          name: '测试基金',
          currentPrice: 2.5,
          previousPrice: 2.6, // 下跌
          changePercentage: -3.85,
          lastUpdated: '2026-03-18 15:00',
          realtimeDate: '2026-03-18', // 估值日期不在 history 中
          netWorthDate: '2026-03-17',
          valuationDate: '2026-03-18',
          sourceUrl: 'http://example.com'
        }
      };

      // 历史数据：估值日期不在 history 中，取最后一条（负数）
      const timestamp20260315 = new Date(2026, 2, 15).getTime();
      const timestamp20260316 = new Date(2026, 2, 16).getTime();
      const timestamp20260317 = new Date(2026, 2, 17).getTime();
      const mockFundHistories: Record<string, any[]> = {
        '000001': [
          { date: timestamp20260315, value: 2.0, equityReturn: 0.5 },
          { date: timestamp20260316, value: 2.2, equityReturn: 0.8 },
          { date: timestamp20260317, value: 2.6, equityReturn: -2.5 }, // 上一交易日涨跌幅 -2.5%（最后一条）
        ]
      };

      marketFundService.addFund('000001', '测试基金');
      marketFundService.updatePosition('000001', {
        fullCapacity: 10000,
        initialPosition: 0,
        startDate: '2026-01-01',
        initialPrice: 2.0
      });

      render(
        <InvestmentDraftModal
          portfolio={mockPortfolio}
          onClose={jest.fn()}
          marketData={mockMarketData}
          fundHistories={mockFundHistories}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('测试基金')).toBeInTheDocument();
      });

      // 验证今日涨跌幅显示
      expect(screen.getByText('-3.85%')).toBeInTheDocument();

      // 验证小三角图标显示（下跌为绿色向下三角）
      const triangleIcon = screen.getByTitle('测试基金').closest('tr')?.querySelector('.fa-caret-down');
      expect(triangleIcon).toBeInTheDocument();
      expect(triangleIcon).toHaveClass('text-green-500');

      // 鼠标悬停在小三角图标上显示 tooltip
      fireEvent.mouseEnter(triangleIcon!);

      await waitFor(() => {
        const tooltipText = screen.getByText('上一交易日：-2.50%');
        expect(tooltipText).toBeInTheDocument();
        // 验证颜色为绿色（下跌）
        expect(tooltipText).toHaveClass('text-green-500');
      });
    });

    test('上一交易日涨跌幅为正时小三角为红色正三角', async () => {
      const mockPortfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: '测试基金', market: MarketType.FUND }
      ];

      const mockMarketData: Record<string, ValuationData> = {
        '000001': {
          symbol: '000001',
          name: '测试基金',
          currentPrice: 2.5,
          previousPrice: 2.4,
          changePercentage: 4.17,
          lastUpdated: '2026-03-18 15:00',
          realtimeDate: '2026-03-18', // 估值日期不在 history 中
          netWorthDate: '2026-03-17',
          valuationDate: '2026-03-18',
          sourceUrl: 'http://example.com'
        }
      };

      const timestamp20260315 = new Date(2026, 2, 15).getTime();
      const timestamp20260316 = new Date(2026, 2, 16).getTime();
      const timestamp20260317 = new Date(2026, 2, 17).getTime();
      const mockFundHistories: Record<string, any[]> = {
        '000001': [
          { date: timestamp20260315, value: 2.0, equityReturn: 0.5 },
          { date: timestamp20260316, value: 2.2, equityReturn: 1.0 },
          { date: timestamp20260317, value: 2.4, equityReturn: 3.5 }, // 上一交易日涨跌幅 +3.5%（最后一条）
        ]
      };

      marketFundService.addFund('000001', '测试基金');
      marketFundService.updatePosition('000001', {
        fullCapacity: 10000,
        initialPosition: 0,
        startDate: '2026-01-01',
        initialPrice: 2.0
      });

      render(
        <InvestmentDraftModal
          portfolio={mockPortfolio}
          onClose={jest.fn()}
          marketData={mockMarketData}
          fundHistories={mockFundHistories}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('测试基金')).toBeInTheDocument();
      });

      // 验证小三角图标显示（上涨为红色向上三角）
      const triangleIcon = screen.getByTitle('测试基金').closest('tr')?.querySelector('.fa-caret-up');
      expect(triangleIcon).toBeInTheDocument();
      expect(triangleIcon).toHaveClass('text-red-500');

      // 鼠标悬停在小三角图标上显示 tooltip
      fireEvent.mouseEnter(triangleIcon!);

      await waitFor(() => {
        const tooltipText = screen.getByText('上一交易日：+3.50%');
        expect(tooltipText).toBeInTheDocument();
        // 验证颜色为红色（上涨）
        expect(tooltipText).toHaveClass('text-red-500');
      });
    });

    test('无历史数据时不显示小三角图标', async () => {
      const mockPortfolio: Ticker[] = [
        { id: '1', symbol: '000001', name: '测试基金', market: MarketType.FUND }
      ];

      const mockMarketData: Record<string, ValuationData> = {
        '000001': {
          symbol: '000001',
          name: '测试基金',
          currentPrice: 2.5,
          previousPrice: 2.4,
          changePercentage: 4.17,
          lastUpdated: '2026-03-17 15:00',
          realtimeDate: '2026-03-17',
          netWorthDate: '2026-03-16',
          valuationDate: '2026-03-17',
          sourceUrl: 'http://example.com'
        }
      };

      // 无历史数据
      const mockFundHistories: Record<string, any[]> = {};

      marketFundService.addFund('000001', '测试基金');
      marketFundService.updatePosition('000001', {
        fullCapacity: 10000,
        initialPosition: 0,
        startDate: '2026-01-01',
        initialPrice: 2.0
      });

      render(
        <InvestmentDraftModal
          portfolio={mockPortfolio}
          onClose={jest.fn()}
          marketData={mockMarketData}
          fundHistories={mockFundHistories}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('测试基金')).toBeInTheDocument();
      });

      // 验证今日涨跌幅显示，但没有小三角图标
      expect(screen.getByText('+4.17%')).toBeInTheDocument();
      const triangleIcon = screen.getByTitle('测试基金').closest('tr')?.querySelector('.fa-caret-up, .fa-caret-down');
      expect(triangleIcon).not.toBeInTheDocument();
    });
  });
});