import { useCallback, useEffect, useMemo, useState } from 'react';
import { computePositionTrend, downsampleLTTB, PositionTrendSeries, PositionTrendInput, Trade, ValuationPoint } from '../utils/positionTrend';
import { getAllTradeDates, readAll as readAllTrades, getTradesForSymbol } from './useTrades';
import { Ticker } from '../types';
import * as marketFundService from '../services/marketFundService';

interface UsePositionTrendParams {
  startDate?: string;
  endDate?: string;
  symbols?: string[]; // optional override; if absent, derive from marketFundService
  maxPoints?: number; // threshold to downsample (default 500)
  valuationsOverride?: Record<string, any>;
}

export default function usePositionTrend(params: UsePositionTrendParams = {}) {
  const { startDate, endDate, symbols, maxPoints = 500, valuationsOverride } = params;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [fullResolutionAvailable, setFullResolutionAvailable] = useState(false);

  // read symbols: prefer explicit symbols; else derive from marketFundService (funds with fullCapacity>0)
  const portfolioSymbols = useMemo(() => {
    if (Array.isArray(symbols) && symbols.length > 0) return symbols;
    try {
      // 从 marketFundService 获取所有有持仓的基金
      const allSymbols = marketFundService.getAllFundSymbols();
      const syms: string[] = [];
      for (const sym of allSymbols) {
        const pos = marketFundService.getPosition(sym);
        // 如果有持仓信息且满仓金额 > 0，则包含该基金
        if (pos && pos.fullCapacity > 0) {
          syms.push(sym);
        }
      }
      return syms;
    } catch (e) { return [] as string[]; }
  }, [symbols]);

  // determine date range defaulting to earliest position/trade to today
  const computedRange = useMemo(() => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    let start = startDate;
    let end = endDate || todayStr;
    if (!start) {
      // 从 marketFundService 获取最早的 startDate
      let earliest: string | null = null;
      for (const s of portfolioSymbols) {
        try {
          const pos = marketFundService.getPosition(s);
          if (pos && pos.startDate) {
            const d = String(pos.startDate);
            if (!earliest || d < earliest) earliest = d;
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
            const hist = marketFundService.getHistory(s) || [];
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
          tradesMap[s] = arr.map(t => ({
            id: t.id,
            date: t.date,
            type: t.type as any,
            shares: t.shares,
            price: t.price,
            fee: t.fee || 0
          }));
        } catch (e) { tradesMap[s] = []; }

        // valuations -> map history points to {date, price}
        try {
          const hist = marketFundService.getHistory(s) || [];
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
          const vd = override || marketFundService.getValuation(s);
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

        // initial position from marketFundService
        try {
          const pos = marketFundService.getPosition(s);
          initialPositions[s] = pos?.initialPosition || 0;

          // 如果有建仓记录，将其添加到 tradesMap 中（用于净投入计算）
          // buildSharesTimeline 会跳过 initial 类型，避免重复计算持仓份额
          // 为了和持仓计算保持一致（假设建仓日期之前仓位已存在），将 initial trade 的日期设为图表起始日期
          if (pos && pos.initialPosition > 0 && pos.initialPrice) {
            const initialTrade = {
              id: '__initial__',
              date: computedRange.startDate, // 使用图表起始日期，而非基金建仓日期
              type: 'initial' as const,
              shares: pos.initialPosition,
              price: pos.initialPrice,
              fee: 0
            };
            tradesMap[s] = [...(tradesMap[s] || []), initialTrade];

            // 同时将图表起始日期的估值添加到 valuationMap，使用建仓价格
            // 这样起始日期就有估值数据，持仓总金额不会为 0
            const arr = valuationMap[s] || [];
            // 检查是否已经有该日期的估值，如果没有则添加
            if (!arr.find(v => v.date === computedRange.startDate)) {
              arr.push({ date: computedRange.startDate, price: pos.initialPrice });
              valuationMap[s] = arr;
            }
          }
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
  }, [portfolioSymbols, computedRange, maxPoints, valuationsOverride]);

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
