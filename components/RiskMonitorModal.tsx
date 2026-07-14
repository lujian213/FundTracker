/**
 * RiskMonitorModal.tsx
 *
 * 风险监控中心弹窗
 * 提供风险评分、预警列表、集中度分析、回撤追踪等功能
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Ticker, ValuationData, RiskSnapshot, RiskAlert, FundDrawdown } from '../types';
import { computeRiskSnapshot } from '../services/riskCalculationService';
import { KPICardDisplay } from './KPICardDisplay';
import { useModalBodyStyle } from '../hooks/useModalBodyStyle';
import { formatMoney, formatSharePercent } from '../utils/format';
import { formatDateDisplay } from '../utils/dateFormat';
import { getPosition } from '../services/marketFundService';
import { computePositions } from '../utils/positionHelper';
import { getRiskThresholds } from '../services/riskThresholdService';
import { getScoreColor, getRiskLevel, getAlertLevelStyle, getAlertBadgeStyle } from '../utils/riskLevelHelper';

type RiskTab = 'overview' | 'alerts' | 'concentration' | 'drawdown';

/**
 * 表格行 Tooltip 组件
 * 使用 fixed 定位，避免被滚动容器截断
 */
interface TableRowTooltipProps {
  visible: boolean;
  x: number;
  y: number;
  children: React.ReactNode;
}

const TableRowTooltip: React.FC<TableRowTooltipProps> = ({ visible, x, y, children }) => {
  if (!visible) return null;

  return createPortal(
    <div
      className="fixed px-3 py-2 bg-gray-800 text-white text-xs rounded-lg shadow-lg z-[9999] w-52 pointer-events-none"
      style={{
        left: x,
        top: y,
        transform: 'translateY(-100%)',
        marginTop: -8,
      }}
    >
      {children}
    </div>,
    document.body
  );
};

/**
 * 表格单元格 Tooltip 触发器
 */
interface TooltipCellProps {
  children: React.ReactNode;
  tooltipContent: React.ReactNode;
  className?: string;
}

const TooltipCell: React.FC<TooltipCellProps> = ({ children, tooltipContent, className }) => {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const cellRef = useRef<HTMLTableCellElement>(null);

  const handleMouseEnter = useCallback(() => {
    if (cellRef.current) {
      const rect = cellRef.current.getBoundingClientRect();
      setPosition({ x: rect.left, y: rect.top });
      setShow(true);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setShow(false);
  }, []);

  return (
    <td
      ref={cellRef}
      className={className}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      <TableRowTooltip visible={show} x={position.x} y={position.y}>
        {tooltipContent}
      </TableRowTooltip>
    </td>
  );
};

/**
 * 风险指标卡片
 * 显示单个风险指标及其阈值状态
 */
interface RiskIndicatorCardProps {
  icon: string;
  title: string;
  value: string;
  status: 'success' | 'warning' | 'danger' | 'neutral';
  statusText: string;
  tooltipPosition: 'left' | 'center' | 'right';
  tooltipContent: React.ReactNode;
}

const RiskIndicatorCard: React.FC<RiskIndicatorCardProps> = ({
  icon,
  title,
  value,
  status,
  statusText,
  tooltipPosition,
  tooltipContent,
}) => {
  // 根据状态确定颜色
  const borderColor = {
    success: 'border-green-300',
    warning: 'border-yellow-300',
    danger: 'border-red-300',
    neutral: 'border-gray-300',
  }[status];

  const bgColor = {
    success: 'bg-gradient-to-br from-green-50 to-white',
    warning: 'bg-gradient-to-br from-yellow-50 to-white',
    danger: 'bg-gradient-to-br from-red-50 to-white',
    neutral: 'bg-gradient-to-br from-gray-50 to-white',
  }[status];

  const textColor = {
    success: 'text-green-600',
    warning: 'text-yellow-600',
    danger: 'text-red-600',
    neutral: 'text-gray-600',
  }[status];

  const statusBgColor = {
    success: 'bg-green-100 text-green-700',
    warning: 'bg-yellow-100 text-yellow-700',
    danger: 'bg-red-100 text-red-700',
    neutral: 'bg-gray-100 text-gray-700',
  }[status];

  // Tooltip位置样式
  const tooltipPositionClass = {
    left: 'left-0',
    center: 'left-1/2 -translate-x-1/2',
    right: 'right-0',
  }[tooltipPosition];

  return (
    <div className="relative group">
      <div className={`bg-white rounded-xl border-2 ${borderColor} ${bgColor} p-4 text-center cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg`}>
        <div className="text-2xl mb-2">{icon}</div>
        <div className="text-xs text-gray-500 mb-1">{title}</div>
        <div className={`text-2xl font-bold ${textColor}`}>{value}</div>
        <div className={`mt-2 text-xs px-2 py-1 rounded-full inline-block ${statusBgColor}`}>
          {statusText}
        </div>
      </div>
      {/* Tooltip */}
      <div className={`absolute bottom-full ${tooltipPositionClass} mb-2 px-4 py-3 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-10 w-60 pointer-events-none`}>
        {tooltipContent}
      </div>
    </div>
  );
};

/**
 * 根据值和阈值判断状态
 */
function getThresholdStatus(value: number, low: number, high: number): 'success' | 'warning' | 'danger' {
  if (value >= high) return 'danger';
  if (value >= low) return 'warning';
  return 'success';
}

interface RiskMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolio: Ticker[];
  marketData: Record<string, ValuationData>;
  onSelectFund?: (symbol: string) => void;
}

const RiskMonitorModal: React.FC<RiskMonitorModalProps> = ({
  isOpen,
  onClose,
  portfolio,
  marketData,
  onSelectFund,
}) => {
  useModalBodyStyle(isOpen);
  const [activeTab, setActiveTab] = useState<RiskTab>('overview');
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<RiskSnapshot | null>(null);

  // 使用 ref 跟踪是否已经计算过，避免重复计算
  const calculatedRef = useRef(false);

  // 计算风险快照 - 只在弹窗打开时计算一次
  useEffect(() => {
    if (!isOpen) {
      // 弹窗关闭时重置状态
      calculatedRef.current = false;
      return;
    }

    // 如果已经计算过，不再重复计算
    if (calculatedRef.current) return;

    let mounted = true;
    calculatedRef.current = true;
    setLoading(true);

    const compute = async () => {
      try {
        const result = await computeRiskSnapshot(portfolio, marketData);
        if (mounted) {
          setSnapshot(result);
        }
      } catch (error) {
        console.error('计算风险快照失败:', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    compute();

    return () => {
      mounted = false;
    };
  }, [isOpen]); // 只依赖 isOpen，避免 portfolio 和 marketData 变化导致重新计算

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  // 持仓天数（在早期返回之前定义）
  const holdingDays = 365; // 默认一年

  if (!isOpen) return null;

  const tabItems: Array<{ id: RiskTab; label: string; icon: string; badge?: number }> = [
    { id: 'overview', label: '📊 风险总览', icon: 'fa-chart-pie' },
    { id: 'alerts', label: '🔔 预警列表', icon: 'fa-exclamation-triangle', badge: snapshot?.alerts.length || 0 },
    { id: 'concentration', label: '🥧 集中度分析', icon: 'fa-chart-bar' },
    { id: 'drawdown', label: '📉 回撤追踪', icon: 'fa-chart-line' },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="risk-monitor-title"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal body - 固定高度 */}
      <div className="relative bg-white rounded-2xl w-full max-w-5xl h-[720px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <h2 id="risk-monitor-title" className="text-lg font-bold text-gray-800">
            风险监控中心
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors"
            aria-label="关闭"
          >
            <i className="fas fa-times" />
          </button>
        </div>

        {/* Tabs navigation */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 shrink-0">
          <div className="flex gap-2">
            {tabItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as RiskTab)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                  activeTab === item.id
                    ? 'bg-red-50 text-red-600 border-2 border-red-200'
                    : 'bg-white text-gray-600 border-2 border-transparent hover:bg-gray-100'
                }`}
              >
                <span>{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className={`ml-1 min-w-[20px] h-5 px-1.5 rounded-full text-xs flex items-center justify-center ${
                    activeTab === item.id ? 'bg-red-600 text-white' : 'bg-red-500 text-white'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content - 固定高度容器 */}
        <div className="flex-1 p-6 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <i className="fas fa-spinner fa-spin text-2xl text-gray-400" />
            </div>
          ) : !snapshot ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              无法计算风险数据
            </div>
          ) : (
            <div className={TAB_CONTENT_STYLE}>
              {activeTab === 'overview' && (
                <OverviewTab snapshot={snapshot} holdingDays={holdingDays} portfolio={portfolio} marketData={marketData} />
              )}
              {activeTab === 'alerts' && (
                <AlertsTab alerts={snapshot.alerts} />
              )}
              {activeTab === 'concentration' && (
                <ConcentrationTab portfolio={portfolio} marketData={marketData} />
              )}
              {activeTab === 'drawdown' && (
                <DrawdownTab snapshot={snapshot} onSelectFund={onSelectFund} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// Tab Components
// ═══════════════════════════════════════════════════════════════════════════════

// 统一Tab内容高度样式 - 固定高度防止tab切换跳动，禁止水平滚动
const TAB_CONTENT_STYLE = "h-[500px] overflow-x-hidden overflow-y-auto";

/**
 * 风险总览Tab
 */
const OverviewTab: React.FC<{
  snapshot: RiskSnapshot;
  holdingDays: number;
  portfolio: Ticker[];
  marketData: Record<string, ValuationData>;
}> = ({ snapshot, holdingDays, portfolio, marketData }) => {
  // 计算持仓分布（用于集中度tooltip显示具体占比）
  const positions = useMemo(() => {
    return computePositions(
      portfolio.filter((t) => {
        const pos = getPosition(t.symbol);
        return pos && pos.fullCapacity > 0;
      }),
      marketData
    );
  }, [portfolio, marketData]);

  const level = getRiskLevel(snapshot.score);
  const thresholds = getRiskThresholds();

  return (
    <div className="space-y-6">
      {/* 综合风险评分 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b-2 border-red-200 flex items-center gap-2">
          🎯 综合风险评分
        </h3>
        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl border-2 border-red-200 p-6">
          <div className="flex items-center gap-6">
            {/* 圆形评分 */}
            <div className={`w-[100px] h-[100px] rounded-full ${getScoreColor(snapshot.score)} flex items-center justify-center shadow-lg`}>
              <span className="text-white text-[36px] font-bold">{snapshot.score}</span>
            </div>

            {/* 风险信息 */}
            <div className="flex-1">
              <h3 className={`text-lg font-bold ${level.color} mb-2`}>
                {level.icon} {level.text}
              </h3>
              <p className="text-sm text-red-800 leading-relaxed">
                当前组合风险{level.text === '高风险' ? '较高' : '适中'}，建议关注
                {snapshot.maxDrawdown >= thresholds.drawdown.low ? '回撤控制' : ''}
                {snapshot.hhi > 0.25 ? '和持仓分散度' : ''}。
                {snapshot.currentDrawdownDays > 0 && `回撤已持续${snapshot.currentDrawdownDays}天。`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 风险指标 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b-2 border-red-200 flex items-center gap-2">
          📈 风险指标
        </h3>
        <div className="grid grid-cols-4 gap-4">
          {/* 波动率 */}
          <RiskIndicatorCard
            icon="📊"
            title="组合波动率"
            value={`${snapshot.volatility.toFixed(2)}%`}
            status={
              snapshot.volatility >= thresholds.volatility.high ? 'danger' :
              snapshot.volatility >= thresholds.volatility.low ? 'warning' : 'success'
            }
            statusText={
              snapshot.volatility >= thresholds.volatility.high ? '高波动' :
              snapshot.volatility >= thresholds.volatility.low ? '中等波动' : '低波动'
            }
            tooltipPosition="left"
            tooltipContent={
              <>
                <strong>波动率详情</strong>
                <div className="mt-1 text-gray-300">
                  当前组合年化波动率 {snapshot.volatility.toFixed(2)}%，处于{snapshot.volatility >= thresholds.volatility.high ? '较高' : snapshot.volatility >= thresholds.volatility.low ? '中等' : '较低'}水平。
                </div>
                <div className="mt-1 text-gray-400">
                  低阈值: {thresholds.volatility.low}% | 高阈值: {thresholds.volatility.high}%<br/>
                  同类平均: ~15%
                </div>
                <div className={`mt-1 ${snapshot.volatility < thresholds.volatility.low ? 'text-green-400' : snapshot.volatility < thresholds.volatility.high ? 'text-yellow-400' : 'text-red-400'}`}>
                  建议：{snapshot.volatility < thresholds.volatility.low ? '波动率较低，可接受' :
                         snapshot.volatility < thresholds.volatility.high ? '波动率适中，继续观察' : '波动率较高，注意风险'}
                </div>
              </>
            }
          />

          {/* 最大回撤 */}
          <RiskIndicatorCard
            icon="📉"
            title="最大回撤"
            value={`${snapshot.maxDrawdown.toFixed(2)}%`}
            status={
              snapshot.maxDrawdown >= thresholds.drawdown.high ? 'danger' :
              snapshot.maxDrawdown >= thresholds.drawdown.low ? 'warning' : 'success'
            }
            statusText={
              snapshot.maxDrawdown >= thresholds.drawdown.high ? `超${thresholds.drawdown.high}%阈值` :
              snapshot.maxDrawdown >= thresholds.drawdown.low ? `超${thresholds.drawdown.low}%阈值` : '正常'
            }
            tooltipPosition="center"
            tooltipContent={
              <>
                <strong>历史最大回撤详情</strong>
                {snapshot.maxDrawdownPeakDate && (
                  <div className="mt-2 pt-2 border-t border-gray-600">
                    <div className="text-gray-400">
                      <span className="text-green-300">开始</span> {formatDateDisplay(snapshot.maxDrawdownPeakDate)}
                      <div className="pl-4 text-gray-300">
                        净值: {snapshot.maxDrawdownPeakProfit.toFixed(4)}
                      </div>
                    </div>
                    {(() => {
                      const isCurrentDrawdown = snapshot.maxDrawdown === snapshot.currentDrawdown &&
                        snapshot.maxDrawdownPeakDate === snapshot.currentDrawdownPeakDate;

                      if (isCurrentDrawdown && snapshot.currentDate) {
                        return (
                          <div className="text-gray-400 mt-1">
                            <span className="text-yellow-300">当前</span> {formatDateDisplay(snapshot.currentDate)}
                            <div className="pl-4 text-gray-300">
                              净值: {snapshot.currentNav.toFixed(4)}
                            </div>
                          </div>
                        );
                      } else if (snapshot.maxDrawdownTroughDate) {
                        return (
                          <div className="text-gray-400 mt-1">
                            <span className="text-red-300">结束</span> {formatDateDisplay(snapshot.maxDrawdownTroughDate)}
                            <div className="pl-4 text-gray-300">
                              净值: {snapshot.maxDrawdownTroughProfit.toFixed(4)}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    <div className="text-gray-400 mt-1">
                      持续: {snapshot.maxDrawdownDays > 0 ? `${snapshot.maxDrawdownDays}天` : '-'}
                    </div>
                  </div>
                )}
                <div className="mt-2 text-gray-400">
                  轻度预警: {thresholds.drawdown.low}% | 重度预警: {thresholds.drawdown.high}%
                </div>
              </>
            }
          />

          {/* 集中度(HHI) */}
          <RiskIndicatorCard
            icon="🥧"
            title="集中度(HHI)"
            value={snapshot.hhi.toFixed(3)}
            status={
              snapshot.hhi > 0.25 ? 'danger' :
              snapshot.hhi > 0.15 ? 'warning' : 'success'
            }
            statusText={
              snapshot.hhi > 0.25 ? '高度集中' :
              snapshot.hhi > 0.15 ? '中度集中' : '分散良好'
            }
            tooltipPosition="center"
            tooltipContent={
              <>
                <strong>集中度详情</strong>
                <div className="mt-1 text-gray-300">
                  HHI指数 {snapshot.hhi.toFixed(3)}，表示{snapshot.hhi > 0.25 ? '高度集中' : snapshot.hhi > 0.15 ? '中度集中' : '分散良好'}。
                </div>
                {positions.entries.length > 0 && (
                  <div className="mt-1 text-gray-400">
                    单基金最高占比：{(positions.entries[0].ratio * 100).toFixed(0)}%（建议≤{thresholds.concentration.singleFund}%）<br/>
                    前三基金占比：{(positions.entries.slice(0, 3).reduce((sum, e) => sum + e.ratio, 0) * 100).toFixed(0)}%（建议≤{thresholds.concentration.topThree}%）
                  </div>
                )}
                <div className={`mt-1 ${snapshot.hhi <= 0.15 ? 'text-green-400' : snapshot.hhi <= 0.25 ? 'text-yellow-400' : 'text-orange-400'}`}>
                  建议：{snapshot.hhi <= 0.15 ? '持仓分散，可接受' :
                         snapshot.hhi <= 0.25 ? '集中度偏高，可考虑分散' : '高度集中，建议分散配置'}
                </div>
              </>
            }
          />

          {/* 夏普比率 */}
          <RiskIndicatorCard
            icon="⚖️"
            title="夏普比率"
            value={snapshot.sharpeRatio?.toFixed(2) ?? '-'}
            status={
              snapshot.sharpeRatio !== null && snapshot.sharpeRatio >= 1 ? 'success' :
              snapshot.sharpeRatio !== null && snapshot.sharpeRatio >= 0 ? 'warning' : 'neutral'
            }
            statusText={
              snapshot.sharpeRatio !== null && snapshot.sharpeRatio >= 1 ? '良好' :
              snapshot.sharpeRatio !== null && snapshot.sharpeRatio >= 0 ? '一般' : '无数据'
            }
            tooltipPosition="right"
            tooltipContent={
              <>
                <strong>夏普比率详情</strong>
                <div className="mt-1 text-gray-300">
                  当前夏普比率 {snapshot.sharpeRatio?.toFixed(2) ?? '-'}，风险调整后收益{snapshot.sharpeRatio && snapshot.sharpeRatio >= 1 ? '良好' : snapshot.sharpeRatio && snapshot.sharpeRatio >= 0 ? '一般' : '无法评估'}。
                </div>
                <div className="mt-1 text-gray-400">
                  评级标准：<br/>
                  &lt; 0：不佳 | 0-1：一般<br/>
                  1-2：良好 | &gt; 2：优秀
                </div>
              </>
            }
          />
        </div>
      </div>

      </div>
  );
};

/**
 * 预警列表Tab
 */
const AlertsTab: React.FC<{ alerts: RiskAlert[] }> = ({ alerts }) => {
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  const filteredAlerts = useMemo(() => {
    if (filter === 'all') return alerts;
    return alerts.filter((a: RiskAlert) => a.level === filter);
  }, [alerts, filter]);

  // 获取建议操作
  const getSuggestion = (alert: RiskAlert) => {
    switch (alert.type) {
      case 'drawdown':
        return '💡 建议：审视持仓结构，考虑减仓';
      case 'volatility':
        return '💡 建议：关注波动来源，考虑增加稳健配置';
      case 'concentration':
        return '💡 建议：分散配置降低风险';
      case 'continuous_decline':
        return '💡 建议：保持观察，关注市场动态';
      default:
        return '💡 建议：审慎决策';
    }
  };

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 py-16">
        <i className="fas fa-check-circle text-5xl mb-3 text-green-400" />
        <div className="text-lg font-medium">暂无风险预警</div>
        <div className="text-sm text-gray-300 mt-1">当前组合风险状况良好</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 当前预警标题 - 固定 */}
      <h3 className="text-sm font-semibold text-gray-700 pb-2 border-b-2 border-red-200 flex items-center gap-2 shrink-0">
        🔔 当前预警 ({alerts.length}条)
      </h3>

      {/* 筛选器 - 固定 */}
      <div className="flex items-center justify-between py-3 shrink-0">
        <div className="flex gap-2">
          {[
            { id: 'all', label: '全部', count: alerts.length },
            { id: 'high', label: '严重', count: alerts.filter(a => a.level === 'high').length },
            { id: 'medium', label: '中等', count: alerts.filter(a => a.level === 'medium').length },
            { id: 'low', label: '轻度', count: alerts.filter(a => a.level === 'low').length },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setFilter(item.id as typeof filter)}
              className={`px-4 py-2 text-sm rounded-lg transition-all ${
                filter === item.id
                  ? 'bg-gray-800 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {item.label}
              {item.count > 0 && (
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${
                  filter === item.id ? 'bg-gray-600' : 'bg-gray-100'
                }`}>
                  {item.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 预警列表 - 可滚动区域 */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden pr-2">
        <div className="space-y-3">
          {filteredAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-xl border-2 p-4 cursor-pointer transition-all hover:translate-x-1 hover:shadow-lg ${
                alert.level === 'high' ? 'bg-red-50 border-red-200' :
                alert.level === 'medium' ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'
              }`}
            >
              <div className="flex items-start gap-4">
                {/* 严重级别图标 */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold shrink-0 ${
                  alert.level === 'high' ? 'bg-red-500 text-white' :
                  alert.level === 'medium' ? 'bg-orange-500 text-white' : 'bg-green-500 text-white'
                }`}>
                  {alert.level === 'high' ? '!' : alert.level === 'medium' ? '⚠' : 'i'}
                </div>

                {/* 预警内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      alert.level === 'high' ? 'bg-red-200 text-red-800' :
                      alert.level === 'medium' ? 'bg-orange-200 text-orange-800' : 'bg-green-200 text-green-800'
                    }`}>
                      {alert.level === 'high' ? '🔴' : alert.level === 'medium' ? '🟠' : '🟢'}
                    </span>
                    <span className="font-semibold text-gray-800">{alert.targetName}</span>
                  </div>
                  <div className="text-sm text-gray-600 mb-2">{alert.message}</div>
                  <div className="text-xs text-gray-400 mb-2">
                    当前值: {alert.unit === '天' ? alert.currentValue : alert.currentValue.toFixed(2)}{alert.unit} | 阈值: {alert.threshold}{alert.unit}
                  </div>
                  {/* 建议操作 */}
                  <div className={`text-xs px-3 py-1.5 rounded-lg inline-block ${
                    alert.level === 'high' ? 'bg-red-100 text-red-700' :
                    alert.level === 'medium' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {getSuggestion(alert)}
                  </div>
                </div>

                {/* 时间 */}
                <div className="text-xs text-gray-400 shrink-0">
                  {new Date(alert.triggeredAt).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * 集中度分析Tab
 */
const ConcentrationTab: React.FC<{
  portfolio: Ticker[];
  marketData: Record<string, ValuationData>;
}> = ({ portfolio, marketData }) => {
  // 计算持仓分布
  const positions = useMemo(() => {
    return computePositions(
      portfolio.filter((t) => {
        const pos = getPosition(t.symbol);
        return pos && pos.fullCapacity > 0;
      }),
      marketData
    );
  }, [portfolio, marketData]);

  // 计算集中度指标
  const metrics = useMemo(() => {
    if (positions.entries.length === 0) {
      return {
        topFundRatio: 0,
        topThreeRatio: 0,
        hhi: 0,
        fundCount: 0,
      };
    }

    const topFundRatio = positions.entries[0].ratio * 100;
    const topThreeRatio = positions.entries.slice(0, 3).reduce((sum, e) => sum + e.ratio, 0) * 100;
    const hhi = positions.entries.reduce((sum, e) => sum + e.ratio * e.ratio, 0);
    const fundCount = positions.entries.length;

    return { topFundRatio, topThreeRatio, hhi, fundCount };
  }, [positions]);

  // 获取阈值
  const thresholds = useMemo(() => getRiskThresholds(), []);

  if (positions.entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400">
        <i className="fas fa-chart-pie text-4xl mb-2" />
        <div>暂无持仓数据</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 集中度指标 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b-2 border-red-200 flex items-center gap-2">
          📊 集中度指标
        </h3>
        <div className="grid grid-cols-2 gap-4">
          {/* 单基金最高占比 */}
          <div className={`bg-white rounded-lg border-2 p-4 transition-shadow hover:shadow-md ${
            metrics.topFundRatio >= thresholds.concentration.singleFund ? 'border-red-300 bg-gradient-to-br from-red-50 to-white' : 'border-gray-200'
          }`}>
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-gray-600">单基金最高占比</span>
              <span className={`text-xl font-bold ${
                metrics.topFundRatio >= thresholds.concentration.singleFund ? 'text-red-600' : 'text-gray-800'
              }`}>{metrics.topFundRatio.toFixed(1)}%</span>
            </div>
            <div className="relative h-2 bg-gray-200 rounded overflow-visible">
              <div
                className={`h-full rounded transition-all ${
                  metrics.topFundRatio >= thresholds.concentration.singleFund ? 'bg-red-500' : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min(metrics.topFundRatio, 100)}%` }}
              />
              {/* 阈值标记 */}
              <div
                className="absolute top-[-4px] w-0.5 h-4 bg-red-600"
                style={{ left: `${thresholds.concentration.singleFund}%` }}
              />
            </div>
            <div className="flex justify-between items-center mt-2 text-xs">
              {metrics.topFundRatio >= thresholds.concentration.singleFund ? (
                <span className="text-red-600 font-medium">⚠️ 超过建议阈值 {thresholds.concentration.singleFund}%</span>
              ) : (
                <span className="text-gray-500">✅ 符合建议阈值</span>
              )}
              <span className="text-gray-400">{positions.entries[0]?.name || '-'}</span>
            </div>
          </div>

          {/* 前三基金集中度 */}
          <div className={`bg-white rounded-lg border-2 p-4 transition-shadow hover:shadow-md ${
            metrics.topThreeRatio >= thresholds.concentration.topThree ? 'border-orange-300 bg-gradient-to-br from-orange-50 to-white' : 'border-gray-200'
          }`}>
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-gray-600">前三基金集中度</span>
              <span className={`text-xl font-bold ${
                metrics.topThreeRatio >= thresholds.concentration.topThree ? 'text-orange-600' : 'text-gray-800'
              }`}>{metrics.topThreeRatio.toFixed(1)}%</span>
            </div>
            <div className="relative h-2 bg-gray-200 rounded overflow-visible">
              <div
                className={`h-full rounded transition-all ${
                  metrics.topThreeRatio >= thresholds.concentration.topThree ? 'bg-orange-500' : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min(metrics.topThreeRatio, 100)}%` }}
              />
              {/* 阈值标记 */}
              <div
                className="absolute top-[-4px] w-0.5 h-4 bg-red-600"
                style={{ left: `${thresholds.concentration.topThree}%` }}
              />
            </div>
            <div className="flex justify-between items-center mt-2 text-xs">
              {metrics.topThreeRatio >= thresholds.concentration.topThree ? (
                <span className="text-orange-600 font-medium">⚠️ 超过建议阈值 {thresholds.concentration.topThree}%</span>
              ) : (
                <span className="text-gray-500">✅ 符合建议阈值</span>
              )}
              <span className="text-gray-400">
                {positions.entries.slice(0, 3).map(e => e.name.slice(0, 4)).join('+')}
              </span>
            </div>
          </div>

          {/* HHI指数 */}
          <div className="bg-white rounded-lg border-2 border-gray-200 p-4 transition-shadow hover:shadow-md">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-gray-600">HHI 指数</span>
              <span className={`text-xl font-bold ${
                metrics.hhi > 0.25 ? 'text-orange-600' : 'text-gray-800'
              }`}>{metrics.hhi.toFixed(3)}</span>
            </div>
            <div className="relative h-2 bg-gray-200 rounded overflow-visible">
              <div
                className="h-full rounded bg-gray-500 transition-all"
                style={{ width: `${metrics.hhi * 200}%` }}
              />
              {/* 阈值标记 */}
              <div
                className="absolute top-[-4px] w-0.5 h-4 bg-red-600"
                style={{ left: '50%' }}
              />
            </div>
            <div className="flex justify-between items-center mt-2 text-xs">
              <span className="text-gray-500">{metrics.hhi > 0.25 ? '⚠️ HHI > 0.25 表示高度集中' : '✅ 分散程度适中'}</span>
              <span className="text-gray-400">范围: 0-0.5</span>
            </div>
          </div>

          {/* 持仓基金数 */}
          <div className="bg-white rounded-lg border-2 border-green-200 bg-gradient-to-br from-green-50 to-white p-4 transition-shadow hover:shadow-md">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-gray-600">持仓基金数</span>
              <span className="text-xl font-bold text-green-600">{metrics.fundCount}只</span>
            </div>
            <div className="relative h-2 bg-gray-200 rounded">
              <div
                className="h-full rounded bg-green-500 transition-all"
                style={{ width: `${(metrics.fundCount / 10) * 100}%` }}
              />
            </div>
            <div className="flex justify-between items-center mt-2 text-xs">
              <span className="text-green-600">✅ 分散程度良好</span>
              <span className="text-gray-400">建议: 5-10只</span>
            </div>
          </div>
        </div>
      </div>

      {/* 分散化建议 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b-2 border-red-200 flex items-center gap-2">
          💡 分散化建议
        </h3>
        <div className="grid grid-cols-3 gap-4">
          {metrics.topFundRatio >= thresholds.concentration.singleFund && (
            <div className="flex gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <i className="fas fa-chart-line text-blue-500" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-800">降低{positions.entries[0]?.name.slice(0, 4)}占比</div>
                <div className="text-xs text-gray-500 mt-1">
                  占比{metrics.topFundRatio.toFixed(0)}%过高，建议降至{thresholds.concentration.singleFund}%以下
                </div>
              </div>
            </div>
          )}
          {metrics.hhi > 0.25 && (
            <div className="flex gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <i className="fas fa-balance-scale text-blue-500" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-800">增加债券配置</div>
                <div className="text-xs text-gray-500 mt-1">
                  当前全部为股票型基金，建议配置10-20%债券型基金降低波动
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <i className="fas fa-sync-alt text-blue-500" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-800">定期再平衡</div>
              <div className="text-xs text-gray-500 mt-1">
                建议每月检查持仓比例，偏离目标超过5%时进行再平衡
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * 回撤追踪Tab
 */
const DrawdownTab: React.FC<{
  snapshot: RiskSnapshot;
  onSelectFund?: (symbol: string) => void;
}> = ({ snapshot, onSelectFund }) => {
  const thresholds = getRiskThresholds();

  // "当前"标记的 tooltip 状态
  const [showCurrentTooltip, setShowCurrentTooltip] = useState(false);
  const [currentTooltipPos, setCurrentTooltipPos] = useState({ x: 0, y: 0 });

  // 使用组合整体数据
  const currentDrawdown = snapshot.currentDrawdown;
  const maxDrawdown = snapshot.maxDrawdown;
  const maxRecoveryDays = snapshot.maxRecoveryDays;

  // 当前回撤详细信息
  const peakNav = snapshot.currentDrawdownPeakNav;
  const troughNav = snapshot.currentDrawdownTroughNav;
  const troughDate = snapshot.currentDrawdownTroughDate;
  const currentNav = snapshot.currentNav;
  const currentDate = snapshot.currentDate;

  if (snapshot.fundDrawdowns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400">
        <i className="fas fa-chart-line text-4xl mb-2" />
        <div>暂无回撤数据</div>
      </div>
    );
  }

  // 计算恢复进度：(当前净值 - 低点净值) / (峰值净值 - 低点净值) * 100
  // 简单的百分比计算，不需要特殊判断
  let recoveryProgress = 0;
  if (peakNav > troughNav) {
    recoveryProgress = (currentNav - troughNav) / (peakNav - troughNav) * 100;
    recoveryProgress = Math.max(0, Math.min(100, recoveryProgress));
  }

  // 计算低点回撤深度（相对于峰值）
  const troughDrawdown = peakNav > 0 && troughNav < peakNav
    ? (peakNav - troughNav) / peakNav * 100
    : 0;

  // 计算预估剩余恢复天数
  // 基于历史恢复速度：如果历史最长恢复有值，用历史平均速度估算
  let estimatedRemainingDays = '--';
  if (currentDrawdown > 0 && maxRecoveryDays > 0 && maxDrawdown > 0) {
    // 历史平均恢复速度：每天恢复的百分比
    const avgRecoveryRate = maxDrawdown / maxRecoveryDays;
    if (avgRecoveryRate > 0) {
      const remaining = Math.ceil(currentDrawdown / avgRecoveryRate);
      estimatedRemainingDays = `≈${remaining}天`;
    }
  }

  // 判断当前点是否接近低点或高点（小于10%距离时显示到下方）
  const isNearLow = recoveryProgress < 10;
  const isNearHigh = recoveryProgress > 90;

  return (
    <div className="space-y-4">
      {/* 当前回撤状态 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b-2 border-red-200 flex items-center gap-2">
          📉 当前回撤状态
        </h3>
        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl border-2 border-red-200 p-4">
          {/* 回撤开始时间 */}
          {snapshot.currentDrawdownPeakDate && (
            <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
              <span>回撤开始: <span className="font-medium text-gray-800">{formatDateDisplay(snapshot.currentDrawdownPeakDate)}</span></span>
              <span>持续时间: <span className="font-medium text-gray-800">{snapshot.currentDrawdownDays}天</span></span>
            </div>
          )}
          <div className="flex items-center justify-between">
          {/* 回撤大数字 */}
          <div>
            <div className="text-5xl font-extrabold text-red-600 leading-none">
              -{currentDrawdown.toFixed(1)}%
            </div>
            <div className="text-sm text-red-800 mt-1">当前回撤深度</div>
            <div className={`mt-2 inline-block px-3 py-1 rounded-full text-xs font-semibold ${
              currentDrawdown >= thresholds.drawdown.high ? 'bg-red-200 text-red-800' :
              currentDrawdown >= thresholds.drawdown.low ? 'bg-orange-200 text-orange-800' : 'bg-green-200 text-green-800'
            }`}>
              {currentDrawdown >= thresholds.drawdown.high ? '🔴 超过重度预警阈值' :
              currentDrawdown >= thresholds.drawdown.medium ? '🟠 超过中度预警阈值' :
              currentDrawdown >= thresholds.drawdown.low ? '🟡 超过轻度预警阈值' : '✅ 正常范围'}
            </div>
          </div>

          {/* 恢复进度圆环 */}
          <div className="shrink-0">
            <svg width="120" height="120" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" fill="none" stroke="#e5e7eb" strokeWidth="10" />
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke={recoveryProgress >= 70 ? '#22c55e' : recoveryProgress >= 35 ? '#f59e0b' : '#dc2626'}
                strokeWidth="10"
                strokeDasharray={`${recoveryProgress * 3.27} 327`}
                strokeDashoffset="0"
                transform="rotate(-90 60 60)"
                strokeLinecap="round"
              />
              <text x="60" y="55" textAnchor="middle" fontSize="20" fontWeight="700" fill={recoveryProgress >= 70 ? '#22c55e' : recoveryProgress >= 35 ? '#f59e0b' : '#dc2626'}>
                {Math.round(recoveryProgress)}%
              </text>
              <text x="60" y="72" textAnchor="middle" fontSize="10" fill="#6b7280">恢复进度</text>
            </svg>
          </div>
        </div>
      </div>
      </div>

      {/* 恢复进度追踪 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b-2 border-red-200 flex items-center gap-2">
          📈 恢复进度追踪
        </h3>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-500 mb-3">
            <span>从低点恢复中</span>
          </div>

        {/* 进度条 */}
        <div className="relative mt-10 mb-4 pb-8">
          {/* 低点标记 */}
          <div className="absolute top-0 left-0 transform -translate-y-full text-center bg-white px-1.5 py-0.5 rounded shadow-sm cursor-help group/low">
            <span className="block text-xs text-gray-500">低点</span>
            <span className="block text-sm font-bold text-red-700">-{troughDrawdown.toFixed(1)}%</span>
            {/* Hover tip */}
            <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover/low:opacity-100 transition-opacity z-50 w-36 pointer-events-none">
              <div className="text-gray-300">日期: {formatDateDisplay(troughDate) || '-'}</div>
              <div className="text-gray-300">净值: {troughNav.toFixed(4)}</div>
            </div>
          </div>

          {/* 当前标记 - 当接近低点或高点时，显示到标尺下方，与低点/高点对齐 */}
          <div
            className={`absolute top-0 transform text-center bg-white px-1.5 py-0.5 rounded shadow-sm cursor-help group/current ${
              isNearLow
                ? 'translate-y-full -mt-7 left-0' // 接近低点：左对齐，与低点标记对齐
                : isNearHigh
                  ? 'translate-y-full -mt-7 right-0' // 接近高点：右对齐，与高点标记对齐
                  : '-translate-y-full -translate-x-1/2' // 中间位置：居中显示在上方
            }`}
            style={!isNearLow && !isNearHigh ? { left: `${recoveryProgress}%` } : undefined}
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setCurrentTooltipPos({ x: rect.left, y: rect.top });
              setShowCurrentTooltip(true);
            }}
            onMouseLeave={() => setShowCurrentTooltip(false)}
          >
            {isNearLow || isNearHigh ? (
              <>
                <span className="block text-xs text-gray-500">当前</span>
                <span className="block text-sm font-bold text-orange-600">-{currentDrawdown.toFixed(1)}%</span>
              </>
            ) : (
              <>
                <span className="block text-xs text-gray-500">当前</span>
                <span className="block text-sm font-bold text-orange-600">-{currentDrawdown.toFixed(1)}%</span>
              </>
            )}
          </div>

          {/* 高点标记 */}
          <div className="absolute top-0 right-0 transform -translate-y-full text-center bg-white px-1.5 py-0.5 rounded shadow-sm cursor-help group/high">
            <span className="block text-xs text-gray-500">高点</span>
            <span className="block text-sm font-bold text-green-700">0%</span>
            {/* Hover tip */}
            <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover/high:opacity-100 transition-opacity z-50 w-36 pointer-events-none">
              <div className="text-gray-300">日期: {formatDateDisplay(snapshot.currentDrawdownPeakDate) || '-'}</div>
              <div className="text-gray-300">净值: {peakNav.toFixed(4)}</div>
            </div>
          </div>

          {/* 进度条 */}
          <div className="h-2 bg-red-100 rounded-lg relative">
            <div
              className="absolute top-0 left-0 h-full rounded-lg bg-gradient-to-r from-red-500 to-orange-500"
              style={{ width: `${recoveryProgress}%` }}
            />
          </div>

          {/* "当前"标记的 tooltip - 使用 createPortal 避免被遮挡 */}
          {showCurrentTooltip && createPortal(
            <div
              className="fixed px-3 py-2 bg-gray-800 text-white text-xs rounded-lg shadow-lg z-[9999] w-36 pointer-events-none"
              style={{
                left: currentTooltipPos.x,
                top: currentTooltipPos.y,
                transform: 'translateY(-100%)',
                marginTop: -8,
              }}
            >
              <div className="text-gray-300">日期: {formatDateDisplay(currentDate) || '-'}</div>
              <div className="text-gray-300">净值: {currentNav.toFixed(4)}</div>
            </div>,
            document.body
          )}
        </div>

        {/* 恢复统计 */}
        <div className="grid grid-cols-3 gap-3 mt-5">
          <div className="bg-gray-50 rounded-lg p-3 text-center relative group cursor-help">
            <div className="text-xl font-bold text-gray-800">-{maxDrawdown.toFixed(2)}%</div>
            <div className="text-xs text-gray-500 mt-1">历史最大回撤</div>
            {/* Hover tip */}
            {snapshot.maxDrawdownPeakDate && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 w-56 pointer-events-none">
                <div className="text-gray-300 font-medium mb-1">历史最大回撤详情</div>
                <div className="text-gray-400">
                  <span className="text-green-300">开始</span> {formatDateDisplay(snapshot.maxDrawdownPeakDate)}
                  <div className="pl-4 text-gray-300">净值: {snapshot.maxDrawdownPeakProfit.toFixed(4)}</div>
                </div>
                {(() => {
                  const isCurrentDrawdown = snapshot.maxDrawdown === snapshot.currentDrawdown &&
                    snapshot.maxDrawdownPeakDate === snapshot.currentDrawdownPeakDate;
                  if (isCurrentDrawdown && snapshot.currentDate) {
                    return (
                      <div className="text-gray-400 mt-1">
                        <span className="text-yellow-300">当前</span> {formatDateDisplay(snapshot.currentDate)}
                        <div className="pl-4 text-gray-300">净值: {snapshot.currentNav.toFixed(4)}</div>
                      </div>
                    );
                  } else if (snapshot.maxDrawdownTroughDate) {
                    return (
                      <div className="text-gray-400 mt-1">
                        <span className="text-red-300">结束</span> {formatDateDisplay(snapshot.maxDrawdownTroughDate)}
                        <div className="pl-4 text-gray-300">净值: {snapshot.maxDrawdownTroughProfit.toFixed(4)}</div>
                      </div>
                    );
                  }
                  return null;
                })()}
                <div className="text-gray-400 mt-1">持续: {snapshot.maxDrawdownDays > 0 ? `${snapshot.maxDrawdownDays}天` : '-'}</div>
              </div>
            )}
          </div>
          <div className="relative group">
            <div className="bg-gray-50 rounded-lg p-3 text-center cursor-help">
              <div className="text-xl font-bold text-gray-800">{maxRecoveryDays > 0 ? `${maxRecoveryDays}天` : '--'}</div>
              <div className="text-xs text-gray-500 mt-1">历史最长恢复</div>
            </div>
            {/* Tooltip */}
            {maxRecoveryDays > 0 && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-10 w-56 pointer-events-none">
                <div className="text-gray-300">
                  <span className="text-green-300">回撤开始</span> {formatDateDisplay(snapshot.maxRecoveryPeakDate) || '-'}
                </div>
                <div className="text-gray-400">
                  <span className="text-red-300">回撤低点</span> {formatDateDisplay(snapshot.maxRecoveryTroughDate) || '-'}
                </div>
                {snapshot.maxRecoveryRecoveryDate ? (
                  <div className="text-gray-300">
                    <span className="text-blue-300">恢复完成</span> {formatDateDisplay(snapshot.maxRecoveryRecoveryDate)}
                  </div>
                ) : (
                  <div className="text-yellow-400">回撤进行中</div>
                )}
              </div>
            )}
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-gray-800">{estimatedRemainingDays}</div>
            <div className="text-xs text-gray-500 mt-1">预估剩余恢复</div>
          </div>
        </div>
      </div>
      </div>

      {/* 各基金回撤情况 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b-2 border-red-200 flex items-center gap-2">
          📊 各基金回撤情况
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left py-3 px-4 font-semibold text-gray-600">基金名称</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-600">当前回撤</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-600">历史最大</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">恢复进度</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-600">状态</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.fundDrawdowns
              .slice()
              .sort((a, b) => b.currentDrawdown - a.currentDrawdown)
              .map((fd) => {
              // 计算恢复进度
              const progress = fd.maxDrawdown > 0
                ? Math.max(0, Math.min(100, ((fd.maxDrawdown - fd.currentDrawdown) / fd.maxDrawdown) * 100))
                : 100;

              const status = fd.currentDrawdown >= thresholds.drawdown.high ? 'danger' :
                             fd.currentDrawdown >= thresholds.drawdown.low ? 'warning' : 'safe';

              return (
                <tr
                  key={fd.symbol}
                  className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => onSelectFund?.(fd.symbol)}
                >
                  <td className="py-3 px-4 text-gray-800 font-medium">{fd.name}</td>
                  {/* 当前回撤列 - 带 tooltip */}
                  <TooltipCell
                    className="py-3 px-4 text-right"
                    tooltipContent={
                      <>
                        <div className="text-gray-300">开始: {formatDateDisplay(fd.peakDate) || '-'}</div>
                        {fd.peakReturnRate !== undefined ? (
                          <div className="text-gray-400">开始收益率: {fd.peakReturnRate.toFixed(2)}%</div>
                        ) : (
                          <div className="text-gray-400">开始净值: {fd.peakValue.toFixed(4)}</div>
                        )}
                        <div className="text-gray-300 mt-1">
                          <span className="text-yellow-300">当前</span>
                          {fd.currentReturnRate !== undefined ? (
                            <div className="text-gray-400">当前收益率: {fd.currentReturnRate.toFixed(2)}%</div>
                          ) : (
                            <div className="text-gray-400">当前净值: {fd.currentValue.toFixed(4)}</div>
                          )}
                        </div>
                        <div className="text-gray-300 mt-1">持续: {fd.currentDrawdownDays}天</div>
                      </>
                    }
                  >
                    <span className={`font-semibold ${
                      status === 'danger' ? 'text-red-600' :
                      status === 'warning' ? 'text-orange-600' : 'text-green-600'
                    }`}>
                      {fd.currentDrawdown.toFixed(2)}%
                    </span>
                  </TooltipCell>
                  {/* 历史最大列 - 带 tooltip */}
                  <TooltipCell
                    className="py-3 px-4 text-right"
                    tooltipContent={
                      <>
                        <div className="text-gray-300">开始: {formatDateDisplay(fd.maxDrawdownPeakDate) || '-'}</div>
                        {fd.maxDrawdownPeakReturnRate !== undefined ? (
                          <div className="text-gray-400">开始收益率: {fd.maxDrawdownPeakReturnRate.toFixed(2)}%</div>
                        ) : fd.maxDrawdownPeakNav !== undefined && (
                          <div className="text-gray-400">开始净值: {fd.maxDrawdownPeakNav.toFixed(4)}</div>
                        )}
                        {(() => {
                          // 判断最大回撤是否还没结束（就是当前回撤）
                          // 如果最大回撤峰值日期 = 当前回撤峰值日期，说明最大回撤就是当前回撤
                          const isCurrentDrawdown = fd.maxDrawdownPeakDate === fd.peakDate;
                          if (isCurrentDrawdown) {
                            // 最大回撤还没结束，和当前回撤一样显示
                            return (
                              <>
                                <div className="text-gray-300 mt-1">
                                  <span className="text-yellow-300">当前</span>
                                  {fd.currentReturnRate !== undefined ? (
                                    <div className="text-gray-400">当前收益率: {fd.currentReturnRate.toFixed(2)}%</div>
                                  ) : fd.currentValue !== undefined && (
                                    <div className="text-gray-400">当前净值: {fd.currentValue.toFixed(4)}</div>
                                  )}
                                </div>
                                <div className="text-gray-300 mt-1">持续: {fd.currentDrawdownDays}天</div>
                              </>
                            );
                          }
                          // 最大回撤已结束，显示结束信息
                          return (
                            <>
                              <div className="text-gray-300 mt-1">
                                <span className="text-red-300">结束</span> {formatDateDisplay(fd.maxDrawdownTroughDate) || '-'}
                              </div>
                              {fd.maxDrawdownTroughReturnRate !== undefined ? (
                                <div className="text-gray-400">结束收益率: {fd.maxDrawdownTroughReturnRate.toFixed(2)}%</div>
                              ) : fd.maxDrawdownTroughNav !== undefined && (
                                <div className="text-gray-400">结束净值: {fd.maxDrawdownTroughNav.toFixed(4)}</div>
                              )}
                              <div className="text-gray-300 mt-1">持续: {fd.maxDrawdownDays}天</div>
                            </>
                          );
                        })()}
                      </>
                    }
                  >
                    <span className="text-gray-500">{fd.maxDrawdown.toFixed(2)}%</span>
                  </TooltipCell>
                  {/* 恢复进度列 - 带 tooltip */}
                  <TooltipCell
                    className="py-3 px-4"
                    tooltipContent={
                      <>
                        <div className="text-gray-400">
                          <span className="text-green-300">高点</span>
                          {fd.peakReturnRate !== undefined ? (
                            <span className="pl-4 text-gray-300">收益率: {fd.peakReturnRate.toFixed(2)}%</span>
                          ) : (
                            <span className="pl-4 text-gray-300">净值: {fd.peakValue.toFixed(4)}</span>
                          )}
                        </div>
                        <div className="text-gray-400 mt-1">
                          <span className="text-red-300">低点</span>
                          {fd.troughReturnRate !== undefined ? (
                            <span className="pl-4 text-gray-300">收益率: {fd.troughReturnRate.toFixed(2)}%</span>
                          ) : fd.troughValue !== undefined ? (
                            <span className="pl-4 text-gray-300">净值: {fd.troughValue.toFixed(4)}</span>
                          ) : (
                            <span className="pl-4 text-gray-300">净值: --</span>
                          )}
                        </div>
                        <div className="text-gray-400 mt-1">
                          <span className="text-orange-300">当前</span>
                          {fd.currentReturnRate !== undefined ? (
                            <span className="pl-4 text-gray-300">收益率: {fd.currentReturnRate.toFixed(2)}%</span>
                          ) : (
                            <span className="pl-4 text-gray-300">净值: {fd.currentValue.toFixed(4)}</span>
                          )}
                        </div>
                      </>
                    }
                  >
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-20 h-1.5 bg-gray-200 rounded">
                        <div
                          className={`h-full rounded ${
                            progress >= 70 ? 'bg-green-500' :
                            progress >= 35 ? 'bg-orange-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">{Math.round(progress)}%</span>
                    </div>
                  </TooltipCell>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      status === 'danger' ? 'bg-red-100 text-red-700' :
                      status === 'warning' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {status === 'danger' ? '高风险' : status === 'warning' ? '中等' : '正常'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RiskMonitorModal;