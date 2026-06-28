import { HISTORY_KLINE_PERIOD_CONFIG, HistoryKlinePeriod } from '../../types';

describe('HISTORY_KLINE_PERIOD_CONFIG', () => {
  it('should have all period options', () => {
    const periods: HistoryKlinePeriod[] = ['realtime', '5min', '15min', '30min', '60min'];
    periods.forEach(p => {
      expect(HISTORY_KLINE_PERIOD_CONFIG[p]).toBeDefined();
      expect(HISTORY_KLINE_PERIOD_CONFIG[p].label).toBeTruthy();
    });
  });

  it('realtime period should use null klt', () => {
    expect(HISTORY_KLINE_PERIOD_CONFIG['realtime'].klt).toBeNull();
    expect(HISTORY_KLINE_PERIOD_CONFIG['realtime'].lmt).toBe(0);
    expect(HISTORY_KLINE_PERIOD_CONFIG['realtime'].label).toBe('日K');
  });

  it('kline periods should have valid klt values', () => {
    expect(HISTORY_KLINE_PERIOD_CONFIG['5min'].klt).toBe(5);
    expect(HISTORY_KLINE_PERIOD_CONFIG['15min'].klt).toBe(15);
    expect(HISTORY_KLINE_PERIOD_CONFIG['30min'].klt).toBe(30);
    expect(HISTORY_KLINE_PERIOD_CONFIG['60min'].klt).toBe(60);
  });

  it('lmt should be reasonable for each period (max 80 points)', () => {
    expect(HISTORY_KLINE_PERIOD_CONFIG['5min'].lmt).toBe(80);
    expect(HISTORY_KLINE_PERIOD_CONFIG['15min'].lmt).toBe(80);
    expect(HISTORY_KLINE_PERIOD_CONFIG['30min'].lmt).toBe(80);
    expect(HISTORY_KLINE_PERIOD_CONFIG['60min'].lmt).toBe(80);
  });
});