import React, { useState, useEffect, useMemo } from 'react';
import { ValuationData, HistoricalPoint } from '../types';
import { fetchFundHistory as defaultFetchFundHistory } from '../services/fundService';
import { computeMultipleSMAs, MA_COLORS } from '../utils/movingAverage';
import { TOLERANCE, DEFAULT_VISIBLE_MAS, MA_WINDOWS } from '../utils/maConfig';

interface FundDetailsModalProps {
  data: ValuationData;
  onClose: () => void;
  fetchHistory?: (symbol: string) => Promise<HistoricalPoint[]>; // optional injection for tests
}

export const FundDetailsModal: React.FC<FundDetailsModalProps> = ({ data, onClose, fetchHistory }) => {
  const [history, setHistory] = useState<HistoricalPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredPoint, setHoveredPoint] = useState<HistoricalPoint | null>(null);
  const [visibleMAs, setVisibleMAs] = useState<Record<number, boolean>>(() => Object.fromEntries(DEFAULT_VISIBLE_MAS.map(n => [n, true])));
  const [showTooltip, setShowTooltip] = useState(false);

  const fetchFn = fetchHistory ?? defaultFetchFundHistory;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const points = await fetchFn(data.symbol);
        if (mounted) setHistory(points.slice(-90));
      } catch (e) {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [data.symbol, fetchFn]);

  // 合并实时估值点
  const chartData = useMemo(() => {
    if (history.length === 0) return [];

    const lastHist = history[history.length - 1];
    // 使用实时日期 (realtimeDate) 生成时间戳
    const dateStr = data.realtimeDate && data.realtimeDate !== '---' ? data.realtimeDate : new Date().toISOString().split('T')[0];
    const valuationTs = new Date(dateStr + ' 15:00').getTime();

    if (!isNaN(valuationTs) && valuationTs > lastHist.date) {
      return [...history, {
        date: valuationTs,
        value: data.currentPrice,
        equityReturn: data.changePercentage
      }];
    }
    return history;
  }, [history, data]);

  const { path, area, points, viewBox, yLabels, xLabels, maPaths, maValues } = useMemo(() => {
    if (chartData.length < 2) return { path: '', area: '', points: [], viewBox: '0 0 100 100', yLabels: [], xLabels: [], maPaths: {} as Record<number, string>, maValues: {} as Record<number, (number | null)[]> };

    const width = 1000;
    const height = 450;
    const paddingLeft = 60;
    const paddingRight = 30;
    const paddingTop = 40;
    const paddingBottom = 60;

    const values = chartData.map(p => p.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const margin = (rawMax - rawMin) * 0.1 || 0.01;
    const min = rawMin - margin;
    const max = rawMax + margin;
    const range = max - min;

    const getX = (idx: number) => paddingLeft + (idx * (width - paddingLeft - paddingRight) / (chartData.length - 1));
    const getY = (val: number) => height - paddingBottom - ((val - min) / range * (height - paddingTop - paddingBottom));

    const svgPoints = chartData.map((p, i) => ({
      x: getX(i),
      y: getY(p.value),
      data: p
    }));

    const pathData = `M ${svgPoints[0].x} ${svgPoints[0].y} ` +
      svgPoints.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');

    const areaData = pathData +
      ` L ${svgPoints[svgPoints.length - 1].x} ${height - paddingBottom}` +
      ` L ${svgPoints[0].x} ${height - paddingBottom} Z`;

    const yLabelsCount = 4;
    const yLabels = Array.from({ length: yLabelsCount }).map((_, i) => {
      const val = min + (i * range / (yLabelsCount - 1));
      return { text: val.toFixed(4), y: getY(val) };
    });

    const xLabelIndices = [0, Math.floor(chartData.length / 2), chartData.length - 1];
    const xLabels = xLabelIndices.map(idx => {
      const d = new Date(chartData[idx].date);
      return { text: `${d.getMonth() + 1}/${d.getDate()}`, x: getX(idx) };
    });

    // Calculate multiple SMAs (5,10,20)
    const maValues = computeMultipleSMAs(values, MA_WINDOWS);
    const maPaths: Record<number, string> = {};

    for (const w of MA_WINDOWS) {
      const sma = maValues[w];
      // build path for this SMA
      const smaPts = sma.map((v, i) => v !== null ? { x: getX(i), y: getY(v as number) } : null);
      const firstIdx = smaPts.findIndex(p => p !== null);
      if (firstIdx !== -1) {
        let d = `M ${(smaPts[firstIdx] as any).x} ${(smaPts[firstIdx] as any).y} `;
        for (let j = firstIdx + 1; j < smaPts.length; j++) {
          const p = smaPts[j];
          if (p) d += `L ${p.x} ${p.y} `;
        }
        maPaths[w] = d;
      } else {
        maPaths[w] = '';
      }
    }

    return { path: pathData, area: areaData, points: svgPoints, viewBox: `0 0 ${width} ${height}`, yLabels, xLabels, maPaths, maValues };
  }, [chartData]);

  // Rating logic based on MAs and price
  const ratingInfo = useMemo(() => {
    const lastIndex = points.length - 1;
    const prevIndex = Math.max(0, lastIndex - 1);
    const price = points[lastIndex]?.data?.value ?? data.currentPrice;

    const getVal = (arr: (number | null)[], idx: number) => (arr && arr[idx] !== null) ? (arr[idx] as number) : null;

    const sma5 = maValues[5] ? getVal(maValues[5], lastIndex) : null;
    const sma10 = maValues[10] ? getVal(maValues[10], lastIndex) : null;
    const sma20 = maValues[20] ? getVal(maValues[20], lastIndex) : null;

    const prev_sma5 = maValues[5] ? getVal(maValues[5], prevIndex) : null;
    const prev_sma10 = maValues[10] ? getVal(maValues[10], prevIndex) : null;

    const reasons: string[] = [];
    let rating: '危险' | '谨慎' | '安全' | '机会' = '谨慎';
    let color = '#f59e0b';
    let action = '观望';

    // If we don't have enough data for sma20, fallback to safe/caution logic
    if (sma20 !== null && price < sma20) {
      rating = '危险';
      color = '#ef4444';
      action = '撤离';
      reasons.push(`当前价格 ${price.toFixed(4)} 已跌破 20 日均线 (${sma20.toFixed(4)})，进入阶段性风险期`);
      return { rating, color, action, reasons };
    }

    if (sma5 !== null && sma10 !== null && sma5 > sma10) {
      reasons.push('5 日均线位于 10 日均线之上，表明短期上升趋势');

      // Detect golden cross
      if (prev_sma5 !== null && prev_sma10 !== null && prev_sma5 <= prev_sma10 && sma5 > sma10) {
        reasons.push('最近发生 5 日均线向上突破 10 日均线（黄金交叉）');
        if (price >= (sma5 * TOLERANCE)) {
          rating = '机会';
          color = '#3b82f6';
          action = '进场';
          reasons.push('股价回踩触及 5 日均线但未跌破，短期可作为入场机会');
          return { rating, color, action, reasons };
        } else {
          rating = '安全';
          color = '#10b981';
          action = '进场';
          reasons.push('黄金交叉后走势稳健，建议关注回踩机会');
          return { rating, color, action, reasons };
        }
      }

      // No recent cross, but 5 > 10
      if (price >= (sma5 * TOLERANCE)) {
        rating = '机会';
        color = '#3b82f6';
        action = '进场';
        reasons.push('股价回踩触及 5 日均线但未跌破，短期可考虑入场');
        return { rating, color, action, reasons };
      }

      rating = '安全';
      color = '#10b981';
      action = '进场';
      reasons.push('5 日均线上行，处于相对安全的上升趋势');
      return { rating, color, action, reasons };
    }

    // If 5 <= 10 (短期弱势)
    if (sma5 !== null && sma10 !== null && sma5 <= sma10) {
      reasons.push('5 日均线位于或下穿 10 日均线，短期弱势');
      if (sma10 !== null && price < sma10) {
        reasons.push(`当前价格 ${price.toFixed(4)} 已跌破 10 日均线 (${sma10.toFixed(4)})，短线风险增加`);
        rating = '谨慎';
        color = '#f59e0b';
        action = '观望';
        return { rating, color, action, reasons };
      }
      rating = '谨慎';
      color = '#f59e0b';
      action = '观望';
      return { rating, color, action, reasons };
    }

    // Default
    reasons.push('数据不足或均线关系不明确，建议观望');
    rating = '谨慎';
    color = '#f59e0b';
    action = '观望';
    return { rating, color, action, reasons };

  }, [maValues, points, data.currentPrice]);

  const formattedNetWorthDate = data.netWorthDate && data.netWorthDate !== '---'
    ? data.netWorthDate.split('-').slice(1).join('/')
    : '---';

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}></div>

      <div className="relative bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
        <div className="px-6 py-6 border-b border-gray-50 flex justify-between items-start">
          <div>
            <div className="flex items-center space-x-2 mb-1">
               <h2 className="text-xl font-black text-gray-800 leading-tight">{data.name}</h2>
               <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] font-mono">{data.symbol}</span>
               {/* Rating badge */}
               <div className="ml-2 relative inline-block">
                 <button
                   onMouseEnter={() => setShowTooltip(true)}
                   onMouseLeave={() => setShowTooltip(false)}
                   onFocus={() => setShowTooltip(true)}
                   onBlur={() => setShowTooltip(false)}
                   aria-describedby="ma-rating-tooltip"
                   className="text-xs font-bold px-2 py-1 rounded-md"
                   style={{ backgroundColor: ratingInfo.color, color: '#fff' }}
                   aria-label={`风险评级 ${ratingInfo.rating}`}
                 >
                   {ratingInfo.rating}
                 </button>
                 {showTooltip && (
                   <div id="ma-rating-tooltip" role="tooltip" className="absolute left-0 top-full mt-2 w-60 bg-white border rounded shadow-lg p-3 text-xs z-50">
                     <div className="font-bold mb-1">评级：{ratingInfo.rating} &nbsp; <span className="font-normal">({ratingInfo.action})</span></div>
                     <ul className="list-disc pl-4 space-y-1">
                       {ratingInfo.reasons.map((r, i) => <li key={i}>{r}</li>)}
                     </ul>
                   </div>
                 )}
               </div>
            </div>
            <div className="flex items-baseline space-x-3">
              <span className={`text-2xl font-normal ${data.changePercentage >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                {data.currentPrice.toFixed(4)}
              </span>
              <span className={`text-sm font-medium ${data.changePercentage >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                {data.changePercentage >= 0 ? '+' : ''}{data.changePercentage.toFixed(2)}%
              </span>
              <span className="text-[10px] text-gray-400 font-medium">前值: {data.previousPrice.toFixed(4)} ({formattedNetWorthDate})</span>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center space-y-3">
              <i className="fas fa-circle-notch animate-spin text-red-500 text-3xl"></i>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">正在抓取净值趋势...</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="relative bg-gray-50 rounded-2xl p-4">
                <div className="absolute top-4 left-4 z-10 h-12">
                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">净值趋势 (近90个交易日)</p>
                   {hoveredPoint && (
                     <div className="animate-in fade-in slide-in-from-left-2 duration-150">
                        <p className="text-lg font-normal text-gray-800">{hoveredPoint.value.toFixed(4)}</p>
                        <p className="text-[10px] text-gray-500 font-bold">
                           {new Date(hoveredPoint.date).toLocaleDateString()}
                           <span className={`ml-2 font-medium ${hoveredPoint.equityReturn >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                             {hoveredPoint.equityReturn > 0 ? '+' : ''}{hoveredPoint.equityReturn.toFixed(2)}%
                           </span>
                        </p>
                        {/* show MA values at hovered index */}
                        <div className="flex items-center space-x-2 mt-1">
                          {Object.keys(maValues).map(k => {
                            const n = parseInt(k, 10);
                            const arr = maValues[n];
                            const idx = points.findIndex(p => p.data === hoveredPoint);
                            const v = idx >= 0 ? arr[idx] : null;
                            if (!v) return null;
                            return (
                              <span key={k} className="text-xs font-mono text-gray-500">
                                <span style={{ color: MA_COLORS[n] }}>{n}：</span>{v.toFixed(4)}
                              </span>
                            );
                          })}
                        </div>
                     </div>
                   )}
                </div>

                <svg viewBox={viewBox} className="w-full h-auto drop-shadow-sm overflow-visible" onMouseLeave={() => setHoveredPoint(null)}>
                  <defs>
                    <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {yLabels.map((label, i) => (
                    <g key={i}>
                      <line x1="60" y1={label.y} x2="970" y2={label.y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 4" />
                      <text x="50" y={label.y} textAnchor="end" alignmentBaseline="middle" className="text-[22px] fill-gray-400 font-mono">{label.text}</text>
                    </g>
                  ))}
                  {xLabels.map((label, i) => (
                    <text key={i} x={label.x} y="420" textAnchor="middle" className="text-[22px] fill-gray-400 font-medium">{label.text}</text>
                  ))}
                  <path d={area} fill="url(#gradient)" className="transition-all duration-700" />
                  <path d={path} fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="transition-all duration-700" />
                  {/* render MA lines based on visibility */}
                  {Object.keys(maPaths).map(k => {
                    const n = parseInt(k, 10);
                    const d = maPaths[n];
                    if (!d || !visibleMAs[n]) return null;
                    return <path key={k} d={d} fill="none" stroke={MA_COLORS[n] || '#2563eb'} strokeWidth={n === 5 ? 2 : 1.5} strokeLinecap="round" className="transition-all duration-700" />;
                  })}
                  <circle cx={points[points.length - 1]?.x} cy={points[points.length - 1]?.y} r="6" fill="#ef4444" className="animate-pulse" />
                  {points.map((p, i) => (
                    <rect key={i} x={p.x - 5} y={0} width="10" height="400" fill="transparent" onMouseEnter={() => setHoveredPoint(p.data)} className="cursor-crosshair" />
                  ))}
                  {hoveredPoint && (
                     <line x1={points.find(p => p.data === hoveredPoint)?.x} y1="40" x2={points.find(p => p.data === hoveredPoint)?.x} y2="380" stroke="#ef4444" strokeWidth="1" strokeDasharray="4 2" className="pointer-events-none" />
                  )}
                </svg>

                <div className="mt-3 flex items-center space-x-2">
                  <label className="text-xs text-gray-500 font-medium">均线：</label>
                  {[5,10,20].map(n => (
                    <button key={n} type="button" onClick={() => setVisibleMAs(v => ({ ...v, [n]: !v[n] }))} className={`text-xs px-2 py-1 rounded ${visibleMAs[n] ? 'bg-gray-100' : 'bg-white'} border`}>{n}</button>
                  ))}
                </div>

              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div className="p-4 bg-gray-50 rounded-2xl">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">最后更新</p>
                    <p className="text-sm font-bold text-gray-700">{data.lastUpdated}</p>
                 </div>
                 <div className="p-4 bg-gray-50 rounded-2xl">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">估值日期</p>
                    <p className="text-sm font-bold text-gray-700">{data.realtimeDate}</p>
                 </div>
              </div>

              <a href={data.sourceUrl} target="_blank" rel="noreferrer" className="block w-full py-4 text-center text-xs font-bold text-gray-400 border border-gray-100 rounded-2xl hover:bg-gray-50 transition-colors">
                在天天基金查看详细页 <i className="fas fa-external-link-alt ml-1"></i>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
