export enum MarketType {
  FUND = 'Fund',
  INDEX = 'Index'
}

export interface Ticker {
  id: string;
  symbol: string;
  name: string;
  market: MarketType;
}

export interface ValuationData {
  symbol: string;
  name: string;
  currentPrice: number;      // 实时估值 (gsz)
  previousPrice: number;     // 昨日单位净值 (dwjz)
  changePercentage: number;  // 估值涨跌幅 (gszzl)
  lastUpdated: string;       // 完整更新时间 (gztime) -> "2024-05-22 15:00"
  realtimeDate: string;      // 提取出的实时日期 -> "2024-05-22"
  netWorthDate: string;      // 最后确认净值的日期 (jzrq) -> "2024-05-21"
  valuationDate: string;     // 兼容性字段
  sourceUrl: string;
}

export interface MarketIndex {
  name: string;
  symbol: string;
  current: number;
  change: number;
  changePercent: number;
  lastUpdated: string;
}

export interface HistoricalPoint {
  date: number; // 时间戳
  value: number; // 净值
  equityReturn: number; // 当日涨跌
}

export interface FundHistory {
  netWorthTrend: HistoricalPoint[];
  accumulatedTrend: any[];
}

// New: types for overall profit aggregation
export interface OverallProfitPoint {
  date: string; // YYYY-MM-DD
  cumulativeProfit: number; // sum of per-fund cumulative profits on this date
  dailyProfit: number; // daily change of cumulativeProfit
}

export interface OverallFundRow {
  symbol: string;
  name?: string;
  startDate: string | null;
  profitFrom: number; // cumulative at start
  profitTo: number; // cumulative at end
  profitDiff: number; // profitTo - profitFrom
  // added: configured initial position and flag whether startDate came from storage
  initialPosition?: number;
  hasStoredStartDate?: boolean;
}

export interface OverallProfitSummary {
  timeline: OverallProfitPoint[];
  perFund: OverallFundRow[];
  // per-fund time series used to build table and for efficient filtering without recomputation
  perFundTimelines?: Record<string, { date: string; cumulativeProfit: number }[]>;
  totalDiff: number;
}
