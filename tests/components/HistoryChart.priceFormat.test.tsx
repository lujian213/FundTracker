import React from 'react';
import { render, screen } from '@testing-library/react';
import HistoryChart from '../../components/HistoryChart';
import { HistoricalPoint } from '../../types';

describe('HistoryChart - Price Format', () => {
  const mockPoints: { x: number; y: number; data: HistoricalPoint }[] = [
    { x: 100, y: 100, data: { date: 1704067200000, value: 1.0, equityReturn: 0 } }, // 2024-01-01
    { x: 200, y: 90, data: { date: 1704153600000, value: 1.1234, equityReturn: 0.1 } }, // 2024-01-02
    { x: 300, y: 80, data: { date: 1704240000000, value: 1234.5678, equityReturn: 0.09 } }, // 2024-01-03
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

  describe('指数点位（priceDecimals=2）', () => {
    test('格式化大数值：千分位+2位小数', () => {
      const hoveredPoint = mockPoints[2].data; // value: 1234.5678
      render(
        <HistoryChart
          {...defaultProps}
          hoveredPoint={hoveredPoint}
          priceDecimals={2}
          showPriceLine={true}
        />
      );

      // 应显示千分位格式化，保留2位小数：1,234.57
      const priceTextElements = screen.getAllByText((content, element) => {
        return element?.textContent?.includes('1,234.57') || false;
      });

      expect(priceTextElements.length).toBeGreaterThan(0);
    });

    test('格式化小数值：2位小数（无千分位）', () => {
      const hoveredPoint = mockPoints[1].data; // value: 1.1234
      render(
        <HistoryChart
          {...defaultProps}
          hoveredPoint={hoveredPoint}
          priceDecimals={2}
          showPriceLine={true}
        />
      );

      // 小数值也应保留2位小数：1.12（无千分位）
      const priceTextElements = screen.getAllByText((content, element) => {
        return element?.textContent?.includes('1.12') || false;
      });

      expect(priceTextElements.length).toBeGreaterThan(0);
    });
  });

  describe('基金净值（priceDecimals=4）', () => {
    test('格式化大数值：千分位+4位小数', () => {
      const hoveredPoint = mockPoints[2].data; // value: 1234.5678
      render(
        <HistoryChart
          {...defaultProps}
          hoveredPoint={hoveredPoint}
          priceDecimals={4}
          showPriceLine={true}
        />
      );

      // 应显示千分位格式化，保留4位小数：1,234.5678
      const priceTextElements = screen.getAllByText((content, element) => {
        return element?.textContent?.includes('1,234.5678') || false;
      });

      expect(priceTextElements.length).toBeGreaterThan(0);
    });

    test('格式化小数值：4位小数（无千分位）', () => {
      const hoveredPoint = mockPoints[1].data; // value: 1.1234
      render(
        <HistoryChart
          {...defaultProps}
          hoveredPoint={hoveredPoint}
          priceDecimals={4}
          showPriceLine={true}
        />
      );

      // 小数值应保留4位小数：1.1234
      const priceTextElements = screen.getAllByText((content, element) => {
        return element?.textContent?.includes('1.1234') || false;
      });

      expect(priceTextElements.length).toBeGreaterThan(0);
    });
  });

  describe('持仓总金额趋势（showPriceLine=false）', () => {
    test('不渲染水平虚线和交叉点标记', () => {
      const hoveredPoint = mockPoints[1].data;
      const { container } = render(
        <HistoryChart
          {...defaultProps}
          hoveredPoint={hoveredPoint}
          showPriceLine={false}
        />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();

      // 水平虚线应该不渲染（只有垂直虚线和日期标签）
      // 检查是否有交叉点标记（circle），在 showPriceLine=false 时应该不渲染
      const circles = svg?.querySelectorAll('circle');

      // 只应该有最后一个点的脉冲动画圆点，不应该有悬停点的交叉标记
      const hoverCircleCount = circles?.length || 0;

      // 验证：只有1个圆点（脉冲动画圆点），没有交叉点标记
      expect(hoverCircleCount).toBe(1);
    });

    test('不显示价格标签', () => {
      const hoveredPoint = mockPoints[2].data; // value: 1234.5678
      render(
        <HistoryChart
          {...defaultProps}
          hoveredPoint={hoveredPoint}
          showPriceLine={false}
        />
      );

      // 价格标签不应该显示
      const priceTextElements = screen.queryAllByText((content, element) => {
        return element?.textContent?.includes('1,234') || false;
      });

      // 不应该找到价格标签
      expect(priceTextElements.length).toBe(0);
    });

    test('仍渲染垂直虚线', () => {
      const hoveredPoint = mockPoints[1].data;
      const { container } = render(
        <HistoryChart
          {...defaultProps}
          hoveredPoint={hoveredPoint}
          showPriceLine={false}
        />
      );

      const svg = container.querySelector('svg');

      // 垂直虚线应该仍然渲染
      const lines = svg?.querySelectorAll('line');
      expect(lines?.length).toBeGreaterThan(0);

      // 至少有一条垂直线（垂直虚线）
      const verticalLines = Array.from(lines || []).filter(
        line => line.getAttribute('x1') === line.getAttribute('x2')
      );
      expect(verticalLines.length).toBeGreaterThan(0);
    });
  });

  describe('默认行为（无参数）', () => {
    test('默认priceDecimals=4，千分位+4位小数', () => {
      const hoveredPoint = mockPoints[2].data; // value: 1234.5678
      render(
        <HistoryChart
          {...defaultProps}
          hoveredPoint={hoveredPoint}
        />
      );

      // 默认行为：priceDecimals=4，千分位：1,234.5678
      const priceTextElements = screen.getAllByText((content, element) => {
        return element?.textContent?.includes('1,234.5678') || false;
      });

      expect(priceTextElements.length).toBeGreaterThan(0);
    });

    test('默认showPriceLine=true，显示水平虚线', () => {
      const hoveredPoint = mockPoints[1].data;
      const { container } = render(
        <HistoryChart
          {...defaultProps}
          hoveredPoint={hoveredPoint}
        />
      );

      const svg = container.querySelector('svg');
      const circles = svg?.querySelectorAll('circle');

      // 应该有脉冲动画圆点 + 交叉点标记 = 2个圆点
      expect(circles?.length).toBeGreaterThan(1);
    });
  });
});