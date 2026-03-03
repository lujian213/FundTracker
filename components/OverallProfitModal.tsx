import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { computeOverallProfit } from '../services/fundService';
import { OverallProfitSummary, OverallProfitPoint, OverallFundRow } from '../types';

interface Props {
  symbols?: string[];
  onClose: () => void;
}

const OverallProfitModal: React.FC<Props> = ({ symbols, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<OverallProfitSummary | null>(null);
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Manage fetching summary. We do an initial scan to determine defaults, then fetch range-specific summary.
  const [lastRange, setLastRange] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        // initial fetch without date range to obtain perFund startDates and full timeline
        const base = await computeOverallProfit({ symbols });
        if (!mounted) return;
        // Determine default date1 (from) as earliest eligible startDate among funds with stored startDate and positive initialPosition
        let defaultFrom: string | null = null;
        try {
          if (base.perFund && base.perFund.length > 0) {
            const eligible = (base.perFund || []).filter(p => !!p.hasStoredStartDate && !!p.initialPosition && Number(p.initialPosition) > 0);
            const starts = eligible.map(p => p.startDate).filter(s => !!s) as string[];
            if (starts.length > 0) {
              defaultFrom = starts.reduce((a, b) => (a < b ? a : b));
            }
          }
        } catch (e) {
          defaultFrom = null;
        }
        if (!defaultFrom && base.timeline && base.timeline.length > 0) {
          defaultFrom = base.timeline[0].date;
        }
        const defaultTo = base.timeline && base.timeline.length > 0 ? base.timeline[base.timeline.length - 1].date : null;
        setFromDate(defaultFrom);
        setToDate(defaultTo);
        // fetch summary for this default range
        if (defaultFrom && defaultTo) {
          setLoading(true);
          const ranged = await computeOverallProfit({ symbols, fromDate: defaultFrom, toDate: defaultTo });
          if (!mounted) return;
          setSummary(ranged);
          setLastRange(`${defaultFrom}|${defaultTo}`);
        } else {
          setSummary(base);
        }
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

  // Chart always uses the full summary timeline (fixed x-axis start/end)
  const chartTimeline = useMemo(() => {
    if (!summary) return [] as OverallProfitPoint[];
    return summary.timeline;
  }, [summary]);

  const chart = useMemo(() => {
    const pts = chartTimeline;
    if (!pts || pts.length === 0) return { path: '', points: [], xTicks: [], yTicks: [], width: 760, height: 160, padLeft: 56, padRight: 24 };
    const w = 760; const h = 160; const padLeft = 56; const padRight = 24; const padTop = 16; const padBottom = 28;
    const vals = pts.map(p => p.cumulativeProfit || 0);
    const min = Math.min(...vals); const max = Math.max(...vals); const range = max - min || 1;
    const getX = (i: number) => padLeft + (i * (w - padLeft - padRight) / (pts.length - 1));
    const getY = (v: number) => h - padBottom - ((v - min) / range) * (h - padTop - padBottom);
    const points = pts.map((p, i) => ({ x: getX(i), y: getY(p.cumulativeProfit || 0), data: p }));
    const d = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
    const xTicks = [0, Math.floor((points.length - 1) / 2), points.length - 1].map(i => ({ x: points[i].x, label: points[i].data.date }));
    const yTicks = Array.from({ length: 5 }).map((_, i) => { const v = min + (i * range / 4); return { y: getY(v), label: (v >= 0 ? '+' : '') + v.toFixed(2) }; });
    return { path: d, points, xTicks, yTicks, padLeft, padRight, width: w, height: h };
  }, [chartTimeline]);

  const moneyCell = (v: number) => {
    if (v === 0) return <span className="text-black">-</span>;
    if (v > 0) return <span className="text-red-600">+{v.toFixed(2)}</span>;
    return <span className="text-green-600">{v.toFixed(2)}</span>;
  };

  // Table data built from precomputed perFundTimelines in summary
  const [tableRows, setTableRows] = useState<OverallFundRow[]>([]);
  const [tableError, setTableError] = useState<string | null>(null);

  // periodTotal reflects the full chart window (first to last point in the overall timeline), not the date1/date2 table range
  const periodTotal = useMemo(() => {
    if (!summary || !summary.timeline || summary.timeline.length === 0) return 0;
    const first = summary.timeline[0].cumulativeProfit || 0;
    const last = summary.timeline[summary.timeline.length - 1].cumulativeProfit || 0;
    return Number((last - first).toFixed(2));
  }, [summary]);

  // Build table rows from perFundTimelines when summary or date pickers change
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
    if (fromDate < chartStart) {
      setTableError('规则错误：日期1 不能早于图表起始日期');
      return;
    }
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
    setTableRows(rows.filter(r => !!r.startDate && r.startDate < toDate));
  }, [summary, fromDate, toDate]);

  const content = (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" style={{ maxWidth: '64rem' }} role="dialog" aria-modal="true">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h3 className="text-lg font-bold">整体盈亏</h3>
          <button aria-label="关闭整体盈亏窗口" className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100" onClick={onClose}><i className="fas fa-times"></i></button>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-6"><i className="fas fa-circle-notch animate-spin text-red-500 text-3xl" /><p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-3">正在计算整体盈亏...</p></div>
          ) : error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : (!summary || !summary.timeline || summary.timeline.length === 0) ? (
            <div className="text-sm text-gray-600">暂无可用数据。</div>
          ) : (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded p-3 relative">
                <svg className="w-full h-40" viewBox={`0 0 ${chart.width ?? 760} ${chart.height ?? 160}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                  <rect x={0} y={0} width={760} height={160} fill="#fff" />
                  {chart.yTicks && chart.yTicks.map((t: any, i: number) => (
                    <g key={'y'+i}>
                      <line x1={chart.padLeft ? chart.padLeft - 20 : 30} x2={760 - (chart.padRight ?? 24)} y1={t.y} y2={t.y} stroke="#eef2f7" />
                      <text x={(chart.padLeft ? chart.padLeft - 12 : 44)} y={t.y} textAnchor="end" alignmentBaseline="middle" style={{ fontSize: '10px', fill: '#9ca3af', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", "Helvetica Neue", monospace' }}>{t.label}</text>
                    </g>
                  ))}
                  {chart.xTicks && chart.xTicks.map((t: any, i: number) => (
                    <text key={'x'+i} x={t.x} y={150} textAnchor="middle" style={{ fontSize: '10px', fill: '#9ca3af' }}>{t.label}</text>
                  ))}
                  <path d={chart.path} fill="none" stroke="#ef4444" strokeWidth={2} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
                  {chart.points.map((pt: any, i: number) => (
                    <g key={i} onMouseEnter={() => setHoverIndex(i)} onMouseLeave={() => setHoverIndex(null)} onFocus={() => setHoverIndex(i)} onBlur={() => setHoverIndex(null)}>
                      <circle cx={pt.x} cy={pt.y} r={18} fill="rgba(0,0,0,0)" style={{ pointerEvents: 'all' }} />
                      <circle cx={pt.x} cy={pt.y} r={5} fill={hoverIndex === i ? '#ef4444' : '#fff'} stroke="#ef4444" strokeWidth={2} />
                    </g>
                  ))}
                </svg>
                {hoverIndex !== null && chart.points[hoverIndex] && (
                  <div className="absolute z-20 bg-white p-2 rounded shadow" style={{ left: Math.max(8, Math.min((chart.width ?? 760) - 120, chart.points[hoverIndex].x - 40)), top: Math.max(8, chart.points[hoverIndex].y - 50), pointerEvents: 'none' }}>
                    <div className="text-xs text-gray-500">{chart.points[hoverIndex].data.date}</div>
                    <div className="text-sm">当日: {chart.points[hoverIndex].data.dailyProfit === 0 ? '-' : (chart.points[hoverIndex].data.dailyProfit > 0 ? '+' : '') + chart.points[hoverIndex].data.dailyProfit.toFixed(2)}</div>
                    <div className="text-sm">累计: {chart.points[hoverIndex].data.cumulativeProfit === 0 ? '-' : (chart.points[hoverIndex].data.cumulativeProfit > 0 ? '+' : '') + chart.points[hoverIndex].data.cumulativeProfit.toFixed(2)}</div>
                  </div>
                )}
              </div>

              {/* Table: header (fixed), scrollable body, totals (fixed) */}
              <div className="text-xs mt-2">期间累计: {tableError ? <span className="text-red-600">{tableError}</span> : (periodTotal === 0 ? <span className="text-black">-</span> : (periodTotal > 0 ? <span className="text-red-600">+{periodTotal.toFixed(2)}</span> : <span className="text-green-600">{periodTotal.toFixed(2)}</span>))}</div>

              {/* 日期选择器：位于表格上方 */}
              <div className="mt-3 flex items-center space-x-4" style={{ position: 'relative', zIndex: 1400, background: '#ffffff', padding: '6px', borderRadius: '6px' }}>
                <div className="flex items-center space-x-2 text-xs text-gray-600">
                  <label>日期1</label>
                  <input type="date" value={fromDate ?? ''} onChange={e => setFromDate(e.target.value)} className="px-2 py-1 border rounded" />
                  <label>日期2</label>
                  <input type="date" value={toDate ?? ''} onChange={e => setToDate(e.target.value)} className="px-2 py-1 border rounded" />
                </div>
                {tableError && <div className="text-xs text-red-600">{tableError}</div>}
              </div>

              <div className="pt-4 border-t">
                {/* Table header stays visible outside the scroll area */}
                <div className="w-full">
                  <table className="w-full text-sm text-left table-fixed">
                    <colgroup>
                      <col style={{ width: '50%' }} />
                      <col style={{ width: '16.6667%' }} />
                      <col style={{ width: '16.6667%' }} />
                      <col style={{ width: '16.6667%' }} />
                    </colgroup>
                    <thead>
                      <tr className="text-xs text-gray-500">
                        <th className="px-3 py-2 bg-white">基金名称（基金代码）</th>
                        <th className="px-3 py-2 bg-white text-right">日期1累计盈利</th>
                        <th className="px-3 py-2 bg-white text-right">日期2累计盈利</th>
                        <th className="px-3 py-2 bg-white text-right">差额</th>
                      </tr>
                    </thead>
                  </table>
                </div>

                {/* Scrollable body: show up to 10 rows (approx 400px height) */}
                <div className="overflow-auto" style={{ maxHeight: '400px' }}>
                  <table className="w-full text-sm text-left table-fixed">
                    <colgroup>
                      <col style={{ width: '50%' }} />
                      <col style={{ width: '16.6667%' }} />
                      <col style={{ width: '16.6667%' }} />
                      <col style={{ width: '16.6667%' }} />
                    </colgroup>
                    <tbody>
                      {(() => {
                        const displayed = tableRows || [];
                        return displayed.map(p => (
                          <tr key={p.symbol} className="border-t">
                            <td className="px-3 py-2 align-top">{(p.name && p.name.trim()) ? `${p.name} (${String(p.symbol).padStart(6,'0')})` : `(${String(p.symbol).padStart(6,'0')})`}</td>
                            <td className="px-3 py-2 align-top text-right">{(p.profitFrom||0)===0? <span className="text-black">-</span> : <span className={`${(p.profitFrom||0)>0? 'text-red-600':'text-green-600'}`}>{(p.profitFrom||0).toFixed(2)}</span>}</td>
                            <td className="px-3 py-2 align-top text-right">{(p.profitTo||0)===0? <span className="text-black">-</span> : <span className={`${(p.profitTo||0)>0? 'text-red-600':'text-green-600'}`}>{(p.profitTo||0).toFixed(2)}</span>}</td>
                            <td className="px-3 py-2 align-top text-right">{moneyCell(p.profitDiff||0)}</td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>

                {/* Totals row stays visible below the scroll area */}
                <div className="w-full border-t bg-gray-50 font-bold">
                  <table className="w-full text-sm text-left table-fixed">
                    <colgroup>
                      <col style={{ width: '50%' }} />
                      <col style={{ width: '16.6667%' }} />
                      <col style={{ width: '16.6667%' }} />
                      <col style={{ width: '16.6667%' }} />
                    </colgroup>
                    <tbody>
                      {(() => {
                        const rows = tableRows || [];
                        const totalFrom = rows.reduce((s, r) => s + (r.profitFrom || 0), 0);
                        const totalTo = rows.reduce((s, r) => s + (r.profitTo || 0), 0);
                        const totalDiff = rows.reduce((s, r) => s + (r.profitDiff || 0), 0);
                        return (
                          <tr>
                            <td className="px-3 py-2">总计</td>
                            <td className="px-3 py-2 text-right">{totalFrom===0? <span className="text-black">-</span> : <span className={`${totalFrom>0? 'text-red-600':'text-green-600'}`}>{totalFrom.toFixed(2)}</span>}</td>
                            <td className="px-3 py-2 text-right">{totalTo===0? <span className="text-black">-</span> : <span className={`${totalTo>0? 'text-red-600':'text-green-600'}`}>{totalTo.toFixed(2)}</span>}</td>
                            <td className="px-3 py-2 text-right">{totalDiff===0? <span className="text-black">-</span> : totalDiff>0? <span className="text-red-600">+{totalDiff.toFixed(2)}</span> : <span className="text-green-600">{totalDiff.toFixed(2)}</span>}</td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
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

