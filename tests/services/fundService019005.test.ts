import { fetchFundData } from '../../services/fundService';

async function drainQueue() {
  await jest.advanceTimersByTimeAsync(400);
  await Promise.resolve();
  await Promise.resolve();
}

describe('fetchFundData 019005 specific scenario', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.head.innerHTML = '';
    // ensure jsonpgz exists
    if (!(window as any).jsonpgz) (window as any).jsonpgz = (d: any) => {};
    // clear globals
    // @ts-ignore
    delete (window as any).Data_netWorthTrend;
    // @ts-ignore
    delete (window as any).fundName;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('uses latest history point as confirmed net worth when fallback', async () => {
    const symbol = '019005';
    const promise = fetchFundData(symbol);

    // Advance fake timers past RequestQueue delay so primary script is injected
    await drainQueue();
    const primaryScript = document.head.querySelector('script') as any;
    expect(primaryScript).toBeTruthy();

    // Simulate primary script error to trigger fallback
    if (primaryScript && primaryScript.onerror) primaryScript.onerror(new Error('script error'));

    // Advance again so fallback script is injected
    await drainQueue();
    const scripts = Array.from(document.head.querySelectorAll('script'));
    const fallbackScript = scripts[scripts.length - 1] as any;
    expect(fallbackScript).toBeTruthy();

    // Provide the two history points as specified
    // Use timestamps representing later in the day to ensure consistent local date across timezones
    (window as any).Data_netWorthTrend = [
      { x: 1770955200000, y: '2.1904', equityReturn: '-4.98' },  // Feb 23, 2026 12:00 UTC
      { x: 1771905600000, y: '2.4405', equityReturn: '11.42' }   // Feb 24, 2026 12:00 UTC (to ensure consistent local date across all timezones)
    ];

    // Trigger fallback script onload
    // @ts-ignore
    if (fallbackScript && fallbackScript.onload) fallbackScript.onload();

    const result = await promise;
    expect(result).not.toBeNull();
    // latest confirmed net worth should be used as current/previous in fallback
    expect(result!.currentPrice).toBeCloseTo(2.4405);
    expect(result!.previousPrice).toBeCloseTo(2.4405);
    expect(result!.netWorthDate).toBe('2026-02-24');
    expect(result!.lastUpdated).toBe('2026-02-24 15:00:00');
  });
});

