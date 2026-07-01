// tests/components/NewsCard.AI.test.tsx

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import NewsCard from '../../components/NewsCard';
import { FastNewsItem } from '../../types/fastNewsTypes';

const mockNews: FastNewsItem = {
  code: 'test-001',
  title: '测试快讯',
  summary: '这是测试摘要',
  showTime: '2026-07-01 14:30:00',
  titleColor: 0,
  url: 'https://example.com'
};

describe('NewsCard AI Analysis', () => {
  test('should render AI button when onAIAnalysis provided', () => {
    render(<NewsCard news={mockNews} onAIAnalysis={jest.fn()} />);
    expect(screen.getByLabelText('AI分析')).toBeInTheDocument();
  });

  test('should not render AI button when onAIAnalysis not provided', () => {
    render(<NewsCard news={mockNews} />);
    expect(screen.queryByLabelText('AI分析')).not.toBeInTheDocument();
  });

  test('should call onAIAnalysis with news when clicked', () => {
    const mockOnAIAnalysis = jest.fn();
    render(<NewsCard news={mockNews} onAIAnalysis={mockOnAIAnalysis} />);
    fireEvent.click(screen.getByLabelText('AI分析'));
    expect(mockOnAIAnalysis).toHaveBeenCalledWith(mockNews);
  });

  test('should not trigger onClick when AI button clicked', () => {
    const mockOnClick = jest.fn();
    const mockOnAIAnalysis = jest.fn();
    render(
      <NewsCard
        news={mockNews}
        onClick={mockOnClick}
        onAIAnalysis={mockOnAIAnalysis}
      />
    );
    fireEvent.click(screen.getByLabelText('AI分析'));
    expect(mockOnClick).not.toHaveBeenCalled();
  });
});