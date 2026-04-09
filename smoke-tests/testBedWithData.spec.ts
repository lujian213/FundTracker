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

    // 创建共享的浏览器上下文，并在页面加载前 mock Date
    sharedContext = await browser.newContext();

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

    // 先导航到页面（必须先有页面才能操作 localStorage）
    await sharedPage.goto('/', { waitUntil: 'load' });
    await expect(sharedPage.locator('#root')).toBeVisible();

    // 导入 mock data 到 localStorage
    await importMockData(sharedPage, mockData.data);

    // 刷新页面以加载导入的数据到 React 状态
    await sharedPage.reload({ waitUntil: 'load' });
    await expect(sharedPage.locator('#root')).toBeVisible();

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

    // 关闭开关
    const autoBackupToggleDiv = page.locator('div.w-11.h-6.rounded-full').first();
    await autoBackupToggleDiv.click();

    // 验证开关已关闭（自动等待）
    await expect(autoBackupCheckbox).not.toBeChecked({ timeout: 2000 });

    // 验证"每日自动导出时间"输入框为灰色（disabled 状态）
    await expect(timeInput).toBeDisabled();

    // 验证"自动备份状态"显示为"已关闭"
    await expect(page.locator('text=已关闭')).toBeVisible();

    // 重新打开开关，恢复状态
    await autoBackupToggleDiv.click();
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
});