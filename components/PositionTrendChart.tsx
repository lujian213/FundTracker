import React, { useMemo, useState } from 'react';
import HistoryChart from './HistoryChart';
import { PositionTrendSeries, PositionTrendPoint } from '../utils/positionTrend';
import { HistoricalPoint } from '../types';
import { formatDateDisplay, formatDateISO } from '../utils/dateFormat';
import { formatMoneyWithSeparators } from '../utils/format';

interface PositionTrendProps {
  data: PositionTrendSeries | null;
  loading?: boolean;
  height?: number;
  locale?: string;
  maxPoints?: number;
}

// Extended HistoricalPoint with netInvestment field for position trend display
interface PositionTrendHistoricalPoint extends HistoricalPoint {
  netInvestment?: number;
}

const formatCurrency = (v: number) => {
  try {
    return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).format(v);
  } catch {
    return v.toFixed(2);
  }
};

// Helper: compress adjacent equal values — keep the first date of each run
// Compare both value and netInvestment to preserve points where either differs
function compressAdjacentEquals(series: PositionTrendSeries): PositionTrendSeries {
  if (!series || series.length === 0) return [];
  const out: PositionTrendSeries = [];
  let prev: PositionTrendPoint | null = null;
  for (const p of series) {
    const prevNet = prev?.netInvestment || 0;
    const currNet = p.netInvestment || 0;
    // Skip only if BOTH value and netInvestment are equal to previous
    if (prev && Math.abs(p.value - prev.value) < 1e-9 && Math.abs(currNet - prevNet) < 1e-9) {
      continue;
    }
    out.push(p);
    prev = p;
  }
  return out;
}

/**
 * Calculate nice axis tick intervals aligned to powers of 10
 * Returns aligned min/max values and step size for Y-axis labels
 */
function calculateAlignedAxisScale(
  values: number[],
  netValues: number[],
  minStep: number = 1000
): { alignedMin: number; alignedMax: number; step: number } {
  // Use reduce to avoid stack overflow from spread on large arrays
  const max = values.reduce((a, b) => Math.max(a, b), -Infinity);
  const min = values.reduce((a, b) => Math.min(a, b), Infinity);
  const netMax = netValues.reduce((a, b) => Math.max(a, b), -Infinity);
  const netMin = netValues.reduce((a, b) => Math.min(a, b), Infinity);
  const overallMax = Math.max(max, netMax);
  const overallMin = Math.min(min, netMin);

  // Handle edge case where all values are the same
  const span = overallMax - overallMin;
  if (span < 1e-9) {
    // All values are identical, create symmetric axis around the value
    const center = overallMax;
    const step = minStep;
    return {
      alignedMin: Math.floor((center - step * 2) / step) * step,
      alignedMax: Math.ceil((center + step * 2) / step) * step,
      step
    };
  }

  const rawStep = span / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalizedStep = rawStep / magnitude;

  // Choose nice tick intervals: 1, 2, 5, or 10 times magnitude
  let step: number;
  if (normalizedStep <= 1) step = magnitude;
  else if (normalizedStep <= 2) step = 2 * magnitude;
  else if (normalizedStep <= 5) step = 5 * magnitude;
  else step = 10 * magnitude;

  // Ensure minimum step size
  step = Math.max(step, minStep);

  // Align min and max to step intervals
  // Important: ensure alignedMax >= overallMax and alignedMin <= overallMin
  const alignedMin = Math.floor(overallMin / step) * step;
  // Use Math.ceil but verify it's >= overallMax; if exactly divisible, add one step
  let alignedMax = Math.ceil(overallMax / step) * step;
  // Safety check: ensure alignedMax covers all data points
  if (alignedMax < overallMax) {
    alignedMax += step;
  }

  return { alignedMin, alignedMax, step };
}

/**
 * Parse date string (YYYY-MM-DD) to Date object
 */
function parseDate(dateStr: string): Date {
  const parts = dateStr.split('-').map(s => Number(s));
  return parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(dateStr);
}

export default function PositionTrendChart({ data, loading, height = 320 }: PositionTrendProps) {
  // hoveredPoint must match HistoryChart's HistoricalPoint shape
  const [hoveredPoint, setHoveredPoint] = useState<HistoricalPoint | null>(null);

  const series = data || [];

  // Compress adjacent equal totals per feature request
  const compressed = useMemo(() => {
    return compressAdjacentEquals(series);
  }, [series]);

  // Extract values for Y-axis calculations (computed once, shared across useMemos)
  const chartValues = useMemo(() => {
    if (!compressed || compressed.length === 0) return null;
    const vals = compressed.map(d => d.value);
    const netVals = compressed.map(d => d.netInvestment || 0);
    return { vals, netVals };
  }, [compressed]);

  // Memoize hovered point with netInvestment lookup
  const hoveredPointWithNetInvestment: PositionTrendHistoricalPoint | null = useMemo(() => {
    if (!hoveredPoint || !compressed) return null;
    const hoveredDateStr = formatDateISO(new Date(hoveredPoint.date));
    const compressedPoint = compressed.find(p => p.date === hoveredDateStr);
    return {
      ...hoveredPoint,
      netInvestment: compressedPoint?.netInvestment || 0
    };
  }, [hoveredPoint, compressed]);

  // Map series to points with actual x positions computed from index and chart width 1000 with padding
  const points = useMemo(() => {
    if (!compressed || compressed.length === 0) return [] as any[];
    const vbW = 1000;
    // Must match HistoryChart's internal padding constants
    const padLeft = 110;
    const padRight = 30;
    const chartW = vbW - padLeft - padRight;
    const total = compressed.length;
    return compressed.map((p, i) => {
      const x = Math.round(padLeft + (i / Math.max(1, total - 1)) * chartW);
      // convert PositionTrendPoint (date:string) to HistoricalPoint (date:number)
      const dt = parseDate(p.date);
      const histPoint: HistoricalPoint = { date: dt.getTime(), value: p.value, equityReturn: 0 };
      return { x, y: 0, data: histPoint };
    });
  }, [compressed]);

  // viewBox height: chart area (280) + extra space for x-axis labels (20)
  const vbH = 300;

  const yLabels = useMemo(() => {
    if (!chartValues) return [] as any[];
    const { alignedMin, alignedMax, step } = calculateAlignedAxisScale(chartValues.vals, chartValues.netVals);

    // Y-axis labels: positioned within chart area (Y=20 to Y=280), not extended viewBox
    const chartH = 260; // fixed chart height for Y-axis (280 - 20 padding)
    const numTicks = Math.round((alignedMax - alignedMin) / step) + 1;

    return Array.from({ length: Math.min(numTicks, 10) }, (_, i) => {
      const val = alignedMin + step * i;
      const y = Math.round(20 + chartH - (i / (numTicks - 1)) * chartH);
      // round to integer with thousands separator
      return { text: formatMoneyWithSeparators(Math.round(val), 0), y };
    });
  }, [chartValues]);

  const xLabels = useMemo(() => {
    if (!compressed || compressed.length === 0) return [] as any[];
    const total = compressed.length;
    const step = Math.max(1, Math.floor(total / 6));
    // Must match HistoryChart's internal padding constants
    const padLeft = 110;
    const padRight = 30;
    const vbW = 1000;
    const chartW = vbW - padLeft - padRight;
    const ticks = compressed.filter((_, i) => i % step === 0).map((d) => {
      const i = compressed.indexOf(d);
      const x = Math.round(padLeft + (i / Math.max(1, total - 1)) * chartW);
      return { text: formatDateDisplay(d.date), x };
    });
    return ticks;
  }, [compressed]);

  // build path and area using linear scaling based on values
  const { path, area, pointsWithY, path2, points2WithY } = useMemo(() => {
    if (!compressed || compressed.length === 0 || !chartValues) return { path: '', area: '', pointsWithY: [] as any[], path2: '', points2WithY: [] as any[] };
    const vbW = 1000;
    // Must match HistoryChart's internal padding constants
    const padLeft = 110;
    const padRight = 30;
    const padTop = 20;
    const padBottom = 0;
    const chartW = vbW - padLeft - padRight;
    // Chart height fixed at 260 (280 chart area - 20 top padding)
    // This ensures lines are positioned correctly relative to Y-axis labels
    const chartH = 260;

    const { alignedMin, alignedMax, step } = calculateAlignedAxisScale(chartValues.vals, chartValues.netVals);
    const span = Math.max(1e-6, alignedMax - alignedMin);

    // First line: total position value
    const pts = compressed.map((p, i) => {
      const x = Math.round(padLeft + (i / Math.max(1, compressed.length - 1)) * chartW);
      const y = Math.round(padTop + chartH - ((p.value - alignedMin) / span) * chartH);
      const dt = parseDate(p.date);
      const histPoint: HistoricalPoint = { date: dt.getTime(), value: p.value, equityReturn: 0 };
      return { x, y, data: histPoint };
    });

    const pathStr = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaStr = `M ${pts[0].x} ${vbH - padBottom} L ${pts.map(p => `${p.x} ${p.y}`).join(' ')} L ${pts[pts.length - 1].x} ${vbH - padBottom} Z`;

    // Second line: net investment (using same Y-axis scale)
    const pts2 = compressed.map((p, i) => {
      const x = Math.round(padLeft + (i / Math.max(1, compressed.length - 1)) * chartW);
      const y2 = Math.round(padTop + chartH - (((p.netInvestment || 0) - alignedMin) / span) * chartH);
      const dt = parseDate(p.date);
      const histPoint: HistoricalPoint = { date: dt.getTime(), value: p.netInvestment || 0, equityReturn: 0 };
      return { x, y: y2, data: histPoint };
    });

    const path2Str = pts2.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    return { path: pathStr, area: areaStr, pointsWithY: pts, path2: path2Str, points2WithY: pts2 };
  }, [compressed, chartValues]);

  // bottomInfoPoint should be a HistoricalPoint for consistent display
  const bottomInfoPoint: PositionTrendHistoricalPoint | null = hoveredPointWithNetInvestment ? hoveredPointWithNetInvestment : (compressed && compressed.length > 0 ? (() => {
    const last = compressed[compressed.length - 1];
    const dt = parseDate(last.date);
    return { date: dt.getTime(), value: last.value, equityReturn: 0, netInvestment: last.netInvestment };
  })() : null);

  return (
    <div>
      {/* 图例 */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '8px 12px', fontSize: '0.875rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginRight: '24px' }}>
          <div style={{ width: '24px', height: '3px', backgroundColor: '#ef4444', marginRight: '8px' }}></div>
          <span>持仓总金额</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: '24px', height: '3px', backgroundColor: '#10b981', marginRight: '8px' }}></div>
          <span>净投入总额</span>
        </div>
      </div>

      {/* 图表区域 - 包含图表(Y=20到Y=280)和x轴标签区域(Y=280到Y=300) */}
      <div style={{ height: vbH, position: 'relative' }}>
        <HistoryChart
          viewBox={`0 0 1000 ${vbH}`}
          height={vbH}
          path={path}
          area={area}
          points={pointsWithY}
          yLabels={yLabels}
          xLabels={xLabels}
          hoveredPoint={hoveredPoint}
          setHoveredPoint={(p: any) => setHoveredPoint(p as HistoricalPoint)}
          visibleMAs={{}}
        />
        {/* 第二条折线：净投入总额 */}
        {path2 && (
          <svg
            viewBox={`0 0 1000 ${vbH}`}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: vbH, pointerEvents: 'none' }}
          >
            <path
              d={path2}
              stroke="#10b981"
              strokeWidth="2"
              fill="none"
            />
          </svg>
        )}
      </div>
      {/* 数据显示区域 */}
      <div aria-live="polite" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', borderTop: '1px solid #eee', minHeight: 50, alignItems: 'center', fontSize: '0.875rem' }}>
        <div style={{ width: 120, whiteSpace: 'nowrap' }}>
          <span style={{ color: '#666' }}>日期：</span>
          {bottomInfoPoint ? formatDateDisplay(new Date(bottomInfoPoint.date)) : '—'}
        </div>
        <div style={{ width: 150, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color: '#ef4444' }}>持仓：</span>
          {bottomInfoPoint ? formatCurrency(bottomInfoPoint.value) : '—'}
        </div>
        <div style={{ width: 150, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color: '#10b981' }}>净投：</span>
          {bottomInfoPoint ? formatCurrency(bottomInfoPoint.netInvestment || 0) : '—'}
        </div>
        <div style={{ width: 150, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {bottomInfoPoint ? (() => {
            const profit = bottomInfoPoint.value - (bottomInfoPoint.netInvestment || 0);
            const isPositive = profit >= 0;
            const color = isPositive ? '#ef4444' : '#10b981';
            const label = isPositive ? '盈利：' : '亏损：';
            return (
              <>
                <span style={{ color }}>{label}</span>
                <span style={{ color }}>{formatCurrency(profit)}</span>
              </>
            );
          })() : (
            <>
              <span style={{ color: '#666' }}>盈利：</span>
              <span>—</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
