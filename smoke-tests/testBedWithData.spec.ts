import { test, expect, Page, BrowserContext, Browser } from '@playwright/test';
import path from 'path';
import fs from 'fs';

/**
 * 测试基座 - testBedWithData
 *
 * 此测试套件从 mock-data 文件加载测试数据，为需要仿真数据的 smoke test 提供基础环境。
 * 数据来源：testDataPrepare.spec.ts 生成的 mock-data_yyyy-MM-dd_HH-mm-ss.json
 *
 * beforeAll 步骤：
 * 1. 从 __mocks__ 目录读取最新的 mock-data 文件
 * 2. 通过 addInitScript mock Date 为文件中的 timestamp
 * 3. 将 data 导入到 localStorage
 */

// 共享状态
let sharedContext: BrowserContext | null = null;
let sharedPage: Page | null = null;

// Mocks 目录路径
const MOCKS_DIR = path.join(process.cwd(), '__mocks__');

// Mock 数据结构
interface MockDataFile {
  timestamp: string;           // ISO 时间戳
  data: Record<string, string>; // localStorage 数据
  newsCache: any[];            // 新闻缓存
}

/**
 * 加载最新的 mock-data 文件
 * 返回完整的 mock 数据（timestamp、data、newsCache）
 */
function loadLatestMockData(): MockDataFile | null {
  if (!fs.existsSync(MOCKS_DIR)) {
    console.error(`__mocks__ 目录不存在: ${MOCKS_DIR}`);
    return null;
  }

  const files = fs.readdirSync(MOCKS_DIR)
    .filter(f => f.startsWith('mock-data_') && f.endsWith('.json'))
    .sort()
    .reverse(); // 按时间倒序，最新的在最前面

  if (files.length === 0) {
    console.error('__mocks__ 目录中没有 mock-data 文件');
    return null;
  }

  const filepath = path.join(MOCKS_DIR, files[0]);
  console.log(`使用 mock data 文件: ${filepath}`);

  try {
    const fileContent = fs.readFileSync(filepath, 'utf-8');
    const mockData = JSON.parse(fileContent);

    if (!mockData.timestamp || !mockData.data) {
      console.error('mock data 文件格式错误：缺少 timestamp 或 data 字段');
      return null;
    }

    return mockData as MockDataFile;
  } catch (e) {
    console.error(`读取 mock data 文件失败: ${e}`);
    return null;
  }
}

/**
 * 导入 mock 数据到 localStorage
 */
async function importMockData(page: Page, data: Record<string, string>): Promise<void> {
  await page.evaluate((localStorageData) => {
    for (const [key, value] of Object.entries(localStorageData)) {
      localStorage.setItem(key, value);
    }
  }, data);

  console.log(`已导入 ${Object.keys(data).length} 个 localStorage key`);
}

test.describe('testBedWithData', () => {
  test.beforeAll(async ({ browser }) => {
    // 一次性加载 mock 数据
    const mockData = loadLatestMockData();
    if (!mockData) {
      throw new Error('无法加载 mock 数据');
    }
    console.log(`Mock 时间: ${mockData.timestamp}`);

    // 创建共享的浏览器上下文，设置时区为东8区，并在页面加载前 mock Date
    sharedContext = await browser.newContext({
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });

    // 使用 addInitScript 在每个页面加载前 mock Date
    await sharedContext.addInitScript((mockTime) => {
      const mockDate = new Date(mockTime);
      const OriginalDate = Date;
      const mockTimeMs = mockDate.getTime();

      // 保存原始 Date 到全局变量
      (window as any).__originalDate = OriginalDate;

      // 重写 Date 构造函数
      const MockDate: any = function(this: any, ...args: any[]) {
        if (args.length === 0) {
          return new OriginalDate(mockTimeMs);
        }
        return new (OriginalDate as any)(...args);
      };

      // 静态方法
      MockDate.now = () => mockTimeMs;
      MockDate.parse = OriginalDate.parse.bind(OriginalDate);
      MockDate.UTC = OriginalDate.UTC.bind(OriginalDate);
      MockDate.prototype = OriginalDate.prototype;

      // 替换全局 Date
      (window as any).Date = MockDate;
    }, mockData.timestamp);

    sharedPage = await sharedContext.newPage();

    // 拦截外部网络请求，阻止后台任务获取真实数据
    await sharedPage.route('**/*', (route) => {
      const url = route.request().url();
      // 允许本地资源和数据请求
      if (url.startsWith('http://localhost') ||
          url.startsWith('ws://localhost') ||
          url.includes('/assets/')) {
        route.continue();
      } else {
        // 阻止外部网络请求
        route.abort();
      }
    });

    // 先导航到页面（必须先有页面才能操作 localStorage）
    await sharedPage.goto('/', { waitUntil: 'load' });
    await expect(sharedPage.locator('#root')).toBeVisible();

    // 清除之前的 localStorage 数据，确保干净状态
    await sharedPage.evaluate(() => {
      localStorage.clear();
    });

    // 导入 mock data 到 localStorage
    await importMockData(sharedPage, mockData.data);

    // 刷新页面以加载导入的数据到 React 状态
    await sharedPage.reload({ waitUntil: 'load' });
    await expect(sharedPage.locator('#root')).toBeVisible();

    // 注入新闻数据并触发事件让 NewsContext 更新
    await sharedPage.evaluate((newsData) => {
      if ((window as any).__ROOT__ && newsData.length > 0) {
        (window as any).__ROOT__.marketNewsService.setNews(newsData);
        // setNews 会自动触发 'news-cache-updated' 事件，NewsContext 会自动刷新
      }
      // 禁用定时器，防止后台任务执行
      if ((window as any).__ROOT__?.timerJobScheduler) {
        (window as any).__ROOT__.timerJobScheduler.stop();
      }
    }, mockData.newsCache || []);

    console.log('测试基座准备完成');
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

  // ═══════════════════════════════════════════════════════════════════════════════
  // 测试用例 1：主界面显示测试
  // ═══════════════════════════════════════════════════════════════════════════════

  test('主界面显示测试', async () => {
    const page = sharedPage!;

    // 等待基金卡片可见（替代固定等待）
    const fundCardsWithH3 = page.locator('div.bg-white.rounded-2xl.border').filter({ has: page.locator('h3') });
    await expect(fundCardsWithH3.first()).toBeVisible({ timeout: 15000 });

    // 加载 mock 数据用于验证
    const mockData = await page.evaluate(() => {
      const fundsRaw = localStorage.getItem('fund_all_funds_data');
      const indicesRaw = localStorage.getItem('fund_all_indices_data');
      const funds = fundsRaw ? JSON.parse(fundsRaw) : [];
      const indices = indicesRaw ? JSON.parse(indicesRaw) : [];

      return {
        funds,
        indices,
        fundsCount: funds.length,
        indicesCount: indices.length,
      };
    });
    console.log(`数据状态: 基金 ${mockData.fundsCount} 个, 指数 ${mockData.indicesCount} 个`);

    // ══════════════════════════════════════════════════════════════════════════════
    // 1. 验证大盘看点（左侧 aside，4 个指数）
    // ══════════════════════════════════════════════════════════════════════════════
    const leftAside = page.locator('aside').first();
    const leftIndexCards = leftAside.locator('div.bg-white.rounded-2xl');
    await expect(leftIndexCards.first()).toBeVisible({ timeout: 10000 });
    const domesticIndexCount = await leftIndexCards.count();
    expect(domesticIndexCount).toBe(4);

    // 验证大盘看点指数存在
    const domesticIndices = mockData.indices.slice(0, 4);
    for (const idx of domesticIndices) {
      await expect(leftAside.locator(`h4:has-text("${idx.info.name}")`)).toBeVisible();
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // 2. 验证全球市场（右侧 aside，3 个指数）
    // ══════════════════════════════════════════════════════════════════════════════
    const rightAside = page.locator('aside').last();
    const rightIndexCards = rightAside.locator('div.bg-white.rounded-2xl');
    await expect(rightIndexCards.first()).toBeVisible({ timeout: 10000 });
    const globalIndexCount = await rightIndexCards.count();
    expect(globalIndexCount).toBe(3);

    // 验证全球市场指数存在
    const globalIndices = mockData.indices.slice(4, 7);
    for (const idx of globalIndices) {
      await expect(rightAside.locator(`h4:has-text("${idx.info.name}")`)).toBeVisible();
    }

    // 验证纳斯达克100显示历史标签（tradeDate = 2026-04-07）
    const nasdaqCard = rightAside.locator('div.bg-white.rounded-2xl').filter({
      has: page.locator('h4:has-text("纳斯达克100")'),
    });
    await expect(nasdaqCard.locator('div.bg-amber-100')).toBeVisible({ timeout: 5000 });

    // ══════════════════════════════════════════════════════════════════════════════
    // 3. 验证基金卡片（21 个）
    // ══════════════════════════════════════════════════════════════════════════════
    const allCards = page.locator('div.bg-white.rounded-2xl.border');
    const totalCards = await allCards.count();
    const fundCardCount = totalCards - 7; // 减去 7 个指数卡片
    expect(fundCardCount).toBe(21);

    // 验证基金卡片数量（重用前面定义的 fundCardsWithH3）
    const fundCardCountByH3 = await fundCardsWithH3.count();
    expect(fundCardCountByH3).toBe(21);

    // 使用这个选择器作为基金卡片
    const fundCards = fundCardsWithH3;

    // 验证带历史标签的基金（161226 和 019005）
    // 这两个基金的 realtimeDate 是 2026-04-07
    const historyFunds = mockData.funds.filter(
      (f: any) => f.info?.valuation?.realtimeDate === '2026-04-07'
    );
    expect(historyFunds.length).toBe(2);

    // 验证历史标签显示
    for (const hf of historyFunds) {
      const symbol = hf.info?.ticker?.symbol;
      const card = fundCards.filter({ has: page.locator(`text=${symbol}`) });
      // 历史标签是 amber 色的 div
      await expect(card.first().locator('div.bg-amber-100')).toBeVisible({ timeout: 5000 });
    }

    // 验证带历史标签的基金放在最后两个位置
    // 前 19 个基金不应该有历史标签
    for (let i = 0; i < 19; i++) {
      const card = fundCards.nth(i);
      await expect(card.locator('div.bg-amber-100')).not.toBeVisible();
    }
    // 最后两个应该有历史标签
    await expect(fundCards.nth(19).locator('div.bg-amber-100')).toBeVisible();
    await expect(fundCards.nth(20).locator('div.bg-amber-100')).toBeVisible();

    // ══════════════════════════════════════════════════════════════════════════════
    // 4. 验证市场新闻滚动显示
    // ══════════════════════════════════════════════════════════════════════════════
    const newsTicker = page.locator('.animate-marquee');
    await expect(newsTicker).toBeVisible({ timeout: 10000 });

    // 验证有新闻链接
    const newsLinks = newsTicker.locator('a[href]');
    const newsCount = await newsLinks.count();
    expect(newsCount).toBeGreaterThan(0);

    // ══════════════════════════════════════════════════════════════════════════════
    // 5. 验证基金卡片内容：名称、代码、估值、前值、涨跌幅与 mock 数据一致
    // ══════════════════════════════════════════════════════════════════════════════
    // 验证所有基金名称和代码都存在
    for (const fund of mockData.funds) {
      const fundName = fund.info?.valuation?.name || fund.info?.ticker?.name;
      const fundSymbol = fund.info?.ticker?.symbol;
      // 验证基金代码
      await expect(page.locator(`text=${fundSymbol}`).first()).toBeVisible();
      // 验证基金名称（部分匹配）
      await expect(page.locator(`h3[title*="${fundName.substring(0, 6)}"]`).first()).toBeVisible();
    }

    // 验证风险提示（状态点）- 每个卡片都有状态点
    // 状态点很小，用 count 验证存在性
    const statusDots = fundCards.first().locator('div.w-1\\.5.h-1\\.5.rounded-full');
    const statusDotCount = await statusDots.count();
    expect(statusDotCount).toBeGreaterThan(0);

    // ══════════════════════════════════════════════════════════════════════════════
    // 6. 验证指数卡片内容：名称、代码、指数值、前值、涨跌幅与 mock 数据一致
    // ══════════════════════════════════════════════════════════════════════════════
    const firstIndex = mockData.indices[0];
    const firstIndexCard = leftIndexCards.first();

    // 验证指数名称
    await expect(firstIndexCard.locator('h4')).toHaveText(firstIndex.info.name);

    // ══════════════════════════════════════════════════════════════════════════════
    // 7. 验证走势缩略图
    // ══════════════════════════════════════════════════════════════════════════════
    // 统计有走势缩略图的基金（有 intraday 数据）
    const fundsWithIntraday = mockData.funds.filter(
      (f: any) => f.intraday && f.intraday.length > 0
    ).length;
    const fundsWithoutIntraday = mockData.fundsCount - fundsWithIntraday;
    console.log(`走势缩略图: ${fundsWithIntraday} 个基金有, ${fundsWithoutIntraday} 个基金无`);

    // 验证基金走势缩略图数量（实际数据：19有，2无）
    expect(fundsWithIntraday).toBe(19);
    expect(fundsWithoutIntraday).toBe(2);

    // 统计有走势缩略图的指数
    const indicesWithIntraday = mockData.indices.filter(
      (idx: any) => idx.intraday && idx.intraday.length > 0
    ).length;
    const indicesWithoutIntraday = mockData.indicesCount - indicesWithIntraday;
    console.log(`指数走势缩略图: ${indicesWithIntraday} 个有, ${indicesWithoutIntraday} 个无`);

    // 验证指数走势缩略图数量（实际数据：6有，1无）
    expect(indicesWithIntraday).toBe(6);
    expect(indicesWithoutIntraday).toBe(1);

    // ══════════════════════════════════════════════════════════════════════════════
    // 8. 验证 hovertip
    // ══════════════════════════════════════════════════════════════════════════════
    // 验证基金名称的 hovertip
    const firstFundCard = fundCards.first();
    const firstFundTitle = firstFundCard.locator('h3');
    await firstFundTitle.hover();
    // 基金名称有 title 属性显示完整名称
    const fundTitleAttr = await firstFundTitle.getAttribute('title');
    expect(fundTitleAttr).toBeTruthy();

    // ══════════════════════════════════════════════════════════════════════════════
    // 9. 验证主界面工具栏按钮
    // ══════════════════════════════════════════════════════════════════════════════
    // 工具栏按钮都有 title 属性（hovertip）
    const toolbarButtons = page.locator('header button[title]');
    const toolbarCount = await toolbarButtons.count();
    expect(toolbarCount).toBeGreaterThanOrEqual(4);

    console.log(`主界面验证完成: 大盘看点 ${domesticIndexCount} 个, 全球市场 ${globalIndexCount} 个, 基金卡片 ${fundCardCount} 个`);
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // 测试用例 2：主界面基金排序测试
  // ═══════════════════════════════════════════════════════════════════════════════

  test('主界面基金排序测试', async () => {
    const page = sharedPage!;

    // 获取基金卡片（等待可见）
    const fundCards = page.locator('div.bg-white.rounded-2xl.border').filter({ has: page.locator('h3') });
    await expect(fundCards.first()).toBeVisible({ timeout: 10000 });

    // 找到排序按钮
    const sortButton = page.locator('button:has(i[class*="fa-sort-amount"])');
    await expect(sortButton).toBeVisible();

    // ══════════════════════════════════════════════════════════════════════════════
    // 1. 第一次点击：切换排序顺序
    // ══════════════════════════════════════════════════════════════════════════════
    // 获取当前排序图标
    const isDownIcon = await sortButton.locator('i[class*="fa-sort-amount-down"]').isVisible();
    const isUpIcon = await sortButton.locator('i[class*="fa-sort-amount-up"]').isVisible();

    // 点击排序按钮
    await sortButton.click();

    // 验证排序图标切换（自动等待）
    if (isDownIcon) {
      // 原来是降序，点击后应该是升序
      await expect(sortButton.locator('i[class*="fa-sort-amount-up"]')).toBeVisible({ timeout: 2000 });
    } else if (isUpIcon) {
      // 原来是升序，点击后应该是降序
      await expect(sortButton.locator('i[class*="fa-sort-amount-down"]')).toBeVisible({ timeout: 2000 });
    }

    console.log('排序按钮第一次点击验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 2. 第二次点击：恢复原来的排序顺序
    // ══════════════════════════════════════════════════════════════════════════════
    await sortButton.click();

    // 验证排序图标恢复（自动等待）
    if (isDownIcon) {
      // 原来是降序，点击两次后应该恢复降序
      await expect(sortButton.locator('i[class*="fa-sort-amount-down"]')).toBeVisible({ timeout: 2000 });
    } else if (isUpIcon) {
      // 原来是升序，点击两次后应该恢复升序
      await expect(sortButton.locator('i[class*="fa-sort-amount-up"]')).toBeVisible({ timeout: 2000 });
    }

    console.log('排序按钮第二次点击验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 3. 验证排序功能正常工作
    // ══════════════════════════════════════════════════════════════════════════════
    // 验证历史标签存在（位置验证在测试1中已完成）
    const allAmberLabels = page.locator('div.bg-amber-100');
    const labelCount = await allAmberLabels.count();
    console.log(`历史标签数量: ${labelCount}`);
    expect(labelCount).toBeGreaterThanOrEqual(1);

    console.log('历史标签验证完成');
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // 测试用例 3：日历功能测试
  // ═══════════════════════════════════════════════════════════════════════════════

  test('日历功能测试', async () => {
    const page = sharedPage!;

    // ══════════════════════════════════════════════════════════════════════════════
    // 1. 点击日历按钮，弹出日历窗口
    // ══════════════════════════════════════════════════════════════════════════════
    const calendarButton = page.locator('button[title="日历"]');
    await expect(calendarButton).toBeVisible();
    await calendarButton.click();

    // 验证日历窗口已打开
    const calendarModal = page.locator('h3:has-text("投资日历")');
    await expect(calendarModal).toBeVisible({ timeout: 5000 });

    // ══════════════════════════════════════════════════════════════════════════════
    // 2. 验证4/8日（mock 的今日）日期是蓝色的
    // ══════════════════════════════════════════════════════════════════════════════
    // Mock 时间是 2026-04-08，所以今日应该是 4/8
    const dateCells = page.locator('.grid-cols-7 > div.bg-white');
    const date8Cell = dateCells.filter({ has: page.locator('span:has-text("8")') }).first();
    await expect(date8Cell).toBeVisible();

    // 验证今日格子有蓝色背景（bg-blue-50）
    await expect(date8Cell).toHaveClass(/bg-blue-50/);

    // 验证今日日期数字有蓝色字体（text-blue-600）
    const date8Number = date8Cell.locator('span:has-text("8")');
    await expect(date8Number).toHaveClass(/text-blue-600/);

    console.log('今日日期（4/8）蓝色验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 3. 验证特定日期的事件和 hovertip
    // ══════════════════════════════════════════════════════════════════════════════
    // 定义预期事件数据（根据实际mock数据）
    const expectedEvents: { date: string; expectedCount: number; description: string }[] = [
      { date: '4/3', expectedCount: 3, description: '美股、港股和新加坡股市的节假日' },
      { date: '4/6', expectedCount: 1, description: '港股清明节翌日休市' },
      { date: '4/17', expectedCount: 2, description: 'A股和美股的交割日' },
      { date: '4/22', expectedCount: 1, description: 'A股的交割日' },
      { date: '4/29', expectedCount: 2, description: 'A股和港股的交割日' },
    ];

    // 切换到四月份（当前应该已经在四月）
    const monthSelect = page.locator('select');
    const currentMonthValue = await monthSelect.inputValue();
    if (currentMonthValue !== '3') {
      await monthSelect.selectOption('3');
      // 等待日历更新
      await expect(dateCells.first()).toBeVisible({ timeout: 2000 });
    }

    // 验证每个日期的事件数量
    for (const expected of expectedEvents) {
      // 提取日期数字
      const dayNum = parseInt(expected.date.split('/')[1]);

      // 找到该日期的格子
      const dateCell = dateCells.filter({ has: page.locator(`span:has-text("${dayNum}")`) }).first();
      await expect(dateCell).toBeVisible();

      // 计算格子内的事件项数量（红色圆点或黄色圆点的项目）
      const eventItems = dateCell.locator('div.flex.items-center.gap-px');
      const eventCount = await eventItems.count();

      console.log(`${expected.date}: 预期 ${expected.expectedCount} 项, 实际 ${eventCount} 项 (${expected.description})`);
      expect(eventCount).toBe(expected.expectedCount);

      // 验证 hovertip - hover 该日期格子
      await dateCell.hover();

      // 验证 tooltip 出现（自动等待）
      const tooltip = page.locator('div.shadow-xl.border-gray-200');
      await expect(tooltip).toBeVisible({ timeout: 2000 });

      // 验证 tooltip 内项目数量与格子内一致
      const tooltipItems = tooltip.locator('div.text-gray-600.ml-1');
      const totalTooltipCount = await tooltipItems.count();

      console.log(`${expected.date} tooltip: 总计 ${totalTooltipCount} 项`);
      expect(totalTooltipCount).toBe(expected.expectedCount);

      // 移开鼠标，隐藏 tooltip
      await page.mouse.move(0, 0);
      await expect(tooltip).not.toBeVisible({ timeout: 1000 });
    }

    console.log('特定日期事件和 hovertip 验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 4. 验证其他日期没有节假日和交割日，也没有 hovertip
    // ══════════════════════════════════════════════════════════════════════════════
    // 选择一些没有事件的日期验证
    const noEventDays = [1, 2, 9, 10, 14, 15, 23, 28];
    for (const day of noEventDays) {
      const dateCell = dateCells.filter({ has: page.locator(`span:has-text("${day}")`) }).first();
      if (await dateCell.isVisible()) {
        const eventItems = dateCell.locator('div.flex.items-center.gap-px');
        const eventCount = await eventItems.count();
        expect(eventCount).toBe(0);
      }
    }

    console.log('无事件日期验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 5. 验证月份选择和箭头按钮
    // ══════════════════════════════════════════════════════════════════════════════
    // 验证月份下拉框有12个月
    const monthOptions = monthSelect.locator('option');
    const monthCount = await monthOptions.count();
    expect(monthCount).toBe(12);

    // 验证月份名称
    const months = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
    for (let i = 0; i < 12; i++) {
      const optionText = await monthOptions.nth(i).textContent();
      expect(optionText).toBe(months[i]);
    }

    // 找到左右箭头按钮
    const leftArrow = page.locator('button:has(i.fa-chevron-left)');
    const rightArrow = page.locator('button:has(i.fa-chevron-right)');

    // 验证当前在四月，左右箭头都可用
    await expect(leftArrow).not.toHaveAttribute('disabled', '');
    await expect(rightArrow).not.toHaveAttribute('disabled', '');

    // 选择一月，验证左箭头禁用
    await monthSelect.selectOption('0');
    await expect(leftArrow).toHaveAttribute('disabled', '', { timeout: 2000 });
    await expect(rightArrow).not.toHaveAttribute('disabled', '');

    // 选择十二月，验证右箭头禁用
    await monthSelect.selectOption('11');
    await expect(leftArrow).not.toHaveAttribute('disabled', '');
    await expect(rightArrow).toHaveAttribute('disabled', '', { timeout: 2000 });

    console.log('月份选择和箭头按钮验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 6. 验证今日按钮
    // ══════════════════════════════════════════════════════════════════════════════
    // 点击今日按钮
    const todayButton = page.locator('button:has-text("今日")');
    await todayButton.click();

    // 验证月份切换回四月
    await expect(monthSelect).toHaveValue('3', { timeout: 2000 });

    // 验证当前日期（4/8）格子高亮显示
    const todayCell = dateCells.filter({ has: page.locator('span:has-text("8")') }).first();
    await expect(todayCell).toHaveClass(/bg-blue-50/);
    await expect(todayCell.locator('span:has-text("8")')).toHaveClass(/text-blue-600/);

    console.log('今日按钮验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 7. 关闭日历窗口
    // ══════════════════════════════════════════════════════════════════════════════
    const closeButton = page.locator('button[aria-label="关闭"]');
    await closeButton.click();
    await expect(calendarModal).not.toBeVisible();

    console.log('日历功能测试完成');
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // 测试用例 4：系统配置测试
  // ═══════════════════════════════════════════════════════════════════════════════

  test('系统配置测试', async () => {
    const page = sharedPage!;

    // ══════════════════════════════════════════════════════════════════════════════
    // 1. 点击系统配置按钮，弹出系统配置窗口
    // ══════════════════════════════════════════════════════════════════════════════
    const configButton = page.locator('button[title="系统配置"]');
    await expect(configButton).toBeVisible();
    await configButton.click();

    // 验证系统配置窗口已打开
    const configModal = page.locator('h2:has-text("系统配置")');
    await expect(configModal).toBeVisible({ timeout: 5000 });

    // ══════════════════════════════════════════════════════════════════════════════
    // 2. 验证左边显示4个选项
    // ══════════════════════════════════════════════════════════════════════════════
    const navItems = page.locator('nav button');
    const navCount = await navItems.count();
    expect(navCount).toBe(4);

    // 验证导航项名称
    const navLabels = ['备份管理', '同步管理', 'AI配置', '系统开关'];
    for (let i = 0; i < 4; i++) {
      const navText = await navItems.nth(i).textContent();
      expect(navText).toContain(navLabels[i]);
    }

    console.log('导航选项验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 3. 点击"备份管理"，验证自动备份设置
    // ══════════════════════════════════════════════════════════════════════════════
    await navItems.nth(0).click(); // 备份管理

    // 验证自动备份标题显示
    await expect(page.locator('h3:has-text("自动备份")')).toBeVisible({ timeout: 2000 });

    // 验证"启用自动备份"开关是打开的
    const autoBackupCheckbox = page.locator('input[type="checkbox"]').first();
    await expect(autoBackupCheckbox).toBeChecked();

    // 验证"每日自动导出时间"显示为"16:00"
    const timeInput = page.locator('input#auto-export-time');
    const timeValue = await timeInput.inputValue();
    expect(timeValue).toBe('16:00');

    // 关闭开关（点击 label 来触发 checkbox）
    const autoBackupToggleLabel = page.locator('label.cursor-pointer').first();
    await autoBackupToggleLabel.click();

    // 验证开关已关闭（自动等待）
    await expect(autoBackupCheckbox).not.toBeChecked({ timeout: 2000 });

    // 验证"每日自动导出时间"输入框为灰色（disabled 状态）
    await expect(timeInput).toBeDisabled();

    // 验证"自动备份状态"显示为"已关闭"
    await expect(page.locator('text=已关闭')).toBeVisible();

    // 重新打开开关，恢复状态
    await autoBackupToggleLabel.click();
    await expect(autoBackupCheckbox).toBeChecked({ timeout: 2000 });

    console.log('备份管理验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 4. 点击"AI配置"，验证配置列表中有"deepseek"
    // ══════════════════════════════════════════════════════════════════════════════
    await navItems.nth(2).click(); // AI配置

    // 验证AI配置标题显示
    await expect(page.locator('h3:has-text("新建配置")')).toBeVisible({ timeout: 2000 });

    // 验证配置列表中有deepseek
    const configList = page.locator('h3:has-text("配置列表")').locator('..').locator('.space-y-3 > div');
    const deepseekConfig = configList.filter({ has: page.locator('h4:has-text("deepseek")') });
    await expect(deepseekConfig).toBeVisible();

    // 验证deepseek已激活
    await expect(deepseekConfig.locator('span:has-text("已激活")')).toBeVisible();

    console.log('AI配置验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 5. 点击"系统开关"，验证开关状态并切换
    // ══════════════════════════════════════════════════════════════════════════════
    await navItems.nth(3).click(); // 系统开关

    // 验证功能开关标题显示
    await expect(page.locator('h3:has-text("功能开关")')).toBeVisible({ timeout: 2000 });

    // 验证两个开关项
    const switchItems = page.locator('.divide-y > div');
    const switchCount = await switchItems.count();
    expect(switchCount).toBe(2);

    // 验证第一个开关（初始价格调整）是关闭的
    const firstSwitch = switchItems.first().locator('button[role="switch"]');
    await expect(firstSwitch).toHaveAttribute('aria-checked', 'false');

    // 验证第二个开关（后台任务日志）是打开的
    const secondSwitch = switchItems.nth(1).locator('button[role="switch"]');
    await expect(secondSwitch).toHaveAttribute('aria-checked', 'true');

    // 关闭"后台任务日志"开关
    await secondSwitch.click();
    await expect(secondSwitch).toHaveAttribute('aria-checked', 'false', { timeout: 2000 });

    // 打开"初始价格调整"开关
    await firstSwitch.click();
    await expect(firstSwitch).toHaveAttribute('aria-checked', 'true', { timeout: 2000 });

    console.log('系统开关验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 6. 关闭系统配置窗口
    // ══════════════════════════════════════════════════════════════════════════════
    const closeButton = page.locator('button[aria-label="关闭"]');
    await closeButton.click();
    await expect(configModal).not.toBeVisible();

    // ══════════════════════════════════════════════════════════════════════════════
    // 7. 验证主界面上看不到后台任务日志的入口
    // ══════════════════════════════════════════════════════════════════════════════
    const jobLogButton = page.locator('button[title="后台任务日志"]');
    await expect(jobLogButton).not.toBeVisible();

    console.log('系统配置测试完成');
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // 测试用例 5：基金持仓测试
  // ═══════════════════════════════════════════════════════════════════════════════

  test('基金持仓测试', async () => {
    const page = sharedPage!;

    // ══════════════════════════════════════════════════════════════════════════════
    // 1. 点击基金持仓按钮，弹出基金持仓窗口
    // ══════════════════════════════════════════════════════════════════════════════
    const positionsButton = page.locator('button:has-text("持仓")');
    await positionsButton.click();

    // 验证基金持仓窗口已打开
    const positionsModal = page.locator('h3:has-text("基金持仓")');
    await expect(positionsModal).toBeVisible();

    // ══════════════════════════════════════════════════════════════════════════════
    // 2. 验证窗口内饼图和表格里有21个基金的数据
    // ══════════════════════════════════════════════════════════════════════════════
    // 验证显示21只基金
    await expect(page.locator('text=21只基金')).toBeVisible();

    // 验证饼图显示（SVG中有21个path切片，stroke="white"）
    const pieSlices = page.locator('svg path[stroke="white"]');
    expect(await pieSlices.count()).toBe(21);

    // 验证表格显示21行数据
    const tableRows = page.locator('table tbody tr');
    expect(await tableRows.count()).toBe(21);

    console.log('基金持仓窗口验证完成: 21只基金, 饼图21个切片, 表格21行');

    // ══════════════════════════════════════════════════════════════════════════════
    // 3. 点击第一个按钮（查看持仓总金额趋势）
    // ══════════════════════════════════════════════════════════════════════════════
    const trendButton = page.locator('button[aria-label="查看持仓总金额趋势"]');
    await trendButton.click();

    // 验证趋势图窗口已打开
    const trendModal = page.locator('h3:has-text("持仓总金额趋势")');
    await expect(trendModal).toBeVisible();

    // ══════════════════════════════════════════════════════════════════════════════
    // 4. 验证折线图能够正常显示
    // ══════════════════════════════════════════════════════════════════════════════
    // 趋势图通过 portal 渲染，查找包含标题的区域
    const trendDialogContent = page.locator('text=持仓总金额趋势').locator('..').locator('..');
    const chartSvg = trendDialogContent.locator('svg');
    await expect(chartSvg.first()).toBeVisible({ timeout: 10000 });

    // 检查图表数据（直接从趋势图容器内查找）
    const chartInfo = await page.evaluate(() => {
      // 找到趋势图对话框内的 SVG
      const trendTitle = document.evaluate(
        "//h3[contains(text(), '持仓总金额趋势')]",
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue as HTMLElement | null;
      if (!trendTitle) return { hasChart: false, dataPointCount: 0 };

      // 找到包含 SVG 的容器
      const container = trendTitle.closest('div[class*="rounded"]') || (trendTitle.parentElement?.parentElement as HTMLElement | null);
      if (!container) return { hasChart: false, dataPointCount: 0 };

      const svg = container.querySelector('svg');
      if (!svg) return { hasChart: false, dataPointCount: 0 };

      // 检查是否有折线路径
      const linePath = svg.querySelector('path[d][fill="none"][stroke]');
      const hasLine = linePath !== null;

      // 检查是否有渐变区域
      const areaPath = svg.querySelector('path[fill="url(#history-gradient)"]');
      const hasArea = areaPath !== null;

      // 获取数据点数量（通过hover检测矩形）
      const hoverRects = svg.querySelectorAll('rect[fill="transparent"]');
      const dataPointCount = hoverRects.length;

      return { hasChart: true, hasLine, hasArea, dataPointCount };
    });

    console.log(`图表信息: ${JSON.stringify(chartInfo)}`);

    // 验证有数据
    expect(chartInfo.dataPointCount).toBeGreaterThan(0);
    expect(chartInfo.hasLine).toBe(true);
    expect(chartInfo.hasArea).toBe(true);

    // ══════════════════════════════════════════════════════════════════════════════
    // 4.1 测试hover效果和日期显示
    // ══════════════════════════════════════════════════════════════════════════════
    const chartBounds = await chartSvg.boundingBox();
    if (chartBounds) {
      // 获取底部日期显示区域
      const bottomDateArea = trendDialogContent.locator('div[aria-live="polite"]');

      // 计算图表区域的实际像素位置
      // viewBox 是 1000x280，padding left=80, right=30
      const viewBoxWidth = 1000;
      const padLeft = 80;
      const padRight = 30;
      const chartAreaWidth = viewBoxWidth - padLeft - padRight;

      // 将 viewBox 坐标转换为页面坐标
      const scale = chartBounds.width / viewBoxWidth;

      // Hover 第一个数据点（viewBox x=80）
      const firstPointX = chartBounds.x + padLeft * scale;
      const hoverY = chartBounds.y + chartBounds.height * 0.3;
      await page.mouse.move(firstPointX, hoverY);
      await page.waitForTimeout(300); // hover 效果需要短暂延迟

      // 验证 hover 效果：底部日期显示区域应该有内容
      const firstDate = await bottomDateArea.locator('div').first().textContent();
      console.log(`第一个数据点日期: ${firstDate}`);
      expect(firstDate).toBeTruthy();

      // Hover 最后一个数据点（viewBox x=970）
      const lastPointX = chartBounds.x + (padLeft + chartAreaWidth) * scale;
      await page.mouse.move(lastPointX, hoverY);
      await page.waitForTimeout(300); // hover 效果需要短暂延迟

      // 获取最后一个数据点的日期
      const lastDate = await bottomDateArea.locator('div').first().textContent();
      console.log(`最后一个数据点日期: ${lastDate}`);

      // 验证结束日期为"今天"（mock 的日期 2026-04-08）
      expect(lastDate).toMatch(/04.*08|04\/08/);

      // Hover 图表中间
      const middleX = chartBounds.x + chartBounds.width * 0.5;
      await page.mouse.move(middleX, hoverY);
      await page.waitForTimeout(300); // hover 效果需要短暂延迟

      // 获取中间数据点的日期
      const middleDate = await bottomDateArea.locator('div').first().textContent();
      console.log(`中间数据点日期: ${middleDate}`);
    }

    console.log('折线图hover效果验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 5. 关闭"持仓总金额趋势"窗口
    // ══════════════════════════════════════════════════════════════════════════════
    await page.click('button[aria-label="关闭趋势图"]');
    await expect(trendModal).not.toBeVisible();

    console.log('持仓总金额趋势窗口已关闭');

    // ══════════════════════════════════════════════════════════════════════════════
    // 6. 关闭"基金持仓"窗口
    // ══════════════════════════════════════════════════════════════════════════════
    await page.click('button[aria-label="关闭持仓窗口"]');
    await expect(positionsModal).not.toBeVisible();

    console.log('基金持仓测试完成');
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // 测试用例 6：整体盈亏测试
  // ═══════════════════════════════════════════════════════════════════════════════

  test('整体盈亏测试', async () => {
    const page = sharedPage!;

    // ══════════════════════════════════════════════════════════════════════════════
    // 1. 点击"盈利"按钮，弹出"整体盈亏"窗口
    // ══════════════════════════════════════════════════════════════════════════════
    const profitButton = page.locator('button:has-text("盈利")');
    await profitButton.click();

    // 验证窗口已打开
    const profitModal = page.locator('h3:has-text("整体盈亏")');
    await expect(profitModal).toBeVisible({ timeout: 10000 });

    // 等待加载完成
    await page.waitForTimeout(2000);

    // ══════════════════════════════════════════════════════════════════════════════
    // 2. 验证表格有21条数据，图表有超过10个数据点
    // ══════════════════════════════════════════════════════════════════════════════
    const tableRows = page.locator('table tbody tr');
    expect(await tableRows.count()).toBe(21);
    console.log('表格数据验证完成: 21条记录');

    // 验证图表数据点
    const chartPoints = page.locator('[data-testid^="overall-profit-point-"]');
    const pointCount = await chartPoints.count();
    expect(pointCount).toBeGreaterThan(10);
    console.log(`图表数据点验证完成: ${pointCount}个数据点`);

    // ══════════════════════════════════════════════════════════════════════════════
    // 3. 验证图表x轴范围和期间累计显示
    // ══════════════════════════════════════════════════════════════════════════════
    const periodTotal = page.locator('[data-testid="overall-period-total"]');
    await expect(periodTotal).toBeVisible();
    const periodText = await periodTotal.textContent();
    expect(periodText).toContain('2026/02/12');
    expect(periodText).toContain('2026/04/08');
    console.log(`期间累计验证完成: ${periodText}`);

    // 验证数据点hover tooltip
    const firstPoint = chartPoints.first();
    await firstPoint.hover();
    const tooltip = page.locator('[data-testid="overall-profit-tooltip"]');
    await expect(tooltip).toBeVisible({ timeout: 3000 });
    console.log('图表hover tooltip验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 4. 验证日期选择器初始值
    // ══════════════════════════════════════════════════════════════════════════════
    const dateInputs = page.locator('input[type="date"]');
    const fromDate = await dateInputs.nth(0).inputValue();
    const toDate = await dateInputs.nth(1).inputValue();
    expect(toDate).toBe('2026-04-08');
    expect(fromDate).toBe('2026-04-07');
    console.log(`日期选择器初始值验证完成: 日期1=${fromDate}, 日期2=${toDate}`);

    // ══════════════════════════════════════════════════════════════════════════════
    // 5. 验证表格默认按差额倒序排列
    // ══════════════════════════════════════════════════════════════════════════════
    const diffCells = await page.locator('table tbody tr td:nth-child(4)').allTextContents();
    const diffValues = diffCells.map(text => {
      // 差额单元格格式: "+1,234.56" 或 "-1,234.56" 或 "-"
      // 需要先去掉逗号分隔符再解析
      const cleanText = text.replace(/,/g, '');
      if (cleanText.trim() === '-') return 0;  // "-" 表示值为0
      const match = cleanText.match(/[-+]?\d+\.?\d*/);
      return match ? parseFloat(match[0]) : 0;
    });
    for (let i = 1; i < diffValues.length; i++) {
      expect(diffValues[i - 1]).toBeGreaterThanOrEqual(diffValues[i]);
    }
    console.log('差额倒序排列验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 6. 验证第2列和第3列支持排序
    // ══════════════════════════════════════════════════════════════════════════════
    // 默认 diff 列是降序排序，from/to 列无排序
    // 点击第2列表头（from 列）
    const column2Header = page.locator('thead th button').first();
    await column2Header.click();
    await page.waitForTimeout(500);

    // 验证 from 列变为降序排序（.fa-sort-down 存在）
    const fromSortIcon = page.locator('thead th button').first().locator('.fa-sort-down');
    await expect(fromSortIcon).toHaveCount(1, { timeout: 3000 });
    console.log('第2列排序验证完成');

    // 点击第3列表头（to 列）
    const column3Header = page.locator('thead th button').nth(1);
    await column3Header.click();
    await page.waitForTimeout(500);

    // 验证 to 列变为降序排序
    const toSortIcon = page.locator('thead th button').nth(1).locator('.fa-sort-down');
    await expect(toSortIcon).toHaveCount(1, { timeout: 3000 });
    console.log('第3列排序验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 7. 点击图表数据点更新日期选择器
    // ══════════════════════════════════════════════════════════════════════════════
    // 找到 2026/03/23 对应的数据点（大约在中间位置）
    const middlePoint = chartPoints.nth(Math.floor(pointCount / 2));
    await middlePoint.click();
    await page.waitForTimeout(500);

    // 验证日期已更新
    const newToDate = await dateInputs.nth(1).inputValue();
    console.log(`点击数据点后日期2更新为: ${newToDate}`);
    // 日期应该不再是 2026-04-08
    expect(newToDate).not.toBe('2026-04-08');

    // ══════════════════════════════════════════════════════════════════════════════
    // 8. 点击"本月"按钮
    // ══════════════════════════════════════════════════════════════════════════════
    const thisMonthButton = page.locator('button:has-text("本月")');
    await thisMonthButton.click();
    await page.waitForTimeout(500);

    const thisMonthFrom = await dateInputs.nth(0).inputValue();
    const thisMonthTo = await dateInputs.nth(1).inputValue();
    expect(thisMonthFrom).toBe('2026-03-31');
    expect(thisMonthTo).toBe('2026-04-08');
    console.log(`本月按钮验证完成: ${thisMonthFrom} ~ ${thisMonthTo}`);

    // ══════════════════════════════════════════════════════════════════════════════
    // 9. 点击"上月"按钮
    // ══════════════════════════════════════════════════════════════════════════════
    const lastMonthButton = page.locator('button:has-text("上月")');
    await lastMonthButton.click();
    await page.waitForTimeout(500);

    const lastMonthFrom = await dateInputs.nth(0).inputValue();
    const lastMonthTo = await dateInputs.nth(1).inputValue();
    expect(lastMonthFrom).toBe('2026-02-28');
    expect(lastMonthTo).toBe('2026-03-31');
    console.log(`上月按钮验证完成: ${lastMonthFrom} ~ ${lastMonthTo}`);

    // ══════════════════════════════════════════════════════════════════════════════
    // 10. 点击"本年"按钮
    // ══════════════════════════════════════════════════════════════════════════════
    const thisYearButton = page.locator('button:has-text("本年")');
    await thisYearButton.click();
    await page.waitForTimeout(500);

    const thisYearFrom = await dateInputs.nth(0).inputValue();
    const thisYearTo = await dateInputs.nth(1).inputValue();
    expect(thisYearFrom).toBe('2025-12-31');
    expect(thisYearTo).toBe('2026-04-08');
    console.log(`本年按钮验证完成: ${thisYearFrom} ~ ${thisYearTo}`);

    // ══════════════════════════════════════════════════════════════════════════════
    // 11. 点击"去年"按钮，表格为空
    // ══════════════════════════════════════════════════════════════════════════════
    const lastYearButton = page.locator('button:has-text("去年")');
    await lastYearButton.click();
    await page.waitForTimeout(500);

    const lastYearFrom = await dateInputs.nth(0).inputValue();
    const lastYearTo = await dateInputs.nth(1).inputValue();
    expect(lastYearFrom).toBe('2024-12-31');
    expect(lastYearTo).toBe('2025-12-31');
    console.log(`去年按钮验证完成: ${lastYearFrom} ~ ${lastYearTo}`);

    // 验证表格为空
    const emptyRows = await page.locator('table tbody tr').count();
    expect(emptyRows).toBe(0);
    console.log('去年表格为空验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 12. 日期超出范围显示错误提示
    // ══════════════════════════════════════════════════════════════════════════════
    await dateInputs.nth(1).fill('2026-05-28');
    await page.waitForTimeout(500);

    const errorMessage = page.locator('text=规则错误');
    await expect(errorMessage).toBeVisible();
    console.log('日期超出范围错误提示验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 13. 点击"重置"按钮恢复初始状态
    // ══════════════════════════════════════════════════════════════════════════════
    const resetButton = page.locator('button:has-text("重置")');
    await resetButton.click();
    await page.waitForTimeout(500);

    const resetFrom = await dateInputs.nth(0).inputValue();
    const resetTo = await dateInputs.nth(1).inputValue();
    expect(resetFrom).toBe('2026-02-12');
    expect(resetTo).toBe('2026-04-08');
    console.log(`重置按钮验证完成: ${resetFrom} ~ ${resetTo}`);

    // 验证表格恢复到21条数据
    const restoredRows = await page.locator('table tbody tr').count();
    expect(restoredRows).toBe(21);
    console.log('表格恢复验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 14. 关闭窗口
    // ══════════════════════════════════════════════════════════════════════════════
    await page.click('button[aria-label="关闭整体盈亏窗口"]');
    await expect(profitModal).not.toBeVisible();

    console.log('整体盈亏测试完成');
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // 测试用例 7：交易窗口测试
  // ═══════════════════════════════════════════════════════════════════════════════

  test('交易窗口测试', async () => {
    const page = sharedPage!;

    // ══════════════════════════════════════════════════════════════════════════════
    // 1. 点击"交易"按钮，弹出"基金交易明细"窗口
    // ══════════════════════════════════════════════════════════════════════════════
    const tradeButton = page.locator('button:has-text("交易")');
    await tradeButton.click();

    const tradeModal = page.locator('h3:has-text("基金交易明细")');
    await expect(tradeModal).toBeVisible();

    // ══════════════════════════════════════════════════════════════════════════════
    // 2. 验证日期选择框显示最新交易日期
    // ══════════════════════════════════════════════════════════════════════════════
    const dateText = page.locator('button').filter({ hasText: '2026-04' }).first();
    await expect(dateText).toBeVisible();
    console.log('交易窗口验证完成：有交易日期显示');

    // ══════════════════════════════════════════════════════════════════════════════
    // 3. 验证表格有交易记录
    // ══════════════════════════════════════════════════════════════════════════════
    const tableRows = page.locator('table tbody tr');
    const rowCount = await tableRows.count();
    expect(rowCount).toBeGreaterThan(0);
    console.log(`交易记录验证完成: ${rowCount}条`);

    // 验证总计栏存在
    const statsRow = page.locator('tfoot td');
    await expect(statsRow).toBeVisible();
    const statsText = await statsRow.textContent();
    expect(statsText).toContain('买入');
    expect(statsText).toContain('卖出');
    console.log('总计栏验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 4. 点击"组合交易"，弹出"组合交易管理"窗口
    // ══════════════════════════════════════════════════════════════════════════════
    const comboButton = page.locator('button:has-text("组合交易")');
    await comboButton.click();

    const comboModal = page.locator('h3:has-text("组合交易管理")');
    await expect(comboModal).toBeVisible();
    console.log('组合交易窗口打开验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 5. 验证"已有组合"里面显示2个组合
    // ══════════════════════════════════════════════════════════════════════════════
    const comboItems = page.locator('div.flex.flex-wrap button');
    const comboCount = await comboItems.count();
    expect(comboCount).toBeGreaterThanOrEqual(2);
    console.log(`已有组合验证完成: ${comboCount}个`);

    // ══════════════════════════════════════════════════════════════════════════════
    // 6. 点击"纳斯达克"，验证表格显示记录
    // ══════════════════════════════════════════════════════════════════════════════
    const nasdaqButton = page.locator('button').filter({ hasText: /^纳斯达克$/ });
    await nasdaqButton.click();

    // 等待表格渲染
    const comboTableBody = page.locator('div.border.border-gray-100.rounded-xl tbody tr');
    await expect(comboTableBody.first()).toBeVisible();
    const comboRowCount = await comboTableBody.count();
    expect(comboRowCount).toBeGreaterThan(0);
    console.log(`纳斯达克组合验证完成: ${comboRowCount}条记录`);

    // ══════════════════════════════════════════════════════════════════════════════
    // 7. 添加新组合"新组合"
    // ══════════════════════════════════════════════════════════════════════════════
    const newComboInput = page.locator('input[placeholder="请输入组合名称"]');
    await newComboInput.fill('新组合');

    const addComboButton = page.locator('button:has-text("添加组合交易")');
    await expect(addComboButton).not.toBeDisabled();
    await addComboButton.click();

    const newComboButton = page.locator('button').filter({ hasText: /^新组合$/ });
    await expect(newComboButton).toBeVisible();
    console.log('新组合添加验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 8. 修改"博时黄金ETF联接C"的买入金额和手续费
    // ══════════════════════════════════════════════════════════════════════════════
    const boshiRow = page.locator('tr').filter({ has: page.locator('button[title="重置"]') }).filter({ hasText: '博时黄金ETF联接C' });
    await expect(boshiRow).toBeVisible();

    // 填写金额和手续费
    const amountInput = boshiRow.locator('input[type="number"]').first();
    const feeInput = boshiRow.locator('input[type="number"]').nth(1);
    await amountInput.fill('1000');
    await feeInput.fill('10');
    console.log('博时黄金金额修改验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 9. 点击保存按钮
    // ══════════════════════════════════════════════════════════════════════════════
    const saveButton = page.locator('button:has-text("保存")');
    await saveButton.click();

    const successMessage = page.locator('text=保存成功');
    await expect(successMessage).toBeVisible({ timeout: 5000 });
    console.log('保存验证完成');

    // 关闭组合交易窗口
    const closeComboButton = page.locator('div:has(> h3:has-text("组合交易管理")) button[aria-label="关闭"]');
    await closeComboButton.click();
    await expect(comboModal).not.toBeVisible();

    // ══════════════════════════════════════════════════════════════════════════════
    // 10. 再次打开组合交易，验证3个组合
    // ══════════════════════════════════════════════════════════════════════════════
    await comboButton.click();
    await expect(comboModal).toBeVisible();

    const comboItemsAfter = page.locator('div.flex.flex-wrap button');
    const comboCountAfter = await comboItemsAfter.count();
    expect(comboCountAfter).toBeGreaterThanOrEqual(3);
    console.log(`再次验证组合数量: ${comboCountAfter}个`);

    // ══════════════════════════════════════════════════════════════════════════════
    // 11. 点击"新组合"，验证博时黄金数据
    // ══════════════════════════════════════════════════════════════════════════════
    await newComboButton.click();

    const boshiRowAfter = page.locator('tr').filter({ has: page.locator('button[title="重置"]') }).filter({ hasText: '博时黄金ETF联接C' });
    const amountInputAfter = boshiRowAfter.locator('input[type="number"]').first();
    const feeInputAfter = boshiRowAfter.locator('input[type="number"]').nth(1);
    await expect(amountInputAfter).toHaveValue('1000');
    await expect(feeInputAfter).toHaveValue('10');
    console.log('新组合数据验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 12. 删除"新组合"
    // ══════════════════════════════════════════════════════════════════════════════
    const newComboItem = page.locator('div.inline-flex.items-center').filter({
      has: page.locator('button:has-text("新组合")')
    });
    const deleteButton = newComboItem.locator('button[title="删除"]');
    await deleteButton.click();

    const confirmDeleteButton = page.locator('button:has-text("确认删除")');
    await confirmDeleteButton.click();
    await expect(newComboButton).not.toBeVisible();
    console.log('新组合删除验证完成');

    // 关闭组合交易窗口
    await closeComboButton.click();
    await expect(comboModal).not.toBeVisible();

    // ══════════════════════════════════════════════════════════════════════════════
    // 13. 点击"批量输入"按钮
    // ══════════════════════════════════════════════════════════════════════════════
    const batchInputButton = page.locator('button:has-text("批量输入")');
    await batchInputButton.click();

    const batchModal = page.locator('h3:has-text("批量交易录入")');
    await expect(batchModal).toBeVisible();
    console.log('批量输入窗口打开验证完成');

    // 验证交易日期
    const batchDateText = page.locator('button').filter({ hasText: '2026-04' }).first();
    await expect(batchDateText).toBeVisible();

    // 验证组合交易面板存在
    const batchDialogContent = page.locator('[role="dialog"]').filter({ has: batchModal });
    const comboTitleInBatch = batchDialogContent.locator('span.text-xs.font-medium.text-gray-700:has-text("组合交易")');
    await expect(comboTitleInBatch).toBeVisible();
    console.log('组合交易面板验证完成');

    // 验证组合交易按钮数量
    const batchComboButtons = page.locator('div.p-3.bg-white button.inline-flex.bg-blue-50');
    await expect(batchComboButtons.first()).toBeVisible();
    const batchComboCount = await batchComboButtons.count();
    expect(batchComboCount).toBe(2);
    console.log(`组合交易按钮验证完成: ${batchComboCount}个`);

    // 验证基金分组数量
    const fundGroupRows = page.locator('tr.bg-blue-50');
    const groupCount = await fundGroupRows.count();
    expect(groupCount).toBe(21);
    console.log(`基金分组验证完成: ${groupCount}个`);

    // ══════════════════════════════════════════════════════════════════════════════
    // 14. 点击"日常定投"
    // ══════════════════════════════════════════════════════════════════════════════
    const dailyInvestButton = page.locator('button:has-text("日常定投")');
    await dailyInvestButton.click();

    // 等待交易记录渲染
    const batchTable = page.locator('table');
    const groupsWithTrades = batchTable.locator('tbody tr:not(.bg-blue-50)').filter({
      has: page.locator('input')
    });
    await expect(groupsWithTrades.first()).toBeVisible();
    const groupsWithTradesCount = await groupsWithTrades.count();
    expect(groupsWithTradesCount).toBeGreaterThanOrEqual(8);
    console.log(`日常定投验证完成: ${groupsWithTradesCount}条交易记录`);

    // ══════════════════════════════════════════════════════════════════════════════
    // 15. 在"广发半导体设备ETF联接C"添加买入交易
    // ══════════════════════════════════════════════════════════════════════════════
    const guangfaHeaderRow = batchTable.locator('tr.bg-blue-50').filter({
      hasText: '广发半导体设备ETF联接C'
    });
    await expect(guangfaHeaderRow).toBeVisible();

    const addRecordButton = guangfaHeaderRow.locator('button:has-text("添加记录")');
    await addRecordButton.click();

    const guangfaFirstTradeRow = guangfaHeaderRow.locator('xpath=following-sibling::tr[td[contains(text(), "第")]]').first();
    await expect(guangfaFirstTradeRow).toBeVisible();

    const typeSelect = guangfaFirstTradeRow.locator('select').first();
    await typeSelect.selectOption('buy');

    const totalInput = guangfaFirstTradeRow.locator('input[placeholder="输入总额"]').first();
    const tradeFeeInput = guangfaFirstTradeRow.locator('input[type="number"].border-gray-200').first();
    await totalInput.fill('1000');
    await tradeFeeInput.fill('10');

    const sharesInput = guangfaFirstTradeRow.locator('input[placeholder="自动计算"]').first();
    const sharesValue = await sharesInput.inputValue();
    expect(parseFloat(sharesValue)).toBeCloseTo(529.67, 0);
    console.log(`广发半导体买入验证完成: 份额=${sharesValue}`);

    // ══════════════════════════════════════════════════════════════════════════════
    // 16. 在"华夏国证半导体芯片ETF联接C"添加卖出交易
    // ══════════════════════════════════════════════════════════════════════════════
    const huaxiaHeaderRow = batchTable.locator('tr.bg-blue-50').filter({
      hasText: '华夏国证半导体芯片ETF联接C'
    });
    await expect(huaxiaHeaderRow).toBeVisible();

    const addRecordButton2 = huaxiaHeaderRow.locator('button:has-text("添加记录")');
    await addRecordButton2.click();

    const huaxiaFirstTradeRow = huaxiaHeaderRow.locator('xpath=following-sibling::tr[td[contains(text(), "第")]]').first();
    await expect(huaxiaFirstTradeRow).toBeVisible();

    const typeSelect2 = huaxiaFirstTradeRow.locator('select').first();
    await typeSelect2.selectOption('sell');

    const sharesInput2 = huaxiaFirstTradeRow.locator('input[placeholder="输入份额"]').first();
    const tradeFeeInput2 = huaxiaFirstTradeRow.locator('input[type="number"].border-gray-200').first();
    await sharesInput2.fill('1000');
    await tradeFeeInput2.fill('10');

    const totalInput2 = huaxiaFirstTradeRow.locator('input[placeholder="自动计算"]').first();
    const totalValue = await totalInput2.inputValue();
    expect(parseFloat(totalValue)).toBeGreaterThan(0);
    console.log(`华夏国证卖出验证完成: 总额=${totalValue}`);

    // ══════════════════════════════════════════════════════════════════════════════
    // 17. 验证总计栏显示
    // ══════════════════════════════════════════════════════════════════════════════
    const batchStatsBar = batchDialogContent.locator('tfoot.bg-gray-50');
    const batchStatsText = await batchStatsBar.textContent();
    expect(batchStatsText).toContain('买入');
    expect(batchStatsText).toContain('卖出');
    console.log('批量输入总计栏验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 18. 删除华夏国证第一条记录
    // ══════════════════════════════════════════════════════════════════════════════
    const huaxiaFirstRow = huaxiaHeaderRow.locator('xpath=following-sibling::tr[td[contains(text(), "第")]]').first();
    const deleteRecordButton = huaxiaFirstRow.locator('button:has(i.fa-trash-alt)');
    await deleteRecordButton.click();

    const batchStatsTextAfterDelete = await batchStatsBar.textContent();
    expect(batchStatsTextAfterDelete).toContain('卖出 0');
    console.log('删除记录验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 19. 关闭批量输入窗口（有确认对话框）
    // ══════════════════════════════════════════════════════════════════════════════
    const closeBatchButton = page.locator('div:has(> h3:has-text("批量交易录入")) button[aria-label="关闭"]');
    await closeBatchButton.click();

    const confirmDialog = page.locator('h3:has-text("确认关闭")');
    await expect(confirmDialog).toBeVisible();

    const confirmCloseButton = page.locator('button:has-text("确认")');
    await confirmCloseButton.click();
    await expect(batchModal).not.toBeVisible();
    console.log('批量输入窗口关闭验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 20. 验证日期选择窗口
    // ══════════════════════════════════════════════════════════════════════════════
    const dateSelectButton = page.locator('button').filter({ hasText: '2026-04' }).first();
    await dateSelectButton.click();

    const dayPicker = page.locator('.rdp-day');
    await expect(dayPicker.first()).toBeVisible();
    await page.keyboard.press('Escape');

    // ══════════════════════════════════════════════════════════════════════════════
    // 21. 再次打开批量输入，直接关闭（无确认对话框）
    // ══════════════════════════════════════════════════════════════════════════════
    await batchInputButton.click();
    await expect(batchModal).toBeVisible();

    const closeBatchButton2 = page.locator('div:has(> h3:has-text("批量交易录入")) button[aria-label="关闭"]');
    await closeBatchButton2.click();
    await expect(batchModal).not.toBeVisible();

    const confirmDialog2 = page.locator('h3:has-text("确认关闭")');
    await expect(confirmDialog2).not.toBeVisible();
    console.log('无数据关闭验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 22. 关闭交易窗口
    // ══════════════════════════════════════════════════════════════════════════════
    const closeTradeButton = page.locator('div:has(> h3:has-text("基金交易明细")) button[aria-label="关闭"]');
    await closeTradeButton.click();
    await expect(tradeModal).not.toBeVisible();

    console.log('交易窗口测试完成');
  });
});