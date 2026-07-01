// tests/components/NewsAIAnalysisModal.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import NewsAIAnalysisModal from '../../components/NewsAIAnalysisModal';
import { analyzeNewsImpact } from '../../services/newsAIAnalysisService';
import { hasUsableAIConfig, getAIConfig } from '../../services/aiConfigService';
import { getAllMarketFunds } from '../../services/marketFundService';
import { FastNewsItem } from '../../types/fastNewsTypes';

// Mocks
jest.mock('../../services/newsAIAnalysisService');
jest.mock('../../services/aiConfigService');
jest.mock('../../services/marketFundService');
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (node: React.ReactNode) => node,
}));

const mockAnalyzeNewsImpact = analyzeNewsImpact as jest.MockedFunction<typeof analyzeNewsImpact>;
const mockHasUsableAIConfig = hasUsableAIConfig as jest.MockedFunction<typeof hasUsableAIConfig>;
const mockGetAIConfig = getAIConfig as jest.MockedFunction<typeof getAIConfig>;
const mockGetAllMarketFunds = getAllMarketFunds as jest.MockedFunction<typeof getAllMarketFunds>;

const mockNews: FastNewsItem = {
  code: 'test-001',
  title: '测试快讯标题',
  summary: '测试快讯摘要内容',
  showTime: '2026-07-01 14:30:00',
  titleColor: 3,
  url: 'https://example.com/news/001'
};

const mockNormalNews: FastNewsItem = {
  code: 'test-002',
  title: '普通快讯标题',
  summary: '普通快讯摘要',
  showTime: '2026-07-01 10:00:00',
  titleColor: 0,
  url: 'https://example.com/news/002'
};

const mockValidConfig = {
  apiEndpoint: 'https://api.example.com/v1/chat/completions',
  apiKey: 'test-key',
  model: 'gpt-4',
};

const mockMarketFunds = [
  {
    info: {
      ticker: { symbol: '005827', name: '易方达蓝筹精选混合', market: 'FUND' },
      position: { fullCapacity: 10000, initialPosition: 5000 },
    },
    trades: [],
    intraday: [],
    history: [],
  }
];

describe('NewsAIAnalysisModal', () => {
  beforeEach(() => {
    cleanup();
    jest.clearAllMocks();
    mockHasUsableAIConfig.mockReturnValue(true);
    mockGetAIConfig.mockReturnValue(mockValidConfig as any);
    mockGetAllMarketFunds.mockReturnValue(mockMarketFunds as any);
  });

  // === 未配置AI ===
  test('shows configuration prompt when AI is not configured', async () => {
    mockHasUsableAIConfig.mockReturnValue(false);

    render(
      <NewsAIAnalysisModal
        isVisible={true}
        onClose={() => {}}
        news={mockNews}
      />
    );

    expect(screen.getByText(/尚未配置AI模型/i)).toBeTruthy();
    expect(screen.getByText(/去配置/)).toBeTruthy();
  });

  // === 快讯预览区域 ===
  test('displays news preview information', async () => {
    mockAnalyzeNewsImpact.mockImplementation(() =>
      new Promise(resolve =>
        setTimeout(() => resolve({ content: 'AI分析结果', success: true }), 100)
      )
    );

    render(
      <NewsAIAnalysisModal
        isVisible={true}
        onClose={() => {}}
        news={mockNews}
      />
    );

    // 验证快讯标题显示
    expect(screen.getByText(mockNews.title)).toBeTruthy();
    // 验证快讯时间显示
    expect(screen.getByText(mockNews.showTime)).toBeTruthy();
    // 验证重要标签显示（titleColor=3表示重要）
    expect(screen.getByText(/重要/)).toBeTruthy();
  });

  // === 正常加载流程 ===
  test('shows loading state and calls analyzeNewsImpact on mount', async () => {
    mockAnalyzeNewsImpact.mockImplementation(() =>
      new Promise(resolve =>
        setTimeout(() => resolve({ content: 'AI分析结果', success: true }), 100)
      )
    );

    render(
      <NewsAIAnalysisModal
        isVisible={true}
        onClose={() => {}}
        news={mockNews}
      />
    );

    expect(screen.getByText(/正在分析/i)).toBeTruthy();
    expect(mockAnalyzeNewsImpact).toHaveBeenCalledWith(
      mockValidConfig,
      mockNews,
      mockMarketFunds,
      expect.any(Function)
    );
  });

  // === AI请求成功 ===
  test('renders markdown content when AI responds successfully', async () => {
    mockAnalyzeNewsImpact.mockResolvedValueOnce({
      content: '# 影响分析\n\n该快讯可能对以下基金产生**积极影响**。',
      success: true
    });

    render(
      <NewsAIAnalysisModal
        isVisible={true}
        onClose={() => {}}
        news={mockNews}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/影响分析/)).toBeTruthy();
    });
  });

  // === AI请求失败 ===
  test('shows error message with retry button when AI request fails', async () => {
    mockAnalyzeNewsImpact.mockResolvedValueOnce({
      content: '',
      success: false,
      error: 'API请求失败'
    });

    render(
      <NewsAIAnalysisModal
        isVisible={true}
        onClose={() => {}}
        news={mockNews}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/分析失败/i)).toBeTruthy();
      expect(screen.getByText(/重试/)).toBeTruthy();
    });
  });

  // === 重试功能 ===
  test('retries analysis when retry button is clicked', async () => {
    mockAnalyzeNewsImpact
      .mockResolvedValueOnce({ content: '', success: false, error: '失败' })
      .mockResolvedValueOnce({ content: '重试成功', success: true });

    render(
      <NewsAIAnalysisModal
        isVisible={true}
        onClose={() => {}}
        news={mockNews}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/重试/)).toBeTruthy();
    });

    fireEvent.click(screen.getByText(/重试/));

    await waitFor(() => {
      expect(screen.getByText('重试成功')).toBeTruthy();
    });

    expect(mockAnalyzeNewsImpact).toHaveBeenCalledTimes(2);
  });

  // === 关闭浮窗 ===
  test('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    mockAnalyzeNewsImpact.mockResolvedValueOnce({ content: '结果', success: true });

    render(
      <NewsAIAnalysisModal
        isVisible={true}
        onClose={onClose}
        news={mockNews}
      />
    );

    fireEvent.click(screen.getByLabelText('关闭分析窗口'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // === 普通快讯无重要标签 ===
  test('does not show important tag for normal news (titleColor=0)', async () => {
    mockAnalyzeNewsImpact.mockImplementation(() =>
      new Promise(resolve =>
        setTimeout(() => resolve({ content: 'AI分析结果', success: true }), 100)
      )
    );

    render(
      <NewsAIAnalysisModal
        isVisible={true}
        onClose={() => {}}
        news={mockNormalNews}
      />
    );

    // 普通快讯不应该显示重要标签
    expect(screen.queryByText(/重要/)).toBeNull();
  });

  // === 不可见时不渲染 ===
  test('does not render when isVisible is false', () => {
    render(
      <NewsAIAnalysisModal
        isVisible={false}
        onClose={() => {}}
        news={mockNews}
      />
    );

    expect(screen.queryByText('AI 快讯影响分析')).toBeNull();
  });

  // === ESC键关闭 ===
  test('closes modal when ESC key is pressed', () => {
    const onClose = jest.fn();
    mockAnalyzeNewsImpact.mockResolvedValueOnce({ content: '结果', success: true });

    render(
      <NewsAIAnalysisModal
        isVisible={true}
        onClose={onClose}
        news={mockNews}
      />
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // === 遮罩点击关闭 ===
  test('closes modal when background overlay is clicked', () => {
    const onClose = jest.fn();
    mockAnalyzeNewsImpact.mockResolvedValueOnce({ content: '结果', success: true });

    render(
      <NewsAIAnalysisModal
        isVisible={true}
        onClose={onClose}
        news={mockNews}
      />
    );

    // 点击背景遮罩（不是浮窗主体）
    const overlay = document.querySelector('.fixed.inset-0.z-\\[150\\] > .absolute.inset-0');
    if (overlay) {
      fireEvent.click(overlay);
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });

  // === 复制功能 ===
  test('copy button copies content to clipboard', async () => {
    const mockWriteText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: mockWriteText } });

    mockAnalyzeNewsImpact.mockResolvedValueOnce({
      content: '分析结果内容',
      success: true
    });

    render(
      <NewsAIAnalysisModal
        isVisible={true}
        onClose={() => {}}
        news={mockNews}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('分析结果内容')).toBeTruthy();
    });

    // 点击复制按钮
    const copyButton = screen.getByLabelText('复制到剪贴板');
    fireEvent.click(copyButton);

    expect(mockWriteText).toHaveBeenCalledWith('分析结果内容');
  });

  // === 去配置按钮 ===
  test('triggers openAIConfig event and closes when clicking config button', () => {
    const onClose = jest.fn();
    const dispatchEventSpy = jest.spyOn(window, 'dispatchEvent');

    mockHasUsableAIConfig.mockReturnValue(false);

    render(
      <NewsAIAnalysisModal
        isVisible={true}
        onClose={onClose}
        news={mockNews}
      />
    );

    fireEvent.click(screen.getByText(/去配置/));

    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.any(CustomEvent));
    expect(onClose).toHaveBeenCalledTimes(1);

    dispatchEventSpy.mockRestore();
  });
});