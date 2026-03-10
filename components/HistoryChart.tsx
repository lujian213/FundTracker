import React from 'react';
import { HistoricalPoint } from '../types';
import { MA_COLORS } from '../utils/movingAverage';

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
  markers
}) => {
  // find index of hovered point for MA lookup
  const hoveredIndex = hoveredPoint ? points.findIndex(p => p.data === hoveredPoint) : -1;

  // helper: format a timestamp into local YYYY-MM-DD
  const formatLocalDate = (ts: number | string) => {
    try {
      if (typeof ts === 'string') {
        // parse YYYY-MM-DD into local date
        const parts = ts.split('-').map(s => Number(s));
        if (parts.length === 3) {
          const d = new Date(parts[0], parts[1] - 1, parts[2]);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        }
        // fallback
        const d = new Date(ts);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
      const d = new Date(ts);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    } catch {
      return '';
    }
  };

  // chart paddings must match modal chartData paddingTop/paddingBottom and paddingLeft/paddingRight
  const PADDING_LEFT = 110; // increased to reserve space for up to ~12 chars (including thousand separators and symbols)
  const PADDING_RIGHT = 30;
  const PADDING_TOP = 20; // increase top padding so the top hover label stays inside viewBox
  const PADDING_BOTTOM = 0;

  return (
    <>
      <svg viewBox={viewBox} className={`w-full drop-shadow-sm`} style={{ height }} onMouseLeave={() => { setHoveredPoint(null); if (typeof (onMarkerHover) === 'function') onMarkerHover(null); }}>
        <defs>
          <linearGradient id="history-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.2" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
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

              {xLabels.map((label, i) => (
                <text key={`x-${i}`} x={label.x} y={chartY + chartH + 16} textAnchor="middle" className="text-[14px] fill-gray-400 font-medium">{label.text}</text>
              ))}
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

        {points.map((p, i) => (
          <rect key={i} x={p.x - 5} y={0} width="10" height={Math.max(1, height - 40)} fill="transparent" onMouseEnter={() => setHoveredPoint(p.data)} className="cursor-crosshair" />
        ))}

        {/* markers (e.g. trades) - render above overlays */}
        {(Array.isArray(markers) ? markers : []).map((m: any, idx: number) => (
          <g key={`marker-${idx}`} onMouseEnter={() => { const hp = points.find(pt => pt.data.date === m.date); setHoveredPoint(hp ? hp.data : null); if (onMarkerHover) onMarkerHover(m); }} onMouseLeave={() => { setHoveredPoint(null); if (onMarkerHover) onMarkerHover(null); }} className="pointer-events-auto">
            <circle data-testid={`marker-circle-${idx}`} cx={m.x} cy={m.y} r={5} fill={m.type === 'sell' ? '#2563eb' : '#ef4444'} stroke="#fff" strokeWidth={1} />
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
          const tooltipX = Math.max(40, Math.min(Number(viewBox.split(' ')[2]) - 120, m.x));
          const tooltipY = Math.max(18, m.y - 36);
          const lines = [(m.type === 'sell' ? '卖出' : '买入'), `${m.shares !== undefined ? m.shares : '—'} 份`, `${m.amount !== undefined ? m.amount.toFixed(2) + ' 元' : '—'}`];
          return (
            <g className="pointer-events-none">
              <rect x={tooltipX - 60} y={tooltipY - 20} rx={6} ry={6} width={120} height={48} fill="#111827" fillOpacity={0.9} />
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
          const chartBottom = vbH - PADDING_BOTTOM;
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

