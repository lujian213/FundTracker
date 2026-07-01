/**
 * fundProfileService.ts
 *
 * 基金基本信息获取服务，从东方财富网站抓取股票持仓和阶段涨幅数据。
 * 支持多种代理格式：HTML 和 Markdown
 */

import { Ticker, FundProfile, StockPosition, StageIncrease, JobResult, MarketType, FundSector } from '../types';
import * as marketFundService from './marketFundService';
import { fetchWithProxy } from './proxyService';

const EASTMONEY_URL = 'https://fund.eastmoney.com/{symbol}.html';
const SEARCH_API_URL = 'https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key={symbol}';

/**
 * 从东方财富股票链接提取股票代码和市场信息
 * 支持多种链接格式：
 * 1. https://quote.eastmoney.com/unify/r/1.600519 (带股票名称)
 * 2. https://quote.eastmoney.com/sh600519.html
 * 3. https://quote.eastmoney.com/concept/sz300750.html
 * @param url 股票链接
 * @returns { code: 股票代码(6位), market: 市场代码(0/1/2) } 或 null
 */
function extractStockCodeFromUrl(url: string): { code: string; market: string } | null {
  // 格式1: /unify/r/1.600519 或 /unify/r/0.000333
  // 市场代码: 1=沪市, 0=深市, 2=北交所
  const unifyMatch = url.match(/\/unify\/r\/([012])\.(\d{6})/i);
  if (unifyMatch) {
    return { market: unifyMatch[1], code: unifyMatch[2] };
  }

  // 格式2: /sh600519.html 或 /sz000333.html 或 /bj430047.html
  // 格式3: /concept/sz300750.html 或类似格式
  const directMatch = url.match(/\/(?:sh|sz|bj)(\d{6})\.html/i);
  if (directMatch) {
    // 从 URL 中提取市场前缀
    const marketPrefixMatch = url.match(/\/(sh|sz|bj)\d{6}/i);
    if (marketPrefixMatch) {
      const marketPrefix = marketPrefixMatch[1].toLowerCase();
      const marketCode = marketPrefix === 'sh' ? '1' : marketPrefix === 'sz' ? '0' : '2';
      return { market: marketCode, code: directMatch[1] };
    }
  }

  return null;
}

/**
 * 构建正确的东方财富股票链接
 * @param market 市场代码 (0=深市, 1=沪市, 2=北交所)
 * @param code 股票代码 (6位数字)
 * @returns 正确的股票链接
 */
function buildStockUrl(market: string, code: string): string {
  const prefix = market === '1' ? 'sh' : market === '0' ? 'sz' : 'bj';
  return `https://quote.eastmoney.com/${prefix}${code}.html`;
}

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

    // 提取股票链接和代码，重新构建正确的链接
    const rawUrl = nameLink?.getAttribute('href') || '';
    const stockInfo = rawUrl ? extractStockCodeFromUrl(rawUrl) : null;
    const stock_code = stockInfo?.code || undefined;
    const stock_url = stockInfo ? buildStockUrl(stockInfo.market, stockInfo.code) : undefined;

    // 持仓占比：带有 alignRight bold 类的 td
    const percentCell = row.querySelector('td.alignRight.bold');
    const percentText = percentCell?.textContent?.trim();
    if (!percentText) continue;

    // 解析百分比，去掉 % 符号
    const percentage = parseFloat(percentText.replace('%', ''));
    if (isNaN(percentage)) continue;

    positions.push({ stock_name, percentage, stock_code, stock_url });
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
        let stock_url: string | undefined = undefined;
        let stock_code: string | undefined = undefined;

        // 提取 Markdown 链接中的文本和 URL，重新构建正确的链接
        // 匹配格式: [股票名称](url "tooltip")
        const fullLinkMatch = stockName.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (fullLinkMatch) {
          stockName = fullLinkMatch[1];
          const rawUrl = fullLinkMatch[2];
          // 从原始链接提取股票信息，构建正确的链接
          const stockInfo = extractStockCodeFromUrl(rawUrl);
          if (stockInfo) {
            stock_code = stockInfo.code;
            stock_url = buildStockUrl(stockInfo.market, stockInfo.code);
          }
        }

        // 跳过"暂无数据"这类占位文本
        if (stockName === '暂无数据' || stockName.includes('暂无')) {
          continue;
        }

        // 提取持仓占比中的数字
        const percentText = cells[1];

        // 检查 percentText 是否是有效的百分比格式
        // 有效格式应该直接是百分比数字（如 "9.45%"），不应该包含 URL 或其他文本
        // 如果 percentText 包含 URL（http:// 或 eastmoney.com），则跳过
        if (percentText.includes('http://') || percentText.includes('https://') ||
            percentText.includes('eastmoney.com') || percentText.includes('fundf10')) {
          continue;
        }

        const percentMatch = percentText.match(/([\d.]+)%/);
        if (percentMatch) {
          const percentage = parseFloat(percentMatch[1]);
          if (!isNaN(percentage) && percentage > 0 && percentage <= 100) {
            positions.push({ stock_name: stockName, percentage, stock_code, stock_url });
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

// ============================================================
// 搜索 API 获取基金类型和板块信息
// ============================================================

interface SearchApiResponse {
  ErrCode: number;
  ErrMsg: string;
  Datas: Array<{
    FundBaseInfo?: {
      FTYPE?: string;  // 基金类型（如"混合型-偏股"）
    };
    ZTJJInfo?: Array<{
      TTYPE: string;    // 板块代码
      TTYPENAME: string; // 板块名称
    }>;
  }>;
}

/**
 * 从搜索API获取基金类型和板块信息
 * 使用代理服务解决CORS问题
 * @returns { fund_type: string | undefined, sectors: FundSector[] }
 */
async function fetchFundTypeAndSectors(symbol: string): Promise<{ fund_type?: string; sectors: FundSector[] }> {
  const url = SEARCH_API_URL.replace('{symbol}', symbol);

  try {
    // 使用代理服务调用搜索API（使用 raw 格式，因为返回的是JSON）
    const { content } = await fetchWithProxy(url, {
      preferFormat: 'raw',
      timeout: 5000,  // 搜索API响应较快
    });

    const data: SearchApiResponse = JSON.parse(content);

    if (data.ErrCode !== 0 || !data.Datas || data.Datas.length === 0) {
      console.warn(`[FundProfile] 搜索API返回数据无效`);
      return { sectors: [] };
    }

    const fundData = data.Datas[0];
    const result: { fund_type?: string; sectors: FundSector[] } = { sectors: [] };

    // 提取基金类型
    if (fundData.FundBaseInfo?.FTYPE) {
      result.fund_type = fundData.FundBaseInfo.FTYPE;
    }

    // 提取板块信息
    if (fundData.ZTJJInfo && fundData.ZTJJInfo.length > 0) {
      result.sectors = fundData.ZTJJInfo.map(item => ({
        code: item.TTYPE,
        name: item.TTYPENAME,
      }));
    }

    return result;
  } catch (e) {
    console.warn(`[FundProfile] 获取基金类型和板块信息失败:`, e);
    return { sectors: [] };
  }
}

/**
 * 通过代理获取网页内容并解析
 * 使用统一的代理服务
 */
async function fetchViaProxy(url: string): Promise<FundProfile | null> {
  try {
    // 不指定格式偏好，让代理按评分公平竞争
    // r.jina.ai 返回 markdown，其他代理返回 raw/html
    const { content, format } = await fetchWithProxy(url);

    // 根据返回格式选择解析方式
    // raw 格式当作 HTML 处理，markdown 格式当作 Markdown 处理
    const parseFormat = format === 'raw' ? 'html' : 'markdown';
    const profile = parseFundProfileFromContent(content, parseFormat);

    if (profile && (profile.stock_positions.length > 0 || profile.stage_increase.length > 0)) {
      return profile;
    }

    // 解析结果为空，可能是数据问题（如"暂无数据")
    console.warn(`[FundProfile] 解析结果为空，可能该基金暂无持仓数据`);
    return profile; // 返回空 profile，包含 fetched_at 时间戳
  } catch (e) {
    console.error(`[FundProfile] 获取失败:`, e);
    throw e;
  }
}

/**
 * 抓取单个基金的基本信息
 */
export async function fetchFundProfile(symbol: string): Promise<FundProfile | null> {
  const url = EASTMONEY_URL.replace('{symbol}', symbol);

  // 并行执行两个API请求：HTML解析和搜索API
  const [profileResult, typeAndSectorsResult] = await Promise.allSettled([
    fetchViaProxy(url),
    fetchFundTypeAndSectors(symbol),
  ]);

  // 处理HTML解析结果
  const profile = profileResult.status === 'fulfilled' ? profileResult.value : null;
  if (profileResult.status === 'rejected') {
    console.warn(`[FundProfile] HTML解析失败，尝试从搜索API获取部分数据`);
  }

  // 处理搜索API结果
  const { fund_type, sectors } = typeAndSectorsResult.status === 'fulfilled'
    ? typeAndSectorsResult.value
    : { fund_type: undefined, sectors: [] };
  if (typeAndSectorsResult.status === 'rejected') {
    console.warn(`[FundProfile] 搜索API获取失败`);
  }

  // 合并信息
  if (profile) {
    if (fund_type) {
      profile.fund_type = fund_type;
    }
    profile.sectors = sectors;
    return profile;
  }

  // HTML解析失败，但搜索API成功，返回部分数据
  if (fund_type || sectors.length > 0) {
    return {
      stock_positions: [],
      stage_increase: [],
      fund_type,
      sectors,
      fetched_at: new Date().toISOString(),
    };
  }

  // 两个API都失败，返回 null
  return null;
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