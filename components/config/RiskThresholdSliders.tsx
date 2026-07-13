import React, { useState, useRef, useEffect } from 'react';
import { RiskThresholds } from '../../types';

interface MultiSliderProps {
  values: number[];
  labels: string[];
  colors: string[];
  min: number;
  max: number;
  unit: string;
  onChange: (index: number, value: number) => void;
  valueDisplayMode?: 'inline' | 'below';  // inline: 像OCR滑块一样在右侧显示单值；below: 在下方显示所有值
}

/**
 * 多滑块Slider组件
 * 支持多个可拖动的滑块点，每个点代表一个阈值级别
 * 样式与原生range滑块保持一致
 */
const MultiSlider: React.FC<MultiSliderProps> = ({
  values,
  labels,
  colors,
  min,
  max,
  unit,
  onChange,
  valueDisplayMode = 'below',
}) => {
  const sliderRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  // 将值转换为百分比位置
  const valueToPercent = (value: number) => ((value - min) / (max - min)) * 100;

  // 将百分比转换为值
  const percentToValue = (percent: number) => Math.round(min + (percent / 100) * (max - min));

  // 处理鼠标按下
  const handleMouseDown = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(index);
  };

  // 处理鼠标移动
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragging === null || !sliderRef.current) return;

      const rect = sliderRef.current.getBoundingClientRect();
      const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      let newValue = percentToValue(percent);

      // 确保值不超过相邻滑块
      if (dragging > 0) {
        newValue = Math.max(values[dragging - 1] + 1, newValue);
      }
      if (dragging < values.length - 1) {
        newValue = Math.min(values[dragging + 1] - 1, newValue);
      }

      onChange(dragging, newValue);
    };

    const handleMouseUp = () => {
      setDragging(null);
    };

    if (dragging !== null) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, values, min, max, onChange]);

  // 处理触摸事件
  useEffect(() => {
    const handleTouchMove = (e: TouchEvent) => {
      if (dragging === null || !sliderRef.current) return;

      const touch = e.touches[0];
      const rect = sliderRef.current.getBoundingClientRect();
      const percent = Math.max(0, Math.min(100, ((touch.clientX - rect.left) / rect.width) * 100));
      let newValue = percentToValue(percent);

      if (dragging > 0) {
        newValue = Math.max(values[dragging - 1] + 1, newValue);
      }
      if (dragging < values.length - 1) {
        newValue = Math.min(values[dragging + 1] - 1, newValue);
      }

      onChange(dragging, newValue);
    };

    const handleTouchEnd = () => {
      setDragging(null);
    };

    if (dragging !== null) {
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [dragging, values, min, max, onChange]);

  return (
    <div className="relative">
      {/* 滑块区域 - 与原生range滑块样式一致 */}
      <div className="flex items-center gap-4">
        <div
          ref={sliderRef}
          className="w-full h-2 bg-gray-200 rounded-lg relative cursor-pointer"
        >
          {/* 已填充区域 */}
          <div className="absolute inset-0 rounded-lg overflow-hidden">
            {values.map((value, index) => (
              <div
                key={index}
                className="absolute top-0 bottom-0"
                style={{
                  left: index === 0 ? '0%' : `${valueToPercent(values[index - 1])}%`,
                  right: `${100 - valueToPercent(value)}%`,
                  backgroundColor: colors[index],
                }}
              />
            ))}
          </div>

          {/* 滑块点 */}
          {values.map((value, index) => (
            <div
              key={index}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full shadow-md cursor-grab active:cursor-grabbing transition-transform"
              style={{
                left: `${valueToPercent(value)}%`,
                backgroundColor: colors[index],
                border: '2px solid white',
                zIndex: dragging === index ? 10 : 1,
                transform: dragging === index ? 'translate(-50%, -50%) scale(1.2)' : 'translate(-50%, -50%)',
              }}
              onMouseDown={(e) => handleMouseDown(index, e)}
              onTouchStart={(e) => {
                e.preventDefault();
                setDragging(index);
              }}
            />
          ))}
        </div>

        {/* inline模式: 在右侧显示当前值（单滑块时使用） */}
        {valueDisplayMode === 'inline' && values.length === 1 && (
          <span className="text-sm text-gray-600 w-12">{values[0]}{unit}</span>
        )}
      </div>

      {/* 刻度标记 */}
      <div className="flex justify-between text-xs text-gray-400 mt-2">
        <span>{min}{unit}</span>
        <span>{Math.round((min + max) / 2)}{unit}</span>
        <span>{max}{unit}</span>
      </div>

      {/* below模式: 在下方显示所有值 */}
      {valueDisplayMode === 'below' && (
        <div className="flex gap-4 mt-2">
          {values.map((value, index) => (
            <div key={index} className="flex items-center gap-1">
              {values.length > 1 && (
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: colors[index] }}
                />
              )}
              <span className="text-xs text-gray-600">
                {labels[index]}: {value}{unit}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface RiskThresholdSliderProps {
  riskThresholds: RiskThresholds;
  onChange: (thresholds: RiskThresholds) => void;
}

/** 风险阈值配置项 */
const RISK_THRESHOLD_CONFIGS = [
  {
    key: 'drawdown',
    label: '回撤预警阈值',
    description: '当累计盈利从峰值下跌超过阈值时触发预警。轻度预警提示关注，重度预警建议采取行动。',
  },
  {
    key: 'volatility',
    label: '波动率阈值',
    description: '年化波动率超过高波动阈值时视为高风险。低波动阈值以下为稳定区间。',
  },
  {
    key: 'continuousDecline',
    label: '连续下跌阈值',
    description: '连续下跌天数超过阈值时触发预警。轻度关注提示观察，高度关注建议分析原因。',
  },
  {
    key: 'concentration',
    label: '集中度阈值',
    description: '持仓集中度过高会增加风险。单基金占比超过上限或前三基金合计超过上限时触发预警。',
  },
];

/**
 * 风险阈值滑块组
 * 每个配置项带有小问号 hovertip，与运行参数样式保持一致
 */
export { MultiSlider };
export const RiskThresholdSliders: React.FC<RiskThresholdSliderProps> = ({
  riskThresholds,
  onChange,
}) => {
  // 回撤预警阈值
  const handleDrawdownChange = (index: number, value: number) => {
    const newThresholds = { ...riskThresholds };
    if (index === 0) {
      newThresholds.drawdown.low = value;
    } else if (index === 1) {
      newThresholds.drawdown.medium = value;
    } else {
      newThresholds.drawdown.high = value;
    }
    onChange(newThresholds);
  };

  // 波动率阈值
  const handleVolatilityChange = (index: number, value: number) => {
    const newThresholds = { ...riskThresholds };
    if (index === 0) {
      newThresholds.volatility.low = value;
    } else {
      newThresholds.volatility.high = value;
    }
    onChange(newThresholds);
  };

  // 连续下跌阈值
  const handleContinuousDeclineChange = (index: number, value: number) => {
    const newThresholds = { ...riskThresholds };
    if (index === 0) {
      newThresholds.continuousDecline.low = value;
    } else {
      newThresholds.continuousDecline.high = value;
    }
    onChange(newThresholds);
  };

  // 集中度阈值
  const handleConcentrationChange = (index: number, value: number) => {
    const newThresholds = { ...riskThresholds };
    if (index === 0) {
      newThresholds.concentration.singleFund = value;
      newThresholds.concentration.topThree = Math.min(95, value * 3);
    } else {
      newThresholds.concentration.topThree = value;
    }
    onChange(newThresholds);
  };

  return (
    <div className="space-y-6">
      {/* 回撤预警阈值 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800">{RISK_THRESHOLD_CONFIGS[0].label}</span>
          <span className="relative group cursor-pointer">
            <i className="fas fa-question-circle text-blue-500 hover:text-blue-600 text-xs"></i>
            <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 w-48 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-normal z-10">
              {RISK_THRESHOLD_CONFIGS[0].description}
            </span>
          </span>
        </div>
        <MultiSlider
          values={[
            riskThresholds.drawdown.low,
            riskThresholds.drawdown.medium,
            riskThresholds.drawdown.high,
          ]}
          labels={['轻度', '中度', '重度']}
          colors={['#fbbf24', '#f97316', '#ef4444']}
          min={5}
          max={40}
          unit="%"
          onChange={handleDrawdownChange}
        />
      </div>

      {/* 波动率阈值 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800">{RISK_THRESHOLD_CONFIGS[1].label}</span>
          <span className="relative group cursor-pointer">
            <i className="fas fa-question-circle text-blue-500 hover:text-blue-600 text-xs"></i>
            <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 w-48 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-normal z-10">
              {RISK_THRESHOLD_CONFIGS[1].description}
            </span>
          </span>
        </div>
        <MultiSlider
          values={[riskThresholds.volatility.low, riskThresholds.volatility.high]}
          labels={['低波动', '高波动']}
          colors={['#22c55e', '#ef4444']}
          min={5}
          max={40}
          unit="%"
          onChange={handleVolatilityChange}
        />
      </div>

      {/* 连续下跌阈值 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800">{RISK_THRESHOLD_CONFIGS[2].label}</span>
          <span className="relative group cursor-pointer">
            <i className="fas fa-question-circle text-blue-500 hover:text-blue-600 text-xs"></i>
            <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 w-48 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-normal z-10">
              {RISK_THRESHOLD_CONFIGS[2].description}
            </span>
          </span>
        </div>
        <MultiSlider
          values={[riskThresholds.continuousDecline.low, riskThresholds.continuousDecline.high]}
          labels={['轻度关注', '高度关注']}
          colors={['#fbbf24', '#ef4444']}
          min={1}
          max={15}
          unit="天"
          onChange={handleContinuousDeclineChange}
        />
      </div>

      {/* 集中度阈值 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800">{RISK_THRESHOLD_CONFIGS[3].label}</span>
          <span className="relative group cursor-pointer">
            <i className="fas fa-question-circle text-blue-500 hover:text-blue-600 text-xs"></i>
            <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 w-48 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-normal z-10">
              {RISK_THRESHOLD_CONFIGS[3].description}
            </span>
          </span>
        </div>
        <MultiSlider
          values={[riskThresholds.concentration.singleFund, riskThresholds.concentration.topThree]}
          labels={['单基金上限', '前三基金上限']}
          colors={['#3b82f6', '#8b5cf6']}
          min={10}
          max={90}
          unit="%"
          onChange={handleConcentrationChange}
        />
      </div>
    </div>
  );
};

export default RiskThresholdSliders;