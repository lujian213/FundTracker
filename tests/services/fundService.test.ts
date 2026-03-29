import { fetchFundData, fetchFundHistory, fetchSingleIndex, normalizeIndexSymbol } from '../../services/fundService';
import { ValuationData } from '../../types';

// Advance past the RequestQueue random delay (150–350 ms) without triggering
// the 8000 ms JSONP timeout.  Multiple Promise.resolve() calls drain the
// microtask queue that the async RequestQueue.process() loop produces.
async function drainQueue() {
  await jest.advanceTimersByTimeAsync(400);
  await Promise.resolve();
  await Promise.resolve();
}

describe('fundService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.head.innerHTML = '';
    delete (window as any).Data_netWorthTrend;
    delete (window as any).fundName;
    delete (window as any).FundName;
    delete (window as any).fS_name;
    delete (window as any).name;
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

    await drainQueue();

    (window as any).jsonpgz({
      fundcode: symbol,
      name: 'Test Fund',
      gsz: '1.2345',
      dwjz: '1.0000',
      gszzl: '23.45',
      gztime: '2026-02-11 15:30:00',
      jzrq: '2026-02-11'
    });

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

    await drainQueue();

    const script = document.head.querySelector('script') as any;
    expect(script).toBeTruthy();
    if (script && script.onerror) script.onerror(new Error('script error'));

    // After onerror the service tries a fallback (fetchFundDataFromEastMoney) which has a 2000ms
    // internal timeout. Advance past that so the promise resolves to null.
    await jest.advanceTimersByTimeAsync(3000);
    await Promise.resolve();
    await Promise.resolve();

    const result = await promise;
    expect(result).toBeNull();
  });

  test('fetchFundData returns null for non-numeric symbol (invalid input)', async () => {
    const promise = fetchFundData('abc');

    await drainQueue();

    const script = document.head.querySelector('script') as any;
    if (script && script.onerror) script.onerror(new Error('invalid symbol'));

    // Advance past the fallback 2000ms timeout
    await jest.advanceTimersByTimeAsync(3000);
    await Promise.resolve();
    await Promise.resolve();

    const result = await promise;
    expect(result).toBeNull();
  });

  test('fetchFundData deterministic for same symbol when fed identical responses', async () => {
    const symbol = '222222';
    const resp = {
      fundcode: symbol,
      name: 'Det Fund',
      gsz: '2.2222',
      dwjz: '2.0000',
      gszzl: '11.11',
      gztime: '2026-02-11 10:00:00',
      jzrq: '2026-02-11'
    };

    const p1 = fetchFundData(symbol);
    await drainQueue();
    (window as any).jsonpgz(resp);
    const r1 = await p1;

    const p2 = fetchFundData(symbol);
    await drainQueue();
    (window as any).jsonpgz(resp);
    const r2 = await p2;

    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r1).toEqual(r2);
  });

  test('fetchFundData handles internal exception and returns null', async () => {
    const origCreate = document.createElement.bind(document);
    // @ts-ignore
    document.createElement = (tag: string) => {
      if (tag === 'script') throw new Error('forced create error');
      return origCreate(tag);
    };

    try {
      const promise = fetchFundData('333333');
      await drainQueue();
      const res = await promise;
      expect(res).toBeNull();
    } finally {
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
    await drainQueue();

    const script = document.head.querySelector('script') as HTMLScriptElement | null;
    expect(script).toBeTruthy();
    if (script) expect(script.src).toContain(`${expectedCode}.js`);

    (window as any).jsonpgz({ fundcode: expectedCode, name: 'B', gsz: '1', dwjz: '1', gszzl: '0', gztime: '2026-02-11 00:00:00', jzrq: '2026-02-11' });
    const result = await promise;
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe(expectedCode);
  });

  test('fetchFundHistory loads Data_netWorthTrend and maps to HistoricalPoint[]', async () => {
    document.head.innerHTML = '';

    const symbol = '100001';
    const promise = fetchFundHistory(symbol);

    await Promise.resolve();
    const script = document.head.querySelector('script');
    expect(script).toBeTruthy();

    (window as any).Data_netWorthTrend = [
      { x: 1670000000000, y: '1.1000', equityReturn: '0.01' },
      { x: 1670000001000, y: '1.2000', equityReturn: '0.02' }
    ];
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
    await Promise.resolve();
    const script1 = document.head.querySelector('script');
    (window as any).Data_netWorthTrend = [{ x: 1600000000000, y: '2.000', equityReturn: '0.05' }];
    // @ts-ignore
    if ((script1 as any).onload) (script1 as any).onload();
    const r1 = await p1;
    expect(r1).toHaveLength(1);

    const beforeCount = document.head.querySelectorAll('script').length;
    const p2 = fetchFundHistory(symbol);
    const r2 = await p2;
    const afterCount = document.head.querySelectorAll('script').length;
    expect(r2).toEqual(r1);
    expect(afterCount).toBe(beforeCount);
  });

  test('fetchFundHistory normalizes second timestamps, sorts ascending, and deduplicates same timestamp', async () => {
    document.head.innerHTML = '';
    const symbol = '300003';

    const promise = fetchFundHistory(symbol);
    await Promise.resolve();
    const script = document.head.querySelector('script');
    expect(script).toBeTruthy();

    // Unordered data with second-level timestamps and one duplicate timestamp.
    (window as any).Data_netWorthTrend = [
      { x: 1700000200, y: '1.20', equityReturn: '0.10' },
      { x: 1700000000, y: '1.00', equityReturn: '0.00' },
      { x: 1700000100, y: '1.10', equityReturn: '0.10' },
      { x: 1700000100, y: '1.15', equityReturn: '0.15' }
    ];
    // @ts-ignore
    if ((script as any).onload) (script as any).onload();

    const result = await promise;
    expect(result).toHaveLength(3);
    expect(result.map(p => p.date)).toEqual([1700000000000, 1700000100000, 1700000200000]);
    expect(result[1].value).toBeCloseTo(1.15);
  });

  test('fetchFundData falls back to EastMoney pingzhongdata and extracts name for 019005', async () => {
    const symbol = '019005';
    const promise = fetchFundData(symbol);

    await drainQueue();
    const primaryScript = document.head.querySelector('script') as any;
    expect(primaryScript).toBeTruthy();

    if (primaryScript && primaryScript.onerror) primaryScript.onerror(new Error('script error'));

    // Drain queue again for the fallback request to be scheduled and injected
    await drainQueue();
    const scripts = Array.from(document.head.querySelectorAll('script'));
    const fallbackScript = scripts[scripts.length - 1] as any;
    expect(fallbackScript).toBeTruthy();

    (window as any).fundName = '东方基金 019005';
    (window as any).Data_netWorthTrend = [
      { x: 1700000000000, y: '1.0000', equityReturn: '0' },
      { x: 1700000001000, y: '1.1000', equityReturn: '0.1' }
    ];
    // @ts-ignore
    if (fallbackScript && fallbackScript.onload) fallbackScript.onload();

    const result = await promise;
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe('019005');
    expect(result!.name).toBe('东方基金 019005');
  });

  test('fetchFundData treats jsonpgz() empty callback as failure and falls back extracting fS_name', async () => {
    const symbol = '019005';
    const promise = fetchFundData(symbol);

    await drainQueue();
    const primaryScript = document.head.querySelector('script') as any;
    expect(primaryScript).toBeTruthy();

    (window as any).jsonpgz();

    await drainQueue();
    const scripts = Array.from(document.head.querySelectorAll('script'));
    const fallbackScript = scripts[scripts.length - 1] as any;
    expect(fallbackScript).toBeTruthy();

    (window as any).fS_name = '国投瑞银白银期货(LOF)C';
    (window as any).Data_netWorthTrend = [
      { x: 1700000000000, y: '1.0000', equityReturn: '0' },
      { x: 1700000001000, y: '1.1000', equityReturn: '0.1' }
    ];
    // @ts-ignore
    if (fallbackScript && fallbackScript.onload) fallbackScript.onload();

    const result = await promise;
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe('019005');
    expect(result!.name).toBe('国投瑞银白银期货(LOF)C');
  });

  describe('normalizeIndexSymbol', () => {
    test('keeps domestic secid symbol stable (1.000001)', () => {
      expect(normalizeIndexSymbol('1.000001')).toBe('1.000001');
    });

    test('keeps domestic secid symbol stable (0.000001)', () => {
      expect(normalizeIndexSymbol('0.000001')).toBe('0.000001');
    });

    test('normalizes alias NDX to 100.NDX', () => {
      expect(normalizeIndexSymbol('NDX')).toBe('100.NDX');
    });

    test('normalizes alias SPX to 100.SPX', () => {
      expect(normalizeIndexSymbol('SPX')).toBe('100.SPX');
    });

    test('normalizes alias HSI to 100.HSI', () => {
      expect(normalizeIndexSymbol('HSI')).toBe('100.HSI');
    });

    test('keeps already normalized symbols unchanged', () => {
      expect(normalizeIndexSymbol('100.NDX')).toBe('100.NDX');
      expect(normalizeIndexSymbol('100.SPX')).toBe('100.SPX');
      expect(normalizeIndexSymbol('100.HSI')).toBe('100.HSI');
    });

    test('handles lowercase input', () => {
      expect(normalizeIndexSymbol('ndx')).toBe('100.NDX');
      expect(normalizeIndexSymbol('spx')).toBe('100.SPX');
    });

    test('handles empty and whitespace input', () => {
      expect(normalizeIndexSymbol('')).toBe('');
      expect(normalizeIndexSymbol('   ')).toBe('');
    });
  });

});
