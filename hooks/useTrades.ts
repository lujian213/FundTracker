import { useCallback, useEffect, useState } from 'react';

export type TradeType = 'buy' | 'sell';
export interface TradeRecord {
  id: string;
  date: string; // YYYY-MM-DD
  type: TradeType;
  shares: number;
  price: number;
  fee: number;
  // total is not persisted anymore; kept optional for backward compatibility
  total?: number;
}

const TRADES_KEY = 'fund_trades';

function readAll(): Record<string, TradeRecord[]> {
  try {
    const raw = localStorage.getItem(TRADES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

function writeAll(obj: Record<string, TradeRecord[]>) {
  try {
    localStorage.setItem(TRADES_KEY, JSON.stringify(obj));
    // notify same-window listeners that trades changed
    try {
      const ev = new CustomEvent('fund-trades-changed', { detail: { time: Date.now() } });
      window.dispatchEvent(ev);
    } catch (e) {
      // ignore if CustomEvent not available
    }
  } catch (e) {}
}

export function getTradesForSymbol(symbol: string): TradeRecord[] {
  try {
    const all = readAll();
    return Array.isArray(all[symbol]) ? all[symbol] : [];
  } catch (e) { return []; }
}

export function setTradesForSymbol(symbol: string, arr: TradeRecord[]) {
  const all = readAll();
  all[symbol] = arr;
  writeAll(all);
}

export function addTradeForSymbol(symbol: string, rec: TradeRecord) {
  const all = readAll();
  all[symbol] = [rec].concat(all[symbol] || []);
  writeAll(all);
}

export function updateTradeForSymbol(symbol: string, id: string, patch: Partial<TradeRecord>) {
  const all = readAll();
  all[symbol] = (all[symbol] || []).map(t => t.id === id ? { ...t, ...patch } : t);
  writeAll(all);
}

export function removeTradeForSymbol(symbol: string, id: string) {
  const all = readAll();
  all[symbol] = (all[symbol] || []).filter(t => t.id !== id);
  writeAll(all);
}

export function exportTradesForSymbolJSON(symbol: string) {
  const arr = getTradesForSymbol(symbol);
  // compute total dynamically for export
  const out = arr.map(t => ({
    ...t,
    total: t.type === 'sell' ? t.price * t.shares - (t.fee || 0) : t.price * t.shares + (t.fee || 0)
  }));
  return JSON.stringify({ symbol, trades: out }, null, 2);
}

export function exportTradesForSymbolCSV(symbol: string) {
  const arr = getTradesForSymbol(symbol);
  const header = ['id', 'date', 'type', 'shares', 'price', 'fee', 'total'];
  const lines = [header.join(',')];
  for (const t of arr) {
    const total = t.type === 'sell' ? t.price * t.shares - (t.fee || 0) : t.price * t.shares + (t.fee || 0);
    lines.push([t.id, t.date, t.type, t.shares, t.price, t.fee, total].join(','));
  }
  return lines.join('\n');
}

// Overwrite trades for provided symbol (used for imports)
export function importTradesForSymbol(symbol: string, arr: TradeRecord[]) {
  setTradesForSymbol(symbol, arr);
}

// React hook providing trades list and mutators for a symbol
export default function useTrades(symbol: string) {
  const [trades, setTrades] = useState<TradeRecord[]>(() => getTradesForSymbol(symbol));

  useEffect(() => {
    setTrades(getTradesForSymbol(symbol));
  }, [symbol]);

  // listen for same-window trade changes triggered by writeAll
  useEffect(() => {
    const handler = (e: Event) => {
      // simply refresh the trades for this symbol
      setTrades(getTradesForSymbol(symbol));
    };
    window.addEventListener('fund-trades-changed', handler as EventListener);
    // also listen to storage events in case other tabs/windows changed data
    const storageHandler = (e: StorageEvent) => {
      if (e.key === TRADES_KEY) setTrades(getTradesForSymbol(symbol));
    };
    window.addEventListener('storage', storageHandler);
    return () => {
      window.removeEventListener('fund-trades-changed', handler as EventListener);
      window.removeEventListener('storage', storageHandler);
    };
  }, [symbol]);

  const refresh = useCallback(() => setTrades(getTradesForSymbol(symbol)), [symbol]);

  const add = useCallback((rec: TradeRecord) => { addTradeForSymbol(symbol, rec); refresh(); }, [symbol, refresh]);
  const update = useCallback((id: string, patch: Partial<TradeRecord>) => { updateTradeForSymbol(symbol, id, patch); refresh(); }, [symbol, refresh]);
  const remove = useCallback((id: string) => { removeTradeForSymbol(symbol, id); refresh(); }, [symbol, refresh]);
  const setAll = useCallback((arr: TradeRecord[]) => { setTradesForSymbol(symbol, arr); refresh(); }, [symbol, refresh]);

  const exportJSON = useCallback(() => exportTradesForSymbolJSON(symbol), [symbol]);
  const exportCSV = useCallback(() => exportTradesForSymbolCSV(symbol), [symbol]);

  return { trades, refresh, add, update, remove, setAll, exportJSON, exportCSV };
}
