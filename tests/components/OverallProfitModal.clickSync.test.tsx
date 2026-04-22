import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import OverallProfitModal from '../../components/OverallProfitModal';
import { computeOverallProfit } from '../../services/fundService';

jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (node: React.ReactNode) => node,
}));

jest.mock('../../services/fundService', () => ({
  computeOverallProfit: jest.fn(),
}));

const mockSummary = {
  timeline: [
    { date: '2026-02-20', cumulativeProfit: 0, dailyProfit: 0 },
    { date: '2026-02-21', cumulativeProfit: 10, dailyProfit: 10 },
    { date: '2026-02-22', cumulativeProfit: 8, dailyProfit: -2 },
  ],
  perFund: [
    { symbol: '000001', name: 'Fund A', startDate: '2026-02-20', profitFrom: 0, profitTo: 0, profitDiff: 0 },
  ],
  perFundTimelines: {
    '000001': [
      { date: '2026-02-20', cumulativeProfit: 0 },
      { date: '2026-02-21', cumulativeProfit: 10 },
      { date: '2026-02-22', cumulativeProfit: 8 },
    ],
  },
  totalDiff: 8,
};

function formatDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

describe('OverallProfitModal chart click sync', () => {
  beforeEach(() => {
    (computeOverallProfit as jest.Mock).mockResolvedValue(mockSummary);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  function getDateInputs() {
    return Array.from(document.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
  }

  test('clicking a middle point updates pickers and table based on previous point', async () => {
    render(<OverallProfitModal onClose={() => {}} />);
    await waitFor(() => expect(computeOverallProfit).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('overall-profit-point-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('overall-profit-point-1'));

    await waitFor(() => {
      const [fromInput, toInput] = getDateInputs();
      expect(fromInput.value).toBe('2026-02-20');
      expect(toInput.value).toBe('2026-02-21');
    });

    // Table should show the fund row with date2 cumulative profit 10 and diff +10
    await waitFor(() => expect(screen.getByText('Fund A (000001)')).toBeInTheDocument());
    const diffCell = document.querySelector('tbody tr td:nth-child(4)') as HTMLElement;
    expect(diffCell.textContent?.replace(/\s+/g, '')).toBe('+10.00');
    // 期间累计显示图表完整期间的累计（从起始到终止），与日期选择器无关
    expect(screen.getByTestId('overall-period-total').textContent?.replace(/\s+/g, '')).toContain('期间累计（2026/02/20~2026/02/22）：+8.00');
  });

  test('clicking the first point sets date1 to previous calendar day and keeps table valid', async () => {
    render(<OverallProfitModal onClose={() => {}} />);
    await waitFor(() => expect(computeOverallProfit).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('overall-profit-point-0')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('overall-profit-point-0'));

    await waitFor(() => {
      const [fromInput, toInput] = getDateInputs();
      expect(fromInput.value).toBe('2026-02-19');
      expect(toInput.value).toBe('2026-02-20');
    });

    // No validation error should be shown, and table renders with zeroed values
    expect(screen.queryByText(/规则错误/)).toBeNull();
    const rows = document.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
    // All values zero show as '-'
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
    // 期间累计显示图表完整期间的累计（从起始到终止），与日期选择器无关
    expect(screen.getByTestId('overall-period-total').textContent?.replace(/\s+/g, '')).toContain('期间累计（2026/02/20~2026/02/22）：+8.00');
  });

  test('preset buttons update pickers and clip date2 to the available chart end date', async () => {
    const now = new Date();
    const chartEnd = new Date(now);
    chartEnd.setDate(chartEnd.getDate() - 14);
    const chartMid = new Date(chartEnd);
    chartMid.setDate(chartMid.getDate() - 1);
    const chartStart = new Date(chartEnd);
    chartStart.setDate(chartStart.getDate() - 2);
    const endDate = formatDate(chartEnd);
    const midDate = formatDate(chartMid);
    const startDate = formatDate(chartStart);
    const expectedFrom = `${now.getFullYear() - 1}-12-31`;

    (computeOverallProfit as jest.Mock).mockResolvedValueOnce({
      timeline: [
        { date: startDate, cumulativeProfit: 0, dailyProfit: 0 },
        { date: midDate, cumulativeProfit: 10, dailyProfit: 10 },
        { date: endDate, cumulativeProfit: 8, dailyProfit: -2 },
      ],
      perFund: [
        { symbol: '000001', name: 'Fund A', startDate: startDate, profitFrom: 0, profitTo: 0, profitDiff: 0 },
      ],
      perFundTimelines: {
        '000001': [
          { date: startDate, cumulativeProfit: 0 },
          { date: midDate, cumulativeProfit: 10 },
          { date: endDate, cumulativeProfit: 8 },
        ],
      },
      totalDiff: 8,
    });

    render(<OverallProfitModal onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole('button', { name: '快捷日期：本年' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '快捷日期：本年' }));

    await waitFor(() => {
      const [fromInput, toInput] = getDateInputs();
      expect(fromInput.value).toBe(expectedFrom);
      expect(toInput.value).toBe(endDate);
    });

    const diffCell = document.querySelector('tbody tr td:nth-child(4)') as HTMLElement;
    expect(diffCell.textContent?.replace(/\s+/g, '')).toBe('+8.00');
    // 期间累计显示图表完整期间的累计，与日期选择器无关
    const expectedStart = startDate.replace(/-/g, '/');
    const expectedEnd = endDate.replace(/-/g, '/');
    expect(screen.getByTestId('overall-period-total').textContent?.replace(/\s+/g, '')).toContain(`期间累计（${expectedStart}~${expectedEnd}）：+8.00`);
  });

  test('hover tooltip stays close to point and avoids covering it', async () => {
    render(<OverallProfitModal onClose={() => {}} />);
    await waitFor(() => expect(computeOverallProfit).toHaveBeenCalled());
    const point = await waitFor(() => screen.getByTestId('overall-profit-point-1'));

    fireEvent.mouseEnter(point);

    const tooltip = await waitFor(() => screen.getByTestId('overall-profit-tooltip'));
    const left = parseFloat((tooltip as HTMLElement).style.left);
    const top = parseFloat((tooltip as HTMLElement).style.top);

    // tooltip位置应该在容器范围内（left >= 0）
    expect(left).toBeGreaterThanOrEqual(0);
    // tooltip应该在图表区域内，不会跑到外部
    expect(left).toBeLessThanOrEqual(500);

    // 找到 SVG 内的悬停圆点
    const svg = document.querySelector('svg');
    const hoverCircle = svg?.querySelector('circle[cx][cy][r="5"]') as SVGCircleElement | null;
    if (hoverCircle) {
      const pointY = Number(hoverCircle.getAttribute('cy'));
      // Tooltip should not overlap marker: it must be above or below the point with a gap.
      expect(top + 64 <= pointY - 6 || top >= pointY + 6).toBe(true);
    }
  });
});
