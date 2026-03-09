import { TradeRecord } from '../hooks/useTrades';
import { HistoricalPoint } from '../types';

export interface AggregatedMarker {
  x: number;
  y: number;
  date: number; // timestamp (ms) for the chart point
  type: 'buy' | 'sell' | string;
  shares: number;
  amount: number;
}

// localDateKey helper: convert timestamp to YYYY-MM-DD using local date components
// Uses local date to match how YYYY-MM-DD strings are interpreted as local midnight
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
    if (typeof t.date === 'string') {
      td = t.date;
    } else if (typeof t.date === 'number') {
      td = localDateKey(t.date);
    }
    if (!td) {
      continue;
    }
    if (!map[td]) {
      map[td] = { sellShares: 0, buyShares: 0, sellAmt: 0, buyAmt: 0 };
    }
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
    const dateTs = idx >= 0 ? chartData[idx].date : new Date(dateKey).getTime();
    // Determine x, y coordinates for the marker
    let x: number | undefined;
    let y: number | undefined;
    let finalDate = dateTs;

    if (idx >= 0 && points && points[idx]) {
      x = points[idx].x;
      y = points[idx].y;
      finalDate = chartData[idx].date;
    } else if (!Number.isNaN(dateTs)) {
      // If no exact chart point match, find the nearest chart point date to position the marker
      let nearestIdx = -1;
      let minDiff = Infinity;
      chartData.forEach((p, i) => {
        const diff = Math.abs(p.date - dateTs);
        if (diff < minDiff) {
          minDiff = diff;
          nearestIdx = i;
        }
      });
      if (nearestIdx >= 0 && points && points[nearestIdx]) {
        x = points[nearestIdx].x;
        y = points[nearestIdx].y;
        finalDate = chartData[nearestIdx].date;
      }
    }

    // Only create marker if we have valid coordinates
    if (x !== undefined && y !== undefined) {
      const marker: AggregatedMarker = {
        x,
        y,
        date: finalDate,
        type,
        shares: Math.abs(shares),
        amount: Math.abs(amount),
      };
      mts.push(marker);
    }
  }

  return mts;
}
