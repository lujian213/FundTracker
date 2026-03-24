export enum MarketType {
  FUND = 'Fund',
  INDEX = 'Index'
}

// Card data-fetch status: 'ok' = success, 'error' = failure, 'unknown' = not yet fetched / in-progress
export type CardStatus = 'ok' | 'error' | 'unknown';

export type ManageItemType = 'fund' | 'index' | 'global_index';
export type ManageSelectionKey = `${ManageItemType}:${string}`;

// TickerAlert - 基金提示信息
export interface TickerAlert {
  type: 'holiday' | 'delivery';  // 信息类型
  date: string;                   // 生效日期 (yyyy/MM/dd)
  content: string;                // 信息内容
}

// RecommendedStrategy - 推荐交易策略
export interface RecommendedStrategy {
  strategy_id: string;    // 推荐策略的 key（如 'trendFollowing', 'meanReversion'）
  reason: string;         // 推荐理由
}

export interface Ticker {
  id: string;
  symbol: string;
  name: string;
  market: MarketType;
  alert_list?: TickerAlert[];     // 提示信息列表
  recommended_strategy?: RecommendedStrategy;  // 推荐交易策略
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
  // optional: some callers may include an explicit equityReturn field (percent)
  equityReturn?: number;
}

export interface MarketIndex {
  name: string;
  symbol: string;
  current: number;
  change: number;
  changePercent: number;
  lastUpdated: string;
  tradeDate?: string; // 交易日期 YYYY-MM-DD
  previousClose?: number; // 前收盘价
}

export interface HistoricalPoint {
  date: number; // 时间戳
  value: number; // 净值
  equityReturn: number; // 当日涨跌
}

// Profit calculator result type
export interface ProfitPoint {
  date: string; // YYYY-MM-DD
  netValue: number; // 当日净值（每份）
  shares: number; // 当日持仓份额
  cumulativeProfit: number; // 累计盈利（金额）
  dailyProfit: number; // 当日盈利（金额） = cumulative - 前一日累计
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

// ─── Backup / Export-Import types ────────────────────────────────────────────

export interface BackupFund {
  symbol: string;
  name?: string;
  previousPrice?: number;    // 最近确认净值 (dwjz)
  netWorthDate?: string;     // 最近确认净值时间 (jzrq) -> "YYYY-MM-DD"
  currentPrice?: number;     // 最新估值 (gsz)
  realtimeDate?: string;     // 最新估值时间 -> "YYYY-MM-DD"
}

export interface BackupIndex {
  symbol: string;
  name?: string;
  current?: number;
  change?: number;
  changePercent?: number;
  lastUpdated?: string;
}

export interface BackupPosition {
  fullCapacity: number;
  initialPosition: number;
  startDate: string | null;
  initialPrice: number | null;
}

export interface BackupTrade {
  id: string;
  date: string;              // YYYY-MM-DD
  type: 'buy' | 'sell';
  shares: number;
  price?: number;            // optional fallback; prefer historical NAV from cache
  fee: number;
}

// 同步配置
export interface SyncConfig {
  eggfundUsername?: string;
  eggfundPassword?: string;
}

export interface SyncFilterConfig {
  selectedFunds: string[];
  filterDate: string;
  selectedTypes: string[];
}

export interface BackupConfig {
  autoExportTime: string;    // "HH:mm" local time, default "16:00"
  autoBackupEnabled?: boolean; // Whether auto backup is enabled, default false
  syncConfig?: SyncConfig;   // Synchronization configuration
  syncFilterConfig?: SyncFilterConfig; // Sync confirmation modal filter settings
}

export interface BackupData {
  portfolio: BackupFund[];
  indices: BackupIndex[];
  globalIndices: BackupIndex[];
  positions: Record<string, BackupPosition>;
  trades: Record<string, BackupTrade[]>;
  config: BackupConfig;
}

// ─── Intraday point type (for per-minute day-limited caching used by intraday chart)
export interface IntradayPoint {
  timestamp: number; // floored to minute (ms)
  value: number;
  equityReturn: number; // percent
}

// --- Virtual trade types ---
export type VirtualTradeAction = 'buy' | 'sell' | 'hold';

// --- Trade types (moved from useTrades.ts to make them globally available) ---
export type TradeType = 'buy' | 'sell';
export interface TradeRecord {
  id: string;
  date: string; // YYYY-MM-DD
  type: TradeType;
  shares: number;
  price: number;
  fee: number;
  // total is not persisted anymore; kept optional for backward compatibility
  total?: number;
}

// structured reason for strategy decisions (for hovertip)
export type StrategyReasonType = 'golden' | 'death' | 'insufficient' | 'info' | 'other';

export interface StrategyReason {
  type: StrategyReasonType;
  date?: string; // YYYY-MM-DD when the signal occurred
  text: string; // human readable explanation
  // optional numeric MA info to help validation/UI formatting
  ma?: {
    shortYesterday?: number;
    shortPrev?: number;
    longYesterday?: number;
    longPrev?: number;
  };
}

export interface VirtualTradeRow {
  date: string; // YYYY-MM-DD (trade date)
  action: VirtualTradeAction;
  nav: number; // 当日基金净值（4dp）
  shares: number; // 交易数量（2dp）
  amount: number; // 交易金额（2dp）
  cashAfter: number; // 交易后现金（2dp）
  sharesAfter: number; // 交易后份额（2dp）
  totalAfter: number; // 交易后总资产（2dp）
  profitSincePrev: number; // 与前一日总资产差（2dp）
  profitSinceStart: number; // 与初始总资产差（2dp）
  reason?: StrategyReason; // optional structured explanation for this day's action/hold
}

export interface VirtualTradeSummary {
  initialTotal: number;
  finalTotal: number;
  totalProfit: number; // finalTotal - initialTotal
}

export interface VirtualTradeResult {
  timeline: VirtualTradeRow[];
  summary: VirtualTradeSummary;
  todayTip: { action: VirtualTradeAction; shares: number; reason?: StrategyReason } | null;
}

export interface VirtualStrategyContext {
  // history up to previous day (ascending by date)
  history: HistoricalPoint[];
  cash: number;
  shares: number;
  // numeric base unit recommended by PRD
  baseUnit: number;
  // startNav (net value on start date)
  startNav: number;
  // optional: transaction history from previous decisions by this strategy
  transactionHistory?: Array<{
    date: string; // YYYY-MM-DD
    action: 'buy' | 'sell' | 'hold';
    nav: number;  // NAV at the time of decision
    shares: number; // number of shares traded (positive for buy, negative for sell)
    amount: number; // monetary amount involved
  }>;
  // optional: fund-specific configuration based on existing backup config
  fundConfig?: {
    maxPosition?: number;           // 最大仓位限制 (可从 fullCapacity 推导)
    startDate?: string | null;     // 开始日期 (对应 BackupPosition.startDate)
    initialPosition?: number;      // 初始仓位 (对应 BackupPosition.initialPosition)
    initialPrice?: number | null;  // 初始价格 (对应 BackupPosition.initialPrice)
    [key: string]: any;            // 支持扩展属性
  };
  // optional: user-specific configuration
  userConfig?: {
    globalMaxPosition?: number;    // 全局最大仓位
    riskPreference?: 'conservative' | 'balanced' | 'aggressive';
    minCashReserve?: number;       // 最小现金储备
    [key: string]: any;            // 支持扩展属性
  };
}

export interface VirtualStrategy {
  name: string;
  description: string;
  // decide action for next trade day based on history-up-to-prev-day and current state
  // return object may include optional `reason` explaining the decision (used for hover tooltips)
  decide: (ctx: VirtualStrategyContext) => { action: VirtualTradeAction; shares: number; reason?: StrategyReason };
}

// Timer Job Scheduler types
export interface TimerJobConfig {
  id: string;
  name: string;
  cron: string;
  enabled: boolean;
}

export interface TimerJobError {
  id: string;
  jobName: string;
  message: string;
  time: Date;
}
