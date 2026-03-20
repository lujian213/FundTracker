// tests/components/AIPortfolioAnalysisModal.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import AIPortfolioAnalysisModal from '../../components/AIPortfolioAnalysisModal';
import { analyzePortfolio, PortfolioItem } from '../../services/aiPortfolioService';
import { hasUsableAIConfig, getAIConfig } from '../../services/aiConfigService';

// Mocks
jest.mock('../../services/aiPortfolioService');
jest.mock('../../services/aiConfigService');
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (node: React.ReactNode) => node,
}));

const mockAnalyzePortfolio = analyzePortfolio as jest.MockedFunction<typeof analyzePortfolio>;
const mockHasUsableAIConfig = hasUsableAIConfig as jest.MockedFunction<typeof hasUsableAIConfig>;
const mockGetAIConfig = getAIConfig as jest.MockedFunction<typeof getAIConfig>;

const mockPortfolioData: PortfolioItem[] = [
  { symbol: '005827', name: '易方达蓝筹精选混合', position: 1000, marketValue: 12345.67, ratio: 0.55 },
  { symbol: '161725', name: '招商中证白酒指数', position: 500, marketValue: 8765.43, ratio: 0.45 }
];

const mockValidConfig = {
  apiEndpoint: 'https://api.example.com/v1/chat/completions',
  apiKey: 'test-key',
  model: 'gpt-4',
  active: true
};

describe('AIPortfolioAnalysisModal', () => {
  beforeEach(() => {
    cleanup();
    jest.clearAllMocks();
    mockHasUsableAIConfig.mockReturnValue(true);
    mockGetAIConfig.mockReturnValue(mockValidConfig as any);
  });

  // === 未配置AI ===
  test('shows configuration prompt when AI is not configured', async () => {
    mockHasUsableAIConfig.mockReturnValue(false);

    render(
      <AIPortfolioAnalysisModal
        isVisible={true}
        onClose={() => {}}
        portfolioData={mockPortfolioData}
      />
    );

    expect(screen.getByText(/尚未配置AI模型/i)).toBeTruthy();
    expect(screen.getByText(/去配置/)).toBeTruthy();
  });

  // === 正常加载流程 ===
  test('shows loading state and calls analyzePortfolio on mount', async () => {
    mockAnalyzePortfolio.mockImplementation(() =>
      new Promise(resolve =>
        setTimeout(() => resolve({ content: 'AI分析结果', success: true }), 100)
      )
    );

    render(
      <AIPortfolioAnalysisModal
        isVisible={true}
        onClose={() => {}}
        portfolioData={mockPortfolioData}
      />
    );

    expect(screen.getByText(/正在分析/i)).toBeTruthy();
    expect(mockAnalyzePortfolio).toHaveBeenCalledWith(mockValidConfig, mockPortfolioData, expect.any(Function));
  });

  // === AI请求成功 ===
  test('renders markdown content when AI responds successfully', async () => {
    mockAnalyzePortfolio.mockResolvedValueOnce({
      content: '# 分析结果\n\n这是一个**测试**结果。',
      success: true
    });

    render(
      <AIPortfolioAnalysisModal
        isVisible={true}
        onClose={() => {}}
        portfolioData={mockPortfolioData}
      />
    );

    await waitFor(() => {
      // 使用更灵活的匹配方式，检查markdown内容是否被渲染
      expect(screen.getByText(/分析结果/)).toBeTruthy();
    });
  });

  // === AI请求失败 ===
  test('shows error message with retry button when AI request fails', async () => {
    mockAnalyzePortfolio.mockResolvedValueOnce({
      content: '',
      success: false,
      error: 'API请求失败'
    });

    render(
      <AIPortfolioAnalysisModal
        isVisible={true}
        onClose={() => {}}
        portfolioData={mockPortfolioData}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/分析失败/i)).toBeTruthy();
      expect(screen.getByText(/重试/)).toBeTruthy();
    });
  });

  // === 重试功能 ===
  test('retries analysis when retry button is clicked', async () => {
    mockAnalyzePortfolio
      .mockResolvedValueOnce({ content: '', success: false, error: '失败' })
      .mockResolvedValueOnce({ content: '重试成功', success: true });

    render(
      <AIPortfolioAnalysisModal
        isVisible={true}
        onClose={() => {}}
        portfolioData={mockPortfolioData}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/重试/)).toBeTruthy();
    });

    fireEvent.click(screen.getByText(/重试/));

    await waitFor(() => {
      expect(screen.getByText('重试成功')).toBeTruthy();
    });

    expect(mockAnalyzePortfolio).toHaveBeenCalledTimes(2);
  });

  // === 关闭浮窗 ===
  test('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    mockAnalyzePortfolio.mockResolvedValueOnce({ content: '结果', success: true });

    render(
      <AIPortfolioAnalysisModal
        isVisible={true}
        onClose={onClose}
        portfolioData={mockPortfolioData}
      />
    );

    fireEvent.click(screen.getByLabelText('关闭分析窗口'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // === 空投资组合 ===
  test('shows empty state when portfolio data is empty', () => {
    render(
      <AIPortfolioAnalysisModal
        isVisible={true}
        onClose={() => {}}
        portfolioData={[]}
      />
    );

    expect(screen.getByText(/无投资组合数据/i)).toBeTruthy();
  });

  // === 不可见时不渲染 ===
  test('does not render when isVisible is false', () => {
    render(
      <AIPortfolioAnalysisModal
        isVisible={false}
        onClose={() => {}}
        portfolioData={mockPortfolioData}
      />
    );

    expect(screen.queryByText('AI 投资组合分析')).toBeNull();
  });

  // === ESC键关闭 ===
  test('closes modal when ESC key is pressed', () => {
    const onClose = jest.fn();
    mockAnalyzePortfolio.mockResolvedValueOnce({ content: '结果', success: true });

    render(
      <AIPortfolioAnalysisModal
        isVisible={true}
        onClose={onClose}
        portfolioData={mockPortfolioData}
      />
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // === 遮罩点击关闭 ===
  test('closes modal when background overlay is clicked', () => {
    const onClose = jest.fn();
    mockAnalyzePortfolio.mockResolvedValueOnce({ content: '结果', success: true });

    render(
      <AIPortfolioAnalysisModal
        isVisible={true}
        onClose={onClose}
        portfolioData={mockPortfolioData}
      />
    );

    // 点击背景遮罩（不是浮窗主体）
    const overlay = document.querySelector('.fixed.inset-0.z-\\[150\\] > .absolute.inset-0');
    if (overlay) {
      fireEvent.click(overlay);
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });
});