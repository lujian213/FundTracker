// services/promptTemplateService.ts

import { FundAIQueryContext, IndexAIQueryContext } from '../types/aiServiceTypes';

/**
 * 填充基金模板变量
 * 从模板字符串中替换基金相关的变量占位符
 */
export function fillFundTemplateVariables(template: string, context: FundAIQueryContext): string {
  let filledTemplate = template;

  // 基金名称
  if (context.fundName) {
    filledTemplate = filledTemplate.replace(/\{name\}/g, context.fundName);
  }

  // 基金代码
  if (context.fundSymbol) {
    filledTemplate = filledTemplate.replace(/\{code\}/g, context.fundSymbol);
  }

  // 交易历史
  if (context.tradeHistory) {
    const historyString = JSON.stringify(context.tradeHistory, null, 2);
    filledTemplate = filledTemplate.replace(/\{history\}/g, historyString);
  } else {
    filledTemplate = filledTemplate.replace(/\{history\}/g, '[]');
  }

  // fullCapacity: 当值为 undefined 或 0 时显示"未设置"
  if (context.fullCapacity !== undefined && context.fullCapacity > 0) {
    filledTemplate = filledTemplate.replace(/\{fullCapacity\}/g, String(context.fullCapacity));
  } else {
    filledTemplate = filledTemplate.replace(/\{fullCapacity\}/g, '未设置');
  }

  // initialCapacity: 当值为 undefined 或 0 时显示"未设置"
  if (context.initialCapacity !== undefined && context.initialCapacity > 0) {
    filledTemplate = filledTemplate.replace(/\{initialCapacity\}/g, String(context.initialCapacity));
  } else {
    filledTemplate = filledTemplate.replace(/\{initialCapacity\}/g, '未设置');
  }

  // initialDate: 当值为 undefined、null 或空字符串时显示"未设置"
  if (context.initialDate) {
    filledTemplate = filledTemplate.replace(/\{initialDate\}/g, context.initialDate);
  } else {
    filledTemplate = filledTemplate.replace(/\{initialDate\}/g, '未设置');
  }

  // initialPrice: 当值为 undefined 或 null 时显示"未设置"
  if (context.initialPrice !== undefined && context.initialPrice !== null) {
    filledTemplate = filledTemplate.replace(/\{initialPrice\}/g, String(context.initialPrice));
  } else {
    filledTemplate = filledTemplate.replace(/\{initialPrice\}/g, '未设置');
  }

  // currentPrice: 当前估值/净值
  if (context.valuationData?.currentPrice !== undefined && context.valuationData.currentPrice !== null) {
    filledTemplate = filledTemplate.replace(/\{currentPrice\}/g, context.valuationData.currentPrice.toFixed(4));
  } else {
    filledTemplate = filledTemplate.replace(/\{currentPrice\}/g, '未设置');
  }

  // currentDate: 当前日期（估值日期）
  if (context.valuationData?.realtimeDate) {
    filledTemplate = filledTemplate.replace(/\{currentDate\}/g, context.valuationData.realtimeDate);
  } else {
    filledTemplate = filledTemplate.replace(/\{currentDate\}/g, '未设置');
  }

  // previousPrice: 前值（上一交易日净值）
  if (context.valuationData?.previousPrice !== undefined && context.valuationData.previousPrice !== null) {
    filledTemplate = filledTemplate.replace(/\{previousPrice\}/g, context.valuationData.previousPrice.toFixed(4));
  } else {
    filledTemplate = filledTemplate.replace(/\{previousPrice\}/g, '未设置');
  }

  // previousDate: 前值日期
  if (context.valuationData?.netWorthDate) {
    filledTemplate = filledTemplate.replace(/\{previousDate\}/g, context.valuationData.netWorthDate);
  } else {
    filledTemplate = filledTemplate.replace(/\{previousDate\}/g, '未设置');
  }

  // rate: 涨跌幅
  if (context.valuationData?.changePercentage !== undefined && context.valuationData.changePercentage !== null) {
    const rate = context.valuationData.changePercentage;
    filledTemplate = filledTemplate.replace(/\{rate\}/g, `${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%`);
  } else {
    filledTemplate = filledTemplate.replace(/\{rate\}/g, '未设置');
  }

  // marketValue: 当前基金的市场价值
  if (context.marketValue !== undefined && context.marketValue !== null) {
    filledTemplate = filledTemplate.replace(/\{marketValue\}/g, context.marketValue.toFixed(2));
  } else {
    filledTemplate = filledTemplate.replace(/\{marketValue\}/g, '未设置');
  }

  // position: 当前基金的仓位（份）
  if (context.position !== undefined && context.position !== null) {
    filledTemplate = filledTemplate.replace(/\{position\}/g, context.position.toFixed(2));
  } else {
    filledTemplate = filledTemplate.replace(/\{position\}/g, '未设置');
  }

  // positionRate: 当前基金的仓位占比（百分比）
  if (context.positionRate !== undefined && context.positionRate !== null) {
    filledTemplate = filledTemplate.replace(/\{positionRate\}/g, `${context.positionRate.toFixed(2)}%`);
  } else {
    filledTemplate = filledTemplate.replace(/\{positionRate\}/g, '未设置');
  }

  // profit: 当前基金的整体盈利
  if (context.profit !== undefined && context.profit !== null) {
    const profit = context.profit;
    filledTemplate = filledTemplate.replace(/\{profit\}/g, `${profit >= 0 ? '+' : ''}${profit.toFixed(2)}`);
  } else {
    filledTemplate = filledTemplate.replace(/\{profit\}/g, '未设置');
  }

  // avgCostPrice: 当前基金的平均成本价
  if (context.avgCostPrice !== undefined && context.avgCostPrice !== null) {
    filledTemplate = filledTemplate.replace(/\{avgCostPrice\}/g, context.avgCostPrice.toFixed(4));
  } else {
    filledTemplate = filledTemplate.replace(/\{avgCostPrice\}/g, '未设置');
  }

  return filledTemplate;
}

/**
 * 填充指数模板变量
 * 从模板字符串中替换指数相关的变量占位符
 */
export function fillIndexTemplateVariables(template: string, context: IndexAIQueryContext): string {
  let filledTemplate = template;

  // 指数名称
  if (context.indexName) {
    filledTemplate = filledTemplate.replace(/\{name\}/g, context.indexName);
  }

  // 指数代码
  if (context.indexSymbol) {
    filledTemplate = filledTemplate.replace(/\{code\}/g, context.indexSymbol);
  }

  // 当前时间
  if (context.datetime) {
    filledTemplate = filledTemplate.replace(/\{datetime\}/g, context.datetime);
  }

  // 收盘价数据
  if (context.closingPrices && context.closingPrices.length > 0) {
    filledTemplate = filledTemplate.replace(/\{closing_prices\}/g, JSON.stringify(context.closingPrices));
  } else {
    filledTemplate = filledTemplate.replace(/\{closing_prices\}/g, '[]');
  }

  // MA5 数据
  if (context.ma5 && context.ma5.length > 0) {
    filledTemplate = filledTemplate.replace(/\{ma5\}/g, JSON.stringify(context.ma5));
  } else {
    filledTemplate = filledTemplate.replace(/\{ma5\}/g, '[]');
  }

  // MA10 数据
  if (context.ma10 && context.ma10.length > 0) {
    filledTemplate = filledTemplate.replace(/\{ma10\}/g, JSON.stringify(context.ma10));
  } else {
    filledTemplate = filledTemplate.replace(/\{ma10\}/g, '[]');
  }

  // MA20 数据
  if (context.ma20 && context.ma20.length > 0) {
    filledTemplate = filledTemplate.replace(/\{ma20\}/g, JSON.stringify(context.ma20));
  } else {
    filledTemplate = filledTemplate.replace(/\{ma20\}/g, '[]');
  }

  // 成交量数据
  if (context.volumes && context.volumes.length > 0) {
    filledTemplate = filledTemplate.replace(/\{volumes\}/g, JSON.stringify(context.volumes));
  } else {
    filledTemplate = filledTemplate.replace(/\{volumes\}/g, '[]');
  }

  // 实时价格数据
  if (context.realtimePrices && context.realtimePrices.length > 0) {
    filledTemplate = filledTemplate.replace(/\{realtime_prices\}/g, JSON.stringify(context.realtimePrices));
  } else {
    filledTemplate = filledTemplate.replace(/\{realtime_prices\}/g, '[]');
  }

  // 实时成交量
  if (context.realtimeVolume !== undefined && context.realtimeVolume !== null) {
    filledTemplate = filledTemplate.replace(/\{realtime_volume\}/g, String(context.realtimeVolume));
  } else {
    filledTemplate = filledTemplate.replace(/\{realtime_volume\}/g, '未设置');
  }

  return filledTemplate;
}

/**
 * 统一入口：根据 marketType 选择填充函数
 */
export function fillTemplateVariables(
  template: string,
  context: FundAIQueryContext | IndexAIQueryContext
): string {
  if (context.marketType === 'fund') {
    return fillFundTemplateVariables(template, context);
  } else {
    return fillIndexTemplateVariables(template, context);
  }
}