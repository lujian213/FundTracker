import { VirtualStrategy, VirtualStrategyContext } from '../../types';
import { strategyConfig } from '../strategyConfig';
import { extractDateFromTimestamp } from '../../utils/dateTimeUtils';
import { evaluateStrategyParameter } from '../../utils/strategyParameterEvaluator';

/**
 * 计算给定值在数组中的分位数位置
 * @param values 已排序的数值数组
 * @param target 目标值
 * @returns 分位数（0-100），表示target在values中的相对位置
 */
function calculatePercentile(values: number[], target: number): number {
  if (!values || values.length === 0) return 50;

  // 找到小于target的值数量
  const lessCount = values.filter(v => v < target).length;
  // 找到等于target的值数量
  const equalCount = values.filter(v => v === target).length;

  // 分位数 = (小于的数量 + 0.5 * 等于的数量) / 总数量 * 100
  const percentile = (lessCount + 0.5 * equalCount) / values.length * 100;
  return Math.round(percentile * 100) / 100; // 保留2位小数
}

export const valuationPercentileStrategy: VirtualStrategy = {
  name: strategyConfig.valuationPercentile.name,
  description: strategyConfig.valuationPercentile.description,
  decide(ctx: VirtualStrategyContext) {
    const hist = ctx.history || [];
    if (!hist || hist.length < 20) {
      return { action: 'hold', shares: 0, reason: { type: 'insufficient', text: '历史数据不足（至少需要20天），无法计算分位数' } };
    }

    // 从配置读取参数
    const cfg = strategyConfig.valuationPercentile.params || {};
    const window_days = evaluateStrategyParameter(cfg.window_days, ctx);
    const low_percentile = evaluateStrategyParameter(cfg.low_percentile, ctx);
    const high_percentile = evaluateStrategyParameter(cfg.high_percentile, ctx);
    const buy_ratio = evaluateStrategyParameter(cfg.buy_ratio, ctx);
    const sell_ratio = evaluateStrategyParameter(cfg.sell_ratio, ctx);

    // 取最近window_days天的数据（或全部可用数据）
    const startIdx = Math.max(0, hist.length - window_days);
    const windowHist = hist.slice(startIdx);

    // 提取净值并排序
    const navs = windowHist.map(p => p.value).sort((a, b) => a - b);

    // 当前净值（最后一天）
    const lastPoint = hist[hist.length - 1];
    const currentNav = lastPoint.value;

    // 计算分位数
    const percentile = calculatePercentile(navs, currentNav);

    const crossDate = lastPoint && typeof lastPoint.date === 'number' ? extractDateFromTimestamp(lastPoint.date) ?? undefined : undefined;

    // 判断信号
    if (percentile <= low_percentile) {
      // 低分位数：买入信号
      const maxBuyByCash = Math.floor((ctx.cash / currentNav) * 100) / 100;
      const targetBuy = Math.floor((ctx.cash * buy_ratio / currentNav) * 100) / 100;
      const actual = Math.min(targetBuy, maxBuyByCash);

      if (actual <= 0) {
        return { action: 'hold', shares: 0, reason: { type: 'info', text: `${crossDate ? crossDate + ' ' : ''}当前分位数 ${percentile.toFixed(1)}%，满足买入条件，但现金不足` } };
      }

      const text = `${crossDate ? crossDate + ' ' : ''}当前分位数 ${percentile.toFixed(1)}%（低于${low_percentile}%阈值），估值偏低，买入 ${actual.toFixed(2)} 份`;
      return { action: 'buy', shares: Number(actual.toFixed(2)), reason: { type: 'other', date: crossDate, percentile, text } };
    }

    if (percentile >= high_percentile) {
      // 高分位数：卖出信号（仅在有持仓时）
      if (ctx.shares <= 0) {
        const text = `${crossDate ? crossDate + ' ' : ''}当前分位数 ${percentile.toFixed(1)}%（高于${high_percentile}%阈值），估值偏高，但无持仓，观望等待买入时机`;
        return { action: 'hold', shares: 0, reason: { type: 'info', date: crossDate, percentile, text } };
      }

      const targetSell = Math.floor((ctx.shares * sell_ratio) * 100) / 100;
      const actual = Math.min(targetSell, ctx.shares);

      if (actual <= 0) {
        const text = `${crossDate ? crossDate + ' ' : ''}当前分位数 ${percentile.toFixed(1)}%，估值偏高，但卖出份额为零`;
        return { action: 'hold', shares: 0, reason: { type: 'info', date: crossDate, percentile, text } };
      }

      const text = `${crossDate ? crossDate + ' ' : ''}当前分位数 ${percentile.toFixed(1)}%（高于${high_percentile}%阈值），估值偏高，卖出 ${actual.toFixed(2)} 份`;
      return { action: 'sell', shares: Number(actual.toFixed(2)), reason: { type: 'other', date: crossDate, percentile, text } };
    }

    // 中间分位数：持有
    const text = `${crossDate ? crossDate + ' ' : ''}当前分位数 ${percentile.toFixed(1)}%，处于中性区间（${low_percentile}%-${high_percentile}%），不操作`;
    return { action: 'hold', shares: 0, reason: { type: 'info', date: crossDate, percentile, text } };
  }
};