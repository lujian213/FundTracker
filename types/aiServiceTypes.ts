// types/aiServiceTypes.ts

import { ValuationData, TradeRecord } from '../types';

/**
 * 基金AI查询上下文
 */
export interface FundAIQueryContext {
  marketType: 'fund';
  fundName: string;
  fundSymbol: string;
  valuationData?: ValuationData;
  tradeHistory?: TradeRecord[];
  fullCapacity?: number;
  initialCapacity?: number;
  initialDate?: string;
  initialPrice?: number;
  marketValue?: number;
  position?: number;
  positionRate?: number;
  profit?: number;
  avgCostPrice?: number;
}

/**
 * 指数AI查询上下文
 */
export interface IndexAIQueryContext {
  marketType: 'index';
  indexName: string;
  indexSymbol: string;
  datetime: string;
  currentValue?: number;  // 当前点位值
  currentVolume?: number;  // 当前成交量（手）
  closingPrices?: { date: string; price: number }[];
  ma5?: (number | null)[];
  ma10?: (number | null)[];
  ma20?: (number | null)[];
  volumes?: number[];
  realtimePrices?: { time: string; price: number }[];
}

/**
 * 市场类型
 */
export type MarketType = 'fund' | 'index';