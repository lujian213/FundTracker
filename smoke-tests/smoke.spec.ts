import { test, expect } from '@playwright/test';
import path from 'path';

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

      // 读取统一的指数存储（新key：fund_all_indices_data，存储 MarketIndex[]）
      const indicesRaw = localStorage.getItem('fund_all_indices_data');
      if (indicesRaw) {
        const items = JSON.parse(indicesRaw);
        data.allSymbols = items.map((m: any) => m.info.symbol);
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

  test('导入备份文件成功显示7个指数和21个基金', async ({ page }) => {
    // 监听 console 消息
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      consoleMessages.push(msg.text());
    });

    // 打开主页
    await page.goto('/', { waitUntil: 'networkidle' });

    // 等待页面渲染完成
    await page.waitForTimeout(2000);

    // 点击系统配置按钮（齿轮图标）
    const configButton = page.locator('button[title="系统配置"]');
    await configButton.click();

    // 等待系统配置模态框打开
    await page.waitForTimeout(500);

    // 验证备份管理标签已选中
    const backupTab = page.locator('button:has-text("备份管理")');
    await expect(backupTab).toHaveClass(/bg-blue-50/);

    // 准备上传备份文件
    const backupFilePath = path.join(process.cwd(), '__mocks__', 'fund_backup_2026-04-06_12-50-51.json');

    // 点击导入备份按钮并等待文件选择器
    const importButton = page.locator('button:has-text("导入备份")');

    // 使用 Promise.all 确保点击和文件选择器监听同步
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      importButton.click(),
    ]);

    // 上传文件
    await fileChooser.setFiles(backupFilePath);

    // 等待确认对话框出现
    const confirmDialog = page.locator('[role="dialog"]:has-text("导入确认")');
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });

    // 点击确认导入按钮
    const confirmButton = confirmDialog.locator('button:has-text("确认导入")');
    await confirmButton.click();

    // 等待导入处理完成
    await page.waitForTimeout(3000);

    // 输出控制台消息帮助调试
    console.log('控制台消息:', consoleMessages.filter(m => m.includes('backup') || m.includes('import') || m.includes('迁移')));

    // 验证 localStorage 中的数据
    const storageData = await page.evaluate(() => {
      // 读取基金数据
      const fundsRaw = localStorage.getItem('fund_all_funds_data');
      const funds = fundsRaw ? JSON.parse(fundsRaw) : [];

      // 读取指数数据
      const indicesRaw = localStorage.getItem('fund_all_indices_data');
      const indices = indicesRaw ? JSON.parse(indicesRaw) : [];

      // 输出所有 localStorage keys
      const allKeys = Object.keys(localStorage);
      console.log('所有 localStorage keys:', allKeys);

      return {
        fundCount: funds.length,
        indexCount: indices.length,
        fundSymbols: funds.map((f: any) => f.info?.ticker?.symbol).filter(Boolean),
        indexSymbols: indices.map((m: any) => m.info?.symbol).filter(Boolean),
        allKeys,
      };
    });

    // 输出详细信息
    console.log('导入后基金数量:', storageData.fundCount);
    console.log('导入后指数数量:', storageData.indexCount);
    console.log('localStorage keys:', storageData.allKeys);

    // 验证数量
    expect(storageData.fundCount).toBe(21);
    expect(storageData.indexCount).toBe(7);

    // 输出详细信息
    console.log('导入后基金数量:', storageData.fundCount);
    console.log('导入后指数数量:', storageData.indexCount);
    console.log('基金符号:', storageData.fundSymbols);
    console.log('指数符号:', storageData.indexSymbols);

    // 验证基金符号
    const expectedFundSymbols = [
      '023832', '004433', '022364', '012328', '008888', '012734', '024194', '011592',
      '002611', '012349', '270023', '530018', '020640', '025833', '270042', '015283',
      '019005', '161226', '019173', '017437', '019524'
    ];
    expect(storageData.fundSymbols.sort()).toEqual(expectedFundSymbols.sort());

    // 验证指数符号
    const expectedIndexSymbols = ['1.000001', '124.HSTECH', '0.399001', '0.399006', '100.NDX100', '101.GC00Y', '101.SI00Y'];
    expect(storageData.indexSymbols.sort()).toEqual(expectedIndexSymbols.sort());

    // 刷新页面验证数据持久化
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 验证刷新后数据仍然存在
    const refreshedData = await page.evaluate(() => {
      const fundsRaw = localStorage.getItem('fund_all_funds_data');
      const funds = fundsRaw ? JSON.parse(fundsRaw) : [];
      const indicesRaw = localStorage.getItem('fund_all_indices_data');
      const indices = indicesRaw ? JSON.parse(indicesRaw) : [];
      return {
        fundCount: funds.length,
        indexCount: indices.length,
      };
    });

    expect(refreshedData.fundCount).toBe(21);
    expect(refreshedData.indexCount).toBe(7);
  });
});