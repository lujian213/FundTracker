import { ValuationData } from '../types';

// Simple mock implementation for fetchFundData to satisfy the app and TypeScript.
// This avoids network calls during build and provides realistic-shaped data.
export async function fetchFundData(symbol: string): Promise<ValuationData | null> {
  // Validate symbol format (5-6 digits)
  if (!/^\d{5,6}$/.test(symbol)) return null;

  // Create deterministic pseudo-random data based on symbol for stable results
  const seed = parseInt(symbol.slice(-3), 10) || 0;
  const base = 1 + (seed % 100) / 1000; // e.g. 1.000..1.099
  const previousPrice = +(base.toFixed(4));
  const changePercentage = +(((seed % 7) - 3) * 0.25).toFixed(2); // small change
  const currentPrice = +((previousPrice * (1 + changePercentage / 100)).toFixed(4));

  const now = new Date();
  const lastUpdated = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  const valuationDate = now.toISOString().split('T')[0];

  const data: ValuationData = {
    symbol,
    name: `基金 ${symbol}`,
    currentPrice,
    previousPrice,
    changePercentage,
    lastUpdated,
    valuationDate,
    sourceUrl: ''
  };

  // Simulate async fetch latency
  await new Promise((r) => setTimeout(r, 20));
  return data;
}
