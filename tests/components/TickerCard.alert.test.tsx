import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { act } from 'react';
import { TickerCard, ALERT_VISIBILITY_DAYS } from '../../components/TickerCard';
import { Ticker, TickerAlert } from '../../types';
import { formatDateDisplay } from '../../utils/dateFormat';

const sampleTicker: Ticker = {
  id: '1',
  symbol: '000001',
  name: 'Sample Fund',
  market: 'Fund' as any
};

const mockFetchHistory = jest.fn().mockResolvedValue([]);

async function flushAct() {
  await act(async () => {
    await Promise.resolve();
  });
}

// 辅助函数：根据基准日期和偏移天数生成日期字符串 (yyyy/MM/dd)
function getDateOffset(baseDate: Date, offsetDays: number): string {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + offsetDays);
  return formatDateDisplay(date);
}

describe('TickerCard alert display', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 固定当前日期为 2024-01-14
  const FIXED_DATE = new Date('2024-01-14T12:00:00');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FIXED_DATE);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('does not show alert icon when no alerts', async () => {
    await act(async () => {
      render(<TickerCard ticker={sampleTicker} fetchHistory={mockFetchHistory} />);
    });
    await flushAct();

    expect(screen.queryByLabelText('提示信息')).not.toBeInTheDocument();
  });

  test(`does not show alert icon when alerts are outside ${ALERT_VISIBILITY_DAYS}-day window`, async () => {
    // 日期超出范围：今天 + ALERT_VISIBILITY_DAYS + 1 天
    const dateOutsideWindow = getDateOffset(FIXED_DATE, ALERT_VISIBILITY_DAYS + 1);

    const tickerWithOldAlert: Ticker = {
      ...sampleTicker,
      alert_list: [
        { type: 'holiday', date: dateOutsideWindow, content: 'Future event' }
      ]
    };

    await act(async () => {
      render(<TickerCard ticker={tickerWithOldAlert} fetchHistory={mockFetchHistory} />);
    });
    await flushAct();

    expect(screen.queryByLabelText('提示信息')).not.toBeInTheDocument();
  });

  test(`shows alert icon when alert is within ${ALERT_VISIBILITY_DAYS} days (inclusive)`, async () => {
    // 日期在范围内：今天 + ALERT_VISIBILITY_DAYS 天（边界值）
    const dateInsideWindow = getDateOffset(FIXED_DATE, ALERT_VISIBILITY_DAYS);

    const tickerWithAlert: Ticker = {
      ...sampleTicker,
      alert_list: [
        { type: 'holiday', date: dateInsideWindow, content: 'Boundary event' }
      ]
    };

    await act(async () => {
      render(<TickerCard ticker={tickerWithAlert} fetchHistory={mockFetchHistory} />);
    });
    await flushAct();

    expect(screen.getByLabelText('提示信息')).toBeInTheDocument();
  });

  test('shows alert icon for tomorrow', async () => {
    const tomorrowDate = getDateOffset(FIXED_DATE, 1);

    const tickerWithAlert: Ticker = {
      ...sampleTicker,
      alert_list: [
        { type: 'holiday', date: tomorrowDate, content: 'Tomorrow event' }
      ]
    };

    await act(async () => {
      render(<TickerCard ticker={tickerWithAlert} fetchHistory={mockFetchHistory} />);
    });
    await flushAct();

    expect(screen.getByLabelText('提示信息')).toBeInTheDocument();
  });

  test('shows alert icon for today', async () => {
    const todayDate = formatDateDisplay(FIXED_DATE);

    const tickerWithTodayAlert: Ticker = {
      ...sampleTicker,
      alert_list: [
        { type: 'delivery', date: todayDate, content: 'Today event' }
      ]
    };

    await act(async () => {
      render(<TickerCard ticker={tickerWithTodayAlert} fetchHistory={mockFetchHistory} />);
    });
    await flushAct();

    expect(screen.getByLabelText('提示信息')).toBeInTheDocument();
  });

  test('shows tooltip with alerts on hover', async () => {
    const tomorrowDate = getDateOffset(FIXED_DATE, 1);
    const laterDate = getDateOffset(FIXED_DATE, 3);

    const tickerWithAlerts: Ticker = {
      ...sampleTicker,
      alert_list: [
        { type: 'holiday', date: tomorrowDate, content: 'Tomorrow holiday' },
        { type: 'delivery', date: laterDate, content: 'Future delivery' }
      ]
    };

    await act(async () => {
      render(<TickerCard ticker={tickerWithAlerts} fetchHistory={mockFetchHistory} />);
    });
    await flushAct();

    const alertIcon = screen.getByLabelText('提示信息');
    fireEvent.mouseEnter(alertIcon);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toBeInTheDocument();
    // holiday 类型不显示日期，只显示 content
    expect(tooltip.textContent).toContain('Tomorrow holiday');
    // delivery 类型在前面显示日期
    expect(tooltip.textContent).toContain(laterDate);
    expect(tooltip.textContent).toContain('Future delivery');
  });
});