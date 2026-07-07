import React from 'react';
import { render, screen } from '@testing-library/react';
import HistoryChart from '../../components/HistoryChart';
import { HistoricalPoint } from '../../types';

describe('HistoryChart selected points rendering', () => {
  const mockPoints = [
    { x: 100, y: 150, data: { date: 1704067200000, value: 1.2345 } as HistoricalPoint },
    { x: 200, y: 180, data: { date: 1706745600000, value: 1.4567 } as HistoricalPoint },
    { x: 300, y: 160, data: { date: 1709424000000, value: 1.3567 } as HistoricalPoint },
  ];

  const defaultProps = {
    viewBox: '0 0 1000 280',
    path: 'M 100 150 L 200 180 L 300 160',
    area: 'M 100 150 L 200 180 L 300 160 L 300 280 L 100 280 Z',
    points: mockPoints,
    yLabels: [{ text: '1.0', y: 200 }, { text: '1.5', y: 150 }],
    xLabels: [{ text: 'Jan', x: 100 }],
    visibleMAs: {},
    hoveredPoint: null,
    setHoveredPoint: jest.fn(),
  };

  it('should render no selected point markers when selectedPoints is empty or undefined', () => {
    render(<HistoryChart {...defaultProps} selectedPoints={undefined} />);
    // 不应该有橙色或紫色的圆点
    const circles = document.querySelectorAll('circle');
    const selectedCircles = Array.from(circles).filter(
      c => c.getAttribute('fill') === '#f97316' || c.getAttribute('fill') === '#8b5cf6'
    );
    expect(selectedCircles.length).toBe(0);
  });

  it('should render one selected point marker with orange color for first point', () => {
    const selectedPoints = [mockPoints[0].data];
    render(<HistoryChart {...defaultProps} selectedPoints={selectedPoints} />);

    // 应该有橙色圆点（外圈+内圈，共2个）
    const circles = document.querySelectorAll('circle');
    const orangeCircles = Array.from(circles).filter(
      c => c.getAttribute('fill') === '#f97316'
    );
    expect(orangeCircles.length).toBe(2);

    // 内圈圆点应该在正确的位置，半径为8
    const innerCircle = orangeCircles.find(c => c.getAttribute('r') === '8');
    expect(innerCircle).toBeDefined();
    expect(innerCircle?.getAttribute('cx')).toBe('100');
    expect(innerCircle?.getAttribute('cy')).toBe('150');
  });

  it('should render two selected point markers with different colors', () => {
    const selectedPoints = [mockPoints[0].data, mockPoints[1].data];
    render(<HistoryChart {...defaultProps} selectedPoints={selectedPoints} />);

    // 应该有橙色圆点（外圈+内圈，共2个）
    const orangeCircles = document.querySelectorAll('circle[fill="#f97316"]');
    expect(orangeCircles.length).toBe(2);

    // 应该有紫色圆点（外圈+内圈，共2个）
    const purpleCircles = document.querySelectorAll('circle[fill="#8b5cf6"]');
    expect(purpleCircles.length).toBe(2);
  });
});

describe('HistoryChart click detection', () => {
  const mockPoints = [
    { x: 100, y: 150, data: { date: 1704067200000, value: 1.2345 } as HistoricalPoint },
    { x: 200, y: 180, data: { date: 1706745600000, value: 1.4567 } as HistoricalPoint },
    { x: 300, y: 160, data: { date: 1709424000000, value: 1.3567 } as HistoricalPoint },
  ];

  const defaultProps = {
    viewBox: '0 0 1000 280',
    path: 'M 100 150 L 200 180 L 300 160',
    area: 'M 100 150 L 200 180 L 300 160 L 300 280 L 100 280 Z',
    points: mockPoints,
    yLabels: [{ text: '1.0', y: 200 }, { text: '1.5', y: 150 }],
    xLabels: [{ text: 'Jan', x: 100 }],
    visibleMAs: {},
    hoveredPoint: null,
    setHoveredPoint: jest.fn(),
  };

  it('should call onSelectPoint when clicking on a point in compare mode', () => {
    const onSelectPoint = jest.fn();
    render(
      <HistoryChart
        {...defaultProps}
        compareMode={true}
        onSelectPoint={onSelectPoint}
      />
    );

    // 点击第一个点的区域
    const rects = document.querySelectorAll('rect');
    // 找到对应第一个数据点的透明矩形（x - 5）
    const firstPointRect = Array.from(rects).find(
      r => r.getAttribute('x') === '95' && r.getAttribute('width') === '10'
    );

    if (firstPointRect) {
      firstPointRect.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }

    expect(onSelectPoint).toHaveBeenCalledWith(mockPoints[0].data);
  });

  it('should not call onSelectPoint when compareMode is false', () => {
    const onSelectPoint = jest.fn();
    render(
      <HistoryChart
        {...defaultProps}
        compareMode={false}
        onSelectPoint={onSelectPoint}
      />
    );

    const rects = document.querySelectorAll('rect');
    const firstPointRect = Array.from(rects).find(
      r => r.getAttribute('x') === '95' && r.getAttribute('width') === '10'
    );

    if (firstPointRect) {
      firstPointRect.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }

    expect(onSelectPoint).not.toHaveBeenCalled();
  });
});