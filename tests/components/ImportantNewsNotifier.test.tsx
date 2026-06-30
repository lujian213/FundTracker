// tests/components/ImportantNewsNotifier.test.tsx

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ImportantNewsNotifier from '../../components/ImportantNewsNotifier';

describe('ImportantNewsNotifier', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Mock window.open
    window.open = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  const mockImportantNews = [
    {
      code: 'news-1',
      title: '重要快讯标题',
      summary: '重要快讯摘要内容',
      showTime: '2026-06-30 10:00:00',
      titleColor: 3,
      url: 'https://example.com/news/1',
    },
  ];

  const mockMultipleNews = [
    {
      code: 'news-1',
      title: '第一条重要快讯',
      summary: '第一条摘要',
      showTime: '2026-06-30 10:00:00',
      titleColor: 3,
      url: 'https://example.com/news/1',
    },
    {
      code: 'news-2',
      title: '第二条重要快讯',
      summary: '第二条摘要',
      showTime: '2026-06-30 10:01:00',
      titleColor: 3,
      url: 'https://example.com/news/2',
    },
  ];

  it('should listen to important-news-detected event and display notification', () => {
    render(<ImportantNewsNotifier />);

    // Initially no notification
    expect(screen.queryByText('重要快讯标题')).not.toBeInTheDocument();

    // Dispatch event
    act(() => {
      window.dispatchEvent(new CustomEvent('important-news-detected', {
        detail: { news: mockImportantNews }
      }));
    });

    // Notification should appear
    expect(screen.getByText('重要快讯标题')).toBeInTheDocument();
    expect(screen.getByText('重要快讯摘要内容')).toBeInTheDocument();
    expect(screen.getByText('重要')).toBeInTheDocument();
    expect(screen.getByText('2026-06-30 10:00:00')).toBeInTheDocument();
  });

  it('should open news detail page when clicked', () => {
    render(<ImportantNewsNotifier />);

    // Dispatch event
    act(() => {
      window.dispatchEvent(new CustomEvent('important-news-detected', {
        detail: { news: mockImportantNews }
      }));
    });

    // Click notification
    const notification = screen.getByText('重要快讯标题').closest('div');
    fireEvent.click(notification!);

    expect(window.open).toHaveBeenCalledWith(
      'https://example.com/news/1',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('should start fading after 5 seconds', () => {
    render(<ImportantNewsNotifier />);

    // Dispatch event
    act(() => {
      window.dispatchEvent(new CustomEvent('important-news-detected', {
        detail: { news: mockImportantNews }
      }));
    });

    // Notification should be visible
    const notification = screen.getByText('重要快讯标题').closest('div[class*="bg-white"]');
    expect(notification).toHaveClass('opacity-100');

    // Wait 5 seconds
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // Should start fading
    expect(notification).toHaveClass('opacity-0');
  });

  it('should remove notification after 8 seconds and show next one', () => {
    render(<ImportantNewsNotifier />);

    // Dispatch event with multiple news
    act(() => {
      window.dispatchEvent(new CustomEvent('important-news-detected', {
        detail: { news: mockMultipleNews }
      }));
    });

    // First notification should be visible
    expect(screen.getByText('第一条重要快讯')).toBeInTheDocument();
    expect(screen.queryByText('第二条重要快讯')).not.toBeInTheDocument();

    // Wait 8 seconds
    act(() => {
      jest.advanceTimersByTime(8000);
    });

    // First notification removed, second one shown
    expect(screen.queryByText('第一条重要快讯')).not.toBeInTheDocument();
    expect(screen.getByText('第二条重要快讯')).toBeInTheDocument();
  });

  it('should adjust position based on positions button', () => {
    // Mock positions button element
    const mockButton = document.createElement('button');
    mockButton.setAttribute('id', 'positions-button');
    mockButton.getBoundingClientRect = jest.fn(() => ({
      bottom: 200,
      left: 0,
      right: 100,
      top: 180,
      width: 100,
      height: 20,
      x: 0,
      y: 180,
      toJSON: () => '',
    }));
    document.body.appendChild(mockButton);

    render(<ImportantNewsNotifier />);

    // Dispatch event
    act(() => {
      window.dispatchEvent(new CustomEvent('important-news-detected', {
        detail: { news: mockImportantNews }
      }));
    });

    // Check position - should be positions button bottom + 10px
    const container = screen.getByText('重要快讯标题').closest('div[class*="fixed"]');
    expect(container).toHaveStyle({ top: '210px', right: '20px' }); // 200 + 10

    // Cleanup
    document.body.removeChild(mockButton);
  });

  it('should use default position when positions button not found', () => {
    render(<ImportantNewsNotifier />);

    // Dispatch event
    act(() => {
      window.dispatchEvent(new CustomEvent('important-news-detected', {
        detail: { news: mockImportantNews }
      }));
    });

    // Check position - default 150px top
    const container = screen.getByText('重要快讯标题').closest('div[class*="fixed"]');
    expect(container).toHaveStyle({ top: '150px', right: '20px' });
  });

  it('should handle resize events', () => {
    // Mock positions button element
    const mockButton = document.createElement('button');
    mockButton.setAttribute('id', 'positions-button');
    mockButton.getBoundingClientRect = jest.fn(() => ({
      bottom: 200,
      left: 0,
      right: 100,
      top: 180,
      width: 100,
      height: 20,
      x: 0,
      y: 180,
      toJSON: () => '',
    }));
    document.body.appendChild(mockButton);

    render(<ImportantNewsNotifier />);

    // Dispatch event
    act(() => {
      window.dispatchEvent(new CustomEvent('important-news-detected', {
        detail: { news: mockImportantNews }
      }));
    });

    // Check initial position
    let container = screen.getByText('重要快讯标题').closest('div[class*="fixed"]');
    expect(container).toHaveStyle({ top: '210px' });

    // Update button position on resize
    mockButton.getBoundingClientRect = jest.fn(() => ({
      bottom: 300,
      left: 0,
      right: 100,
      top: 280,
      width: 100,
      height: 20,
      x: 0,
      y: 280,
      toJSON: () => '',
    }));

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    // Position should update
    container = screen.getByText('重要快讯标题').closest('div[class*="fixed"]');
    expect(container).toHaveStyle({ top: '310px' }); // 300 + 10

    // Cleanup
    document.body.removeChild(mockButton);
  });

  it('should not display anything when no notifications', () => {
    render(<ImportantNewsNotifier />);

    expect(screen.queryByText('重要')).not.toBeInTheDocument();
  });

  it('should cleanup timers on unmount', () => {
    const { unmount } = render(<ImportantNewsNotifier />);

    // Dispatch event
    act(() => {
      window.dispatchEvent(new CustomEvent('important-news-detected', {
        detail: { news: mockImportantNews }
      }));
    });

    // Unmount before timer completes
    unmount();

    // Advance timers - should not cause errors
    act(() => {
      jest.advanceTimersByTime(10000);
    });

    // No errors should occur
  });

  it('should cleanup event listener on unmount', () => {
    const { unmount } = render(<ImportantNewsNotifier />);

    unmount();

    // Dispatch event after unmount
    act(() => {
      window.dispatchEvent(new CustomEvent('important-news-detected', {
        detail: { news: mockImportantNews }
      }));
    });

    // Notification should not appear
    expect(screen.queryByText('重要快讯标题')).not.toBeInTheDocument();
  });
});