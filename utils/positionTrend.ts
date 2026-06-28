import { HistoricalPoint } from '../types';

export interface PositionTrendPoint {
  date: string; // YYYY-MM-DD
  value: number; // 持仓总金额 in 元
  netInvestment?: number; // 累计净投入总额 in 元
}

export type PositionTrendSeries = PositionTrendPoint[];

export interface Trade {
  id?: string;
  date: string; // YYYY-MM-DD
  type: 'buy' | 'sell' | 'initial'; // 增加 'initial' 类型
  shares: number;
  price?: number;
  fee?: number; // 手续费
}

export interface ValuationPoint {
  date: string; // YYYY-MM-DD
  price: number;
}

export interface PositionTrendInput {
  symbols: string[]; // list of symbols to consider
  initialPositions: Record<string, number>; // initial shares per symbol
  trades: Record<string, Trade[]>; // trades per symbol
  valuationHistory: Record<string, ValuationPoint[]>; // valuations per symbol
  startDate: string; // inclusive YYYY-MM-DD
  endDate: string; // inclusive YYYY-MM-DD
}

// helper: parse YYYY-MM-DD to local Date at midnight
function parseDate(dateStr: string): Date {
  // Date constructor with YYYY-MM-DD is treated as UTC in some engines; parse components to avoid ambiguity
  const [y, m, d] = dateStr.split('-').map(s => parseInt(s, 10));
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(date: Date, days: number) {
  const r = new Date(date.getTime());
  r.setDate(r.getDate() + days);
  return r;
}

// Build an array of date strings from start to end inclusive
function buildDateArray(startDate: string, endDate: string): string[] {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const arr: string[] = [];
  let cur = start;
  while (cur.getTime() <= end.getTime()) {
    arr.push(formatDate(cur));
    cur = addDays(cur, 1);
  }
  return arr;
}

// compute cumulative shares per date for one symbol using trades + initial
function buildSharesTimeline(dates: string[], initial: number, trades: Trade[]): number[] {
  // trades assumed unsorted; sort by date asc
  const sorted = (trades || []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const res: number[] = new Array(dates.length).fill(0);
  let idx = 0;
  let cumulative = initial || 0;
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    while (idx < sorted.length && sorted[idx].date <= d) {
      // initial 类型已经通过 initial 参数处理，这里跳过避免重复计算
      if (sorted[idx].type !== 'initial') {
        cumulative += (sorted[idx].type === 'buy' ? sorted[idx].shares : -sorted[idx].shares);
      }
      idx++;
    }
    res[i] = cumulative;
  }
  return res;
}

// compute price per date by carrying forward last known valuation
function buildPriceTimeline(dates: string[], valuations: ValuationPoint[]): (number | null)[] {
  const sorted = (valuations || []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const res: (number | null)[] = new Array(dates.length).fill(null);
  let vi = 0;
  let lastPrice: number | null = null;
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    while (vi < sorted.length && sorted[vi].date <= d) {
      lastPrice = sorted[vi].price;
      vi++;
    }
    res[i] = lastPrice;
  }
  return res;
}

// compute cumulative net investment per date across all symbols
function buildNetInvestmentTimeline(
  dates: string[],
  trades: Record<string, Trade[]>
): number[] {
  // 为每个符号构建按日期排序的交易列表
  const sortedTradesMap: Record<string, Trade[]> = {};
  for (const sym of Object.keys(trades)) {
    sortedTradesMap[sym] = (trades[sym] || [])
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  const res: number[] = new Array(dates.length).fill(0);
  const tradeIndices: Record<string, number> = {};

  // 初始化每个符号的交易索引
  for (const sym of Object.keys(sortedTradesMap)) {
    tradeIndices[sym] = 0;
  }

  // 对每个日期，累加截止到该日期的所有交易额
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];

    // 复制前一天的累计值
    if (i > 0) {
      res[i] = res[i - 1];
    }

    // 遍历所有符号的交易
    for (const sym of Object.keys(sortedTradesMap)) {
      const tradeList = sortedTradesMap[sym];
      let idx = tradeIndices[sym] || 0;

      // 处理该日期及之前的所有交易
      while (idx < tradeList.length && tradeList[idx].date <= d) {
        const trade = tradeList[idx];
        const isSell = trade.type === 'sell';
        const shares = trade.shares || 0;
        const price = trade.price || 0;
        const fee = trade.fee || 0;

        // 计算交易额：买入/建仓为 数量*价格+手续费，卖出为 数量*价格-手续费
        const tradeAmount = isSell
          ? price * shares - fee
          : price * shares + fee;

        // 累加交易额：买入/建仓为正，卖出为负
        if (isSell) {
          res[i] -= tradeAmount;
        } else {
          res[i] += tradeAmount;
        }

        idx++;
      }

      // 更新交易索引
      tradeIndices[sym] = idx;
    }
  }

  return res;
}

export function computePositionTrend(input: PositionTrendInput): PositionTrendSeries {
  const { symbols, initialPositions, trades, valuationHistory, startDate, endDate } = input;
  const dates = buildDateArray(startDate, endDate);

  // prepare per-symbol share and price timelines
  const perSymbolShares: Record<string, number[]> = {};
  const perSymbolPrices: Record<string, (number | null)[]> = {};

  for (const sym of symbols) {
    const init = initialPositions && initialPositions[sym] ? initialPositions[sym] : 0;
    const tlist = trades && trades[sym] ? trades[sym] : [];
    const vlist = valuationHistory && valuationHistory[sym] ? valuationHistory[sym] : [];
    perSymbolShares[sym] = buildSharesTimeline(dates, init, tlist);
    perSymbolPrices[sym] = buildPriceTimeline(dates, vlist);
  }

  // 计算净投入时间线
  const netInvestmentTimeline = buildNetInvestmentTimeline(dates, trades);

  const series: PositionTrendSeries = dates.map((d, i) => {
    let total = 0;
    for (const sym of symbols) {
      const shares = perSymbolShares[sym][i] || 0;
      const price = perSymbolPrices[sym][i];
      if (shares && price !== null && price !== undefined) {
        total += shares * price;
      }
    }
    return { date: d, value: total, netInvestment: netInvestmentTimeline[i] };
  });

  return series;
}

// LTTB downsampling implementation
// Reference: simplify for readability and correctness for moderate N
export function downsampleLTTB(data: PositionTrendSeries, threshold: number): PositionTrendSeries {
  if (threshold >= data.length || threshold === 0) return data.slice();
  if (threshold === 1) return [data[0]];

  const sampled: PositionTrendSeries = [];
  const every = (data.length - 2) / (threshold - 2);

  let a = 0; // initially a is the first point in the triangle
  sampled.push(data[a]); // always include first

  for (let i = 0; i < threshold - 2; i++) {
    const avgRangeStart = Math.floor((i + 1) * every) + 1;
    const avgRangeEnd = Math.floor((i + 2) * every) + 1;
    const avgRangeEndClamped = Math.min(avgRangeEnd, data.length);

    let avgX = 0;
    let avgY = 0;
    let avgRangeLength = 0;
    for (let j = avgRangeStart; j < avgRangeEndClamped; j++) {
      avgX += j;
      avgY += data[j].value;
      avgRangeLength++;
    }
    avgX = avgRangeLength > 0 ? avgX / avgRangeLength : ((avgRangeStart + avgRangeEndClamped - 1) / 2);
    avgY = avgRangeLength > 0 ? avgY / avgRangeLength : data[Math.max(0, avgRangeStart - 1)].value;

    const rangeOffs = Math.floor(i * every) + 1;
    const rangeTo = Math.floor((i + 1) * every) + 1;

    // point a
    const pointAx = a;
    const pointAy = data[a].value;

    let maxArea = -1;
    let maxAreaIdx = -1;

    for (let j = rangeOffs; j < rangeTo + 1 && j < data.length - 1; j++) {
      const area = Math.abs((pointAx - avgX) * (data[j].value - pointAy) - (pointAx - j) * (avgY - pointAy)) * 0.5;
      if (area > maxArea) {
        maxArea = area;
        maxAreaIdx = j;
      }
    }

    if (maxAreaIdx === -1) maxAreaIdx = Math.min(Math.max(rangeOffs, 1), data.length - 2);
    sampled.push(data[maxAreaIdx]);
    a = maxAreaIdx;
  }

  sampled.push(data[data.length - 1]); // always include last
  return sampled;
}

