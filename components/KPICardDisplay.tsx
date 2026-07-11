import React from 'react';
import { KPIResult } from '../types';
import { formatPercent, formatSharePercent } from '../utils/format';
import { getProfitColorClass } from '../utils/calendarCommon';

interface KPICardDisplayProps {
  kpiData: KPIResult | null;
  fundName: string; // 基金名称或"整体组合"
  holdingDays: number; // 持仓天数
}

// 最小持仓天数阈值（小于此值不显示KPI）
const MIN_HOLDING_DAYS = 30;

/**
 * 检查数值是否有效
 */
export function isValidNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

/**
 * 格式化KPI数值
 * @param value 数值（可为null）
 * @param isPercent 是否为百分比
 * @param decimals 小数位数
 * @param hidePlusSign 是否隐藏+号（用于回撤、波动率等指标）
 */
export function formatKPIValue(value: number | null, isPercent: boolean = true, decimals: number = 2, hidePlusSign: boolean = false): string {
  if (!isValidNumber(value)) {
    return 'N/A';
  }
  if (isPercent) {
    if (hidePlusSign) {
      return formatSharePercent(value, decimals);
    }
    return formatPercent(value, decimals);
  }
  // 非百分比数值（如夏普比率、卡玛比率）
  const sign = value > 0 ? '+' : '';
  return sign + value.toFixed(decimals);
}

/**
 * 等级配置项
 */
export interface LevelItem {
  icon: string;
  title: string;
}

/**
 * 根据阈值配置获取等级图标
 * @param value 数值
 * @param thresholds 阈值数组（升序或降序）
 * @param levels 对应的等级配置数组
 * @param compareType 比较类型：'lt' 表示小于阈值（用于波动率、回撤），'gt' 表示大于阈值（用于收益率、夏普比率）
 */
export function getLevelIconByThresholds(
  value: number | null,
  thresholds: number[],
  levels: LevelItem[],
  compareType: 'lt' | 'gt'
): React.ReactNode {
  if (!isValidNumber(value)) {
    return null;
  }

  // 找到匹配的等级索引
  let levelIndex = thresholds.length; // 默认使用最后一个等级（最高或最低）

  if (compareType === 'lt') {
    // 小于阈值：找到第一个大于value的阈值位置
    // 例如：波动率 thresholds=[15,25,35], value=20
    // 20 < 25，所以 levelIndex=1（中等风险）
    // value < thresholds[0] 时，levelIndex=0（最低等级）
    if (value < thresholds[0]) {
      levelIndex = 0;
    } else {
      for (let i = 0; i < thresholds.length; i++) {
        if (value < thresholds[i]) {
          levelIndex = i;
          break;
        }
      }
    }
  } else {
    // 大于阈值：找到value所属的等级区间
    // 例如：夏普比率 thresholds=[0,1,2,3], levels=[🔴,🟡,🟢,🟣,🌟]
    // value=-1.05 < 0 → levelIndex=0 → 🔴（不佳）
    // value=0.5 在[0,1)区间 → levelIndex=1 → 🟡（一般）
    // value=2.5 在[2,3)区间 → levelIndex=3 → 🟣（优秀）
    // value=4 > 3 → levelIndex=4 → 🟣（卓越）
    if (value < thresholds[0]) {
      levelIndex = 0; // 低于最小阈值，使用最低等级
    } else {
      // 找到value所属的区间
      for (let i = thresholds.length - 1; i >= 0; i--) {
        if (value >= thresholds[i]) {
          levelIndex = i + 1;
          break;
        }
      }
    }
  }

  const level = levels[levelIndex];
  if (!level) return null;

  return <span className="ml-1" title={level.title}>{level.icon}</span>;
}

/**
 * 颜色规则类型
 * - profit: 正数红色，负数绿色
 * - risk: 正数绿色（表示风险）
 * - neutral: 灰色（中性指标）
 */
export type ColorRule = 'profit' | 'risk' | 'neutral';

/**
 * 根据颜色规则获取颜色类名
 */
export function getColorClassByRule(value: number | null, rule: ColorRule): string {
  if (!isValidNumber(value)) {
    return 'text-gray-500';
  }

  switch (rule) {
    case 'risk':
      // 风险指标：正值显示绿色（表示有风险）
      return value > 0 ? 'text-green-600' : 'text-gray-800';
    case 'neutral':
      // 中性指标：灰色
      return 'text-gray-800';
    case 'profit':
    default:
      // 收益指标：正数红色，负数绿色
      return getProfitColorClass(value);
  }
}

/**
 * KPI指标配置
 */
interface KPIConfig {
  key: keyof KPIResult;
  name: string;
  description: string;
  isPercent: boolean;
  decimals: number;
  hidePlusSign: boolean;          // 是否隐藏+号
  colorRule: ColorRule;           // 颜色规则
  // 等级图标配置
  levelThresholds: number[];      // 阈值数组
  levelItems: LevelItem[];        // 等级配置数组
  levelCompareType: 'lt' | 'gt';  // 比较类型
}

/**
 * KPI配置数组
 * 新增指标只需在此处添加配置项
 */
const KPI_CONFIGS: KPIConfig[] = [
  {
    key: 'annualizedReturn',
    name: '年化收益率',
    description: '投资期间的年均收益率',
    isPercent: true,
    decimals: 2,
    hidePlusSign: false,
    colorRule: 'profit',
    levelThresholds: [0, 5, 15, 30],
    levelItems: [
      { icon: '🔴', title: '亏损' },
      { icon: '🟡', title: '一般收益' },
      { icon: '🟢', title: '良好收益' },
      { icon: '🟣', title: '优秀收益' },
      { icon: '🌟', title: '卓越收益' },
    ],
    levelCompareType: 'gt',
  },
  {
    key: 'maxDrawdown',
    name: '最大回撤',
    description: '峰值到谷底的最大跌幅',
    isPercent: true,
    decimals: 2,
    hidePlusSign: true,
    colorRule: 'risk',
    levelThresholds: [5, 10, 20],
    levelItems: [
      { icon: '🟢', title: '低风险（回撤小）' },
      { icon: '🟡', title: '中低风险' },
      { icon: '🟠', title: '中等风险' },
      { icon: '🔴', title: '高风险（回撤大）' },
    ],
    levelCompareType: 'lt',
  },
  {
    key: 'volatility',
    name: '收益波动率',
    description: '收益率的标准差',
    isPercent: true,
    decimals: 2,
    hidePlusSign: true,
    colorRule: 'neutral',
    levelThresholds: [15, 25, 35],
    levelItems: [
      { icon: '🟢', title: '低风险' },
      { icon: '🟡', title: '中低风险' },
      { icon: '🟠', title: '中等风险' },
      { icon: '🔴', title: '较高风险' },
    ],
    levelCompareType: 'lt',
  },
  {
    key: 'sharpeRatio',
    name: '夏普比率',
    description: '风险调整后的收益指标',
    isPercent: false,
    decimals: 2,
    hidePlusSign: false,
    colorRule: 'profit',
    levelThresholds: [0, 1, 2, 3],
    levelItems: [
      { icon: '🔴', title: '不佳（不如无风险投资）' },
      { icon: '🟡', title: '一般' },
      { icon: '🟢', title: '良好' },
      { icon: '🟣', title: '优秀' },
      { icon: '🌟', title: '卓越（风险调整收益极佳）' },
    ],
    levelCompareType: 'gt',
  },
  {
    key: 'calmarRatio',
    name: '卡玛比率',
    description: '年化收益与最大回撤的比值',
    isPercent: false,
    decimals: 2,
    hidePlusSign: false,
    colorRule: 'profit',
    levelThresholds: [0, 3, 5, 10],
    levelItems: [
      { icon: '🔴', title: '不佳（亏损策略）' },
      { icon: '🟡', title: '一般' },
      { icon: '🟢', title: '良好' },
      { icon: '🟣', title: '优秀' },
      { icon: '🌟', title: '卓越（回撤控制极佳）' },
    ],
    levelCompareType: 'gt',
  },
];

/**
 * 单个KPI卡片组件
 */
const KPICard: React.FC<{
  config: KPIConfig;
  value: number | null;
}> = ({ config, value }) => {
  const displayValue = formatKPIValue(value, config.isPercent, config.decimals, config.hidePlusSign);
  const colorClass = getColorClassByRule(value, config.colorRule);
  const levelIcon = getLevelIconByThresholds(value, config.levelThresholds, config.levelItems, config.levelCompareType);

  return (
    <div className="bg-white rounded-lg p-3 border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col">
      <div className="text-xs text-gray-500 mb-1">{config.name}</div>
      <div className={`text-lg font-semibold ${colorClass}`}>
        {displayValue}
        {levelIcon}
      </div>
      <div className="text-xs text-gray-400 mt-1 leading-tight">{config.description}</div>
    </div>
  );
};

/**
 * KPI卡片显示组件
 * 显示5个KPI指标卡片：年化收益率、最大回撤、收益波动率、夏普比率、卡玛比率
 */
export const KPICardDisplay: React.FC<KPICardDisplayProps> = ({ kpiData, fundName, holdingDays }) => {
  const isKPIAvailable = holdingDays >= MIN_HOLDING_DAYS;

  return (
    <div className="w-full h-full flex flex-col">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">
          {fundName} - KPI指标
        </h3>
        <span className="text-xs text-gray-400">持仓{holdingDays}天</span>
      </div>

      {/* KPI卡片网格 - 多排显示 */}
      {isKPIAvailable ? (
        <div className="grid grid-cols-3 gap-2 flex-1">
          {KPI_CONFIGS.map((config) => (
            <KPICard
              key={config.key}
              config={config}
              value={kpiData ? kpiData[config.key] : null}
            />
          ))}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 rounded-lg p-4">
          <div className="text-gray-400 mb-2">
            <i className="fas fa-exclamation-circle text-2xl"></i>
          </div>
          <div className="text-sm text-gray-600 text-center">
            <div className="font-medium mb-1">持仓时间过短（{holdingDays}天）</div>
            <div className="text-xs text-gray-400">需至少{MIN_HOLDING_DAYS}天持仓才能计算KPI指标</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KPICardDisplay;