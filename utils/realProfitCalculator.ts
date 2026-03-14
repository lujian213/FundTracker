import { HistoricalPoint, ValuationData } from '../types';
import { TradeRecord } from '../hooks/useTrades';
import { computeProfitTimeline } from './profitCalculator';
import { adjustProfitTimelineForDisplay } from './profitAdjustment';
import { toLocalDateKey } from './priceResolver';
import { resolvePreferredPrice } from './priceResolver';

// Interface for the position data
interface PositionData {
  startDate: string | null;
  initialPosition: number;
  initialPrice: number | null;
}

/**
 * Builds effective history for profit calculation, mirroring VirtualTradeModal's effectiveHistoryForProfit
 */
const buildEffectiveHistoryForProfit = (
  fundHistory: HistoricalPoint[],
  marketData?: ValuationData | null
): HistoricalPoint[] => {
  if (!fundHistory || fundHistory.length === 0) return fundHistory || [];

  // Sort the history
  const sorted = [...fundHistory].sort((a, b) => (a.date as number) - (b.date as number));

  // Get today's date
  const todayLocal = toLocalDateKey(new Date());

  // Prepare market data for resolving preferred price
  const currentPrice = marketData?.currentPrice ?? null;
  const realtimeDate = marketData?.realtimeDate ?? null;
  const previousPrice = marketData?.previousPrice ?? null;
  const netWorthDate = marketData?.netWorthDate ?? null;

  // Resolve preferred price for today
  const preferred = resolvePreferredPrice({
    targetDate: todayLocal,
    todayDate: todayLocal,
    history: sorted,
    currentPrice,
    realtimeDate,
    previousPrice,
    netWorthDate,
  });

  if (!preferred) return sorted;

  // Create a timestamp for today's preferred price
  const preferredTs = new Date(`${preferred.date} 15:00`).getTime();

  // Create a map of dates to historical points
  const byDate = new Map<string, HistoricalPoint>();
  for (const p of sorted) {
    byDate.set(toLocalDateKey(p.date), p);
  }

  // Add or overwrite today's preferred price
  byDate.set(preferred.date, { date: preferredTs, value: preferred.price, equityReturn: 0 });

  // Return sorted array
  return Array.from(byDate.values()).sort((a, b) => (a.date as number) - (b.date as number));
};

/**
 * Normalizes trade data to ensure date is in YYYY-MM-DD string format
 */
const normalizeTrades = (trades: TradeRecord[]): TradeRecord[] => {
  return trades.map(t => {
    if (!t) return t;
    const d = t.date;
    let dateStr = d;
    if (typeof d === 'number') {
      const dateObj = new Date(d);
      dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    }
    return { ...t, date: dateStr };
  });
};

/**
 * Calculates real profit for a fund based on position data and trade history
 *
 * @param fundSymbol The symbol of the fund
 * @param startDate The start date for profit calculation
 * @param fundHistory Historical data for the fund
 * @param storedPosition Position configuration data
 * @param trades Trade history for the fund
 * @param marketData Optional market data for current prices
 * @returns The calculated real profit or null if calculation is not possible
 */
export const calculateRealProfit = async (
  fundSymbol: string,
  startDate: string,
  fundHistory: HistoricalPoint[],
  storedPosition: PositionData | null,
  trades: TradeRecord[],
  marketData?: ValuationData | null
): Promise<number | null> => {
  // Return null if no stored position
  if (!storedPosition || !storedPosition.startDate) {
    return null;
  }

  // Check if start date is valid for real profit calculation
  if (startDate < storedPosition.startDate) {
    return null;
  }

  // Normalize trades to have proper date format
  const normalizedTrades = normalizeTrades(trades);

  // Build effective history for profit calculation
  const effectiveHistoryForProfit = buildEffectiveHistoryForProfit(fundHistory, marketData);

  // Compute profit timeline using effective history
  const fullRealProfitTimeline = computeProfitTimeline({
    history: effectiveHistoryForProfit,
    trades: normalizedTrades,
    initialPosition: storedPosition.initialPosition || 0,
    initialPrice: storedPosition.initialPrice !== undefined ? storedPosition.initialPrice : null,
  });

  // Get today's date in local format
  const todayLocal = toLocalDateKey(new Date());

  // Filter timeline based on start date
  const displayedRealProfitTimeline = fullRealProfitTimeline.filter(p =>
    p.date >= startDate && p.date <= todayLocal
  );

  // Check if timeline is empty
  if (displayedRealProfitTimeline.length === 0) {
    return null;
  }

  // Adjust timeline using the shared utility
  const adjustedTimeline = adjustProfitTimelineForDisplay(displayedRealProfitTimeline, startDate);

  // Calculate total profit
  if (adjustedTimeline.length === 0) {
    return null;
  }

  const totalRealProfit = adjustedTimeline.reduce((sum, point) =>
    sum + (point.dailyProfit || 0), 0
  );

  return Math.round(totalRealProfit * 100) / 100;
};

/**
 * Synchronous version of calculateRealProfit
 */
export const calculateRealProfitSync = (
  fundSymbol: string,
  startDate: string,
  fundHistory: HistoricalPoint[],
  storedPosition: PositionData | null,
  trades: TradeRecord[],
  marketData?: ValuationData | null
): number | null => {
  // Return null if no stored position
  if (!storedPosition || !storedPosition.startDate) {
    return null;
  }

  // Check if start date is valid for real profit calculation
  if (startDate < storedPosition.startDate) {
    return null;
  }

  // Normalize trades to have proper date format
  const normalizedTrades = normalizeTrades(trades);

  // Build effective history for profit calculation
  const effectiveHistoryForProfit = buildEffectiveHistoryForProfit(fundHistory, marketData);

  // Compute profit timeline using effective history
  const fullRealProfitTimeline = computeProfitTimeline({
    history: effectiveHistoryForProfit,
    trades: normalizedTrades,
    initialPosition: storedPosition.initialPosition || 0,
    initialPrice: storedPosition.initialPrice !== undefined ? storedPosition.initialPrice : null,
  });

  // Get today's date in local format
  const todayLocal = toLocalDateKey(new Date());

  // Filter timeline based on start date
  const displayedRealProfitTimeline = fullRealProfitTimeline.filter(p =>
    p.date >= startDate && p.date <= todayLocal
  );

  // Check if timeline is empty
  if (displayedRealProfitTimeline.length === 0) {
    return null;
  }

  // Adjust timeline using the shared utility
  const adjustedTimeline = adjustProfitTimelineForDisplay(displayedRealProfitTimeline, startDate);

  // Calculate total profit
  if (adjustedTimeline.length === 0) {
    return null;
  }

  const totalRealProfit = adjustedTimeline.reduce((sum, point) =>
    sum + (point.dailyProfit || 0), 0
  );

  return Math.round(totalRealProfit * 100) / 100;
};

/**
 * Gets stored position data from localStorage for a fund
 */
export const getStoredPosition = (fundSymbol: string): PositionData | null => {
  try {
    const rawKey = `fund_position_${fundSymbol}`;
    const padKey = `fund_position_${String(fundSymbol).padStart(6, '0')}`;
    const raw = localStorage.getItem(rawKey) || localStorage.getItem(padKey);
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    return {
      startDate: typeof cfg.startDate === 'string' ? cfg.startDate : null,
      initialPosition: typeof cfg.initialPosition === 'number' ? Number(cfg.initialPosition) || 0 : (typeof cfg.initialPosition === 'string' ? Number(cfg.initialPosition) || 0 : 0),
      initialPrice: cfg.initialPrice !== undefined ? (cfg.initialPrice === null ? null : Number(cfg.initialPrice)) : null,
    };
  } catch (e) {
    console.error(`Error reading stored position for ${fundSymbol}:`, e);
    return null;
  }
};

/**
 * Gets trade data for a fund from localStorage
 */
export const getTradesForFund = (fundSymbol: string): TradeRecord[] => {
  try {
    const raw = localStorage.getItem('fund_trades');
    const all = raw ? JSON.parse(raw) : {};
    return Array.isArray(all[fundSymbol]) ? all[fundSymbol] : [];
  } catch (e) {
    console.error(`Error getting trades for ${fundSymbol}:`, e);
    return [];
  }
};