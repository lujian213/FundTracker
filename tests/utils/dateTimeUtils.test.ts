import { extractTradeDateFromF80, extractDateFromTimestamp } from '../../utils/dateTimeUtils';

describe('extractTradeDateFromF80', () => {
  test('extracts date from single period f80', () => {
    const f80 = '[{"b":202605080930,"e":202605081130}]';
    expect(extractTradeDateFromF80(f80)).toBe('2026-05-08');
  });

  test('extracts date from multi-period f80 (A股)', () => {
    const f80 = '[{"b":202605080930,"e":202605081130},{"b":202605081300,"e":202605081500}]';
    expect(extractTradeDateFromF80(f80)).toBe('2026-05-08');
  });

  test('extracts date from cross-day f80 (美股)', () => {
    const f80 = '[{"b":202605072130,"e":202605080400}]';
    expect(extractTradeDateFromF80(f80)).toBe('2026-05-07');
  });

  test('returns null for invalid f80', () => {
    expect(extractTradeDateFromF80('')).toBeNull();
    expect(extractTradeDateFromF80('invalid')).toBeNull();
    expect(extractTradeDateFromF80(null as any)).toBeNull();
  });
});

describe('extractDateFromTimestamp', () => {
  test('extracts YYYY-MM-DD from timestamp', () => {
    const ts = new Date('2026-05-08 10:30:00').getTime();
    expect(extractDateFromTimestamp(ts)).toBe('2026-05-08');
  });

  test('handles midnight correctly', () => {
    const ts = new Date('2026-05-08 00:00:00').getTime();
    expect(extractDateFromTimestamp(ts)).toBe('2026-05-08');
  });

  test('returns null for invalid timestamp', () => {
    expect(extractDateFromTimestamp(NaN)).toBeNull();
    expect(extractDateFromTimestamp(0)).toBeNull();
  });
});