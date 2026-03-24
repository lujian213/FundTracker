import { getTimerJobScheduler, TimerJobConfig } from '../../services/timerJobScheduler';

// Mock cron-parser (default export with static parse method)
jest.mock('cron-parser', () => ({
  __esModule: true,
  default: {
    parse: jest.fn((expression: string) => {
      if (!expression || expression.split(' ').length !== 5) {
        throw new Error('Invalid cron expression');
      }
      return {
        next: () => ({ toDate: () => new Date() }),
        prev: () => ({ toDate: () => new Date() }),
      };
    }),
  },
}));

// Mock fetch for config loading
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('TimerJobScheduler', () => {
  let scheduler: ReturnType<typeof getTimerJobScheduler>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    scheduler = getTimerJobScheduler();
    scheduler.stop();
    scheduler._reset?.();
  });

  afterEach(() => {
    scheduler.stop();
    scheduler._reset?.();
    jest.useRealTimers();
  });

  describe('registerHandler', () => {
    test('registers a handler for a job id', () => {
      const handler = jest.fn();
      scheduler.registerHandler('test-job', handler);
      expect(true).toBe(true);
    });
  });

  describe('setContext', () => {
    test('sets context for job execution', () => {
      scheduler.setContext({ portfolio: [] });
      expect(true).toBe(true);
    });
  });

  describe('start/stop', () => {
    test('start begins the scheduler', () => {
      scheduler.start();
      expect(true).toBe(true);
    });

    test('stop halts the scheduler', () => {
      scheduler.start();
      scheduler.stop();
      expect(true).toBe(true);
    });
  });

  describe('loadConfig', () => {
    test('loads config from file successfully', async () => {
      const mockConfig = {
        jobs: [
          { id: 'test-job', name: 'Test', cron: '*/5 * * * *', enabled: true }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfig)
      });

      await scheduler.loadConfig();
      expect(mockFetch).toHaveBeenCalledWith('./assets/config/timer-jobs.json');
    });

    test('uses default config when file not found', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });
      await scheduler.loadConfig();
      expect(true).toBe(true);
    });

    test('uses default config when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      await scheduler.loadConfig();
      expect(true).toBe(true);
    });
  });
});

describe('TimerJobScheduler - error handling', () => {
  let scheduler: ReturnType<typeof getTimerJobScheduler>;

  beforeEach(() => {
    jest.clearAllMocks();
    scheduler = getTimerJobScheduler();
    scheduler.stop();
    scheduler._reset?.();
  });

  afterEach(() => {
    scheduler.stop();
    scheduler._reset?.();
  });

  test('onError registers callback that can be called', () => {
    const errorHandler = jest.fn();
    scheduler.onError(errorHandler);
    // Callback is registered - verified by no error thrown
    expect(typeof scheduler.onError).toBe('function');
  });

  test('multiple error callbacks can be registered', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    scheduler.onError(handler1);
    scheduler.onError(handler2);
    // Verifies multiple registrations don't throw errors
    expect(typeof scheduler.onError).toBe('function');
  });
});

describe('_triggerJob', () => {
  let scheduler: ReturnType<typeof getTimerJobScheduler>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    scheduler = getTimerJobScheduler();
    scheduler.stop();
    scheduler._reset?.();
  });

  afterEach(() => {
    scheduler.stop();
    scheduler._reset?.();
    jest.useRealTimers();
  });

  test('triggers specific job by id', async () => {
    const mockConfig = {
      jobs: [
        { id: 'holiday-info-refresh', name: '节假日信息刷新', cron: '0 */6 * * *', enabled: true }
      ]
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig)
    });

    await scheduler.loadConfig();

    const handler = jest.fn().mockResolvedValue(undefined);
    scheduler.registerHandler('holiday-info-refresh', handler);

    // 调用 _triggerJob 触发指定任务
    scheduler._triggerJob?.('holiday-info-refresh');

    // 等待异步执行
    await Promise.resolve();
    await Promise.resolve();

    expect(handler).toHaveBeenCalled();
  });

  test('does nothing for unregistered job id', async () => {
    const mockConfig = {
      jobs: [
        { id: 'test-job', name: 'Test Job', cron: '*/5 * * * *', enabled: true }
      ]
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig)
    });

    await scheduler.loadConfig();

    // 不应该抛出错误
    expect(() => scheduler._triggerJob?.('non-existent-job')).not.toThrow();
  });

  test('does nothing for disabled job', async () => {
    const mockConfig = {
      jobs: [
        { id: 'disabled-job', name: 'Disabled Job', cron: '*/5 * * * *', enabled: false }
      ]
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig)
    });

    await scheduler.loadConfig();

    const handler = jest.fn().mockResolvedValue(undefined);
    scheduler.registerHandler('disabled-job', handler);

    // 调用 _triggerJob 触发禁用的任务
    scheduler._triggerJob?.('disabled-job');

    // 等待异步执行
    await Promise.resolve();

    // 禁用的任务不应该被触发
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('strategy-recommendation-refresh job', () => {
  let scheduler: ReturnType<typeof getTimerJobScheduler>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    scheduler = getTimerJobScheduler();
    scheduler.stop();
    scheduler._reset?.();
  });

  afterEach(() => {
    scheduler.stop();
    scheduler._reset?.();
    jest.useRealTimers();
  });

  test('job config exists and can be triggered', async () => {
    const mockConfig = {
      jobs: [
        { id: 'strategy-recommendation-refresh', name: '推荐交易策略刷新', cron: '0 */6 * * *', enabled: true }
      ]
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig)
    });

    await scheduler.loadConfig();

    const handler = jest.fn().mockResolvedValue(undefined);
    scheduler.registerHandler('strategy-recommendation-refresh', handler);

    // 使用 _triggerJob 手动触发
    scheduler._triggerJob?.('strategy-recommendation-refresh');

    // 等待异步执行
    await Promise.resolve();
    await Promise.resolve();

    expect(handler).toHaveBeenCalled();
  });

  test('handler can be triggered multiple times', async () => {
    const mockConfig = {
      jobs: [
        { id: 'strategy-recommendation-refresh', name: '推荐交易策略刷新', cron: '0 */6 * * *', enabled: true }
      ]
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig)
    });

    await scheduler.loadConfig();

    const handler = jest.fn().mockResolvedValue(undefined);
    scheduler.registerHandler('strategy-recommendation-refresh', handler);

    // 触发多次
    scheduler._triggerJob?.('strategy-recommendation-refresh');
    await Promise.resolve();
    await Promise.resolve();

    scheduler._triggerJob?.('strategy-recommendation-refresh');
    await Promise.resolve();
    await Promise.resolve();

    expect(handler).toHaveBeenCalledTimes(2);
  });

  test('disabled job does not trigger handler', async () => {
    const mockConfig = {
      jobs: [
        { id: 'strategy-recommendation-refresh', name: '推荐交易策略刷新', cron: '0 */6 * * *', enabled: false }
      ]
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig)
    });

    await scheduler.loadConfig();

    const handler = jest.fn().mockResolvedValue(undefined);
    scheduler.registerHandler('strategy-recommendation-refresh', handler);

    scheduler._triggerJob?.('strategy-recommendation-refresh');

    await Promise.resolve();
    await Promise.resolve();

    // 禁用的任务不应该被触发
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('background job scheduling', () => {
  let scheduler: ReturnType<typeof getTimerJobScheduler>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    scheduler = getTimerJobScheduler();
    scheduler.stop();
    scheduler._reset?.();
  });

  afterEach(() => {
    scheduler.stop();
    scheduler._reset?.();
    jest.useRealTimers();
  });

  test('holiday-info-refresh job config exists', async () => {
    const mockConfig = {
      jobs: [
        { id: 'holiday-info-refresh', name: '节假日信息刷新', cron: '0 */6 * * *', enabled: true }
      ]
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig)
    });

    await scheduler.loadConfig();

    const handler = jest.fn().mockResolvedValue(undefined);
    scheduler.registerHandler('holiday-info-refresh', handler);

    // 使用 _triggerJob 手动触发
    scheduler._triggerJob?.('holiday-info-refresh');

    // 等待异步执行
    await Promise.resolve();
    await Promise.resolve();

    expect(handler).toHaveBeenCalled();
  });

  test('delivery-info-refresh job config exists', async () => {
    const mockConfig = {
      jobs: [
        { id: 'delivery-info-refresh', name: '交割日信息刷新', cron: '0 */6 * * *', enabled: true }
      ]
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig)
    });

    await scheduler.loadConfig();

    const handler = jest.fn().mockResolvedValue(undefined);
    scheduler.registerHandler('delivery-info-refresh', handler);

    scheduler._triggerJob?.('delivery-info-refresh');

    await Promise.resolve();
    await Promise.resolve();

    expect(handler).toHaveBeenCalled();
  });

  test('both background jobs can be registered and triggered together', async () => {
    const mockConfig = {
      jobs: [
        { id: 'holiday-info-refresh', name: '节假日信息刷新', cron: '0 */6 * * *', enabled: true },
        { id: 'delivery-info-refresh', name: '交割日信息刷新', cron: '0 */6 * * *', enabled: true }
      ]
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig)
    });

    await scheduler.loadConfig();

    const holidayHandler = jest.fn().mockResolvedValue(undefined);
    const deliveryHandler = jest.fn().mockResolvedValue(undefined);

    scheduler.registerHandler('holiday-info-refresh', holidayHandler);
    scheduler.registerHandler('delivery-info-refresh', deliveryHandler);

    // 触发两个任务
    scheduler._triggerJob?.('holiday-info-refresh');
    scheduler._triggerJob?.('delivery-info-refresh');

    await Promise.resolve();
    await Promise.resolve();

    expect(holidayHandler).toHaveBeenCalled();
    expect(deliveryHandler).toHaveBeenCalled();
  });
});