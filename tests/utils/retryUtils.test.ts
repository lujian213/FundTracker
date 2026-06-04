// tests/utils/retryUtils.test.ts
import { withRetry, isJsonTruncationError, createRetryExecutor } from '../../utils/retryUtils';

describe('retryUtils', () => {
  describe('isJsonTruncationError', () => {
    test('identifies JSON parsing errors', () => {
      const error = new Error('JSON解析错误: Unexpected token');
      expect(isJsonTruncationError(error)).toBe(true);
    });

    test('identifies truncation errors', () => {
      const error = new Error('末尾未正确闭合');
      expect(isJsonTruncationError(error)).toBe(true);
    });

    test('identifies general JSON errors', () => {
      const error = new Error('JSON parse failed');
      expect(isJsonTruncationError(error)).toBe(true);
    });

    test('returns false for non-JSON errors', () => {
      const error = new Error('Network error');
      expect(isJsonTruncationError(error)).toBe(false);
    });

    test('returns false for API errors', () => {
      const error = new Error('API Key not configured');
      expect(isJsonTruncationError(error)).toBe(false);
    });
  });

  describe('withRetry', () => {
    test('returns result on first successful attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await withRetry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('retries on retryable error', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('JSON解析错误'))
        .mockResolvedValue('success');

      const result = await withRetry(fn, {
        isRetryable: isJsonTruncationError,
        baseDelayMs: 10,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    test('throws after max retries exhausted', async () => {
      const error = new Error('JSON解析错误');
      const fn = jest.fn().mockRejectedValue(error);

      await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 10 }))
        .rejects.toThrow('JSON解析错误');

      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    test('does not retry on non-retryable error', async () => {
      const error = new Error('API Key not configured');
      const fn = jest.fn().mockRejectedValue(error);

      await expect(withRetry(fn, { isRetryable: isJsonTruncationError }))
        .rejects.toThrow('API Key not configured');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('calls onRetry callback', async () => {
      const onRetry = jest.fn();
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('JSON解析错误'))
        .mockResolvedValue('success');

      await withRetry(fn, {
        isRetryable: isJsonTruncationError,
        onRetry,
        baseDelayMs: 10,
      });

      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
    });

    test('uses custom maxRetries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('JSON解析错误'));

      await expect(withRetry(fn, { maxRetries: 1, baseDelayMs: 10 }))
        .rejects.toThrow('JSON解析错误');

      expect(fn).toHaveBeenCalledTimes(2); // initial + 1 retry
    });

    test('uses custom operationName in logs', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('JSON解析错误'))
        .mockResolvedValue('success');

      await withRetry(fn, {
        isRetryable: isJsonTruncationError,
        operationName: 'CustomOp',
        baseDelayMs: 10,
      });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('CustomOp'));
      consoleSpy.mockRestore();
    });
  });

  describe('createRetryExecutor', () => {
    test('creates executor with default options', async () => {
      const executor = createRetryExecutor({ maxRetries: 1 });
      const fn = jest.fn().mockResolvedValue('success');

      const result = await executor(fn);

      expect(result).toBe('success');
    });

    test('allows override of default options', async () => {
      const executor = createRetryExecutor({ maxRetries: 1, baseDelayMs: 10 });
      const fn = jest.fn().mockRejectedValue(new Error('JSON解析错误'));

      await expect(executor(fn, { maxRetries: 3, baseDelayMs: 10 }))
        .rejects.toThrow('JSON解析错误');

      expect(fn).toHaveBeenCalledTimes(4); // initial + 3 retries
    });
  });
});