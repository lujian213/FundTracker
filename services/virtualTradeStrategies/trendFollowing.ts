import { VirtualStrategy, VirtualStrategyContext } from '../../types';
import { strategyConfig } from '../strategyConfig';
import { extractDateFromTimestamp } from '../../utils/dateTimeUtils';
import { evaluateStrategyParameter } from '../../utils/strategyParameterEvaluator';

function safeMA(values: number[], window: number, idx: number): number | null {
  if (idx + 1 < window) return null;
  let sum = 0;
  for (let i = idx + 1 - window; i <= idx; i++) sum += values[i];
  return sum / window;
}

export const trendFollowingStrategy: VirtualStrategy = {
  name: strategyConfig.trendFollowing.name,
  description: strategyConfig.trendFollowing.description,
  decide(ctx: VirtualStrategyContext) {
    const hist = ctx.history || [];
    if (!hist || hist.length === 0) return { action: 'hold', shares: 0, reason: { type: 'insufficient', text: '历史数据不足，无法计算均线信号' } };

    // 从配置读取参数
    const cfg = strategyConfig.trendFollowing.params || {};
    const shortWindow = evaluateStrategyParameter(cfg.short_window, ctx);
    const longWindow = evaluateStrategyParameter(cfg.long_window, ctx);
    const baseUnit = evaluateStrategyParameter(cfg.base_unit, ctx);
    const buyRatio = evaluateStrategyParameter(cfg.buy_ratio, ctx);
    const sellRatio = evaluateStrategyParameter(cfg.sell_ratio, ctx);

    // build values array ascending by date
    const values = hist.map(p => p.value);
    const n = values.length;

    const idxYesterday = n - 1;
    const idxPrev = n - 2;
    const maShortYesterday = safeMA(values, shortWindow, idxYesterday);
    const maLongYesterday = safeMA(values, longWindow, idxYesterday);
    const maShortPrev = idxPrev >= 0 ? safeMA(values, shortWindow, idxPrev) : null;
    const maLongPrev = idxPrev >= 0 ? safeMA(values, longWindow, idxPrev) : null;

    if (maShortYesterday === null || maLongYesterday === null || maShortPrev === null || maLongPrev === null) {
      return { action: 'hold', shares: 0, reason: { type: 'insufficient', text: '历史数据不足，无法计算均线信号' } };
    }

    const navToday = values[idxYesterday];

    // Helper: cross date is the date of the 'yesterday' point in ctx.history
    const crossDate = hist[idxYesterday] && typeof hist[idxYesterday].date === 'number' ? extractDateFromTimestamp(hist[idxYesterday].date) ?? undefined : undefined;

    // detect golden cross (buy)
    if (maShortYesterday > maLongYesterday && maShortPrev <= maLongPrev) {
      // buy: use buyRatio of cash, limited by baseUnit
      const maxBuy = Math.floor((ctx.cash / navToday) * 100) / 100;
      const target = Math.floor(((ctx.cash * buyRatio) / navToday) * 100) / 100;
      const desired = Math.min(target, baseUnit);
      const actual = Math.min(desired, maxBuy);
      const text = `${crossDate ? crossDate + ' ' : ''}MA${shortWindow} 上穿 MA${longWindow}，短线金叉，买入 ${actual.toFixed(2)} 份`;
      return {
        action: 'buy',
        shares: Number(actual.toFixed(2)),
        reason: {
          type: 'golden',
          date: crossDate,
          text,
          ma: {
            shortYesterday: Number(maShortYesterday.toFixed(4)),
            shortPrev: Number(maShortPrev!.toFixed(4)),
            longYesterday: Number(maLongYesterday.toFixed(4)),
            longPrev: Number(maLongPrev!.toFixed(4)),
          }
        }
      };
    }

    // detect death cross (sell)
    if (maShortYesterday < maLongYesterday && maShortPrev >= maLongPrev) {
      // sell sellRatio of holdings, limited by baseUnit
      const target = Math.floor((ctx.shares * sellRatio) * 100) / 100;
      const desired = Math.min(target, baseUnit);
      const actual = Math.min(desired, ctx.shares);
      const text = `${crossDate ? crossDate + ' ' : ''}MA${shortWindow} 下穿 MA${longWindow}，出现死叉，卖出 ${actual.toFixed(2)} 份`;
      return {
        action: 'sell',
        shares: Number(actual.toFixed(2)),
        reason: {
          type: 'death',
          date: crossDate,
          text,
          ma: {
            shortYesterday: Number(maShortYesterday.toFixed(4)),
            shortPrev: Number(maShortPrev!.toFixed(4)),
            longYesterday: Number(maLongYesterday.toFixed(4)),
            longPrev: Number(maLongPrev!.toFixed(4)),
          }
        }
      };
    }

    return { action: 'hold', shares: 0, reason: { type: 'info', text: '均线未形成明确金叉或死叉信号，保持观望' } };
  }
};