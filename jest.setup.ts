import '@testing-library/jest-dom';

// 静默测试中预期的 console 输出，减少日志噪音
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = (...args: unknown[]) => {
  const message = args[0];
  if (typeof message === 'string') {
    // 忽略备份测试中的预期日志
    if (message.includes('No aiConfig found in imported backup')) {
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
        message.includes('was not wrapped in act')) {
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
        message.includes('Invalid backup data')) {
      return;
    }
  }
  originalWarn.call(console, ...args);
};

export {};