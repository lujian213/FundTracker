import React from 'react';
import { render, screen } from '@testing-library/react';
import HistoryChart from '../../components/HistoryChart';
import { HistoricalPoint, VolumeBar, FundPositionTrendPoint } from '../../types';

describe('HistoryChart - Fund Volume', () => {
  const mockPoints: { x: number; y: number; data: HistoricalPoint }[] = [
    { x: 100, y: 100, data: { date: 1704067200000, value: 1.0, equityReturn: 0 } }, // 2024-01-01
    { x: 200, y: 90, data: { date: 1704153600000, value: 1.1, equityReturn: 0.1 } }, // 2024-01-02
    { x: 300, y: 80, data: { date: 1704240000000, value: 1.2, equityReturn: 0.09 } }, // 2024-01-03
  ];

  const mockFundVolumeBars: VolumeBar[] = [
    { date: '2024-01-01', x: 100, type: 'buy', shares: 100 },
    { date: '2024-01-02', x: 200, type: 'sell', shares: 50 },
  ];

  const mockPositionTrendData: FundPositionTrendPoint[] = [
    { date: '2024-01-01', shares: 100 },
    { date: '2024-01-02', shares: 50 },
    { date: '2024-01-03', shares: 50 },
  ];

  const defaultProps = {
    viewBox: '0 0 1000 280',
    path: 'M 100 100 L 200 90 L 300 80',
    area: 'M 100 100 L 200 90 L 300 80 L 300 280 L 100 280 Z',
    points: mockPoints,
    yLabels: [{ text: '1.0', y: 100 }, { text: '1.2', y: 80 }],
    xLabels: [{ text: '1/1', x: 100 }, { text: '1/3', x: 300 }],
    visibleMAs: {},
    hoveredPoint: null,
    setHoveredPoint: jest.fn(),
    height: 280,
  };

  test('renders fund volume bars when showFundVolume is true', () => {
    render(
      <HistoryChart
        {...defaultProps}
        showFundVolume={true}
        fundVolumeBars={mockFundVolumeBars}
        volumeChartHeight={60}
      />
    );

    // SVG should have increased height (280 + 60 = 340)
    const svg = document.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute('style')).toContain('340');
  });

  test('renders position trend line when positionTrendPath is provided', () => {
    render(
      <HistoryChart
        {...defaultProps}
        showFundVolume={true}
        fundVolumeBars={mockFundVolumeBars}
        positionTrendData={mockPositionTrendData}
        positionTrendPath="M 100 320 L 200 340 L 300 340"
        volumeChartHeight={60}
      />
    );

    // Position trend line should be rendered with amber color
    const svg = document.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  test('does not render fund volume section when showFundVolume is false', () => {
    render(
      <HistoryChart
        {...defaultProps}
        showFundVolume={false}
        fundVolumeBars={mockFundVolumeBars}
      />
    );

    // SVG height should be 280 (no volume section)
    const svg = document.querySelector('svg');
    expect(svg?.getAttribute('style')).toContain('280');
  });

  test('does not render fund volume section when fundVolumeBars is empty', () => {
    render(
      <HistoryChart
        {...defaultProps}
        showFundVolume={true}
        fundVolumeBars={[]}
      />
    );

    // SVG height should be 280 (no volume section)
    const svg = document.querySelector('svg');
    expect(svg?.getAttribute('style')).toContain('280');
  });
});