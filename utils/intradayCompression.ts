import { IntradayPoint } from '../types';

export function compressConsecutiveSameValues(pts: IntradayPoint[]) {
  if (!Array.isArray(pts) || pts.length === 0) return [] as IntradayPoint[];
  const arr = [...pts].sort((a, b) => a.timestamp - b.timestamp);
  const out: IntradayPoint[] = [];
  for (const p of arr) {
    const last = out[out.length - 1];
    if (last && Object.is(last.value, p.value)) continue; // keep earliest
    out.push(p);
  }
  return out;
}
