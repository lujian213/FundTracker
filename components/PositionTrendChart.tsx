import React, { useMemo, useState } from 'react';
import HistoryChart from './HistoryChart';
import { PositionTrendSeries, PositionTrendPoint } from '../utils/positionTrend';
import { HistoricalPoint } from '../types';

interface PositionTrendProps {
  data: PositionTrendSeries | null;
  loading?: boolean;
  height?: number;
  locale?: string;
  maxPoints?: number;
}

const formatCurrency = (v: number) => {
  try {
    return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).format(v);
  } catch {
    return v.toFixed(2);
  }
};

const formatDateLocal = (dateStr: string) => {
  // ensure YYYY-MM-DD
  return dateStr;
};

// Helper: compress adjacent equal values — keep the first date of each run
function compressAdjacentEquals(series: PositionTrendSeries): PositionTrendSeries {
  if (!series || series.length === 0) return [];
  const out: PositionTrendSeries = [];
  let prev: PositionTrendPoint | null = null;
  for (const p of series) {
    if (prev && Math.abs(p.value - prev.value) < 1e-9) {
      // same as previous -> skip (keep single point)
      continue;
    }
    out.push(p);
    prev = p;
  }
  return out;
}

export default function PositionTrendChart({ data, loading, height = 320 }: PositionTrendProps) {
  // hoveredPoint must match HistoryChart's HistoricalPoint shape
  const [hoveredPoint, setHoveredPoint] = useState<HistoricalPoint | null>(null);

  const series = data || [];

  // Compress adjacent equal totals per feature request
  const compressed = useMemo(() => {
    return compressAdjacentEquals(series);
  }, [series]);

  // Map series to points with actual x positions computed from index and chart width 1000 with padding left 80 right 30
  const points = useMemo(() => {
    if (!compressed || compressed.length === 0) return [] as any[];
    const vbW = 1000;
    const padLeft = 80;
    const padRight = 30;
    const chartW = vbW - padLeft - padRight;
    const total = compressed.length;
    return compressed.map((p, i) => {
      const x = Math.round(padLeft + (i / Math.max(1, total - 1)) * chartW);
      // convert PositionTrendPoint (date:string) to HistoricalPoint (date:number)
      const parts = p.date.split('-').map(s => Number(s));
      const dt = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(p.date);
      const histPoint: HistoricalPoint = { date: dt.getTime(), value: p.value, equityReturn: 0 };
      return { x, y: 0, data: histPoint };
    });
  }, [compressed]);

  const yLabels = useMemo(() => {
    if (!compressed || compressed.length === 0) return [] as any[];
    const vals = compressed.map(d => d.value);
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const span = Math.max(1, max - min);
    const step = span / 4;
    // compute y positions to match HistoryChart's internal coordinates (height 280 with PADDING_TOP=20, PADDING_BOTTOM=0)
    const vbH = 280;
    const chartH = vbH - 20 - 0; // 260
    return [0, 1, 2, 3, 4].map(i => {
      const val = min + step * i;
      const y = Math.round(20 + chartH - (i / 4) * chartH);
      // round to integer per requirement
      return { text: String(Math.round(val)), y };
    });
  }, [compressed]);

  const xLabels = useMemo(() => {
    if (!compressed || compressed.length === 0) return [] as any[];
    const total = compressed.length;
    const step = Math.max(1, Math.floor(total / 6));
    const padLeft = 80;
    const padRight = 30;
    const vbW = 1000;
    const chartW = vbW - padLeft - padRight;
    const ticks = compressed.filter((_, i) => i % step === 0).map((d) => {
      const i = compressed.indexOf(d);
      const x = Math.round(padLeft + (i / Math.max(1, total - 1)) * chartW);
      return { text: formatDateLocal(d.date), x };
    });
    return ticks;
  }, [compressed]);

  // build path and area using linear scaling based on values
  const { path, area, pointsWithY } = useMemo(() => {
    if (!compressed || compressed.length === 0) return { path: '', area: '', pointsWithY: [] as any[] };
    const vbW = 1000;
    const vbH = 280;
    const padLeft = 80;
    const padRight = 30;
    const padTop = 20;
    const padBottom = 0;
    const chartW = vbW - padLeft - padRight;
    const chartH = vbH - padTop - padBottom;

    const vals = compressed.map(d => d.value);
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const span = Math.max(1e-6, max - min);

    const pts = compressed.map((p, i) => {
      const x = Math.round(padLeft + (i / Math.max(1, compressed.length - 1)) * chartW);
      const y = Math.round(padTop + chartH - ((p.value - min) / span) * chartH);
      const parts = p.date.split('-').map(s => Number(s));
      const dt = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(p.date);
      const histPoint: HistoricalPoint = { date: dt.getTime(), value: p.value, equityReturn: 0 };
      return { x, y, data: histPoint };
    });

    const pathStr = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaStr = `M ${pts[0].x} ${vbH - padBottom} L ${pts.map(p => `${p.x} ${p.y}`).join(' ')} L ${pts[pts.length - 1].x} ${vbH - padBottom} Z`;
    return { path: pathStr, area: areaStr, pointsWithY: pts };
  }, [compressed]);

  // bottomInfoPoint should be a HistoricalPoint for consistent display
  const bottomInfoPoint: HistoricalPoint | null = hoveredPoint ? hoveredPoint : (compressed && compressed.length > 0 ? (() => {
    const last = compressed[compressed.length - 1];
    const parts = last.date.split('-').map(s => Number(s));
    const dt = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(last.date);
    return { date: dt.getTime(), value: last.value, equityReturn: 0 };
  })() : null);

  return (
    <div>
      <div style={{ height }}>
        <HistoryChart
          viewBox={`0 0 1000 280`}
          path={path}
          area={area}
          points={pointsWithY}
          yLabels={yLabels}
          xLabels={xLabels}
          hoveredPoint={hoveredPoint}
          setHoveredPoint={(p: any) => setHoveredPoint(p as HistoricalPoint)}
          visibleMAs={{}}
        />
      </div>
      <div aria-live="polite" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', borderTop: '1px solid #eee', minHeight: 40, alignItems: 'center', fontSize: '0.875rem' }}>
        <div style={{ width: 200 }}>{bottomInfoPoint ? (() => {
          const d = new Date(bottomInfoPoint.date);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        })() : '—'}</div>
        <div style={{ width: 140, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{bottomInfoPoint ? formatCurrency(bottomInfoPoint.value) : '—'}</div>
      </div>
    </div>
  );
}
