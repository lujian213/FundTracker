import { useCallback, useEffect, useMemo, useState } from 'react';
import { computePositionTrend, downsampleLTTB, PositionTrendSeries, PositionTrendInput, Trade, ValuationPoint } from '../utils/positionTrend';
import * as cacheService from '../services/cacheService';
import { getAllTradeDates, readAll as readAllTrades, getTradesForSymbol } from './useTrades';
import { Ticker } from '../types';

interface UsePositionTrendParams {
  startDate?: string;
  endDate?: string;
  symbols?: string[]; // optional override; if absent, read from localStorage 'fund_portfolio' or fund_position_*
  maxPoints?: number; // threshold to downsample (default 500)
  valuationsOverride?: Record<string, any>;
}

export default function usePositionTrend(params: UsePositionTrendParams = {}) {
  const { startDate, endDate, symbols, maxPoints = 500, valuationsOverride } = params;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [fullResolutionAvailable, setFullResolutionAvailable] = useState(false);

  // read symbols: prefer explicit symbols; else derive from fund_position_* entries (funds with fullCapacity>0)
  const portfolioSymbols = useMemo(() => {
    if (Array.isArray(symbols) && symbols.length > 0) return symbols;
    try {
      // collect from localStorage keys fund_position_{sym}
      const syms: string[] = [];
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('fund_position_')) {
          const sym = k.replace('fund_position_', '');
          try {
            const cfgRaw = localStorage.getItem(k);
            if (!cfgRaw) return;
            const cfg = JSON.parse(cfgRaw);
            const full = Number(cfg.fullCapacity) || 0;
            if (full > 0) syms.push(sym);
          } catch (e) { /* ignore per-key errors */ }
        }
      });
      // fallback: use fund_portfolio symbols if no fund_position_* found
      if (syms.length > 0) return syms;
      const raw = localStorage.getItem('fund_portfolio');
      if (!raw) return [] as string[];
      const arr: Ticker[] = JSON.parse(raw);
      return arr.map(t => t.symbol);
    } catch (e) { return [] as string[]; }
  }, [symbols]);

  // determine date range defaulting to earliest position/trade to today
  const computedRange = useMemo(() => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    let start = startDate;
    let end = endDate || todayStr;
    if (!start) {
      // First, prefer earliest configured startDate from fund_position_* for funds with fullCapacity>0
      let earliest: string | null = null;
      for (const s of portfolioSymbols) {
        try {
          const cfgRaw = localStorage.getItem(`fund_position_${s}`);
          if (cfgRaw) {
            const cfg = JSON.parse(cfgRaw);
            if (cfg && cfg.startDate) {
              const d = String(cfg.startDate);
              if (!earliest || d < earliest) earliest = d;
            }
          }
        } catch (e) { }
      }
      if (!earliest) {
        // fallback: use earliest trade date or history date across portfolioSymbols; else today
        for (const s of portfolioSymbols) {
          try {
            const trades = getTradesForSymbol(s) || [];
            for (const t of trades) {
              if (!earliest || t.date < earliest) earliest = t.date;
            }
          } catch (e) {}
          try {
            const hist = cacheService.getHistory(s) || [];
            if (hist.length > 0) {
              const first = hist[0];
              const dt = new Date(first.date);
              const dstr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
              if (!earliest || dstr < earliest) earliest = dstr;
            }
          } catch (e) {}
        }
      }
      start = earliest || todayStr;
    }
    return { startDate: start, endDate: end };
  }, [startDate, endDate, portfolioSymbols]);

  const compute = useCallback(async (useFull = false) => {
    setLoading(true);
    setError(null);
    try {
      // prepare trades and valuationHistory structures
      const tradesMap: Record<string, Trade[]> = {};
      const valuationMap: Record<string, ValuationPoint[]> = {};
      const initialPositions: Record<string, number> = {};

      for (const s of portfolioSymbols) {
        // trades
        try {
          const arr = getTradesForSymbol(s) || [];
          tradesMap[s] = arr.map(t => ({ id: t.id, date: t.date, type: t.type as any, shares: t.shares, price: t.price }));
        } catch (e) { tradesMap[s] = []; }

        // valuations -> map history points to {date, price}
        try {
          const hist = cacheService.getHistory(s) || [];
          // hist items are HistoricalPoint with date as timestamp in ms
          valuationMap[s] = hist.map(h => {
            const d = new Date(h.date);
            const dstr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            return { date: dstr, price: h.value };
          });
        } catch (e) { valuationMap[s] = []; }

        // include latest realtime valuation (if any) as endDate price to ensure last point matches current market value
        try {
          // prefer override (from PositionsModal.marketData) so trend last point matches UI
          const override = valuationsOverride && valuationsOverride[s];
          const vd = override || cacheService.getValuation(s);
          if (vd) {
            const price = (vd.currentPrice && vd.currentPrice > 0) ? vd.currentPrice : (vd.previousPrice || 0);
            if (price > 0) {
              // push or replace an entry for computedRange.endDate
              const endD = computedRange.endDate;
              const arr = valuationMap[s] || [];
              // if last entry date is same as endD, replace; else push
              if (arr.length > 0 && arr[arr.length - 1].date === endD) {
                arr[arr.length - 1] = { date: endD, price };
              } else {
                arr.push({ date: endD, price });
              }
              valuationMap[s] = arr;
            }
          }
        } catch (e) { /* ignore */ }

        // initial position from localStorage fund_position_{sym}
        try {
          const cfgRaw = localStorage.getItem(`fund_position_${s}`);
          if (cfgRaw) {
            const cfg = JSON.parse(cfgRaw);
            initialPositions[s] = Number(cfg.initialPosition) || 0;
          } else initialPositions[s] = 0;
        } catch (e) { initialPositions[s] = 0; }
      }

      const input: PositionTrendInput = {
        symbols: portfolioSymbols,
        initialPositions,
        trades: tradesMap,
        valuationHistory: valuationMap,
        startDate: computedRange.startDate,
        endDate: computedRange.endDate
      };

      const fullSeries = computePositionTrend(input);
      if (!useFull && fullSeries.length > maxPoints) {
        const sampled = downsampleLTTB(fullSeries, maxPoints);
        setFullResolutionAvailable(true);
        return sampled;
      }
      setFullResolutionAvailable(false);
      return fullSeries;
    } catch (e: any) {
      setError(e);
      return null;
    } finally {
      setLoading(false);
    }
  }, [portfolioSymbols, computedRange, maxPoints]);

  const [data, setData] = useState<PositionTrendSeries | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await compute(false);
      if (mounted) setData(res as PositionTrendSeries);
    })();
    return () => { mounted = false; };
  }, [compute]);

  const reload = useCallback(async () => {
    const res = await compute(false);
    setData(res as PositionTrendSeries);
  }, [compute]);

  const loadFullResolution = useCallback(async () => {
    const res = await compute(true);
    setData(res as PositionTrendSeries);
  }, [compute]);

  return { data, loading, error, reload, fullResolutionAvailable, loadFullResolution };
}
