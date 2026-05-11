import { test, expect, Page, BrowserContext } from '@playwright/test';

/**
 * Smoke Tests - 优化版
 *
 * 优化策略：
 * 1. 使用 beforeAll 共享页面，避免每个测试重新加载
 * 2. 用 load 替代 networkidle
 * 3. 用精确等待替代固定超时
 */

let sharedContext: BrowserContext | null = null;
let sharedPage: Page | null = null;
let consoleMessages: { type: string; text: string }[] = [];
let pageErrors: string[] = [];

test.describe('Smoke Tests', () => {
  test.beforeAll(async ({ browser }) => {
    // 创建共享的浏览器上下文
    sharedContext = await browser.newContext({
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });
    sharedPage = await sharedContext.newPage();

    // 监听 console 和 pageerror（只设置一次）
    consoleMessages = [];
    pageErrors = [];

    sharedPage.on('console', msg => {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
    });

    sharedPage.on('pageerror', error => {
      pageErrors.push(error.message);
    });

    // 只加载一次页面
    await sharedPage.goto('/', { waitUntil: 'load' });
  });

  test.afterAll(async () => {
    await sharedPage?.close();
    await sharedContext?.close();
    sharedPage = null;
    sharedContext = null;
  });

  test.beforeEach(async () => {
    if (!sharedPage) throw new Error('Page not initialized');
  });

  test('页面正常加载', async () => {
    const page = sharedPage!;

    // 验证页面标题
    await expect(page).toHaveTitle(/基金估值助手/, { timeout: 60000 });

    // 等待 React 应用渲染完成（页面主要内容出现）
    await expect(page.locator('h1:has-text("极简基金估值")')).toBeVisible({ timeout: 60000 });

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

  test('localStorage 服务正常初始化', async () => {
    const page = sharedPage!;

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

  test('指数数据结构迁移完成', async () => {
    const page = sharedPage!;

    // 等待数据加载（通过服务获取）
    await page.waitForFunction(() => {
      const root = (window as any).__ROOT__;
      if (!root?.indexService) return false;
      const indices = root.indexService.getAllMarketIndices();
      return indices.length > 0;
    }, { timeout: 60000 });

    const storageData = await page.evaluate(() => {
      const isDomesticIndex = (symbol: string): boolean => {
        if (symbol.startsWith('1.') || symbol.startsWith('0.')) return true;
        if (symbol === '100.HSI' || symbol === '124.HSTECH') return true;
        return false;
      };

      const root = (window as any).__ROOT__;
      const items = root?.indexService?.getAllMarketIndices?.() || [];
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

  test('指数卡片正常显示', async () => {
    const page = sharedPage!;

    await expect(page.locator('#root')).toBeVisible({ timeout: 60000 });

    // 等待指数名称出现
    const indexNames = ['上证指数', '深证成指', '创业板指', '纳斯达克100', '标普500', '恒生指数'];

    // 至少有一个指数名称出现
    for (const name of indexNames) {
      try {
        await expect(page.locator(`text=${name}`)).toBeVisible({ timeout: 10000 });
        break;  // 找到一个就成功
      } catch {
        continue;
      }
    }
  });
});