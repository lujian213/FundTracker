// utils/retryUtils.ts
/**
 * 通用重试工具
 * 用于封装需要重试的异步操作
 */

/**
 * 重试配置选项
 */
export interface RetryOptions {
  /** 最大重试次数，默认 2 */
  maxRetries?: number;
  /** 基础延迟毫秒数，默认 1000（线性递增：1秒、2秒、3秒） */
  baseDelayMs?: number;
  /** 判断错误是否可重试的函数，默认所有错误都重试 */
  isRetryable?: (error: Error) => boolean;
  /** 重试时的回调函数，用于日志记录 */
  onRetry?: (attempt: number, error: Error) => void;
  /** 操作名称，用于日志 */
  operationName?: string;
}

/**
 * 默认的可重试错误检测
 * 检测 JSON 解析错误和截断问题
 */
export function isJsonTruncationError(error: Error): boolean {
  const msg = error.message;
  return msg.includes('JSON') ||
         msg.includes('解析') ||
         msg.includes('末尾') ||
         msg.includes('截断');
}

/**
 * 带重试的异步操作执行器
 * @param fn 要执行的异步函数
 * @param options 重试配置选项
 * @returns 函数执行结果
 * @throws 所有重试失败后抛出最后一次错误
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 2;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const isRetryable = options?.isRetryable ?? (() => true);
  const onRetry = options?.onRetry;
  const operationName = options?.operationName ?? '操作';

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();

      // 成功时，如果是重试后的成功，记录日志
      if (attempt > 0) {
        console.log(`[${operationName}] 第 ${attempt + 1} 次尝试成功`);
      }

      return result;
    } catch (error) {
      lastError = error as Error;

      // 检查是否可重试
      const canRetry = isRetryable(lastError);

      if (canRetry && attempt < maxRetries) {
        // 调用重试回调
        if (onRetry) {
          onRetry(attempt + 1, lastError);
        } else {
          console.warn(`[${operationName}] 第 ${attempt + 1} 次尝试失败，将重试...`);
        }

        // 等待一段时间后重试（线性递增）
        await new Promise(resolve => setTimeout(resolve, baseDelayMs * (attempt + 1)));
        continue;
      }

      // 不可重试或已达到最大重试次数，抛出错误
      throw lastError;
    }
  }

  // 所有重试都失败（理论上不会到达这里，因为上面会 throw）
  throw lastError ?? new Error(`${operationName}失败`);
}

/**
 * 创建带重试条件的重试执行器
 * 用于特定场景的重试逻辑
 */
export function createRetryExecutor<T>(
  defaultOptions: RetryOptions
): (fn: () => Promise<T>, overrideOptions?: RetryOptions) => Promise<T> {
  return (fn, overrideOptions) => {
    const mergedOptions = {
      ...defaultOptions,
      ...overrideOptions,
    };
    return withRetry(fn, mergedOptions);
  };
}