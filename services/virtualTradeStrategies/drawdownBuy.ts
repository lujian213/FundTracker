import { VirtualStrategy, VirtualStrategyContext } from '../../types';
import { strategyConfig } from '../strategyConfig';
import { extractDateFromTimestamp } from '../../utils/dateTimeUtils';
import { evaluateStrategyParameter } from '../../utils/strategyParameterEvaluator';

/**
 * 找到历史最高净值及其日期
 */
function findHistoricalHigh(hist: { date: number | string; value: number }[]): { value: number; date: string | null } {
  if (!hist || hist.length === 0) return { value: 0, date: null };

  let maxVal = hist[0].value;
  let maxDate = typeof hist[0].date === 'number' ? extractDateFromTimestamp(hist[0].date) : hist[0].date as string;

  for (const p of hist) {
    if (p.value > maxVal) {
      maxVal = p.value;
      maxDate = typeof p.date === 'number' ? extractDateFromTimestamp(p.date) : p.date as string;
    }
  }

  return { value: maxVal, date: maxDate };
}

export const drawdownBuyStrategy: VirtualStrategy = {
  name: strategyConfig.drawdownBuy.name,
  description: strategyConfig.drawdownBuy.description,
  decide(ctx: VirtualStrategyContext) {
    const hist = ctx.history || [];
    if (!hist || hist.length < 10) {
      return { action: 'hold', shares: 0, reason: { type: 'insufficient', text: '历史数据不足（至少需要10天），无法计算回撤' } };
    }

    // 从配置读取参数
    const cfg = strategyConfig.drawdownBuy.params || {};
    const drawdown_threshold = evaluateStrategyParameter(cfg.drawdown_threshold, ctx);
    const recovery_threshold = evaluateStrategyParameter(cfg.recovery_threshold, ctx);
    const buy_ratio = evaluateStrategyParameter(cfg.buy_ratio, ctx);

    // 找历史最高
    const historicalHigh = findHistoricalHigh(hist);

    // 当前净值
    const lastPoint = hist[hist.length - 1];
    const currentNav = lastPoint.value;

    // 计算回撤幅度（百分比，正值表示回撤）
    const drawdown = historicalHigh.value > 0
      ? (historicalHigh.value - currentNav) / historicalHigh.value
      : 0;

    const crossDate = lastPoint && typeof lastPoint.date === 'number' ? extractDateFromTimestamp(lastPoint.date) ?? undefined : undefined;

    // 判断信号
    if (drawdown >= drawdown_threshold) {
      // 回撤超过阈值：买入信号
      const maxBuyByCash = Math.floor((ctx.cash / currentNav) * 100) / 100;
      const targetBuy = Math.floor((ctx.cash * buy_ratio / currentNav) * 100) / 100;
      const actual = Math.min(targetBuy, maxBuyByCash);

      if (actual <= 0) {
        return { action: 'hold', shares: 0, reason: { type: 'info', text: `${crossDate ? crossDate + ' ' : ''}回撤 ${(drawdown * 100).toFixed(1)}%，满足买入条件，但现金不足` } };
      }

      const text = `${crossDate ? crossDate + ' ' : ''}回撤 ${(drawdown * 100).toFixed(1)}%（超过${(drawdown_threshold * 100).toFixed(0)}%阈值），从高点${historicalHigh.date || '未知'}下跌，买入 ${actual.toFixed(2)} 份`;
      return { action: 'buy', shares: Number(actual.toFixed(2)), reason: { type: 'other', date: crossDate, drawdown: drawdown * 100, highDate: historicalHigh.date, text } };
    }

    if (drawdown > 0 && drawdown < recovery_threshold) {
      // 回撤恢复到安全区间：停止买入，提示
      const text = `${crossDate ? crossDate + ' ' : ''}回撤 ${(drawdown * 100).toFixed(1)}%，已恢复至安全区间（低于${(recovery_threshold * 100).toFixed(0)}%），暂停买入`;
      return { action: 'hold', shares: 0, reason: { type: 'info', date: crossDate, drawdown: drawdown * 100, text } };
    }

    // 无回撤或回撤不够：持有
    if (drawdown <= 0) {
      const text = `${crossDate ? crossDate + ' ' : ''}当前净值 ${currentNav.toFixed(4)} 接近或超过历史高点 ${historicalHigh.value.toFixed(4)}，无回撤，不操作`;
      return { action: 'hold', shares: 0, reason: { type: 'info', date: crossDate, drawdown: 0, text } };
    }

    const text = `${crossDate ? crossDate + ' ' : ''}回撤 ${(drawdown * 100).toFixed(1)}%，未超过买入阈值 ${(drawdown_threshold * 100).toFixed(0)}%，不操作`;
    return { action: 'hold', shares: 0, reason: { type: 'info', date: crossDate, drawdown: drawdown * 100, text } };
  }
};