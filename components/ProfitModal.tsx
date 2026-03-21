import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchFundHistory as defaultFetchFundHistory } from '../services/fundService';
import useTrades from '../hooks/useTrades';
import { computeProfitTimeline } from '../utils/profitCalculator';
import { HistoricalPoint, ProfitPoint } from '../types';
import { resolvePreferredPrice, toLocalDateKey } from '../utils/priceResolver';
import { adjustProfitTimelineForDisplay } from '../utils/profitAdjustment';
import { formatMoneyWithSeparators, fmtNav } from '../utils/format';
import { formatDateDisplay } from '../utils/dateFormat';

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
        const sorted = (pts || []).slice().sort((a, b) => (a.date as number) - (b.date as number));
        const preferred = resolvePreferredPrice({
          targetDate: todayLocal,
          todayDate: todayLocal,
          history: sorted,
          currentPrice,
          realtimeDate,
          previousPrice,
          netWorthDate,
        });
        if (preferred) {
          const preferredTs = new Date(`${preferred.date} 15:00`).getTime();
          const byDate = new Map<string, HistoricalPoint>();
          for (const p of sorted) {
            byDate.set(toLocalDateKey(p.date), p);
          }
          byDate.set(preferred.date, { date: preferredTs, value: preferred.price, equityReturn: 0 });
          pts = Array.from(byDate.values()).sort((a, b) => (a.date as number) - (b.date as number));
        } else {
          pts = sorted;
        }
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
    if (!displayedTimeline || displayedTimeline.length === 0) return { path: '', points: [], xTicks: [], yTicks: [], width: 760, height: 160, padLeft: 56, padRight: 24 };
    const w = 760; const h = 160;
    const padLeft = 56; const padRight = 24; const padTop = 16; const padBottom = 28;
    const vals = displayedTimeline.map(p => p.cumulativeProfit || 0);
    const min = Math.min(...vals); const max = Math.max(...vals);
    const range = max - min || 1;
    const getX = (i: number) => padLeft + (i * (w - padLeft - padRight) / (displayedTimeline.length - 1));
    const getY = (v: number) => h - padBottom - ((v - min) / range) * (h - padTop - padBottom);
    const pts = displayedTimeline.map((p, i) => ({ x: getX(i), y: getY(p.cumulativeProfit || 0), data: p }));
    const d = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
    const xTicks = [0, Math.floor((pts.length - 1) / 2), pts.length - 1].map(i => ({ x: pts[i].x, label: formatDateDisplay(pts[i].data.date) }));
    const yTicks = Array.from({ length: 5 }).map((_, i) => {
      const v = min + (i * range / 4);
      return { y: getY(v), label: (v >= 0 ? '+' : '') + formatMoneyWithSeparators(v) };
    });
    return { path: d, points: pts, xTicks, yTicks, padLeft, padRight, padTop, padBottom, width: w, height: h };
  }, [displayedTimeline]);

  const handlePointEnter = (i: number) => { setHoverIndex(i); };
  const handlePointLeave = () => { setHoverIndex(null); };

  const tableScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollTop = tableScrollRef.current.scrollHeight;
    }
  }, [displayedTimeline]);

  const moneyCell = (v: number) => {
    if (v === 0) return <span className="text-black">-</span>;
    if (v > 0) return <span className="text-red-600">+{formatMoneyWithSeparators(v)}</span>;
    return <span className="text-green-600">{formatMoneyWithSeparators(v)}</span>;
  };

  const titleText = fundName ? `${fundName} (${symbol})` : symbol;


  const content = (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-4xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col" style={{ maxWidth: '64rem', maxHeight: '90vh' }} role="dialog" aria-modal="true">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
          <h3 className="text-lg font-bold">{titleText} — 持仓盈亏</h3>
          <div className="flex items-center gap-2">
            <button aria-label="关闭盈亏窗口" className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100" onClick={onClose}><i className="fas fa-times"></i></button>
          </div>
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
                <div className="text-xs text-gray-500">&nbsp;</div>
              </div>
              {validationError ? (
                <div className="text-sm text-red-600">{validationError}</div>
              ) : (
                <>
                  {/* Chart */}
                  <div className="bg-gray-50 rounded p-3 relative">
                    <svg className="w-full h-40" viewBox={`0 0 ${chart.width ?? 760} ${chart.height ?? 160}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                      <rect x={0} y={0} width={760} height={160} fill="#fff" />
                      {chart.yTicks && chart.yTicks.map((t, i) => (
                        <g key={'y'+i}>
                          <line x1={chart.padLeft ? chart.padLeft - 20 : 30} x2={760 - (chart.padRight ?? 24)} y1={t.y} y2={t.y} stroke="#eef2f7" />
                          <text x={(chart.padLeft ? chart.padLeft - 12 : 44)} y={t.y} textAnchor="end" alignmentBaseline="middle" style={{ fontSize: '10px', fill: '#9ca3af', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", "Helvetica Neue", monospace' }}>{t.label}</text>
                        </g>
                      ))}
                      {chart.xTicks && chart.xTicks.map((t, i) => (
                        <text key={'x'+i} x={t.x} y={150} textAnchor="middle" style={{ fontSize: '10px', fill: '#9ca3af' }}>{t.label}</text>
                      ))}
                      <path d={chart.path} fill="none" stroke="#ef4444" strokeWidth={2} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
                      {chart.points.map((pt, i) => (
                        <g key={i} onMouseEnter={() => handlePointEnter(i)} onMouseLeave={() => handlePointLeave()} onFocus={() => handlePointEnter(i)} onBlur={() => handlePointLeave()}>
                          <circle cx={pt.x} cy={pt.y} r={18} fill="rgba(0,0,0,0)" style={{ pointerEvents: 'all' }} />
                          <circle cx={pt.x} cy={pt.y} r={5} fill={hoverIndex === i ? '#ef4444' : '#fff'} stroke="#ef4444" strokeWidth={2} />
                        </g>
                      ))}
                    </svg>
                    {hoverIndex !== null && chart.points[hoverIndex] && (
                      <div className="absolute z-20 bg-white p-2 rounded shadow" style={{ left: Math.max(8, Math.min((chart.width ?? 760) - 120, chart.points[hoverIndex].x - 40)), top: Math.max(8, chart.points[hoverIndex].y - 50), pointerEvents: 'none' }}>
                        <div className="text-xs text-gray-500">{formatDateDisplay(chart.points[hoverIndex].data.date)}</div>
                        <div className="text-sm">当日: {chart.points[hoverIndex].data.dailyProfit === 0 ? '-' : (chart.points[hoverIndex].data.dailyProfit > 0 ? '+' : '') + formatMoneyWithSeparators(chart.points[hoverIndex].data.dailyProfit)}</div>
                        <div className="text-sm">累计: {chart.points[hoverIndex].data.cumulativeProfit === 0 ? '-' : (chart.points[hoverIndex].data.cumulativeProfit > 0 ? '+' : '') + formatMoneyWithSeparators(chart.points[hoverIndex].data.cumulativeProfit)}</div>
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
                              <td className="px-3 py-2 text-right text-xs">{moneyCell(row.dailyProfit)}</td>
                              <td className="px-3 py-2 text-right text-xs">{moneyCell(row.cumulativeProfit)}</td>
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

