/**
 * fundProfileService.ts
 *
 * 基金基本信息获取服务，从东方财富网站抓取股票持仓和阶段涨幅数据。
 * 支持多种代理格式：HTML 和 Markdown
 */

import { Ticker, FundProfile, StockPosition, StageIncrease, JobResult, MarketType } from '../types';
import * as marketFundService from './marketFundService';

const EASTMONEY_URL = 'https://fund.eastmoney.com/{symbol}.html';

// 代理配置：每种代理有其 URL 生成函数和返回格式
interface ProxyConfig {
  name: string;
  buildUrl: (url: string) => string;
  format: 'html' | 'markdown';
}

const WEB_FETCH_PROXIES: ProxyConfig[] = [
  // Markdown 格式的代理（r.jina.ai 转换网页为 Markdown）
  { name: 'r.jina.ai', buildUrl: (url) => `https://r.jina.ai/${url}`, format: 'markdown' },
  // HTML 格式的代理
  { name: 'allorigins.win', buildUrl: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, format: 'html' },
  { name: 'corsproxy.io', buildUrl: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`, format: 'html' },
];

// ============================================================
// HTML 解析函数
// ============================================================

/**
 * 从东方财富网页解析股票持仓数据（HTML格式）
 */
export function parseStockPositionsFromHtml(doc: Document): StockPosition[] {
  const positions: StockPosition[] = [];

  // 查找股票持仓表格
  const table = doc.querySelector('#position_shares table');
  if (!table) return positions;

  const rows = table.querySelectorAll('tbody tr, tr');
  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 2) continue;

    // 股票名称：第一个 td 下的 a 标签的 title 属性
    const nameCell = cells[0];
    const nameLink = nameCell.querySelector('a[title]');
    const stock_name = nameLink?.getAttribute('title')?.trim();
    if (!stock_name) continue;

    // 持仓占比：带有 alignRight bold 类的 td
    const percentCell = row.querySelector('td.alignRight.bold');
    const percentText = percentCell?.textContent?.trim();
    if (!percentText) continue;

    // 解析百分比，去掉 % 符号
    const percentage = parseFloat(percentText.replace('%', ''));
    if (isNaN(percentage)) continue;

    positions.push({ stock_name, percentage });
  }

  return positions;
}

/**
 * 从东方财富网页解析阶段涨幅数据（HTML格式）
 */
export function parseStageIncreaseFromHtml(doc: Document): StageIncrease[] {
  const stages: StageIncrease[] = [];
  const stageNames = ['近1周', '近1月', '近3月', '近6月'] as const;

  // 查找阶段涨幅表格
  const table = doc.querySelector('#increaseAmount_stage table');
  if (!table) return stages;

  // 获取表头，找到各阶段列的索引
  const headerRow = table.querySelector('tr');
  if (!headerRow) return stages;

  const headers = headerRow.querySelectorAll('th div');
  const stageIndices: Map<string, number> = new Map();

  headers.forEach((header, index) => {
    const text = header.textContent?.trim();
    if (text && stageNames.includes(text as typeof stageNames[number])) {
      stageIndices.set(text, index);
    }
  });

  // 找到"阶段涨幅"行
  const rows = table.querySelectorAll('tr');
  for (const row of rows) {
    const typeCell = row.querySelector('.typeName');
    if (typeCell?.textContent?.trim() !== '阶段涨幅') continue;

    // 解析各阶段数据
    const dataCells = row.querySelectorAll('td div.Rdata');
    for (const [stageName, index] of stageIndices) {
      const cell = dataCells[index - 1]; // -1 因为第一列是类型名
      if (!cell) continue;

      const text = cell.textContent?.trim();
      if (!text) continue;

      const percentage = parseFloat(text.replace('%', ''));
      if (isNaN(percentage)) continue;

      stages.push({
        stage: stageName as typeof stageNames[number],
        increase_percentage: percentage,
      });
    }
    break;
  }

  return stages;
}

// ============================================================
// Markdown 解析函数
// ============================================================

/**
 * 从 Markdown 内容解析股票持仓
 * r.jina.ai 返回的表格格式: | [股票名称](url "股票名称") | 9.45% | ... |
 */
export function parseStockPositionsFromMarkdown(markdown: string): StockPosition[] {
  const positions: StockPosition[] = [];
  const lines = markdown.split('\n');

  let inStockSection = false;
  let tableStarted = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 检测股票持仓区域开始（通过表头识别）
    if (line.includes('| 股票名称') && line.includes('持仓占比')) {
      inStockSection = true;
      tableStarted = true;
      continue;
    }

    if (!inStockSection || !tableStarted) continue;

    // 跳过分隔行 (如 | --- | --- | )
    if (line.match(/^\|[\s\-:]+\|/)) {
      continue;
    }

    // 解析数据行
    if (line.startsWith('|')) {
      const cells = line.split('|').map(c => c.trim()).filter(c => c);

      // 至少需要股票名称和持仓占比
      if (cells.length >= 2) {
        // 提取股票名称：可能是纯文本或 Markdown 链接格式
        // 格式1: 宁德时代
        // 格式2: [宁德时代](url "宁德时代")
        let stockName = cells[0];

        // 提取 Markdown 链接中的文本
        const linkMatch = stockName.match(/\[([^\]]+)\]/);
        if (linkMatch) {
          stockName = linkMatch[1];
        }

        // 提取持仓占比中的数字
        const percentText = cells[1];
        const percentMatch = percentText.match(/([\d.]+)%?/);
        if (percentMatch) {
          const percentage = parseFloat(percentMatch[1]);
          if (!isNaN(percentage) && percentage > 0 && percentage <= 100) {
            positions.push({ stock_name: stockName, percentage });
          }
        }
      }
    } else if (inStockSection) {
      // 遇到非表格行，结束股票持仓区域
      break;
    }
  }

  return positions;
}

/**
 * 从 Markdown 内容解析阶段涨幅
 * r.jina.ai 返回的表格格式:
 * |  | 近1周 | 近1月 | 近3月 | 近6月 | ... |
 * | 阶段涨幅 | -0.52% | -2.22% | -0.29% | -1.12% | ... |
 */
export function parseStageIncreaseFromMarkdown(markdown: string): StageIncrease[] {
  const stages: StageIncrease[] = [];
  const stageNames = ['近1周', '近1月', '近3月', '近6月'] as const;
  const lines = markdown.split('\n');

  // 查找阶段涨幅表格
  let stageIndices: number[] = [];
  let foundHeader = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 查找表头行（包含阶段名称）
    if (!foundHeader && line.includes('近1周') && line.includes('近1月')) {
      const cells = line.split('|').map(c => c.trim()).filter(c => c);

      // 找到各阶段在表格中的索引位置
      for (let j = 0; j < cells.length; j++) {
        if (stageNames.includes(cells[j] as typeof stageNames[number])) {
          stageIndices.push(j);
        }
      }

      if (stageIndices.length > 0) {
        foundHeader = true;
      }
      continue;
    }

    // 查找阶段涨幅数据行
    if (foundHeader && line.includes('阶段涨幅')) {
      const cells = line.split('|').map(c => c.trim()).filter(c => c);

      // 根据索引提取数据
      for (let k = 0; k < stageIndices.length && k < 4; k++) {
        const idx = stageIndices[k];
        if (idx < cells.length) {
          const percentText = cells[idx];
          const percentMatch = percentText.match(/([-\d.]+)%?/);
          if (percentMatch) {
            const percentage = parseFloat(percentMatch[1]);
            if (!isNaN(percentage)) {
              stages.push({
                stage: stageNames[k],
                increase_percentage: percentage,
              });
            }
          }
        }
      }
      break; // 找到数据行后退出
    }
  }

  return stages;
}

// ============================================================
// 统一解析入口
// ============================================================

/**
 * 从内容解析 FundProfile（自动检测格式）
 */
export function parseFundProfileFromContent(content: string, format: 'html' | 'markdown'): FundProfile | null {
  try {
    let stock_positions: StockPosition[] = [];
    let stage_increase: StageIncrease[] = [];

    if (format === 'html') {
      // HTML 格式解析
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');
      stock_positions = parseStockPositionsFromHtml(doc);
      stage_increase = parseStageIncreaseFromHtml(doc);
    } else {
      // Markdown 格式解析
      stock_positions = parseStockPositionsFromMarkdown(content);
      stage_increase = parseStageIncreaseFromMarkdown(content);
    }

    return {
      stock_positions,
      stage_increase,
      fetched_at: new Date().toISOString(),
    };
  } catch (e) {
    console.error(`[FundProfile] Failed to parse ${format}:`, e);
    return null;
  }
}

/**
 * 通过代理获取网页内容并解析
 */
async function fetchViaProxy(url: string): Promise<FundProfile | null> {
  let lastError: Error | null = null;

  for (const proxy of WEB_FETCH_PROXIES) {
    const proxyUrl = proxy.buildUrl(url);
    try {
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const content = await response.text();

      // 验证内容格式
      if (proxy.format === 'html') {
        // HTML 格式验证
        if (!content.includes('<!DOCTYPE') && !content.includes('<html') && !content.includes('<body')) {
          console.warn(`[FundProfile] ${proxy.name} 返回的不是有效HTML格式`);
          throw new Error('返回内容不是有效的HTML格式');
        }
      }

      // 尝试解析
      const profile = parseFundProfileFromContent(content, proxy.format);
      if (profile && (profile.stock_positions.length > 0 || profile.stage_increase.length > 0)) {
        return profile;
      }

      // 解析结果为空，可能是数据问题，继续尝试下一个代理
    } catch (e) {
      lastError = e as Error;
      console.warn(`[FundProfile] ${proxy.name} 失败:`, e);
    }
  }

  throw lastError || new Error('所有代理均失败');
}

/**
 * 抓取单个基金的基本信息
 */
export async function fetchFundProfile(symbol: string): Promise<FundProfile | null> {
  const url = EASTMONEY_URL.replace('{symbol}', symbol);

  try {
    return await fetchViaProxy(url);
  } catch (e) {
    console.error(`[FundProfile] Error fetching ${symbol}:`, e);
    return null;
  }
}

/**
 * 批量刷新所有基金的基本信息（单线程顺序获取）
 * @param getPortfolio 获取当前 portfolio 的函数
 * @param onPortfolioUpdate 更新 portfolio 的回调
 * @param _fetchProfile 测试用：可注入的 fetchProfile 函数
 * @param _delay 测试用：可注入的延时函数
 * @returns JobResult 任务结果
 */
export async function refreshFundProfiles(
  getPortfolio: () => Ticker[],
  onPortfolioUpdate: (newPortfolio: Ticker[]) => void,
  _fetchProfile?: (symbol: string) => Promise<FundProfile | null>,
  _delay?: (ms: number) => Promise<void>
): Promise<JobResult> {
  const fetchFn = _fetchProfile ?? fetchFundProfile;
  const delayFn = _delay ?? ((ms: number) => new Promise(resolve => setTimeout(resolve, ms)));
  const portfolio = getPortfolio();
  const funds = portfolio.filter(t => t.market === MarketType.FUND);

  if (funds.length === 0) {
    return { success: true, message: '没有基金需要更新' };
  }

  let successCount = 0;
  let failCount = 0;
  let firstError: string | null = null;
  const updates = new Map<string, FundProfile>();

  for (let i = 0; i < funds.length; i++) {
    const fund = funds[i];
    const profile = await fetchFn(fund.symbol);

    if (profile) {
      updates.set(fund.symbol, profile);
      successCount++;
    } else {
      failCount++;
      if (!firstError) {
        firstError = `基金 ${fund.symbol} (${fund.name}) 获取失败`;
      }
    }

    // Add delay between requests to avoid rate limiting (3 seconds)
    if (i < funds.length - 1) {
      await delayFn(3000);
    }
  }

  // Single update at the end
  if (updates.size > 0) {
    const latestPortfolio = getPortfolio();
    const updatedPortfolio = latestPortfolio.map(t =>
      updates.has(t.symbol) ? { ...t, profile: updates.get(t.symbol) } : t
    );
    onPortfolioUpdate(updatedPortfolio);

    // 持久化更新到 marketFundService
    for (const [symbol, profile] of updates) {
      marketFundService.updateTicker(symbol, { profile });
    }
  }

  if (failCount === 0) {
    return { success: true, message: `成功更新 ${successCount} 只基金` };
  } else if (successCount === 0) {
    return { success: false, message: `${failCount} 只基金更新失败` };
  } else {
    // 部分失败：返回 success: false
    return { success: false, message: `成功 ${successCount} 只，失败 ${failCount} 只基金` };
  }
}

// ============================================================
// 导出原有函数名（保持兼容性）
// ============================================================

export function parseStockPositions(doc: Document): StockPosition[] {
  return parseStockPositionsFromHtml(doc);
}

export function parseStageIncrease(doc: Document): StageIncrease[] {
  return parseStageIncreaseFromHtml(doc);
}

export function parseFundProfileFromHtml(html: string): FundProfile | null {
  return parseFundProfileFromContent(html, 'html');
}