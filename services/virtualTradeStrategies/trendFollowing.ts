import { VirtualStrategy, VirtualStrategyContext } from '../../types';
import { strategyConfig } from '../strategyConfig';

function safeMA(values: number[], window: number, idx: number): number | null {
  if (idx + 1 < window) return null;
  let sum = 0;
  for (let i = idx + 1 - window; i <= idx; i++) sum += values[i];
  return sum / window;
}

function toLocalDateKeyFromTimestamp(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const trendFollowingStrategy: VirtualStrategy = {
  name: strategyConfig.trendFollowing.name,
  description: strategyConfig.trendFollowing.description,
  decide(ctx: VirtualStrategyContext) {
    const hist = ctx.history || [];
    if (!hist || hist.length === 0) return { action: 'hold', shares: 0, reason: { type: 'insufficient', text: '历史数据不足，无法计算均线信号' } };

    // build values array ascending by date
    const values = hist.map(p => p.value);
    const n = values.length;
    // we need yesterday and today; strategy receives history up-to-prev-day for deciding x-day action
    // So the last element of hist represents yesterday's NAV
    // Compute MA_short (5) and MA_long (20) for yesterday and the day before yesterday
    const short = 5;
    const long = 20;

    const idxYesterday = n - 1;
    const idxPrev = n - 2;
    const maShortYesterday = safeMA(values, short, idxYesterday);
    const maLongYesterday = safeMA(values, long, idxYesterday);
    const maShortPrev = idxPrev >= 0 ? safeMA(values, short, idxPrev) : null;
    const maLongPrev = idxPrev >= 0 ? safeMA(values, long, idxPrev) : null;

    if (maShortYesterday === null || maLongYesterday === null || maShortPrev === null || maLongPrev === null) {
      return { action: 'hold', shares: 0, reason: { type: 'insufficient', text: '历史数据不足，无法计算均线信号' } };
    }

    const navToday = values[idxYesterday];

    // Helper: cross date is the date of the 'yesterday' point in ctx.history
    const crossDate = hist[idxYesterday] && typeof hist[idxYesterday].date === 'number' ? toLocalDateKeyFromTimestamp(hist[idxYesterday].date) : undefined;

    // detect golden cross (buy)
    if (maShortYesterday > maLongYesterday && maShortPrev <= maLongPrev) {
      // buy: use 50% cash, limited by baseUnit
      const maxBuy = Math.floor((ctx.cash / navToday) * 100) / 100;
      const target = Math.floor(((ctx.cash * 0.5) / navToday) * 100) / 100;
      const base = ctx.baseUnit || 1;
      const desired = Math.min(target, base);
      const actual = Math.min(desired, maxBuy);
      const text = `${crossDate ? crossDate + ' ' : ''}MA${short} 上穿 MA${long}，短线金叉，买入 ${actual.toFixed(2)} 份`;
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
      // sell 50% holdings, limited by baseUnit
      const target = Math.floor((ctx.shares * 0.5) * 100) / 100;
      const base = ctx.baseUnit || 1;
      const desired = Math.min(target, base);
      const actual = Math.min(desired, ctx.shares);
      const text = `${crossDate ? crossDate + ' ' : ''}MA${short} 下穿 MA${long}，出现死叉，卖出 ${actual.toFixed(2)} 份`;
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
