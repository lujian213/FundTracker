import { appendIntradayPoint, getIntradayPoints, clearOldIntradayData, setIntradayPoints } from '../../services/cacheService';
import { IntradayPoint } from '../../types';

describe('cacheService intraday', () => {
  beforeEach(() => { localStorage.clear(); jest.resetModules(); });

  test('appendIntradayPoint stores and getIntradayPoints returns floored minute timestamp', () => {
    const symbol = '000001';
    const lastUpdated = '2026-03-09T10:05:20+08:00';
    appendIntradayPoint(symbol, { value: 1.2345, lastUpdated, equityReturn: 0.5 } as any);
    const pts = getIntradayPoints(symbol);
    expect(pts.length).toBe(1);
    const expectedTs = Math.floor(new Date(lastUpdated).getTime() / 60000) * 60000;
    expect(pts[0].timestamp).toBe(expectedTs);
    expect(pts[0].value).toBeCloseTo(1.2345);
    expect(pts[0].equityReturn).toBeCloseTo(0.5);
  });

  test('appendIntradayPoint dedupes same minute', () => {
    const symbol = '000002';
    const t1 = '2026-03-09T09:00:10+08:00';
    const t2 = '2026-03-09T09:00:50+08:00';
    appendIntradayPoint(symbol, { value: 1.0, lastUpdated: t1, equityReturn: 0 } as any);
    appendIntradayPoint(symbol, { value: 2.0, lastUpdated: t2, equityReturn: 1 } as any);
    const pts = getIntradayPoints(symbol);
    expect(pts.length).toBe(1);
    expect(pts[0].value).toBeCloseTo(2.0);
    expect(pts[0].equityReturn).toBeCloseTo(1);
  });

  test('clearOldIntradayData removes previous day points', () => {
    const symbol = '000003';
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const yTs = Math.floor(yesterday.getTime() / 60000) * 60000;
    const today = new Date();
    const tTs = Math.floor(today.getTime() / 60000) * 60000;
    setIntradayPoints(symbol, [{ timestamp: yTs, value: 1, equityReturn: 0 }, { timestamp: tTs, value: 2, equityReturn: 0 }] as IntradayPoint[]);
    clearOldIntradayData();
    const pts = getIntradayPoints(symbol);
    expect(pts.length).toBe(1);
    expect(pts[0].timestamp).toBe(tTs);
  });
});

