import { HistoricalPoint } from '../types';
import { TradeRecord } from '../hooks/useTrades';

export interface ProfitPoint {
  date: string; // YYYY-MM-DD
  netValue: number; // 当日净值（每份）
  shares: number; // 当日持仓份额
  cumulativeProfit: number; // 累计盈利（金额）
  dailyProfit: number; // 当日盈利（金额） = cumulative - 前一日累计
}

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

  for (const p of sortedHistory) {
    const dateKey = tsToISODate(p.date);
    if (dateKey < start) {
      // still need to accumulate trades that occur before start because they affect holdings
      const dayTrades = tradesByDate[dateKey] || [];
      for (const t of dayTrades) {
        if (t.type === 'buy') {
          runningBuyShares += t.shares;
          cumulativeBuyAmount += (t.price || 0) * (t.shares || 0) + (t.fee || 0);
        } else {
          runningSellShares += t.shares;
          cumulativeSellAmount += (t.price || 0) * (t.shares || 0) - (t.fee || 0);
        }
      }
      continue;
    }
    if (dateKey > end) break;

    // process trades for this date (inclusive)
    const dayTrades = tradesByDate[dateKey] || [];
    for (const t of dayTrades) {
      if (t.type === 'buy') {
        runningBuyShares += t.shares;
        cumulativeBuyAmount += (t.price || 0) * (t.shares || 0) + (t.fee || 0);
      } else {
        runningSellShares += t.shares;
        cumulativeSellAmount += (t.price || 0) * (t.shares || 0) - (t.fee || 0);
      }
    }

    const shares = initialPosition + runningBuyShares - runningSellShares;
    const netValue = p.value || 0;
    const initCost = (initialPrice !== null && initialPrice !== undefined) ? (initialPosition * initialPrice) : 0;
    const cumulative = (shares * netValue) - initCost - cumulativeBuyAmount + cumulativeSellAmount;
    const daily = Number((cumulative - cumulativePrevious).toFixed(4));
    const cumRounded = Number(cumulative.toFixed(4));

    timeline.push({ date: dateKey, netValue: Number(netValue.toFixed(4)), shares, cumulativeProfit: cumRounded, dailyProfit: daily });

    cumulativePrevious = cumulative;
  }

  return timeline;
}

