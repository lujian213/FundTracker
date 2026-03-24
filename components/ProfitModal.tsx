import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchFundHistory as defaultFetchFundHistory, prepareHistoryForProfitCalculation } from '../services/fundService';
import useTrades from '../hooks/useTrades';
import { computeProfitTimeline } from '../utils/profitCalculator';
import { HistoricalPoint, ProfitPoint } from '../types';
import { toLocalDateKey } from '../utils/priceResolver';
import { adjustProfitTimelineForDisplay } from '../utils/profitAdjustment';
import { formatMoneyWithSeparators, fmtNav } from '../utils/format';
import { formatDateDisplay } from '../utils/dateFormat';
import { buildSmoothPath, CHART_DIMENSIONS } from '../utils/chartUtils';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoricalPoint[]>([]);
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

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
          const last = toLocalDateKey(pts[pts.length - 1].date);
          const defaultFrom = initialStartDate && initialStartDate > first ? initialStartDate : first;
          setFromDate(defaultFrom);
          const defaultTo = last && last < todayLocal ? last : todayLocal;
          setToDate(defaultTo);
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
    return computeProfitTimeline({ history, trades: trades || [], initialPosition: initialPosition || 0, initialPrice: resolvedInitialPrice ?? null });
  }, [history, trades, initialPosition, resolvedInitialPrice]);

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
    if (!displayedTimeline || displayedTimeline.length === 0) return { path: '', areaPath: '', points: [], xTicks: [], yTicks: [], width: CHART_DIMENSIONS.width, height: CHART_DIMENSIONS.height, padLeft: CHART_DIMENSIONS.padLeft, padRight: CHART_DIMENSIONS.padRight, zeroY: 100 };
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

    const getX = (i: number) => padLeft + (i * (w - padLeft - padRight) / (displayedTimeline.length - 1));
    const getY = (v: number) => h - padBottom - ((v - finalMin) / range) * (h - padTop - padBottom);
    const zeroY = getY(0);
    const pts = displayedTimeline.map((p, i) => ({ x: getX(i), y: getY(p.cumulativeProfit || 0), data: p }));

    const path = buildSmoothPath(pts, { chartHeight: h, paddingBottom: padBottom });
    const areaPath = buildSmoothPath(pts, { closePath: true, chartHeight: h, paddingBottom: padBottom });
    const xTicks = [0, Math.floor((pts.length - 1) / 2), pts.length - 1].map(i => ({ x: pts[i].x, label: formatDateDisplay(pts[i].data.date) }));

    // Y轴刻度：从finalMin到finalMax，步长为tickInterval
    const yTicks: { y: number; label: string; isZero: boolean }[] = [];
    const firstTick = Math.ceil(finalMin / tickInterval) * tickInterval;
    for (let v = firstTick; v <= finalMax; v += tickInterval) {
      yTicks.push({ y: getY(v), label: (v >= 0 ? '+' : '') + v, isZero: v === 0 });
    }

    return { path, areaPath, points: pts, xTicks, yTicks, padLeft, padRight, padTop, padBottom, width: w, height: h, zeroY };
  }, [displayedTimeline]);

  const handlePointEnter = (i: number) => { setHoverIndex(i); };
  const handlePointLeave = () => { setHoverIndex(null); };

  const tableScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollTop = tableScrollRef.current.scrollHeight;
    }
  }, [displayedTimeline]);

  const content = (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-4xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col" style={{ maxWidth: '64rem', maxHeight: '90vh' }} role="dialog" aria-modal="true">
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
                  <div className="bg-gradient-to-b from-gray-50 to-white rounded-xl p-4 relative shadow-inner">
                    <svg className="w-full h-52" viewBox={`0 0 ${chart.width ?? 760} ${chart.height ?? 200}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                      {/* 背景渐变定义 */}
                      <defs>
                        <linearGradient id="profitAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#ef4444" stopOpacity="0.02" />
                        </linearGradient>
                        <filter id="profitGlow" x="-20%" y="-20%" width="140%" height="140%">
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
                      {chart.yTicks && chart.yTicks.map((t, i) => (
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
                      {chart.xTicks && chart.xTicks.map((t, i) => (
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
                          fill="url(#profitAreaGradient)"
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
                        filter="url(#profitGlow)"
                        style={{ pointerEvents: 'none' }}
                      />

                      {/* 数据点 */}
                      {chart.points.map((pt, i) => (
                        <g key={i} onMouseEnter={() => handlePointEnter(i)} onMouseLeave={() => handlePointLeave()} onFocus={() => handlePointEnter(i)} onBlur={() => handlePointLeave()}>
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
                        className="absolute z-20 bg-white/95 backdrop-blur-sm px-3 py-2 rounded-lg shadow-lg border border-gray-100"
                        style={{
                          left: Math.max(8, Math.min((chart.width ?? 760) - 140, chart.points[hoverIndex].x - 60)),
                          top: Math.max(8, chart.points[hoverIndex].y - 60),
                          pointerEvents: 'none'
                        }}
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

