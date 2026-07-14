import React, { useState, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AttributionResult, FundAttributionData } from '../types';
import { formatMoney, formatSharePercent } from '../utils/format';

interface PerformanceAnalysisChartProps {
  fundData: AttributionResult;
  selectedFund: string | null;
  onSelectFund: (symbol: string | null) => void;
}

// 颜色梯度生成函数（与项目涨跌幅颜色一致）
function generateColorGradient(baseColor: { r: number; g: number; b: number }, steps: number): string[] {
  const colors: string[] = [];
  for (let i = 0; i < steps; i++) {
    // 从深到浅：i=0时（占比最大）factor最大（接近基础色），i越大factor越小（越浅）
    // factor从1.0到0.5：占比越大颜色越深
    const factor = 1.0 - (i / (steps - 1)) * 0.5;
    const r = Math.round(baseColor.r + (255 - baseColor.r) * (1 - factor));
    const g = Math.round(baseColor.g + (255 - baseColor.g) * (1 - factor));
    const b = Math.round(baseColor.b + (255 - baseColor.b) * (1 - factor));
    colors.push(`rgb(${r}, ${g}, ${b})`);
  }
  return colors;
}

// 与项目涨跌幅颜色一致
const PROFIT_BASE = { r: 220, g: 38, b: 38 }; // #dc2626 Tailwind red-600（盈利红色）
const LOSS_BASE = { r: 22, g: 163, b: 74 };   // #16a34a Tailwind green-600（亏损绿色）

// 环形图尺寸配置
const CHART_CONFIG = {
  outerRadius: 120,      // 外环半径
  centerX: 160,          // 圆心X
  centerY: 185,          // 圆心Y
  hoverScale: 5,         // 悬停时外扩距离
};

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  data: FundAttributionData | null;
}

/**
 * 计算扇形路径
 */
function calculateArcPath(
  centerX: number,
  centerY: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
): string {
  // 角度转弧度（从12点方向开始，顺时针）
  const startRad = ((startAngle - 90) * Math.PI) / 180;
  const endRad = ((endAngle - 90) * Math.PI) / 180;

  // 计算四个角点
  const innerStartX = centerX + innerRadius * Math.cos(startRad);
  const innerStartY = centerY + innerRadius * Math.sin(startRad);
  const innerEndX = centerX + innerRadius * Math.cos(endRad);
  const innerEndY = centerY + innerRadius * Math.sin(endRad);
  const outerStartX = centerX + outerRadius * Math.cos(startRad);
  const outerStartY = centerY + outerRadius * Math.sin(startRad);
  const outerEndX = centerX + outerRadius * Math.cos(endRad);
  const outerEndY = centerY + outerRadius * Math.sin(endRad);

  // 大弧标志
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  // 构建路径
  const path = [
    `M ${outerStartX} ${outerStartY}`,                           // 移动到外环起点
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEndX} ${outerEndY}`, // 外弧
    `L ${innerEndX} ${innerEndY}`,                                // 连接到内环终点
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStartX} ${innerStartY}`, // 内弧
    'Z'                                                          // 闭合
  ].join(' ');

  return path;
}

/**
 * 扇区组件
 */
interface SectorProps {
  path: string;
  color: string;
  isHovered: boolean;
  isSelected: boolean;
  onMouseEnter: (e: React.MouseEvent<SVGPathElement, MouseEvent>) => void;
  onMouseLeave: (e: React.MouseEvent<SVGPathElement, MouseEvent>) => void;
  onClick: () => void;
}

const Sector: React.FC<SectorProps> = ({
  path,
  color,
  isHovered,
  isSelected,
  onMouseEnter,
  onMouseLeave,
  onClick
}) => {
  return (
    <path
      d={path}
      fill={color}
      stroke="rgba(255,255,255,0.3)"
      strokeWidth={1}
      style={{
        cursor: 'pointer',
        transition: 'transform 0.15s ease-out, opacity 0.15s ease-out',
        transformOrigin: `${CHART_CONFIG.centerX}px ${CHART_CONFIG.centerY}px`,
        transform: isSelected ? `scale(1.05)` : isHovered ? `scale(1.05)` : 'scale(1)',
        opacity: isSelected ? 0.85 : isHovered ? 0.9 : 1,
      }}
      onMouseEnter={(e) => onMouseEnter(e)}
      onMouseLeave={(e) => onMouseLeave(e)}
      onClick={onClick}
    />
  );
}

Sector.displayName = 'Sector';

/**
 * 环形饼图组件
 * - 外环：盈利基金（红色系）
 * - 内环：亏损基金（绿色系）
 */
export default function PerformanceAnalysisChart({
  fundData,
  selectedFund,
  onSelectFund
}: PerformanceAnalysisChartProps) {
  const [hoveredFund, setHoveredFund] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    data: null
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // 所有基金排序：先盈利（红色），后亏损（绿色），各自按占比从大到小
  const sortedFunds = useMemo(() => {
    // 分离盈利和亏损基金
    const profitFunds = fundData.funds.filter(f => f.isProfit);
    const lossFunds = fundData.funds.filter(f => !f.isProfit);

    // 各自按占比从大到小排序
    profitFunds.sort((a, b) => b.profitShare - a.profitShare);
    lossFunds.sort((a, b) => b.profitShare - a.profitShare);

    // 合并：先红色（盈利），后绿色（亏损）
    return [...profitFunds, ...lossFunds];
  }, [fundData.funds]);

  // 生成颜色梯度
  const { profitColors, lossColors } = useMemo(() => {
    const profitCount = sortedFunds.filter(f => f.isProfit).length;
    const lossCount = sortedFunds.filter(f => !f.isProfit).length;

    return {
      profitColors: profitCount > 0 ? generateColorGradient(PROFIT_BASE, profitCount) : [],
      lossColors: lossCount > 0 ? generateColorGradient(LOSS_BASE, lossCount) : [],
    };
  }, [sortedFunds]);

  // 计算所有扇区（单圈饼图）
  const allSectors = useMemo(() => {
    if (sortedFunds.length === 0) return [];

    const sectors: Array<{
      fund: FundAttributionData;
      path: string;
      color: string;
      startAngle: number;
      endAngle: number;
    }> = [];

    let currentAngle = 0;
    let profitIndex = 0;
    let lossIndex = 0;

    sortedFunds.forEach((fund) => {
      const angleSpan = (fund.profitShare / 100) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angleSpan;

      // 饼图（从圆心到边缘）
      // 不强制最小角度，保持真实比例，避免重叠
      const path = calculateArcPath(
        CHART_CONFIG.centerX,
        CHART_CONFIG.centerY,
        0, // 从圆心开始
        CHART_CONFIG.outerRadius,
        startAngle,
        endAngle
      );

      // 选择颜色
      let color: string;
      if (fund.isProfit) {
        color = profitColors[profitIndex] || profitColors[profitColors.length - 1] || '#dc2626';
        profitIndex++;
      } else {
        color = lossColors[lossIndex] || lossColors[lossColors.length - 1] || '#16a34a';
        lossIndex++;
      }

      sectors.push({
        fund,
        path,
        color,
        startAngle,
        endAngle
      });

      currentAngle = endAngle;  // 下一个扇区从真实角度开始，确保无重叠
    });

    return sectors;
  }, [sortedFunds, profitColors, lossColors]);

  // 处理悬停
  const handleMouseEnter = useCallback((fund: FundAttributionData, event: React.MouseEvent<SVGPathElement, MouseEvent>) => {
    setHoveredFund(fund.symbol);

    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({
      visible: true,
      x: rect.left + rect.width / 2,
      y: rect.top,
      data: fund
    });
  }, []);

  const handleMouseLeave = useCallback((_e: React.MouseEvent<SVGPathElement, MouseEvent>) => {
    setHoveredFund(null);
    setTooltip(prev => ({ ...prev, visible: false }));
  }, []);

  // 处理点击
  const handleClick = useCallback((fund: FundAttributionData) => {
    // 切换选中状态
    if (selectedFund === fund.symbol) {
      onSelectFund(null);
    } else {
      onSelectFund(fund.symbol);
    }
  }, [selectedFund, onSelectFund]);

  // 渲染Tooltip
  const renderTooltip = () => {
    if (!tooltip.visible || !tooltip.data) return null;

    const fund = tooltip.data;
    const profitColor = fund.isProfit ? '#ef4444' : '#22c55e';

    return createPortal(
      <div
        style={{
          position: 'fixed',
          left: tooltip.x,
          top: tooltip.y - 10,
          transform: 'translate(-50%, -100%)',
          zIndex: 10000,
          pointerEvents: 'none'
        }}
      >
        <div
          className="bg-white border rounded-lg shadow-lg p-3"
          style={{ minWidth: 180 }}
        >
          <div className="font-medium text-gray-900 mb-2">
            {fund.name || fund.symbol}
          </div>
          <div className="text-sm text-gray-600 mb-1">
            代码：{fund.symbol}
          </div>
          <div className="text-sm mb-1">
            <span className="text-gray-600">收益：</span>
            <span style={{ color: profitColor }}>
              {formatMoney(fund.profit, 2, true)}
            </span>
          </div>
          <div className="text-sm">
            <span className="text-gray-600">占比：</span>
            <span style={{ color: profitColor }}>
              {formatSharePercent(fund.profitShare)}
            </span>
          </div>
        </div>
        {/* 小三角 */}
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            top: '100%',
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid white'
          }}
        />
      </div>,
      document.body
    );
  };

  // 空状态
  if (!fundData.funds || fundData.funds.length === 0) {
    return (
      <div
        ref={containerRef}
        className="flex items-center justify-center bg-gray-50 rounded-lg"
        style={{ width: 320, height: 320 }}
      >
        <div className="text-gray-400 text-sm">暂无绩效数据</div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative inline-block" style={{ width: 320, height: 320 }}>
      {/* 饼图 */}
      <svg
        width={320}
        height={320}
        style={{ display: 'block' }}
      >
        {allSectors.map((sector, index) => {
          const isHovered = hoveredFund === sector.fund.symbol;
          const isSelected = selectedFund === sector.fund.symbol;

          return (
            <Sector
              key={sector.fund.symbol}
              path={sector.path}
              color={sector.color}
              isHovered={isHovered}
              isSelected={isSelected}
              onMouseEnter={(e) => handleMouseEnter(sector.fund, e)}
              onMouseLeave={handleMouseLeave}
              onClick={() => handleClick(sector.fund)}
            />
          );
        })}
      </svg>

      {/* 重置按钮 - 饼图右上角 */}
      {selectedFund && (
        <button
          onClick={() => onSelectFund(null)}
          className="absolute flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded shadow-sm transition-colors z-10"
          style={{ top: 58, right: 4 }}
          title="重置为整体组合"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>重置</span>
        </button>
      )}

      {/* Tooltip */}
      {tooltip.visible && tooltip.data && renderTooltip()}
    </div>
  );
}
