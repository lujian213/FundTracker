/**
 * 日期格式化工具函数
 */

/**
 * 格式化日期为 yyyy/MM/dd（显示用）
 * @param date Date 对象、yyyy-MM-dd 格式的字符串或 null
 */
export function formatDateDisplay(date: Date | string | null): string {
  if (!date) return '';

  let d: Date;
  if (typeof date === 'string') {
    // 处理 yyyy-MM-dd 格式
    d = new Date(date);
    // 如果无效，尝试直接替换分隔符
    if (isNaN(d.getTime())) {
      return date.replace(/-/g, '/');
    }
  } else {
    d = date;
  }

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

/**
 * 格式化日期为 yyyy-MM-dd（ISO格式）
 * @param date Date 对象
 */
export function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 格式化时间为 HH:mm
 * @param date Date 对象
 */
export function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

/**
 * 格式化时间为 HH:mm:ss
 * @param date Date 对象
 */
export function formatTimeISO(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const sec = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${min}:${sec}`;
}

/**
 * 格式化HHMM数值为 HH:mm:ss
 * @param hhmm HHMM格式数值，如 930、1130、1500
 */
export function formatHHMM(hhmm: number): string {
  const h = String(Math.floor(hhmm / 100)).padStart(2, '0');
  const min = String(hhmm % 100).padStart(2, '0');
  return `${h}:${min}:00`;
}

/**
 * 格式化日期时间为 yyyy/MM/dd HH:mm
 * @param date Date 对象
 */
export function formatDateTimeDisplay(date: Date): string {
  return `${formatDateDisplay(date)} ${formatTime(date)}`;
}

/**
 * 格式化日期为 MM-DD（简洁格式，用于日历格子显示）
 * @param date Date 对象或 yyyy-MM-dd 格式的字符串
 */
export function formatDateShort(date: Date | string): string {
  let d: Date;
  if (typeof date === 'string') {
    d = new Date(date);
  } else {
    d = date;
  }
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${m}-${day}`;
}

export default { formatDateDisplay, formatDateISO, formatTime, formatDateTimeDisplay, formatDateShort };