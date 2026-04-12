import { computePositions, POSITION_COLORS, getUnitsForDate } from '../../utils/positionHelper';
import { setTradesForSymbol } from '../../hooks/useTrades';
import { Ticker, ValuationData, MarketType } from '../../types';
import { resetCache as resetMarketFundCache, updatePosition } from '../../services/marketFundService';
import { fetchFundHistory } from '../../services/fundService';

// Mock fetchFundHistory for getUnitsForDate tests
jest.mock('../../services/fundService', () => ({
  fetchFundHistory: jest.fn(),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

function makeTicker(symbol: string, name = ''): Ticker {
  return { id: symbol, symbol, name, market: MarketType.FUND };
}

function makeValuation(symbol: string, currentPrice: number, previousPrice = 1.0): ValuationData {
  return {
    symbol, name: `Fund-${symbol}`,
    currentPrice, previousPrice,
    changePercentage: 0,
    lastUpdated: '2026-03-01 15:00',
    realtimeDate: '2026-03-01',
    netWorthDate: '2026-02-28',
    valuationDate: '2026-03-01',
    sourceUrl: '',
  };
}

function setPosition(symbol: string, fullCapacity: number, initialPosition: number) {
  updatePosition(symbol, {
    fullCapacity,
    initialPosition,
    startDate: null,
    initialPrice: null,
  });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('computePositions', () => {
  beforeEach(() => {
    localStorage.clear();
    resetMarketFundCache();
  });

  test('returns empty result when portfolio is empty', () => {
    const { entries, totalMarketValue } = computePositions([], {});
    expect(entries).toHaveLength(0);
    expect(totalMarketValue).toBe(0);
  });

  test('excludes fund with no position config (fullCapacity = 0)', () => {
    // no fund_position_* key written → fullCapacity defaults to 0
    const { entries } = computePositions(
      [makeTicker('000001')],
      { '000001': makeValuation('000001', 1.5) }
    );
    expect(entries).toHaveLength(0);
  });

  test('excludes fund whose net shares equal zero', () => {
    setPosition('000001', 100, 50);
    // buy 50 then sell 100: net = 50 + 50 - 100 = 0
    setTradesForSymbol('000001', [
      { id: 'b1', date: '2026-01-01', type: 'buy', shares: 50, price: 1.0, fee: 0 },
      { id: 's1', date: '2026-01-02', type: 'sell', shares: 100, price: 1.1, fee: 0 },
    ] as any);
    const { entries } = computePositions(
      [makeTicker('000001')],
      { '000001': makeValuation('000001', 1.5) }
    );
    expect(entries).toHaveLength(0);
  });

  test('excludes fund with no marketData and price cannot be determined', () => {
    setPosition('000001', 100, 50);
    // no entry in marketData
    const { entries } = computePositions([makeTicker('000001')], {});
    expect(entries).toHaveLength(0);
  });

  test('computes market value using currentPrice when available', () => {
    setPosition('000001', 100, 80);
    const { entries, totalMarketValue } = computePositions(
      [makeTicker('000001')],
      { '000001': makeValuation('000001', 2.0, 1.5) }
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].currentShares).toBeCloseTo(80);
    expect(entries[0].marketValue).toBeCloseTo(80 * 2.0);
    expect(totalMarketValue).toBeCloseTo(80 * 2.0);
  });

  test('falls back to previousPrice when currentPrice is 0', () => {
    setPosition('000001', 100, 60);
    const { entries } = computePositions(
      [makeTicker('000001')],
      { '000001': makeValuation('000001', 0, 1.8) }  // currentPrice = 0
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].marketValue).toBeCloseTo(60 * 1.8);
  });

  test('currentShares = initialPosition + buyShares - sellShares', () => {
    setPosition('000001', 200, 100);
    setTradesForSymbol('000001', [
      { id: 'b1', date: '2026-01-10', type: 'buy', shares: 50, price: 1.0, fee: 0 },
      { id: 's1', date: '2026-01-15', type: 'sell', shares: 30, price: 1.1, fee: 0 },
    ] as any);
    const { entries } = computePositions(
      [makeTicker('000001')],
      { '000001': makeValuation('000001', 1.5) }
    );
    // 100 + 50 - 30 = 120
    expect(entries[0].currentShares).toBeCloseTo(120);
  });

  test('uses ticker.name, falling back to marketData.name, then symbol', () => {
    setPosition('000001', 100, 50);
    // ticker has a name
    const { entries: e1 } = computePositions(
      [makeTicker('000001', '我的基金')],
      { '000001': makeValuation('000001', 1.0) }
    );
    expect(e1[0].name).toBe('我的基金');

    // ticker name is empty → use marketData name
    setPosition('000002', 100, 50);
    const { entries: e2 } = computePositions(
      [makeTicker('000002', '')],
      { '000002': makeValuation('000002', 1.0) }
    );
    expect(e2[0].name).toBe('Fund-000002');
  });

  test('sorts results by market value descending', () => {
    setPosition('000001', 100, 10);   // value = 10 * 1.0 = 10
    setPosition('000002', 100, 50);   // value = 50 * 2.0 = 100
    setPosition('000003', 100, 30);   // value = 30 * 1.5 = 45

    const portfolio = [makeTicker('000001'), makeTicker('000002'), makeTicker('000003')];
    const marketData = {
      '000001': makeValuation('000001', 1.0),
      '000002': makeValuation('000002', 2.0),
      '000003': makeValuation('000003', 1.5),
    };
    const { entries } = computePositions(portfolio, marketData);
    expect(entries.map(e => e.symbol)).toEqual(['000002', '000003', '000001']);
  });

  test('ratio sums to 1 across all entries', () => {
    setPosition('000001', 100, 40);
    setPosition('000002', 100, 60);

    const portfolio = [makeTicker('000001'), makeTicker('000002')];
    const marketData = {
      '000001': makeValuation('000001', 1.0),
      '000002': makeValuation('000002', 2.0),
    };
    const { entries } = computePositions(portfolio, marketData);
    const total = entries.reduce((s, e) => s + e.ratio, 0);
    expect(total).toBeCloseTo(1);
  });

  test('each entry receives a color from POSITION_COLORS', () => {
    setPosition('000001', 100, 10);
    setPosition('000002', 100, 20);

    const portfolio = [makeTicker('000001'), makeTicker('000002')];
    const marketData = {
      '000001': makeValuation('000001', 1.0),
      '000002': makeValuation('000002', 1.0),
    };
    const { entries } = computePositions(portfolio, marketData);
    entries.forEach((e, i) => {
      expect(e.color).toBe(POSITION_COLORS[i % POSITION_COLORS.length]);
    });
  });

  test('colors wrap around when there are more funds than palette size', () => {
    const count = POSITION_COLORS.length + 2; // exceed palette length
    const portfolio: Ticker[] = [];
    const marketData: Record<string, ValuationData> = {};
    for (let i = 0; i < count; i++) {
      const sym = String(i).padStart(6, '0');
      setPosition(sym, 100, 10);
      portfolio.push(makeTicker(sym, `Fund ${i}`));
      marketData[sym] = makeValuation(sym, 1.0);
    }
    const { entries } = computePositions(portfolio, marketData);
    expect(entries).toHaveLength(count);
    // last two entries reuse palette from index 0 and 1
    expect(entries[POSITION_COLORS.length].color).toBe(POSITION_COLORS[0]);
    expect(entries[POSITION_COLORS.length + 1].color).toBe(POSITION_COLORS[1]);
  });

  test('handles multiple buy/sell trades correctly', () => {
    setPosition('000001', 500, 200);
    setTradesForSymbol('000001', [
      { id: 'b1', date: '2026-01-01', type: 'buy', shares: 100, price: 1.0, fee: 1 },
      { id: 'b2', date: '2026-01-05', type: 'buy', shares: 50, price: 1.1, fee: 0.5 },
      { id: 's1', date: '2026-01-10', type: 'sell', shares: 80, price: 1.2, fee: 1 },
    ] as any);
    // 200 + 100 + 50 - 80 = 270
    const { entries } = computePositions(
      [makeTicker('000001')],
      { '000001': makeValuation('000001', 1.5) }
    );
    expect(entries[0].currentShares).toBeCloseTo(270);
    expect(entries[0].marketValue).toBeCloseTo(270 * 1.5);
  });
});

describe('POSITION_COLORS', () => {
  test('has exactly 32 entries', () => {
    expect(POSITION_COLORS).toHaveLength(32);
  });

  test('all entries are valid hsl strings', () => {
    for (const color of POSITION_COLORS) {
      expect(color).toMatch(/^hsl\(\d+,\d+%,\d+%\)$/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// getUnitsForDate 测试
// ═══════════════════════════════════════════════════════════════════════════════

describe('getUnitsForDate', () => {
  beforeEach(() => {
    localStorage.clear();
    resetMarketFundCache();
    jest.clearAllMocks();
  });

  // helper: create mock history point
  function makeHistoryPoint(dateStr: string, value: number) {
    const ts = new Date(`${dateStr} 15:00`).getTime();
    return { date: ts, value, equityReturn: 0 };
  }

  test('returns 0 when date is earlier than storedStartDate', async () => {
    // 设置建仓日期为 2026-02-01，初始份额 10000
    updatePosition('000001', {
      fullCapacity: 100000,
      initialPosition: 10000,
      startDate: '2026-02-01',
      initialPrice: 1.0,
    });

    // 查询 2026-01-15（早于建仓日期）的份额
    const units = await getUnitsForDate('000001', '2026-01-15', 100000);

    // 应返回 0，而非 fallback 计算的份额
    expect(units).toBe(0);
  });

  test('returns initialPosition when date equals storedStartDate', async () => {
    updatePosition('000001', {
      fullCapacity: 100000,
      initialPosition: 10000,
      startDate: '2026-02-01',
      initialPrice: 1.0,
    });

    const units = await getUnitsForDate('000001', '2026-02-01');

    expect(units).toBe(10000);
  });

  test('returns correct shares when date is after storedStartDate with trades', async () => {
    updatePosition('000001', {
      fullCapacity: 100000,
      initialPosition: 10000,
      startDate: '2026-02-01',
      initialPrice: 1.0,
    });

    // 设置交易记录
    setTradesForSymbol('000001', [
      { id: 'b1', date: '2026-02-10', type: 'buy', shares: 5000, price: 1.2, fee: 10 },
      { id: 's1', date: '2026-02-20', type: 'sell', shares: 2000, price: 1.3, fee: 5 },
    ] as any);

    // 查询 2026-02-25 的份额：10000 + 5000 - 2000 = 13000
    const units = await getUnitsForDate('000001', '2026-02-25');

    expect(units).toBe(13000);
  });

  test('returns shares considering only trades before target date', async () => {
    updatePosition('000001', {
      fullCapacity: 100000,
      initialPosition: 10000,
      startDate: '2026-02-01',
      initialPrice: 1.0,
    });

    setTradesForSymbol('000001', [
      { id: 'b1', date: '2026-02-10', type: 'buy', shares: 5000, price: 1.2, fee: 10 },
      { id: 'b2', date: '2026-02-20', type: 'buy', shares: 3000, price: 1.25, fee: 8 },
    ] as any);

    // 查询 2026-02-15 的份额：只计算 02-10 的交易
    // 10000 + 5000 = 15000（02-20 的交易还未发生）
    const units = await getUnitsForDate('000001', '2026-02-15');

    expect(units).toBe(15000);
  });

  test('uses fallback when no position config exists', async () => {
    // 没有持仓配置
    (fetchFundHistory as jest.Mock).mockResolvedValue([
      makeHistoryPoint('2026-01-15', 1.5),
    ]);

    // fallbackCash = 100000，净值 = 1.5
    // 份额 = 100000 / 1.5 ≈ 66666.67
    const units = await getUnitsForDate('000002', '2026-01-15', 100000);

    expect(units).toBeCloseTo(66666.67, 0);
  });

  test('returns null when date is earlier than startDate and no fallback', async () => {
    updatePosition('000001', {
      fullCapacity: 100000,
      initialPosition: 10000,
      startDate: '2026-02-01',
      initialPrice: 1.0,
    });

    // 不提供 fallbackCash
    const units = await getUnitsForDate('000001', '2026-01-15');

    // 返回 0（因为日期早于建仓日期）
    expect(units).toBe(0);
  });

  test('handles trade date as timestamp correctly', async () => {
    updatePosition('000001', {
      fullCapacity: 100000,
      initialPosition: 10000,
      startDate: '2026-02-01',
      initialPrice: 1.0,
    });

    // 使用 timestamp 作为交易日期
    const ts = new Date('2026-02-10 15:00').getTime();
    setTradesForSymbol('000001', [
      { id: 'b1', date: ts, type: 'buy', shares: 5000, price: 1.2, fee: 10 },
    ] as any);

    const units = await getUnitsForDate('000001', '2026-02-15');

    expect(units).toBe(15000);
  });

  test('returns 0 when shares become zero after trades', async () => {
    updatePosition('000001', {
      fullCapacity: 100000,
      initialPosition: 10000,
      startDate: '2026-02-01',
      initialPrice: 1.0,
    });

    // 卖出全部份额
    setTradesForSymbol('000001', [
      { id: 's1', date: '2026-02-10', type: 'sell', shares: 10000, price: 1.2, fee: 10 },
    ] as any);

    const units = await getUnitsForDate('000001', '2026-02-15');

    expect(units).toBe(0);
  });

  test('finds nav on exact date for fallback calculation', async () => {
    // 无持仓配置
    (fetchFundHistory as jest.Mock).mockResolvedValue([
      makeHistoryPoint('2026-01-10', 1.0),
      makeHistoryPoint('2026-01-15', 1.5),
      makeHistoryPoint('2026-01-20', 2.0),
    ]);

    const units = await getUnitsForDate('000002', '2026-01-15', 100000);

    // 使用 2026-01-15 的净值 1.5
    expect(units).toBeCloseTo(66666.67, 0);
  });

  test('uses latest nav before target date when exact date not available', async () => {
    // 无持仓配置
    (fetchFundHistory as jest.Mock).mockResolvedValue([
      makeHistoryPoint('2026-01-10', 1.0),
      makeHistoryPoint('2026-01-20', 2.0),
    ]);

    // 查询 2026-01-15，但没有该日期的净值数据
    // 应使用 2026-01-10 的净值 1.0
    const units = await getUnitsForDate('000002', '2026-01-15', 100000);

    expect(units).toBeCloseTo(100000, 0);
  });
});

