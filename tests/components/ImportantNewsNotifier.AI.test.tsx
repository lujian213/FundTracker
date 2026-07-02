// tests/components/ImportantNewsNotifier.AI.test.tsx

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ImportantNewsNotifier from '../../components/ImportantNewsNotifier';
import { NewsProvider, useNews } from '../../contexts/NewsContext';
import NewsAIAnalysisModal from '../../components/NewsAIAnalysisModal';

// 全局AI分析模态框组件 - 与App.tsx中的GlobalNewsAIModal一致
const GlobalNewsAIModal: React.FC = () => {
  const { aiModalNews, closeAIModal } = useNews();
  return (
    <NewsAIAnalysisModal
      key={aiModalNews?.code || 'closed'}
      isVisible={aiModalNews !== null}
      onClose={closeAIModal}
      news={aiModalNews!}
    />
  );
};

// 测试用的包装组件
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <NewsProvider>
      {children}
      <GlobalNewsAIModal />
    </NewsProvider>
  );
};

describe('ImportantNewsNotifier AI Analysis', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Mock window.open
    window.open = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  const mockNews = {
    code: 'test-001',
    title: '重要快讯标题',
    summary: '摘要内容',
    showTime: '2026-07-01 14:30:00',
    titleColor: 3,
    url: 'https://example.com'
  };

  it('should render AI analysis button when notification is visible', async () => {
    render(
      <TestWrapper>
        <ImportantNewsNotifier />
      </TestWrapper>
    );

    // Initially no notification
    expect(screen.queryByLabelText('AI分析')).not.toBeInTheDocument();

    // Dispatch event to show notification
    act(() => {
      window.dispatchEvent(new CustomEvent('important-news-detected', {
        detail: { news: [mockNews] }
      }));
    });

    // AI button should appear
    expect(screen.getByLabelText('AI分析')).toBeInTheDocument();
  });

  it('should open AI modal when AI button is clicked', async () => {
    render(
      <TestWrapper>
        <ImportantNewsNotifier />
      </TestWrapper>
    );

    // Dispatch event to show notification
    act(() => {
      window.dispatchEvent(new CustomEvent('important-news-detected', {
        detail: { news: [mockNews] }
      }));
    });

    // Click AI button
    fireEvent.click(screen.getByLabelText('AI分析'));

    // Wait for modal to appear
    await waitFor(() => {
      expect(screen.getByText('AI 快讯影响分析')).toBeInTheDocument();
    });
  });

  it('should not trigger handleClick when AI button is clicked', async () => {
    render(
      <TestWrapper>
        <ImportantNewsNotifier />
      </TestWrapper>
    );

    // Dispatch event to show notification
    act(() => {
      window.dispatchEvent(new CustomEvent('important-news-detected', {
        detail: { news: [mockNews] }
      }));
    });

    // Click AI button
    fireEvent.click(screen.getByLabelText('AI分析'));

    // window.open should not have been called
    expect(window.open).not.toHaveBeenCalled();
  });

  it('should close AI modal when onClose is triggered', async () => {
    render(
      <TestWrapper>
        <ImportantNewsNotifier />
      </TestWrapper>
    );

    // Dispatch event to show notification
    act(() => {
      window.dispatchEvent(new CustomEvent('important-news-detected', {
        detail: { news: [mockNews] }
      }));
    });

    // Click AI button
    fireEvent.click(screen.getByLabelText('AI分析'));

    // Wait for modal to appear
    await waitFor(() => {
      expect(screen.getByText('AI 快讯影响分析')).toBeInTheDocument();
    });

    // Click close button on modal
    fireEvent.click(screen.getByLabelText('关闭分析窗口'));

    // Modal should disappear
    await waitFor(() => {
      expect(screen.queryByText('AI 快讯影响分析')).not.toBeInTheDocument();
    });
  });

  it('should keep notification visible after AI modal is closed', async () => {
    render(
      <TestWrapper>
        <ImportantNewsNotifier />
      </TestWrapper>
    );

    // Dispatch event to show notification
    act(() => {
      window.dispatchEvent(new CustomEvent('important-news-detected', {
        detail: { news: [mockNews] }
      }));
    });

    // Notification should be visible
    expect(screen.getByText('重要快讯标题')).toBeInTheDocument();

    // Click AI button
    fireEvent.click(screen.getByLabelText('AI分析'));

    // Wait for modal to appear
    await waitFor(() => {
      expect(screen.getByText('AI 快讯影响分析')).toBeInTheDocument();
    });

    // Close modal
    fireEvent.click(screen.getByLabelText('关闭分析窗口'));

    // Modal should disappear
    await waitFor(() => {
      expect(screen.queryByText('AI 快讯影响分析')).not.toBeInTheDocument();
    });

    // Notification should still be visible
    expect(screen.getByText('重要快讯标题')).toBeInTheDocument();
  });
});