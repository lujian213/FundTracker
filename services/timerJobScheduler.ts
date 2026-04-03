import CronExpressionParser from 'cron-parser';
import { TimerJobConfig, Ticker, JobResult } from '../types';
import { logTaskStart, logTaskEnd } from './jobLogService';

interface JobContext {
  portfolio: Ticker[];
}

// JobHandler 可以返回 JobResult，也可以返回 void（向后兼容，默认成功）
type JobHandler = (context: JobContext) => Promise<JobResult | void>;

type ErrorCallback = (jobId: string, jobName: string, error: Error) => void;

const DEFAULT_JOBS: TimerJobConfig[] = [
  { id: 'fund-valuation-refresh', name: '基金估值刷新', cron: '*/3 * * * *', enabled: true },
  { id: 'fund-history-refresh', name: '基金历史净值刷新', cron: '*/20 * * * *', enabled: true },
  { id: 'market-index-refresh', name: '市场指数刷新', cron: '*/2 * * * *', enabled: true },
  { id: 'index-history-refresh', name: '指数历史刷新', cron: '*/20 * * * *', enabled: true },
  { id: 'news-refresh', name: '市场热点刷新', cron: '*/3 * * * *', enabled: true },
  { id: 'holiday-info-refresh', name: '节假日信息刷新', cron: '0 */6 * * *', enabled: true },
  { id: 'delivery-info-refresh', name: '交割日信息刷新', cron: '0 */6 * * *', enabled: true },
  { id: 'strategy-recommendation-refresh', name: '推荐交易策略刷新', cron: '0 */6 * * *', enabled: true },
  { id: 'calendar_holiday_china', name: 'Calendar A股节假日信息刷新', cron: '0 0 * * *', enabled: true },
  { id: 'calendar_holiday_hk', name: 'Calendar 港股节假日信息刷新', cron: '0 0 * * *', enabled: true },
  { id: 'calendar_holiday_us', name: 'Calendar 美股节假日信息刷新', cron: '0 0 * * *', enabled: true },
  { id: 'calendar_holiday_sg', name: 'Calendar 新加坡股市节假日信息刷新', cron: '0 0 * * *', enabled: true },
];

interface TimerJobScheduler {
  start(): void;
  stop(): void;
  registerHandler(jobId: string, handler: JobHandler): void;
  setContext(context: JobContext): void;
  onError(callback: ErrorCallback): void;
  loadConfig(): Promise<void>;
  _setTimeSource?(now: () => Date): void;
  _triggerCheck?(): void;
  _triggerJob?(jobId: string): void;
  _reset?(): void;
}

class TimerJobSchedulerImpl implements TimerJobScheduler {
  private handlers: Map<string, JobHandler> = new Map();
  private context: JobContext = { portfolio: [] };
  private errorCallbacks: ErrorCallback[] = [];
  private runningJobs: Set<string> = new Set();
  private jobs: TimerJobConfig[] = [];
  private checkIntervalId: ReturnType<typeof setInterval> | null = null;
  private visibilityHandler: (() => void) | null = null;
  private timeSource: () => Date = () => new Date();
  private initialized: boolean = false;
  // 触发计数相关状态
  private triggerCounts: Map<string, number> = new Map(); // jobId -> 当前累计触发数
  private skipCounts: Map<string, number> = new Map();    // jobId -> 已跳过的次数

  async loadConfig(): Promise<void> {
    try {
      const response = await fetch('./assets/config/timer-jobs.json');
      if (!response.ok) throw new Error('Config file not found');
      const config = await response.json();
      this.jobs = this.validateJobs(config.jobs || []);
    } catch (e) {
      console.warn('[TimerJob] Failed to load config, using defaults:', e);
      this.jobs = DEFAULT_JOBS;
    }
    this.initialized = true;

    // 为配置了 initialDelay 的任务添加延迟触发
    this.scheduleInitialJobs();
  }

  private scheduleInitialJobs(): void {
    for (const job of this.jobs) {
      if (!job.enabled || !job.initialDelay || job.initialDelay <= 0) {
        continue;
      }

      // 如果任务有 initialTriggerCount 配置，预设置 skipCount 以确保立即执行
      if (job.initialTriggerCount && job.initialTriggerCount > 1) {
        this.triggerCounts.set(job.id, job.initialTriggerCount);
        this.skipCounts.set(job.id, job.initialTriggerCount - 1);
      }

      // 使用 setTimeout 延迟触发
      setTimeout(() => {
        const handler = this.handlers.get(job.id);
        if (handler) {
          this.executeJob(job);
        }
      }, job.initialDelay);
    }
  }

  private validateJobs(jobs: TimerJobConfig[]): TimerJobConfig[] {
    return jobs.filter(job => {
      if (!job.id || !job.cron) {
        console.warn(`[TimerJob] Invalid job config:`, job);
        return false;
      }
      try {
        CronExpressionParser.parse(job.cron);
        return true;
      } catch {
        console.warn(`[TimerJob] Invalid cron for job ${job.id}: ${job.cron}`);
        return false;
      }
    });
  }

  registerHandler(jobId: string, handler: JobHandler): void {
    this.handlers.set(jobId, handler);
  }

  setContext(context: JobContext): void {
    this.context = context;
  }

  onError(callback: ErrorCallback): void {
    this.errorCallbacks = [callback]; // Replace instead of accumulate
  }

  _setTimeSource(now: () => Date): void {
    this.timeSource = now;
  }

  start(): void {
    if (this.checkIntervalId) return;

    if (!this.initialized) {
      // Note: loadConfig() is intentionally not awaited here.
      // The first checkAndExecute() runs after 60 seconds (setInterval delay),
      // while loadConfig() completes quickly (a single fetch call).
      // By the time the first job check occurs, config will be loaded.
      // This avoids making start() async and simplifies the interface.
      this.loadConfig();
    }

    this.checkIntervalId = setInterval(() => this.checkAndExecute(), 60000);

    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        this.checkAndExecute();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  stop(): void {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  _triggerCheck(): void {
    this.checkAndExecute();
  }

  _triggerJob(jobId: string): void {
    const job = this.jobs.find(j => j.id === jobId);
    if (job && job.enabled) {
      this.executeJob(job);
    }
  }

  _reset(): void {
    this.stop();
    this.handlers.clear();
    this.context = { portfolio: [] };
    this.errorCallbacks = [];
    this.runningJobs.clear();
    this.jobs = [];
    this.initialized = false;
    this.triggerCounts.clear();
    this.skipCounts.clear();
  }

  private checkAndExecute(): void {
    const now = this.timeSource();

    for (const job of this.jobs) {
      if (!job.enabled) continue;

      try {
        const interval = CronExpressionParser.parse(job.cron);
        const prev = interval.prev().toDate();

        const timeSincePrev = now.getTime() - prev.getTime();
        if (timeSincePrev >= 0 && timeSincePrev < 60000) {
          this.executeJob(job);
        }
      } catch (e) {
        console.error(`[TimerJob] Error checking job ${job.id}:`, e);
      }
    }
  }

  private async executeJob(job: TimerJobConfig): Promise<void> {
    if (this.runningJobs.has(job.id)) {
      return;
    }

    // 获取任务的触发计数配置（默认值1）
    const initialTriggerCount = job.initialTriggerCount || 1;
    const maxTriggerCount = job.maxTriggerCount || 1;

    // 初始化状态
    if (!this.triggerCounts.has(job.id)) {
      this.triggerCounts.set(job.id, initialTriggerCount);
    }
    if (!this.skipCounts.has(job.id)) {
      this.skipCounts.set(job.id, 0);
    }

    const currentTriggerCount = this.triggerCounts.get(job.id)!;
    const skipCount = this.skipCounts.get(job.id)!;

    // 检查是否需要跳过（skipCount 表示已经跳过的次数）
    // 例如 initialTriggerCount=3 表示需要跳过2次后执行第3次
    // skipCount=0: 0+1 < 3 = true → 跳过
    // skipCount=1: 1+1 < 3 = true → 跳过
    // skipCount=2: 2+1 < 3 = false → 执行
    if (skipCount + 1 < currentTriggerCount) {
      // 跳过本轮执行
      this.skipCounts.set(job.id, skipCount + 1);
      return;
    }

    const handler = this.handlers.get(job.id);
    if (!handler) {
      console.warn(`[TimerJob] No handler registered for job ${job.id}`);
      return;
    }

    this.runningJobs.add(job.id);

    // 记录任务开始（只有真正执行时才记录）
    const logId = logTaskStart(job.name);

    try {
      const result = await handler(this.context);

      // 检查是否返回了 JobResult
      if (result && typeof result === 'object' && 'success' in result) {
        if (result.success) {
          // 成功
          logTaskEnd(logId, 'success', result.message);
          // 成功后恢复初始触发计数
          this.triggerCounts.set(job.id, initialTriggerCount);
          this.skipCounts.set(job.id, 0);
        } else {
          // 失败（业务层面返回失败状态）
          logTaskEnd(logId, 'failure', result.message || '任务返回失败');
          for (const callback of this.errorCallbacks) {
            callback(job.id, job.name, new Error(result.message || '任务返回失败'));
          }
          // 失败后增加触发计数（不超过最大值）
          const newTriggerCount = Math.min(currentTriggerCount + 1, maxTriggerCount);
          this.triggerCounts.set(job.id, newTriggerCount);
          this.skipCounts.set(job.id, 0);
        }
      } else {
        // 没有返回 JobResult，视为成功（向后兼容）
        logTaskEnd(logId, 'success');
        // 成功后恢复初始触发计数
        this.triggerCounts.set(job.id, initialTriggerCount);
        this.skipCounts.set(job.id, 0);
      }
    } catch (error) {
      // 记录任务失败
      logTaskEnd(logId, 'failure', (error as Error).message);
      console.error(`[TimerJob] ${job.name} (${job.id}) failed:`, error);
      for (const callback of this.errorCallbacks) {
        callback(job.id, job.name, error as Error);
      }
      // 失败后增加触发计数（不超过最大值）
      const newTriggerCount = Math.min(currentTriggerCount + 1, maxTriggerCount);
      this.triggerCounts.set(job.id, newTriggerCount);
      this.skipCounts.set(job.id, 0);
    } finally {
      this.runningJobs.delete(job.id);
    }
  }
}

// Singleton
let schedulerInstance: TimerJobSchedulerImpl | null = null;

export function getTimerJobScheduler(): TimerJobScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new TimerJobSchedulerImpl();
  }
  return schedulerInstance;
}

export type { TimerJobScheduler, JobContext, JobHandler };