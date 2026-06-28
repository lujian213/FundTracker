import { fetchIndexIntradayKline, _jsonp } from '../../services/fundService';

describe('fetchIndexIntradayKline', () => {
  let jsonpCallSpy: jest.SpyInstance;

  beforeEach(() => {
    jsonpCallSpy = jest.spyOn(_jsonp, 'call');
  });

  afterEach(() => {
    jsonpCallSpy.mockRestore();
  });

  it('should call correct API URL with parameters', async () => {
    const mockResponse = {
      data: {
        klines: [
          '2026-06-26 09:30,3150.00,3150.50,3152.00,3148.00,12345678,890000000,0.50',
          '2026-06-26 09:35,3150.50,3151.00,3153.00,3150.00,8765432,780000000,0.67',
        ],
      },
    };
    jsonpCallSpy.mockResolvedValue(mockResponse);

    await fetchIndexIntradayKline('1.000001', 5, 48);

    expect(jsonpCallSpy).toHaveBeenCalled();
    const calledUrl = jsonpCallSpy.mock.calls[0][0];
    expect(calledUrl).toContain('push2his.eastmoney.com');
    expect(calledUrl).toContain('secid=1.000001');
    expect(calledUrl).toContain('klt=5');
    expect(calledUrl).toContain('lmt=48');
  });

  it('should parse kline data correctly', async () => {
    const mockResponse = {
      data: {
        klines: [
          '2026-06-26 09:30,3150.00,3150.50,3152.00,3148.00,12345678,890000000,0.50',
        ],
      },
    };
    jsonpCallSpy.mockResolvedValue(mockResponse);

    const result = await fetchIndexIntradayKline('1.000001', 5, 48);

    expect(result).toHaveLength(1);
    expect(result[0].open).toBe(3150.00);
    expect(result[0].close).toBe(3150.50);
    expect(result[0].high).toBe(3152.00);
    expect(result[0].low).toBe(3148.00);
    expect(result[0].volume).toBe(12345678);
    expect(result[0].amount).toBe(890000000);
  });

  it('should calculate changePercent based on previousClose', async () => {
    const mockResponse = {
      data: {
        klines: [
          '2026-06-26 09:30,3140.00,3150.50,3152.00,3148.00,12345678,890000000,0.50',
        ],
      },
    };
    jsonpCallSpy.mockResolvedValue(mockResponse);

    // previousClose = 3100, close = 3150.50
    // changePercent = (3150.50 - 3100) / 3100 * 100 = 1.629...
    const result = await fetchIndexIntradayKline('1.000001', 5, 48, 3100);

    expect(result[0].changePercent).toBeCloseTo(1.63, 1);
  });

  it('should return empty array when API returns no data', async () => {
    jsonpCallSpy.mockResolvedValue({ data: { klines: null } });
    const result = await fetchIndexIntradayKline('1.000001', 5, 48);
    expect(result).toEqual([]);
  });

  it('should handle API error gracefully', async () => {
    jsonpCallSpy.mockRejectedValue(new Error('Network error'));
    const result = await fetchIndexIntradayKline('1.000001', 5, 48);
    expect(result).toEqual([]);
  });
});