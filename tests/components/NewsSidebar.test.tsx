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
    // 重置 body 样式
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  });

  afterEach(() => {
    jest.useRealTimers();
    // 清理 body 样式
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
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

  describe('scrollbar handling', () => {
    it('should set body overflow to hidden when sidebar becomes visible', async () => {
      mockGetFastNews.mockReturnValue(mockNews);

      const { rerender } = render(<NewsSidebar isVisible={false} onClose={() => {}} />);

      expect(document.body.style.overflow).toBe('');

      await act(async () => {
        rerender(<NewsSidebar isVisible={true} onClose={() => {}} />);
      });

      expect(document.body.style.overflow).toBe('hidden');
    });

    it('should restore body overflow when sidebar becomes hidden', async () => {
      mockGetFastNews.mockReturnValue(mockNews);

      const { rerender } = render(<NewsSidebar isVisible={true} onClose={() => {}} />);

      expect(document.body.style.overflow).toBe('hidden');

      await act(async () => {
        rerender(<NewsSidebar isVisible={false} onClose={() => {}} />);
      });

      expect(document.body.style.overflow).toBe('');
    });

    it('should add padding-right to compensate scrollbar width when visible', async () => {
      mockGetFastNews.mockReturnValue(mockNews);
      // Mock scrollbar width calculation (window.innerWidth - document.documentElement.clientWidth)
      Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
      Object.defineProperty(document.documentElement, 'clientWidth', { value: 1007, configurable: true });

      await act(async () => {
        render(<NewsSidebar isVisible={true} onClose={() => {}} />);
      });

      // 滚动条宽度 = 1024 - 1007 = 17px
      expect(document.body.style.paddingRight).toBe('17px');
    });

    it('should remove padding-right when sidebar becomes hidden', async () => {
      mockGetFastNews.mockReturnValue(mockNews);
      Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
      Object.defineProperty(document.documentElement, 'clientWidth', { value: 1007, configurable: true });

      const { rerender } = render(<NewsSidebar isVisible={true} onClose={() => {}} />);

      expect(document.body.style.paddingRight).toBe('17px');

      await act(async () => {
        rerender(<NewsSidebar isVisible={false} onClose={() => {}} />);
      });

      expect(document.body.style.paddingRight).toBe('');
    });

    it('should clean up body styles on unmount', async () => {
      mockGetFastNews.mockReturnValue(mockNews);
      Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
      Object.defineProperty(document.documentElement, 'clientWidth', { value: 1007, configurable: true });

      const { unmount } = render(<NewsSidebar isVisible={true} onClose={() => {}} />);

      expect(document.body.style.overflow).toBe('hidden');
      expect(document.body.style.paddingRight).toBe('17px');

      await act(async () => {
        unmount();
      });

      expect(document.body.style.overflow).toBe('');
      expect(document.body.style.paddingRight).toBe('');
    });
  });
});