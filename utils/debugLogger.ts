/**
 * utils/debugLogger.ts
 *
 * 调试日志拦截器
 * 拦截 console.log/console.warn 调用，将调试信息记录到 DebugPanel
 *
 * DEBUG_START 2026-06-03: 调试日志拦截器
 */

import { addDebugLog } from '../components/DebugPanel';

// 需要拦截的日志前缀列表
const DEBUG_PREFIXES = [
  '[DATA_MISMATCH]',
  '[TickerCard_RENDER]',
  '[TickerCard_HISTORY_REQUEST]',
  '[TickerCard_HISTORY_RESULT]',
  '[HistoryRequest_START]',
  '[HistoryRequest_SUCCESS]',
  '[HistoryRequest_ERROR]',
  '[updateValuation]',
  '[updateHistory]',
  '[marketFundService_INIT]',
  '[marketFundService_LOADED]',
  '[computeOverallProfit_START]',
  '[computeOverallProfit_RESULT]',
  '[Draft_DATA_MISMATCH]',
];

// 是否启用拦截（通过 localStorage 控制）
const DEBUG_INTERCEPT_ENABLED_KEY = 'debug_intercept_enabled';

export function isDebugInterceptEnabled(): boolean {
  return localStorage.getItem(DEBUG_INTERCEPT_ENABLED_KEY) === 'true';
}

export function setDebugInterceptEnabled(enabled: boolean): void {
  localStorage.setItem(DEBUG_INTERCEPT_ENABLED_KEY, enabled ? 'true' : 'false');
}

// 保存原始 console 方法
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

/**
 * 拦截 console.log
 * 检查是否以调试前缀开头，如果是则同时记录到 DebugPanel
 */
function interceptedLog(...args: any[]): void {
  // 调用原始方法
  originalConsoleLog.apply(console, args);

  // 检查是否需要拦截
  if (!isDebugInterceptEnabled()) return;

  // 检查第一个参数是否为字符串且以调试前缀开头
  const firstArg = args[0];
  if (typeof firstArg === 'string') {
    for (const prefix of DEBUG_PREFIXES) {
      if (firstArg.startsWith(prefix)) {
        // 提取类型和数据
        const type = prefix.slice(1, -1); // 去掉方括号
        const data = args.length > 1 ? args.slice(1) : { message: firstArg };

        // 如果第一个参数是对象（如 [{...}]），则提取它
        if (args.length === 2 && typeof args[1] === 'object' && !Array.isArray(args[1])) {
          addDebugLog(type, args[1]);
        } else if (args.length === 2 && Array.isArray(args[1]) && args[1].length === 1) {
          addDebugLog(type, args[1][0]);
        } else {
          addDebugLog(type, data);
        }
        break;
      }
    }
  }
}

/**
 * 拦截 console.warn
 * 检查是否以调试前缀开头，如果是则同时记录到 DebugPanel
 */
function interceptedWarn(...args: any[]): void {
  // 调用原始方法
  originalConsoleWarn.apply(console, args);

  // 检查是否需要拦截
  if (!isDebugInterceptEnabled()) return;

  // 检查第一个参数是否为字符串且以调试前缀开头
  const firstArg = args[0];
  if (typeof firstArg === 'string') {
    for (const prefix of DEBUG_PREFIXES) {
      if (firstArg.startsWith(prefix)) {
        // 提取类型和数据
        const type = prefix.slice(1, -1); // 去掉方括号
        const data = args.length > 1 ? args.slice(1) : { message: firstArg };

        // 如果第一个参数是对象（如 [{...}]），则提取它
        if (args.length === 2 && typeof args[1] === 'object' && !Array.isArray(args[1])) {
          addDebugLog(type, args[1]);
        } else if (args.length === 2 && Array.isArray(args[1]) && args[1].length === 1) {
          addDebugLog(type, args[1][0]);
        } else {
          addDebugLog(type, data);
        }
        break;
      }
    }
  }
}

/**
 * 启用调试日志拦截
 */
export function enableDebugIntercept(): void {
  console.log = interceptedLog;
  console.warn = interceptedWarn;
  setDebugInterceptEnabled(true);
  originalConsoleLog('[DEBUG] 调试日志拦截已启用');
}

/**
 * 禁用调试日志拦截
 */
export function disableDebugIntercept(): void {
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  setDebugInterceptEnabled(false);
  originalConsoleLog('[DEBUG] 调试日志拦截已禁用');
}

/**
 * 初始化调试日志拦截（根据 localStorage 设置）
 */
export function initDebugIntercept(): void {
  if (isDebugInterceptEnabled()) {
    console.log = interceptedLog;
    console.warn = interceptedWarn;
    originalConsoleLog('[DEBUG] 调试日志拦截已恢复（根据 localStorage 设置）');
  }
}
// DEBUG_END