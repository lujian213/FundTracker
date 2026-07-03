import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchFundHistory as defaultFetchFundHistory, prepareHistoryForProfitCalculation } from '../services/fundService';
import useTrades from '../hooks/useTrades';
import { useModalBodyStyle } from '../hooks/useModalBodyStyle';
import { computeProfitTimeline } from '../utils/profitCalculator';
import { HistoricalPoint, ProfitPoint } from '../types';
import { toLocalDateKey } from '../utils/priceResolver';
import { adjustProfitTimelineForDisplay } from '../utils/profitAdjustment';
import { formatMoneyWithSeparators, fmtNav } from '../utils/format';
import { formatDateDisplay } from '../utils/dateFormat';
import { buildLinearPath, CHART_DIMENSIONS, mergeChartPoints, ChartPointWithData } from '../utils/chartUtils';
import { MoneyCell } from './MoneyCell';
import { SymbolBadge } from './SymbolBadge';

interface ProfitModalProps {
  symbol: string;
  fundName?: string;
  currentPrice?: number;
  previousPrice?: number;
  realtimeDate?: string | null;
  netWorthDate?: string | null;
  onClose: () => void;
  initialPosition?: number;
  initialPrice?: number | null;
  initialStartDate?: string | null;
  fetchHistory?: (symbol: string) => Promise<HistoricalPoint[]>;
  zIndex?: number;
}

const ProfitModal: React.FC<ProfitModalProps> = ({ symbol, fundName, currentPrice, previousPrice, realtimeDate, netWorthDate, onClose, initialPosition = 0, initialPrice = null, initialStartDate = null, fetchHistory, zIndex = 130 }) => {
  useModalBodyStyle();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoricalPoint[]>([]);
  const [historyEndDate, setHistoryEndDate] = useState<string | null>(null); // 原始历史数据的最后日期
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const chartWrapRef = useRef<HTMLDivElement | null>(null);
  const chartSvgRef = useRef<SVGSVGElement | null>(null);

  const { trades } = useTrades(symbol);
  const fetchFn = fetchHistory ?? defaultFetchFundHistory;

  const resolvedInitialPrice = useMemo(() => {
    if (initialPrice !== null) return initialPrice;
    if (!initialStartDate || !history || history.length === 0) return null;
    const targetEnd = new Date(`${initialStartDate} 23:59:59.999`).getTime();
    for (const h of history) {
      const hd = new Date(h.date as number);
      const hIso = `${hd.getFullYear()}-${String(hd.getMonth()+1).padStart(2,'0')}-${String(hd.getDate()).padStart(2,'0')}`;
      if (hIso === initialStartDate) return h.value;
    }
    const sorted = [...history].sort((a, b) => (a.date as number) - (b.date as number));
    let best: number | null = null;
    for (const h of sorted) {
      if ((h.date as number) <= targetEnd) best = h.value;
      else break;
    }
    return best ?? (sorted.length > 0 ? sorted[0].value : null);
  }, [initialPrice, initialStartDate, history]);

  const todayLocal = useMemo(() => toLocalDateKey(new Date()), []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        let pts = await fetchFn(symbol);
        if (!mounted) return;

        // 使用公共函数准备历史数据（与 computeOverallProfit 一致）
        pts = prepareHistoryForProfitCalculation({
          history: pts || [],
          targetDate: todayLocal,
          todayDate: todayLocal,
          currentPrice,
          realtimeDate,
          previousPrice,
          netWorthDate,
        });

        setHistory(pts);
        if (pts.length > 0) {
          const first = toLocalDateKey(pts[0].date);
          // 找到有有效数据的最后一天：优先用 realtimeDate，否则用原始历史数据的最后一天
          // realtimeDate 是当前实际价格的日期，应该作为"有数据的最后一天"
          const lastWithData = realtimeDate && realtimeDate <= todayLocal ? realtimeDate : toLocalDateKey(pts[pts.length - 1].date);
          setHistoryEndDate(lastWithData);
          const defaultFrom = initialStartDate && initialStartDate > first ? initialStartDate : first;
          setFromDate(defaultFrom);
          // 默认结束日期用有数据的最后一天，而不是今天（避免计算没有数据的日期）
          setToDate(lastWithData);
        } else {
          setHistoryEndDate(null);
        }
      } catch (e: any) {
        setError(e?.message || '加载历史数据失败');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [symbol, fetchFn, initialStartDate, currentPrice, previousPrice, realtimeDate, netWorthDate, todayLocal]);

  const fullTimeline = useMemo(() => {
    if (!history || history.length === 0) return [];
    const timeline = computeProfitTimeline({
      history,
      trades: trades || [],
      initialPosition: initialPosition || 0,
      initialPrice: resolvedInitialPrice ?? null,
      historyEndDate,
      toDate,
    });

    return timeline;
  }, [history, trades, initialPosition, resolvedInitialPrice, historyEndDate, toDate]);

  const validateDates = (from?: string | null, to?: string | null) => {
    setValidationError(null);
    if (!from || !to) return true;
    if (from > to) { setValidationError('开始日期必须早于或等于结束日期。'); return false; }
    if (initialStartDate && from < initialStartDate) { setValidationError('开始日期不能早于持仓起始日期。'); return false; }
    return true;
  };

  useEffect(() => { validateDates(fromDate, toDate); }, [fromDate, toDate, initialStartDate]);

  const selectedTimeline = useMemo(() => {
    if (!fullTimeline || fullTimeline.length === 0) return [];
    if (!fromDate || !toDate) return fullTimeline;
    return fullTimeline.filter(p => p.date >= fromDate && p.date <= toDate);
  }, [fullTimeline, fromDate, toDate]);

  const displayedTimeline = useMemo(() => {
    if (!selectedTimeline || selectedTimeline.length === 0) return [];
    const seen = new Set<string>();
    const dedup: ProfitPoint[] = [];
    for (const s of selectedTimeline) {
      if (seen.has(s.date)) continue;
      seen.add(s.date);
      dedup.push({ ...s });
    }

    // 使用公共函数调整盈亏时间线
    // 无论用户选择的开始日期是什么，都应将该日期的当日盈亏设为0
    // 作为从该日起计算收益的参考基准
    return adjustProfitTimelineForDisplay(dedup, fromDate);
  }, [selectedTimeline, fromDate, initialStartDate]);

  const periodTotal = useMemo(() => (displayedTimeline || []).reduce((s, p) => s + (p.dailyProfit || 0), 0), [displayedTimeline]);

  const chart = useMemo(() => {
    if (!displayedTimeline || displayedTimeline.length === 0) return { path: '', areaPath: '', points: [], originalPoints: [], xTicks: [], yTicks: [], width: CHART_DIMENSIONS.width, height: CHART_DIMENSIONS.height, padLeft: CHART_DIMENSIONS.padLeft, padRight: CHART_DIMENSIONS.padRight, zeroY: 100 };
    const { width: w, height: h, padLeft, padRight, padTop, padBottom } = CHART_DIMENSIONS;
    const vals = displayedTimeline.map(p => p.cumulativeProfit || 0);
    const dataMin = Math.min(...vals);
    const dataMax = Math.max(...vals);

    // Y轴范围必须包含0，且边界对齐到1000的倍数
    const yAxisMin = dataMin >= 0 ? 0 : Math.floor(dataMin / 1000) * 1000;
    const yAxisMax = dataMax <= 0 ? 0 : Math.ceil(dataMax / 1000) * 1000;

    // 确保有足够的范围（至少2000，避免只有0刻度的情况）
    const finalMin = yAxisMax === 0 ? Math.min(yAxisMin, -1000) : yAxisMin;
    const finalMax = yAxisMin === 0 ? Math.max(yAxisMax, 1000) : yAxisMax;

    const range = finalMax - finalMin || 1;

    // 根据范围选择合适的间隔（1000的倍数），使刻度数量在3-6个之间
    const targetTicks = 5;
    let tickInterval = 1000;
    const possibleIntervals = [1000, 2000, 5000, 10000, 20000, 50000, 100000];
    for (const interval of possibleIntervals) {
      const tickCount = Math.ceil(range / interval) + 1;
      if (tickCount <= targetTicks) {
        tickInterval = interval;
        break;
      }
    }

    // X坐标计算基于索引（时间均匀分布）
    const getX = (i: number, total: number) => padLeft + (i * (w - padLeft - padRight) / (total - 1 || 1));
    const getY = (v: number) => h - padBottom - ((v - finalMin) / range) * (h - padTop - padBottom);
    const zeroY = getY(0);

    // 创建原始点数组（用于 hover 检测）
    const originalPts: ChartPointWithData[] = displayedTimeline.map((p, i) => ({
      x: getX(i, displayedTimeline.length),
      y: getY(p.cumulativeProfit || 0),
      data: { date: p.date, dailyProfit: p.dailyProfit || 0, cumulativeProfit: p.cumulativeProfit || 0 }
    }));

    // 合并点用于显示（保持视觉清晰）
    // 注意：合并后的点保留原始X坐标，不重新计算
    // 这样确保显示的点位置与hover检测区域一致
    const displayPts = mergeChartPoints(originalPts);

    const path = buildLinearPath(displayPts, { chartHeight: h, paddingBottom: padBottom });
    const areaPath = buildLinearPath(displayPts, { closePath: true, chartHeight: h, paddingBottom: padBottom });
    const xTicks = [0, Math.floor((displayPts.length - 1) / 2), displayPts.length - 1].map(i => ({
      x: displayPts[i].x,
      label: formatDateDisplay(displayPts[i].data.date)
    }));

    // Y轴刻度：从finalMin到finalMax，步长为tickInterval
    const yTicks: { y: number; label: string; isZero: boolean }[] = [];
    const firstTick = Math.ceil(finalMin / tickInterval) * tickInterval;
    for (let v = firstTick; v <= finalMax; v += tickInterval) {
      yTicks.push({ y: getY(v), label: (v >= 0 ? '+' : '') + v, isZero: v === 0 });
    }

    return {
      path,
      areaPath,
      points: displayPts,        // 合并后的点，用于显示折线和圆点
      originalPoints: originalPts, // 原始点，用于 hover 检测
      xTicks,
      yTicks,
      padLeft,
      padRight,
      padTop,
      padBottom,
      width: w,
      height: h,
      zeroY,
      mergedCount: displayPts.length,
      originalCount: originalPts.length
    };
  }, [displayedTimeline]);

  const tableScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollTop = tableScrollRef.current.scrollHeight;
    }
  }, [displayedTimeline]);

  const content = (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-4xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col overflow-hidden" style={{ maxWidth: '64rem' }} role="dialog" aria-modal="true">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center space-x-2">
            <h3 className="text-lg font-bold">{fundName || symbol}</h3>
            <SymbolBadge symbol={symbol} />
            <span className="text-gray-400">—</span>
            <span className="text-gray-600">持仓盈亏</span>
          </div>
          <button aria-label="关闭盈亏窗口" className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100" onClick={onClose}><i className="fas fa-times"></i></button>
        </div>
        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-6"><i className="fas fa-circle-notch animate-spin text-red-500 text-3xl" /><p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-3">正在加载历史数据...</p></div>
          ) : error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : (!fullTimeline || fullTimeline.length === 0) ? (
            <div className="text-sm text-gray-600">暂无历史净值数据，无法计算盈亏。</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-xs text-gray-600">
                  <label htmlFor="from-date">开始</label>
                  <input id="from-date" type="date" value={fromDate ?? ''} onChange={e => { setFromDate(e.target.value); }} className="px-2 py-1 border rounded" />
                  <label htmlFor="to-date">结束</label>
                  <input id="to-date" type="date" value={toDate ?? ''} onChange={e => { setToDate(e.target.value); }} className="px-2 py-1 border rounded" />
                  <button
                    onClick={() => {
                      if (history.length > 0) {
                        const first = toLocalDateKey(history[0].date);
                        const last = toLocalDateKey(history[history.length - 1].date);
                        const defaultFrom = initialStartDate && initialStartDate > first ? initialStartDate : first;
                        setFromDate(defaultFrom);
                        const defaultTo = last && last < todayLocal ? last : todayLocal;
                        setToDate(defaultTo);
                      }
                    }}
                    className="px-3 py-1 rounded bg-gray-100 text-xs hover:bg-gray-200"
                    title="重置开始和结束时间为默认值"
                  >
                    重置
                  </button>
                </div>
              </div>
              {validationError ? (
                <div className="text-sm text-red-600">{validationError}</div>
              ) : (
                <>
                  {/* Chart */}
                  <div ref={chartWrapRef} className="bg-gradient-to-b from-gray-50 to-white rounded-xl p-4 relative shadow-inner">
                    <svg ref={chartSvgRef} className="w-full drop-shadow-sm" viewBox={`0 0 ${chart.width ?? 960} ${chart.height ?? 200}`} style={{ height: chart.height ?? 200 }} onMouseLeave={() => setHoverIndex(null)}>
                      {/* 背景渐变定义 */}
                      <defs>
                        <linearGradient id="profitAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.2" />
                          <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                        </linearGradient>
                      </defs>

                      {/* Y轴网格线 */}
                      {chart.yTicks && chart.yTicks.map((t, i) => (
                        <g key={'y'+i}>
                          <line
                            x1={chart.padLeft ?? 80}
                            x2={(chart.width ?? 960) - (chart.padRight ?? 20)}
                            y1={t.y}
                            y2={t.y}
                            stroke="#e2e8f0"
                            strokeWidth="1"
                            strokeDasharray="4 4"
                          />
                          <text
                            x={(chart.padLeft ?? 80) - 12}
                            y={t.y}
                            textAnchor="end"
                            alignmentBaseline="middle"
                            className="text-[10px] fill-gray-400 font-mono"
                          >
                            {t.label}
                          </text>
                        </g>
                      ))}

                      {/* X轴刻度 */}
                      {chart.xTicks && chart.xTicks.map((t, i) => (
                        <text
                          key={'x'+i}
                          x={t.x}
                          y={(chart.height ?? 200) - 8}
                          textAnchor="middle"
                          className="text-[10px] fill-gray-400 font-medium"
                        >
                          {t.label}
                        </text>
                      ))}

                      {/* 填充区域 */}
                      {chart.areaPath && (
                        <path
                          d={chart.areaPath}
                          fill="url(#profitAreaGradient)"
                          style={{ pointerEvents: 'none' }}
                        />
                      )}

                      {/* 主折线 */}
                      <path
                        d={chart.path}
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ pointerEvents: 'none' }}
                      />

                      {/* 折线上的空心小圆点 */}
                      {chart.points.map((pt, i) => (
                        <circle
                          key={`pt-${i}`}
                          cx={pt.x}
                          cy={pt.y}
                          r={2}
                          fill="#fff"
                          stroke="#ef4444"
                          strokeWidth={1}
                          style={{ pointerEvents: 'none' }}
                        />
                      ))}

                      {/* 最新点脉冲动画 */}
                      {chart.points.length > 0 && (
                        <circle
                          cx={chart.points[chart.points.length - 1].x}
                          cy={chart.points[chart.points.length - 1].y}
                          r={4}
                          fill="#ef4444"
                          className="animate-pulse"
                        />
                      )}

                      {/* 悬停检测区域：使用原始点覆盖全图表 */}
                      {chart.originalPoints.map((pt, i) => (
                        <rect
                          key={i}
                          x={pt.x - 5}
                          y={0}
                          width={10}
                          height={Math.max(1, (chart.height ?? 200) - 40)}
                          fill="transparent"
                          onMouseEnter={() => setHoverIndex(i)}
                          className="cursor-crosshair"
                        />
                      ))}
                    </svg>
                    {hoverIndex !== null && chart.originalPoints[hoverIndex] && (() => {
                      // tooltip定位：优先放在点的一侧，避免遮挡点和超出边界
                      const containerRect = chartWrapRef.current?.getBoundingClientRect();
                      const svgRect = chartSvgRef.current?.getBoundingClientRect();
                      if (!containerRect || !svgRect) return null;

                      const vbW = chart.width ?? 960;
                      const vbH = chart.height ?? 200;
                      // SVG坐标转换为像素坐标
                      const scaleX = svgRect.width / vbW;
                      const scaleY = svgRect.height / vbH;
                      const ptX = chart.originalPoints[hoverIndex].x * scaleX;
                      const ptY = chart.originalPoints[hoverIndex].y * scaleY;

                      // tooltip尺寸（固定宽度避免换行）
                      const tooltipWidth = 160;
                      const tooltipHeight = 60;
                      const gap = 20; // 点与tooltip的间距，确保不遮挡
                      const margin = 12;

                      // 悬停点在SVG中的宽度约为10px（rect宽度），加上圆点约7px
                      // 水平定位：点在左半边时tooltip在右侧，点在右半边时tooltip在左侧
                      const pointIsOnLeft = ptX < containerRect.width / 2;
                      const left = pointIsOnLeft
                        ? Math.min(containerRect.width - tooltipWidth - margin, ptX + gap + 5) // +5为悬停区域半径
                        : Math.max(margin, ptX - tooltipWidth - gap - 5);

                      // 垂直定位：尽量与点Y对齐，确保不超出容器
                      const top = Math.max(margin, Math.min(containerRect.height - tooltipHeight - margin, ptY - tooltipHeight / 2));

                      return (
                        <div
                          className="absolute z-20 bg-white/95 backdrop-blur-sm px-3 py-2 rounded-lg shadow-lg border border-gray-100 whitespace-nowrap"
                          style={{ left, top, width: tooltipWidth, pointerEvents: 'none' }}
                        >
                          <div className="text-xs text-gray-400 font-mono">{formatDateDisplay(chart.originalPoints[hoverIndex].data.date)}</div>
                          <div className="text-xs font-mono mt-1">
                            <span className="text-gray-400">当日</span>
                            <span className={`ml-2 font-medium ${chart.originalPoints[hoverIndex].data.dailyProfit > 0 ? 'text-red-600' : chart.originalPoints[hoverIndex].data.dailyProfit < 0 ? 'text-green-600' : 'text-gray-700'}`}>{chart.originalPoints[hoverIndex].data.dailyProfit === 0 ? '-' : (chart.originalPoints[hoverIndex].data.dailyProfit > 0 ? '+' : '') + formatMoneyWithSeparators(chart.originalPoints[hoverIndex].data.dailyProfit)}</span>
                          </div>
                          <div className="text-xs font-mono">
                            <span className="text-gray-400">累计</span>
                            <span className={`ml-2 font-medium ${chart.originalPoints[hoverIndex].data.cumulativeProfit > 0 ? 'text-red-600' : chart.originalPoints[hoverIndex].data.cumulativeProfit < 0 ? 'text-green-600' : 'text-gray-700'}`}>
                              {chart.originalPoints[hoverIndex].data.cumulativeProfit === 0 ? '-' : (chart.originalPoints[hoverIndex].data.cumulativeProfit > 0 ? '+' : '') + formatMoneyWithSeparators(chart.originalPoints[hoverIndex].data.cumulativeProfit)}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Table */}
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <div ref={tableScrollRef} className="overflow-y-auto" style={{ maxHeight: '330px' }}>
                      <table className="w-full text-sm table-fixed border-collapse">
                        <colgroup>
                          <col style={{ width: '34%' }} />
                          <col style={{ width: '22%' }} />
                          <col style={{ width: '22%' }} />
                          <col style={{ width: '22%' }} />
                        </colgroup>
                        <thead className="sticky top-0 z-10 bg-gray-50">
                          <tr className="border-b border-gray-200">
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">日期</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">净值</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">当日盈利</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">累计盈利</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayedTimeline.map(row => (
                            <tr key={row.date} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                              <td className="px-3 py-2 text-left text-xs text-gray-700">{formatDateDisplay(row.date)}</td>
                              <td className="px-3 py-2 text-right text-xs text-gray-700">{(row.netValue !== undefined && row.netValue !== null) ? fmtNav(row.netValue) : '-'}</td>
                              <td className="px-3 py-2 text-right text-xs"><MoneyCell value={row.dailyProfit} /></td>
                              <td className="px-3 py-2 text-right text-xs"><MoneyCell value={row.cumulativeProfit} /></td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="sticky bottom-0 z-10 bg-gray-50">
                          <tr className="border-t border-gray-200">
                            <td className="px-3 py-2 text-left text-xs font-bold text-gray-700">总计：{displayedTimeline.length}条记录</td>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-right text-xs font-bold">
                              {periodTotal === 0 ? <span className="text-black">-</span> : (periodTotal > 0 ? <span className="text-red-600">+{formatMoneyWithSeparators(periodTotal)}</span> : <span className="text-green-600">{formatMoneyWithSeparators(periodTotal)}</span>)}
                            </td>
                            <td className="px-3 py-2" />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default ProfitModal;

