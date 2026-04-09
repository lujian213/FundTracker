import { HistoricalPoint } from '../types';

export type PriceSource = 'valuation' | 'confirmed' | 'history';

export interface ResolvePreferredPriceInput {
  targetDate: string;
  todayDate?: string;
  history?: HistoricalPoint[];
  currentPrice?: number | null;
  realtimeDate?: string | null;
  previousPrice?: number | null;
  netWorthDate?: string | null;
}

export interface ResolvedPrice {
  price: number;
  source: PriceSource;
  date: string;
}

function isIsoDate(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function toLocalDateKey(input: number | Date | string): string {
  // If input is an ISO date string (YYYY-MM-DD), treat as that local date
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) return input;

  // If input is a number, it's usually a timestamp from history (ms)
  // Normalize to the browser's local calendar date to comply with project requirements
  // that all time operations should use browser local time.
  if (typeof input === 'number') {
    const ts = input;
    if (!Number.isFinite(ts) || ts <= 0) return '';
    const date = new Date(ts);
    // Format as YYYY-MM-DD using the browser's local timezone
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // For Date objects or other strings, preserve previous local-time formatting (used for UI display)
  const d = input instanceof Date ? input : new Date(`${input} 00:00:00`);
  if (!Number.isFinite(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function pickLatest(candidates: ResolvedPrice[]): ResolvedPrice | null {
  if (candidates.length === 0) return null;
  const score = (source: PriceSource) => (source === 'valuation' ? 3 : source === 'confirmed' ? 2 : 1);
  const sorted = [...candidates].sort((a, b) => {
    if (a.date !== b.date) return a.date > b.date ? -1 : 1;
    return score(b.source) - score(a.source);
  });
  return sorted[0] || null;
}

export function resolvePreferredPrice(input: ResolvePreferredPriceInput): ResolvedPrice | null {
  const today = isIsoDate(input.todayDate) ? input.todayDate : toLocalDateKey(new Date());
  const targetDate = input.targetDate;

  // 数据已在 fetchFundHistory 中规范化并排序，直接使用
  const history = input.history || [];
  const historyByDate: Record<string, number> = {};
  for (const p of history) {
    const key = toLocalDateKey(p.date);
    if (!key || !(p.value > 0)) continue;
    historyByDate[key] = p.value;
  }

  const valuation = (input.currentPrice || 0) > 0
    ? { price: Number(input.currentPrice), date: isIsoDate(input.realtimeDate) ? (input.realtimeDate as string) : today }
    : null;
  const confirmed = (input.previousPrice || 0) > 0 && isIsoDate(input.netWorthDate)
    ? { price: Number(input.previousPrice), date: input.netWorthDate as string }
    : null;

  if (targetDate === today) {
    if (valuation && valuation.date === today) return { price: valuation.price, source: 'valuation', date: today };
    if (confirmed && confirmed.date === today) return { price: confirmed.price, source: 'confirmed', date: today };

    const fallback: ResolvedPrice[] = [];
    if (valuation) fallback.push({ price: valuation.price, source: 'valuation', date: valuation.date });
    if (confirmed) fallback.push({ price: confirmed.price, source: 'confirmed', date: confirmed.date });
    for (const [date, price] of Object.entries(historyByDate)) {
      fallback.push({ price, source: 'history', date });
    }
    return pickLatest(fallback);
  }

  // Historical date mode: keep history-based behavior first.
  if (historyByDate[targetDate] !== undefined) return { price: historyByDate[targetDate], source: 'history', date: targetDate };

  let prev: ResolvedPrice | null = null;
  for (const [date, price] of Object.entries(historyByDate)) {
    if (date <= targetDate) {
      if (!prev || date > prev.date) prev = { price, source: 'history', date };
    }
  }
  if (prev) return prev;

  let first: ResolvedPrice | null = null;
  for (const [date, price] of Object.entries(historyByDate)) {
    if (!first || date < first.date) first = { price, source: 'history', date };
  }
  if (first) return first;

  const fallback: ResolvedPrice[] = [];
  if (valuation) fallback.push({ price: valuation.price, source: 'valuation', date: valuation.date });
  if (confirmed) fallback.push({ price: confirmed.price, source: 'confirmed', date: confirmed.date });
  return pickLatest(fallback);
}
