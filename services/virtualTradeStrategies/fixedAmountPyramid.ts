import { VirtualStrategy, VirtualStrategyContext, StrategyReason } from '../../types';
import { strategyConfig } from '../strategyConfig';
import { getEffectiveStrategyParams } from '../strategyConfigService';
import { evaluateStrategyParameter } from '../../utils/strategyParameterEvaluator';
import { extractDateFromTimestamp } from '../../utils/dateTimeUtils';

// Helper function to safely calculate amounts and shares
function calculateSharesFromFixedAmount(amount: number, nav: number): number {
  return Math.floor(amount / nav * 100) / 100; // Round to 2 decimal places
}

export const fixedAmountPyramidStrategy: VirtualStrategy = {
  name: strategyConfig.fixedAmountPyramid.name,
  description: strategyConfig.fixedAmountPyramid.description,
  decide(ctx: VirtualStrategyContext) {
    // 从配置读取参数（合合默认值与用户值）
    // 所有参数在 strategyConfig 中声明为 number 类型，运行时转换确保为数字
    const params = getEffectiveStrategyParams('fixedAmountPyramid');
    const downStep = evaluateStrategyParameter(params.down_step, ctx) as number;
    const upStep = evaluateStrategyParameter(params.up_step, ctx) as number;
    const fixedBuyAmount = evaluateStrategyParameter(params.fixed_buy_amount, ctx) as number;
    const fixedSellAmount = evaluateStrategyParameter(params.fixed_sell_amount, ctx) as number;
    const maxPosition = evaluateStrategyParameter(params.max_position, ctx) as number;
    const minCashReserve = evaluateStrategyParameter(params.min_cash_reserve, ctx) as number;

    // Current NAV is the most recent value from history, or startNav if no history
    const current_nav = ctx.history.length > 0 ? ctx.history[ctx.history.length - 1].value : ctx.startNav;

    // Find the last buy and sell reference points from transaction history
    let lastBuyReferencePrice: number | null = null;
    let lastSellReferencePrice: number | null = null;

    // Process transaction history to determine reference prices
    if (ctx.transactionHistory && ctx.transactionHistory.length > 0) {
      // Iterate through transaction history in reverse order to find the most recent reference prices
      for (let i = ctx.transactionHistory.length - 1; i >= 0; i--) {
        const tx = ctx.transactionHistory[i];

        if (tx.action === 'buy' && lastBuyReferencePrice === null) {
          // Last buy sets the reference for next sell threshold
          lastBuyReferencePrice = tx.nav;
        } else if (tx.action === 'sell' && lastSellReferencePrice === null) {
          // Last sell sets the reference for next buy threshold
          lastSellReferencePrice = tx.nav;
        }

        // Break if we've found both references
        if (lastBuyReferencePrice !== null && lastSellReferencePrice !== null) {
          break;
        }
      }
    }

    // If we don't have transaction history, use startNav as initial reference points
    if (lastBuyReferencePrice === null) {
      // Use startNav as the initial reference for consistency with user's start date
      lastBuyReferencePrice = ctx.startNav;
    }
    if (lastSellReferencePrice === null) {
      // Use startNav as the initial reference for consistency with user's start date
      lastSellReferencePrice = ctx.startNav;
    }

    // Calculate trigger thresholds based on reference prices
    const buy_threshold = lastBuyReferencePrice * (1 - downStep);
    const sell_threshold = lastSellReferencePrice * (1 + upStep);

    // Determine trigger conditions
    const buy_triggered = current_nav <= buy_threshold;
    const sell_triggered = current_nav >= sell_threshold;

    // Handle trigger prioritization
    if (buy_triggered && sell_triggered) {
      // Both triggers are active - prioritize buy as specified in the requirements
      // Calculate how many shares we'd buy with fixed amount
      const shares_to_buy = calculateSharesFromFixedAmount(fixedBuyAmount, current_nav);

      // Check constraints: cash and position limits
      const required_cash = fixedBuyAmount;
      const remaining_cash_after_reserve = ctx.cash - minCashReserve;

      if (required_cash <= remaining_cash_after_reserve) {
        // We have enough cash to buy
        const new_position_value = (ctx.shares + shares_to_buy) * current_nav;

        if (new_position_value <= maxPosition) {
          // All constraints satisfied
          const reason: StrategyReason = {
            type: 'other',
            text: `净值${current_nav.toFixed(4)}同时跌破买入阈值${buy_threshold.toFixed(4)}和突破卖出阈值${sell_threshold.toFixed(4)}，根据策略优先买入固定金额${fixedBuyAmount.toFixed(2)}元，约${shares_to_buy.toFixed(2)}份（最大仓位:${maxPosition.toFixed(2)}元）`,
            date: ctx.history.length > 0 ? extractDateFromTimestamp(ctx.history[ctx.history.length - 1].date) ?? undefined : undefined
          };
          return {
            action: 'buy',
            shares: shares_to_buy,
            reason
          };
        } else {
          // Position limit reached, calculate maximum shares we can buy
          const remaining_position_room = maxPosition - (ctx.shares * current_nav);
          if (remaining_position_room > 0) {
            const max_buyable_amount = Math.min(fixedBuyAmount, remaining_position_room);
            const adjusted_shares = calculateSharesFromFixedAmount(max_buyable_amount, current_nav);

            const reason: StrategyReason = {
              type: 'other',
              text: `净值${current_nav.toFixed(4)}同时跌破买入阈值${buy_threshold.toFixed(4)}和突破卖出阈值${sell_threshold.toFixed(4)}，优先买入但受仓位限制，买入调整后金额${max_buyable_amount.toFixed(2)}元，约${adjusted_shares.toFixed(2)}份（最大仓位:${maxPosition.toFixed(2)}元）`,
              date: ctx.history.length > 0 ? extractDateFromTimestamp(ctx.history[ctx.history.length - 1].date) ?? undefined : undefined
            };
            return {
              action: 'buy',
              shares: adjusted_shares,
              reason
            };
          } else {
            // Cannot buy due to position limit, try selling instead
            const shares_to_sell = calculateSharesFromFixedAmount(fixedSellAmount, current_nav);
            const actual_shares_to_sell = Math.min(shares_to_sell, ctx.shares);

            if (actual_shares_to_sell > 0) {
              const reason: StrategyReason = {
                type: 'other',
                text: `净值${current_nav.toFixed(4)}同时跌破买入阈值${buy_threshold.toFixed(4)}和突破卖出阈值${sell_threshold.toFixed(4)}，买入受限，改为卖出固定金额${fixedSellAmount.toFixed(2)}元，约${actual_shares_to_sell.toFixed(2)}份`,
                date: ctx.history.length > 0 ? extractDateFromTimestamp(ctx.history[ctx.history.length - 1].date) ?? undefined : undefined
              };
              return {
                action: 'sell',
                shares: actual_shares_to_sell,
                reason
              };
            } else {
              const reason: StrategyReason = {
                type: 'info',
                text: `净值${current_nav.toFixed(4)}同时触达买入和卖出阈值，但受各种限制无法执行任何操作`
              };
              return {
                action: 'hold',
                shares: 0,
                reason
              };
            }
          }
        }
      } else {
        // Cash insufficient, calculate how much we can afford
        if (remaining_cash_after_reserve > 0) {
          const affordable_amount = remaining_cash_after_reserve;
          const adjusted_shares = calculateSharesFromFixedAmount(affordable_amount, current_nav);

          const reason: StrategyReason = {
            type: 'other',
            text: `净值${current_nav.toFixed(4)}同时跌破买入阈值${buy_threshold.toFixed(4)}和突破卖出阈值${sell_threshold.toFixed(4)}，优先买入但资金限制，买入调整后金额${affordable_amount.toFixed(2)}元，约${adjusted_shares.toFixed(2)}份`,
            date: ctx.history.length > 0 ? extractDateFromTimestamp(ctx.history[ctx.history.length - 1].date) ?? undefined : undefined
          };
          return {
            action: 'buy',
            shares: adjusted_shares,
            reason
          };
        } else {
          // No cash available for purchase
          const reason: StrategyReason = {
            type: 'info',
            text: `净值${current_nav.toFixed(4)}同时触达买入和卖出阈值，但资金不足以执行买入`
          };
          return {
            action: 'hold',
            shares: 0,
            reason
          };
        }
      }
    } else if (buy_triggered) {
      // Only buy trigger is active
      const shares_to_buy = calculateSharesFromFixedAmount(fixedBuyAmount, current_nav);

      // Check cash constraint
      const required_cash = fixedBuyAmount;
      const remaining_cash_after_reserve = ctx.cash - minCashReserve;

      if (required_cash <= remaining_cash_after_reserve) {
        // Check position constraint
        const new_position_value = (ctx.shares + shares_to_buy) * current_nav;

        if (new_position_value <= maxPosition) {
          // All constraints satisfied
          const reason: StrategyReason = {
            type: 'other',
            text: `净值${current_nav.toFixed(4)}跌破买入阈值${buy_threshold.toFixed(4)}，买入固定金额${fixedBuyAmount.toFixed(2)}元，约${shares_to_buy.toFixed(2)}份（最大仓位:${maxPosition.toFixed(2)}元）`,
            date: ctx.history.length > 0 ? extractDateFromTimestamp(ctx.history[ctx.history.length - 1].date) ?? undefined : undefined
          };
          return {
            action: 'buy',
            shares: shares_to_buy,
            reason
          };
        } else {
          // Position limit reached, calculate maximum shares we can buy
          const remaining_position_room = maxPosition - (ctx.shares * current_nav);
          if (remaining_position_room > 0) {
            const max_buyable_amount = Math.min(fixedBuyAmount, remaining_position_room);
            const adjusted_shares = calculateSharesFromFixedAmount(max_buyable_amount, current_nav);

            const reason: StrategyReason = {
              type: 'other',
              text: `净值${current_nav.toFixed(4)}跌破买入阈值${buy_threshold.toFixed(4)}，买入但受仓位限制，实际买入${max_buyable_amount.toFixed(2)}元，约${adjusted_shares.toFixed(2)}份（最大仓位:${maxPosition.toFixed(2)}元）`,
              date: ctx.history.length > 0 ? extractDateFromTimestamp(ctx.history[ctx.history.length - 1].date) ?? undefined : undefined
            };
            return {
              action: 'buy',
              shares: adjusted_shares,
              reason
            };
          } else {
            // Position limit reached, cannot buy
            const reason: StrategyReason = {
              type: 'info',
              text: `净值${current_nav.toFixed(4)}跌破买入阈值${buy_threshold.toFixed(4)}但已达最大仓位限制（最大仓位:${maxPosition.toFixed(2)}元）`
            };
            return {
              action: 'hold',
              shares: 0,
              reason
            };
          }
        }
      } else {
        // Cash constraint: calculate how much we can afford
        if (remaining_cash_after_reserve > 0) {
          const affordable_amount = remaining_cash_after_reserve;
          const adjusted_shares = calculateSharesFromFixedAmount(affordable_amount, current_nav);

          const reason: StrategyReason = {
            type: 'other',
            text: `净值${current_nav.toFixed(4)}跌破买入阈值${buy_threshold.toFixed(4)}，因资金限制买入调整后金额${affordable_amount.toFixed(2)}元，约${adjusted_shares.toFixed(2)}份`,
            date: ctx.history.length > 0 ? extractDateFromTimestamp(ctx.history[ctx.history.length - 1].date) ?? undefined : undefined
          };
          return {
            action: 'buy',
            shares: adjusted_shares,
            reason
          };
        } else {
          // Not enough cash even above the minimum reserve
          const reason: StrategyReason = {
            type: 'info',
            text: `净值${current_nav.toFixed(4)}跌破买入阈值${buy_threshold.toFixed(4)}但现金不足无法买入`
          };
          return {
            action: 'hold',
            shares: 0,
            reason
          };
        }
      }
    } else if (sell_triggered) {
      // Only sell trigger is active
      const shares_to_sell = calculateSharesFromFixedAmount(fixedSellAmount, current_nav);
      const actual_shares_to_sell = Math.min(shares_to_sell, ctx.shares); // Cannot sell more than we own

      if (actual_shares_to_sell > 0) {
        const reason: StrategyReason = {
          type: 'other',
          text: `净值${current_nav.toFixed(4)}突破卖出阈值${sell_threshold.toFixed(4)}，卖出固定金额${fixedSellAmount.toFixed(2)}元，约${actual_shares_to_sell.toFixed(2)}份`,
          date: ctx.history.length > 0 ? extractDateFromTimestamp(ctx.history[ctx.history.length - 1].date) ?? undefined : undefined
        };
        return {
          action: 'sell',
          shares: actual_shares_to_sell,
          reason
        };
      } else {
        // Cannot sell because we have 0 shares
        const reason: StrategyReason = {
          type: 'info',
          text: `净值${current_nav.toFixed(4)}突破卖出阈值${sell_threshold.toFixed(4)}但无持仓可卖`
        };
        return {
          action: 'hold',
          shares: 0,
          reason
        };
      }
    } else {
      // No triggers activated
      const reason: StrategyReason = {
        type: 'info',
        text: `净值${current_nav.toFixed(4)}未触达买卖阈值（买入阈值:${buy_threshold.toFixed(4)}，卖出阈值:${sell_threshold.toFixed(4)})，继续观望`
      };
      return {
        action: 'hold',
        shares: 0,
        reason
      };
    }
  }
};