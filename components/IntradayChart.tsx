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
    // For intraday trend chart we plot equityReturn (%) on the y-axis
    const pctValues = pts.map(p => Number.isFinite(p.equityReturn) ? p.equityReturn : 0);
    let min = Math.min(...pctValues);
    let max = Math.max(...pctValues);
    // Ensure the axis always includes 0 (required by spec)
    if (min > 0) min = 0;
    if (max < 0) max = 0;
    // if min and max are equal (flat line), expand a little to avoid zero range
    if (min === max) {
      min = min - 1;
      max = max + 1;
    }
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

  // svg points should use equityReturn (percent) as y coordinate
  const svgPts = data.pts.map((p, i) => {
    const yVal = Number.isFinite(p.equityReturn) ? p.equityReturn : 0;
    return { x: getX(i), y: getY(yVal), data: p };
  });
  const pathD = `M ${svgPts.map(p => `${p.x} ${p.y}`).join(' L ')}`;
  const areaD = svgPts.length > 0 ? pathD + ` L ${svgPts[svgPts.length - 1].x} ${paddingTop + innerH} L ${svgPts[0].x} ${paddingTop + innerH} Z` : '';

  const yLabelsCount = 4;
  // Build y labels evenly spaced between data.min and data.max
  const yLabels = (() => {
    const labels: { value: number; text: string; y: number }[] = [];
    const span = data.max - data.min;
    if (span <= 0) {
      // fallback: repeat same value
      for (let i = 0; i < yLabelsCount; i++) {
        const val = data.min;
        labels.push({ value: val, text: `${val.toFixed(2)}%`, y: getY(val) });
      }
      return labels;
    }
    for (let i = 0; i < yLabelsCount; i++) {
      const val = data.min + (i * span / (yLabelsCount - 1));
      labels.push({ value: val, text: '', y: getY(val) });
    }
    for (const l of labels) {
      if (Object.is(l.value, 0)) l.text = `0.00%`;
      else l.text = `${l.value > 0 ? '+' : ''}${l.value.toFixed(2)}%`;
    }
    return labels;
  })();

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
        {/* y axis labels (evenly spaced) */}
        {yLabels.map((label, i) => {
          const isZeroLabel = Object.is(label.value, 0);
          // line color: default light grid; if label is exactly 0, use darker grey dashed per request
          const lineColor = isZeroLabel ? '#9ca3af' : '#e2e8f0';
          // text color: zero -> gray, positive -> stroke(red), negative -> green
          const textColor = isZeroLabel ? '#6b7280' : (label.value > 0 ? (stroke || '#ef4444') : '#16a34a');
          const dash = '4 4';
          return (
            <g key={`yl-${i}`}>
              <line x1={paddingLeft} y1={label.y} x2={width - paddingRight} y2={label.y} stroke={lineColor} strokeWidth={1} strokeDasharray={dash} />
              <text x={paddingLeft - 10} y={label.y} textAnchor="end" alignmentBaseline="middle" className="text-[12px] font-mono" fill={textColor}>{label.text}</text>
            </g>
          );
        })}
        {/* if 0 is inside the range, draw a special dashed grey 0-line and label (keeps labels evenly spaced) */}
        {data.min <= 0 && data.max >= 0 && (() => {
          const y0 = getY(0);
          // don't duplicate if one of the evenly spaced labels is exactly 0 (it will already be visible)
          const exactZeroExists = yLabels.some(l => Object.is(l.value, 0));
          if (exactZeroExists) return null;
          return (
            <g key="zero-line">
              <line x1={paddingLeft} y1={y0} x2={width - paddingRight} y2={y0} stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 4" />
              <text x={paddingLeft - 10} y={y0} textAnchor="end" alignmentBaseline="middle" className="text-[12px] font-mono" fill="#6b7280">0.00%</text>
            </g>
          );
        })()}
        {/* unit indicator for y-axis at top */}
        <text x={paddingLeft - 10} y={paddingTop - 8} textAnchor="end" alignmentBaseline="middle" className="text-[11px] fill-gray-400 font-mono">%</text>
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
                  {/* Tooltip: multi-line box with time (small) and value line (percent + raw NAV) */}
                  {(() => {
                    const pct = Number.isFinite(pt.data.equityReturn) ? pt.data.equityReturn : 0;
                    const pctText = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
                    const valueText = typeof pt.data.value === 'number' ? pt.data.value.toFixed(4) : '—';
                    // color: positive -> red, negative -> green, zero -> gray
                    const posColor = stroke || '#ef4444';
                    const negColor = '#16a34a'; // green-600 approximate
                    const zeroColor = '#6b7280'; // gray-500
                    const valueColor = pct > 0 ? posColor : (pct < 0 ? negColor : zeroColor);
                    // estimate tooltip width and clamp to avoid clipping
                    const EST_CHAR_WIDTH = 7;
                    const estWidth = Math.min(220, Math.max(80, Math.ceil((labelText.length + Math.max(pctText.length, valueText.length)) * EST_CHAR_WIDTH / 2) + 16));
                    const tooltipW = estWidth;
                    const tooltipH = 36;
                    const tipX = Math.max(8 + tooltipW / 2, Math.min(width - 8 - tooltipW / 2, pt.x));
                    const rectX = tipX - tooltipW / 2;
                    // place tooltip above chartTop if space, else below
                    const aboveY = chartTop - tooltipH - 6;
                    const belowY = chartTop + 6;
                    const rectY = aboveY >= 4 ? aboveY : belowY;
                    const timeY = rectY + 12;
                    const valY = rectY + 26;
                    return (
                      <g>
                        <rect x={rectX} y={rectY} width={tooltipW} height={tooltipH} rx={6} ry={6} fill="#ffffff" stroke="#e5e7eb" strokeWidth={1} />
                        <text x={tipX} y={timeY} textAnchor="middle" className="text-[11px] fill-gray-500" fill="#6b7280">{labelText}</text>
                        <text x={tipX} y={valY} textAnchor="middle" fontWeight={600} className="text-[12px]" fill={valueColor}>{pctText} {valueText}</text>
                      </g>
                    );
                  })()}
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

