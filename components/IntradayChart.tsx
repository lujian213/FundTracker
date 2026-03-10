import React, { useMemo, useState, useEffect } from 'react';
import { IntradayPoint } from '../types';

interface IntradayChartProps {
  points: IntradayPoint[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  onHover?: (p: IntradayPoint | null) => void;
}

const formatTime = (ts: number) => {
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return new Date(ts).toLocaleString(); }
};

const IntradayChart: React.FC<IntradayChartProps> = ({ points, width = 1000, height = 250, stroke = '#ef4444', fill, onHover }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const data = useMemo(() => {
    if (!points || points.length === 0) return { pts: [], min: 0, max: 0 };
    // normalize and sort ascending by timestamp
    const pts = [...points].map(p => ({ timestamp: Number(p.timestamp), value: Number(p.value), equityReturn: Number(p.equityReturn) })).sort((a, b) => a.timestamp - b.timestamp);
    // compress consecutive identical values keeping earliest timestamp to avoid long flat horizontal lines
    const compressed: IntradayPoint[] = [];
    for (const p of pts) {
      const last = compressed[compressed.length - 1];
      if (last && Object.is(last.value, p.value)) {
        // skip this point to keep earliest of the run
        continue;
      }
      compressed.push(p);
    }
    const values = pts.map(p => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return { pts: compressed, min, max };
  }, [points]);

  // When data is empty, render placeholder; we'll notify parent via effect (not during render)
  const hasData = !!(data.pts && data.pts.length > 0);

  // if no data, notify parent (via effect) and return placeholder early before computing svg points
  useEffect(() => {
    if (!onHover) return;
    if (!hasData) onHover(null);
  }, [onHover, hasData]);

  if (!hasData) {
    return <div className="h-40 flex items-center justify-center text-xs text-gray-400">暂无日内数据</div>;
  }

  const paddingLeft = 60; // align with history chart left padding
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 30;

  const innerW = width - paddingLeft - paddingRight;
  const innerH = height - paddingTop - paddingBottom;

  const denom = Math.max(1, data.pts.length - 1);
  const getX = (i: number) => paddingLeft + (i * innerW / denom);
  const getY = (v: number) => {
    const range = (data.max - data.min) || 1;
    return paddingTop + (1 - (v - data.min) / range) * innerH;
  };

  const svgPts = data.pts.map((p, i) => ({ x: getX(i), y: getY(p.value), data: p }));
  const pathD = `M ${svgPts.map(p => `${p.x} ${p.y}`).join(' L ')}`;
  const areaD = svgPts.length > 0 ? pathD + ` L ${svgPts[svgPts.length - 1].x} ${paddingTop + innerH} L ${svgPts[0].x} ${paddingTop + innerH} Z` : '';

  const yLabelsCount = 4;
  const yLabels = Array.from({ length: yLabelsCount }).map((_, i) => {
    const val = data.min + (i * (data.max - data.min) / (yLabelsCount - 1));
    return { text: val.toFixed(4), y: getY(val) };
  });

  const xLabelIndices = [0, Math.floor(data.pts.length / 2), data.pts.length - 1];
  const xLabels = xLabelIndices.map(idx => {
    const ts = data.pts[idx]?.timestamp || Date.now();
    const d = new Date(ts);
    return { text: `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`, x: getX(idx) };
  });

  useEffect(() => {
    if (!onHover) return;
    if (hoverIdx === null) onHover(null);
    else onHover(data.pts[hoverIdx]);
  }, [onHover, hoverIdx, data.pts]);

  // update hover index (event handler only) — do not call onHover directly here
  const handleHoverIdx = (i: number | null) => {
    setHoverIdx(i);
  };

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" onMouseLeave={() => handleHoverIdx(null)}>
        <defs>
          <linearGradient id="intraday-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.2" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={width} height={height} fill="transparent" />
        {/* y axis labels */}
        {yLabels.map((label, i) => (
          <g key={`yl-${i}`}>
            <line x1={paddingLeft} y1={label.y} x2={width - paddingRight} y2={label.y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 4" />
            <text x={paddingLeft - 10} y={label.y} textAnchor="end" alignmentBaseline="middle" className="text-[12px] fill-gray-400 font-mono">{label.text}</text>
          </g>
        ))}
        <path d={areaD} fill={fill || 'url(#intraday-grad)'} />
        <path d={pathD} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {svgPts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={i === svgPts.length - 1 ? 5 : 3} fill={i === svgPts.length - 1 ? stroke : '#fff'} stroke={stroke} strokeWidth={1} />
            <rect x={p.x - 8} y={0} width={16} height={height} fill="transparent" onMouseEnter={() => handleHoverIdx(i)} />
          </g>
        ))}
        {/* x axis labels */}
        {xLabels.map((lbl, i) => (
          <text key={`xl-${i}`} x={lbl.x} y={paddingTop + innerH + 20} textAnchor="middle" className="text-[12px] fill-gray-400 font-medium">{lbl.text}</text>
        ))}
        {/* vertical hover line */}
        {hoverIdx !== null && svgPts[hoverIdx] && (
          <g className="pointer-events-none">
            {(() => {
              const pt = svgPts[hoverIdx];
              const chartTop = paddingTop;
              const chartBottom = paddingTop + innerH;
              // compute label time and clamp x to avoid clipping at edges
              const labelText = formatTime(pt.data.timestamp);
              const EST_CHAR_WIDTH = 8; // conservative per-char width
              const halfWidth = Math.ceil((labelText.length * EST_CHAR_WIDTH) / 2) + 6;
              const labelX = Math.max(halfWidth, Math.min(width - halfWidth, pt.x));
              const labelY = Math.max(18, chartTop - 4);
              return (
                <>
                  <line x1={pt.x} y1={chartTop} x2={pt.x} y2={chartBottom} stroke={stroke} strokeWidth={1} strokeDasharray="4 2" />
                  <text x={labelX} y={labelY} textAnchor="middle" className="text-[12px] font-medium fill-gray-600">{labelText}</text>
                </>
              );
            })()}
          </g>
        )}
      </svg>
    </div>
  );
};

export default IntradayChart;

