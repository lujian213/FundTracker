export function computeSMA(values: number[], windowSize: number): (number | null)[] {
  const res: (number | null)[] = new Array(values.length).fill(null);
  if (windowSize <= 0) return res;
  for (let i = 0; i < values.length; i++) {
    if (i + 1 >= windowSize) {
      const start = i + 1 - windowSize;
      let sum = 0;
      for (let j = start; j <= i; j++) sum += values[j];
      res[i] = sum / windowSize;
    }
  }
  return res;
}

export function computeMultipleSMAs(values: number[], windows: number[]): Record<number, (number | null)[]> {
  const out: Record<number, (number | null)[]> = {};
  for (const w of windows) {
    out[w] = computeSMA(values, w);
  }
  return out;
}

export const MA_COLORS: Record<number, string> = {
  5: '#eab308', // yellow
  10: '#2563eb', // blue
  20: '#ec4899' // pink
};
