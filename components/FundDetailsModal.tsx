
import React, { useState, useEffect, useMemo } from 'react';
import { ValuationData, HistoricalPoint } from '../types';
import { fetchFundHistory } from '../services/fundService';

interface FundDetailsModalProps {
  data: ValuationData;
  onClose: () => void;
}

export const FundDetailsModal: React.FC<FundDetailsModalProps> = ({ data, onClose }) => {
  const [history, setHistory] = useState<HistoricalPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredPoint, setHoveredPoint] = useState<HistoricalPoint | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const points = await fetchFundHistory(data.symbol);
      setHistory(points.slice(-90));
      setLoading(false);
    };
    load();
  }, [data.symbol]);

  // 合并实时估值点
  const chartData = useMemo(() => {
    if (history.length === 0) return [];

    const lastHist = history[history.length - 1];
    // 使用实时日期 (realtimeDate) 生成时间戳，而不是确认净值日期
    const valuationTs = new Date(data.realtimeDate + ' 15:00').getTime();

    if (valuationTs > lastHist.date) {
      return [...history, {
        date: valuationTs,
        value: data.currentPrice,
        equityReturn: data.changePercentage
      }];
    }
    return history;
  }, [history, data]);

  const { path, area, points, viewBox, yLabels, xLabels } = useMemo(() => {
    if (chartData.length < 2) return { path: '', area: '', points: [], viewBox: '0 0 100 100', yLabels: [], xLabels: [] };

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

    return { path: pathData, area: areaData, points: svgPoints, viewBox: `0 0 ${width} ${height}`, yLabels, xLabels };
  }, [chartData]);

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
              <span className={`text-2xl font-normal ${data.changePercentage >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                {data.currentPrice.toFixed(4)}
              </span>
              <span className={`text-sm font-medium ${data.changePercentage >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                {data.changePercentage >= 0 ? '+' : ''}{data.changePercentage.toFixed(2)}%
              </span>
              <span className="text-[10px] text-gray-400 font-medium">前值: {data.previousPrice.toFixed(4)} ({data.netWorthDate.split('-').slice(1).join('/')})</span>
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
                <div className="absolute top-4 left-4 z-10">
                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">净值趋势 (近90个交易日)</p>
                   {hoveredPoint ? (
                     <div className="animate-in fade-in slide-in-from-left-2 duration-150">
                        <p className="text-lg font-normal text-gray-800">{hoveredPoint.value.toFixed(4)}</p>
                        <p className="text-[10px] text-gray-500 font-bold">
                           {new Date(hoveredPoint.date).toLocaleDateString()}
                           <span className={`ml-2 font-medium ${hoveredPoint.equityReturn >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                             {hoveredPoint.equityReturn > 0 ? '+' : ''}{hoveredPoint.equityReturn.toFixed(2)}%
                           </span>
                        </p>
                     </div>
                   ) : (
                     <div className="text-[10px] text-gray-300 italic font-medium">查看走势图</div>
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
                  <circle cx={points[points.length - 1]?.x} cy={points[points.length - 1]?.y} r="6" fill="#ef4444" className="animate-pulse" />
                  {points.map((p, i) => (
                    <rect key={i} x={p.x - 5} y={0} width="10" height="400" fill="transparent" onMouseEnter={() => setHoveredPoint(p.data)} className="cursor-crosshair" />
                  ))}
                  {hoveredPoint && (
                     <line x1={points.find(p => p.data === hoveredPoint)?.x} y1="40" x2={points.find(p => p.data === hoveredPoint)?.x} y2="380" stroke="#ef4444" strokeWidth="1" strokeDasharray="4 2" className="pointer-events-none" />
                  )}
                </svg>
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
