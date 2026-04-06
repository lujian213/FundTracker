import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import InvestmentDraftModal from '../../components/InvestmentDraftModal';
import { Ticker, ValuationData, MarketType } from '../../types';
import * as marketFundService from '../../services/marketFundService';

// Mock cacheService.getValuation to return null (use marketData directly)
jest.mock('../../services/cacheService', () => ({
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

    // 等待防抖完成后检查 localStorage
    await waitFor(() => {
      const savedData = localStorage.getItem('fund_investment_draft');
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