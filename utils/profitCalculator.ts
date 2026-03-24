import { HistoricalPoint, ProfitPoint, TradeRecord } from '../types';

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
  let cumulativeBuyAmount = 0; // sum of (price*shares + fee) for buys up to yesterday
  let cumulativeSellAmount = 0; // sum of (price*shares - fee) for sells up to yesterday
  let cumulativePrevious = 0;
  let runningBuyShares = 0;
  let runningSellShares = 0;
  // Track which dates have already had their trades applied to avoid double-counting
  // when history contains multiple points with the same local date (e.g. original + synthetic).
  const tradesAppliedForDate = new Set<string>();
  // 用于记录"截止到昨天的累计值"，确保同一天所有历史点使用相同的数据
  let lastProcessedDate = '';
  let buySharesBeforeToday = 0;
  let sellSharesBeforeToday = 0;
  let buyAmountBeforeToday = 0;
  let sellAmountBeforeToday = 0;

  for (const p of sortedHistory) {
    const dateKey = tsToISODate(p.date);
    if (dateKey < start) {
      // 先计算该日期的累计盈利（使用"截止到昨天的累计"）
      const shares = initialPosition + buySharesBeforeToday - sellSharesBeforeToday;
      const netValueBeforeStart = p.value || 0;
      const initCostBeforeStart = (initialPrice !== null && initialPrice !== undefined) ? (initialPosition * initialPrice) : 0;
      const cumulative = (shares * netValueBeforeStart) - initCostBeforeStart - buyAmountBeforeToday + sellAmountBeforeToday;
      cumulativePrevious = cumulative;

      // 然后累加该日期的交易
      if (!tradesAppliedForDate.has(dateKey)) {
        tradesAppliedForDate.add(dateKey);
        const dayTrades = tradesByDate[dateKey] || [];
        for (const t of dayTrades) {
          const fee = t.fee || 0;
          if (t.type === 'buy') {
            runningBuyShares += t.shares;
            cumulativeBuyAmount += (t.price || 0) * (t.shares || 0) + fee;
          } else {
            runningSellShares += t.shares;
            cumulativeSellAmount += (t.price || 0) * (t.shares || 0) - fee;
          }
        }
      }

      // 更新"截止到今天"的累计值
      lastProcessedDate = dateKey;
      buySharesBeforeToday = runningBuyShares;
      sellSharesBeforeToday = runningSellShares;
      buyAmountBeforeToday = cumulativeBuyAmount;
      sellAmountBeforeToday = cumulativeSellAmount;
      continue;
    }
    if (dateKey > end) break;

    // 当日期变化时，更新"截止到昨天的累计值"
    if (lastProcessedDate !== dateKey) {
      // 累加上一天的交易
      if (lastProcessedDate && !tradesAppliedForDate.has(lastProcessedDate)) {
        tradesAppliedForDate.add(lastProcessedDate);
        const prevDayTrades = tradesByDate[lastProcessedDate] || [];
        for (const t of prevDayTrades) {
          const fee = t.fee || 0;
          if (t.type === 'buy') {
            runningBuyShares += t.shares;
            cumulativeBuyAmount += (t.price || 0) * (t.shares || 0) + fee;
          } else {
            runningSellShares += t.shares;
            cumulativeSellAmount += (t.price || 0) * (t.shares || 0) - fee;
          }
        }
      }
      // 更新"截止到昨天的累计值"
      buySharesBeforeToday = runningBuyShares;
      sellSharesBeforeToday = runningSellShares;
      buyAmountBeforeToday = cumulativeBuyAmount;
      sellAmountBeforeToday = cumulativeSellAmount;
      lastProcessedDate = dateKey;
    }

    // 使用"截止到昨天的累计值"计算当日份额和累计盈利
    const shares = initialPosition + buySharesBeforeToday - sellSharesBeforeToday;
    const netValue = p.value || 0;
    const initCost = (initialPrice !== null && initialPrice !== undefined) ? (initialPosition * initialPrice) : 0;
    const cumulative = (shares * netValue) - initCost - buyAmountBeforeToday + sellAmountBeforeToday;

    // 当日盈利 = 当日累计盈利 - 前一日累计盈利
    const daily = Number((cumulative - cumulativePrevious).toFixed(4));
    const cumRounded = Number(cumulative.toFixed(4));

    timeline.push({ date: dateKey, netValue: Number(netValue.toFixed(4)), shares, cumulativeProfit: cumRounded, dailyProfit: daily });

    cumulativePrevious = cumulative;
  }

  return timeline;
}