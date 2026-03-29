// services/jobLogService.ts

export interface JobLogEntry {
  id: string;
  taskName: string;
  startTime: Date;
  endTime?: Date;
  status?: 'running' | 'success' | 'failure';
  message?: string;
}

/**
 * 任务日志服务 - 管理后台任务的执行日志
 */

// 存储日志的内存
let logs: JobLogEntry[] = [];

// 日志变化回调
let listeners: Array<(logs: JobLogEntry[]) => void> = [];

/**
 * 通知所有监听器
 */
function notifyListeners(): void {
  listeners.forEach(listener => listener(getLogs()));
}

/**
 * 生成唯一ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 记录任务开始
 */
export function logTaskStart(taskName: string, message?: string): string {
  // 先清除当天之前的日志
  cleanOldLogs();

  const id = generateId();
  const entry: JobLogEntry = {
    id,
    taskName,
    startTime: new Date(),
    status: 'running',
    message
  };

  logs.push(entry);
  notifyListeners();

  return id;
}

/**
 * 记录任务完成
 */
export function logTaskEnd(id: string, status: 'success' | 'failure', message?: string): void {
  const entry = logs.find(log => log.id === id);
  if (entry) {
    entry.endTime = new Date();
    entry.status = status;
    entry.message = message;
    notifyListeners();
  }
}

/**
 * 获取所有日志（按时间正序，最新的在最后）
 */
export function getLogs(): JobLogEntry[] {
  return [...logs].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

/**
 * 清空所有日志
 */
export function clearLogs(): void {
  logs = [];
  notifyListeners();
}

/**
 * 清除当天之前的日志
 */
function cleanOldLogs(): void {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  logs = logs.filter(log => {
    const logDate = new Date(log.startTime);
    logDate.setHours(0, 0, 0, 0);
    return logDate.getTime() >= today.getTime();
  });
}

/**
 * 订阅日志变化
 */
export function subscribeLogs(callback: (logs: JobLogEntry[]) => void): () => void {
  listeners.push(callback);
  // 立即调用一次，返回当前日志
  callback(getLogs());

  // 返回取消订阅函数
  return () => {
    listeners = listeners.filter(listener => listener !== callback);
  };
}

/**
 * 格式化日期时间
 */
export function formatDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}