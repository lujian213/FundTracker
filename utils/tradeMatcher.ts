import { TradeRecord } from '../types';

// 扩展的交易记录类型
export interface MatchedRecord extends TradeRecord {
  remainingShares: number;   // 剩余份额
  remainingFee: number;      // 剩余手续费
  originalShares: number;    // 原始份额
  originalFee: number;       // 原始手续费
  isError?: boolean;         // 是否为异常记录（卖出未匹配完）
}

// 匹配结果
export interface MatchResult {
  records: MatchedRecord[];  // 处理后的记录（已过滤份额为0的）
  errors: string[];          // 错误信息列表
}

// 匹配器函数类型
export type MatcherFunction = (
  records: TradeRecord[],
  currentPrice: number
) => MatchResult;

// 将 TradeRecord 转换为 MatchedRecord
const toMatchedRecord = (record: TradeRecord): MatchedRecord => ({
  ...record,
  remainingShares: record.shares,
  remainingFee: record.fee || 0,
  originalShares: record.shares,
  originalFee: record.fee || 0,
});

// 普通视图匹配器：直接返回原始数据，按交易日期倒序，建仓记录永远在最下面
export const normalMatcher: MatcherFunction = (records, _currentPrice) => {
  const matchedRecords = records.map(toMatchedRecord);
  // 排序：先按日期倒序，然后建仓记录移到最下面
  matchedRecords.sort((a, b) => {
    const aIsInitial = (a as any).isInitial;
    const bIsInitial = (b as any).isInitial;

    // 建仓记录永远排在最后
    if (aIsInitial && !bIsInitial) return 1;
    if (!aIsInitial && bIsInitial) return -1;

    // 同类型内按日期倒序
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
  return {
    records: matchedRecords,
    errors: [],
  };
};

// FIFO匹配器：先进先出
export const fifoMatcher: MatcherFunction = (records, _currentPrice) => {
  // 按日期升序排列
  const sortedRecords = [...records].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const buyPool: MatchedRecord[] = [];
  const result: MatchedRecord[] = [];
  const errors: string[] = [];

  for (const record of sortedRecords) {
    const isBuy = record.type === 'buy' || (record as any).isInitial;

    if (isBuy) {
      // 买入/建仓：添加到池和结果
      const matched = toMatchedRecord(record);
      buyPool.push(matched);
      result.push(matched);
    } else {
      // 卖出：从买入池头部开始匹配（FIFO）
      const sellRecord = toMatchedRecord(record);
      let remainingSellShares = record.shares;

      while (remainingSellShares > 0 && buyPool.length > 0) {
        const buyRecord = buyPool[0];

        if (buyRecord.remainingShares > remainingSellShares) {
          // 部分匹配买入记录
          const matchRatio = remainingSellShares / buyRecord.remainingShares;
          buyRecord.remainingFee -= buyRecord.originalFee * matchRatio;
          buyRecord.remainingShares -= remainingSellShares;
          remainingSellShares = 0;
        } else {
          // 完全匹配买入记录
          remainingSellShares -= buyRecord.remainingShares;
          buyRecord.remainingShares = 0;
          buyRecord.remainingFee = 0;
          buyPool.shift(); // 从池中移除
        }
      }

      if (remainingSellShares > 0) {
        // 异常：卖出未完全匹配
        const unmatchedRatio = remainingSellShares / record.shares;
        sellRecord.remainingShares = remainingSellShares;
        sellRecord.remainingFee = (record.fee || 0) * unmatchedRatio;
        sellRecord.isError = true;
        errors.push(`日期 ${record.date} 卖出记录有 ${remainingSellShares.toFixed(2)} 份未匹配`);
      } else {
        // 卖出完全匹配，设置为0（会被过滤掉）
        sellRecord.remainingShares = 0;
        sellRecord.remainingFee = 0;
      }

      result.push(sellRecord);
    }
  }

  // 过滤份额为0的记录，按日期降序排列
  const filteredRecords = result.filter(r => r.remainingShares > 0);
  filteredRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return { records: filteredRecords, errors };
};

// LIFO匹配器：后进先出
export const lifoMatcher: MatcherFunction = (records, _currentPrice) => {
  // 按日期升序排列
  const sortedRecords = [...records].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const buyPool: MatchedRecord[] = [];
  const result: MatchedRecord[] = [];
  const errors: string[] = [];

  for (const record of sortedRecords) {
    const isBuy = record.type === 'buy' || (record as any).isInitial;

    if (isBuy) {
      const matched = toMatchedRecord(record);
      buyPool.push(matched);
      result.push(matched);
    } else {
      const sellRecord = toMatchedRecord(record);
      let remainingSellShares = record.shares;

      // LIFO: 从买入池尾部开始匹配（最近的买入先消耗）
      while (remainingSellShares > 0 && buyPool.length > 0) {
        const buyRecord = buyPool[buyPool.length - 1]; // 取最后一个

        if (buyRecord.remainingShares > remainingSellShares) {
          const matchRatio = remainingSellShares / buyRecord.remainingShares;
          buyRecord.remainingFee -= buyRecord.originalFee * matchRatio;
          buyRecord.remainingShares -= remainingSellShares;
          remainingSellShares = 0;
        } else {
          remainingSellShares -= buyRecord.remainingShares;
          buyRecord.remainingShares = 0;
          buyRecord.remainingFee = 0;
          buyPool.pop(); // 从池中移除最后一个
        }
      }

      if (remainingSellShares > 0) {
        const unmatchedRatio = remainingSellShares / record.shares;
        sellRecord.remainingShares = remainingSellShares;
        sellRecord.remainingFee = (record.fee || 0) * unmatchedRatio;
        sellRecord.isError = true;
        errors.push(`日期 ${record.date} 卖出记录有 ${remainingSellShares.toFixed(2)} 份未匹配`);
      } else {
        // 卖出完全匹配，设置为0（会被过滤掉）
        sellRecord.remainingShares = 0;
        sellRecord.remainingFee = 0;
      }

      result.push(sellRecord);
    }
  }

  const filteredRecords = result.filter(r => r.remainingShares > 0);
  filteredRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return { records: filteredRecords, errors };
};

// 根据视图模式返回匹配器
export const getMatcher = (viewMode: 'normal' | 'fifo' | 'lifo'): MatcherFunction => {
  switch (viewMode) {
    case 'fifo':
      return fifoMatcher;
    case 'lifo':
      return lifoMatcher;
    default:
      return normalMatcher;
  }
};