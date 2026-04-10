import { test, expect, Page, BrowserContext } from '@playwright/test';
import path from 'path';
import fs from 'fs';

/**
 * 测试数据准备
 *
 * 此测试用例用于准备测试环境数据，包括：
 * 1. 载入备份文件
 * 2. 配置同步管理
 * 3. 配置 AI 配置
 * 4. 等待后台任务完成
 * 5. Dump localStorage 数据到文件
 *
 * 运行方式：npx playwright test smoke-tests/testDataPrepare.spec.ts --headed
 * 注意：此测试默认被 exclude 在 smoke test 之外
 */

// Private data 文件路径
const PRIVATE_DATA_FILE = path.join(process.cwd(), 'debug', 'private_data.json');

// 备份文件路径
const BACKUP_FILE = path.join(process.cwd(), '__mocks__', 'fund_backup_2026-04-06_12-50-51.json');

interface PrivateData {
  sync_user: string;
  sync_password: string;
  'api-key': string;
}

/**
 * 读取 private data 文件
 */
function readPrivateData(): PrivateData {
  if (!fs.existsSync(PRIVATE_DATA_FILE)) {
    throw new Error(`Private data file not found: ${PRIVATE_DATA_FILE}`);
  }

  const content = fs.readFileSync(PRIVATE_DATA_FILE, 'utf-8');
  try {
    return JSON.parse(content);
  } catch (e) {
    throw new Error(`Invalid JSON in private data file: ${PRIVATE_DATA_FILE}`);
  }
}

/**
 * 获取当前时间戳字符串
 */
function getTimestampString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

/**
 * 导入备份文件
 */
async function importBackupFile(page: Page) {
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#root')).toBeVisible();

  // 点击系统配置按钮
  await page.click('button[title="系统配置"]');
  await expect(page.locator('button:has-text("导入备份")')).toBeVisible();

  // 上传备份文件
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('button:has-text("导入备份")'),
  ]);
  await fileChooser.setFiles(BACKUP_FILE);

  // 确认导入
  const confirmDialog = page.locator('[role="dialog"]:has-text("导入确认")');
  await expect(confirmDialog).toBeVisible({ timeout: 5000 });
  await confirmDialog.locator('button:has-text("确认导入")').click();

  // 等待导入完成
  await page.waitForFunction(() => {
    const fundsRaw = localStorage.getItem('fund_all_funds_data');
    if (!fundsRaw) return false;
    const funds = JSON.parse(fundsRaw);
    return funds.length === 21;
  }, { timeout: 10000 });

  // 关闭系统配置窗口
  const closeButton = page.locator('[role="dialog"] button[aria-label="关闭"]');
  if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeButton.click();
  }

  // 刷新页面
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#root')).toBeVisible();
}

/**
 * 配置同步管理
 */
async function configureSync(page: Page, username: string, password: string) {
  // 打开系统配置
  await page.click('button[title="系统配置"]');
  await expect(page.locator('h2:has-text("系统配置")')).toBeVisible();

  // 点击"同步管理"导航按钮
  await page.click('button:has-text("同步管理")');

  // 等待 SyncPanel 显示（通过输入框判断）
  await expect(page.locator('input#sync-username')).toBeVisible();

  // 输入用户名和密码
  await page.locator('input#sync-username').fill(username);
  await page.locator('input#sync-password').fill(password);

  // 保存配置
  await page.click('button:has-text("保存配置")');

  // 等待保存完成（测试结果显示）
  await expect(page.getByText('✓ 配置已保存')).toBeVisible({ timeout: 5000 });

  // 关闭系统配置窗口
  const closeButton = page.locator('[role="dialog"] button[aria-label="关闭"]');
  if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeButton.click();
  }
}

/**
 * 配置 AI 配置
 */
async function configureAI(page: Page, apiKey: string) {
  // 打开系统配置
  await page.click('button[title="系统配置"]');
  await expect(page.locator('h2:has-text("系统配置")')).toBeVisible();

  // 点击"AI配置"导航按钮
  await page.click('button:has-text("AI配置")');

  // 等待 AIPanel 显示（通过配置列表判断）
  await expect(page.locator('h3:has-text("新建配置")')).toBeVisible();

  // 点击"从模板创建"
  await page.click('button:has-text("从模板创建")');

  // 等待模板区域显示
  await expect(page.locator('h3:has-text("从模板创建配置")')).toBeVisible();

  // 输入配置名称
  await page.locator('input[placeholder="为新配置命名"]').fill('deepseek');

  // 选择模板 "DeepSeek Chat"
  await page.locator('select').selectOption('deepseek');

  // 点击"使用模板"
  await page.click('button:has-text("使用模板")');

  // 等待表单填充
  await page.waitForTimeout(500);

  // 输入 API 密钥
  await page.locator('input[type="password"][placeholder="请输入API密钥"]').fill(apiKey);

  // 点击"更新配置"
  await page.click('button:has-text("更新配置")');

  // 等待配置保存
  await page.waitForTimeout(500);

  // 激活配置 - 找到 deepseek 配置行，点击激活按钮
  // 配置列表中的配置项在 .space-y-3 > div 中
  const configList = page.locator('div.bg-white.rounded-xl.border').filter({ hasText: '配置列表' });
  const deepseekRow = configList.locator('.space-y-3 > div').filter({ has: page.locator('h4', { hasText: 'deepseek' }) });
  await expect(deepseekRow).toBeVisible();

  // 点击激活按钮（toggle-on 图标）
  await deepseekRow.locator('button[title="设为激活"]').click();

  // 等待激活状态变化
  await page.waitForTimeout(500);

  // 验证已激活
  await expect(deepseekRow.locator('span:has-text("已激活")')).toBeVisible();

  // 关闭系统配置窗口
  const closeButton = page.locator('[role="dialog"] button[aria-label="关闭"]');
  if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeButton.click();
  }
}

/**
 * 启用后台任务日志开关
 */
async function enableJobLog(page: Page) {
  // 打开系统配置
  await page.click('button[title="系统配置"]');
  await expect(page.locator('h2:has-text("系统配置")')).toBeVisible();

  // 点击"系统开关"导航按钮
  await page.click('button:has-text("系统开关")');

  // 等待 SystemPanel 显示
  await expect(page.locator('h3:has-text("功能开关")')).toBeVisible();

  // 找到"后台任务日志"开关并启用
  // 定位到包含"后台任务日志"文本的行，然后在该行中找开关
  const jobLogRow = page.locator('.divide-y > div').filter({ hasText: '后台任务日志' }).first();
  await expect(jobLogRow).toBeVisible();
  const jobLogSwitch = jobLogRow.locator('button[role="switch"]');
  const isChecked = await jobLogSwitch.getAttribute('aria-checked');
  if (isChecked === 'false') {
    await jobLogSwitch.click();
    // 等待开关状态变化
    await expect(jobLogSwitch).toHaveAttribute('aria-checked', 'true', { timeout: 2000 });
  }

  // 关闭系统配置窗口
  const closeButton = page.locator('[role="dialog"] button[aria-label="关闭"]');
  if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeButton.click();
  }

  // 等待页面刷新（按钮显示）
  await page.waitForTimeout(500);
}

/**
 * 等待后台任务完成
 */
async function waitForBackgroundJobs(page: Page): Promise<boolean> {
  // 打开后台任务日志窗口
  await page.click('button[title="后台任务日志"]');

  // 等待窗口显示
  await expect(page.locator('h2:has-text("后台任务日志")')).toBeVisible();

  // 等待所有任务完成（最多等待 5 分钟）
  const maxWaitTime = 5 * 60 * 1000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    // 检查所有任务状态 - 每个任务日志项在 div.bg-gray-50 中
    const jobStatus = await page.evaluate(() => {
      const logs = document.querySelectorAll('.bg-gray-50.rounded.p-2.border');
      const statuses: { name: string; status: string }[] = [];

      logs.forEach(log => {
        const nameEl = log.querySelector('span.font-medium.text-gray-700');
        // 状态在另一个 span.font-medium 中，通过颜色类区分
        const statusEl = log.querySelector('span.font-medium.text-blue-500, span.font-medium.text-green-500, span.font-medium.text-red-500');

        if (nameEl && statusEl) {
          statuses.push({
            name: nameEl.textContent || '',
            status: statusEl.textContent || '',
          });
        }
      });

      return statuses;
    });

    // 如果没有日志，等待一下再检查
    if (jobStatus.length === 0) {
      await page.waitForTimeout(3000);
      continue;
    }

    // 检查是否有失败的任务
    const failedJobs = jobStatus.filter(j => j.status === '失败');
    if (failedJobs.length > 0) {
      console.error('后台任务失败:', failedJobs);
      return false;
    }

    // 检查是否所有任务都成功（没有运行中的任务）
    const runningJobs = jobStatus.filter(j => j.status === '运行中');
    if (runningJobs.length === 0) {
      const successJobs = jobStatus.filter(j => j.status === '成功');
      if (successJobs.length === jobStatus.length) {
        console.log('所有后台任务已完成，共', jobStatus.length, '个任务');
        return true;
      }
    }

    // 等待一段时间再检查
    await page.waitForTimeout(5000);
  }

  console.error('等待后台任务超时');
  return false;
}

/**
 * 关闭后台任务日志窗口
 */
async function closeJobLogModal(page: Page) {
  // 尝试关闭窗口
  const closeButton = page.locator('.bg-white.rounded-xl.shadow-2xl button:has(i.fa-times)');
  if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeButton.click();
  }
}

/**
 * Dump localStorage 数据
 * 复用 dataSnapshotService.buildSnapshotData() 函数
 */
async function dumpLocalStorage(page: Page): Promise<string> {
  const timestamp = getTimestampString();
  const filename = `mock-data_${timestamp}.json`;
  const filepath = path.join(process.cwd(), '__mocks__', filename);

  // 复用应用中的 buildSnapshotData 函数
  const snapshotData = await page.evaluate(() => {
    const root = (window as any).__ROOT__;
    if (!root?.dataSnapshotService?.buildSnapshotData) {
      throw new Error('dataSnapshotService.buildSnapshotData not available');
    }
    return root.dataSnapshotService.buildSnapshotData();
  });

  // 写入文件
  fs.writeFileSync(filepath, JSON.stringify(snapshotData, null, 2));
  console.log(`数据已保存到: ${filepath}`);

  return filepath;
}

// 测试用例
test.describe('测试数据准备', () => {
  // 设置较长的超时时间（10 分钟）
  test.setTimeout(10 * 60 * 1000);

  test('准备测试数据', async ({ page }) => {
    // 1. 读取 private data
    console.log('读取 private data...');
    const privateData = readPrivateData();
    console.log('Private data 读取成功');

    // 2. 导入备份文件
    console.log('导入备份文件...');
    await importBackupFile(page);
    console.log('备份文件导入成功');

    // 3. 配置同步管理
    console.log('配置同步管理...');
    await configureSync(page, privateData.sync_user, privateData.sync_password);
    console.log('同步管理配置成功');

    // 4. 配置 AI 配置
    console.log('配置 AI 配置...');
    await configureAI(page, privateData['api-key']);
    console.log('AI 配置成功');

    // 5. 启用后台任务日志开关
    console.log('启用后台任务日志开关...');
    await enableJobLog(page);
    console.log('后台任务日志开关已启用');

    // 6. 等待后台任务完成
    console.log('等待后台任务完成...');
    const jobsSuccess = await waitForBackgroundJobs(page);
    expect(jobsSuccess).toBe(true);

    // 关闭后台任务日志窗口
    await closeJobLogModal(page);

    // 7. Dump localStorage 数据
    console.log('Dump localStorage 数据...');
    const filepath = await dumpLocalStorage(page);

    // 验证文件已创建
    expect(fs.existsSync(filepath)).toBe(true);

    // 读取并验证文件内容
    const content = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    expect(content.timestamp).toBeTruthy();
    expect(content.data).toBeTruthy();

    console.log('测试数据准备完成！');
    console.log(`数据文件: ${filepath}`);
  });
});