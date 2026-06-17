// tests/components/NewsSidebar.test.tsx

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import NewsSidebar from '../../components/NewsSidebar';
import { fetchFastNews } from '../../services/marketNewsService';

// Mock fetchFastNews
jest.mock('../../services/marketNewsService');

const mockFetchFastNews = fetchFastNews as jest.MockedFunction<typeof fetchFastNews>;

describe('NewsSidebar', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockFetchFastNews.mockClear();
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
    mockFetchFastNews.mockResolvedValue([]);
    render(<NewsSidebar isVisible={false} onClose={() => {}} />);

    // The sidebar is hidden but still in DOM with translate-x-full class
    const sidebar = screen.getByText(/财经快讯/).closest('div[class*="fixed"]');
    expect(sidebar).toHaveClass('translate-x-full');
  });

  it('should fetch and display news when visible', async () => {
    mockFetchFastNews.mockResolvedValue(mockNews);

    await act(async () => {
      render(<NewsSidebar isVisible={true} onClose={() => {}} />);
    });

    await waitFor(() => {
      expect(screen.getByText('测试快讯标题')).toBeInTheDocument();
    });
  });

  it('should call onClose after mouseleave delay', async () => {
    const onClose = jest.fn();
    mockFetchFastNews.mockResolvedValue(mockNews);

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
    mockFetchFastNews.mockResolvedValue(mockNews);

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

  it('should auto-refresh every 30 seconds when visible', async () => {
    mockFetchFastNews.mockResolvedValue(mockNews);

    await act(async () => {
      render(<NewsSidebar isVisible={true} onClose={() => {}} />);
    });

    expect(mockFetchFastNews).toHaveBeenCalledTimes(1);

    // Wait 30 seconds
    act(() => {
      jest.advanceTimersByTime(30000);
    });

    await waitFor(() => {
      expect(mockFetchFastNews).toHaveBeenCalledTimes(2);
    });
  });

  it('should stop auto-refresh when hidden', async () => {
    mockFetchFastNews.mockResolvedValue(mockNews);

    const { rerender } = await act(async () => {
      return render(<NewsSidebar isVisible={true} onClose={() => {}} />);
    });

    expect(mockFetchFastNews).toHaveBeenCalledTimes(1);

    // Hide sidebar
    await act(async () => {
      rerender(<NewsSidebar isVisible={false} onClose={() => {}} />);
    });

    // Wait 30 seconds
    act(() => {
      jest.advanceTimersByTime(30000);
    });

    // Should not have called again
    expect(mockFetchFastNews).toHaveBeenCalledTimes(1);
  });
});