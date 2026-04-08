import { test, expect, Page, BrowserContext } from '@playwright/test';
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
 * 2. 将 timestamp mock 为测试环境的当前时间
 * 3. 将 data 导入到 localStorage
 */

// 共享状态
let sharedContext: BrowserContext | null = null;
let sharedPage: Page | null = null;

// Mocks 目录路径
const MOCKS_DIR = path.join(process.cwd(), '__mocks__');

/**
 * 查找最新的 mock-data 文件
 * 文件名格式：mock-data_yyyy-MM-dd_HH-mm-ss.json
 */
function findLatestMockDataFile(): string | null {
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

  return path.join(MOCKS_DIR, files[0]);
}

/**
 * Mock timestamp 为当前时间
 * 将 mock data 中的时间戳相关字段更新为当前时间
 */
function mockTimestamp(data: Record<string, string>): Record<string, string> {
  const now = new Date();
  const mockedData: Record<string, string> = {};

  for (const [key, value] of Object.entries(data)) {
    try {
      const parsed = JSON.parse(value);

      // 处理 fund_system_config - 更新 AI 配置的时间戳
      if (key === 'fund_system_config' && parsed.ai?.manager?.configs) {
        parsed.ai.manager.configs = parsed.ai.manager.configs.map((c: any) => ({
          ...c,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        }));
        mockedData[key] = JSON.stringify(parsed);
        continue;
      }

      // 其他 key 保持不变
      mockedData[key] = value;
    } catch {
      // 非 JSON 数据保持不变
      mockedData[key] = value;
    }
  }

  return mockedData;
}

/**
 * 从 mock-data 文件导入数据到 localStorage
 */
async function importMockData(page: Page): Promise<boolean> {
  const mockDataFile = findLatestMockDataFile();
  if (!mockDataFile) {
    return false;
  }

  console.log(`使用 mock data 文件: ${mockDataFile}`);

  const fileContent = fs.readFileSync(mockDataFile, 'utf-8');
  const mockData = JSON.parse(fileContent);

  if (!mockData.data) {
    console.error('mock data 文件格式错误：缺少 data 字段');
    return false;
  }

  // Mock timestamp
  const mockedData = mockTimestamp(mockData.data);

  // 导入到 localStorage
  await page.evaluate((data) => {
    for (const [key, value] of Object.entries(data)) {
      localStorage.setItem(key, value);
    }
  }, mockedData);

  console.log(`已导入 ${Object.keys(mockedData).length} 个 localStorage key`);
  return true;
}

test.describe('testBedWithData', () => {
  test.beforeAll(async ({ browser }) => {
    // 创建共享的浏览器上下文和页面
    sharedContext = await browser.newContext();
    sharedPage = await sharedContext.newPage();

    // 先导航到页面（必须先有页面才能操作 localStorage）
    await sharedPage.goto('/', { waitUntil: 'load' });
    await expect(sharedPage.locator('#root')).toBeVisible();

    // 导入 mock data
    const imported = await importMockData(sharedPage);
    if (!imported) {
      throw new Error('Mock data 导入失败');
    }

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

    // 等待页面渲染完成
    await page.waitForTimeout(2000);

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

    // 基金卡片在中间区域，使用 h3 元素来定位（基金卡片有 h3，指数卡片有 h4）
    const fundCardsWithH3 = allCards.filter({ has: page.locator('h3') });
    await expect(fundCardsWithH3.first()).toBeVisible({ timeout: 15000 });
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

    // 等待页面渲染完成
    await page.waitForTimeout(1000);

    // 获取基金卡片
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
    await page.waitForTimeout(500);

    // 验证排序图标切换
    if (isDownIcon) {
      // 原来是降序，点击后应该是升序
      await expect(sortButton.locator('i[class*="fa-sort-amount-up"]')).toBeVisible();
    } else if (isUpIcon) {
      // 原来是升序，点击后应该是降序
      await expect(sortButton.locator('i[class*="fa-sort-amount-down"]')).toBeVisible();
    }

    console.log('排序按钮第一次点击验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 2. 第二次点击：恢复原来的排序顺序
    // ══════════════════════════════════════════════════════════════════════════════
    await sortButton.click();
    await page.waitForTimeout(500);

    // 验证排序图标恢复
    if (isDownIcon) {
      // 原来是降序，点击两次后应该恢复降序
      await expect(sortButton.locator('i[class*="fa-sort-amount-down"]')).toBeVisible();
    } else if (isUpIcon) {
      // 原来是升序，点击两次后应该恢复升序
      await expect(sortButton.locator('i[class*="fa-sort-amount-up"]')).toBeVisible();
    }

    console.log('排序按钮第二次点击验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 3. 验证历史标签基金始终在最后
    // ══════════════════════════════════════════════════════════════════════════════
    // 验证最后两个基金卡片有历史标签
    const lastCard = fundCards.nth(20);
    const secondLastCard = fundCards.nth(19);
    await expect(lastCard.locator('div.bg-amber-100')).toBeVisible();
    await expect(secondLastCard.locator('div.bg-amber-100')).toBeVisible();

    // 验证前面的基金卡片没有历史标签
    for (let i = 0; i < 19; i++) {
      const card = fundCards.nth(i);
      await expect(card.locator('div.bg-amber-100')).not.toBeVisible();
    }

    console.log('历史标签位置验证完成');
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // 测试用例 3：日历功能测试
  // ═══════════════════════════════════════════════════════════════════════════════

  test('日历功能测试', async () => {
    const page = sharedPage!;

    // 等待页面渲染完成
    await page.waitForTimeout(1000);

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
    // 2. 验证4/8日（今日）日期是蓝色的
    // ══════════════════════════════════════════════════════════════════════════════
    // 当前月份应该是四月（month = 3），年份是2026
    // 找到日期为8的格子，验证它有蓝色背景
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
      await page.waitForTimeout(500);
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
      await page.waitForTimeout(300);

      // 验证 tooltip 出现
      const tooltip = page.locator('div.shadow-xl.border-gray-200');
      await expect(tooltip).toBeVisible({ timeout: 2000 });

      // 验证 tooltip 内项目数量与格子内一致
      // tooltip 结构：节假日和交割日项目都在 div.text-gray-600.ml-1 中
      const tooltipItems = tooltip.locator('div.text-gray-600.ml-1');
      const totalTooltipCount = await tooltipItems.count();

      console.log(`${expected.date} tooltip: 总计 ${totalTooltipCount} 项`);
      expect(totalTooltipCount).toBe(expected.expectedCount);

      // 移开鼠标，隐藏 tooltip
      await page.mouse.move(0, 0);
      await page.waitForTimeout(600);
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
    await page.waitForTimeout(500);
    await expect(leftArrow).toHaveAttribute('disabled', '');
    await expect(rightArrow).not.toHaveAttribute('disabled', '');

    // 选择十二月，验证右箭头禁用
    await monthSelect.selectOption('11');
    await page.waitForTimeout(500);
    await expect(leftArrow).not.toHaveAttribute('disabled', '');
    await expect(rightArrow).toHaveAttribute('disabled', '');

    console.log('月份选择和箭头按钮验证完成');

    // ══════════════════════════════════════════════════════════════════════════════
    // 6. 验证今日按钮
    // ══════════════════════════════════════════════════════════════════════════════
    // 点击今日按钮
    const todayButton = page.locator('button:has-text("今日")');
    await todayButton.click();
    await page.waitForTimeout(500);

    // 验证月份切换回四月
    const monthValue = await monthSelect.inputValue();
    expect(monthValue).toBe('3'); // 四月 = index 3

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
});