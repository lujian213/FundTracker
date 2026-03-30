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

  // Bug fix: 指数日内趋势图最后一个点数据不正确的问题
  // 原因：lastUpdated只有时间(如"15:00:00")，没有日期，导致Date.parse解析为今天的15:00

  test('appendIntradayPoint skips when tradeDate is not today', () => {
    const symbol = '000004';
    // 模拟上周五的数据（tradeDate不是今天）
    const oldTradeDate = '2026-03-27'; // 上周五
    appendIntradayPoint(symbol, { value: 1.5, lastUpdated: '15:00:00', equityReturn: 0.5, tradeDate: oldTradeDate } as any);
    const pts = getIntradayPoints(symbol);
    // 应该跳过添加，因为tradeDate不是今天
    expect(pts.length).toBe(0);
  });

  test('appendIntradayPoint parses time-only lastUpdated with tradeDate', () => {
    const symbol = '000005';
    // 获取今天的日期字符串
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // 当 lastUpdated 是纯时间格式(如"15:00:00")，应结合tradeDate构建完整时间戳
    appendIntradayPoint(symbol, { value: 1.8, lastUpdated: '14:30:00', equityReturn: 0.3, tradeDate: todayStr } as any);
    const pts = getIntradayPoints(symbol);

    expect(pts.length).toBe(1);
    // 验证时间戳正确解析为当天的14:30
    const expectedDate = new Date(`${todayStr} 14:30:00`);
    const expectedTs = Math.floor(expectedDate.getTime() / 60000) * 60000;
    expect(pts[0].timestamp).toBe(expectedTs);
    expect(pts[0].value).toBeCloseTo(1.8);
  });

  test('appendIntradayPoint clears dirty data with future timestamp', () => {
    const symbol = '000006';
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // 模拟之前错误添加的15:00收市时间点（时间戳比14:30更晚）
    const oldTimestamp = Math.floor(new Date(`${todayStr} 15:00:00`).getTime() / 60000) * 60000;
    setIntradayPoints(symbol, [{ timestamp: oldTimestamp, value: 1.9, equityReturn: 0.1 }] as IntradayPoint[]);

    // 添加一个更早时间的新点
    appendIntradayPoint(symbol, { value: 1.8, lastUpdated: '14:30:00', equityReturn: 0.3, tradeDate: todayStr } as any);
    const pts = getIntradayPoints(symbol);

    // 应该清除时间戳比14:30更晚的脏数据（15:00的点）
    expect(pts.length).toBe(1);
    expect(pts[0].value).toBeCloseTo(1.8);
  });

  test('appendIntradayPoint with full ISO timestamp still works', () => {
    const symbol = '000007';
    const fullTimestamp = '2026-03-30T10:30:00+08:00';
    appendIntradayPoint(symbol, { value: 1.5, lastUpdated: fullTimestamp, equityReturn: 0.5 } as any);
    const pts = getIntradayPoints(symbol);

    expect(pts.length).toBe(1);
    const expectedTs = Math.floor(new Date(fullTimestamp).getTime() / 60000) * 60000;
    expect(pts[0].timestamp).toBe(expectedTs);
  });
});

