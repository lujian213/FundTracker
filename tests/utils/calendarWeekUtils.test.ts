import { getWeeksOfMonth, calculateWeekProfit, WeekData } from '../../utils/calendarWeekUtils';

describe('getWeeksOfMonth', () => {
  it('should return 5 weeks for January 2024', () => {
    const weeks = getWeeksOfMonth(2024, 1);
    expect(weeks.length).toBe(5);

    // 第一周：01-01（周一）至 01-07（周日）
    expect(weeks[0].startDate).toBe('2024-01-01');
    expect(weeks[0].endDate).toBe('2024-01-07');
    expect(weeks[0].startDateDisplay).toBe('01-01');
    expect(weeks[0].endDateDisplay).toBe('01-07');

    // 第五周：01-29（周一）至 02-04（周日）
    expect(weeks[4].startDate).toBe('2024-01-29');
    expect(weeks[4].endDate).toBe('2024-02-04');
    expect(weeks[4].startDateDisplay).toBe('01-29');
    expect(weeks[4].endDateDisplay).toBe('02-04');
  });

  it('should return 5 weeks for February 2024', () => {
    const weeks = getWeeksOfMonth(2024, 2);
    expect(weeks.length).toBe(5);

    // 第一周：01-29（周一）至 02-04（周日），包含2月的1-4日
    expect(weeks[0].startDate).toBe('2024-01-29');
    expect(weeks[0].endDate).toBe('2024-02-04');

    // 第五周：02-26（周一）至 03-03（周日），包含2月的26-29日
    expect(weeks[4].startDate).toBe('2024-02-26');
    expect(weeks[4].endDate).toBe('2024-03-03');
  });

  it('should handle month starting on Monday', () => {
    // 2024年7月：1日是周一
    const weeks = getWeeksOfMonth(2024, 7);
    expect(weeks[0].startDate).toBe('2024-07-01');
    expect(weeks[0].endDate).toBe('2024-07-07');
  });

  it('should handle month starting on Sunday', () => {
    // 2024年9月：1日是周日，周一应该是上个月的最后一天
    const weeks = getWeeksOfMonth(2024, 9);
    expect(weeks[0].startDate).toBe('2024-08-26');
    expect(weeks[0].endDate).toBe('2024-09-01');
  });
});

describe('calculateWeekProfit', () => {
  const profitMap: Record<string, number> = {
    '2024-01-15': 100,
    '2024-01-16': 200,
    '2024-01-17': -50,
    '2024-01-18': 150,
    '2024-01-19': 80,
    '2024-01-20': -20,
    '2024-01-21': 120,
  };

  it('should calculate profit for week fully in range', () => {
    const result = calculateWeekProfit(
      '2024-01-15',
      '2024-01-21',
      profitMap,
      '2024-01-15',
      '2024-03-20'
    );

    expect(result.profit).toBe(100 + 200 - 50 + 150 + 80 - 20 + 120);
    expect(result.isInRange).toBe(true);
  });

  it('should return 0 profit for week fully out of range', () => {
    const result = calculateWeekProfit(
      '2024-01-01',
      '2024-01-07',
      profitMap,
      '2024-01-15',
      '2024-03-20'
    );

    expect(result.profit).toBe(0);
    expect(result.isInRange).toBe(false);
  });

  it('should calculate profit for week partially in range', () => {
    // 周范围：01-29 至 02-04
    // 期间范围：01-15 至 03-20
    // 只有01-29到02-04在范围内（其他天超出范围按0计算）
    const partialProfitMap: Record<string, number> = {
      '2024-01-29': 100,
      '2024-01-30': 200,
      '2024-01-31': 150,
      '2024-02-01': 80,
      '2024-02-02': -20,
      '2024-02-03': 120,
      '2024-02-04': 50,
    };

    const result = calculateWeekProfit(
      '2024-01-29',
      '2024-02-04',
      partialProfitMap,
      '2024-01-15',
      '2024-03-20'
    );

    expect(result.profit).toBe(100 + 200 + 150 + 80 - 20 + 120 + 50);
    expect(result.isInRange).toBe(true);
  });

  it('should handle missing dates in profit map', () => {
    const sparseMap: Record<string, number> = {
      '2024-01-15': 100,
      // 01-16, 01-17 等缺失
    };

    const result = calculateWeekProfit(
      '2024-01-15',
      '2024-01-21',
      sparseMap,
      '2024-01-15',
      '2024-03-20'
    );

    expect(result.profit).toBe(100); // 只有01-15有数据
    expect(result.isInRange).toBe(true);
  });

  it('should handle null chart dates', () => {
    const result = calculateWeekProfit(
      '2024-01-15',
      '2024-01-21',
      profitMap,
      null,
      null
    );

    expect(result.profit).toBe(0);
    expect(result.isInRange).toBe(false);
  });
});