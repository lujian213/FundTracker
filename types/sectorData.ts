/**
 * 板块数据类型定义
 */
export interface SectorData {
  code: string;        // 板块代码（如BK0428）
  name: string;        // 板块名称（如"电力"）
  price: number;       // 最新价
  changePercent: number; // 涨跌幅（%）
  changeAmount: number;  // 涨跌额
  marketCap: number;     // 总市值（元）
  turnoverRate: number;  // 换手率（%）
  upCount: number;       // 上涨家数
  downCount: number;     // 下跌家数
  leadingStock: string;  // 领涨股票名称
}

/**
 * 板块类型
 */
export type SectorType = 'concept' | 'industry';