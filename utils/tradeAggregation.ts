import { TradeRecord } from '../hooks/useTrades';
import { HistoricalPoint } from '../types';

export interface AggregatedMarker {
  x?: number;
  y?: number;
  date: number; // timestamp (ms) for the chart point
  type: 'buy' | 'sell' | string;
  shares: number;
  amount: number;
}

// localDateKey helper: convert timestamp to YYYY-MM-DD local
export const localDateKey = (ts: number) => {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Aggregate trades by calendar date and map to chart points.
 * trades: array of TradeRecord (date in YYYY-MM-DD or timestamp number)
 * chartData: array of HistoricalPoint used by chart (with date timestamps)
 * points: computed svg points array with { x,y,data }
 */
export function aggregateTradesByDate(trades: TradeRecord[] | undefined, chartData: HistoricalPoint[], points: { x: number; y: number; data: HistoricalPoint }[]): AggregatedMarker[] {
  const map: Record<string, { sellShares: number; buyShares: number; sellAmt: number; buyAmt: number; } > = {};
  for (const t of trades || []) {
    let td: string | null = null;
    if (typeof t.date === 'string') td = t.date;
    else if (typeof t.date === 'number') td = localDateKey(t.date);
    if (!td) continue;
    if (!map[td]) map[td] = { sellShares: 0, buyShares: 0, sellAmt: 0, buyAmt: 0 };
    const rec = map[td];
    if (t.type === 'sell') {
      rec.sellShares += t.shares;
      rec.sellAmt += (t.price * t.shares - (t.fee || 0));
    } else {
      rec.buyShares += t.shares;
      rec.buyAmt += (t.price * t.shares + (t.fee || 0));
    }
  }

  const mts: AggregatedMarker[] = [];
  for (const dateKey of Object.keys(map)) {
    const rec = map[dateKey];
    const shares = rec.sellShares - rec.buyShares;
    const amount = rec.sellAmt - rec.buyAmt;
    const type = shares > 0 ? 'sell' : (shares < 0 ? 'buy' : (amount >= 0 ? 'sell' : 'buy'));
    // find chart index
    const idx = chartData.findIndex(p => localDateKey(p.date) === dateKey);
    const dateTs = idx >= 0 ? chartData[idx].date : NaN;
    const marker: AggregatedMarker = {
      date: dateTs,
      type,
      shares: Math.abs(shares),
      amount: Math.abs(amount),
    };
    if (idx >= 0 && points && points[idx]) {
      marker.x = points[idx].x;
      marker.y = points[idx].y;
      marker.date = chartData[idx].date;
    }
    mts.push(marker);
  }
  return mts;
}

