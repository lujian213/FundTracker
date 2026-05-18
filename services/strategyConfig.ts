import { StrategyParams } from '../types';

export interface StrategyMeta {
  key: string;
  name: string;
  description: string;
  params?: StrategyParams;  // 改用新的 StrategyParams 结构
}

export const strategyConfig: Record<string, StrategyMeta> = {
  trendFollowing: {
    key: 'trendFollowing',
    name: '趋势追踪策略（移动平均线金叉死叉）',
    description: `基于技术分析中的趋势跟随理论，认为价格趋势一旦形成将持续一段时间。通过短期均线与长期均线的交叉来识别趋势的启动与反转，在上升趋势中买入持有，在下降趋势中卖出离场。\n\n策略特点:\n\n|维度| 描述 |\n|---|------|\n|✅ 优点| 能捕捉主要趋势，在单边牛市中表现优异 |\n|❌ 缺点| 震荡市场容易反复被"打脸"，产生频繁亏损交易 |\n|📊 适用市场| 单边牛市或单边熊市 |\n|⚠️ 风险等级| 高 |\n|🔄 交易频率| 中等 |\n`,
    params: {
      short_window: { value: 5, type: "number", description: "短期均线天数" },
      long_window: { value: 20, type: "number", description: "长期均线天数" },
      base_unit: {
        value: "${(cash+shares*startNav)/startNav/10}",
        type: "number",
        description: "基础交易单位（份额），每次交易不超过此数量"
      },
      buy_ratio: { value: 0.5, type: "number", description: "买入比例（占现金的比例）" },
      sell_ratio: { value: 0.5, type: "number", description: "卖出比例（占持仓的比例）" }
    }
  },
  meanReversion: {
    key: 'meanReversion',
    name: '均值回归策略（布林带反转）',
    description: `基于统计回归理论，认为价格短期内会围绕均值波动。当价格偏离均值过大时，倾向于回归。布林带提供了衡量偏离程度的量化指标：价格触及上轨视为超买（卖出信号），触及下轨视为超卖（买入信号）。\n\n策略特点：\n\n|维度| 描述 |\n|---|------|\n|✅ 优点| 震荡市表现稳健，实现低买高卖|\n|❌ 缺点| 强单边趋势中容易"逆势死扛"，造成较大亏损 |\n|📊 适用市场| 震荡市、区间整理行情 |\n|⚠️ 风险等级| 中等 |\n|🔄 交易频率| 中高 |\n`,
    params: {
      bb_window: { value: 20, type: "number", description: "布林带计算窗口" },
      num_std: { value: 2, type: "number", description: "标准差倍数" },
      base_unit: {
        value: "${(cash+shares*startNav)/startNav/10}",
        type: "number",
        description: "基础交易单位（份额），每次交易不超过此数量"
      },
      buy_ratio: { value: 0.3, type: "number", description: "买入比例（占现金的比例）" },
      sell_ratio: { value: 0.3, type: "number", description: "卖出比例（占持仓的比例）" }
    }
  },
  constantMix: {
    key: 'constantMix',
    name: '恒定混合策略（股债平衡）',
    description: `源自经典资产配置理论，保持基金仓位占总资产（市值+现金）的固定比例。通过定期再平衡实现机械的"高抛低吸"：当基金上涨导致仓位过高时卖出部分份额，当基金下跌导致仓位过低时买入部分份额。\n\n策略特点：\n\n|维度| 描述 |\n|---|------|\n|✅ 优点| 风险可控，强制止盈止损，符合长期投资理念 |\n|❌ 缺点| 牛市中收益会落后于满仓策略，需要定期触发交易 |\n|📊 适用市场| 所有市场类型，尤其适合波动市场 |\n|⚠️ 风险等级| 低 |\n|🔄 交易频率| 低（仅当偏离超过阈值时触发） |\n`,
    params: {
      target_ratio: { value: 0.5, type: "number", description: "目标仓位比例" },
      rebalance_threshold: { value: 0.05, type: "number", description: "再平衡触发阈值" },
      min_unit: {
        value: 100,
        type: "number",
        description: "最小交易单位（份额），交易份额向下取整到此单位的倍数"
      }
    }
  },
  fixedAmountPyramid: {
    key: 'fixedAmountPyramid',
    name: '固定金额正金字塔买卖策略',
    description: `采用固定金额方式执行金字塔式建仓和平仓操作。当净值下跌时以固定金额买入更多份额，当净值上涨时以固定金额卖出部分份额，帮助投资者在低位积累更多份额，在高位锁定利润。\n\n策略特点：\n\n|维度| 描述 |\n|---|------|\n|✅ 优点| 在下跌中逐步加仓降低成本，在上涨中逐步获利了结 |\n|❌ 缺点| 需要持续监控和资金支持，在持续下跌中可能面临较大回撤 |\n|📊 适用市场| 震荡向上或波动较大的市场 |\n|⚠️ 风险等级| 中等 |\n|🔄 交易频率| 中等 |\n`,
    params: {
      initial_nav: { value: "${startNav}", type: "number", description: "初始净值（用于计算买卖阈值）" },
      down_step: { value: 0.03, type: "number", description: "下跌步长（触发买入的净值跌幅）" },
      up_step: { value: 0.03, type: "number", description: "上涨步长（触发卖出的净值涨幅）" },
      fixed_buy_amount: { value: 10000, type: "number", description: "每次买入的固定金额" },
      fixed_sell_amount: { value: 10000, type: "number", description: "每次卖出的固定金额" },
      max_position: { value: "${(cash+shares*startNav)*2}", type: "number", description: "最大仓位金额（默认为初始总资产的2倍）" },
      min_cash_reserve: { value: 1000, type: "number", description: "最小现金储备" }
    }
  },
  valuationPercentile: {
    key: 'valuationPercentile',
    name: '估值分位数策略',
    description: `基于历史净值分布判断当前估值水平。计算当前净值在过去一段时间内的分位数位置，低分位数表示净值偏低可能被低估，高分位数表示净值偏高可能被高估。\n\n策略特点：\n\n|维度| 描述 |\n|---|------|\n|✅ 优点| 直观易懂，有数据支撑，帮助识别买入时机 |\n|❌ 缺点| 假设净值分布有参考意义，可能不适合成长型基金 |\n|📊 适用市场| 震荡市场、周期性行业基金 |\n|⚠️ 风险等级| 中等 |\n|🔄 交易频率| 低 |\n`,
    params: {
      window_days: { value: 365, type: "number", description: "分位数计算窗口（天数）" },
      low_percentile: { value: 25, type: "number", description: "低分位数阈值（低于此值触发买入）" },
      high_percentile: { value: 75, type: "number", description: "高分位数阈值（高于此值触发卖出）" },
      buy_ratio: { value: 0.1, type: "number", description: "买入比例（占现金的比例）" },
      sell_ratio: { value: 0.1, type: "number", description: "卖出比例（占持仓的比例）" }
    }
  },
  drawdownBuy: {
    key: 'drawdownBuy',
    name: '回撤买入策略',
    description: `在净值从近期高点回撤时逐步买入。当净值从历史高点下跌超过一定比例时触发买入信号，帮助投资者在下跌过程中积累筹码，等待反弹获利。\n\n策略特点：\n\n|维度| 描述 |\n|---|------|\n|✅ 优点| 符合"跌了买"直觉，适合震荡行情建仓 |\n|❌ 缺点| 持续下跌时会持续买入，需要充足资金支持 |\n|📊 适用市场| 震荡市场、有反弹预期的下跌行情 |\n|⚠️ 风险等级| 中高 |\n|🔄 交易频率| 中 |\n`,
    params: {
      drawdown_threshold: { value: 0.10, type: "number", description: "回撤阈值（回撤超过此比例触发买入）" },
      recovery_threshold: { value: 0.05, type: "number", description: "恢复阈值（回撤低于此比例停止买入）" },
      buy_ratio: { value: 0.15, type: "number", description: "买入比例（占现金的比例）" }
    }
  }
};

// Default virtual cash used by virtual trade UI when falling back to cash-based calculation
export const defaultVirtualCash = 100000;
