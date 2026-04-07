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

/**
 * 计算最后N个数据点的SMA值（优化版）
 * 只截取必要的数据量进行计算，避免过计算
 *
 * @param values 原始数据数组
 * @param lastCount 需要的SMA值数量
 * @param maWindows MA窗口列表，默认 [5, 10, 20]
 * @returns 每个窗口的MA值数组（长度最多为lastCount）
 */
export function computeSMAsForLast(
  values: number[],
  lastCount: number,
  maWindows: number[] = [5, 10, 20]
): Record<number, (number | null)[]> {
  if (!values || values.length === 0 || lastCount <= 0) {
    return Object.fromEntries(maWindows.map(w => [w, []]));
  }

  const maxWindow = Math.max(...maWindows);
  const totalNeeded = lastCount + maxWindow;

  // 截取必要的数据量
  const calcValues = values.length > totalNeeded
    ? values.slice(-totalNeeded)
    : values;

  // 计算SMA
  const fullMaValues = computeMultipleSMAs(calcValues, maWindows);

  // 截取到需要的长度
  const result: Record<number, (number | null)[]> = {};
  for (const w of maWindows) {
    const smaArray = fullMaValues[w] || [];
    result[w] = smaArray.length > lastCount
      ? smaArray.slice(-lastCount)
      : smaArray;
  }

  return result;
}

export const MA_COLORS: Record<number, string> = {
  5: '#eab308', // yellow
  10: '#2563eb', // blue
  20: '#ec4899' // pink
};
