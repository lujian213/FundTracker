import { getUnitsForDate } from '../../utils/positionHelper';

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
  });

  test('does not apply stored initialPosition before its stored startDate', async () => {
    // store an initialPosition with startDate 2026-02-13
    localStorage.setItem('fund_position_ABC', JSON.stringify({ initialPosition: 100, startDate: '2026-02-13' }));

    // ask for date before the storedStartDate
    const unitsBefore = await getUnitsForDate('ABC', '2026-02-12', 1000);
    // There are no trades and nav on 2026-02-12 exists (1.5), fallbackCash 1000 -> 1000/1.5 = 666.67
    expect(unitsBefore).toBeCloseTo(1000 / 1.5, 2);

    // ask for exact stored startDate -> should return stored initialPosition
    const unitsOn = await getUnitsForDate('ABC', '2026-02-13', 1000);
    expect(unitsOn).toBe(100);
  });
});

