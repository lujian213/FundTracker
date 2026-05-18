import { HistoricalPoint, VirtualStrategy, VirtualTradeResult, VirtualTradeRow, VirtualStrategyContext } from '../types';
import { computeMultipleSMAs } from '../utils/movingAverage';
import { toLocalDateKey } from '../utils/priceResolver';

// Helper rounding functions
function round2(v: number) { return Math.round(v * 100) / 100; }
function round4(v: number) { return Math.round(v * 10000) / 10000; }

export interface RunOpts {
  startDate: string; // YYYY-MM-DD
  initialCash: number;
  initialShares: number;
  // optional valuation/currentPrice used for final-day total calculation
  currentPrice?: number | null;
  realtimeDate?: string | null;
  previousPrice?: number | null;
  netWorthDate?: string | null;
  // optional fund-specific configuration
  fundConfig?: {
    maxPosition?: number;
    initialDate?: string | null;
    initialPosition?: number;
    initialPrice?: number | null;
    [key: string]: any;
  };
  // optional user-specific configuration
  userConfig?: {
    globalMaxPosition?: number;
    riskPreference?: 'conservative' | 'balanced' | 'aggressive';
    minCashReserve?: number;
    [key: string]: any;
  };
}

// Main runner: returns complete timeline from startDate to yesterday (skipping dates without history points)
export function runVirtualTrade(strategy: VirtualStrategy, history: HistoricalPoint[], opts: RunOpts): VirtualTradeResult {
  // sort history ascending
  const hist = (history || []).slice().sort((a, b) => a.date - b.date);
  // build map of date -> value
  const byDate: Record<string, number> = {};
  for (const p of hist) {
    const d = toLocalDateKey(p.date);
    if (d && p.value > 0) byDate[d] = p.value;
  }

  const dates = Object.keys(byDate).sort();
  if (dates.length === 0) return { timeline: [], summary: { initialTotal: 0, finalTotal: 0, totalProfit: 0 }, todayTip: null };

  // ensure startDate exists or is adjusted to first available
  const start = opts.startDate in byDate ? opts.startDate : (dates.find(d => d >= opts.startDate) || dates[0]);

  // build working chronological array of available trade dates from start to last historical date (inclusive)
  const tradeDates = dates.filter(d => d >= start);
  if (tradeDates.length === 0) return { timeline: [], summary: { initialTotal: 0, finalTotal: 0, totalProfit: 0 }, todayTip: null };

  // Precompute SMA arrays on the full history values (ascending same order as dates)
  const values = dates.map(d => byDate[d]);
  const windows = [5, 10, 20];
  const mas = computeMultipleSMAs(values, windows);
  const dateIndex = Object.fromEntries(dates.map((d, i) => [d, i]));

  // initial total asset uses start date NAV
  const startNav = byDate[start];
  const initialTotal = round2(opts.initialCash + opts.initialShares * startNav);

  let cash = opts.initialCash;
  let shares = opts.initialShares;

  const timeline: VirtualTradeRow[] = [];
  let prevTotal = initialTotal;

  // Track transaction history for the strategy
  let transactionHistory: Array<{
    date: string; // YYYY-MM-DD
    action: 'buy' | 'sell' | 'hold';
    nav: number;  // NAV at the time of decision
    shares: number; // number of shares traded (positive for buy, negative for sell)
    amount: number; // monetary amount involved
  }> = [];

  for (let i = 0; i < tradeDates.length; i++) {
    const d = tradeDates[i];
    const idx = dateIndex[d];
    const nav = byDate[d];

    // context history up to previous day (ascending)
    const histUpToPrev = dates.slice(0, idx).map((dd, j) => ({ date: new Date(dd + ' 00:00').getTime(), value: byDate[dd], equityReturn: 0 } as HistoricalPoint));

    // build strategy context with transaction history
    const ctx: VirtualStrategyContext = {
      history: histUpToPrev,
      cash,
      shares,
      startNav,
      transactionHistory,
      fundConfig: opts.fundConfig,
      userConfig: opts.userConfig
    };

    const decision = strategy.decide(ctx) || { action: 'hold' as const, shares: 0 };
    let tradeShares = Math.max(0, Number(Number(decision.shares).toFixed(2)));
    let action: typeof decision.action = decision.action;
    // normalize reason to StrategyReason if present; if missing and action is hold, provide default StrategyReason
    let reason = (decision as any).reason as any;
    if (!reason && action === 'hold') {
      reason = { type: 'info', text: '无明确信号' };
    }
    let amount = 0;

    if (action === 'buy' && tradeShares > 0) {
      // cannot buy more than cash allows
      const maxBuy = Math.floor((cash / nav) * 100) / 100; // 2dp
      if (tradeShares > maxBuy) tradeShares = maxBuy;
      amount = tradeShares * nav;
      cash = round2(cash - amount);
      shares = round2(shares + tradeShares);
    } else if (action === 'sell' && tradeShares > 0) {
      // cannot sell more than shares
      if (tradeShares > shares) tradeShares = shares;
      amount = tradeShares * nav;
      cash = round2(cash + amount);
      shares = round2(shares - tradeShares);
    } else {
      action = 'hold';
      tradeShares = 0;
    }

    // Add this transaction to history if it was a buy or sell
    if (action !== 'hold' || tradeShares > 0) {
      transactionHistory.push({
        date: d,
        action,
        nav,
        shares: action === 'buy' ? tradeShares : (action === 'sell' ? -tradeShares : 0),
        amount: action === 'buy' ? amount : (action === 'sell' ? -amount : 0)
      });
    }

    // compute totalAfter: use next day's nav if available; for the last historical row, use a later available valuation price; otherwise fall back to the current nav
    let nextNav = nav;
    if (i + 1 < tradeDates.length) nextNav = byDate[tradeDates[i + 1]];
    else {
      const hasForwardValuation = (opts.currentPrice || 0) > 0 && !!opts.realtimeDate && opts.realtimeDate >= tradeDates[i];
      if (hasForwardValuation) nextNav = Number(opts.currentPrice);
    }

    const totalAfter = round2(cash + shares * nextNav);
    const profitSincePrev = round2(totalAfter - prevTotal);
    const profitSinceStart = round2(totalAfter - initialTotal);

    const row: VirtualTradeRow = {
      date: d,
      action,
      nav: round4(nav),
      shares: Number(tradeShares.toFixed(2)),
      amount: round2(amount),
      cashAfter: round2(cash),
      sharesAfter: round2(shares),
      totalAfter: round2(totalAfter),
      profitSincePrev,
      profitSinceStart,
      reason,
    };

    timeline.push(row);
    prevTotal = totalAfter;
  }

  // compute summary
  const finalTotal = timeline.length ? timeline[timeline.length - 1].totalAfter : initialTotal;
  const summary = { initialTotal: round2(initialTotal), finalTotal: round2(finalTotal), totalProfit: round2(finalTotal - initialTotal) };

  // today's tip: decide based on history up-to-last-day
  const lastIdx = dateIndex[tradeDates[tradeDates.length - 1]];
  const ctxForToday: VirtualStrategyContext = {
    history: dates.slice(0, lastIdx + 1).map(dd => ({ date: new Date(dd + ' 00:00').getTime(), value: byDate[dd], equityReturn: 0 } as HistoricalPoint)),
    cash,
    shares,
    startNav,
    transactionHistory,
    fundConfig: opts.fundConfig,
    userConfig: opts.userConfig
  };
  const todayDecision = strategy.decide(ctxForToday) || { action: 'hold' as const, shares: 0 };
  let todayReason = (todayDecision as any).reason as any;
  if (!todayReason && todayDecision.action === 'hold') todayReason = { type: 'info', text: '无明确信号' };
  return { timeline, summary, todayTip: todayDecision.action === 'hold' ? { action: 'hold', shares: 0, reason: todayReason } : { action: todayDecision.action, shares: Number(Number(todayDecision.shares).toFixed(2)), reason: todayReason } };
}
