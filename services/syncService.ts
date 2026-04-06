import { TradeRecord } from '../types';
import {
  TradeDifference,
  SyncDifferenceType,
  DateTradeGroup,
  EggfundTradeRecord,
  DifferenceDetail
} from '../types/syncTypes';
import { transformEggfundData as convertEggfundData } from '../utils/syncUtils';
import * as marketFundService from './marketFundService';

/**
 * 比较本地交易记录与外部交易记录，按日期和基金分组检测差异
 */
export function compareTrades(
  localTrades: TradeRecord[],
  externalTrades: EggfundTradeRecord[],
  fundCode: string  // 需要显式传入基金代码
): TradeDifference[] {

  // 将本地交易记录按日期分组
  const localGroups = groupTradesByDateAndSymbol(localTrades, fundCode);

  // 将外部交易记录转换为内部格式，然后按日期分组
  const transformedExternalTrades = convertEggfundData(externalTrades, fundCode);
  const externalGroups = groupTradesByDateAndSymbol(transformedExternalTrades, fundCode);

  // 找出所有涉及的日期和基金组合
  const allKeys = new Set([...Object.keys(localGroups), ...Object.keys(externalGroups)]);

  const differences: TradeDifference[] = [];

  allKeys.forEach(key => {
    const [date, symbol] = key.split('|'); // 日期和基金代码的组合键

    const localGroup = localGroups[key];
    const externalGroup = externalGroups[key];

    if (localGroup && externalGroup) {
      // 两组都存在，需要比较是否有差异
      const comparisonResult = compareDateTradeGroups(localGroup, externalGroup);

      if (comparisonResult.hasDifference) {
        differences.push({
          date,
          symbol,
          type: 'modified',
          localData: localGroup,
          externalData: externalGroup,
          differenceDetails: comparisonResult.differenceDetails
        });
      }
      // 如果没有差异，则不添加到差异列表中
    } else if (!localGroup && externalGroup) {
      // 本地不存在，外部存在 - 新增
      differences.push({
        date,
        symbol,
        type: 'new',
        externalData: externalGroup
      });
    } else if (localGroup && !externalGroup) {
      // 本地存在，外部不存在 - 删除
      differences.push({
        date,
        symbol,
        type: 'deleted',
        localData: localGroup
      });
    }
  });

  return differences;
}

/**
 * 应用选定的差异同步到本地数据
 */
export function applySyncUpdates(selectedDifferences: TradeDifference[]): void {
  try {
    // 遍历选中的差异并应用更新
    for (const diff of selectedDifferences) {
      const trades = marketFundService.getTrades(diff.symbol);

      // 根据差异类型处理更新
      switch (diff.type) {
        case 'new':
          // 添加新的交易记录
          if (diff.externalData) {
            trades.push(...diff.externalData.trades);
          }
          break;

        case 'modified':
          // 修改现有记录 - 用外部数据替换本地数据
          if (diff.externalData) {
            // 移除对应日期的本地记录
            const filteredTrades = trades.filter(
              (trade: TradeRecord) => trade.date !== diff.date
            );
            // 添加外部数据
            filteredTrades.push(...diff.externalData.trades);
            marketFundService.updateTrades(diff.symbol, filteredTrades);
            continue; // 跳过最后的 updateTrades
          }
          break;

        case 'deleted':
          // 删除本地记录
          if (diff.localData) {
            const filteredTrades = trades.filter(
              (trade: TradeRecord) => trade.date !== diff.date
            );
            marketFundService.updateTrades(diff.symbol, filteredTrades);
            continue; // 跳过最后的 updateTrades
          }
          break;
      }

      // 对于 new 类型，保存更新后的数据
      marketFundService.updateTrades(diff.symbol, trades);
    }
  } catch (error) {
    console.error('应用同步更新时出错:', error);
    throw error;
  }
}

/**
 * 将交易记录按日期和基金代码分组
 */
function groupTradesByDateAndSymbol(trades: TradeRecord[], fundCode: string): Record<string, DateTradeGroup> {
  const groups: Record<string, DateTradeGroup[]> = {};

  trades.forEach(trade => {
    const key = `${trade.date}|${fundCode}`; // 日期和基金代码的组合键

    if (!groups[key]) {
      groups[key] = [{
        date: trade.date,
        symbol: fundCode,
        netDirection: 'hold',
        netShares: 0,
        totalFees: 0,
        trades: []
      }];
    }

    groups[key][0].trades.push(trade);
  });

  // 计算每组的汇总信息
  const result: Record<string, DateTradeGroup> = {};
  Object.entries(groups).forEach(([key, groupList]) => {
    const trades = groupList[0].trades;
    const netShares = trades.reduce((sum, trade) => {
      return trade.type === 'buy' ? sum + trade.shares : sum - trade.shares;
    }, 0);

    const netDirection: 'buy' | 'sell' | 'hold' = netShares > 0 ? 'buy' : netShares < 0 ? 'sell' : 'hold';

    const totalFees = trades.reduce((sum, trade) => sum + trade.fee, 0);

    result[key] = {
      date: trades[0].date,
      symbol: fundCode,
      netDirection,
      netShares: Math.abs(netShares),
      totalFees,
      trades
    };
  });

  return result;
}

/**
 * 比较两个日期交易组，确定是否有差异及差异类型
 */
function compareDateTradeGroups(local: DateTradeGroup, external: DateTradeGroup): {
  hasDifference: boolean;
  differenceDetails: DifferenceDetail[];
} {
  const differences: DifferenceDetail[] = [];

  if (local.netDirection !== external.netDirection) {
    differences.push({
      type: 'direction',
      localValue: local.netDirection,
      externalValue: external.netDirection
    });
  }

  // 先将本地记录的份额精确到小数点后2位，再进行比较
  const localNetSharesRounded = Number(local.netShares.toFixed(2));
  if (Math.abs(localNetSharesRounded - external.netShares) > 0.001) {
    differences.push({
      type: 'netShares',
      localValue: localNetSharesRounded,
      externalValue: external.netShares
    });
  }

  // 先将本地记录的费用精确到小数点后2位，再进行比较
  const localTotalFeesRounded = Number(local.totalFees.toFixed(2));
  if (Math.abs(localTotalFeesRounded - external.totalFees) > 0.001) {
    differences.push({
      type: 'fees',
      localValue: localTotalFeesRounded,
      externalValue: external.totalFees
    });
  }

  return {
    hasDifference: differences.length > 0,
    differenceDetails: differences
  };
}