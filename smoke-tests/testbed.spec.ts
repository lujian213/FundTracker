import { test, expect, Page, BrowserContext } from '@playwright/test';
import path from 'path';
import fs from 'fs';

/**
 * Testbed with loaded data
 *
 * 优化策略：
 * 1. 共享浏览器上下文，避免重复加载
 * 2. 用精确等待替代固定超时
 * 3. 减少不必要的等待
 * 4. 支持历史数据加载，避免每次测试都需要网络请求
 */

// 共享状态
let sharedContext: BrowserContext | null = null;
let sharedPage: Page | null = null;

// 历史数据文件路径
const HISTORY_DUMP_FILE = path.join(process.cwd(), '__mocks__', 'fund_history_dump.json');

/**
 * Load 历史数据到内存并通过服务保存
 * 在导入备份文件后调用，将历史数据注入到每个基金中
 */
async function loadHistoryData(page: Page): Promise<boolean> {
  if (!fs.existsSync(HISTORY_DUMP_FILE)) {
    console.log('[Load] 历史数据文件不存在，跳过加载');
    return false;
  }

  const historyMap = JSON.parse(fs.readFileSync(HISTORY_DUMP_FILE, 'utf-8'));

  await page.evaluate((data) => {
    const root = (window as any).__ROOT__;
    if (!root?.marketFundService) {
      console.log('[Load] marketFundService 未暴露，跳过加载');
      return;
    }

    const funds = root.marketFundService.getAllMarketFunds();
    let updated = 0;

    for (const fund of funds) {
      const symbol = fund.info.ticker.symbol;
      if (data[symbol]) {
        root.marketFundService.updateHistory(symbol, data[symbol]);
        updated++;
      }
    }

    // 批量保存到 localStorage（压缩格式）
    root.marketFundService.saveAllToStorage();
    console.log(`[Load] 已加载 ${updated} 只基金的历史数据`);
  }, historyMap);

  console.log(`[Load] 历史数据已从 ${HISTORY_DUMP_FILE} 加载`);
  return true;
}

// 导入备份文件的辅助函数
async function importBackupFile(page: Page) {
  // 打开主页
  await page.goto('/', { waitUntil: 'load' });
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

  // 等待导入完成（检测数据加载完成，处理可能的压缩）
  await page.waitForFunction(() => {
    const fundsRaw = localStorage.getItem('fund_all_funds_data');
    if (!fundsRaw) return false;
    // 尝试通过服务获取（处理压缩）
    const root = (window as any).__ROOT__;
    if (root?.marketFundService) {
      return root.marketFundService.getAllMarketFunds().length === 21;
    }
    // fallback: 直接解析（处理未压缩数据）
    try {
      const funds = JSON.parse(fundsRaw);
      return funds.length === 21;
    } catch {
      return false;
    }
  }, { timeout: 5000 });

  // 加载历史数据（如果存在）
  const historyLoaded = await loadHistoryData(page);
  if (historyLoaded) {
    // 刷新页面以加载历史数据到 React 状态
    await page.reload({ waitUntil: 'load' });
    await expect(page.locator('#root')).toBeVisible();
  }

  // 关闭系统配置窗口
  const closeConfigButton = page.locator('[role="dialog"] button[aria-label="关闭"]');
  if (await closeConfigButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeConfigButton.click();
  }

  // 刷新页面以加载导入的数据到 React 状态
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#root')).toBeVisible();
}

test.describe('Testbed with loaded data', () => {
  test.beforeAll(async ({ browser }) => {
    // 创建共享的浏览器上下文和页面，设置时区为东8区
    sharedContext = await browser.newContext({
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });
    sharedPage = await sharedContext.newPage();

    // 导入备份文件（只执行一次）
    await importBackupFile(sharedPage);
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

  test('AI prompt templates 正确加载', async () => {
    const page = sharedPage!;

    // 直接 fetch 配置文件并验证所有 AI prompt templates 是否正确加载
    const templatesStatus = await page.evaluate(async () => {
        // 配置文件路径列表（与 promptTemplateService.loadAllTemplates() 一致）
        const configFiles = [
          './assets/config/ai-fund-prompt-templates.json',
          './assets/config/ai-index-prompt-templates.json',
          './assets/config/ai-fund-common-questions.json',
          './assets/config/ai-index-common-questions.json',
          './assets/config/ai-investment-draft-templates.json',
          './assets/config/ai-portfolio-analysis-templates.json',
          './assets/config/background-job-prompts.json',
        ];

        // 预期的模板 ID 列表（所有启用的模板）
        const expectedTemplateIds = [
          'fund-analysis',
          'index-analysis',
          'investment-draft-analysis',
          'ai-investment-advice',
          'ai-investment-advice-score',
          'ai-investment-advice-refine',
          'portfolio-analysis',
          'bg-holiday',
          'bg-delivery',
          'bg-strategy',
          'bg-calendar-holiday-china',
          'bg-calendar-holiday-hk',
          'bg-calendar-holiday-us',
          'bg-calendar-holiday-sg',
          'bg-calendar-delivery',
        ];

        // 预期的 type 类模板
        const expectedFundCommonQuestions = [
          'fund-info-summary',
          'fund-profit-loss-analysis',
          'fund-opportunity-analysis',
          'fund-risk-analysis',
          'fund-oscillation-analysis',
        ];

        const expectedIndexCommonQuestions = [
          'index-trend-prediction',
        ];

        // 收集所有加载的模板
        const loadedTemplates: { id: string; template: string; type?: string }[] = [];
        const configFileStatus: { path: string; success: boolean; error?: string }[] = [];

        // Fetch 并解析每个配置文件
        for (const path of configFiles) {
          try {
            const response = await fetch(path);
            if (!response.ok) {
              configFileStatus.push({ path, success: false, error: `HTTP ${response.status}` });
              continue;
            }
            const data = await response.json();
            configFileStatus.push({ path, success: true });

            // PromptTemplateGroup 格式（fund/index prompt）
            if (data.id && Array.isArray(data.templates)) {
              const enabledTemplate = data.templates.find((t: any) => t.enabled === true);
              if (enabledTemplate) {
                loadedTemplates.push({
                  id: data.id,
                  template: enabledTemplate.template,
                });
              }
            }
            // 标准 PromptTemplate 数组格式
            else if (Array.isArray(data.templates)) {
              for (const t of data.templates) {
                if (t.enabled === undefined || t.enabled === true) {
                  loadedTemplates.push({
                    id: t.id,
                    template: t.template,
                    type: t.type,
                  });
                }
              }
            }
          } catch (e: any) {
            configFileStatus.push({ path, success: false, error: e.message });
          }
        }

        // 检查每个预期的模板 ID 是否存在
        const idCheckResults: { id: string; found: boolean; hasTemplate: boolean }[] = [];
        for (const id of expectedTemplateIds) {
          const template = loadedTemplates.find(t => t.id === id);
          idCheckResults.push({
            id,
            found: template !== undefined,
            hasTemplate: (template?.template?.length ?? 0) > 0,
          });
        }

        // 检查 type 类模板
        const fundCommonQuestions = loadedTemplates.filter(t => t.type === 'fund-common-question');
        const indexCommonQuestions = loadedTemplates.filter(t => t.type === 'index-common-question');

        const typeCheckResults = {
          fundCommonQuestion: {
            expectedCount: expectedFundCommonQuestions.length,
            actualCount: fundCommonQuestions.length,
            ids: fundCommonQuestions.map(t => t.id),
          },
          indexCommonQuestion: {
            expectedCount: expectedIndexCommonQuestions.length,
            actualCount: indexCommonQuestions.length,
            ids: indexCommonQuestions.map(t => t.id),
          },
        };

        return {
          configFileStatus,
          idCheckResults,
          typeCheckResults,
          totalLoadedTemplates: loadedTemplates.length,
        };
      });

      // 验证所有配置文件都成功加载
      const failedFiles = templatesStatus.configFileStatus.filter(f => !f.success);
      expect(failedFiles).toHaveLength(0);

      // 验证所有预期的模板 ID 都正确加载
      const missingIds = templatesStatus.idCheckResults.filter(r => !r.found);
      const emptyTemplates = templatesStatus.idCheckResults.filter(r => r.found && !r.hasTemplate);

      expect(missingIds).toHaveLength(0);
      expect(emptyTemplates).toHaveLength(0);

      // 验证 type 类模板数量正确
      expect(templatesStatus.typeCheckResults.fundCommonQuestion.actualCount).toBe(
        templatesStatus.typeCheckResults.fundCommonQuestion.expectedCount
      );
      expect(templatesStatus.typeCheckResults.indexCommonQuestion.actualCount).toBe(
        templatesStatus.typeCheckResults.indexCommonQuestion.expectedCount
      );

      // 验证 type 类模板包含预期的 ID
      expect(templatesStatus.typeCheckResults.fundCommonQuestion.ids).toContain('fund-info-summary');
      expect(templatesStatus.typeCheckResults.fundCommonQuestion.ids).toContain('fund-profit-loss-analysis');
      expect(templatesStatus.typeCheckResults.fundCommonQuestion.ids).toContain('fund-opportunity-analysis');
      expect(templatesStatus.typeCheckResults.fundCommonQuestion.ids).toContain('fund-risk-analysis');
      expect(templatesStatus.typeCheckResults.fundCommonQuestion.ids).toContain('fund-oscillation-analysis');
      expect(templatesStatus.typeCheckResults.indexCommonQuestion.ids).toContain('index-trend-prediction');

      // 验证加载的模板总数（预期 21 个启用的模板）
    expect(templatesStatus.totalLoadedTemplates).toBe(21);
  });
});