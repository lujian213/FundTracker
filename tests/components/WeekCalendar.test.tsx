import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import WeekCalendar from '../../components/WeekCalendar';

describe('WeekCalendar', () => {
  const mockProps = {
    calendarYear: 2024,
    calendarMonth: 1,
    calendarProfitMap: {
      '2024-01-15': 100,
      '2024-01-16': 200,
      '2024-01-17': -50,
      '2024-01-18': 150,
      '2024-01-19': 80,
      '2024-01-20': -20,
      '2024-01-21': 120,
    },
    chartFromDate: '2024-01-15',
    chartEndDate: '2024-03-20',
    canGoPrevMonth: true,
    canGoNextMonth: true,
    onPrevMonth: jest.fn(),
    onNextMonth: jest.fn(),
    onWeekClick: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correct number of weeks for January 2024', () => {
    render(<WeekCalendar {...mockProps} />);

    // 2024年1月有5周
    const weekCells = screen.getAllByText(/至/);
    expect(weekCells.length).toBe(5);
  });

  it('should display correct date range format', () => {
    render(<WeekCalendar {...mockProps} />);

    // 检查第一周的日期范围格式：01-01至01-07
    expect(screen.getByText('01-01至01-07')).toBeInTheDocument();

    // 检查最后一周的日期范围格式：01-29至02-04
    expect(screen.getByText('01-29至02-04')).toBeInTheDocument();
  });

  it('should display year and month in header', () => {
    render(<WeekCalendar {...mockProps} />);

    expect(screen.getByText('2024年1月')).toBeInTheDocument();
  });

  it('should call onPrevMonth when clicking prev button', () => {
    render(<WeekCalendar {...mockProps} />);

    const prevButton = screen.getByLabelText('上一月');
    fireEvent.click(prevButton);

    expect(mockProps.onPrevMonth).toHaveBeenCalledTimes(1);
  });

  it('should call onNextMonth when clicking next button', () => {
    render(<WeekCalendar {...mockProps} />);

    const nextButton = screen.getByLabelText('下一月');
    fireEvent.click(nextButton);

    expect(mockProps.onNextMonth).toHaveBeenCalledTimes(1);
  });

  it('should disable prev button when canGoPrevMonth is false', () => {
    const props = {
      ...mockProps,
      canGoPrevMonth: false,
    };

    render(<WeekCalendar {...props} />);

    const prevButton = screen.getByLabelText('上一月');
    expect(prevButton).toBeDisabled();
  });

  it('should disable next button when canGoNextMonth is false', () => {
    const props = {
      ...mockProps,
      canGoNextMonth: false,
    };

    render(<WeekCalendar {...props} />);

    const nextButton = screen.getByLabelText('下一月');
    expect(nextButton).toBeDisabled();
  });

  it('should not call navigation when button is disabled', () => {
    const props = {
      ...mockProps,
      canGoPrevMonth: false,
    };

    render(<WeekCalendar {...props} />);

    const prevButton = screen.getByLabelText('上一月');
    fireEvent.click(prevButton);

    expect(mockProps.onPrevMonth).not.toHaveBeenCalled();
  });

  it('should display "-" for weeks with zero profit or out of range', () => {
    render(<WeekCalendar {...mockProps} />);

    // 第一周（01-01至01-07）不在范围内，应该显示 "-"
    const firstWeekCell = screen.getByText('01-01至01-07').closest('div');
    expect(firstWeekCell).toHaveTextContent('-');
  });

  it('should display profit with correct sign for in-range weeks', () => {
    // 创建一个在范围内的周数据
    const profitMap = {
      '2024-01-15': 100,
      '2024-01-16': 200,
      '2024-01-17': -50,
      '2024-01-18': 150,
      '2024-01-19': 80,
      '2024-01-20': -20,
      '2024-01-21': 120,
    };

    render(<WeekCalendar {...mockProps} calendarProfitMap={profitMap} />);

    // 第三周（01-15至01-21）在范围内且盈利为正，应该显示 "+580"
    // 使用 getAllByText 找到所有包含该文本的元素，然后找到外层容器
    const weekLabels = screen.getAllByText('01-15至01-21', { exact: true });
    const outerDiv = weekLabels[0].parentElement?.parentElement;
    expect(outerDiv).toHaveTextContent('+580');
  });

  it('should call onWeekClick with correct parameters when clicking clickable week', () => {
    render(<WeekCalendar {...mockProps} />);

    // 点击第三周（01-15至01-21），这个周在范围内
    const thirdWeekCell = screen.getByText('01-15至01-21').closest('div');
    if (thirdWeekCell) {
      fireEvent.click(thirdWeekCell);
      expect(mockProps.onWeekClick).toHaveBeenCalledWith('2024-01-15', '2024-01-21');
    }
  });

  it('should not call onWeekClick when clicking disabled week', () => {
    render(<WeekCalendar {...mockProps} />);

    // 点击第一周（01-01至01-07），这个周不在范围内
    const firstWeekCell = screen.getByText('01-01至01-07').closest('div');
    if (firstWeekCell) {
      fireEvent.click(firstWeekCell);
      expect(mockProps.onWeekClick).not.toHaveBeenCalled();
    }
  });

  it('should apply correct background color for positive profit', () => {
    const profitMap = {
      '2024-01-15': 500, // 正盈利
    };

    render(<WeekCalendar {...mockProps} calendarProfitMap={profitMap} />);

    const weekLabel = screen.getByText('01-15至01-21', { exact: true });
    // parentElement 是包含背景色的周格子容器
    const outerDiv = weekLabel.parentElement;
    expect(outerDiv?.className).toContain('bg-red-50');
  });

  it('should apply correct background color for negative profit', () => {
    const profitMap = {
      '2024-01-15': -200, // 负盈利
    };

    render(<WeekCalendar {...mockProps} calendarProfitMap={profitMap} />);

    const weekLabel = screen.getByText('01-15至01-21', { exact: true });
    const outerDiv = weekLabel.parentElement;
    expect(outerDiv?.className).toContain('bg-green-50');
  });

  it('should apply gray background for disabled weeks', () => {
    render(<WeekCalendar {...mockProps} />);

    // 第一周不在范围内，应该是灰色背景
    const weekLabel = screen.getByText('01-01至01-07', { exact: true });
    const outerDiv = weekLabel.parentElement;
    expect(outerDiv?.className).toContain('bg-gray-100');
    expect(outerDiv?.className).toContain('cursor-not-allowed');
  });
});