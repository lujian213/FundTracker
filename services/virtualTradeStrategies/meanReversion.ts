import { VirtualStrategy, VirtualStrategyContext } from '../../types';
import { strategyConfig } from '../strategyConfig';
import { extractDateFromTimestamp } from '../../utils/dateTimeUtils';
import { evaluateStrategyParameter } from '../../utils/strategyParameterEvaluator';

function safeMean(values: number[], window: number, idx: number): number | null {
  if (idx + 1 < window) return null;
  let sum = 0;
  for (let i = idx + 1 - window; i <= idx; i++) sum += values[i];
  return sum / window;
}

function safeStd(values: number[], window: number, idx: number): number | null {
  if (idx + 1 < window) return null;
  const mean = safeMean(values, window, idx)!;
  let sumSq = 0;
  for (let i = idx + 1 - window; i <= idx; i++) {
    const d = values[i] - mean;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / window);
}

export const meanReversionStrategy: VirtualStrategy = {
  name: strategyConfig.meanReversion.name,
  description: strategyConfig.meanReversion.description,
  decide(ctx: VirtualStrategyContext) {
    const hist = ctx.history || [];
    if (!hist || hist.length === 0) return { action: 'hold', shares: 0, reason: { type: 'insufficient', text: '历史数据不足，无法计算布林带' } };

    // 从配置读取参数
    const cfg = strategyConfig.meanReversion.params || {};
    const bbWindow = evaluateStrategyParameter(cfg.bb_window, ctx);
    const numStd = evaluateStrategyParameter(cfg.num_std, ctx);
    const baseUnit = evaluateStrategyParameter(cfg.base_unit, ctx);
    const buyRatio = evaluateStrategyParameter(cfg.buy_ratio, ctx);
    const sellRatio = evaluateStrategyParameter(cfg.sell_ratio, ctx);

    const values = hist.map(p => p.value);
    const n = values.length;
    const idx = n - 1; // last available point (yesterday)

    const middle = safeMean(values, bbWindow, idx);
    const std = safeStd(values, bbWindow, idx);

    if (middle === null || std === null) {
      return { action: 'hold', shares: 0, reason: { type: 'insufficient', text: '历史数据不足，无法计算布林带' } };
    }

    const upper = middle + numStd * std;
    const lower = middle - numStd * std;

    const nav = values[idx];
    const crossDate = hist[idx] && typeof hist[idx].date === 'number' ? extractDateFromTimestamp(hist[idx].date) ?? undefined : undefined;

    // buy if below lower
    if (nav < lower) {
      const maxBuy = Math.floor((ctx.cash / nav) * 100) / 100;
      const target = Math.floor(((ctx.cash * buyRatio) / nav) * 100) / 100;
      const desired = Math.min(target, baseUnit);
      const actual = Math.min(desired, maxBuy);
      const text = `${crossDate ? crossDate + ' ' : ''}净值 ${nav.toFixed(4)} 低于下轨 ${lower.toFixed(4)}，触及超卖区，保守买入 ${actual.toFixed(2)} 份`;
      return {
        action: 'buy',
        shares: Number(actual.toFixed(2)),
        reason: {
          type: 'other',
          date: crossDate,
          text,
        }
      };
    }

    // sell if above upper
    if (nav > upper) {
      const target = Math.floor((ctx.shares * sellRatio) * 100) / 100;
      const desired = Math.min(target, baseUnit);
      const actual = Math.min(desired, ctx.shares);
      const text = `${crossDate ? crossDate + ' ' : ''}净值 ${nav.toFixed(4)} 高于上轨 ${upper.toFixed(4)}，触及超买区，卖出 ${actual.toFixed(2)} 份`;
      return {
        action: 'sell',
        shares: Number(actual.toFixed(2)),
        reason: {
          type: 'other',
          date: crossDate,
          text,
        }
      };
    }

    return { action: 'hold', shares: 0, reason: { type: 'info', text: '价格在布林带中轨范围内，保持观望' } };
  }
};