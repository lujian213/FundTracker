import React, { useState, useEffect, useMemo } from 'react';
import { MarketIndex, HistoricalPoint } from '../types';
import { fetchIndexHistory } from '../services/fundService';
import * as cacheService from '../services/cacheService';
import IntradayChart from './IntradayChart';
import HistoryChart from './HistoryChart';
import { computeMultipleSMAs, MA_COLORS } from '../utils/movingAverage';
import { DEFAULT_VISIBLE_MAS, MA_WINDOWS } from '../utils/maConfig';
import { toLocalDateKey } from '../utils/priceResolver';

interface IndexDetailsModalProps {
  data: MarketIndex;
  onClose: () => void;
}

export const IndexDetailsModal: React.FC<IndexDetailsModalProps> = ({ data, onClose }) => {
  const [history, setHistory] = useState<HistoricalPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredPoint, setHoveredPoint] = useState<HistoricalPoint | null>(null);
  const [activeTab, setActiveTab] = useState<'intraday' | 'history'>('intraday');
  const [intradayPoints, setIntradayPoints] = useState<any[]>([]);
  const [visibleMAs, setVisibleMAs] = useState<Record<number, boolean>>(() => Object.fromEntries(DEFAULT_VISIBLE_MAS.map(n => [n, true])));
  const [hoveredIntradayPoint, setHoveredIntradayPoint] = useState<any | null>(null);
  // shared chart height to match FundDetailsModal
  const chartHeight = 180;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const points = await fetchIndexHistory(data.symbol);
      setHistory(points);
      setLoading(false);
    };
    load();
  }, [data.symbol]);

  useEffect(() => {
    try {
      const code = data.symbol;
      const pts = cacheService.getIntradayPoints(code);
      setIntradayPoints(pts);
    } catch (e) { setIntradayPoints([]); }
  }, [data.symbol, data.lastUpdated]);

  const { path, area, points, viewBox, yLabels, xLabels, maPaths, maValues } = useMemo(() => {
    const hist = history || [];
    if (hist.length < 2) return { path: '', area: '', points: [], viewBox: '0 0 100 100', yLabels: [], xLabels: [] };

    const width = 1000;
    const height = chartHeight;
    const paddingLeft = 80; // extra left space to ensure y-axis labels fit
    const paddingRight = 30;
    const paddingTop = 0;
    const paddingBottom = 0;

    const values = hist.map(p => p.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const margin = (rawMax - rawMin) * 0.1 || 0.01;
    const min = rawMin - margin;
    const max = rawMax + margin;
    const range = max - min;

    const getX = (idx: number) => paddingLeft + (idx * (width - paddingLeft - paddingRight) / (hist.length - 1));
    const getY = (val: number) => height - paddingBottom - ((val - min) / range * (height - paddingTop - paddingBottom));

    const svgPoints = hist.map((p, i) => ({
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
      return { text: val.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), y: getY(val) };
    });

    const xLabelIndices = [0, Math.floor(hist.length / 2), hist.length - 1];
    const xLabels = xLabelIndices.map(idx => {
      const d = new Date(hist[idx].date);
      return { text: `${d.getMonth() + 1}/${d.getDate()}`, x: getX(idx) };
    });

    // compute SMAs
    const maValues = computeMultipleSMAs(values, MA_WINDOWS);
    const maPaths: Record<number, string> = {};
    for (const w of MA_WINDOWS) {
      const sma = maValues[w];
      const smaPts = sma.map((v, i) => v !== null ? { x: getX(i), y: getY(v as number) } : null);
      const firstIdx = smaPts.findIndex(p => p !== null);
      if (firstIdx !== -1) {
        let d = `M ${(smaPts[firstIdx] as any).x} ${(smaPts[firstIdx] as any).y} `;
        for (let j = firstIdx + 1; j < smaPts.length; j++) {
          const p = smaPts[j]; if (p) d += `L ${p.x} ${p.y} `;
        }
        maPaths[w] = d;
      } else {
        maPaths[w] = '';
      }
    }

    return { path: pathData, area: areaData, points: svgPoints, viewBox: `0 0 ${width} ${height}`, yLabels, xLabels, maPaths, maValues };
  }, [history]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}></div>

      <div className="relative bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
        <div className="px-6 py-6 border-b border-gray-50 flex justify-between items-start">
          <div>
            <div className="flex items-center space-x-2 mb-1">
               <h2 className="text-xl font-black text-gray-800 leading-tight">{data.name}</h2>
               <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] font-mono">{data.symbol}</span>
            </div>
            <div className="flex items-baseline space-x-3">
              <span className={`text-2xl font-normal ${data.changePercent >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                {data.current.toLocaleString()}
              </span>
              <span className={`text-sm font-medium ${data.changePercent >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                {data.changePercent >= 0 ? '+' : ''}{data.changePercent.toFixed(2)}%
                <span className="ml-2">({data.change >= 0 ? '+' : ''}{data.change.toFixed(2)})</span>
              </span>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="flex-1 overflow-hidden p-6">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center space-y-3">
              <i className="fas fa-circle-notch animate-spin text-blue-500 text-3xl"></i>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">正在抓取指数趋势...</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="relative bg-gray-50 rounded-2xl p-4">
                <div className="mb-3 flex items-center space-x-2">
                  <button onClick={() => setActiveTab('intraday')} className={`px-3 py-1 rounded text-sm ${activeTab === 'intraday' ? 'bg-white border' : 'bg-transparent text-gray-500'}`}>日内趋势图</button>
                  <button onClick={() => setActiveTab('history')} className={`px-3 py-1 rounded text-sm ${activeTab === 'history' ? 'bg-white border' : 'bg-transparent text-gray-500'}`}>历史趋势图</button>
                </div>
                {activeTab === 'intraday' ? (
                  <>
                    <div className="mt-3 flex items-center space-x-2" aria-hidden>
                      <div className="text-xs text-transparent font-medium">占位：均线</div>
                    </div>
                    <IntradayChart points={intradayPoints} width={1000} height={chartHeight} stroke="#2563eb" onHover={p => setHoveredIntradayPoint(p)} />
                    <div className="mt-2 h-14 bg-white flex items-center justify-start px-4 border-t">
                      {(() => {
                        const hp = hoveredIntradayPoint as any;
                        const fmtTime = (ts: number) => { try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return new Date(ts).toLocaleString(); } };
                        let timeLabel = '—';
                        let valueLabel = '—';
                        let changeText = '—';
                        let changeClass = 'text-gray-700';
                        if (hp) {
                          timeLabel = hp.timestamp ? fmtTime(hp.timestamp) : '—';
                          valueLabel = typeof hp.value === 'number' ? hp.value.toFixed(4) : '—';
                          const pct = hp.equityReturn;
                          if (typeof pct === 'number') {
                            const prev = pct === -100 ? 0 : hp.value / (1 + pct / 100);
                            const abs = hp.value - prev;
                            changeText = `${abs.toFixed(4)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
                            changeClass = pct >= 0 ? 'text-red-600' : 'text-green-600';
                          }
                        } else if (intradayPoints && intradayPoints.length > 0) {
                          const last = intradayPoints[intradayPoints.length - 1];
                          timeLabel = last.timestamp ? fmtTime(last.timestamp) : '—';
                          valueLabel = typeof last.value === 'number' ? last.value.toFixed(4) : '—';
                        }
                        return (<><div className="w-36 mr-6"><div className="text-[10px] text-gray-400">时间</div><div className="text-sm font-medium text-gray-800">{timeLabel}</div></div><div className="w-44 mr-6"><div className="text-[10px] text-gray-400">净值</div><div className="text-sm font-medium text-gray-800">{valueLabel}</div></div><div className="w-48 mr-6"><div className="text-[10px] text-gray-400">较上一日</div><div className={`text-sm font-medium ${changeClass}`}>{changeText}</div></div></>);
                      })()}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mt-0">
                      <HistoryChart
                         viewBox={viewBox}
                         path={path}
                         area={area}
                         points={points}
                         yLabels={yLabels}
                         xLabels={xLabels}
                         maPaths={maPaths}
                         maValues={maValues}
                         visibleMAs={visibleMAs}
                         hoveredPoint={hoveredPoint}
                         setHoveredPoint={setHoveredPoint}
                         stroke="#2563eb"
                         height={chartHeight}
                       />
                    </div>
                  </>
                )}

                {/* MA toggles and reserved area for history tab */}
                {activeTab === 'history' && (
                  <div className="mt-3 flex items-center space-x-2">
                    <label className="text-xs text-gray-500 font-medium">均线：</label>
                    {[5,10,20].map(n => {
                      const color = MA_COLORS[n] || '#2563eb';
                      return (
                        <button key={n} type="button" aria-label={`切换显示 MA${n}`} onClick={() => setVisibleMAs(v => ({ ...v, [n]: !v[n] }))}
                          className="text-xs px-2.5 py-1 rounded border inline-flex items-center gap-1.5 transition-colors" style={{ borderColor: color, color, backgroundColor: visibleMAs[n] ? `${color}1a` : '#ffffff' }}>
                          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                          <span className="font-medium">MA{n}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {activeTab === 'history' && (
                  <div className="mt-2 h-14 bg-white flex items-center justify-start px-4 border-t">
                    {(() => {
                      const hp = hoveredPoint as any;
                      let dateLabel = '—';
                      let valueLabel = '—';
                      let changeText = '—';
                      let changeClass = 'text-gray-700';
                      if (hp && points && points.length > 0) {
                        const idx = points.findIndex((p: any) => p.data === hp);
                        const v = (idx >= 0) ? points[idx].data.value : (points[points.length - 1].data.value);
                        const d = (idx >= 0) ? new Date(points[idx].data.date) : new Date(points[points.length - 1].data.date);
                        dateLabel = toLocalDateKey(d);
                        valueLabel = v.toFixed(4);
                        const prev = (idx > 0) ? points[idx - 1].data.value : null;
                        if (prev !== null && prev !== undefined) {
                          const abs = v - prev;
                          const pct = prev !== 0 ? (abs / prev * 100) : 0;
                          changeText = `${abs.toFixed(4)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
                          changeClass = pct >= 0 ? 'text-red-600' : 'text-green-600';
                        }
                      } else if (points && points.length > 0) {
                        const last = points[points.length - 1];
                        dateLabel = toLocalDateKey(new Date(last.data.date));
                        valueLabel = last.data.value.toFixed(4);
                        changeText = '—';
                      }
                      return (
                        <>
                          <div className="w-36 mr-6"><div className="text-[10px] text-gray-400">时间</div><div className="text-sm font-medium text-gray-800">{dateLabel}</div></div>
                          <div className="w-44 mr-6"><div className="text-[10px] text-gray-400">净值</div><div className="text-sm font-medium text-gray-800">{valueLabel}</div></div>
                          <div className="w-48 mr-6"><div className="text-[10px] text-gray-400">涨跌</div><div className={`text-sm font-medium ${changeClass}`}>{changeText}</div></div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4">
                 <div className="p-4 bg-gray-50 rounded-2xl">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">行情更新时间</p>
                    <p className="text-sm font-bold text-gray-700">{data.lastUpdated}</p>
                 </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
