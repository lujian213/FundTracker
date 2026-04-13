import { getUnitsForDate } from '../../utils/positionHelper';
import { updatePosition, resetCache as resetMarketFundCache } from '../../services/marketFundService';

// mock getTradesForSymbol and fetchFundHistory which are used by getUnitsForDate
jest.mock('../../hooks/useTrades', () => ({
  getTradesForSymbol: jest.fn(() => []),
}));

jest.mock('../../services/fundService', () => ({
  fetchFundHistory: jest.fn(async (symbol: string) => {
    if (symbol === 'ABC') {
      // return a simple history containing nav for 2026-02-13
      return [
        { date: new Date('2026-02-12').getTime(), value: 1.5 },
        { date: new Date('2026-02-13').getTime(), value: 2.0 },
      ];
    }
    return [];
  }),
}));

describe('getUnitsForDate storedInitialPosition application rules', () => {
  beforeEach(() => {
    // clear localStorage for clean state
    localStorage.clear();
    resetMarketFundCache();
  });

  test('returns 0 when date is before stored startDate (user did not hold fund yet)', async () => {
    // store an initialPosition with startDate 2026-02-13 using marketFundService
    updatePosition('ABC', { initialPosition: 100, startDate: '2026-02-13', fullCapacity: 0, initialPrice: null });

    // ask for date before the storedStartDate
    const unitsBefore = await getUnitsForDate('ABC', '2026-02-12', 1000);
    // 当日期早于建仓日期时，返回 0（用户在那个时候还没有持有该基金）
    // 不使用 fallback 计算
    expect(unitsBefore).toBe(0);

    // ask for exact stored startDate -> should return stored initialPosition
    const unitsOn = await getUnitsForDate('ABC', '2026-02-13', 1000);
    expect(unitsOn).toBe(100);
  });
});

