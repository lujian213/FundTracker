import { getOverallProfitPresetRange } from '../../utils/overallProfitDatePresets';

describe('overallProfitDatePresets', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('returns the expected preset ranges for a regular March date', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-07T12:00:00'));

    expect(getOverallProfitPresetRange('today')).toEqual({
      fromDate: '2026-03-06',
      toDate: '2026-03-07',
      wasClipped: false,
    });
    expect(getOverallProfitPresetRange('yesterday')).toEqual({
      fromDate: '2026-03-05',
      toDate: '2026-03-06',
      wasClipped: false,
    });
    expect(getOverallProfitPresetRange('thisMonth')).toEqual({
      fromDate: '2026-02-28',
      toDate: '2026-03-07',
      wasClipped: false,
    });
    expect(getOverallProfitPresetRange('lastMonth')).toEqual({
      fromDate: '2026-01-31',
      toDate: '2026-02-28',
      wasClipped: false,
    });
    expect(getOverallProfitPresetRange('thisYear')).toEqual({
      fromDate: '2025-12-31',
      toDate: '2026-03-07',
      wasClipped: false,
    });
    expect(getOverallProfitPresetRange('lastYear')).toEqual({
      fromDate: '2024-12-31',
      toDate: '2025-12-31',
      wasClipped: false,
    });
  });

  test('handles January cross-year presets correctly', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-15T09:30:00'));

    expect(getOverallProfitPresetRange('today')).toEqual({
      fromDate: '2026-01-14',
      toDate: '2026-01-15',
      wasClipped: false,
    });
    expect(getOverallProfitPresetRange('yesterday')).toEqual({
      fromDate: '2026-01-13',
      toDate: '2026-01-14',
      wasClipped: false,
    });
    expect(getOverallProfitPresetRange('thisMonth')).toEqual({
      fromDate: '2025-12-31',
      toDate: '2026-01-15',
      wasClipped: false,
    });
    expect(getOverallProfitPresetRange('lastMonth')).toEqual({
      fromDate: '2025-11-30',
      toDate: '2025-12-31',
      wasClipped: false,
    });
  });

  test('handles year boundary for today/yesterday presets correctly', () => {
    jest.useFakeTimers();
    // 1月1日测试跨年边界
    jest.setSystemTime(new Date('2026-01-01T10:00:00'));

    expect(getOverallProfitPresetRange('today')).toEqual({
      fromDate: '2025-12-31',
      toDate: '2026-01-01',
      wasClipped: false,
    });
    expect(getOverallProfitPresetRange('yesterday')).toEqual({
      fromDate: '2025-12-30',
      toDate: '2025-12-31',
      wasClipped: false,
    });
  });

  test('handles leap-year February month-end correctly', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-03-05T08:00:00'));

    expect(getOverallProfitPresetRange('thisMonth')).toEqual({
      fromDate: '2024-02-29',
      toDate: '2024-03-05',
      wasClipped: false,
    });
    expect(getOverallProfitPresetRange('lastMonth')).toEqual({
      fromDate: '2024-01-31',
      toDate: '2024-02-29',
      wasClipped: false,
    });
  });

  test('clips preset end date to the available chart end date', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-07T12:00:00'));

    expect(getOverallProfitPresetRange('thisYear', { maxToDate: '2026-02-22' })).toEqual({
      fromDate: '2025-12-31',
      toDate: '2026-02-22',
      wasClipped: true,
    });
  });
});

