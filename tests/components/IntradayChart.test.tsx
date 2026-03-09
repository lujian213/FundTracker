import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import IntradayChart from '../../components/IntradayChart';
import { IntradayPoint } from '../../types';

describe('IntradayChart', () => {
  test('renders placeholder when no points', () => {
    render(<IntradayChart points={[]} />);
    expect(screen.getByText(/暂无日内数据/)).toBeTruthy();
  });

  test('renders svg and tooltip on hover', () => {
    const pts: IntradayPoint[] = [
      { timestamp: 1678320000000, value: 1.0, equityReturn: 0 },
      { timestamp: 1678320060000, value: 1.1, equityReturn: 1.0 },
    ];
    const { container } = render(<IntradayChart points={pts} width={600} height={200} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    // simulate hover on the second point by dispatching mouseenter on rect overlay
    const rects = container.querySelectorAll('rect');
    // There are multiple rects; find the overlay rects by width/height attributes maybe; choose last overlay
    const overlays = Array.from(rects).filter(r => r.getAttribute('fill') === 'transparent');
    expect(overlays.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(overlays[overlays.length - 1]);
    // Tooltip text contains value
    expect(container.textContent).toMatch(/1.1000/);
  });
});

