import { useCallback, useEffect, useMemo, useState } from 'react';
import { computePositionTrend, downsampleLTTB, PositionTrendSeries, PositionTrendInput, Trade, ValuationPoint } from '../utils/positionTrend';
import { getAllTradeDates, readAll as readAllTrades, getTradesForSymbol } from './useTrades';
import { Ticker, HistoricalPoint } from '../types';
import * as marketFundService from '../services/marketFundService';
import { prepareHistoryForProfitCalculation, getAllFundNavDateInfo, FundNavDateInfo } from '../services/fundService';
import { toLocalDateKey } from '../utils/priceResolver';

/**
 * 准备估值历史数据（纯函数）
 *
 * @param history 历史净值数据
 * @param valuation 当前估值数据
 * @param position 持仓信息
 * @param targetDate 目标日期
 * @param allFundNavDates 所有基金的净值日期信息（用于T+2校准）
 * @returns 估值历史数据点数组
 */
export function prepareValuationHistory(
  history: HistoricalPoint[],
  valuation: {
    currentPrice?: number;
    realtimeDate?: string | null;
    previousPrice?: number;
    netWorthDate?: string | null;
  } | null,
  position: {
    navType?: 'T+1' | 'T+2';
  } | null | undefined,
  targetDate: string,
  allFundNavDates: FundNavDateInfo[]
): ValuationPoint[] {
  const preparedHist = prepareHistoryForProfitCalculation({
    history,
    targetDate,
    todayDate: targetDate,
    currentPrice: valuation?.currentPrice,
    realtimeDate: valuation?.realtimeDate,
    previousPrice: valuation?.previousPrice,
    netWorthDate: valuation?.netWorthDate,
    navType: position?.navType,
    allFundNavDates,
  });

  return preparedHist.map(h => ({
    date: toLocalDateKey(h.date),
    price: h.value
  }));
}

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
    const todayStr = toLocalDateKey(today);
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
              const dstr = toLocalDateKey(first.date);
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
      // Collect all fund nav date info for T+2 date calibration
      const allFundNavDates = getAllFundNavDateInfo(portfolioSymbols);

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

        // valuations -> use prepareValuationHistory for consistency with overall profit
        try {
          const hist = marketFundService.getHistory(s) || [];
          const vd = valuationsOverride?.[s] || marketFundService.getValuation(s);
          const pos = marketFundService.getPosition(s);

          valuationMap[s] = prepareValuationHistory(
            hist,
            vd,
            pos,
            computedRange.endDate,
            allFundNavDates
          );
        } catch (e) { valuationMap[s] = []; }

        // initial position from marketFundService
        try {
          const pos = marketFundService.getPosition(s);
          initialPositions[s] = pos?.initialPosition || 0;

          // 如果有建仓记录，将其添加到 tradesMap 中（用于净投入计算）
          // buildSharesTimeline 会跳过 initial 类型，避免重复计算持仓份额
          // 使用基金的实际建仓日期（pos.startDate），而非图表起始日期
          if (pos && pos.initialPosition > 0 && pos.initialPrice && pos.startDate) {
            const initialTrade = {
              id: '__initial__',
              date: pos.startDate, // 使用基金的实际建仓日期
              type: 'initial' as const,
              shares: pos.initialPosition,
              price: pos.initialPrice,
              fee: 0
            };
            tradesMap[s] = [...(tradesMap[s] || []), initialTrade];
            // 注意：不再强制添加估值，使用实际历史净值数据
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
