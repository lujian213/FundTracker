import { Ticker, ValuationData, HistoricalPoint, TradeRecord } from '../types';
import { getTradesForSymbol } from '../hooks/useTrades';
import { fetchFundHistory } from '../services/fundService';
import * as marketFundService from '../services/marketFundService';

export interface PositionEntry {
  symbol: string;
  name: string;
  currentShares: number;
  marketValue: number;
  ratio: number; // 0-1, fraction of total market value
  color: string;
}

/**
 * 计算单个基金的平均成本价
 * 公式：持仓成本价 = (初始份额×初始价格 + Σ买入金额 - Σ卖出金额) ÷ 当前持仓份额
 * 其中：买入金额 = 价格 × 份额 + 手续费，卖出金额 = 价格 × 份额 - 手续费
 */
export function computeAvgCostPrice(
  symbol: string,
  trades: TradeRecord[]
): number | null {
  // 从 marketFundService 读取持仓配置
  const position = marketFundService.getPosition(symbol);
  let initialPosition = 0;
  let initialPrice = 0;

  if (position) {
    initialPosition = position.initialPosition || 0;
    initialPrice = position.initialPrice || 0;
  }

  // 计算买入和卖出金额
  let buyAmount = 0;
  let sellAmount = 0;
  let buyShares = 0;
  let sellShares = 0;

  for (const t of trades || []) {
    if (t.type === 'buy') {
      buyShares += t.shares;
      buyAmount += t.price * t.shares + (t.fee || 0);
    } else {
      sellShares += t.shares;
      sellAmount += t.price * t.shares - (t.fee || 0);
    }
  }

  const totalShares = initialPosition + buyShares - sellShares;
  if (totalShares <= 0) return null;

  const totalCost = initialPosition * initialPrice + buyAmount - sellAmount;
  return totalCost / totalShares;
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

    // Read position config from marketFundService
    const position = marketFundService.getPosition(sym);
    const fullCapacity = position?.fullCapacity || 0;
    const initialPosition = position?.initialPosition || 0;

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

/**
 * Get default units (shares) for a given symbol on a local ISO date (YYYY-MM-DD).
 * Rules:
 *  - If there is an explicitly configured initialPosition for the fund (localStorage 'fund_position_{sym}') and
 *    it is associated with a startDate that equals isoDate, return that initialPosition.
 *  - Otherwise, try to compute the latest known shares up to that date by aggregating trades whose date <= target date
 *    combined with stored initialPosition (if any).
 *  - If date is earlier than storedStartDate, return 0 (user didn't hold the fund yet).
 *  - If no shares found or shares === 0 and no position config exists, fallback to using fallbackCash / navOnDate.
 * Returns null if unable to compute (e.g., no nav and no config/trades).
 */
export async function getUnitsForDate(symbol: string, isoDate: string, fallbackCash?: number): Promise<number | null> {
  try {
    // 从 marketFundService 读取持仓配置
    const position = marketFundService.getPosition(symbol);
    let storedInitialPosition = position?.initialPosition || 0;
    let storedStartDate: string | null = position?.startDate || null;

    // if stored startDate matches isoDate and an initialPosition exists, prefer it
    if (storedStartDate === isoDate && storedInitialPosition > 0) {
      return Math.round(storedInitialPosition * 100) / 100;
    }

    // ⚠️ 关键修复：如果日期早于建仓日期，直接返回 0，不使用 fallback
    // 这表示用户在那个时候还没有持有该基金
    if (storedStartDate && isoDate < storedStartDate) {
      return 0;
    }

    // otherwise aggregate trades up to the end of isoDate
    const trades = getTradesForSymbol(symbol) || [];
    // trades in this project keep date as a number (timestamp) or a local date string in some places; normalize
    const targetEnd = new Date(`${isoDate} 23:59:59.999`).getTime();
    let buyShares = 0;
    let sellShares = 0;
    for (const t of trades) {
      // trade.date may be timestamp or YYYY-MM-DD string
      let tTs: number | null = null;
      if (typeof (t as any).date === 'number') tTs = (t as any).date as number;
      else if (typeof (t as any).date === 'string') {
        const dt = new Date((t as any).date);
        if (!isNaN(dt.getTime())) tTs = dt.getTime();
      }
      if (tTs === null) continue;
      if (tTs <= targetEnd) {
        if ((t as any).type === 'buy') buyShares += (t as any).shares || 0;
        else sellShares += (t as any).shares || 0;
      }
    }

    // Only include storedInitialPosition if it applies on or before isoDate.
    // If storedStartDate exists and is after isoDate, then the initialPosition shouldn't apply yet.
    let baseInitial = 0;
    if (storedInitialPosition > 0) {
      if (!storedStartDate) baseInitial = storedInitialPosition;
      else {
        // compare storedStartDate (YYYY-MM-DD) to isoDate
        try {
          if (storedStartDate <= isoDate) baseInitial = storedInitialPosition;
        } catch (e) {
          // fallback: do not include
          baseInitial = 0;
        }
      }
    }

    const shares = baseInitial + buyShares - sellShares;

    // 如果有持仓配置（storedStartDate 存在且日期晚于建仓日期）
    // 且份额计算结果 <= 0，返回 0（表示已清仓）
    if (storedStartDate && isoDate >= storedStartDate) {
      return shares > 0 ? Math.round(shares * 100) / 100 : 0;
    }

    // 如果有初始份额但没有 startDate（旧数据），shares > 0 时返回
    if (storedInitialPosition > 0 && !storedStartDate && shares > 0) {
      return Math.round(shares * 100) / 100;
    }

    // 无持仓配置时，使用 fallback 逻辑
    if (!fallbackCash || fallbackCash <= 0) return null;

    // fetch history and find nav on isoDate (prefer exact local date match, otherwise latest <= end of date)
    const history = await fetchFundHistory(symbol);
    if (!history || history.length === 0) return null;
    // history items have numeric timestamp 'date' and 'value'
    const sorted = [...history].sort((a, b) => (a.date as number) - (b.date as number));
    const targetEndTs = targetEnd;

    // exact date match helper
    const matchExact = (h: HistoricalPoint) => {
      const d = new Date(h.date as number);
      const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      return iso === isoDate;
    };

    for (const h of sorted) {
      if (matchExact(h)) {
        const nav = Number(h.value || 0);
        if (nav > 0) return Math.round((fallbackCash / nav) * 100) / 100;
      }
    }

    // fallback to latest point <= end of date
    let latest: HistoricalPoint | null = null;
    for (const h of sorted) {
      if ((h.date as number) <= targetEndTs) latest = h;
      else break;
    }
    if (latest && Number(latest.value) > 0) {
      return Math.round((fallbackCash / Number(latest.value)) * 100) / 100;
    }

    // otherwise fallback to earliest available
    if (sorted.length > 0 && Number(sorted[0].value) > 0) {
      return Math.round((fallbackCash / Number(sorted[0].value)) * 100) / 100;
    }

    return null;
  } catch (e) {
    return null;
  }
}
