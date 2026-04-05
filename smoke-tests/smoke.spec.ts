import { test, expect } from '@playwright/test';

// 需要检查的 localStorage key
const EXPECTED_STORAGE_KEYS = [
  'fund_indices_info',
  'fund_global_indices_info',
];

test.describe('Smoke Tests', () => {
  test('页面正常加载', async ({ page }) => {
    // 监听 console 所有消息
    const consoleMessages: { type: string; text: string }[] = [];
    page.on('console', msg => {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
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

    // 输出迁移验证日志
    const migrationLogs = consoleMessages.filter(msg =>
      msg.text.includes('[StorageMigration]')
    );
    console.log('迁移验证日志:', migrationLogs);

    // 检查是否有 JavaScript 错误
    const criticalErrors = consoleMessages.filter(msg =>
      msg.type === 'error' &&
      !msg.text.includes('Warning:') &&
      !msg.text.includes('[HMR]') &&
      !msg.text.includes('[vite]')
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

  test('指数数据结构迁移完成', async ({ page }) => {
    // 打开主页
    await page.goto('/', { waitUntil: 'networkidle' });

    // 等待 React 渲染和初始化
    await page.waitForTimeout(1500);

    // 检查 localStorage 中有预期的 key
    const storageData = await page.evaluate(() => {
      const data: {
        allSymbols: string[];
        domestic: string[];
        global: string[];
        count: number;
      } = {
        allSymbols: [],
        domestic: [],
        global: [],
        count: 0
      };

      // 判断是否为国内指数（A股 + 港股）
      const isDomesticIndex = (symbol: string): boolean => {
        if (symbol.startsWith('1.') || symbol.startsWith('0.')) return true;
        if (symbol === '100.HSI' || symbol === '124.HSTECH') return true;
        return false;
      };

      // 读取统一的指数存储（新key）
      const indicesRaw = localStorage.getItem('fund_all_indices_info');
      if (indicesRaw) {
        const items = JSON.parse(indicesRaw);
        data.allSymbols = items.map((i: any) => i.symbol);
        data.count = items.length;
        // 动态分类
        data.domestic = data.allSymbols.filter((s: string) => isDomesticIndex(s));
        data.global = data.allSymbols.filter((s: string) => !isDomesticIndex(s));
      }

      return data;
    });

    // 输出详细信息
    console.log('所有指数:', storageData.allSymbols);
    console.log('国内指数:', storageData.domestic);
    console.log('全球指数:', storageData.global);

    // 验证指数数据存在
    expect(storageData.count).toBeGreaterThan(0);

    // 验证分类正确
    expect(storageData.domestic.length).toBeGreaterThan(0);
    expect(storageData.global.length).toBeGreaterThan(0);
  });

  test('指数卡片正常显示', async ({ page }) => {
    // 打开主页
    await page.goto('/', { waitUntil: 'networkidle' });

    // 等待指数卡片渲染
    await page.waitForTimeout(2000);

    // 检查是否有指数卡片显示（默认指数）
    const indexCards = await page.evaluate(() => {
      // 查找包含指数名称的元素
      const indexNames = ['上证指数', '深证成指', '创业板指', '纳斯达克100', '标普500', '恒生指数'];
      const found: string[] = [];
      for (const name of indexNames) {
        if (document.body.textContent?.includes(name)) {
          found.push(name);
        }
      }
      return found;
    });

    // 至少应该显示一些默认指数
    expect(indexCards.length).toBeGreaterThan(0);
  });
});