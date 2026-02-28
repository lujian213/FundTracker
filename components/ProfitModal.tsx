import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchFundHistory as defaultFetchFundHistory } from '../services/fundService';
import useTrades from '../hooks/useTrades';
import { computeProfitTimeline } from '../utils/profitCalculator';
import { HistoricalPoint } from '../types';

interface ProfitModalProps {
  symbol: string;
  fundName?: string;
  currentPrice?: number;
  realtimeDate?: string | null;
  onClose: () => void;
  initialPosition?: number;
  initialPrice?: number | null;
  initialStartDate?: string | null; // 持仓起始日期
  fetchHistory?: (symbol: string) => Promise<HistoricalPoint[]>;
}

const ProfitModal: React.FC<ProfitModalProps> = ({ symbol, fundName, currentPrice, realtimeDate, onClose, initialPosition = 0, initialPrice = null, initialStartDate = null, fetchHistory }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoricalPoint[]>([]);
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [pageStartIndex, setPageStartIndex] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cleared, setCleared] = useState(false);

  const { trades } = useTrades(symbol);
  const fetchFn = fetchHistory ?? defaultFetchFundHistory;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        let pts = await fetchFn(symbol);
        if (!mounted) return;
        // ensure last day (realtimeDate) present: if realtimeDate provided, append or replace last
        if (realtimeDate && currentPrice !== undefined && currentPrice !== null) {
          const rtTs = new Date(realtimeDate + ' 15:00').getTime();
          // if pts has last point on same local day, replace it; otherwise append if rtTs > last
          const sorted = (pts || []).slice().sort((a, b) => (a.date as number) - (b.date as number));
          const last = sorted[sorted.length - 1];
          const isSameDay = last && (new Date(last.date).toISOString().split('T')[0] === new Date(rtTs).toISOString().split('T')[0]);
          if (isSameDay) {
            sorted[sorted.length - 1] = { date: rtTs, value: currentPrice, equityReturn: 0 } as any;
            pts = sorted;
          } else if (!last || rtTs > last.date) {
            pts = [...sorted, { date: rtTs, value: currentPrice, equityReturn: 0 } as any];
          } else {
            pts = sorted;
          }
        } else {
          pts = (pts || []).slice().sort((a, b) => (a.date as number) - (b.date as number));
        }

        setHistory(pts);
        if (pts.length > 0) {
          const first = new Date(pts[0].date).toISOString().split('T')[0];
          const last = new Date(pts[pts.length - 1].date).toISOString().split('T')[0];
          const defaultFrom = initialStartDate && initialStartDate > first ? initialStartDate : first;
          setFromDate(defaultFrom);
          const today = new Date().toISOString().split('T')[0];
          const defaultTo = last && last < today ? last : today;
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
  }, [symbol, fetchFn, initialStartDate, currentPrice, realtimeDate]);

  // compute full timeline when history or trades change
  const fullTimeline = useMemo(() => {
    if (!history || history.length === 0) return [];
    return computeProfitTimeline({ history, trades: trades || [], initialPosition: initialPosition || 0, initialPrice: initialPrice ?? null });
  }, [history, trades, initialPosition, initialPrice]);

  const validateDates = (from?: string | null, to?: string | null) => {
    setValidationError(null);
    if (!from || !to) return true;
    if (from > to) {
      setValidationError('开始日期必须早于或等于结束日期。');
      return false;
    }
    if (initialStartDate && from < initialStartDate) {
      setValidationError('开始日期不能早于持仓起始日期。');
      return false;
    }
    return true;
  };

  useEffect(() => { validateDates(fromDate, toDate); }, [fromDate, toDate, initialStartDate]);

  // selected timeline filtered by date range
  const selectedTimeline = useMemo(() => {
    if (!fullTimeline || fullTimeline.length === 0) return [];
    if (!fromDate || !toDate) return fullTimeline;
    return fullTimeline.filter(p => p.date >= fromDate && p.date <= toDate);
  }, [fullTimeline, fromDate, toDate]);

  // When date range changes, reset paging so table updates correctly
  useEffect(() => {
    setPageStartIndex(0);
    // when applying new dates, ensure cleared flag is reset
    setCleared(false);
  }, [fromDate, toDate]);

  // Ensure pageStartIndex not out of bounds when selectedTimeline changes
  useEffect(() => {
    if (pageStartIndex >= selectedTimeline.length) setPageStartIndex(0);
    // clear refreshing flag when new timeline available
    setIsRefreshing(false);
    // if new timeline arrived after applying, ensure cleared is false
    if (selectedTimeline.length > 0) setCleared(false);
  }, [selectedTimeline.length, pageStartIndex]);

  // displayedTimeline: dedupe by date (keep first entry per date) and override first day's dailyProfit to 0 when fromDate equals initialStartDate
  const displayedTimeline = useMemo(() => {
    if (!selectedTimeline || selectedTimeline.length === 0) return [];
    const seen = new Set<string>();
    const dedup: typeof selectedTimeline = [] as any;
    for (const s of selectedTimeline) {
      if (seen.has(s.date)) continue; // keep first occurrence only
      seen.add(s.date);
      dedup.push({ ...s });
    }
    if (fromDate && initialStartDate && fromDate === initialStartDate) {
      if (dedup.length > 0 && dedup[0].date === fromDate) {
        dedup[0].dailyProfit = 0;
      }
    }
    return dedup;
  }, [selectedTimeline, fromDate, initialStartDate]);

  // paging: control max 10 per view
  const page = useMemo(() => {
    if (isRefreshing || cleared) return [];
    return displayedTimeline.slice(pageStartIndex, pageStartIndex + 10);
  }, [displayedTimeline, pageStartIndex, isRefreshing, cleared]);

  // periodTotal should sum the displayed (deduped and adjusted) timeline so table/chart and total agree
  const periodTotal = useMemo(() => (displayedTimeline || []).reduce((s, p) => s + (p.dailyProfit || 0), 0), [displayedTimeline]);

  // chart with axes ticks (use displayedTimeline and larger margins to avoid clipping)
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
    // x ticks: first/mid/last
    const xTicks = [0, Math.floor((pts.length - 1) / 2), pts.length - 1].map(i => ({ x: pts[i].x, label: pts[i].data.date }));
    // y ticks: 5
    const yTicks = Array.from({ length: 5 }).map((_, i) => {
      const v = min + (i * range / 4);
      return { y: getY(v), label: (v >= 0 ? '+' : '') + v.toFixed(2) };
    });
    return { path: d, points: pts, xTicks, yTicks, padLeft, padRight, padTop, padBottom, width: w, height: h };
  }, [displayedTimeline]);

  const handlePointEnter = (i: number) => { setHoverIndex(i); };
  const handlePointLeave = () => { setHoverIndex(null); };

  // clear hover when refreshing so tooltip disappears
  useEffect(() => { if (isRefreshing) setHoverIndex(null); }, [isRefreshing]);

  const moneyCell = (v: number) => {
    if (v === 0) return <span className="text-black">-</span>;
    if (v > 0) return <span className="text-red-600">+{v.toFixed(2)}</span>;
    return <span className="text-green-600">{v.toFixed(2)}</span>;
  };

  const titleText = fundName ? `${fundName} (${symbol})` : symbol;

  const content = (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" style={{ maxWidth: '64rem' }} role="dialog" aria-modal="true">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h3 className="text-lg font-bold">{titleText} — 持仓盈亏</h3>
          <button aria-label="关闭盈亏窗口" className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100" onClick={onClose}><i className="fas fa-times"></i></button>
        </div>
        <div className="p-6">
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
                  <label>开始</label>
                  <input type="date" value={fromDate ?? ''} onChange={e => { setFromDate(e.target.value); setPageStartIndex(0); setIsRefreshing(true); setCleared(false); }} className="px-2 py-1 border rounded" />
                  <label>结束</label>
                  <input type="date" value={toDate ?? ''} onChange={e => { setToDate(e.target.value); setPageStartIndex(0); setIsRefreshing(true); setCleared(false); }} className="px-2 py-1 border rounded" />
                </div>
                <div className="text-xs text-gray-500">&nbsp;</div>
              </div>
              {validationError ? (
                <div className="text-sm text-red-600">{validationError}</div>
              ) : (
                <>
                  <div className="bg-gray-50 rounded p-3 relative">
                    {(isRefreshing || cleared) ? null : (
                      <svg className="w-full h-40" viewBox={`0 0 ${chart.width ?? 760} ${chart.height ?? 160}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                        <rect x={0} y={0} width={760} height={160} fill="#fff" />
                        {/* y axis ticks */}
                        {chart.yTicks && chart.yTicks.map((t, i) => (
                          <g key={'y'+i}>
                            <line x1={chart.padLeft ? chart.padLeft - 20 : 30} x2={760 - (chart.padRight ?? 24)} y1={t.y} y2={t.y} stroke="#eef2f7" />
                            <text x={(chart.padLeft ? chart.padLeft - 12 : 44)} y={t.y} textAnchor="end" alignmentBaseline="middle" style={{ fontSize: '10px', fill: '#9ca3af', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", "Helvetica Neue", monospace' }}>{t.label}</text>
                          </g>
                        ))}
                        {/* x axis ticks */}
                        {chart.xTicks && chart.xTicks.map((t, i) => (
                          <text key={'x'+i} x={t.x} y={150} textAnchor="middle" style={{ fontSize: '10px', fill: '#9ca3af' }}>{t.label}</text>
                        ))}
                        <path d={chart.path} fill="none" stroke="#ef4444" strokeWidth={2} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
                        {chart.points.map((pt, i) => (
                          <g key={i} onMouseEnter={() => handlePointEnter(i)} onMouseLeave={() => handlePointLeave()} onFocus={() => handlePointEnter(i)} onBlur={() => handlePointLeave()}>
                            {/* larger transparent hit area for stable hover (bigger to avoid flicker) */}
                            <circle cx={pt.x} cy={pt.y} r={18} fill="rgba(0,0,0,0)" style={{ pointerEvents: 'all' }} />
                            {/* visible point */}
                            <circle cx={pt.x} cy={pt.y} r={5} fill={hoverIndex === i ? '#ef4444' : '#fff'} stroke="#ef4444" strokeWidth={2} />
                          </g>
                        ))}
                      </svg>
                    )}
                    {hoverIndex !== null && chart.points[hoverIndex] && (
                      <div className="absolute z-20 bg-white p-2 rounded shadow" style={{ left: Math.max(8, Math.min((chart.width ?? 760) - 120, chart.points[hoverIndex].x - 40)), top: Math.max(8, chart.points[hoverIndex].y - 50), pointerEvents: 'none' }}>
                        <div className="text-xs text-gray-500">{chart.points[hoverIndex].data.date}</div>
                        <div className="text-sm">当日: {chart.points[hoverIndex].data.dailyProfit === 0 ? '-' : (chart.points[hoverIndex].data.dailyProfit > 0 ? '+' : '') + chart.points[hoverIndex].data.dailyProfit.toFixed(2)}</div>
                        <div className="text-sm">累计: {chart.points[hoverIndex].data.cumulativeProfit === 0 ? '-' : (chart.points[hoverIndex].data.cumulativeProfit > 0 ? '+' : '') + chart.points[hoverIndex].data.cumulativeProfit.toFixed(2)}</div>
                      </div>
                    )}
                  </div>

                  {/* Table of daily profits (max 10 per page */}
                  <div className="overflow-auto" style={{ maxHeight: '320px' }}>
                    <table className="w-full text-sm text-left">
                      <thead>
                        <tr className="text-xs text-gray-500">
                          <th className="px-3 py-2">日期</th>
                          <th className="px-3 py-2 text-right">净值</th>
                          <th className="px-3 py-2 text-right">当日盈利</th>
                        </tr>
                      </thead>
                      <tbody>
                        {page.map(row => (
                          <tr key={row.date} className="border-t">
                            <td className="px-3 py-2 align-top">{row.date}</td>
                            <td className="px-3 py-2 align-top text-right">{(row.netValue !== undefined && row.netValue !== null) ? row.netValue.toFixed(4) : '-'}</td>
                            <td className="px-3 py-2 align-top text-right">{moneyCell(row.dailyProfit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* paging controls and period total */}
                  <div className="flex items-center justify-between text-xs mt-2">
                    <div>
                      {displayedTimeline.length > 10 && (
                        <div className="space-x-2">
                          <button className="px-2 py-1 border rounded" disabled={pageStartIndex === 0} onClick={() => setPageStartIndex(Math.max(0, pageStartIndex - 10))}>上一页</button>
                          <button className="px-2 py-1 border rounded" disabled={pageStartIndex + 10 >= displayedTimeline.length} onClick={() => setPageStartIndex(Math.min(displayedTimeline.length - 10, pageStartIndex + 10))}>下一页</button>
                        </div>
                      )}
                    </div>
                    <div>期间累计: {
                      periodTotal === 0 ? <span className="text-black">-</span> : (periodTotal > 0 ? <span className="text-red-600">+{periodTotal.toFixed(2)}</span> : <span className="text-green-600">{periodTotal.toFixed(2)}</span>)
                    }</div>
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

