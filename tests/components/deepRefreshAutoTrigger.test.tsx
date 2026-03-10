const mockForce = jest.fn().mockResolvedValue([]);
const mockFetch = jest.fn().mockResolvedValue({
  symbol: '000001',
  name: 'Sample Fund',
  currentPrice: 1.23,
  previousPrice: 1.20,
  changePercentage: 0.5,
  lastUpdated: '2026-03-10 15:00',
  realtimeDate: '2026-03-10',
  netWorthDate: '2026-03-10',
  valuationDate: '2026-03-10',
  sourceUrl: ''
});

jest.mock('../../services/fundService', () => ({
  ...(jest.requireActual('../../services/fundService') as any),
  fetchFundData: () => mockFetch(),
}));

jest.mock('../../services/cacheService', () => ({
  getHistory: jest.fn().mockReturnValue([{ date: new Date('2026-03-09').getTime(), value: 1.0, equityReturn: 0 }]),
  getAllValuations: jest.fn().mockReturnValue({}),
  setValuation: jest.fn(),
  appendIntradayPoint: jest.fn(),
  setHistory: jest.fn(),
}));

// Ensure a clean localStorage and seed portfolio
localStorage.clear();
localStorage.setItem('fund_portfolio', JSON.stringify([{ id: '1', symbol: '000001', market: 'Fund' }]));

describe('Deep refresh auto-trigger helper', () => {
  beforeEach(() => { jest.resetModules(); jest.clearAllMocks(); });

  test('maybeTriggerHistoryRefresh calls _deps.forceFetchFundHistory when netWorthDate newer', async () => {
    const svc = require('../../services/fundService');
    // replace seam
    svc._deps.forceFetchFundHistory = mockForce;

    await svc.maybeTriggerHistoryRefresh('000001', '2026-03-10');
    expect(mockForce).toHaveBeenCalledWith('000001');
  });
});
