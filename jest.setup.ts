import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'util';

// 提供全局 TextDecoder/TextEncoder（Jest jsdom 环境可能缺少）
global.TextDecoder = TextDecoder as any;
global.TextEncoder = TextEncoder as any;

// Mock fetch for Jest environment (promptTemplateService uses fetch)
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: false,
    status: 404,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  })
) as any;

// 静默测试中预期的 console 输出，减少日志噪音
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = (...args: unknown[]) => {
  const message = args[0];
  if (typeof message === 'string') {
    // 忽略测试中的调试日志
    if (message.includes('No aiConfig found in imported backup') ||
        message.includes('Test indices saved') ||
        message.includes('Available selection buttons') ||
        message.includes('After fund click') ||
        message.includes('After domestic index click') ||
        message.includes('After global index click') ||
        message.includes('Delete count') ||
        message.includes('Indices before save') ||
        message.includes('Indices after save') ||
        message.includes('Save button disabled') ||
        message.includes('aria-pressed') ||
        message.includes('[StorageMigration] 验证结果汇总')) {
      return;
    }
  }
  originalLog.call(console, ...args);
};

console.error = (...args: unknown[]) => {
  const message = args[0];
  if (typeof message === 'string') {
    if (message.includes('Error reading stored position') ||
        message.includes('Error getting trades') ||
        message.includes('Error communicating with AI') ||
        message.includes('Failed to load templates') ||
        message.includes('was not wrapped in act') ||
        message.includes('[BackgroundJob] Failed to parse AI response') ||
        message.includes('[BackgroundJob] Error loading prompts') ||
        message.includes('[StrategyRecommendation] Failed to parse AI response') ||
        message.includes('Check the render method of `VirtualTradeModal`') ||
        message.includes('See https://reactjs.org/link/warning-keys') ||
        message.includes('Failed to load portfolio templates') ||
        message.includes('[Calendar] Failed to load calendar data') ||
        message.includes('[TimerJob]') ||
        message.includes('Error reading user preference') ||
        message.includes('Error reading system config')) {
      return;
    }
  }
  originalError.call(console, ...args);
};

console.warn = (...args: unknown[]) => {
  const message = args[0];
  if (typeof message === 'string') {
    if (message.includes('punycode') ||
        message.includes('restoreAIConfigBackup') ||
        message.includes('Invalid backup data') ||
        message.includes('[TimerJob] Failed to load config') ||
        message.includes('加载常用问题配置失败') ||
        message.includes('[BackgroundJob] AI response is not an array') ||
        message.includes('[StrategyRecommendation] AI response is not an array') ||
        message.includes('Failed to load template config')) {
      return;
    }
  }
  originalWarn.call(console, ...args);
};

export {};