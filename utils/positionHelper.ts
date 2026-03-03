import { Ticker, ValuationData } from '../types';
import { getTradesForSymbol } from '../hooks/useTrades';

export interface PositionEntry {
  symbol: string;
  name: string;
  currentShares: number;
  marketValue: number;
  ratio: number; // 0-1, fraction of total market value
  color: string;
}

// 32-color palette using the golden angle (≈137.5°) for hue steps.
// Adjacent colors differ by ~137° in hue, maximising perceptual distance.
// Two lightness levels (48% / 62%) alternate to add a second dimension of contrast.
export const POSITION_COLORS: string[] = [
  'hsl(0,72%,48%)',
  'hsl(138,65%,62%)',
  'hsl(275,68%,48%)',
  'hsl(53,70%,62%)',
  'hsl(191,68%,48%)',
  'hsl(329,65%,62%)',
  'hsl(106,68%,48%)',
  'hsl(244,65%,62%)',
  'hsl(22,72%,48%)',
  'hsl(160,65%,62%)',
  'hsl(297,68%,48%)',
  'hsl(75,70%,62%)',
  'hsl(213,68%,48%)',
  'hsl(351,65%,62%)',
  'hsl(128,68%,48%)',
  'hsl(266,65%,62%)',
  'hsl(44,72%,48%)',
  'hsl(182,65%,62%)',
  'hsl(319,68%,48%)',
  'hsl(97,70%,62%)',
  'hsl(235,68%,48%)',
  'hsl(13,65%,62%)',
  'hsl(150,68%,48%)',
  'hsl(288,65%,62%)',
  'hsl(66,72%,48%)',
  'hsl(204,65%,62%)',
  'hsl(341,68%,48%)',
  'hsl(119,70%,62%)',
  'hsl(257,68%,48%)',
  'hsl(35,65%,62%)',
  'hsl(172,68%,48%)',
  'hsl(310,65%,62%)',
];

export interface ComputePositionsResult {
  entries: PositionEntry[];
  totalMarketValue: number;
}

/**
 * Compute positions for all configured funds.
 * Only funds with fullCapacity > 0 and currentShares > 0 are included.
 * Market value = currentShares × currentPrice (fallback: previousPrice).
 * Results are sorted by market value descending.
 */
export function computePositions(
  portfolio: Ticker[],
  marketData: Record<string, ValuationData>
): ComputePositionsResult {
  const raw: Omit<PositionEntry, 'ratio' | 'color'>[] = [];

  for (const ticker of portfolio) {
    const sym = ticker.symbol;

    // Read position config from localStorage
    let fullCapacity = 0;
    let initialPosition = 0;
    try {
      const cfgRaw = localStorage.getItem(`fund_position_${sym}`);
      if (cfgRaw) {
        const cfg = JSON.parse(cfgRaw);
        fullCapacity = Number(cfg.fullCapacity) || 0;
        initialPosition = Number(cfg.initialPosition) || 0;
      }
    } catch (e) {
      // ignore
    }

    // Only process funds that have been configured (fullCapacity > 0)
    if (fullCapacity <= 0) continue;

    // Compute current shares from trades
    const trades = getTradesForSymbol(sym) || [];
    let buyShares = 0;
    let sellShares = 0;
    for (const t of trades) {
      if (t.type === 'buy') buyShares += t.shares;
      else sellShares += t.shares;
    }
    const currentShares = initialPosition + buyShares - sellShares;
    if (currentShares <= 0) continue;

    // Price: prefer currentPrice (realtime valuation), fallback to previousPrice (last confirmed NAV)
    const vd = marketData[sym];
    const price = vd
      ? (vd.currentPrice > 0 ? vd.currentPrice : vd.previousPrice)
      : 0;

    if (price <= 0) continue;

    const marketValue = currentShares * price;
    const name = ticker.name || (vd?.name ?? sym);

    raw.push({ symbol: sym, name, currentShares, marketValue });
  }

  // Sort by market value descending
  raw.sort((a, b) => b.marketValue - a.marketValue);

  const totalMarketValue = raw.reduce((s, e) => s + e.marketValue, 0);

  const entries: PositionEntry[] = raw.map((e, i) => ({
    ...e,
    ratio: totalMarketValue > 0 ? e.marketValue / totalMarketValue : 0,
    color: POSITION_COLORS[i % POSITION_COLORS.length],
  }));

  return { entries, totalMarketValue };
}


