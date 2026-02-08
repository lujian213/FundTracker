
export enum MarketType {
  FUND = 'Fund',
  INDEX = 'Index'
}

export interface Ticker {
  id: string;
  symbol: string; // 基金为6位代码，指数为 secid (如 1.000001)
  name: string;
  market: MarketType;
}

export interface ValuationData {
  symbol: string;
  name: string;
  currentPrice: number;      // 实时估值 (gsz)
  previousPrice: number;     // 昨日单位净值 (dwjz)
  changePercentage: number;  // 估值涨跌幅 (gszzl)
  lastUpdated: string;       // 更新时间 (gztime)
  valuationDate: string;     // 数据日期
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
