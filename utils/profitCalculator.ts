import { HistoricalPoint, ProfitPoint } from '../types';
import { TradeRecord } from '../hooks/useTrades';

// helper: convert timestamp (ms) to YYYY-MM-DD local
function tsToISODate(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// compute profit timeline
export function computeProfitTimeline(params: {
  history: HistoricalPoint[]; // array of points (date: number timestamp, value)
  trades: TradeRecord[]; // trades with date: YYYY-MM-DD, type: 'buy'|'sell', shares, price, fee
  initialPosition: number; // initial shares
  initialPrice: number | null; // initial price per share (may be null)
  fromDate?: string | null; // inclusive YYYY-MM-DD
  toDate?: string | null; // inclusive YYYY-MM-DD
}): ProfitPoint[] {
  const { history, trades, initialPosition, initialPrice, fromDate, toDate } = params;
  if (!history || history.length === 0) return [];

  // normalize and sort history ascending by date
  const sortedHistory = [...history].sort((a, b) => (a.date as number) - (b.date as number));

  // map trades by date string and also build cumulative sums when iterating
  const tradesByDate: Record<string, TradeRecord[]> = {};
  for (const t of trades || []) {
    const d = (t.date || '').trim();
    if (!d) continue;
    if (!tradesByDate[d]) tradesByDate[d] = [];
    tradesByDate[d].push(t);
  }

  // determine timeline boundaries
  const firstDate = tsToISODate(sortedHistory[0].date);
  const lastDate = tsToISODate(sortedHistory[sortedHistory.length - 1].date);
  const start = fromDate && fromDate > firstDate ? fromDate : firstDate;
  const end = toDate && toDate < lastDate ? toDate : lastDate;

  // iterate history points and only include those within [start, end]
  const timeline: ProfitPoint[] = [];
  let cumulativeBuyAmount = 0; // sum of (price*shares + fee) for buys up to current day
  let cumulativeSellAmount = 0; // sum of (price*shares - fee) for sells up to current day
  let cumulativePrevious = 0;
  let runningBuyShares = 0;
  let runningSellShares = 0;
  // Track which dates have already had their trades applied to avoid double-counting
  // when history contains multiple points with the same local date (e.g. original + synthetic).
  const tradesAppliedForDate = new Set<string>();

  for (const p of sortedHistory) {
    const dateKey = tsToISODate(p.date);
    if (dateKey < start) {
      // still need to accumulate trades that occur before start because they affect holdings
      let preStartFee = 0;
      if (!tradesAppliedForDate.has(dateKey)) {
        tradesAppliedForDate.add(dateKey);
        const dayTrades = tradesByDate[dateKey] || [];
        for (const t of dayTrades) {
          const fee = t.fee || 0;
          preStartFee += fee;
          if (t.type === 'buy') {
            runningBuyShares += t.shares;
            cumulativeBuyAmount += (t.price || 0) * (t.shares || 0) + fee;
          } else {
            runningSellShares += t.shares;
            cumulativeSellAmount += (t.price || 0) * (t.shares || 0) - fee;
          }
        }
      }
      // update cumulativePrevious so that the first displayed day's dailyProfit reflects
      // only the change on that day, not the full cumulative from history start.
      // Apply fee-deferral: add back today's fees so the next day's daily correctly
      // excludes the current day's fee impact.
      const sharesBeforeStart = initialPosition + runningBuyShares - runningSellShares;
      const netValueBeforeStart = p.value || 0;
      const initCostBeforeStart = (initialPrice !== null && initialPrice !== undefined) ? (initialPosition * initialPrice) : 0;
      const cumBeforeStart = (sharesBeforeStart * netValueBeforeStart) - initCostBeforeStart - cumulativeBuyAmount + cumulativeSellAmount;
      cumulativePrevious = cumBeforeStart + preStartFee;
      continue;
    }
    if (dateKey > end) break;

    // process trades for this date only on first encounter of this dateKey
    let todayFee = 0;
    if (!tradesAppliedForDate.has(dateKey)) {
      tradesAppliedForDate.add(dateKey);
      const dayTrades = tradesByDate[dateKey] || [];
      for (const t of dayTrades) {
        const fee = t.fee || 0;
        todayFee += fee;
        if (t.type === 'buy') {
          runningBuyShares += t.shares;
          cumulativeBuyAmount += (t.price || 0) * (t.shares || 0) + fee;
        } else {
          runningSellShares += t.shares;
          cumulativeSellAmount += (t.price || 0) * (t.shares || 0) - fee;
        }
      }
    }

    const shares = initialPosition + runningBuyShares - runningSellShares;
    const netValue = p.value || 0;
    const initCost = (initialPrice !== null && initialPrice !== undefined) ? (initialPosition * initialPrice) : 0;
    const cumulative = (shares * netValue) - initCost - cumulativeBuyAmount + cumulativeSellAmount;
    // daily profit = change in (cumulative + todayFee) from the prior day's same adjusted basis.
    // Adding todayFee back into the "adjusted cumulative" used for the next day's baseline means
    // each day's dailyProfit reflects only the NAV price-change effect on the current position,
    // while the fee cost is recognised in the *following* day's dailyProfit — matching the
    // standard reference convention used by Chinese fund platforms.
    const adjustedCumulative = cumulative + todayFee;
    const daily = Number((adjustedCumulative - cumulativePrevious).toFixed(4));
    const cumRounded = Number(cumulative.toFixed(4));

    timeline.push({ date: dateKey, netValue: Number(netValue.toFixed(4)), shares, cumulativeProfit: cumRounded, dailyProfit: daily });

    cumulativePrevious = adjustedCumulative;
  }

  return timeline;
}