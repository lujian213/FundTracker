export enum MarketType {
  FUND = 'Fund',
  INDEX = 'Index'
}

// Card data-fetch status: 'ok' = success, 'error' = failure, 'unknown' = not yet fetched / in-progress
export type CardStatus = 'ok' | 'error' | 'unknown';

export type ManageItemType = 'fund' | 'index' | 'global_index';
export type ManageSelectionKey = `${ManageItemType}:${string}`;

// CalendarEvent - 日历事件（节假日/交割日）
export interface CalendarEvent {
  type: 'holiday_china' | 'holiday_hk' | 'holiday_us' | 'holiday_sg' | 'delivery_china' | 'delivery_hk' | 'delivery_us' | 'nonfarm_payrolls_release';  // 事件类型
  content: string;                // 简要内容
  description?: string;           // 详细描述
  market?: string;                // 市场名称（如"A股"、"港股"、"美股"）
}

// CalendarData - 日历数据（日期到事件列表的映射）
export interface CalendarData {
  [date: string]: CalendarEvent[];
}

// RecommendedStrategy - 推荐交易策略
export interface RecommendedStrategy {
  strategy_id: string;    // 推荐策略的 key（如 'trendFollowing', 'meanReversion'）
  reason: string;         // 推荐理由
}

// StockPosition - 股票持仓
export interface StockPosition {
  stock_name: string;      // 股票名称
  percentage: number;      // 持仓占比 (如 9.45 表示 9.45%)
}

// StageIncrease - 阶段盈亏
export interface StageIncrease {
  stage: '近1周' | '近1月' | '近3月' | '近6月';
  increase_percentage: number;  // 盈亏百分比
}

// FundProfile - 基金基本信息
export interface FundProfile {
  stock_positions: StockPosition[];    // 股票持仓列表
  stage_increase: StageIncrease[];     // 阶段盈亏列表
  fetched_at: string;                  // 系统抓取时间 (ISO 格式)
}

export interface Ticker {
  id: string;
  symbol: string;
  name: string;
  market: MarketType;
  recommended_strategy?: RecommendedStrategy;  // 推荐交易策略
  profile?: FundProfile;  // 基金基本信息
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

// 指数基本信息 + 实时数据（持久化到 localStorage）
export interface IndexInfo {
  symbol: string;
  name: string;
  current: number;
  change: number;
  changePercent: number;
  lastUpdated: string;
  tradeDate?: string; // 交易日期 YYYY-MM-DD
  previousClose?: number; // 前收盘价
  volume?: number; // 成交量（手）
  amount?: number; // 成交额（元）
  tradingPeriodBegin?: number; // 当前交易时段开始时间戳（毫秒），用于过滤上一个时段的旧数据
}

// 指数完整数据（运行时，包含日内和历史）
export interface MarketIndex {
  info: IndexInfo;              // 基本信息 + 实时数据
  intraday: IntradayPoint[];    // 日内数据点数组
  history: HistoricalPoint[];   // 历史数据点数组
}

// ═══════════════════════════════════════════════════════════════════════════════
// 基金相关类型
// ═══════════════════════════════════════════════════════════════════════════════

// 基金持仓配置
export interface FundPosition {
  fullCapacity: number;       // 满仓金额
  initialPosition: number;    // 初始仓位
  startDate: string | null;   // 开始日期 YYYY-MM-DD
  initialPrice: number | null; // 初始价格
  aliasName?: string;         // 别名（用于OCR匹配，可选）
}

// 基金信息（统一存储）：包含 Ticker、持仓、估值
export interface FundInfo {
  ticker: Ticker;              // Ticker 信息（嵌套）
  position?: FundPosition;     // 持仓配置（可选）
  valuation?: ValuationData;   // 估值数据（可选）
}

// 基金完整数据（运行时，包含交易、日内和历史）
export interface MarketFund {
  info: FundInfo;                 // 基金信息（Ticker + 持仓 + 估值）
  trades: TradeRecord[];          // 交易记录
  intraday: IntradayPoint[];      // 日内数据点数组
  history: HistoricalPoint[];     // 历史数据点数组
}

export interface HistoricalPoint {
  date: number; // 时间戳
  value: number; // 净值
  equityReturn: number; // 当日涨跌
  volume?: number; // 成交量（手），仅指数有效
  amount?: number; // 成交额（元），仅指数有效
}

// 成交量数据点（用于图表渲染）
export interface VolumeData {
  x: number;           // SVG x 坐标
  volume: number;      // 成交量（手）- 主字段，两个数据源都有
  amount?: number;     // 成交额（元）- 可选，仅东方财富有
  isUp: boolean;       // 是否上涨（决定柱状图颜色）
}

// 交易量柱状图数据点（用于基金交易量显示）
export interface VolumeBar {
  date: string;       // YYYY-MM-DD
  x: number;          // SVG X 坐标
  type: 'buy' | 'sell';
  shares: number;     // 交易份额（绝对值）
}

// 持仓份额趋势点（用于基金持仓趋势线）
export interface FundPositionTrendPoint {
  date: string;       // YYYY-MM-DD
  shares: number;     // 持仓份额
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

export interface SystemParamsSection {
  ocrConcurrency: number;  // OCR 并发数量，默认 3，范围 1-8
}

export interface FeatureConfigSection {
  initialPriceAdjustmentEnabled: boolean;
  jobLogEnabled: boolean;
  ocrDebugPanelEnabled: boolean;  // OCR调试面板开关，默认关闭
}

export interface BackupConfig {
  autoExportTime: string;    // "HH:mm" local time, default "16:00"
  autoBackupEnabled?: boolean; // Whether auto backup is enabled, default false
  syncConfig?: SyncConfig;   // Synchronization configuration
  syncFilterConfig?: SyncFilterConfig; // Sync confirmation modal filter settings
  systemParams?: SystemParamsSection; // 系统参数（可选以兼容旧备份）
  features?: FeatureConfigSection; // 系统开关（可选以兼容旧备份）
}

export interface BackupData {
  portfolio: BackupFund[];
  indices: BackupIndex[];        // 所有指数（统一存储）
  globalIndices?: BackupIndex[]; // 已废弃，仅为向后兼容保留
  positions: Record<string, FundPosition>;
  trades: Record<string, TradeRecord[]>;
  comboTrades: Record<string, ComboTrade>;
  config: BackupConfig;
}

// ─── Intraday point type (for per-minute day-limited caching used by intraday chart)
export interface IntradayPoint {
  timestamp: number; // floored to minute (ms)
  value: number;
  equityReturn: number; // percent
  volume?: number; // 成交量（手），仅指数有效
  amount?: number; // 成交额（元），仅指数有效
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

// 批量交易输入记录
export interface BatchTradeInput {
  symbol: string;
  name: string;
  type: TradeType;
  price: number;
  shares: number;
  fee: number;
  total: number;
}

// structured reason for strategy decisions (for hovertip)
export type StrategyReasonType = 'golden' | 'death' | 'insufficient' | 'info' | 'other';

// Strategy parameter configuration structure
export interface StrategyParam {
  value: string | number | boolean;  // 配置值（表达式字符串、数字、布尔）
  type: "string" | "number" | "bool"; // 最终类型
  description: string;                // 描述信息，用于界面显示
}

export type StrategyParams = Record<string, StrategyParam>;

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
  // baseUnit 移除，由策略自行从配置计算
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
  initialTriggerCount?: number;  // 初始累计触发数（默认1）
  maxTriggerCount?: number;       // 最大累计触发数（默认1）
  initialDelay?: number;           // 初始延迟（毫秒），任务启动后延迟执行
}

export interface TimerJobError {
  id: string;
  jobName: string;
  message: string;
  time: Date;
  displayCount: number;  // 已显示次数
}

// 定时任务执行结果 - 用于统一报告任务状态
export interface JobResult<T = any> {
  success: boolean;
  data?: T;        // 成功时返回的数据
  message?: string; // 成功时的可选信息或失败时的错误原因
}

// --- Combo trade types ---
export interface ComboTradeRecord {
  fundId: string;   // 基金代码（唯一标识）
  amount: number;   // 买入金额
  fee: number;      // 手续费
}

export interface ComboTrade {
  id: string;                          // 唯一标识
  name: string;                        // 组合名称
  records: ComboTradeRecord[];        // 组合内的基金记录（只保存 amount > 0）
}
