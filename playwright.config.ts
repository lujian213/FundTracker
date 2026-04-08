import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './smoke-tests',
  testIgnore: ['**/testDataPrepare.spec.ts'],  // 默认 exclude testDataPrepare（运行时注释掉）
  fullyParallel: false,  // 串行执行，避免资源竞争
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,  // 单 worker，共享浏览器上下文
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: { mode: 'retain-on-failure' },
    actionTimeout: 5000,  // 单个操作超时
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120000,
  },
});