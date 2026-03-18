import '@testing-library/jest-dom';

// 静默测试中预期的 console 输出，减少日志噪音
const originalError = console.error;
const originalWarn = console.warn;

console.error = (...args: unknown[]) => {
  // 忽略已知的预期错误（如 localStorage 解析失败、API 错误等测试场景）
  const message = args[0];
  if (typeof message === 'string') {
    // 忽略业务代码中预期的错误日志
    if (message.includes('Error reading stored position') ||
        message.includes('Error getting trades') ||
        message.includes('Error communicating with AI') ||
        message.includes('Failed to load templates')) {
      return;
    }
    // 忽略 act() 警告（由组件内部定时器产生，不影响测试结果）
    if (message.includes('was not wrapped in act')) {
      return;
    }
  }
  originalError.call(console, ...args);
};

console.warn = (...args: unknown[]) => {
  const message = args[0];
  if (typeof message === 'string') {
    // 忽略 punycode 弃用警告
    if (message.includes('punycode')) {
      return;
    }
    // 忽略 AI 配置备份相关的预期警告
    if (message.includes('restoreAIConfigBackup') ||
        message.includes('Invalid backup data')) {
      return;
    }
  }
  originalWarn.call(console, ...args);
};

export {};