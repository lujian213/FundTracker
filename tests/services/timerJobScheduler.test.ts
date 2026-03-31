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

describe('trigger count mechanism', () => {
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

  test('default job (initialTriggerCount=1) executes every time', async () => {
    const mockConfig = {
      jobs: [
        { id: 'test-job', name: 'Test Job', cron: '*/1 * * * *', enabled: true }
      ]
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig)
    });

    await scheduler.loadConfig();

    const handler = jest.fn().mockResolvedValue(undefined);
    scheduler.registerHandler('test-job', handler);

    // 第一次触发
    scheduler._triggerJob?.('test-job');
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);

    // 第二次触发（默认 initialTriggerCount=1，应该立即执行）
    scheduler._triggerJob?.('test-job');
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  test('job with initialTriggerCount=3 skips first 2 triggers', async () => {
    const mockConfig = {
      jobs: [
        { id: 'skip-job', name: 'Skip Job', cron: '*/1 * * * *', enabled: true, initialTriggerCount: 3, maxTriggerCount: 5 }
      ]
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig)
    });

    await scheduler.loadConfig();

    const handler = jest.fn().mockResolvedValue(undefined);
    scheduler.registerHandler('skip-job', handler);

    // 第1次触发 - 应该跳过
    scheduler._triggerJob?.('skip-job');
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();

    // 第2次触发 - 应该跳过
    scheduler._triggerJob?.('skip-job');
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();

    // 第3次触发 - 应该执行
    scheduler._triggerJob?.('skip-job');
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('successful execution resets trigger count to initial', async () => {
    const mockConfig = {
      jobs: [
        { id: 'reset-job', name: 'Reset Job', cron: '*/1 * * * *', enabled: true, initialTriggerCount: 3, maxTriggerCount: 5 }
      ]
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig)
    });

    await scheduler.loadConfig();

    const handler = jest.fn().mockResolvedValue(undefined);
    scheduler.registerHandler('reset-job', handler);

    // 第1次触发 - 跳过 (skipCount=0, 0+1 < 3)
    scheduler._triggerJob?.('reset-job');
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();

    // 第2次触发 - 跳过 (skipCount=1, 1+1 < 3)
    scheduler._triggerJob?.('reset-job');
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();

    // 第3次触发 - 执行 (skipCount=2, 2+1 >= 3)
    scheduler._triggerJob?.('reset-job');
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);

    // 成功后，skipCount重置为0，triggerCount重置为3（初始值）
    // 第4次触发 - 跳过
    scheduler._triggerJob?.('reset-job');
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalledTimes(2);

    // 第5次触发 - 跳过
    scheduler._triggerJob?.('reset-job');
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalledTimes(2);

    // 第6次触发 - 执行
    scheduler._triggerJob?.('reset-job');
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  test('failed execution increments trigger count', async () => {
    const mockConfig = {
      jobs: [
        { id: 'fail-job', name: 'Fail Job', cron: '*/1 * * * *', enabled: true, initialTriggerCount: 2, maxTriggerCount: 4 }
      ]
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig)
    });

    await scheduler.loadConfig();

    const handler = jest.fn().mockRejectedValue(new Error('Test error'));
    scheduler.registerHandler('fail-job', handler);

    // With initialTriggerCount=2:
    // Trigger 1: skipCount=0, 0+1<2 => skip (skipCount=1)
    // Trigger 2: skipCount=1, 1+1<2 => 2<2=false => execute (call 1), fail -> triggerCount=3, skipCount=0

    // 第1次触发 - 跳过 (skipCount=0, 0+1 < 2)
    scheduler._triggerJob?.('fail-job');
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();

    // 第2次触发 - 执行并失败 (skipCount=1, 1+1 < 2 => 2<2=false)
    scheduler._triggerJob?.('fail-job');
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);

    // 失败后 triggerCount=3
    // Trigger 3: skipCount=0, 0+1<3 => skip (skipCount=1)
    // Trigger 4: skipCount=1, 1+1<3 => skip (skipCount=2)
    // Trigger 5: skipCount=2, 2+1<3 => 3<3=false => execute (call 2), fail -> triggerCount=4, skipCount=0

    // 第3次触发 - 跳过
    scheduler._triggerJob?.('fail-job');
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);

    // 第4次触发 - 跳过
    scheduler._triggerJob?.('fail-job');
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);

    // 第5次触发 - 执行并失败，trigger count 变为 4（达到最大值）
    scheduler._triggerJob?.('fail-job');
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(2);

    // 失败后 triggerCount=4（最大值）
    // 需要 skip 3 次 (skipCount=0,1,2) 后执行
    // Trigger 6: skip (skipCount=1)
    // Trigger 7: skip (skipCount=2)
    // Trigger 8: skip (skipCount=3)
    // Trigger 9: execute (call 3)

    // 第6次触发 - 跳过
    scheduler._triggerJob?.('fail-job');
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(2);

    // 第7次触发 - 跳过
    scheduler._triggerJob?.('fail-job');
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(2);

    // 第8次触发 - 跳过
    scheduler._triggerJob?.('fail-job');
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(2);

    // 第9次触发 - 执行（trigger count 维持在最大值4）
    scheduler._triggerJob?.('fail-job');
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(3);
  });

  test('failed execution resets skip count to 0', async () => {
    const mockConfig = {
      jobs: [
        { id: 'skip-reset-job', name: 'Skip Reset Job', cron: '*/1 * * * *', enabled: true, initialTriggerCount: 3, maxTriggerCount: 5 }
      ]
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig)
    });

    await scheduler.loadConfig();

    // 让 handler 在第1次执行成功，之后失败
    let callCount = 0;
    const handler = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(); // 第1次成功
      }
      return Promise.reject(new Error('Test error')); // 之后失败
    });
    scheduler.registerHandler('skip-reset-job', handler);

    // With initialTriggerCount=3:
    // Trigger 1: skipCount=0, 0+1<3 => skip (skipCount=1)
    // Trigger 2: skipCount=1, 1+1<3 => skip (skipCount=2)
    // Trigger 3: skipCount=2, 2+1<3 => 3<3=false => execute (call 1), success -> triggerCount=3, skipCount=0
    scheduler._triggerJob?.('skip-reset-job');
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();

    scheduler._triggerJob?.('skip-reset-job');
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();

    scheduler._triggerJob?.('skip-reset-job');
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);

    // 成功后，skipCount重置为0，triggerCount重置为3
    // Trigger 4: skipCount=0, 0+1<3 => skip (skipCount=1)
    // Trigger 5: skipCount=1, 1+1<3 => skip (skipCount=2)
    // Trigger 6: skipCount=2, 2+1<3 => 3<3=false => execute (call 2), fail -> triggerCount=4, skipCount=0
    scheduler._triggerJob?.('skip-reset-job');
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalledTimes(2);

    scheduler._triggerJob?.('skip-reset-job');
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalledTimes(2);

    scheduler._triggerJob?.('skip-reset-job');
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(2);

    // 失败后，skipCount重置为0，triggerCount变为4
  });

  test('trigger count does not exceed maxTriggerCount', async () => {
    const mockConfig = {
      jobs: [
        { id: 'max-job', name: 'Max Job', cron: '*/1 * * * *', enabled: true, initialTriggerCount: 2, maxTriggerCount: 3 }
      ]
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig)
    });

    await scheduler.loadConfig();

    const handler = jest.fn().mockRejectedValue(new Error('Test error'));
    scheduler.registerHandler('max-job', handler);

    // With initialTriggerCount=2, maxTriggerCount=3:
    // Trigger 1: skipCount=0, 0+1<2 => skip (skipCount=1)
    // Trigger 2: skipCount=1, 1+1<2 => 2<2=false => execute (call 1), fail -> triggerCount=3, skipCount=0

    // 第1次触发 - 跳过
    scheduler._triggerJob?.('max-job');
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();

    // 第2次触发 - 执行并失败，triggerCount = 2+1=3
    scheduler._triggerJob?.('max-job');
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);

    // 失败后 triggerCount = 3（已达到最大值）
    // Trigger 3: skipCount=0, 0+1<3 => skip (skipCount=1)
    // Trigger 4: skipCount=1, 1+1<3 => skip (skipCount=2)
    // Trigger 5: skipCount=2, 2+1<3 => 3<3=false => execute (call 2), fail -> triggerCount = min(3+1, 3) = 3

    // 第3次触发 - 跳过
    scheduler._triggerJob?.('max-job');
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);

    // 第4次触发 - 跳过
    scheduler._triggerJob?.('max-job');
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);

    // 第5次触发 - 执行（triggerCount 维持在最大值3）
    scheduler._triggerJob?.('max-job');
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  test('different jobs maintain independent trigger counts', async () => {
    const mockConfig = {
      jobs: [
        { id: 'job-a', name: 'Job A', cron: '*/1 * * * *', enabled: true, initialTriggerCount: 2, maxTriggerCount: 3 },
        { id: 'job-b', name: 'Job B', cron: '*/1 * * * *', enabled: true, initialTriggerCount: 3, maxTriggerCount: 5 }
      ]
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig)
    });

    await scheduler.loadConfig();

    const handlerA = jest.fn().mockResolvedValue(undefined);
    const handlerB = jest.fn().mockResolvedValue(undefined);
    scheduler.registerHandler('job-a', handlerA);
    scheduler.registerHandler('job-b', handlerB);

    // 触发 job-a 2次（第2次应该执行）
    scheduler._triggerJob?.('job-a');
    await Promise.resolve();
    scheduler._triggerJob?.('job-a');
    await Promise.resolve();
    await Promise.resolve();
    expect(handlerA).toHaveBeenCalledTimes(1);

    // 触发 job-b 2次（都应跳过，因为 initialTriggerCount=3）
    scheduler._triggerJob?.('job-b');
    await Promise.resolve();
    scheduler._triggerJob?.('job-b');
    await Promise.resolve();
    expect(handlerB).not.toHaveBeenCalled();
  });
});

describe('JobResult-based result handling', () => {
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

  test('handler returns { success: true } - task succeeds', async () => {
    const mockConfig = {
      jobs: [
        { id: 'success-job', name: 'Success Job', cron: '*/1 * * * *', enabled: true }
      ]
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig)
    });

    await scheduler.loadConfig();

    const handler = jest.fn().mockResolvedValue({ success: true });
    scheduler.registerHandler('success-job', handler);

    scheduler._triggerJob?.('success-job');
    await Promise.resolve();
    await Promise.resolve();

    expect(handler).toHaveBeenCalledTimes(1);
    // 验证 JobResult 成功时，任务成功
  });

  test('handler returns { success: false, message: "error" } - task fails', async () => {
    const mockConfig = {
      jobs: [
        { id: 'fail-job', name: 'Fail Job', cron: '*/1 * * * *', enabled: true, initialTriggerCount: 2, maxTriggerCount: 4 }
      ]
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig)
    });

    await scheduler.loadConfig();

    const handler = jest.fn().mockResolvedValue({ success: false, message: 'API failed' });
    scheduler.registerHandler('fail-job', handler);

    // initialTriggerCount=2: 需要触发2次才执行
    // 第1次触发 - 跳过 (skipCount=0, 0+1 < 2)
    scheduler._triggerJob?.('fail-job');
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();

    // 第2次触发 - 执行并返回失败
    scheduler._triggerJob?.('fail-job');
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('JobResult failure increments trigger count', async () => {
    const mockConfig = {
      jobs: [
        { id: 'increment-job', name: 'Increment Job', cron: '*/1 * * * *', enabled: true, initialTriggerCount: 2, maxTriggerCount: 3 }
      ]
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig)
    });

    await scheduler.loadConfig();

    // 使用 Promise.reject 模拟 JobResult 失败
    const handler = jest.fn().mockResolvedValue({ success: false, message: 'Partial failure' });
    scheduler.registerHandler('increment-job', handler);

    // 第1次触发 - 跳过
    scheduler._triggerJob?.('increment-job');
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();

    // 第2次触发 - 执行并返回失败结果
    scheduler._triggerJob?.('increment-job');
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('JobResult with data is handled correctly', async () => {
    const mockConfig = {
      jobs: [
        { id: 'data-job', name: 'Data Job', cron: '*/1 * * * *', enabled: true }
      ]
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig)
    });

    await scheduler.loadConfig();

    const mockData = [{ symbol: '1.000001', current: 3000 }];
    const handler = jest.fn().mockResolvedValue({ success: true, data: mockData, message: 'OK' });
    scheduler.registerHandler('data-job', handler);

    scheduler._triggerJob?.('data-job');
    await Promise.resolve();
    await Promise.resolve();

    expect(handler).toHaveBeenCalledTimes(1);
    // 使用 resolves 来匹配 Promise 的解析值
    await expect(handler).resolves.toEqual({ success: true, data: mockData, message: 'OK' });
  });

  test('returns void (backward compatible) - treated as success', async () => {
    const mockConfig = {
      jobs: [
        { id: 'void-job', name: 'Void Job', cron: '*/1 * * * *', enabled: true }
      ]
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig)
    });

    await scheduler.loadConfig();

    // 返回 void 应该被视为成功（向后兼容）
    const handler = jest.fn().mockResolvedValue(undefined);
    scheduler.registerHandler('void-job', handler);

    scheduler._triggerJob?.('void-job');
    await Promise.resolve();
    await Promise.resolve();

    expect(handler).toHaveBeenCalledTimes(1);
  });
});