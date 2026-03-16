export interface StrategyMeta {
  key: string;
  name: string;
  description: string;
  params?: Record<string, any>;
}

export const strategyConfig: Record<string, StrategyMeta> = {
  trendFollowing: {
    key: 'trendFollowing',
    name: '趋势追踪策略（移动平均线金叉死叉）',
    description: `基于技术分析中的趋势跟随理论，认为价格趋势一旦形成将持续一段时间。通过短期均线与长期均线的交叉来识别趋势的启动与反转，在上升趋势中买入持有，在下降趋势中卖出离场。\n\n策略特点:\n\n|维度| 描述 |\n|---|------|\n|✅ 优点| 能捕捉主要趋势，在单边牛市中表现优异 |\n|❌ 缺点| 震荡市场容易反复被"打脸"，产生频繁亏损交易 |\n|📊 适用市场| 单边牛市或单边熊市 |\n|⚠️ 风险等级| 高 |\n|🔄 交易频率| 中等 |\n`,
    params: {
      short_window: 5,
      long_window: 20,
      base_unit: 'initialTotal/startNav/10'
    }
  },
  meanReversion: {
    key: 'meanReversion',
    name: '均值回归策略（布林带反转）',
    description: `基于统计回归理论，认为价格短期内会围绕均值波动。当价格偏离均值过大时，倾向于回归。布林带提供了衡量偏离程度的量化指标：价格触及上轨视为超买（卖出信号），触及下轨视为超卖（买入信号）。\n\n策略特点：\n\n|维度| 描述 |\n|---|------|\n|✅ 优点| 震荡市表现稳健，实现低买高卖|\n|❌ 缺点| 强单边趋势中容易"逆势死扛"，造成较大亏损 |\n|📊 适用市场| 震荡市、区间整理行情 |\n|⚠️ 风险等级| 中等 |\n|🔄 交易频率| 中高 |\n`,
    params: {
      bb_window: 20,
      num_std: 2,
      base_unit: 'initialTotal/startNav/10'
    }
  },
  constantMix: {
    key: 'constantMix',
    name: '恒定混合策略（股债平衡）',
    description: `源自经典资产配置理论，保持基金仓位占总资产（市值+现金）的固定比例。通过定期再平衡实现机械的"高抛低吸"：当基金上涨导致仓位过高时卖出部分份额，当基金下跌导致仓位过低时买入部分份额。\n\n策略特点：\n\n|维度| 描述 |\n|---|------|\n|✅ 优点| 风险可控，强制止盈止损，符合长期投资理念 |\n|❌ 缺点| 牛市中收益会落后于满仓策略，需要定期触发交易 |\n|📊 适用市场| 所有市场类型，尤其适合波动市场 |\n|⚠️ 风险等级| 低 |\n|🔄 交易频率| 低（仅当偏离超过阈值时触发） |\n`,
    params: {
      target_ratio: 0.5,
      rebalance_threshold: 0.05,
      min_unit: 'initialTotal/startNav/10'
    }
  },
  fixedAmountPyramid: {
    key: 'fixedAmountPyramid',
    name: '固定金额正金字塔买卖策略',
    description: `采用固定金额方式执行金字塔式建仓和平仓操作。当净值下跌时以固定金额买入更多份额，当净值上涨时以固定金额卖出部分份额，帮助投资者在低位积累更多份额，在高位锁定利润。\n\n策略特点：\n\n|维度| 描述 |\n|---|------|\n|✅ 优点| 在下跌中逐步加仓降低成本，在上涨中逐步获利了结 |\n|❌ 缺点| 需要持续监控和资金支持，在持续下跌中可能面临较大回撤 |\n|📊 适用市场| 震荡向上或波动较大的市场 |\n|⚠️ 风险等级| 中等 |\n|🔄 交易频率| 中等 |\n`,
    params: {
      initial_nav: '${fundConfig.initialPrice || 1.0}',
      down_step: 0.03,
      up_step: 0.03,
      fixed_buy_amount: 10000,
      fixed_sell_amount: 10000,
      max_position: '${fundConfig.maxPosition || 100000}',
      min_cash_reserve: '${userConfig.minCashReserve || 1000}'
    }
  }
};

// Default virtual cash used by virtual trade UI when falling back to cash-based calculation
export const defaultVirtualCash = 100000;
