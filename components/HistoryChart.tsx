import React, { useMemo } from 'react';
import { HistoricalPoint, VolumeData } from '../types';
import { MA_COLORS } from '../utils/movingAverage';
import { toLocalDateKey } from '../utils/priceResolver';

interface HistoryChartProps {
  viewBox: string;
  path: string;
  area: string;
  points: { x: number; y: number; data: HistoricalPoint }[];
  yLabels: { text: string; y: number }[];
  xLabels: { text: string; x: number }[];
  maPaths?: Record<number, string>;
  maValues?: Record<number, (number | null)[]>;
  visibleMAs: Record<number, boolean>;
  onToggleMA?: (n: number) => void;
  onMarkerHover?: (m: { date: number; type?: string; trade?: any } | null) => void;
  hoveredPoint: HistoricalPoint | null;
  setHoveredPoint: (p: HistoricalPoint | null) => void;
  height?: number;
  stroke?: string;
  markers?: { x: number; y: number; date: number; type?: 'buy' | 'sell' | string; shares?: number; amount?: number }[];
  // 成交量相关（仅指数使用）
  volumeData?: VolumeData[]; // 成交量柱状图数据
  volumeHeight?: number; // 成交量图表高度，默认 60
}

const HistoryChart: React.FC<HistoryChartProps> = ({
  viewBox,
  path,
  area,
  points,
  yLabels,
  xLabels,
  maPaths,
  maValues,
  visibleMAs,
  onToggleMA,
  onMarkerHover,
  hoveredPoint,
  setHoveredPoint,
  height = 280,
  stroke = '#ef4444',
  markers,
  volumeData,
  volumeHeight = 60
}) => {
  // find index of hovered point for MA lookup
  const hoveredIndex = hoveredPoint ? points.findIndex(p => p.data === hoveredPoint) : -1;

  // helper: format a timestamp into local YYYY-MM-DD
  const formatLocalDate = (ts: number | string) => {
    return toLocalDateKey(ts);
  };

  // chart paddings must match modal chartData paddingTop/paddingBottom and paddingLeft/paddingRight
  const PADDING_LEFT = 110; // increased to reserve space for up to ~12 chars (including thousand separators and symbols)
  const PADDING_RIGHT = 30;
  const PADDING_TOP = 20; // increase top padding so the top hover label stays inside viewBox
  const PADDING_BOTTOM = 0;

  // 是否显示成交量
  const showVolume = volumeData && volumeData.length > 0;

  // 计算总高度（价格图 + 成交量图）
  const totalHeight = showVolume ? height + volumeHeight : height;

  // 成交量图表参数
  const volumeChartParams = useMemo(() => {
    if (!showVolume || !volumeData || volumeData.length === 0) return null;

    const volumes = volumeData.map(v => v.volume);
    const maxVolume = Math.max(...volumes, 1); // 避免除零

    return {
      maxVolume,
      chartY: height, // 成交量图从价格图底部开始
      chartHeight: volumeHeight - 10, // 留出底部空间
    };
  }, [showVolume, volumeData, height, volumeHeight]);

  // 计算 viewBox（如果显示成交量，需要扩展高度）
  const actualViewBox = useMemo(() => {
    if (!showVolume) return viewBox;
    const vb = (viewBox || '0 0 1000 280').split(' ').map(Number);
    const vbW = vb[2] || 1000;
    return `0 0 ${vbW} ${totalHeight}`;
  }, [showVolume, viewBox, totalHeight]);

  return (
    <>
      <svg viewBox={actualViewBox} className={`w-full drop-shadow-sm`} style={{ height: totalHeight }} onMouseLeave={() => { setHoveredPoint(null); if (typeof (onMarkerHover) === 'function') onMarkerHover(null); }}>
        <defs>
          <linearGradient id="history-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.2" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
          {/* 成交量涨跌颜色 */}
          <linearGradient id="volume-up-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id="volume-down-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.4" />
          </linearGradient>
        </defs>
        {(() => {
          const vb = (viewBox || '0 0 1000 280').split(' ').map(Number);
          const vbW = vb[2] || 1000;
          const vbH = vb[3] || height;
          const chartX = PADDING_LEFT;
          const chartY = PADDING_TOP;
          const chartW = vbW - PADDING_LEFT - PADDING_RIGHT;
          const chartH = vbH - PADDING_TOP - PADDING_BOTTOM;

          return (
            <>
              {yLabels.map((label, i) => (
                <g key={`y-${i}`}>
                  <line x1={chartX} y1={label.y} x2={chartX + chartW} y2={label.y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 4" />
                  {/* smaller font and reserve left space; label.text already does not include unit like '元' */}
                  <text x={chartX - 12} y={label.y} textAnchor="end" alignmentBaseline="middle" className="text-[14px] fill-gray-400 font-mono">{label.text}</text>
                </g>
              ))}

              {xLabels.map((label, i) => {
              // 当显示成交量时，x轴标签应在成交量图表下方
              const xLabelY = showVolume ? totalHeight - 4 : chartY + chartH + 16;
              return (
                <text key={`x-${i}`} x={label.x} y={xLabelY} textAnchor="middle" className="text-[14px] fill-gray-400 font-medium">{label.text}</text>
              );
            })}
            </>
          );
        })()}
        <path d={area} fill="url(#history-gradient)" className="transition-all duration-700" />
        <path d={path} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="transition-all duration-700" />

        {Object.keys(maPaths || {}).map(k => {
          const n = parseInt(k, 10);
          const d = (maPaths || {})[n];
          if (!d || !visibleMAs[n]) return null;
          return <path key={`ma-${k}`} d={d} fill="none" stroke={MA_COLORS[n] || '#2563eb'} strokeWidth={n === 5 ? 2 : 1.5} strokeLinecap="round" className="transition-all duration-700" />;
        })}

        <circle cx={points[points.length - 1]?.x} cy={points[points.length - 1]?.y} r="6" fill={stroke} className="animate-pulse" />

        {/* 成交量图表时显示所有数据点的小圆点（与日内趋势图样式一致） */}
        {showVolume && points.map((p, i) => (
          <circle key={`pt-${i}`} cx={p.x} cy={p.y} r="3" fill="#fff" stroke={stroke} strokeWidth="1" />
        ))}

        {points.map((p, i) => (
          <rect key={i} x={p.x - 5} y={0} width="10" height={Math.max(1, height - 40)} fill="transparent" onMouseEnter={() => setHoveredPoint(p.data)} className="cursor-crosshair" />
        ))}

        {/* 成交量柱状图（仅指数显示） */}
        {showVolume && volumeChartParams && volumeData && (
          <g className="volume-chart">
            {/* 成交量区域背景线 */}
            <line
              x1={PADDING_LEFT}
              y1={volumeChartParams.chartY + volumeChartParams.chartHeight}
              x2={PADDING_LEFT + (points.length > 1 ? points[points.length - 1].x - points[0].x : 0) + 20}
              y2={volumeChartParams.chartY + volumeChartParams.chartHeight}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
            {/* 成交量柱状图 */}
            {volumeData.map((v, i) => {
              const barHeight = (v.volume / volumeChartParams.maxVolume) * volumeChartParams.chartHeight;
              const barWidth = Math.max(3, (points.length > 1 ? (points[1].x - points[0].x) * 0.7 : 6));
              return (
                <rect
                  key={`vol-${i}`}
                  x={v.x - barWidth / 2}
                  y={volumeChartParams.chartY + volumeChartParams.chartHeight - barHeight}
                  width={barWidth}
                  height={Math.max(1, barHeight)}
                  fill={v.isUp ? 'url(#volume-up-gradient)' : 'url(#volume-down-gradient)'}
                  className="transition-all duration-300"
                />
              );
            })}
            {/* 成交量标签 */}
            <text
              x={PADDING_LEFT - 12}
              y={volumeChartParams.chartY + 12}
              textAnchor="end"
              className="text-[10px] fill-gray-400 font-mono"
            >
              VOL
            </text>
          </g>
        )}

        {/* markers (e.g. trades) - render above overlays */}
        {(Array.isArray(markers) ? markers : []).map((m: any, idx: number) => (
          <g key={`marker-${idx}`} onMouseEnter={() => { const hp = points.find(pt => pt.data.date === m.date); setHoveredPoint(hp ? hp.data : null); if (onMarkerHover) onMarkerHover(m); }} onMouseLeave={() => { setHoveredPoint(null); if (onMarkerHover) onMarkerHover(null); }} className="pointer-events-auto">
            <circle data-testid={`marker-circle-${idx}`} cx={m.x} cy={m.y} r={5} fill={m.type === 'position_start' ? '#22c55e' : (m.type === 'sell' ? '#2563eb' : '#ef4444')} stroke="#fff" strokeWidth={1} />
          </g>
        ))}

        {/* marker hovertips (render when a marker is hovered via hoveredPoint + matching marker) */}
        {(() => {
          if (!Array.isArray(markers) || markers.length === 0) return null;
          // prefer hoveredPoint match; otherwise nothing
          const hpPoint = hoveredPoint ? points.find(p => p.data === hoveredPoint) : undefined;
          if (!hpPoint) return null;
          const m = (markers as any[]).find((mm: any) => mm.date === (hpPoint.data as any).date);
          if (!m) return null;

          // Calculate date label position to avoid overlap
          const vbParts = (viewBox || '0 0 1000 280').split(' ').map(Number);
          const vbH = vbParts[3] || height;
          const chartTop = PADDING_TOP;
          const dateLabelY = Math.max(18, chartTop - 4); // Date label Y position (same as in line 182)

          // Position tooltip below the marker, or below the date label if it would overlap
          const baseTooltipY = m.y - 36;
          const minTooltipY = dateLabelY + 20; // 20px below the date label to avoid overlap
          const tooltipY = Math.max(minTooltipY, baseTooltipY);
          const tooltipX = Math.max(40, Math.min(Number(viewBox.split(' ')[2]) - 120, m.x));

          // Different lines depending on marker type
          let lines: string[];
          if (m.type === 'position_start') {
            lines = ['持仓开始', `${m.shares} 份`];
          } else {
            lines = [(m.type === 'sell' ? '卖出' : '买入'), `${m.shares !== undefined ? m.shares : '—'} 份`, `${m.amount !== undefined ? m.amount.toFixed(2) + ' 元' : '—'}`];
          }

          return (
            <g className="pointer-events-none">
              <rect x={tooltipX - 60} y={tooltipY - 20} rx={6} ry={6} width={120} height={m.type === 'position_start' ? 34 : 48} fill="#111827" fillOpacity={0.9} />
              {lines.map((ln, i) => (
                <text key={i} x={tooltipX} y={tooltipY - 6 + i * 14} textAnchor="middle" className="text-[11px] font-medium" fill="#fff">{ln}</text>
              ))}
            </g>
          );
        })()}

        {/* MA values display at top-left inside chart area */}
        {maValues && Object.keys(maValues).length > 0 && (
          <g>
            {(() => {
              const keys = Object.keys(maValues).map(k => parseInt(k, 10)).filter(n => visibleMAs[n]).sort((a,b) => a - b);
              const baseX = 70;
              const gap = 120; // provide wide spacing so each value can show ~10 chars
              return keys.map((n, idx) => {
                const arr = maValues[n] || [];
                const v = hoveredIndex >= 0 && hoveredIndex < arr.length ? arr[hoveredIndex] : null;
                return (
                  <text key={`ma-val-${n}`} x={baseX + idx * gap} y={8} textAnchor="start" className="text-[12px] font-medium" fill={MA_COLORS[n] || '#2563eb'}>
                    {`MA${n}: ${v !== null && v !== undefined ? (v as number).toFixed(4) : '—'}`}
                  </text>
                );
              });
            })()}
          </g>
        )}

        {(() => {
          // match hovered point by date to be robust across object identity
          const hpPoint = hoveredPoint ? points.find(p => p.data && (p.data as any).date === (hoveredPoint as any).date) : undefined;
          const px = hpPoint ? hpPoint.x : undefined;
          if (px === undefined || px === null) return null;
          // compute svg height from viewBox if provided
          const vbParts = (viewBox || '0 0 1000 280').split(' ').map(Number);
          const vbW = vbParts[2] || 1000;
          const vbH = vbParts[3] || height;
          const chartTop = PADDING_TOP;
          const chartBottom = showVolume ? totalHeight : (vbH - PADDING_BOTTOM);
          // compute label text and estimate its half width (approx) so we can clamp x precisely
          const labelText = formatLocalDate((hoveredPoint as any).date);
          const EST_CHAR_WIDTH = 7; // conservative per-char px width at font-size ~14
          const halfWidth = Math.ceil((labelText.length * EST_CHAR_WIDTH) / 2) + 6; // +6px padding (more conservative)
          const labelX = Math.max(halfWidth, Math.min(vbW - halfWidth, px));
           return (
             <>
               <line x1={px} y1={chartTop} x2={px} y2={chartBottom} stroke={stroke} strokeWidth="1" strokeDasharray="4 2" className="pointer-events-none" />
              <text x={labelX} y={Math.max(18, chartTop - 4)} textAnchor="middle" className="text-[12px] font-medium fill-gray-600 pointer-events-none">{labelText}</text>
             </>
           );
        })()}
      </svg>
    </>
  );
};

export default HistoryChart;

