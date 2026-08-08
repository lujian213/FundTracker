export enum MarketType {
  FUND = 'Fund',
  INDEX = 'Index'
}

// Card data-fetch status: 'ok' = success, 'error' = failure, 'unknown' = not yet fetched / in-progress, 'warning' = config error
export type CardStatus = 'ok' | 'error' | 'unknown' | 'warning';

export type ManageItemType = 'fund' | 'index' | 'global_index';
export type ManageSelectionKey = `${ManageItemType}:${string}`;

// CalendarEvent - 日历事件（节假日/交割日）
export interface CalendarEvent {
  type: 'holiday_china' | 'holiday_hk' | 'holiday_us' | 'holiday_sg' |
        'delivery_china' | 'delivery_hk' | 'delivery_us' |
        'important_data_us_cpi' | 'important_data_us_ppi' |
        'important_data_us_gdp' | 'important_data_us_pce' |
        'important_data_us_ism_mfg' | 'important_data_us_ism_svc' |
        'important_data_us_retail' | 'important_data_us_nonfarm' |
        'important_data_us_fomc';  // 事件类型
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
  stock_code?: string;     // 股票代码（6位数字，如 "600519"）
  stock_url?: string;      // 股票详情页链接
}

// StageIncrease - 阶段盈亏
export interface StageIncrease {
  stage: '近1周' | '近1月' | '近3月' | '近6月';
  increase_percentage: number;  // 盈亏百分比
}

// FundSector - 基金板块信息
export interface FundSector {
  code: string;   // 板块代码（如"BK000644"）
  name: string;   // 板块名称（如"PCB"、"食品饮料"）
}

// FundProfile - 基金基本信息
export interface FundProfile {
  stock_positions: StockPosition[];    // 股票持仓列表
  stage_increase: StageIncrease[];     // 阶段盈亏列表
  fund_type?: string;                  // 基金类型（如"混合型-偏股"）
  sectors?: FundSector[];              // 板块信息列表
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

// 基金净值类型：T+1=正常国内基金，T+2=美股QDII基金
export type FundNavType = 'T+1' | 'T+2';

// 基金持仓配置
export interface FundPosition {
  fullCapacity: number;       // 满仓金额
  initialPosition: number;    // 初始仓位
  startDate: string | null;   // 开始日期 YYYY-MM-DD
  initialPrice: number | null; // 初始价格
  aliasName?: string;         // 别名（用于OCR匹配，可选）
  trackingIndex?: string;     // 跟踪指数，格式 "market.code"，如 "2.H50036"
  navType?: FundNavType;      // 基金净值类型，默认为 'T+1'
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
  profitShare?: number; // profit share percentage for attribution
}

export interface OverallProfitSummary {
  timeline: OverallProfitPoint[];
  perFund: OverallFundRow[];
  // per-fund time series used to build table and for efficient filtering without recomputation
  perFundTimelines?: Record<string, { date: string; cumulativeProfit: number }[]>;
  totalDiff: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// KPI & Performance Attribution types (Dashboard Phase 1)
// ═══════════════════════════════════════════════════════════════════════════════

// KPI calculation result
export interface KPIResult {
  annualizedReturn: number | null; // 年化收益率 (%), null if invalid
  maxDrawdown: number | null; // 最大回撤 (%), negative value, null if invalid
  volatility: number | null; // 收益波动率 (%), null if invalid
  sharpeRatio: number | null; // 夏普比率, null if invalid
  calmarRatio: number | null; // 卡玛比率, null if invalid
  // 最大回撤详细信息（仅单个基金时有效）
  drawdownPeakDate?: string | null;    // 波峰日期
  drawdownPeakUnitProfit?: number;     // 波峰单位盈利
  drawdownPeakNav?: number;            // 波峰时基金净值
  drawdownTroughDate?: string | null;  // 波谷日期
  drawdownTroughUnitProfit?: number;   // 波谷单位盈利
  drawdownTroughNav?: number;          // 波谷时基金净值
}

// Performance attribution result
export interface AttributionResult {
  funds: FundAttributionData[];
  totalAbsoluteProfit: number; // sum of |profit| for all funds
}

// Single fund attribution data
export interface FundAttributionData {
  symbol: string;
  name?: string;
  profit: number; // actual profit amount (can be negative)
  profitShare: number; // percentage of total absolute profit
  isProfit: boolean; // true if profit > 0
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
  // symbol is used internally for behavior analysis, not persisted
  symbol?: string;
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

// ═══════════════════════════════════════════════════════════════════════════════
// 历史K线周期类型
// ═══════════════════════════════════════════════════════════════════════════════

/** 历史K线周期类型 */
export type HistoryKlinePeriod = 'realtime' | '5min' | '15min' | '30min' | '60min';

/** 周期配置 */
export const HISTORY_KLINE_PERIOD_CONFIG: Record<HistoryKlinePeriod, {
  label: string;      // 显示名称
  klt: number | null; // 东方财富API参数，null表示用累积数据
  lmt: number;        // API请求条数限制（API最大支持约80个点）
}> = {
  'realtime': { label: '日K', klt: null, lmt: 0 },
  '5min':     { label: '5分钟', klt: 5, lmt: 80 },   // 约80个点（API最大支持）
  '15min':    { label: '15分钟', klt: 15, lmt: 80 }, // 约80个点
  '30min':    { label: '30分钟', klt: 30, lmt: 80 }, // 约80个点
  '60min':    { label: '60分钟', klt: 60, lmt: 80 }, // 约80个点
};

/** K线数据点（来自东方财富API） */
export interface KlinePoint {
  timestamp: number;    // 时间戳（毫秒）
  open: number;         // 开盘价
  close: number;        // 收盘价
  high: number;         // 最高价
  low: number;          // 最低价
  volume: number;       // 成交量
  amount: number;       // 成交额
  changePercent: number; // 涨跌幅（百分比，基于昨日收盘）
}

// ═══════════════════════════════════════════════════════════════════════════════
// 风险监控相关类型 (v1.42)
// ═══════════════════════════════════════════════════════════════════════════════

/** 风险预警类型 */
export type RiskAlertType = 'drawdown' | 'volatility' | 'concentration' | 'continuous_decline' | 'daily_change';

/** 风险预警等级 */
export type RiskAlertLevel = 'low' | 'medium' | 'high';

/** 风险预警 */
export interface RiskAlert {
  id: string;                       // 唯一标识
  type: RiskAlertType;              // 预警类型
  level: RiskAlertLevel;            // 预警等级
  target: string;                   // 触发对象（基金代码或"PORTFOLIO"表示整体组合）
  targetName: string;               // 触发对象名称
  currentValue: number;             // 当前值
  threshold: number;                // 阈值
  unit: string;                     // 单位（%、天等）
  triggeredAt: string;              // ISO 时间戳
  message: string;                  // 预警消息
}

/** 基金回撤信息 */
export interface FundDrawdown {
  symbol: string;                   // 基金代码
  name: string;                     // 基金名称
  currentDrawdown: number;          // 当前回撤百分比（正值）
  currentDrawdownDays: number;      // 当前回撤持续天数
  maxDrawdown: number;              // 最大回撤百分比（正值）
  maxDrawdownPeakDate: string;      // 最大回撤波峰日期
  maxDrawdownTroughDate: string;    // 最大回撤波谷日期
  maxDrawdownDays: number;          // 最大回撤持续天数
  maxDrawdownPeakNav?: number;      // 最大回撤波峰净值
  maxDrawdownTroughNav?: number;    // 最大回撤波谷净值
  maxDrawdownPeakCostPrice?: number;  // 最大回撤波峰成本价
  maxDrawdownTroughCostPrice?: number; // 最大回撤波谷成本价
  maxDrawdownPeakUnitProfit?: number; // 最大回撤波峰单位盈利
  maxDrawdownTroughUnitProfit?: number; // 最大回撤波谷单位盈利
  peakDate: string;                 // 当前回撤峰值日期
  peakValue: number;                // 峰值净值
  peakCostPrice?: number;           // 峰值时成本价
  peakUnitProfit?: number;          // 峰值时单位盈利
  troughDate?: string;              // 当前回撤低点日期
  troughValue?: number;             // 当前回撤低点净值
  troughCostPrice?: number;         // 低点时成本价
  troughUnitProfit?: number;        // 低点时单位盈利
  currentValue: number;             // 当前净值
  currentCostPrice?: number;        // 当前成本价
  currentUnitProfit?: number;       // 当前单位盈利

  // Beta版本新增字段
  drawdownMethod?: DrawdownMethod;  // 该基金回撤使用的计算方法
}

/** 风险阈值配置 */
export interface RiskThresholds {
  drawdown: {                       // 回撤预警阈值
    low: number;                    // 轻度预警（黄色）
    medium: number;                 // 中度预警（橙色）
    high: number;                   // 重度预警（红色）
  };
  volatility: {                     // 波动率阈值
    low: number;                    // 低波动阈值（绿色）
    high: number;                   // 高波动阈值（红色）
  };
  dailyChange: {                    // 单日波动阈值
    warning: number;                // 预警阈值
    severe: number;                 // 严重阈值
  };
  continuousDecline: {              // 连续下跌阈值
    low: number;                    // 轻度关注（天）
    high: number;                   // 高度关注（天）
  };
  concentration: {                  // 集中度阈值
    singleFund: number;             // 单基金上限（%）
    topThree: number;               // 前三基金上限（%）
  };
}

/** 风险快照 */
export interface RiskSnapshot {
  score: number;                    // 综合风险评分 (0-100)
  maxDrawdown: number;              // 历史最大回撤百分比（正值）
  maxDrawdownPeakDate: string | null;  // 最大回撤波峰日期
  maxDrawdownPeakProfit: number;    // 最大回撤波峰累计盈利值
  maxDrawdownTroughDate: string | null; // 最大回撤波谷日期
  maxDrawdownTroughProfit: number;  // 最大回撤波谷累计盈利值
  maxDrawdownDays: number;          // 最大回撤持续天数（从峰值到低点）
  currentDrawdown: number;          // 当前回撤百分比（正值）
  currentDrawdownPeakDate: string | null; // 当前回撤波峰日期
  currentDrawdownPeakNav: number;   // 当前回撤波峰净值
  currentDrawdownTroughDate: string | null; // 当前回撤波谷日期
  currentDrawdownTroughNav: number; // 当前回撤波谷净值
  currentNav: number;               // 当前净值
  currentDate: string | null;       // 当前日期
  currentDrawdownDays: number;      // 当前回撤持续天数
  volatility: number;               // 年化波动率百分比
  sharpeRatio: number | null;       // 夏普比率
  calmarRatio: number | null;       // 卡玛比率
  hhi: number;                      // 集中度指数 (0-1)
  continuousDecline: number;        // 连续下跌天数
  maxRecoveryDays: number;          // 历史最长恢复天数
  maxRecoveryPeakDate: string | null;   // 历史最长恢复的回撤峰值日期
  maxRecoveryTroughDate: string | null; // 历史最长恢复的回撤低点日期
  maxRecoveryRecoveryDate: string | null; // 历史最长恢复的恢复日期（null表示未恢复）
  maxRecoveryInProgress: boolean;   // 当前是否有未恢复的回撤
  alerts: RiskAlert[];              // 预警列表
  fundDrawdowns: FundDrawdown[];    // 各基金回撤

  // Beta版本新增字段
  drawdownMethod?: DrawdownMethod;  // 整体回撤使用的计算方法

  computedAt: string;               // 计算时间（ISO时间戳）
}

/** 增量计算状态（内存缓存） */
export interface RiskIncrementalState {
  snapshot: RiskSnapshot;           // 风险快照
  portfolioHash: string;            // 投资组合数据指纹
  historyHash: string;              // 历史数据指纹
  lastUpdated: number;              // 上次更新时间戳（毫秒）
}

// ═══════════════════════════════════════════════════════════════════════════════
// 行为回顾系统类型定义
// ═══════════════════════════════════════════════════════════════════════════════

// 行为评分
export interface BehaviorScore {
  total: number;           // 总分 0-100
  timing: number;          // 时机选择分
  emotion: number;         // 情绪控制分
  discipline: number;      // 交易纪律分
}

// 交易时机评分（单笔交易）
export interface TimingScore {
  trade: TradeRecord;
  score: number;          // 0-100
  percentile: number;     // 净值百分位 0-100
  reason: string;         // 原因说明
}

// 行为分析结果
export interface BehaviorAnalysis {
  // 评分
  score: BehaviorScore;

  // 交易频率
  frequency: {
    buyCount: number;
    sellCount: number;
    avgHoldingDays: number;
    feeRate: number;
    trades: TradeRecord[];
  };

  // 情绪化交易（带理由）
  emotion: {
    chaseHighSellLow: Array<TradeRecord & { reason: string }>;  // 追涨杀跌
    frequentLossTrade: Array<TradeRecord & { reason: string }>;  // 亏损的频繁调仓
    fomoBuy: Array<TradeRecord & { reason: string }>;            // FOMO买入
  };

  // 时机评分
  timing: {
    avgScore: number;
    good: TradeRecord[];    // 好时机
    normal: TradeRecord[];  // 一般时机
    bad: TradeRecord[];     // 差时机
    details: TimingScore[]; // 详细评分
  };

  // 进步趋势
  trend?: {
    previousScore: number;
    diff: number;         // 正数表示进步，负数表示退步
    label: string;        // "较前一期" 或 "较去年同期"
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 回撤追踪（Beta版本）类型定义
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 回撤计算方法
 */
export type DrawdownMethod = 'profit' | 'nav';

/**
 * 回撤计算结果（统一结构）
 */
export interface DrawdownResult {
  method: DrawdownMethod;          // 实际使用的方法

  // 当前回撤信息
  currentDrawdown: number;
  currentDrawdownDays: number;
  currentPeakDate: string | null;
  currentPeakValue: number;        // 峰值（根据method是累计盈亏或净值）
  currentTroughDate: string | null;
  currentTroughValue: number;
  currentValue: number;            // 当前值（根据method是累计盈亏或净值）

  // 最大回撤信息
  maxDrawdown: number;
  maxDrawdownDays: number;
  maxPeakDate: string | null;
  maxTroughDate: string | null;
  maxPeakValue: number;
  maxTroughValue: number;
}
