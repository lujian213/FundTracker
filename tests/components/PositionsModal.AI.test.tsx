// tests/components/PositionsModal.AI.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MarketType } from '../../types';
import PositionsModal from '../../components/PositionsModal';
import { Ticker, ValuationData } from '../../types';

// Mock react-dom portal
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (node: React.ReactNode) => node,
}));

// Mock AIPortfolioAnalysisModal to simplify integration test
jest.mock('../../components/AIPortfolioAnalysisModal', () => {
  return {
    __esModule: true,
    default: ({ isVisible, onClose, portfolioData }: any) => {
      if (!isVisible) return null;
      return (
        <div data-testid="ai-portfolio-modal">
          <span>AI分析浮窗</span>
          <span data-testid="portfolio-count">{portfolioData?.length || 0}只基金</span>
          <button onClick={onClose}>关闭</button>
        </div>
      );
    }
  };
});

// Mock usePositionTrend hook
jest.mock('../../hooks/usePositionTrend', () => ({
  __esModule: true,
  default: () => ({
    data: [],
    loading: false,
    fullResolutionAvailable: false,
    loadFullResolution: jest.fn(),
  }),
}));

function makeTicker(symbol: string, name: string): Ticker {
  return { id: symbol, symbol, name, market: MarketType.FUND };
}

function makeValuation(symbol: string, currentPrice: number): ValuationData {
  return {
    symbol,
    name: `Fund-${symbol}`,
    currentPrice,
    previousPrice: currentPrice * 0.99,
    changePercentage: 0,
    lastUpdated: '2026-03-01 15:00',
    realtimeDate: '2026-03-01',
    netWorthDate: '2026-02-28',
    valuationDate: '2026-03-01',
    sourceUrl: '',
  };
}

function setPosition(symbol: string, fullCapacity: number, initialPosition: number) {
  localStorage.setItem(
    `fund_position_${symbol}`,
    JSON.stringify({ fullCapacity, initialPosition })
  );
}

describe('PositionsModal - AI Analysis Integration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('renders AI analysis button next to magnifier button', () => {
    setPosition('000001', 100, 50);

    render(
      <PositionsModal
        portfolio={[makeTicker('000001', '测试基金')]}
        marketData={{ '000001': makeValuation('000001', 2.0) }}
        onClose={() => {}}
        onSelectFund={() => {}}
      />
    );

    // 查找AI分析按钮
    const aiButton = screen.getByLabelText('AI分析投资组合');
    expect(aiButton).toBeTruthy();
    expect(aiButton).toHaveAttribute('title', 'AI分析投资组合');
  });

  test('opens AI analysis modal when AI button is clicked', () => {
    setPosition('000001', 100, 50);
    setPosition('000002', 100, 40);

    render(
      <PositionsModal
        portfolio={[makeTicker('000001', '基金A'), makeTicker('000002', '基金B')]}
        marketData={{
          '000001': makeValuation('000001', 2.0),
          '000002': makeValuation('000002', 3.0),
        }}
        onClose={() => {}}
        onSelectFund={() => {}}
      />
    );

    // 点击AI分析按钮
    fireEvent.click(screen.getByLabelText('AI分析投资组合'));

    // 验证AI分析浮窗已打开
    expect(screen.getByTestId('ai-portfolio-modal')).toBeTruthy();
    expect(screen.getByTestId('portfolio-count').textContent).toBe('2只基金');
  });

  test('closes AI analysis modal when close button is clicked', () => {
    setPosition('000001', 100, 50);

    render(
      <PositionsModal
        portfolio={[makeTicker('000001', '测试基金')]}
        marketData={{ '000001': makeValuation('000001', 2.0) }}
        onClose={() => {}}
        onSelectFund={() => {}}
      />
    );

    // 打开AI分析浮窗
    fireEvent.click(screen.getByLabelText('AI分析投资组合'));
    expect(screen.getByTestId('ai-portfolio-modal')).toBeTruthy();

    // 关闭浮窗
    fireEvent.click(screen.getByText('关闭'));
    expect(screen.queryByTestId('ai-portfolio-modal')).toBeNull();
  });
});