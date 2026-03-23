import CronExpressionParser from 'cron-parser';
import { TimerJobConfig, Ticker } from '../types';

interface JobContext {
  portfolio: Ticker[];
}

type JobHandler = (context: JobContext) => Promise<void>;

type ErrorCallback = (jobId: string, jobName: string, error: Error) => void;

const DEFAULT_JOBS: TimerJobConfig[] = [
  { id: 'fund-valuation-refresh', name: '基金估值刷新', cron: '*/3 * * * *', enabled: true },
  { id: 'history-refresh', name: '历史净值刷新', cron: '*/20 * * * *', enabled: true },
  { id: 'market-index-refresh', name: '市场指数刷新', cron: '*/2 * * * *', enabled: true },
  { id: 'news-refresh', name: '市场热点刷新', cron: '*/3 * * * *', enabled: true },
  { id: 'holiday-info-refresh', name: '节假日信息刷新', cron: '0 */6 * * *', enabled: true },
  { id: 'delivery-info-refresh', name: '交割日信息刷新', cron: '0 */6 * * *', enabled: true },
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

  async loadConfig(): Promise<void> {
    try {
      const response = await fetch('/assets/config/timer-jobs.json');
      if (!response.ok) throw new Error('Config file not found');
      const config = await response.json();
      this.jobs = this.validateJobs(config.jobs || []);
    } catch (e) {
      console.warn('[TimerJob] Failed to load config, using defaults:', e);
      this.jobs = DEFAULT_JOBS;
    }
    this.initialized = true;
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

    const handler = this.handlers.get(job.id);
    if (!handler) {
      console.warn(`[TimerJob] No handler registered for job ${job.id}`);
      return;
    }

    this.runningJobs.add(job.id);

    try {
      await handler(this.context);
    } catch (error) {
      console.error(`[TimerJob] ${job.name} (${job.id}) failed:`, error);
      for (const callback of this.errorCallbacks) {
        callback(job.id, job.name, error as Error);
      }
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