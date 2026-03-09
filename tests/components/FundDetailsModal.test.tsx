import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FundDetailsModal } from '../../components/FundDetailsModal';
import { ValuationData } from '../../types';

// Mock fetchFundHistory
jest.mock('../../services/fundService', () => ({
  fetchFundHistory: jest.fn()
}));

import { fetchFundHistory } from '../../services/fundService';

// Provide HistoricalPoint[] with date, value, equityReturn (at least 10 points for SMA10)
const SAMPLE_HISTORY = [
  { date: 1670000000000, value: 1.00, equityReturn: 0.00 },
  { date: 1670000001000, value: 1.01, equityReturn: 0.01 },
  { date: 1670000002000, value: 1.02, equityReturn: 0.01 },
  { date: 1670000003000, value: 1.03, equityReturn: 0.01 },
  { date: 1670000004000, value: 1.04, equityReturn: 0.01 },
  { date: 1670000005000, value: 1.05, equityReturn: 0.01 },
  { date: 1670000006000, value: 1.06, equityReturn: 0.01 },
  { date: 1670000007000, value: 1.07, equityReturn: 0.01 },
  { date: 1670000008000, value: 1.08, equityReturn: 0.01 },
  { date: 1670000009000, value: 1.09, equityReturn: 0.01 },
  { date: 1670000010000, value: 1.10, equityReturn: 0.01 },
  { date: 1670000011000, value: 1.11, equityReturn: 0.01 }
];

describe('FundDetailsModal SMA behavior', () => {
  const data: ValuationData = {
    symbol: '000001',
    name: 'Sample Fund',
    currentPrice: 1.11,
    previousPrice: 1.10,
    changePercentage: 0.96,
    lastUpdated: '2026-02-12 15:00',
    realtimeDate: '2026-02-12',
    netWorthDate: '2026-02-11',
    valuationDate: '2026-02-12',
    sourceUrl: 'https://example.com'
  };

  beforeEach(() => {
    (fetchFundHistory as jest.Mock).mockResolvedValue(SAMPLE_HISTORY);
  });

  afterEach(() => jest.restoreAllMocks());

  test('renders SMA5 by default and toggles work', async () => {
    render(<FundDetailsModal data={data} onClose={() => {}} />);

    // wait for chart UI to render and switch to history tab (default is now intraday)
    await screen.findByText('历史趋势图');
    fireEvent.click(screen.getByText('历史趋势图'));

    // SMA5 path should be present (stroke color #eab308)
    const svg = document.querySelector('svg');
    expect(svg).toBeTruthy();

    // There should be a path with stroke '#eab308' when SMA5 visible
    const paths = svg!.querySelectorAll('path');
    let foundSMA = false;
    paths.forEach(p => { if (p.getAttribute('stroke') === '#eab308') foundSMA = true; });
    expect(foundSMA).toBe(true);

    // click 5 toggle to hide
    const btn5 = screen.getByRole('button', { name: '切换显示 MA5' });
    fireEvent.click(btn5);

    // now SMA5 path should not be present
    const pathsAfter = svg!.querySelectorAll('path');
    let foundAfter = false;
    pathsAfter.forEach(p => { if (p.getAttribute('stroke') === '#eab308') foundAfter = true; });
    expect(foundAfter).toBe(false);
  });

  test('rating tooltip shows reasons', async () => {
    render(<FundDetailsModal data={data} onClose={() => {}} />);
    await screen.findByText('历史趋势图');
    fireEvent.click(screen.getByText('历史趋势图'));

    const badge = screen.getByLabelText(/风险评级/);
    fireEvent.mouseEnter(badge);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toBeTruthy();
    expect(tooltip.textContent).toContain('风险分析');
    expect(tooltip.textContent).toMatch(/机会信号|风险信号|说明/);
  });

  test('rating tooltip shows golden cross when present in history', async () => {
    // Provide >=20 points so SMA20 exists. First 24 values = 1.0, last value = 1.5 to create SMA5 > SMA10 > SMA20 on last day
    const CROSS_HISTORY = Array.from({ length: 25 }).map((_, i) => ({
      date: 1670000000000 + i * 1000,
      value: i < 24 ? 1.00 : 1.50,
      equityReturn: 0.00
    }));

    (fetchFundHistory as jest.Mock).mockResolvedValue(CROSS_HISTORY);

    // set data realtimeDate to last history date so chartData will not append realtime point
    const lastDateISO = new Date(CROSS_HISTORY[CROSS_HISTORY.length - 1].date).toISOString().split('T')[0];
    const dataWithSameDate = { ...data, realtimeDate: lastDateISO, currentPrice: CROSS_HISTORY[CROSS_HISTORY.length - 1].value };

    render(<FundDetailsModal data={dataWithSameDate} onClose={() => {}} />);
    await screen.findByText('历史趋势图');
    fireEvent.click(screen.getByText('历史趋势图'));

    const badge = screen.getByLabelText(/风险评级/);
    fireEvent.mouseEnter(badge);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toMatch(/金叉/);
  });

  test('does not append synthetic realtime point when realtimeDate is ---', async () => {
    const history = Array.from({ length: 8 }).map((_, i) => ({
      date: new Date(`2025-01-${String(i + 1).padStart(2, '0')}T15:00:00`).getTime(),
      value: 1 + i * 0.01,
      equityReturn: 0.01,
    }));
    (fetchFundHistory as jest.Mock).mockResolvedValue(history);

    const noRealtimeDate = {
      ...data,
      realtimeDate: '---',
      currentPrice: 9.99,
      lastUpdated: '---',
    };

    render(<FundDetailsModal data={noRealtimeDate} onClose={() => {}} />);
    await screen.findByText('历史趋势图');
    fireEvent.click(screen.getByText('历史趋势图'));

    // The chart shows the latest confirmed history value by default; assert it equals the last history value
    const shown = await screen.findByTestId('history-current-value');
    expect(shown.textContent).toBe(history[history.length - 1].value.toFixed(4));

    // Header always shows currentPrice; ensure chart did not append a synthetic 9.9900 history point.
    expect(screen.getAllByText('9.9900')).toHaveLength(1);
  });

  test('renders colored MA toggle controls that match the chart colors', async () => {
    render(<FundDetailsModal data={data} onClose={() => {}} />);
    await screen.findByText('历史趋势图');
    fireEvent.click(screen.getByText('历史趋势图'));

    const btn5 = screen.getByRole('button', { name: '切换显示 MA5' });
    const btn10 = screen.getByRole('button', { name: '切换显示 MA10' });
    const btn20 = screen.getByRole('button', { name: '切换显示 MA20' });

    expect(btn5).toHaveStyle({ borderColor: '#eab308', color: '#eab308' });
    expect(btn10).toHaveStyle({ borderColor: '#2563eb', color: '#2563eb' });
    expect(btn20).toHaveStyle({ borderColor: '#ec4899', color: '#ec4899' });

    expect(screen.getByTestId('ma-toggle-dot-5')).toHaveStyle({ backgroundColor: '#eab308' });
    expect(screen.getByTestId('ma-toggle-dot-10')).toHaveStyle({ backgroundColor: '#2563eb' });
    expect(screen.getByTestId('ma-toggle-dot-20')).toHaveStyle({ backgroundColor: '#ec4899' });
  });
});

describe('基金份额计算器', () => {
  const baseData: ValuationData = {
    symbol: '000001',
    name: 'Sample Fund',
    currentPrice: 2.0,
    previousPrice: 1.9,
    changePercentage: 0.5,
    lastUpdated: '2026-03-05 15:00',
    realtimeDate: '2026-03-05',
    netWorthDate: '2026-03-04',
    valuationDate: '2026-03-05',
    sourceUrl: 'https://example.com',
  };

  beforeEach(() => {
    (fetchFundHistory as jest.Mock).mockResolvedValue(SAMPLE_HISTORY);
  });

  afterEach(() => jest.restoreAllMocks());

  const openCalculator = async (data = baseData) => {
    render(<FundDetailsModal data={data} onClose={() => {}} />);
    await screen.findByText('历史趋势图');
    fireEvent.click(screen.getByRole('button', { name: '基金份额计算器' }));
  };

  test('点击计算器按钮打开弹窗', async () => {
    await openCalculator();
    expect(screen.getByText('基金份额计算器')).toBeInTheDocument();
  });

  test('正常金额计算份额（精确到2位小数）', async () => {
    await openCalculator();
    fireEvent.change(screen.getByLabelText('计算器金额输入'), { target: { value: '1000' } });
    // 1000 / 2.0 = 500.00
    expect(screen.getByLabelText('计算器份额输出').textContent).toBe('500.00');
  });

  test('千分位金额正确解析', async () => {
    await openCalculator();
    fireEvent.change(screen.getByLabelText('计算器金额输入'), { target: { value: '1,000' } });
    // 1000 / 2.0 = 500.00
    expect(screen.getByLabelText('计算器份额输出').textContent).toBe('500.00');
  });

  test('无效金额显示 -', async () => {
    await openCalculator();
    fireEvent.change(screen.getByLabelText('计算器金额输入'), { target: { value: 'abc' } });
    expect(screen.getByLabelText('计算器份额输出').textContent).toBe('-');
  });

  test('负数金额显示 -', async () => {
    await openCalculator();
    fireEvent.change(screen.getByLabelText('计算器金额输入'), { target: { value: '-100' } });
    expect(screen.getByLabelText('计算器份额输出').textContent).toBe('-');
  });

  test('无有效估值时显示"无法计算"并用红色字体', async () => {
    (fetchFundHistory as jest.Mock).mockResolvedValue([]);
    const noPrice = { ...baseData, currentPrice: 0, previousPrice: 0, realtimeDate: '---', netWorthDate: '---' };
    await openCalculator(noPrice);
    fireEvent.change(screen.getByLabelText('计算器金额输入'), { target: { value: '1000' } });
    const output = screen.getByLabelText('计算器份额输出');
    expect(output.textContent).toBe('无法计算');
    expect(output.className).toMatch(/text-red/);
  });

  test('无估值且无确认净值时回退到最近历史净值计算', async () => {
    const noPrice = { ...baseData, currentPrice: 0, previousPrice: 0, realtimeDate: '---', netWorthDate: '---' };
    await openCalculator(noPrice);
    fireEvent.change(screen.getByLabelText('计算器金额输入'), { target: { value: '1000' } });
    const output = screen.getByLabelText('计算器份额输出');
    // SAMPLE_HISTORY 最新值是 1.11，1000 / 1.11 = 900.90
    expect(output.textContent).toBe('900.90');
    expect(screen.getByText(/参考价格：1\.1100（历史净值）/)).toBeInTheDocument();
  });
});
