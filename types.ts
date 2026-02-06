
export enum MarketType {
  FUND = 'Fund'
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
  lastUpdated: string;       // 更新时间 (gztime)
  valuationDate: string;     // 数据日期
  sourceUrl: string;
}
