import { fetchFundData } from '../../services/fundService';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('fetchFundData 019005 specific scenario', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    // ensure jsonpgz exists
    if (!(window as any).jsonpgz) (window as any).jsonpgz = (d: any) => {};
    // clear globals
    // @ts-ignore
    delete (window as any).Data_netWorthTrend;
    // @ts-ignore
    delete (window as any).fundName;
  });

  test('uses latest history point as confirmed net worth when fallback', async () => {
    const symbol = '019005';
    const promise = fetchFundData(symbol);

    // Wait for primary script injection
    await wait(400);
    const primaryScript = document.head.querySelector('script') as any;
    expect(primaryScript).toBeTruthy();

    // Simulate primary script error to trigger fallback
    if (primaryScript && primaryScript.onerror) primaryScript.onerror(new Error('script error'));

    await wait(100);
    const scripts = Array.from(document.head.querySelectorAll('script'));
    const fallbackScript = scripts[scripts.length - 1] as any;
    expect(fallbackScript).toBeTruthy();

    // Provide the two history points as specified
    (window as any).Data_netWorthTrend = [
      { x: 1770912000000, y: '2.1904', equityReturn: '-4.98' },
      { x: 1771862400000, y: '2.4405', equityReturn: '11.42' }
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

