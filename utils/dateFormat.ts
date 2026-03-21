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
 * 格式化日期时间为 yyyy/MM/dd HH:mm
 * @param date Date 对象
 */
export function formatDateTimeDisplay(date: Date): string {
  return `${formatDateDisplay(date)} ${formatTime(date)}`;
}

export default { formatDateDisplay, formatDateISO, formatTime, formatDateTimeDisplay };