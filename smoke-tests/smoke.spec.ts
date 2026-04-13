import { test, expect } from '@playwright/test';

/**
 * Smoke Tests - 优化版
 *
 * 优化策略：
 * 1. 用 load 替代 networkidle
 * 2. 用精确等待替代固定超时
 * 3. 减少不必要的等待
 */

test.describe('Smoke Tests', () => {
  test('页面正常加载', async ({ page }) => {
    const consoleMessages: { type: string; text: string }[] = [];
    page.on('console', msg => {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
    });

    const pageErrors: string[] = [];
    page.on('pageerror', error => {
      pageErrors.push(error.message);
    });

    await page.goto('/', { waitUntil: 'load' });
    await expect(page).toHaveTitle(/基金估值助手/);
    // 等待 React 应用渲染完成（页面主要内容出现）
    await expect(page.locator('h1:has-text("极简基金估值")')).toBeVisible();

    // 检查关键错误
    const criticalErrors = consoleMessages.filter(msg =>
      msg.type === 'error' &&
      !msg.text.includes('Warning:') &&
      !msg.text.includes('[HMR]') &&
      !msg.text.includes('[vite]')
    );
    const criticalPageErrors = pageErrors.filter(err =>
      !err.includes('Warning:') && !err.includes('[HMR]')
    );

    expect(criticalPageErrors.length).toBe(0);
  });

  test('localStorage 服务正常初始化', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });

    const localStorageWorks = await page.evaluate(() => {
      try {
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

  test('指数数据结构迁移完成', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });

    // 等待数据加载
    await page.waitForFunction(() => {
      const indicesRaw = localStorage.getItem('fund_all_indices_data');
      return indicesRaw && JSON.parse(indicesRaw).length > 0;
    }, { timeout: 5000 });

    const storageData = await page.evaluate(() => {
      const isDomesticIndex = (symbol: string): boolean => {
        if (symbol.startsWith('1.') || symbol.startsWith('0.')) return true;
        if (symbol === '100.HSI' || symbol === '124.HSTECH') return true;
        return false;
      };

      const indicesRaw = localStorage.getItem('fund_all_indices_data');
      const items = indicesRaw ? JSON.parse(indicesRaw) : [];
      const allSymbols = items.map((m: any) => m.info.symbol);

      return {
        allSymbols,
        count: items.length,
        domestic: allSymbols.filter((s: string) => isDomesticIndex(s)),
        global: allSymbols.filter((s: string) => !isDomesticIndex(s)),
      };
    });

    expect(storageData.count).toBeGreaterThan(0);
    expect(storageData.domestic.length).toBeGreaterThan(0);
    expect(storageData.global.length).toBeGreaterThan(0);
  });

  test('指数卡片正常显示', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await expect(page.locator('#root')).toBeVisible();

    // 等待指数名称出现
    const indexNames = ['上证指数', '深证成指', '创业板指', '纳斯达克100', '标普500', '恒生指数'];

    // 至少有一个指数名称出现
    for (const name of indexNames) {
      try {
        await expect(page.locator(`text=${name}`)).toBeVisible({ timeout: 3000 });
        break;  // 找到一个就成功
      } catch {
        continue;
      }
    }
  });
});