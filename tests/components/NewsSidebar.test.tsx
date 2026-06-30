// tests/components/NewsSidebar.test.tsx

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import NewsSidebar from '../../components/NewsSidebar';
import { getFastNews } from '../../services/marketNewsService';
import { getTimerJobScheduler } from '../../services/timerJobScheduler';

// Mock marketNewsService
jest.mock('../../services/marketNewsService');

// Mock timerJobScheduler
jest.mock('../../services/timerJobScheduler');

const mockGetFastNews = getFastNews as jest.MockedFunction<typeof getFastNews>;
const mockGetTimerJobScheduler = getTimerJobScheduler as jest.MockedFunction<typeof getTimerJobScheduler>;

describe('NewsSidebar', () => {
  const mockTriggerJob = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    mockGetFastNews.mockClear();
    mockTriggerJob.mockClear();
    mockGetTimerJobScheduler.mockReturnValue({
      _triggerJob: mockTriggerJob,
    } as any);
    // 默认返回空数组
    mockGetFastNews.mockReturnValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const mockNews = [
    {
      code: '1',
      title: '测试快讯标题',
      summary: '测试摘要内容',
      showTime: '2026-06-17 11:11:50',
      titleColor: 3,
      url: 'https://example.com',
    },
  ];

  it('should be hidden when not visible', () => {
    mockGetFastNews.mockReturnValue([]);
    render(<NewsSidebar isVisible={false} onClose={() => {}} />);

    // The sidebar is hidden but still in DOM with translate-x-full class
    const sidebar = screen.getByText(/财经快讯/).closest('div[class*="fixed"]');
    expect(sidebar).toHaveClass('translate-x-full');
  });

  it('should display cached news when visible', async () => {
    mockGetFastNews.mockReturnValue(mockNews);

    await act(async () => {
      render(<NewsSidebar isVisible={true} onClose={() => {}} />);
    });

    await waitFor(() => {
      expect(screen.getByText('测试快讯标题')).toBeInTheDocument();
    });
  });

  it('should show loading state when cache is empty', async () => {
    mockGetFastNews.mockReturnValue([]);

    await act(async () => {
      render(<NewsSidebar isVisible={true} onClose={() => {}} />);
    });

    // 当缓存为空时，isLoading=true，显示加载动画
    await waitFor(() => {
      expect(screen.getByText(/财经快讯/)).toBeInTheDocument();
      // 验证刷新按钮有 animate-spin 类（表示正在加载）
      const refreshButton = screen.getByLabelText('刷新快讯');
      expect(refreshButton.querySelector('i')).toHaveClass('animate-spin');
    });
  });

  it('should update news on fast-news-cache-updated event', async () => {
    mockGetFastNews.mockReturnValue([]);

    await act(async () => {
      render(<NewsSidebar isVisible={true} onClose={() => {}} />);
    });

    // Initially shows loading
    const refreshButton = screen.getByLabelText('刷新快讯');
    expect(refreshButton.querySelector('i')).toHaveClass('animate-spin');

    // Update cache and dispatch event
    mockGetFastNews.mockReturnValue(mockNews);
    await act(async () => {
      window.dispatchEvent(new CustomEvent('fast-news-cache-updated'));
    });

    // Should show news now
    await waitFor(() => {
      expect(screen.getByText('测试快讯标题')).toBeInTheDocument();
    });
  });

  it('should call onClose after mouseleave delay', async () => {
    const onClose = jest.fn();
    mockGetFastNews.mockReturnValue(mockNews);

    await act(async () => {
      render(<NewsSidebar isVisible={true} onClose={onClose} />);
    });

    const sidebar = screen.getByText(/财经快讯/).closest('div[class*="fixed"]');

    fireEvent.mouseLeave(sidebar!);

    // Wait 300ms
    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(onClose).toHaveBeenCalled();
  });

  it('should cancel close on mouseenter', async () => {
    const onClose = jest.fn();
    mockGetFastNews.mockReturnValue(mockNews);

    await act(async () => {
      render(<NewsSidebar isVisible={true} onClose={onClose} />);
    });

    const sidebar = screen.getByText(/财经快讯/).closest('div[class*="fixed"]');

    fireEvent.mouseLeave(sidebar!);

    // Wait 200ms (less than 300ms)
    act(() => {
      jest.advanceTimersByTime(200);
    });

    // Mouse enters again
    fireEvent.mouseEnter(sidebar!);

    // Wait another 300ms
    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('should trigger background job on refresh button click', async () => {
    mockGetFastNews.mockReturnValue(mockNews);

    await act(async () => {
      render(<NewsSidebar isVisible={true} onClose={() => {}} />);
    });

    const refreshButton = screen.getByLabelText('刷新快讯');
    fireEvent.click(refreshButton);

    expect(mockTriggerJob).toHaveBeenCalledWith('fast-news-refresh');
  });

  it('should display news count', async () => {
    mockGetFastNews.mockReturnValue(mockNews);

    await act(async () => {
      render(<NewsSidebar isVisible={true} onClose={() => {}} />);
    });

    await waitFor(() => {
      expect(screen.getByText('1 条快讯')).toBeInTheDocument();
    });
  });
});