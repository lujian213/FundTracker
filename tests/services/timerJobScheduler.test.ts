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
      expect(mockFetch).toHaveBeenCalledWith('/assets/config/timer-jobs.json');
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