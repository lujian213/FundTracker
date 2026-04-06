import { getTradesForSymbol, addTradeForSymbol, updateTradeForSymbol, removeTradeForSymbol, setTradesForSymbol, exportTradesForSymbolJSON, exportTradesForSymbolCSV } from '../../hooks/useTrades';
import { resetCache as resetMarketFundCache } from '../../services/marketFundService';

describe('useTrades helpers', () => {
  const symbol = 'TEST123';
  beforeEach(() => {
    localStorage.clear();
    resetMarketFundCache();
  });

  test('add, update, remove trades and export', () => {
    // initial empty
    expect(getTradesForSymbol(symbol)).toEqual([]);

    const rec = { id: 'a1', date: '2026-02-01', type: 'buy', shares: 10, price: 1.0, fee: 0.1, total: 10.1 };
    addTradeForSymbol(symbol, rec as any);
    expect(getTradesForSymbol(symbol).length).toBe(1);

    updateTradeForSymbol(symbol, 'a1', { shares: 20 } as any);
    expect(getTradesForSymbol(symbol)[0].shares).toBe(20);

    removeTradeForSymbol(symbol, 'a1');
    expect(getTradesForSymbol(symbol).length).toBe(0);

    // setAll
    const arr = [rec];
    setTradesForSymbol(symbol, arr as any);
    expect(getTradesForSymbol(symbol).length).toBe(1);

    const json = exportTradesForSymbolJSON(symbol);
    expect(json).toContain('TEST123');
    const csv = exportTradesForSymbolCSV(symbol);
    expect(csv.split('\n')[0]).toContain('id,date,type');
  });
});
