import { TradeRecord, TradeType } from '../types';

// 同步配置
export interface SyncConfig {
  eggfundUsername: string;
  eggfundPassword: string;
}

// 来自 eggfund 的交易数据
export interface EggfundTradeRecord {
  day: string;           // 交易日期，格式为 yyyy-MM-dd
  type: string;          // "trade"
  id: string;            // 交易唯一ID
  code: string;          // 基金代码
  share: number;         // 交易份额，买入为正数，卖出为负数
  unitPrice: number;     // 单价
  totalSpend: number;    // 总花费
  fee: number;           // 交易手续费
  tax: number;           // 税费
  fxRate: number;        // 汇率
  userIndex: number;
  enabled: boolean;
  batch: number;
  comments: string;      // 备注
  amount: number;        // 金额
  misMatchAlert: boolean; // 不匹配警报
}

// 来自 eggfund 的基金数据
export interface EggfundFund {
  type: string;          // "LOCAL_FUND"
  id: string;            // 基金代码
  name: string;          // 基金名称
  etf: boolean;          // 是否ETF
  priority: number;
  url: string | null;
  category: string | null;
  alias: string | null;
  currency: string;      // "RMB"
  currencySign: string;  // "¥"
}

// 同步差异类型
export type SyncDifferenceType = 'new' | 'modified' | 'deleted';

// 交易差异类型
export interface TradeDifference {
  date: string;                         // YYYY-MM-DD
  symbol: string;                       // 基金代码
  type: SyncDifferenceType;             // 差异类型：新增、修改、删除
  localData?: DateTradeGroup;           // 本地数据
  externalData?: DateTradeGroup;        // 外部数据
  differenceDetails?: DifferenceDetail[]; // 差异详情
}

// 按日期分组的交易记录
export interface DateTradeGroup {
  date: string;           // YYYY-MM-DD
  symbol: string;         // 基金代码
  netDirection: 'buy' | 'sell' | 'hold'; // 净交易方向
  netShares: number;      // 净交易份额（买入-卖出）
  totalFees: number;      // 总手续费
  trades: TradeRecord[];  // 详细交易记录
}

// 差异详情
export interface DifferenceDetail {
  type: 'direction' | 'netShares' | 'fees'; // 差异类型
  localValue: any;
  externalValue: any;
}