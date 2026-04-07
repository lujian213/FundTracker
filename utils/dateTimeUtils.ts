/**
 * 通用日期时间工具函数
 */

/**
 * 计算距离下一个指定时间的秒数
 * @param timeStr HH:mm 格式的时间字符串
 */
export function secondsUntilNext(timeStr: string): number {
  const [hh, mm] = timeStr.split(':').map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(hh, mm, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return Math.round((target.getTime() - now.getTime()) / 1000);
}

/**
 * 格式化倒计时显示
 * @param seconds 秒数
 */
export function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * 将时间戳向下取整到分钟
 * @param ts 毫秒时间戳
 */
export function floorToMinute(ts: number): number {
  return Math.floor(ts / 60000) * 60000;
}

/**
 * 检查时间戳是否与当前本地日期相同
 * @param ts 毫秒时间戳
 */
export function isSameLocalDay(ts: number): boolean {
  const d = new Date(ts);
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

/**
 * 获取今天的开始和结束时间戳
 */
export function getTodayStartEnd(): { start: number; end: number } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = start + 24 * 60 * 60 * 1000;
  return { start, end };
}

/**
 * 过滤出当天的日内数据点
 */
export function filterTodayIntraday<T extends { timestamp: number }>(points: T[]): T[] {
  const { start, end } = getTodayStartEnd();
  return points.filter(pt => {
    const ts = Number(pt.timestamp) || 0;
    return ts >= start && ts < end;
  });
}

/**
 * 按分钟去重：同一分钟内只保留最新的数据点
 */
export function dedupeByMinute<T extends { timestamp: number }>(points: T[]): T[] {
  return points.reduce((acc: T[], cur) => {
    const last = acc[acc.length - 1];
    if (last && floorToMinute(last.timestamp) === floorToMinute(cur.timestamp)) {
      acc[acc.length - 1] = cur;
    } else {
      acc.push(cur);
    }
    return acc;
  }, []);
}