import { VirtualStrategy, VirtualStrategyContext } from '../../types';
import { strategyConfig } from '../strategyConfig';

function toLocalDateKeyFromTimestamp(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function floorToUnit(value: number, unit: number): number {
  if (!unit || unit <= 0) return Math.floor(value * 100) / 100; // keep 2dp
  const mul = Math.floor(value / unit);
  return Math.floor(mul * unit * 100) / 100;
}

export const constantMixStrategy: VirtualStrategy = {
  name: strategyConfig.constantMix.name,
  description: strategyConfig.constantMix.description,
  decide(ctx: VirtualStrategyContext) {
    const hist = ctx.history || [];
    if (!hist || hist.length === 0) return { action: 'hold', shares: 0, reason: { type: 'insufficient', text: '历史数据不足，无法计算当前净值' } };

    const last = hist[hist.length - 1];
    const nav = last.value;
    if (!nav || nav <= 0) return { action: 'hold', shares: 0, reason: { type: 'insufficient', text: '最近净值不可用' } };

    // config defaults
    const cfg = strategyConfig.constantMix.params || {};
    const target_ratio: number = typeof cfg.target_ratio === 'number' ? cfg.target_ratio : 0.5;
    const rebalance_threshold: number = typeof cfg.rebalance_threshold === 'number' ? cfg.rebalance_threshold : 0.05;

    // min unit preference: strategy config min_unit or engine-provided baseUnit
    let min_unit: number | null = null;
    if (cfg.min_unit && typeof cfg.min_unit === 'number') min_unit = cfg.min_unit as number;
    // fall back to engine baseUnit
    if (!min_unit) min_unit = ctx.baseUnit || 1;

    const cash = ctx.cash;
    const shares = ctx.shares;

    const holdingValue = shares * nav;
    const total = cash + holdingValue;
    if (total <= 0) return { action: 'hold', shares: 0, reason: { type: 'insufficient', text: '总资产为 0，无法再平衡' } };

    const current_ratio = holdingValue / total;
    const deviation = Math.abs(current_ratio - target_ratio);

    const crossDate = last && typeof last.date === 'number' ? toLocalDateKeyFromTimestamp(last.date) : undefined;

    if (deviation <= rebalance_threshold) {
      return { action: 'hold', shares: 0, reason: { type: 'info', text: `${crossDate ? crossDate + ' ' : ''}当前仓位 ${ (current_ratio*100).toFixed(2) }% 与目标仓位 ${(target_ratio*100).toFixed(2)}% 偏离 ${ (deviation*100).toFixed(2) }%，未超过阈值` } };
    }

    // compute target shares
    const targetHoldingValue = total * target_ratio;
    const targetShares = targetHoldingValue / nav;

    // theoretical delta (positive -> buy, negative -> sell)
    const delta = targetShares - shares;

    if (delta > 0) {
      // need buy
      const maxBuyByCash = Math.floor((cash / nav) * 100) / 100;
      let desired = delta;
      // clamp by cash
      desired = Math.min(desired, maxBuyByCash);
      // floor to min_unit multiples
      const unit = min_unit as number;
      let actual = floorToUnit(desired, unit);
      // ensure non-negative and not exceed cash
      if (actual <= 0) return { action: 'hold', shares: 0, reason: { type: 'info', text: `${crossDate ? crossDate + ' ' : ''}计算到的买入份额小于最小交易单位` } };

      const text = `${crossDate ? crossDate + ' ' : ''}当前仓位 ${(current_ratio*100).toFixed(2)}% 低于目标 ${(target_ratio*100).toFixed(2)}%，买入 ${actual.toFixed(2)} 份以再平衡`;
      return { action: 'buy', shares: Number(actual.toFixed(2)), reason: { type: 'other', date: crossDate, text } };
    } else if (delta < 0) {
      // need sell
      let desired = Math.abs(delta);
      desired = Math.min(desired, shares);
      const unit = min_unit as number;
      let actual = floorToUnit(desired, unit);
      if (actual <= 0) return { action: 'hold', shares: 0, reason: { type: 'info', text: `${crossDate ? crossDate + ' ' : ''}计算到的卖出份额小于最小交易单位` } };

      const text = `${crossDate ? crossDate + ' ' : ''}当前仓位 ${(current_ratio*100).toFixed(2)}% 高于目标 ${(target_ratio*100).toFixed(2)}%，卖出 ${actual.toFixed(2)} 份以再平衡`;
      return { action: 'sell', shares: Number(actual.toFixed(2)), reason: { type: 'other', date: crossDate, text } };
    }

    return { action: 'hold', shares: 0, reason: { type: 'info', text: '无需要再平衡的动作' } };
  }
};

