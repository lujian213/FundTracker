import React, { useMemo, useState, useEffect } from 'react';
import { IntradayPoint } from '../types';
import { formatTime } from '../utils/dateFormat';

interface IntradayChartProps {
  points: IntradayPoint[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  onHover?: (p: IntradayPoint | null) => void;
  valueDecimalPlaces?: number;  // tooltip中value显示的小数位数，默认4
  showKeyTimes?: boolean;  // 是否显示A股变盘点时间线（仅国内指数使用）
}

const IntradayChart: React.FC<IntradayChartProps> = ({ points, width = 1000, height = 250, stroke = '#ef4444', fill, onHover, valueDecimalPlaces = 4, showKeyTimes = false }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const data = useMemo(() => {
    if (!points || points.length === 0) return { pts: [], min: 0, max: 0 };

    // Sort by timestamp
    const pts = points.map(p => ({
      timestamp: Number(p.timestamp),
      value: Number(p.value),
      equityReturn: Number(p.equityReturn),
    })).sort((a, b) => a.timestamp - b.timestamp);

    // Compress consecutive identical values keeping earliest timestamp to avoid long flat horizontal lines
    const compressed: { timestamp: number; value: number; equityReturn: number }[] = [];
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

  const paddingLeft = 60;
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
  // Build y labels evenly spaced between data.min and data.max, but ensure one tick is exactly 0 when 0 is within the data range
  // Also prefer step and tick values rounded to 1 decimal place (0.1) where possible to avoid ugly fractions like 0.73
  const yLabels = (() => {
    const labels: { value: number; text: string; y: number }[] = [];
    const span = data.max - data.min;
    if (span <= 0) {
      // fallback: repeat same value
      for (let i = 0; i < yLabelsCount; i++) {
        const val = data.min;
        labels.push({ value: val, text: `${val.toFixed(1)}%`, y: getY(val) });
      }
      return labels;
    }

    const n = yLabelsCount;
    const originalStep = span / (n - 1);

    // Helper to round up to nearest 0.1
    const ceilToTenth = (v: number) => Math.ceil((v - 1e-12) * 10) / 10;

    if (data.min <= 0 && data.max >= 0) {
      // Data spans negative and positive: ensure one tick is exactly 0 and that there are ticks on both sides
      // Restrict k so that there is at least one tick below 0 and one above 0: k in [1, n-2]
      const minK = 1;
      const maxK = Math.max(1, n - 2);
      let bestK = minK;
      let bestStep = Number.POSITIVE_INFINITY;
      for (let k = minK; k <= maxK; k++) {
        // need1: ensure base <= data.min -> 0 - k*step <= data.min => step >= (0 - data.min)/k
        const need1 = (0 - data.min) / k;
        // need2: ensure last >= data.max -> 0 + (n-1-k)*step >= data.max => step >= data.max/(n-1-k)
        const denomRight = (n - 1 - k);
        const need2 = denomRight > 0 ? (data.max / denomRight) : Number.POSITIVE_INFINITY;
        const stepK = Math.max(need1, need2);
        if (Number.isFinite(stepK) && stepK < bestStep) {
          bestStep = stepK;
          bestK = k;
        }
      }
      // Round chosen step up to nearest 0.1 and ensure it's at least originalStep (also rounded)
      let step = Math.max(ceilToTenth(bestStep), ceilToTenth(originalStep));
      let base = 0 - bestK * step;
      // If rounding caused range to shrink and not cover data, increase step incrementally by 0.1 until it covers
      let guard = 0;
      while ((base > data.min || (base + (n - 1) * step) < data.max) && guard < 20) {
        step = Math.round((step + 0.1) * 10) / 10;
        base = 0 - bestK * step;
        guard++;
      }
      for (let i = 0; i < n; i++) {
        const val = base + i * step;
        labels.push({ value: val, text: '', y: getY(val) });
      }
    } else {
      // 0 not inside range: evenly spaced between min and max (original behavior), but prefer nice tenth steps
      // compute ideal step and round to nearest 0.1
      const rawStep = span / (n - 1);
      const step = ceilToTenth(rawStep);
      const base = data.min;
      for (let i = 0; i < n; i++) {
        const val = base + i * step;
        labels.push({ value: val, text: '', y: getY(val) });
      }
      // If rounding caused top to be below data.max, adjust by increasing step minimally
      if (labels[n - 1].value < data.max) {
        let s = step;
        let guard = 0;
        while (base + (n - 1) * s < data.max && guard < 20) {
          s = Math.round((s + 0.1) * 10) / 10;
          guard++;
        }
        labels.length = 0;
        for (let i = 0; i < n; i++) labels.push({ value: base + i * s, text: '', y: getY(base + i * s) });
      }
    }

    for (const l of labels) {
      // format labels to 1 decimal place to avoid showing ugly fractions
      if (Object.is(l.value, 0)) l.text = `0.0%`;
      else l.text = `${l.value > 0 ? '+' : ''}${l.value.toFixed(1)}%`;
    }
    return labels;
  })();

  const xLabelIndices = [0, Math.floor(data.pts.length / 2), data.pts.length - 1];
  const xLabels = xLabelIndices.map(idx => {
    const ts = data.pts[idx]?.timestamp || Date.now();
    const d = new Date(ts);
    return { text: `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`, x: getX(idx) };
  });

  // A股变盘点时间（小时:分钟）
  const KEY_TIMES = [
    { hour: 10, minute: 0 },
    { hour: 10, minute: 30 },
    { hour: 11, minute: 0 },
    { hour: 13, minute: 30 },
    { hour: 14, minute: 0 },
    { hour: 14, minute: 30 },
  ];

  // 找到变盘点对应的数据点索引
  const keyTimePoints = (() => {
    const result: { idx: number; timeText: string }[] = [];
    for (const kt of KEY_TIMES) {
      // 找到最接近该时间的数据点
      let bestIdx = -1;
      let bestDiff = Number.POSITIVE_INFINITY;
      for (let i = 0; i < data.pts.length; i++) {
        const ts = data.pts[i].timestamp;
        const d = new Date(ts);
        const diff = Math.abs(d.getHours() * 60 + d.getMinutes() - (kt.hour * 60 + kt.minute));
        // 允许最多5分钟的误差
        if (diff <= 5 && diff < bestDiff) {
          bestDiff = diff;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        result.push({
          idx: bestIdx,
          timeText: `${kt.hour}:${String(kt.minute).padStart(2, '0')}`
        });
      }
    }
    return result;
  })();

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
          // text color: zero -> gray, positive -> red (fixed), negative -> green (fixed)
          const textColor = isZeroLabel ? '#6b7280' : (label.value > 0 ? '#ef4444' : '#16a34a');
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
        {/* A股变盘点垂直红线（仅国内指数显示） */}
        {showKeyTimes && keyTimePoints.map((kp, i) => {
          const x = getX(kp.idx);
          return (
            <g key={`keytime-${i}`}>
              {/* 垂直红色虚线 */}
              <line
                x1={x}
                y1={paddingTop}
                x2={x}
                y2={paddingTop + innerH}
                stroke="#ef4444"
                strokeWidth={1}
                strokeDasharray="4 2"
              />
              {/* x轴时间标注 */}
              <text
                x={x}
                y={paddingTop + innerH + 20}
                textAnchor="middle"
                className="text-[11px] fill-red-500 font-medium"
                fill="#ef4444"
              >
                {kp.timeText}
              </text>
            </g>
          );
        })}
        {/* vertical hover line */}
        {hoverIdx !== null && svgPts[hoverIdx] && (
          <g className="pointer-events-none">
            {(() => {
              const pt = svgPts[hoverIdx];
              const chartTop = paddingTop;
              const chartBottom = paddingTop + innerH;
              // compute label time and clamp x to avoid clipping at edges
              const labelText = formatTime(new Date(pt.data.timestamp));
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
                    const valueText = typeof pt.data.value === 'number' ? pt.data.value.toFixed(valueDecimalPlaces) : '—';
                    // color: positive -> red, negative -> green, zero -> gray
                    const posColor = stroke || '#ef4444';
                    const negColor = '#16a34a'; // green-600 approximate
                    const zeroColor = '#6b7280'; // gray-500
                    const valueColor = pct > 0 ? posColor : (pct < 0 ? negColor : zeroColor);
                    // estimate tooltip width and clamp to avoid clipping
                    // tooltip shows two lines: time (line1) and pctText + space + valueText (line2)
                    // use the longer line to determine width
                    const EST_CHAR_WIDTH = 8;
                    const line1Len = labelText.length;
                    const line2Len = pctText.length + 1 + valueText.length; // space between pct and value
                    const maxLineLen = Math.max(line1Len, line2Len);
                    const estWidth = Math.max(100, Math.ceil(maxLineLen * EST_CHAR_WIDTH) + 20);
                    const tooltipW = estWidth;
                    const tooltipH = 44;
                    const tipX = Math.max(8 + tooltipW / 2, Math.min(width - 8 - tooltipW / 2, pt.x));
                    const rectX = tipX - tooltipW / 2;
                    // place tooltip above chartTop if space, else below
                    const aboveY = chartTop - tooltipH - 6;
                    const belowY = chartTop + 6;
                    const rectY = aboveY >= 4 ? aboveY : belowY;
                    const timeY = rectY + 14;
                    const valY = rectY + 30;
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