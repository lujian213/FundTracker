import { TradeRecord } from '../hooks/useTrades';
import { HistoricalPoint } from '../types';
import { toLocalDateKey } from './priceResolver';

export interface AggregatedMarker {
  x: number;
  y: number;
  date: number; // timestamp (ms) for the chart point
  type: 'buy' | 'sell' | 'position_start' | string;
  shares: number;
  amount: number;
}

// localDateKey helper: convert timestamp to YYYY-MM-DD using consistent timezone logic
// Uses same timezone handling as toLocalDateKey (browser local time for numbers) for consistency
export const localDateKey = (ts: number) => {
  return toLocalDateKey(ts);
};

/**
 * Aggregate trades by calendar date and map to chart points.
 * trades: array of TradeRecord (date in YYYY-MM-DD or timestamp number)
 * chartData: array of HistoricalPoint used by chart (with date timestamps) - the full dataset
 * points: computed svg points array with { x,y,data } - the display subset that corresponds to a slice of chartData
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
    // find chart index in the full chartData
    const chartDataIdx = chartData.findIndex(p => localDateKey(p.date) === dateKey);
    const dateTs = chartDataIdx >= 0 ? chartData[chartDataIdx].date : new Date(dateKey).getTime();
    // Determine x, y coordinates for the marker
    let x: number | undefined;
    let y: number | undefined;
    let finalDate = dateTs;

    if (chartDataIdx >= 0) {
      // Find the corresponding index in the points array
      // The points array corresponds to a subset of chartData (e.g., the last N points)
      // We need to find which index in the points array corresponds to chartData[chartDataIdx]

      // Look for the matching data point in the points array by comparing the date
      const pointIdx = points.findIndex(p => localDateKey(p.data.date) === dateKey);

      if (pointIdx >= 0 && points[pointIdx]) {
        x = points[pointIdx].x;
        y = points[pointIdx].y;
        finalDate = chartData[chartDataIdx].date;
      } else {
        // If we couldn't find a direct match by date in points array,
        // try to find the nearest match by date value
        let closestPointIdx = -1;
        let minDateDiff = Infinity;

        points.forEach((p, i) => {
          const diff = Math.abs(p.data.date - dateTs);
          if (diff < minDateDiff) {
            minDateDiff = diff;
            closestPointIdx = i;
          }
        });

        if (closestPointIdx >= 0 && points[closestPointIdx]) {
          x = points[closestPointIdx].x;
          y = points[closestPointIdx].y;
          finalDate = points[closestPointIdx].data.date;
        }
      }
    } else if (!Number.isNaN(dateTs)) {
      // If no exact chart point match in chartData, find the nearest chart point date to position the marker
      let nearestIdx = -1;
      let minDiff = Infinity;
      chartData.forEach((p, i) => {
        const diff = Math.abs(p.date - dateTs);
        if (diff < minDiff) {
          minDiff = diff;
          nearestIdx = i;
        }
      });
      if (nearestIdx >= 0) {
        // Find corresponding point in the points array
        const pointIdx = points.findIndex(p => p.data.date === chartData[nearestIdx].date);
        if (pointIdx >= 0 && points[pointIdx]) {
          x = points[pointIdx].x;
          y = points[pointIdx].y;
          finalDate = chartData[nearestIdx].date;
        }
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

/**
 * Generate a position start marker for the chart if the fund has a configured start date
 * that falls within the chart data range.
 * @param symbol - The fund symbol
 * @param chartData - Array of HistoricalPoint used by chart (with date timestamps) - the full dataset
 * @param points - Computed svg points array with { x,y,data } - the display subset that corresponds to a slice of chartData
 * @returns An array containing at most one position start marker
 */
export function generatePositionStartMarker(symbol: string, chartData: HistoricalPoint[], points: { x: number; y: number; data: HistoricalPoint }[]): AggregatedMarker[] {
  // Read position config from localStorage
  let initialPosition = 0;
  let startDate: string | null = null;

  try {
    const cfgRaw = localStorage.getItem(`fund_position_${symbol}`);
    if (cfgRaw) {
      const cfg = JSON.parse(cfgRaw);
      initialPosition = Number(cfg.initialPosition) || 0;
      startDate = typeof cfg.startDate === 'string' ? cfg.startDate : null;
    }
  } catch (e) {
    // ignore parsing errors
    return [];
  }

  // If no start date is configured or initial position is invalid, return empty array
  if (!startDate || initialPosition <= 0) {
    return [];
  }

  // Convert start date to timestamp
  const startDateTimestamp = new Date(startDate).getTime();
  if (isNaN(startDateTimestamp)) {
    return [];
  }

  // Find chart index for the start date in the full chartData
  const chartDataIdx = chartData.findIndex(p => localDateKey(p.date) === startDate);
  if (chartDataIdx < 0) {
    // If the start date doesn't exactly match a chart data point, find the nearest one
    let nearestIdx = -1;
    let minDiff = Infinity;
    chartData.forEach((p, i) => {
      const diff = Math.abs(p.date - startDateTimestamp);
      if (diff < minDiff) {
        minDiff = diff;
        nearestIdx = i;
      }
    });

    if (nearestIdx >= 0) {
      // Find corresponding point in the points array
      const pointIdx = points.findIndex(p => p.data.date === chartData[nearestIdx].date);
      if (pointIdx >= 0 && points[pointIdx]) {
        const x = points[pointIdx].x;
        const y = points[pointIdx].y;
        const finalDate = points[pointIdx].data.date;

        // Create the position start marker
        const marker: AggregatedMarker = {
          x,
          y,
          date: finalDate,
          type: 'position_start',
          shares: initialPosition,
          amount: 0, // Amount is not meaningful for position start
        };

        return [marker];
      }
    }
    return [];
  }

  // Determine x, y coordinates for the marker
  let x: number | undefined;
  let y: number | undefined;
  let finalDate = chartData[chartDataIdx].date;

  // Look for the matching data point in the points array by comparing the date
  const pointIdx = points.findIndex(p => localDateKey(p.data.date) === startDate);

  if (pointIdx >= 0 && points[pointIdx]) {
    x = points[pointIdx].x;
    y = points[pointIdx].y;
    finalDate = chartData[chartDataIdx].date;
  } else {
    // If we couldn't find a direct match by date in points array,
    // try to find the nearest match by date value
    let closestPointIdx = -1;
    let minDateDiff = Infinity;

    points.forEach((p, i) => {
      const diff = Math.abs(p.data.date - startDateTimestamp);
      if (diff < minDateDiff) {
        minDateDiff = diff;
        closestPointIdx = i;
      }
    });

    if (closestPointIdx >= 0 && points[closestPointIdx]) {
      x = points[closestPointIdx].x;
      y = points[closestPointIdx].y;
      finalDate = points[closestPointIdx].data.date;
    }
  }

  // Only create marker if we have valid coordinates
  if (x !== undefined && y !== undefined) {
    const marker: AggregatedMarker = {
      x,
      y,
      date: finalDate,
      type: 'position_start',
      shares: initialPosition,
      amount: 0, // Amount is not meaningful for position start
    };

    return [marker];
  }

  return [];
}
