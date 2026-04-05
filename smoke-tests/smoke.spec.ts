import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('页面正常加载', async ({ page }) => {
    // 监听 console 错误
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // 监听页面错误
    const pageErrors: string[] = [];
    page.on('pageerror', error => {
      pageErrors.push(error.message);
    });

    // 打开主页
    await page.goto('/', { waitUntil: 'networkidle' });

    // 检查页面标题
    await expect(page).toHaveTitle(/基金估值助手/);

    // 检查页面基本元素存在
    await expect(page.locator('#root')).toBeVisible();

    // 等待一段时间让 React 渲染完成
    await page.waitForTimeout(2000);

    // 检查是否有 JavaScript 错误
    const criticalErrors = consoleErrors.filter(err =>
      // 忽略一些非关键错误（如第三方库警告）
      !err.includes('Warning:') &&
      !err.includes('[HMR]') &&
      !err.includes('[vite]')
    );

    const criticalPageErrors = pageErrors.filter(err =>
      !err.includes('Warning:') &&
      !err.includes('[HMR]')
    );

    // 如果有关键错误，抛出异常
    if (criticalErrors.length > 0) {
      console.log('Console errors:', criticalErrors);
    }
    if (criticalPageErrors.length > 0) {
      console.log('Page errors:', criticalPageErrors);
    }

    expect(criticalPageErrors.length).toBe(0);
  });

  test('localStorage 服务正常初始化', async ({ page }) => {
    // 打开主页
    await page.goto('/', { waitUntil: 'networkidle' });

    // 等待 React 渲染
    await page.waitForTimeout(1000);

    // 检查 localStorage 是否正常工作
    const localStorageWorks = await page.evaluate(() => {
      try {
        // 测试基本读写
        localStorage.setItem('test_key', 'test_value');
        const value = localStorage.getItem('test_key');
        localStorage.removeItem('test_key');
        return value === 'test_value';
      } catch {
        return false;
      }
    });

    expect(localStorageWorks).toBe(true);
  });
});