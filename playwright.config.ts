import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './smoke-tests',
  testIgnore: ['**/testDataPrepare.spec.ts'],  // 默认 exclude testDataPrepare（运行时注释掉）
  fullyParallel: false,  // 不同文件串行执行，避免共享 dev server 导致的资源竞争
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,  // 单 worker，确保测试隔离
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: { mode: 'retain-on-failure' },
    actionTimeout: 5000,  // 单个操作超时
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120000,
  },
});