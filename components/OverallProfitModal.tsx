import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { computeOverallProfit } from '../services/fundService';
import { OverallProfitSummary, OverallProfitPoint, OverallFundRow } from '../types';
import { toLocalDateKey } from '../utils/priceResolver';
import { OVERALL_PROFIT_DATE_PRESETS, getOverallProfitPresetRange, OverallProfitDatePresetKey } from '../utils/overallProfitDatePresets';
import { formatMoney, formatMoneyWithSeparators } from '../utils/format';
import { formatDateDisplay } from '../utils/dateFormat';

interface Props {
  symbols?: string[];
  onClose: () => void;
  onSelectFund?: (symbol: string) => void;
}

const OverallProfitModal: React.FC<Props> = ({ symbols, onClose, onSelectFund }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<OverallProfitSummary | null>(null);
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  // 图表 x 轴起始日期（= defaultFrom，即持仓最早 startDate），与表格日期选择器分离
  const [chartFromDate, setChartFromDate] = useState<string | null>(null);

  const chartWrapRef = useRef<HTMLDivElement | null>(null);
  const chartSvgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        // 一次计算：获取完整时间线，用于图表和表格
        const base = await computeOverallProfit({ symbols });
        if (!mounted) return;

        // 确定 defaultTo（日期2）：时间轴最后一天
        const defaultTo = base.timeline && base.timeline.length > 0 ? base.timeline[base.timeline.length - 1].date : null;

        // 确定 defaultFrom（日期1）：defaultTo 的前一天
        let defaultFrom: string | null = null;
        if (defaultTo) {
          const toDate = new Date(defaultTo);
          toDate.setDate(toDate.getDate() - 1);
          defaultFrom = toLocalDateKey(toDate);
        }

        setFromDate(defaultFrom);
        setToDate(defaultTo);
        // 记录图表 x 轴起始日期，用于裁剪 chartTimeline（与表格日期选择器分离）
        // 使用所有基金持仓开始日期（startDate）的最小值作为图表 x 轴起点
        const allStartDates = (base.perFund || []).map(f => f.startDate).filter((d): d is string => !!d);
        const minStartDate = allStartDates.length > 0 ? allStartDates.reduce((a, b) => (a < b ? a : b)) : null;
        // 若无任何基金配置持仓开始日期，chartFromDate 保持 null，UI 将显示空状态提示
        setChartFromDate(minStartDate);

        // 直接使用第一次计算的完整结果，无需第二次请求
        // 表格行裁剪由下方的 useEffect（依赖 fromDate/toDate）负责
        setSummary(base);
      } catch (e: any) {
        setError(e?.message || '计算整体盈亏失败');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    init();
    return () => { mounted = false; };
  }, [symbols]);

  // NOTE: do not re-run full computation when fromDate/toDate change. We keep the chart's x-axis fixed
  // to the full summary.timeline and only use fromDate/toDate to filter table rows built from precomputed perFundTimelines.
  // This avoids expensive recomputations on every picker change.
  useEffect(() => {
    // nothing here intentionally
  }, []);

  // Chart timeline: 从 chartFromDate 开始裁剪，确保 x 轴从持仓起始日期开始，不显示更早的历史数据
  const chartTimeline = useMemo(() => {
    if (!summary) return [] as OverallProfitPoint[];
    if (!chartFromDate) return summary.timeline;
    return summary.timeline.filter(p => p.date >= chartFromDate);
  }, [summary, chartFromDate]);

  const chart = useMemo(() => {
    const pts = chartTimeline;
    if (!pts || pts.length === 0) return { path: '', areaPath: '', points: [], xTicks: [], yTicks: [], width: 760, height: 200, padLeft: 60, padRight: 24, zeroY: 100 };
    const w = 760; const h = 200;
    const padLeft = 60; const padRight = 24; const padTop = 20; const padBottom = 32;
    const vals = pts.map(p => p.cumulativeProfit || 0);
    const dataMin = Math.min(...vals);
    const dataMax = Math.max(...vals);

    // Y轴范围必须包含0，且边界对齐到10000的倍数
    const yAxisMin = dataMin >= 0 ? 0 : Math.floor(dataMin / 10000) * 10000;
    const yAxisMax = dataMax <= 0 ? 0 : Math.ceil(dataMax / 10000) * 10000;

    // 确保有足够的范围（至少20000，避免只有0刻度的情况）
    const finalMin = yAxisMax === 0 ? Math.min(yAxisMin, -10000) : yAxisMin;
    const finalMax = yAxisMin === 0 ? Math.max(yAxisMax, 10000) : yAxisMax;

    const range = finalMax - finalMin || 1;

    // 根据范围选择合适的间隔（10000的倍数），使刻度数量在3-6个之间
    const targetTicks = 5;
    let tickInterval = 10000;
    const possibleIntervals = [10000, 20000, 50000, 100000, 200000, 500000];
    for (const interval of possibleIntervals) {
      const tickCount = Math.ceil(range / interval) + 1;
      if (tickCount <= targetTicks) {
        tickInterval = interval;
        break;
      }
    }

    const getX = (i: number) => padLeft + (i * (w - padLeft - padRight) / (pts.length - 1));
    const getY = (v: number) => h - padBottom - ((v - finalMin) / range) * (h - padTop - padBottom);
    const zeroY = getY(0);
    const points = pts.map((p, i) => ({ x: getX(i), y: getY(p.cumulativeProfit || 0), data: p }));

    // 使用贝塞尔曲线平滑路径
    const buildSmoothPath = (pts: { x: number; y: number }[], closePath = false) => {
      if (pts.length < 2) return '';
      let d = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
      }
      if (closePath) {
        d += ` L ${pts[pts.length - 1].x} ${h - padBottom}`;
        d += ` L ${pts[0].x} ${h - padBottom} Z`;
      }
      return d;
    };

    const path = buildSmoothPath(points);
    const areaPath = buildSmoothPath(points, true);
    const xTicks = [0, Math.floor((points.length - 1) / 2), points.length - 1].map(i => ({ x: points[i].x, label: formatDateDisplay(points[i].data.date) }));

    // Y轴刻度：从finalMin到finalMax，步长为tickInterval
    const yTicks: { y: number; label: string; isZero: boolean }[] = [];
    const firstTick = Math.ceil(finalMin / tickInterval) * tickInterval;
    for (let v = firstTick; v <= finalMax; v += tickInterval) {
      yTicks.push({ y: getY(v), label: (v >= 0 ? '+' : '') + v, isZero: v === 0 });
    }

    return { path, areaPath, points, xTicks, yTicks, padLeft, padRight, padTop, padBottom, width: w, height: h, zeroY };
  }, [chartTimeline]);

  const moneyCell = (v: number) => {
    if (v === 0) return <span className="text-black">-</span>;
    if (v > 0) return <span className="text-red-600">+{formatMoneyWithSeparators(v)}</span>;
    return <span className="text-green-600">{formatMoneyWithSeparators(v)}</span>;
  };

  const getTooltipStyle = useCallback((x: number, y: number, width = 760, height = 200) => {
    const tooltipWidth = 170;
    const tooltipHeight = 72;
    const margin = 8;
    const gap = 12;

    const wrapRect = chartWrapRef.current?.getBoundingClientRect();
    const svgRect = chartSvgRef.current?.getBoundingClientRect();

    const wrapWidth = wrapRect && wrapRect.width > 0 ? wrapRect.width : width;
    const wrapHeight = wrapRect && wrapRect.height > 0 ? wrapRect.height : height;

    const renderedWidth = svgRect && svgRect.width > 0 ? svgRect.width : width;
    const renderedHeight = svgRect && svgRect.height > 0 ? svgRect.height : height;

    // Offset from wrapper origin to SVG origin (wrapper has padding).
    const svgOffsetLeft = wrapRect && svgRect ? (svgRect.left - wrapRect.left) : 0;
    const svgOffsetTop = wrapRect && svgRect ? (svgRect.top - wrapRect.top) : 0;

    // Map from SVG viewBox coordinates to rendered pixel coordinates.
    const pointX = svgOffsetLeft + (x / width) * renderedWidth;
    const pointY = svgOffsetTop + (y / height) * renderedHeight;

    const left = Math.max(margin, Math.min(wrapWidth - tooltipWidth - margin, pointX - tooltipWidth / 2));

    // Prefer above-point placement so marker stays clickable; fallback below near top edge.
    const aboveTop = pointY - tooltipHeight - gap;
    const belowTop = pointY + gap;
    const top = aboveTop >= margin
      ? aboveTop
      : Math.min(wrapHeight - tooltipHeight - margin, Math.max(margin, belowTop));

    return { left, top, width: tooltipWidth, pointerEvents: 'none' as const };
  }, []);

  const handlePointClick = useCallback((idx: number) => {
    if (!chartTimeline || chartTimeline.length === 0) return;
    const current = chartTimeline[idx];
    if (!current) return;
    const prevDate = idx > 0
      ? chartTimeline[idx - 1].date
      : (() => {
          const d = new Date(current.date);
          d.setDate(d.getDate() - 1);
          return toLocalDateKey(d);
        })();
    setFromDate(prevDate);
    setToDate(current.date);
  }, [chartTimeline]);

  const [tableRows, setTableRows] = useState<OverallFundRow[]>([]);
  const [tableError, setTableError] = useState<string | null>(null);
  // 差额列排序：none → desc → asc → none
  const [diffSort, setDiffSort] = useState<'none' | 'asc' | 'desc'>('desc');

  const chartEndDate = useMemo(() => {
    if (!summary || !summary.timeline || summary.timeline.length === 0) return null;
    return summary.timeline[summary.timeline.length - 1].date;
  }, [summary]);

  // 图表完整期间的累计盈利（从 chartFromDate 到 chartEndDate）
  // 与日期选择器无关，固定显示图表起始到终止的总累计
  const chartPeriodTotal = useMemo(() => {
    if (!summary || !summary.timeline || summary.timeline.length === 0) return 0;
    // 图表终止日期的累计盈利即为期间累计
    const lastPoint = summary.timeline[summary.timeline.length - 1];
    return lastPoint.cumulativeProfit || 0;
  }, [summary]);

  const applyPreset = useCallback((preset: OverallProfitDatePresetKey) => {
    const range = getOverallProfitPresetRange(preset, { maxToDate: chartEndDate });
    setFromDate(range.fromDate || null);
    setToDate(range.toDate || null);
  }, [chartEndDate]);

  // 表格期间累计：日期1到日期2之间的盈利差额
  const periodTotal = useMemo(() => {
    if (tableError || !fromDate || !toDate) return 0;
    const total = tableRows.reduce((sum, row) => sum + (row.profitDiff || 0), 0);
    return Number(total.toFixed(2));
  }, [tableRows, tableError, fromDate, toDate]);

  // Build table rows from precomputed perFundTimelines when summary or date pickers change
  useEffect(() => {
    setTableError(null);
    setTableRows([]);
    if (!summary) return;
    if (!fromDate || !toDate) {
      // require both dates to be set for table
      return;
    }
    // validation rules
    if (fromDate >= toDate) {
      setTableError('规则错误：日期1 必须早于 日期2');
      return;
    }
    const chartStart = summary.timeline && summary.timeline.length > 0 ? summary.timeline[0].date : null;
    const chartEnd = summary.timeline && summary.timeline.length > 0 ? summary.timeline[summary.timeline.length - 1].date : null;
    if (!chartStart || !chartEnd) return;
    // removed restriction: fromDate can be earlier than chartStart; values default to 0
    if (toDate > chartEnd) {
      setTableError('规则错误：日期2 不能晚于图表结束日期');
      return;
    }

    // Build rows: for each perFund row, lookup cumulative at fromDate/toDate from perFundTimelines
    const timelines = summary.perFundTimelines || {};
    const rows: OverallFundRow[] = summary.perFund.map(p => {
      // default to 0 when timelines missing or when fund startDate > fromDate
      let valFrom = 0;
      let valTo = 0;
      const fundTimeline = timelines[p.symbol] || [];
      // find entries for fromDate and toDate; if not exact, find last <= date
      const findValue = (date: string) => {
        // if fund has configured startDate and it's on-or-after date, return 0 (per rule equality yields zero)
        if (p.startDate && p.startDate >= date) return 0;
        // find exact match
        const exact = fundTimeline.find(r => r.date === date);
        // find last before
        let lastBefore: { date: string; cumulativeProfit: number } | null = null;
        for (let i = fundTimeline.length - 1; i >= 0; i--) {
          if (fundTimeline[i].date <= date) { lastBefore = fundTimeline[i]; break; }
        }
        // find next after
        let nextAfter: { date: string; cumulativeProfit: number } | null = null;
        for (let i = 0; i < fundTimeline.length; i++) {
          if (fundTimeline[i].date > date) { nextAfter = fundTimeline[i]; break; }
        }
        // If exact exists and is 0 but there is both a non-zero previous and a non-zero next, treat exact as spurious and return lastBefore
        if (exact && exact.cumulativeProfit === 0 && lastBefore && nextAfter && lastBefore.cumulativeProfit !== 0 && nextAfter.cumulativeProfit !== 0) {
          return lastBefore.cumulativeProfit;
        }
        if (exact) return exact.cumulativeProfit;
        if (lastBefore) return lastBefore.cumulativeProfit;
        return 0;
      };
      valFrom = findValue(fromDate);
      valTo = findValue(toDate);
      return { ...p, profitFrom: valFrom, profitTo: valTo, profitDiff: Number((valTo - valFrom).toFixed(4)) };
    });
    // filter out funds whose startDate is not earlier than toDate (i.e., startDate >= toDate excluded)
    setTableRows(rows.filter(r => !!r.startDate && r.startDate <= toDate));
  }, [summary, fromDate, toDate]);

  // 按差额排序后的展示行
  const displayedRows = useMemo(() => {
    if (diffSort === 'none') return tableRows;
    return [...tableRows].sort((a, b) =>
      diffSort === 'desc' ? (b.profitDiff || 0) - (a.profitDiff || 0) : (a.profitDiff || 0) - (b.profitDiff || 0)
    );
  }, [tableRows, diffSort]);

  const content = (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-4xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col" style={{ maxWidth: '64rem', maxHeight: '90vh' }} role="dialog" aria-modal="true">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
          <h3 className="text-lg font-bold">整体盈亏</h3>
          <button aria-label="关闭整体盈亏窗口" className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100" onClick={onClose}><i className="fas fa-times"></i></button>
        </div>
        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-6"><i className="fas fa-circle-notch animate-spin text-red-500 text-3xl" /><p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-3">正在计算整体盈亏...</p></div>
          ) : error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : (!summary || !summary.timeline || summary.timeline.length === 0) ? (
            <div className="text-sm text-gray-600">暂无可用数据。</div>
          ) : (!chartFromDate) ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <i className="fas fa-folder-open text-3xl mb-3" />
              <p className="text-sm font-medium">无持仓基金，请先配置</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div ref={chartWrapRef} className="bg-gradient-to-b from-gray-50 to-white rounded-xl p-4 relative shadow-inner">
                <svg ref={chartSvgRef} className="w-full h-52" viewBox={`0 0 ${chart.width ?? 760} ${chart.height ?? 200}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                  {/* 背景渐变定义 */}
                  <defs>
                    <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity="0.02" />
                    </linearGradient>
                    <linearGradient id="areaGradientGreen" x1="0%" y1="100%" x2="0%" y2="0%">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity="0.02" />
                    </linearGradient>
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                      <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>

                  {/* 背景 */}
                  <rect x={0} y={0} width={chart.width ?? 760} height={chart.height ?? 200} fill="transparent" />

                  {/* Y轴网格线 */}
                  {chart.yTicks && chart.yTicks.map((t: any, i: number) => (
                    <g key={'y'+i}>
                      <line
                        x1={chart.padLeft ? chart.padLeft - 8 : 52}
                        x2={(chart.width ?? 760) - (chart.padRight ?? 24)}
                        y1={t.y}
                        y2={t.y}
                        stroke={t.isZero ? "#94a3b8" : "#e5e7eb"}
                        strokeWidth={t.isZero ? 1.5 : 1}
                        strokeDasharray={t.isZero ? "none" : "4,4"}
                      />
                      <text
                        x={(chart.padLeft ? chart.padLeft - 14 : 46)}
                        y={t.y}
                        textAnchor="end"
                        alignmentBaseline="middle"
                        style={{
                          fontSize: '11px',
                          fill: t.isZero ? '#64748b' : '#9ca3af',
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
                          fontWeight: t.isZero ? '600' : '400'
                        }}
                      >
                        {t.label}
                      </text>
                    </g>
                  ))}

                  {/* X轴刻度 */}
                  {chart.xTicks && chart.xTicks.map((t: any, i: number) => (
                    <text
                      key={'x'+i}
                      x={t.x}
                      y={(chart.height ?? 200) - 8}
                      textAnchor="middle"
                      style={{ fontSize: '11px', fill: '#9ca3af', fontFamily: 'ui-monospace, monospace' }}
                    >
                      {t.label}
                    </text>
                  ))}

                  {/* 填充区域 */}
                  {chart.areaPath && (
                    <path
                      d={chart.areaPath}
                      fill="url(#areaGradient)"
                      style={{ pointerEvents: 'none' }}
                    />
                  )}

                  {/* 主折线 */}
                  <path
                    d={chart.path}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#glow)"
                    style={{ pointerEvents: 'none' }}
                  />

                  {/* 数据点 */}
                  {chart.points.map((pt: any, i: number) => (
                    <g key={i} onMouseEnter={() => setHoverIndex(i)} onMouseLeave={() => setHoverIndex(null)} onFocus={() => setHoverIndex(i)} onBlur={() => setHoverIndex(null)} onClick={() => handlePointClick(i)} data-testid={`overall-profit-point-${i}`}>
                      <circle cx={pt.x} cy={pt.y} r={16} fill="rgba(0,0,0,0)" style={{ pointerEvents: 'all', cursor: 'pointer' }} />
                      {hoverIndex === i && (
                        <circle cx={pt.x} cy={pt.y} r={8} fill="#ef4444" opacity={0.3} style={{ pointerEvents: 'none' }} />
                      )}
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={hoverIndex === i ? 5 : 3.5}
                        fill={hoverIndex === i ? '#ef4444' : '#fff'}
                        stroke="#ef4444"
                        strokeWidth={hoverIndex === i ? 2.5 : 2}
                        style={{ pointerEvents: 'none', transition: 'r 0.15s, fill 0.15s' }}
                      />
                    </g>
                  ))}
                </svg>
                {hoverIndex !== null && chart.points[hoverIndex] && (
                  <div
                    data-testid="overall-profit-tooltip"
                    className="absolute z-20 bg-white/95 backdrop-blur-sm px-3 py-2 rounded-lg shadow-lg border border-gray-100"
                    style={getTooltipStyle(
                      chart.points[hoverIndex].x,
                      chart.points[hoverIndex].y,
                      chart.width ?? 760,
                      chart.height ?? 200,
                    )}
                  >
                    <div className="text-xs text-gray-500 font-medium mb-1">{formatDateDisplay(chart.points[hoverIndex].data.date)}</div>
                    <div className="text-sm flex justify-between gap-4">
                      <span className="text-gray-500">当日：</span>
                      <span className="font-medium">{chart.points[hoverIndex].data.dailyProfit === 0 ? '-' : (chart.points[hoverIndex].data.dailyProfit > 0 ? '+' : '') + formatMoneyWithSeparators(chart.points[hoverIndex].data.dailyProfit)}</span>
                    </div>
                    <div className="text-sm flex justify-between gap-4">
                      <span className="text-gray-500">累计：</span>
                      <span className={`font-semibold ${chart.points[hoverIndex].data.cumulativeProfit > 0 ? 'text-red-600' : chart.points[hoverIndex].data.cumulativeProfit < 0 ? 'text-green-600' : ''}`}>
                        {chart.points[hoverIndex].data.cumulativeProfit === 0 ? '-' : (chart.points[hoverIndex].data.cumulativeProfit > 0 ? '+' : '') + formatMoneyWithSeparators(chart.points[hoverIndex].data.cumulativeProfit)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* 图表完整期间累计：与日期选择器无关 */}
              <div data-testid="overall-period-total" className="text-xs mt-2">
                {chartFromDate && chartEndDate ? (
                  <>
                    期间累计（{formatDateDisplay(chartFromDate)} ~ {formatDateDisplay(chartEndDate)}）：
                    {chartPeriodTotal === 0 ? (
                      <span className="text-black">-</span>
                    ) : chartPeriodTotal > 0 ? (
                      <span className="text-red-600">+{formatMoneyWithSeparators(chartPeriodTotal)}</span>
                    ) : (
                      <span className="text-green-600">{formatMoneyWithSeparators(chartPeriodTotal)}</span>
                    )}
                  </>
                ) : (
                  <span className="text-gray-400">暂无数据</span>
                )}
              </div>

              {/* 日期选择器：位于表格上方 */}
              <div className="mt-3 flex flex-wrap items-center gap-3" style={{ position: 'relative', zIndex: 1400, background: '#ffffff', padding: '6px', borderRadius: '6px' }}>
                <div className="flex items-center space-x-2 text-xs text-gray-600">
                  <label>日期1</label>
                  <input type="date" value={fromDate ?? ''} onChange={e => setFromDate(e.target.value)} className="px-2 py-1 border rounded" />
                  <label>日期2</label>
                  <input type="date" value={toDate ?? ''} onChange={e => setToDate(e.target.value)} className="px-2 py-1 border rounded" />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {OVERALL_PROFIT_DATE_PRESETS.map((preset) => (
                    <button
                      key={preset.key}
                      type="button"
                      className="px-3 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors"
                      aria-label={`快捷日期：${preset.label}`}
                      onClick={() => applyPreset(preset.key)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                {tableError && <div className="text-xs text-red-600">{tableError}</div>}
              </div>

              <div className="pt-4 border-t">
                {/* Single table with sticky thead/tfoot — scrollbar stays inside tbody only */}
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="overflow-y-auto" style={{ maxHeight: '330px' }}>
                    <table className="w-full text-sm table-fixed border-collapse">
                      <colgroup>
                        <col style={{ width: '50%' }} />
                        <col style={{ width: '16.6667%' }} />
                        <col style={{ width: '16.6667%' }} />
                        <col style={{ width: '16.6667%' }} />
                      </colgroup>
                      <thead className="sticky top-0 z-10 bg-gray-50">
                        <tr className="border-b border-gray-200">
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">基金名称（基金代码）</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">{formatDateDisplay(fromDate)}累计盈利</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">{formatDateDisplay(toDate)}累计盈利</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">
                            <button
                              className="inline-flex items-center gap-1 hover:text-gray-700 transition-colors select-none"
                              onClick={() => setDiffSort(s => s === 'none' ? 'desc' : s === 'desc' ? 'asc' : 'none')}
                              title="点击切换排序"
                            >
                              差额
                              <span className="text-gray-400">
                                {diffSort === 'none' && <i className="fas fa-sort" />}
                                {diffSort === 'desc' && <i className="fas fa-sort-down text-blue-500" />}
                                {diffSort === 'asc'  && <i className="fas fa-sort-up text-blue-500" />}
                              </span>
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedRows.map(p => (
                          <tr key={p.symbol} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                            <td className="px-3 py-2 text-left text-xs text-gray-700">
                              {onSelectFund ? (
                                <button
                                  className="text-left w-full truncate hover:text-blue-600 transition-colors"
                                  title={`${p.name} (${String(p.symbol).padStart(6,'0')})`}
                                  onClick={() => { onSelectFund(String(p.symbol)); onClose(); }}
                                >
                                  {(p.name && p.name.trim()) ? `${p.name} (${String(p.symbol).padStart(6,'0')})` : `(${String(p.symbol).padStart(6,'0')})`}
                                </button>
                              ) : (
                                (p.name && p.name.trim()) ? `${p.name} (${String(p.symbol).padStart(6,'0')})` : `(${String(p.symbol).padStart(6,'0')})`
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-xs">{(p.profitFrom||0)===0? <span className="text-black">-</span> : <span className={`${(p.profitFrom||0)>0? 'text-red-600':'text-green-600'}`}>{(p.profitFrom||0)>0?'+':''}{formatMoneyWithSeparators(p.profitFrom||0)}</span>}</td>
                            <td className="px-3 py-2 text-right text-xs">{(p.profitTo||0)===0? <span className="text-black">-</span> : <span className={`${(p.profitTo||0)>0? 'text-red-600':'text-green-600'}`}>{(p.profitTo||0)>0?'+':''}{formatMoneyWithSeparators(p.profitTo||0)}</span>}</td>
                            <td className="px-3 py-2 text-right text-xs">{moneyCell(p.profitDiff||0)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="sticky bottom-0 z-10 bg-gray-50">
                        {(() => {
                          const rows = tableRows || [];
                          const totalFrom = rows.reduce((s, r) => s + (r.profitFrom || 0), 0);
                          const totalTo = rows.reduce((s, r) => s + (r.profitTo || 0), 0);
                          const totalDiff = rows.reduce((s, r) => s + (r.profitDiff || 0), 0);
                          return (
                            <tr className="border-t border-gray-200">
                              <td className="px-3 py-2 text-left text-xs font-bold text-gray-700">总计：{rows.length}条记录</td>
                              <td className="px-3 py-2 text-right text-xs font-bold">{totalFrom===0? <span className="text-black">-</span> : <span className={`${totalFrom>0? 'text-red-600':'text-green-600'}`}>{totalFrom>0?'+':''}{formatMoneyWithSeparators(totalFrom)}</span>}</td>
                              <td className="px-3 py-2 text-right text-xs font-bold">{totalTo===0? <span className="text-black">-</span> : <span className={`${totalTo>0? 'text-red-600':'text-green-600'}`}>{totalTo>0?'+':''}{formatMoneyWithSeparators(totalTo)}</span>}</td>
                              <td className="px-3 py-2 text-right text-xs font-bold">{totalDiff===0? <span className="text-black">-</span> : totalDiff>0? <span className="text-red-600">+{formatMoneyWithSeparators(totalDiff)}</span> : <span className="text-green-600">{formatMoneyWithSeparators(totalDiff)}</span>}</td>
                            </tr>
                          );
                        })()}
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default OverallProfitModal;

