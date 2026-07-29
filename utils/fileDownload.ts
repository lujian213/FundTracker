/**
 * utils/fileDownload.ts
 *
 * 文件下载工具函数
 */

/**
 * 格式化本地时间戳
 *
 * @param d 日期对象
 * @returns 格式化的时间戳字符串 "YYYY-MM-DD_HH-mm-ss"
 */
export function localTimestamp(d: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return [
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  ].join('_');
}

/**
 * 下载 JSON 数据为文件
 *
 * @param data JSON 数据对象
 * @param filenamePrefix 文件名前缀（不含时间戳和扩展名）
 */
export function downloadJsonFile(data: unknown, filenamePrefix: string): void {
  const now = new Date();
  const filename = `${filenamePrefix}_${localTimestamp(now)}.json`;

  // 创建 Blob 并下载
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();

  // 延迟释放 URL，确保下载开始
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}