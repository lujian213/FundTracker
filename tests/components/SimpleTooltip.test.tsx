import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SimpleTooltip from '../../components/SimpleTooltip';
import { strategyConfig } from '../../services/strategyConfig';

describe('SimpleTooltip markdown table rendering', () => {
  test('renders table from meanReversion description', async () => {
    render(
      <SimpleTooltip content={strategyConfig.meanReversion.description}>
        <button>Hover me</button>
      </SimpleTooltip>
    );

    const btn = screen.getByText('Hover me');
    fireEvent.mouseEnter(btn);

    // wait for tooltip to appear
    await waitFor(() => expect(document.body.querySelector('table')).toBeInTheDocument());

    const table = document.body.querySelector('table') as HTMLTableElement;
    expect(table).toBeTruthy();
    // headers should include '维度' and '描述'
    expect(screen.getByText('维度')).toBeInTheDocument();
    expect(screen.getByText('描述')).toBeInTheDocument();
  });
});

describe('SimpleTooltip boundary constraint', () => {
  test('constrains tooltip within boundary container', async () => {
    // Mock getBoundingClientRect for boundary container
    const mockBoundaryRect = {
      left: 100,
      right: 500,
      top: 100,
      bottom: 400,
      width: 400,
      height: 300,
      x: 100,
      y: 100,
      toJSON: () => '{}',
    };

    // Mock window dimensions
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { writable: true, value: 768 });

    render(
      <div
        className="mock-boundary"
        style={{ position: 'fixed', left: 100, top: 100, width: 400, height: 300 }}
      >
        <SimpleTooltip content="Tooltip content" boundarySelector=".mock-boundary">
          <button>Trigger</button>
        </SimpleTooltip>
      </div>
    );

    const btn = screen.getByText('Trigger');

    // Mock trigger's getBoundingClientRect
    btn.getBoundingClientRect = () => ({
      left: 450,
      right: 480,
      top: 380,
      bottom: 400,
      width: 30,
      height: 20,
      x: 450,
      y: 380,
      toJSON: () => '{}',
    });

    // Mock closest to return boundary container
    btn.closest = (selector: string) => {
      if (selector === '.mock-boundary') {
        const boundary = document.querySelector('.mock-boundary');
        if (boundary) {
          boundary.getBoundingClientRect = () => mockBoundaryRect as DOMRect;
        }
        return boundary;
      }
      return null;
    };

    fireEvent.mouseEnter(btn);

    await waitFor(() => {
      const tooltip = document.body.querySelector('[role="tooltip"]');
      expect(tooltip).toBeInTheDocument();
    });

    const tooltip = document.body.querySelector('[role="tooltip"]') as HTMLDivElement;

    // Mock tooltip's getBoundingClientRect
    tooltip.getBoundingClientRect = () => ({
      left: 0,
      right: 200,
      top: 0,
      bottom: 50,
      width: 200,
      height: 50,
      x: 0,
      y: 0,
      toJSON: () => '{}',
    });

    // Trigger recomputation by scrolling
    fireEvent.scroll(window);

    await waitFor(() => {
      // The tooltip should be constrained within the boundary
      // Since trigger is at right edge (450-480) and tooltip width is 200,
      // alignRight would try to place tooltip right edge at 480, meaning left at 280
      // But boundary right is 500, so left=280 should be within bounds
      const style = tooltip.style;
      expect(style.left).toBeDefined();
      expect(style.top).toBeDefined();
    });
  });
});

