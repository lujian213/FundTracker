import { fetchFundData, fetchFundHistory } from '../../services/fundService';
import { ValuationData } from '../../types';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('fundService', () => {
  beforeEach(() => {
    // Clean DOM and globals before each test
    document.head.innerHTML = '';
    // Clear any global JSONP registries or data used by the service
    // @ts-ignore
    delete (window as any).Data_netWorthTrend;
    // Ensure jsonpgz exists to avoid runtime errors when tests call it
    if (!(window as any).jsonpgz) {
      (window as any).jsonpgz = (d: any) => {};
    }
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('fetchFundData parses jsonpgz response into ValuationData', async () => {
    const symbol = '123456';

    const promise = fetchFundData(symbol);

    // Wait briefly for RequestQueue delay and script injection
    await wait(400);

    // Simulate the JSONP callback invoked by the remote script by calling window.jsonpgz
    const responseData = {
      fundcode: symbol,
      name: 'Test Fund',
      gsz: '1.2345',
      dwjz: '1.0000',
      gszzl: '23.45',
      gztime: '2026-02-11 15:30:00',
      jzrq: '2026-02-11'
    };

    (window as any).jsonpgz(responseData);

    const result = await promise;

    expect(result).not.toBeNull();
    expect((result as ValuationData).symbol).toBe(symbol);
    expect((result as ValuationData).name).toBe('Test Fund');
    expect((result as ValuationData).currentPrice).toBeCloseTo(1.2345);
    expect((result as ValuationData).previousPrice).toBeCloseTo(1.0);
    expect((result as ValuationData).changePercentage).toBeCloseTo(23.45);
    expect((result as ValuationData).lastUpdated).toBe('2026-02-11 15:30:00');
    expect((result as ValuationData).realtimeDate).toBe('2026-02-11');
    expect((result as ValuationData).netWorthDate).toBe('2026-02-11');
  });

  test('fetchFundData returns null on JSONP script error', async () => {
    const symbol = '654321';
    const promise = fetchFundData(symbol);

    // Wait for RequestQueue to inject script
    await wait(400);

    const script = document.head.querySelector('script') as any;
    expect(script).toBeTruthy();

    // Simulate script load error
    if (script && script.onerror) script.onerror(new Error('script error'));

    const result = await promise;
    expect(result).toBeNull();
  });

  test('fetchFundData returns null for non-numeric symbol (invalid input)', async () => {
    const promise = fetchFundData('abc');

    // Wait for RequestQueue to inject script
    await wait(400);

    // Simulate script error for invalid input
    const script = document.head.querySelector('script') as any;
    if (script && script.onerror) script.onerror(new Error('invalid symbol'));

    const result = await promise;
    expect(result).toBeNull();
  });

  test('fetchFundData deterministic for same symbol when fed identical responses', async () => {
    const symbol = '222222';

    // First call
    const p1 = fetchFundData(symbol);
    await wait(400);
    const resp = {
      fundcode: symbol,
      name: 'Det Fund',
      gsz: '2.2222',
      dwjz: '2.0000',
      gszzl: '11.11',
      gztime: '2026-02-11 10:00:00',
      jzrq: '2026-02-11'
    };
    (window as any).jsonpgz(resp);
    const r1 = await p1;

    // Second call with the same response
    const p2 = fetchFundData(symbol);
    await wait(400);
    (window as any).jsonpgz(resp);
    const r2 = await p2;

    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r1).toEqual(r2);
  });

  test('fetchFundData handles internal exception and returns null', async () => {
    // Monkeypatch document.createElement to throw when creating script to simulate internal failure
    const origCreate = document.createElement.bind(document);
    // @ts-ignore
    document.createElement = (tag: string) => {
      if (tag === 'script') throw new Error('forced create error');
      return origCreate(tag);
    };

    try {
      const promise = fetchFundData('333333');
      // Wait for RequestQueue to run
      await wait(500);
      const res = await promise;
      expect(res).toBeNull();
    } finally {
      // restore
      // @ts-ignore
      document.createElement = origCreate;
    }
  });

  test.each([
    ['1234', '001234'],
    ['12345', '012345'],
    ['123456', '123456'],
    ['1234567', '1234567']
  ])('fetchFundData handles boundary symbol %s -> code %s', async (input, expectedCode) => {
    const promise = fetchFundData(input as string);
    await wait(400);

    const script = document.head.querySelector('script') as HTMLScriptElement | null;
    expect(script).toBeTruthy();
    if (script) expect(script.src).toContain(`${expectedCode}.js`);

    (window as any).jsonpgz({ fundcode: expectedCode, name: 'B', gsz: '1', dwjz: '1', gszzl: '0', gztime: '2026-02-11 00:00:00', jzrq: '2026-02-11' });
    const result = await promise;
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe(expectedCode);
  });

  test('fetchFundHistory loads Data_netWorthTrend and maps to HistoricalPoint[]', async () => {
    // Ensure a clean head
    document.head.innerHTML = '';

    const symbol = '100001';
    const promise = fetchFundHistory(symbol);

    // The code appends a script to head; find it
    // Wait briefly to allow script to be appended
    await wait(50);
    const script = document.head.querySelector('script');
    expect(script).toBeTruthy();

    // Prepare global Data_netWorthTrend that the onload handler reads
    // Two sample points: x (timestamp), y (net value), equityReturn
    (window as any).Data_netWorthTrend = [
      { x: 1670000000000, y: '1.1000', equityReturn: '0.01' },
      { x: 1670000001000, y: '1.2000', equityReturn: '0.02' }
    ];

    // Trigger the onload handler to simulate script load
    // @ts-ignore
    if ((script as any).onload) (script as any).onload();

    const result = await promise;
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe(1670000000000);
    expect(result[0].value).toBeCloseTo(1.1);
    expect(result[0].equityReturn).toBeCloseTo(0.01);
  });

  test('fetchFundHistory caches results so subsequent calls return cached data', async () => {
    document.head.innerHTML = '';
    const symbol = '200002';

    const p1 = fetchFundHistory(symbol);
    await wait(50);
    const script1 = document.head.querySelector('script');
    (window as any).Data_netWorthTrend = [{ x: 1600000000000, y: '2.000', equityReturn: '0.05' }];
    // @ts-ignore
    if ((script1 as any).onload) (script1 as any).onload();
    const r1 = await p1;
    expect(r1).toHaveLength(1);

    // Call again; should return cached array and not append a new script
    const beforeCount = document.head.querySelectorAll('script').length;
    const p2 = fetchFundHistory(symbol);
    const r2 = await p2;
    const afterCount = document.head.querySelectorAll('script').length;
    expect(r2).toBe(r1);
    expect(afterCount).toBe(beforeCount);
  });

});
