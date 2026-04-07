import { test, expect, Page, BrowserContext } from '@playwright/test';
import path from 'path';

/**
 * 投资草稿窗口集成测试
 *
 * 优化策略：
 * 1. 共享浏览器上下文，避免重复加载
 * 2. 用精确等待替代固定超时
 * 3. 减少不必要的等待
 */

// 共享状态
let sharedContext: BrowserContext | null = null;
let isBackupImported = false;

// 导入备份文件的辅助函数
async function importBackupFile(page: Page) {
  if (isBackupImported) return;  // 已导入则跳过

  // 打开主页，使用 load 替代 networkidle
  await page.goto('/', { waitUntil: 'load' });

  // 等待页面基本元素出现（比 networkidle 更快）
  await expect(page.locator('#root')).toBeVisible();

  // 点击系统配置按钮
  await page.click('button[title="系统配置"]');
  await expect(page.locator('button:has-text("导入备份")')).toBeVisible();

  // 准备上传备份文件
  const backupFilePath = path.join(process.cwd(), '__mocks__', 'fund_backup_2026-04-06_12-50-51.json');

  // 点击导入备份按钮
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('button:has-text("导入备份")'),
  ]);
  await fileChooser.setFiles(backupFilePath);

  // 等待确认对话框并点击
  const confirmDialog = page.locator('[role="dialog"]:has-text("导入确认")');
  await expect(confirmDialog).toBeVisible({ timeout: 5000 });
  await confirmDialog.locator('button:has-text("确认导入")').click();

  // 等待导入完成（检测 localStorage 变化）
  await page.waitForFunction(() => {
    const fundsRaw = localStorage.getItem('fund_all_funds_data');
    if (!fundsRaw) return false;
    const funds = JSON.parse(fundsRaw);
    return funds.length === 21;
  }, { timeout: 5000 });

  // 关闭系统配置窗口
  const closeConfigButton = page.locator('[role="dialog"] button[aria-label="关闭"]');
  if (await closeConfigButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeConfigButton.click();
  }

  // 刷新页面以加载导入的数据到 React 状态
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#root')).toBeVisible();

  isBackupImported = true;
}

test.describe('投资草稿窗口集成测试', () => {
  test.beforeAll(async ({ browser }) => {
    // 创建共享的浏览器上下文
    sharedContext = await browser.newContext();
  });

  test.afterAll(async () => {
    await sharedContext?.close();
    sharedContext = null;
    isBackupImported = false;
  });

  test.beforeEach(async () => {
    // 每个 test 使用共享上下文的新页面
    if (!sharedContext) throw new Error('Context not initialized');
  });

  test('草稿数据持久化：输入买卖操作后退出重入数据仍存在', async ({ browser }) => {
    const page = await sharedContext!.newPage();

    try {
      // 导入备份文件
      await importBackupFile(page);

      // 验证数据已加载
      const fundCount = await page.evaluate(() => {
        const fundsRaw = localStorage.getItem('fund_all_funds_data');
        return fundsRaw ? JSON.parse(fundsRaw).length : 0;
      });
      expect(fundCount).toBe(21);

      // 点击草稿按钮打开草稿窗口
      const draftButton = page.locator('button:has-text("草稿")');
      await draftButton.click();

      // 验证草稿窗口已打开
      const draftModal = page.locator('h3:has-text("投资计划草稿")');
      await expect(draftModal).toBeVisible();

      // 等待表格渲染（检测行出现）
      await expect(page.locator('table tbody tr').first()).toBeVisible();

      // 第一行操作
      const firstRow = page.locator('table tbody tr').first();
      await firstRow.locator('select').first().selectOption('买入');
      await firstRow.locator('input[type="text"]').first().fill('100');
      await firstRow.locator('button[title="添加涨跌幅到注释"]').click();
      await page.waitForTimeout(100);  // 等待输入更新

      // 第二行操作
      const secondRow = page.locator('table tbody tr').nth(1);
      await secondRow.locator('select').first().selectOption('卖出');
      await secondRow.locator('input[type="text"]').first().fill('100');
      await secondRow.locator('button[title="添加涨跌幅到注释"]').click();
      await page.waitForTimeout(100);  // 等待输入更新

      // 等待防抖保存完成
      await page.waitForTimeout(600);  // DEBOUNCE_DELAY = 500ms

      // 记录注释值
      const firstNoteValue = await firstRow.locator('input[placeholder="注释"]').inputValue();
      const secondNoteValue = await secondRow.locator('input[placeholder="注释"]').inputValue();

      expect(firstNoteValue).not.toBe('');
      expect(secondNoteValue).not.toBe('');

      // 关闭草稿窗口
      await page.click('button[aria-label="关闭投资计划窗口"]');
      await expect(draftModal).not.toBeVisible();

      // 重新打开草稿窗口
      await draftButton.click();
      await expect(draftModal).toBeVisible();
      await expect(page.locator('table tbody tr').first()).toBeVisible();

      // 重新获取行定位器（窗口重新打开后旧定位器失效）
      const reopenedFirstRow = page.locator('table tbody tr').first();
      const reopenedSecondRow = page.locator('table tbody tr').nth(1);

      // 验证数据已恢复
      expect(await reopenedFirstRow.locator('select').first().inputValue()).toBe('买入');
      expect(await reopenedFirstRow.locator('input[type="text"]').first().inputValue()).toBe('100');
      expect(await reopenedFirstRow.locator('input[placeholder="注释"]').inputValue()).toBe(firstNoteValue);

      expect(await reopenedSecondRow.locator('select').first().inputValue()).toBe('卖出');
      expect(await reopenedSecondRow.locator('input[type="text"]').first().inputValue()).toBe('100');
      expect(await reopenedSecondRow.locator('input[placeholder="注释"]').inputValue()).toBe(secondNoteValue);

      // 验证汇总信息
      await expect(page.locator('text=/买入：1只/')).toBeVisible();
      await expect(page.locator('text=/卖出：1只/')).toBeVisible();
    } finally {
      await page.close();
    }
  });
});