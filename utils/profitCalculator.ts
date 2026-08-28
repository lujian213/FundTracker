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
  historyEndDate?: string | null; // 原始历史数据的最后日期（不包含填充的日期），用于判断是否需要补充没有数据的日期
}): ProfitPoint[] {
  const { history, trades, initialPosition, initialPrice, fromDate, toDate, historyEndDate } = params;
  if (!history || history.length === 0) return [];

  // 数据已在 prepareHistoryForProfitCalculation 中排序，直接使用
  const sortedHistory = history;

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
  let cumulativeDividendAmount = 0; // sum of total for dividends up to yesterday
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
  let dividendAmountBeforeToday = 0;

  for (const p of sortedHistory) {
    const dateKey = tsToISODate(p.date);
    if (dateKey < start) {
      // 先计算该日期的累计盈利（使用"截止到昨天的累计"）
      const shares = initialPosition + buySharesBeforeToday - sellSharesBeforeToday;
      const netValueBeforeStart = p.value || 0;
      const initCostBeforeStart = (initialPrice !== null && initialPrice !== undefined) ? (initialPosition * initialPrice) : 0;
      const cumulative = (shares * netValueBeforeStart) - initCostBeforeStart - buyAmountBeforeToday + sellAmountBeforeToday + dividendAmountBeforeToday;
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
          } else if (t.type === 'sell') {
            runningSellShares += t.shares;
            cumulativeSellAmount += (t.price || 0) * (t.shares || 0) - fee;
          } else if (t.type === 'dividend') {
            // 分红：累加金额，不影响份额
            cumulativeDividendAmount += t.total || 0;
          }
        }
      }

      // 更新"截止到今天"的累计值
      lastProcessedDate = dateKey;
      buySharesBeforeToday = runningBuyShares;
      sellSharesBeforeToday = runningSellShares;
      buyAmountBeforeToday = cumulativeBuyAmount;
      sellAmountBeforeToday = cumulativeSellAmount;
      dividendAmountBeforeToday = cumulativeDividendAmount;
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
          } else if (t.type === 'sell') {
            runningSellShares += t.shares;
            cumulativeSellAmount += (t.price || 0) * (t.shares || 0) - fee;
          } else if (t.type === 'dividend') {
            // 分红：累加金额，不影响份额
            cumulativeDividendAmount += t.total || 0;
          }
        }
      }
      // 更新"截止到昨天的累计值"
      buySharesBeforeToday = runningBuyShares;
      sellSharesBeforeToday = runningSellShares;
      buyAmountBeforeToday = cumulativeBuyAmount;
      sellAmountBeforeToday = cumulativeSellAmount;
      dividendAmountBeforeToday = cumulativeDividendAmount;
      lastProcessedDate = dateKey;
    }

    // 使用"截止到昨天的累计值"计算当日份额和累计盈利
    const shares = initialPosition + buySharesBeforeToday - sellSharesBeforeToday;
    const netValue = p.value || 0;
    const initCost = (initialPrice !== null && initialPrice !== undefined) ? (initialPosition * initialPrice) : 0;
    const cumulative = (shares * netValue) - initCost - buyAmountBeforeToday + sellAmountBeforeToday + dividendAmountBeforeToday;

    // 当日盈利 = 当日累计盈利 - 前一日累计盈利
    const daily = Number((cumulative - cumulativePrevious).toFixed(4));
    const cumRounded = Number(cumulative.toFixed(4));

    timeline.push({ date: dateKey, netValue: Number(netValue.toFixed(4)), shares, cumulativeProfit: cumRounded, dailyProfit: daily });

    cumulativePrevious = cumulative;
  }

  // 如果用户选择的结束日期超过原始历史数据的最后日期，补充没有数据的日期
  // 这些日期的当日盈利为0，累计盈利沿用最后有数据那天的累计盈利
  if (historyEndDate && toDate && toDate > historyEndDate && timeline.length > 0) {
    // 先移除 timeline 中所有 date > historyEndDate 的点（这些是用错误逻辑填充的）
    const validPoints = timeline.filter(p => p.date <= historyEndDate);

    // 找到 historyEndDate 对应的数据点（有有效数据的最后一天）
    const lastValidPoint = validPoints.find(p => p.date === historyEndDate);
    // 如果找不到有效的点，跳过补充逻辑
    if (lastValidPoint) {
      const lastDateObj = new Date(historyEndDate);
      const toDateObj = new Date(toDate);

      // 从历史最后日期的第二天开始，到用户选择的结束日期为止
      const currentDate = new Date(lastDateObj);
      currentDate.setDate(currentDate.getDate() + 1);

      while (currentDate <= toDateObj) {
        const dateKey = tsToISODate(currentDate.getTime());
        // 使用 historyEndDate 那天的净值和累计盈利来补充后续日期
        // 这样当日盈利为0，累计盈利保持不变
        validPoints.push({
          date: dateKey,
          netValue: lastValidPoint.netValue,
          shares: lastValidPoint.shares,
          cumulativeProfit: lastValidPoint.cumulativeProfit,
          dailyProfit: 0,
        });
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // 用新的正确数据替换 timeline
      timeline.length = 0;
      validPoints.forEach(p => timeline.push(p));
    }
  }

  return timeline;
}