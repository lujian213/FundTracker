// services/aiInvestmentDraftService.ts
import { Ticker, ValuationData, HistoricalPoint, MarketIndex, TradeRecord, MarketFund } from '../types';
import { AIConfiguration } from './aiConfigService';
import { queryAI, StreamCallback, ChatMessage, queryAIWithMessages } from './aiService';
import { getById, TEMPLATE_IDS } from './promptTemplateService';
import { PromptTemplate } from '../types/promptTemplateTypes';
import { getTradesForSymbol } from '../hooks/useTrades';
import { computeAvgCostPrice } from '../utils/positionHelper';
import { toLocalDateKey } from '../utils/priceResolver';
import { computeSMAsForLast } from '../utils/movingAverage';
import { DraftEntry } from '../types/appDataTypes';
import * as marketFundService from './marketFundService';

// Re-export DraftEntry type for backward compatibility
export type { DraftEntry };

// 最近交易记录格式
export interface LastTrade {
  date: string;
  action: '买入' | '卖出';
  shares: number;
  price: number;
}

// 基金基础数据格式（不含用户计划，用于AI辅助功能）
export interface FundBaseData {
  code: string;
  name: string;
  current_shares: number;
  cost_price: number;
  current_nav: number;
  last_5_trades: LastTrade[] | null;
  weekly_return: number | null;
  monthly_return: number | null;
  quarterly_return: number | null;
  halfyear_return: number | null;
  top10_stocks: { stock_name: string; stock_percentage: number }[] | null;
  nav_last_10_days: number[];
  ma5_last_10_days: number[];
  ma10_last_10_days: number[];
  ma20_last_10_days: number[];
}

// 基金数据格式（含用户计划）
export interface FundDraftData extends FundBaseData {
  today_action: '买入' | '卖出';
  action_shares: number;
  estimate_amount: number;
}

// 指数数据格式
export interface IndexDraftData {
  index_name: string;
  current_value: number;
  current_volume: number;
  values_last_10_days: number[];
  volume_last_10_days: number[];
  ma5_last_10_days: number[];
  ma10_last_10_days: number[];
  ma20_last_10_days: number[];
}

// 完整请求数据（含用户计划）
export interface InvestmentDraftAnalysisData {
  funds: FundDraftData[];
  indices: IndexDraftData[];
}

// AI建议输入数据（不含用户计划）
export interface AIAdviceInputData {
  funds: FundBaseData[];
  indices: IndexDraftData[];
}

// AI建议条目类型
export interface AIAdviceEntry {
  fundCode: string;
  operation: '买入' | '卖出';
  amount: number;
  reason: string;
}

// AI建议条目（带得分）
export interface AIAdviceWithScore {
  fundCode: string;
  operation: '买入' | '卖出';
  amount: number;
  reason: string;
  score: number;  // 0-1 的合理性得分
}

// 迭代验证结果
export interface AIAdviceIterationResult {
  advice: AIAdviceWithScore[];
  success: boolean;
  summary: string;  // "辅助决策成功" 或 "辅助决策部分成功，达到最大尝试轮数"
  iterations: number;  // 实际迭代次数（1、2或3）
  error?: string;
}

// 迭代验证常量（导出供UI层使用）
export const SCORE_THRESHOLD = 0.7;      // 合理性得分阈值
export const MAX_ITERATIONS = 3;         // 最大迭代轮数

/**
 * 检查草稿条目是否有有效操作
 */
export function hasDraftAction(entry: DraftEntry): boolean {
  return entry.operation !== '不操作' && !!entry.amount;
}

// JSON Schema 说明文本
const JSON_SCHEMA = `### funds 数组（基金列表）
每个基金对象包含以下字段：
- code: 基金代码（字符串）
- name: 基金名称（字符串）
- current_shares: 当前持仓份额（数值，单位：份）
- cost_price: 成本价（数值，单位：元/份，加权平均成本）
- current_nav: 当前净值（数值，单位：元/份）
- today_action: 今日计划操作（字符串，"买入" 或 "卖出"）
- action_shares: 今日计划操作份额（数值，单位：份）
- estimate_amount: 今日计划操作的估算金额（数值，单位：元，操作份额×当前净值）
- last_5_trades: 最近5次交易记录（数组，最多5条，不含今日；若无交易则为 null）
  - date: 交易日期（字符串，YYYY-MM-DD格式）
  - action: 交易操作（字符串，"买入" 或 "卖出"）
  - shares: 交易份额（数值，单位：份）
  - price: 交易价格（数值，单位：元/份）
- weekly_return: 近1周涨跌幅（数值，小数形式，如 -0.023 表示 -2.3%；无数据则为 null）
- monthly_return: 近1月涨跌幅（数值，小数形式；无数据则为 null）
- quarterly_return: 近3月涨跌幅（数值，小数形式；无数据则为 null）
- halfyear_return: 近6月涨跌幅（数值，小数形式；无数据则为 null）
- top10_stocks: 基金前十股票持仓（对象数组，包含 stock_name 和 stock_percentage；无数据则为 null）
- nav_last_10_days: 最近10天净值（数值数组，不含今日，从最近日期开始，最新在前）
- ma5_last_10_days: 最近10天的5日均值（数值数组，不含今日，从最近日期开始，最新在前）
- ma10_last_10_days: 最近10天的10日均值（数值数组，不含今日，从最近日期开始，最新在前）
- ma20_last_10_days: 最近10天的20日均值（数值数组，不含今日，从最近日期开始，最新在前）

### indices 数组（指数列表）
每个指数对象包含以下字段：
- index_name: 指数名称（字符串，如 "上证指数"、"纳斯达克100指数"）
- current_value: 当前指数值（数值）
- current_volume: 当前成交量（数值，单位：手）
- values_last_10_days: 最近10天指数值（数值数组，不含今日，从最近日期开始，最新在前）
- volume_last_10_days: 最近10天成交量（数值数组，不含今日，从最近日期开始，最新在前）
- ma5_last_10_days: 最近10天的5日均值（数值数组，不含今日，从最近日期开始，最新在前）
- ma10_last_10_days: 最近10天的10日均值（数值数组，不含今日，从最近日期开始，最新在前）
- ma20_last_10_days: 最近10天的20日均值（数值数组，不含今日，从最近日期开始，最新在前）`;

/**
 * 获取最近N次交易记录（不含今日）
 */
function getLastNTrades(
  trades: TradeRecord[],
  n: number,
  todayDate: string
): LastTrade[] | null {
  if (!trades || trades.length === 0) return null;

  // 过滤掉今日交易，按日期降序
  const filtered = trades
    .filter(t => t.date !== todayDate)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, n);

  if (filtered.length === 0) return null;

  return filtered.map(t => ({
    date: t.date,
    action: t.type === 'buy' ? '买入' as const : '卖出' as const,
    shares: t.shares,
    price: t.price
  }));
}

/**
 * 获取阶段涨跌幅
 */
function getStageReturn(
  profile: Ticker['profile'],
  stage: '近1周' | '近1月' | '近3月' | '近6月'
): number | null {
  if (!profile?.stage_increase) return null;
  const found = profile.stage_increase.find(s => s.stage === stage);
  return found ? found.increase_percentage / 100 : null;
}

/**
 * 获取当前持仓份额
 */
function getCurrentShares(symbol: string): number {
  try {
    const position = marketFundService.getPosition(symbol);
    const initialPosition = position?.initialPosition || 0;

    // 加上交易记录
    const trades = getTradesForSymbol(symbol);
    let buyShares = 0;
    let sellShares = 0;
    for (const t of trades) {
      if (t.type === 'buy') buyShares += t.shares;
      else sellShares += t.shares;
    }

    return initialPosition + buyShares - sellShares;
  } catch (e) {
    // ignore
  }
  return 0;
}

/**
 * 格式化基金基础数据（不含用户计划，用于AI辅助功能）
 * 处理所有MarketFund中的基金
 */
export function formatFundBaseContextData(
  funds: MarketFund[],
  indices: MarketIndex[]
): AIAdviceInputData {
  const today = toLocalDateKey(new Date());
  const resultFunds: FundBaseData[] = [];

  // 处理基金数据
  for (const fund of funds) {
    const ticker = fund.info.ticker;
    const symbol = ticker.symbol;
    const valuation = fund.info.valuation;
    if (!valuation) continue;

    // 获取历史净值
    const history = fund.history;
    // 按时间正序排列（旧数据在前）
    const sortedHistory = [...history].sort((a, b) => (a.date as number) - (b.date as number));

    // 过滤掉今日数据，使用全部历史数据计算均值
    const historyWithoutToday = sortedHistory.filter(h => {
      const d = new Date(h.date as number);
      const dateKey = toLocalDateKey(d);
      return dateKey !== today;
    });

    // 提取全部净值数组用于均值计算（确保有足够数据）
    const allNavValues = historyWithoutToday.map(h => h.value);

    // 使用优化函数计算MA值（只计算需要的数量）
    const maValues = computeSMAsForLast(allNavValues, 10);

    // 取最近10天的净值和均值（倒序，最新在前）
    const navLast10Days = allNavValues.slice(-10).reverse();
    const ma5Last10 = [...maValues[5]].reverse().map(v => v ?? 0);
    const ma10Last10 = [...maValues[10]].reverse().map(v => v ?? 0);
    const ma20Last10 = [...maValues[20]].reverse().map(v => v ?? 0);

    // 获取交易记录
    const trades = getTradesForSymbol(symbol);
    const last5Trades = getLastNTrades(trades, 5, today);

    // 计算成本价
    const costPrice = computeAvgCostPrice(symbol, trades);

    // 获取当前份额
    const currentShares = getCurrentShares(symbol);

    // 获取阶段涨跌幅
    const weeklyReturn = getStageReturn(ticker.profile, '近1周');
    const monthlyReturn = getStageReturn(ticker.profile, '近1月');
    const quarterlyReturn = getStageReturn(ticker.profile, '近3月');
    const halfyearReturn = getStageReturn(ticker.profile, '近6月');

    // 获取前十持仓（包含名称和占比）
    const top10Stocks = ticker.profile?.stock_positions
      ?.slice(0, 10)
      .map(s => ({
        stock_name: s.stock_name,
        stock_percentage: s.percentage || 0
      })) || null;

    resultFunds.push({
      code: symbol,
      name: ticker.name || symbol,
      current_shares: currentShares,
      cost_price: costPrice || 0,
      current_nav: valuation.currentPrice,
      last_5_trades: last5Trades,
      weekly_return: weeklyReturn,
      monthly_return: monthlyReturn,
      quarterly_return: quarterlyReturn,
      halfyear_return: halfyearReturn,
      top10_stocks: top10Stocks,
      nav_last_10_days: navLast10Days,
      ma5_last_10_days: ma5Last10,
      ma10_last_10_days: ma10Last10,
      ma20_last_10_days: ma20Last10
    });
  }

  // 处理指数数据
  const resultIndices: IndexDraftData[] = [];

  for (const idx of indices) {
    const history = idx.history;
    const sortedHistory = [...history].sort((a, b) => (a.date as number) - (b.date as number));

    // 过滤掉今日数据，使用全部历史数据计算均值
    const historyWithoutToday = sortedHistory.filter(h => {
      const d = new Date(h.date as number);
      const dateKey = toLocalDateKey(d);
      return dateKey !== today;
    });

    // 提取全部指数值用于均值计算
    const allValues = historyWithoutToday.map(h => h.value);
    const allVolume = historyWithoutToday.map(h => h.volume || 0);

    // 使用优化函数计算MA值（只计算需要的数量）
    const maValues = computeSMAsForLast(allValues, 10);

    // 取最近10天的数据（倒序，最新在前）
    const valuesLast10Days = allValues.slice(-10).reverse();
    const volumeLast10Days = allVolume.slice(-10).reverse();
    const ma5Last10 = [...maValues[5]].reverse().map(v => v ?? 0);
    const ma10Last10 = [...maValues[10]].reverse().map(v => v ?? 0);
    const ma20Last10 = [...maValues[20]].reverse().map(v => v ?? 0);

    resultIndices.push({
      index_name: idx.info.name,
      current_value: idx.info.current,
      current_volume: idx.info.volume || 0,
      values_last_10_days: valuesLast10Days,
      volume_last_10_days: volumeLast10Days,
      ma5_last_10_days: ma5Last10,
      ma10_last_10_days: ma10Last10,
      ma20_last_10_days: ma20Last10
    });
  }

  return { funds: resultFunds, indices: resultIndices };
}

/**
 * 从响应中提取JSON内容
 * 支持纯JSON和被代码块包裹的JSON格式
 */
function extractJSONContent(response: string): string {
  let jsonContent = response.trim();
  const codeBlockMatch = jsonContent.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    jsonContent = codeBlockMatch[1].trim();
  }
  return jsonContent;
}

/**
 * 创建解析错误
 */
function createParseError(message: string, jsonContent: string): Error {
  const preview = jsonContent.length > 200 ? jsonContent.slice(0, 200) + '...' : jsonContent;
  return new Error(`AI返回格式解析失败: ${message}\n响应预览: ${preview}`);
}

/**
 * 解析AI建议JSON响应
 * 支持纯JSON和被代码块包裹的JSON格式
 */
export function parseAIAdviceJSON(response: string): AIAdviceEntry[] {
  const jsonContent = extractJSONContent(response);

  try {
    const parsed = JSON.parse(jsonContent);

    if (!Array.isArray(parsed)) {
      throw createParseError(`AI返回的不是数组格式，而是: ${typeof parsed}`, jsonContent);
    }

    // 过滤并转换结果，只保留 buy/sell 操作
    return parsed
      .filter(item => item.operation === 'buy' || item.operation === 'sell')
      .map(item => ({
        fundCode: item.fund_code || '',
        operation: item.operation === 'buy' ? '买入' as const : '卖出' as const,
        amount: Number(item.amount) || 0,
        reason: item.reason || ''
      }));
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('AI返回格式解析失败')) {
      throw e;
    }
    throw createParseError((e as Error).message, jsonContent);
  }
}

/**
 * 解析带得分的AI建议JSON响应
 * 支持纯JSON和被代码块包裹的JSON格式
 */
export function parseAIAdviceWithScoreJSON(response: string): AIAdviceWithScore[] {
  const jsonContent = extractJSONContent(response);

  try {
    const parsed = JSON.parse(jsonContent);

    if (!Array.isArray(parsed)) {
      throw createParseError(`AI返回的不是数组格式，而是: ${typeof parsed}`, jsonContent);
    }

    // 过滤并转换结果，只保留 buy/sell 操作
    return parsed
      .filter((item: any) => item.operation === 'buy' || item.operation === 'sell')
      .map((item: any) => ({
        fundCode: item.fund_code || '',
        operation: item.operation === 'buy' ? '买入' as const : '卖出' as const,
        amount: Number(item.amount) || 0,
        reason: item.reason || '',
        score: typeof item.score === 'number' ? item.score : 0
      }));
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('AI返回格式解析失败')) {
      throw e;
    }
    throw createParseError((e as Error).message, jsonContent);
  }
}

/**
 * 检查是否所有得分都达标
 */
function allScoresPass(advice: AIAdviceWithScore[]): boolean {
  return advice.every(item => item.score >= SCORE_THRESHOLD);
}

/**
 * 生成AI投资建议（带迭代验证）
 * 通过评分-修正-再评分的循环提高建议质量
 */
export async function generateAIAdviceWithValidation(
  config: AIConfiguration,
  funds: MarketFund[],
  indices: MarketIndex[]
): Promise<AIAdviceIterationResult> {
  // 获取模板
  const template1 = getById(TEMPLATE_IDS.AI_INVESTMENT_ADVICE);
  const template2 = getById(TEMPLATE_IDS.AI_INVESTMENT_ADVICE_SCORE);
  const template3 = getById(TEMPLATE_IDS.AI_INVESTMENT_ADVICE_REFINE);

  if (!template1 || !template2 || !template3) {
    return {
      advice: [],
      success: false,
      summary: 'AI辅助模板配置不完整',
      iterations: 0,
      error: 'AI辅助模板配置不完整，请检查配置文件'
    };
  }

  // 格式化数据（不含用户计划）
  const analysisData = formatFundBaseContextData(funds, indices);

  const jsonContent = JSON.stringify(analysisData, null, 2);

  // 构建初始消息
  const messages: ChatMessage[] = [
    { role: 'system', content: '你是一名资深基金投资顾问，拥有丰富的投资经验和敏锐的市场洞察力。' }
  ];

  // 第1步：模板1 → 获取投资建议
  const prompt1 = template1.template
    .replace(/{json_schema}/g, AI_ADVICE_JSON_SCHEMA)
    .replace(/{json_content}/g, jsonContent);

  messages.push({ role: 'user', content: prompt1 });

  const result1 = await queryAIWithMessages(config, messages, undefined, 4000);

  if (!result1.success) {
    return {
      advice: [],
      success: false,
      summary: 'AI调用失败',
      iterations: 0,
      error: result1.error || 'AI调用失败'
    };
  }

  messages.push({ role: 'assistant', content: result1.content });

  // 解析投资建议
  let investList: AIAdviceEntry[];
  try {
    investList = parseAIAdviceJSON(result1.content);
  } catch (e) {
    return {
      advice: [],
      success: false,
      summary: 'AI返回格式解析失败',
      iterations: 1,
      error: (e as Error).message
    };
  }

  // 第2步：模板2 → 获取评分
  const prompt2 = template2.template;
  messages.push({ role: 'user', content: prompt2 });

  const result2 = await queryAIWithMessages(config, messages, undefined, 4000);

  if (!result2.success) {
    return {
      advice: [],
      success: false,
      summary: 'AI评分调用失败',
      iterations: 1,
      error: result2.error || 'AI评分调用失败'
    };
  }

  messages.push({ role: 'assistant', content: result2.content });

  // 解析评分结果
  let investWithScore: AIAdviceWithScore[];
  try {
    investWithScore = parseAIAdviceWithScoreJSON(result2.content);
  } catch (e) {
    return {
      advice: [],
      success: false,
      summary: 'AI评分格式解析失败',
      iterations: 1,
      error: (e as Error).message
    };
  }

  let iterations = 1;

  // 循环检查得分，必要时修正
  while (!allScoresPass(investWithScore) && iterations < MAX_ITERATIONS) {
    // 模板3 → 修正投资建议
    const prompt3 = template3.template;
    messages.push({ role: 'user', content: prompt3 });

    const result3 = await queryAIWithMessages(config, messages, undefined, 4000);

    if (!result3.success) {
      // 修正失败，返回当前结果
      return {
        advice: investWithScore,
        success: false,
        summary: '辅助决策部分成功，AI修正调用失败',
        iterations,
        error: result3.error
      };
    }

    messages.push({ role: 'assistant', content: result3.content });

    // 解析修正后的投资建议
    try {
      investList = parseAIAdviceJSON(result3.content);
    } catch (e) {
      return {
        advice: investWithScore,
        success: false,
        summary: '辅助决策部分成功，修正结果解析失败',
        iterations,
        error: (e as Error).message
      };
    }

    // 再次评分
    messages.push({ role: 'user', content: prompt2 });

    const result4 = await queryAIWithMessages(config, messages, undefined, 4000);

    if (!result4.success) {
      return {
        advice: investWithScore,
        success: false,
        summary: '辅助决策部分成功，再次评分调用失败',
        iterations,
        error: result4.error
      };
    }

    messages.push({ role: 'assistant', content: result4.content });

    try {
      investWithScore = parseAIAdviceWithScoreJSON(result4.content);
    } catch (e) {
      return {
        advice: investWithScore,
        success: false,
        summary: '辅助决策部分成功，评分解析失败',
        iterations,
        error: (e as Error).message
      };
    }

    iterations++;
  }

  // 判断最终结果
  const allPass = allScoresPass(investWithScore);
  const summary = allPass ? '辅助决策成功' : '辅助决策部分成功，达到最大尝试轮数';

  return {
    advice: investWithScore,
    success: allPass,
    summary,
    iterations
  };
}

/**
 * 格式化投资计划数据为JSON结构（含用户计划）
 * 基于公共数据准备函数，添加用户计划相关字段
 */
export function formatInvestmentDraftData(
  draftData: Record<string, DraftEntry>,
  funds: MarketFund[],
  indices: MarketIndex[]
): InvestmentDraftAnalysisData {
  // 先获取基础数据（不含用户计划）
  const baseData = formatFundBaseContextData(funds, indices);

  // 构建基金数据的映射，用于快速查找
  const fundDataMap = new Map<string, FundBaseData>();
  for (const fund of baseData.funds) {
    fundDataMap.set(fund.code, fund);
  }

  // 构建MarketFund的映射，用于获取valuation
  const marketFundMap = new Map<string, MarketFund>();
  for (const fund of funds) {
    marketFundMap.set(fund.info.ticker.symbol, fund);
  }

  // 处理基金数据（只处理买入或卖出操作的，添加用户计划字段）
  const resultFunds: FundDraftData[] = [];

  for (const [symbol, entry] of Object.entries(draftData)) {
    if (entry.operation === '不操作' || !entry.amount) continue;

    // 从基础数据中获取基金信息
    const baseFund = fundDataMap.get(symbol);
    if (!baseFund) continue;

    // 从MarketFund中获取valuation
    const marketFund = marketFundMap.get(symbol);
    const valuation = marketFund?.info.valuation;
    if (!valuation) continue;

    // 计算操作份额
    const actionAmount = parseFloat(entry.amount);
    const actionShares = valuation.currentPrice > 0
      ? actionAmount / valuation.currentPrice
      : 0;

    // 在基础数据上添加用户计划字段
    resultFunds.push({
      ...baseFund,
      today_action: entry.operation as '买入' | '卖出',
      action_shares: actionShares,
      estimate_amount: actionAmount
    });
  }

  return { funds: resultFunds, indices: baseData.indices };
}

/**
 * 加载投资计划分析模板
 */
export function loadInvestmentDraftTemplate(): PromptTemplate | null {
  return getById(TEMPLATE_IDS.INVESTMENT_DRAFT_ANALYSIS);
}

/**
 * 执行投资计划分析
 */
export async function analyzeInvestmentDraft(
  config: AIConfiguration,
  draftData: Record<string, DraftEntry>,
  funds: MarketFund[],
  indices: MarketIndex[],
  onChunk?: StreamCallback
): Promise<{ content: string; success: boolean; error?: string }> {
  // 获取模板
  const template = loadInvestmentDraftTemplate();

  if (!template) {
    return {
      content: '未找到启用的投资计划分析模板',
      success: false,
      error: '未找到启用的投资计划分析模板'
    };
  }

  // 格式化数据
  const analysisData = formatInvestmentDraftData(draftData, funds, indices);

  // 转为JSON字符串
  const jsonContent = JSON.stringify(analysisData, null, 2);

  // 替换模板变量
  const prompt = template.template
    .replace(/{json_schema}/g, JSON_SCHEMA)
    .replace(/{json_content}/g, jsonContent);

  // 调用AI
  return queryAI(config, prompt, undefined, onChunk);
}

/**
 * AI辅助专用JSON Schema（不含用户计划字段）
 */
const AI_ADVICE_JSON_SCHEMA = `### funds 数组（基金列表）
每个基金对象包含以下字段：
- code: 基金代码（字符串）
- name: 基金名称（字符串）
- current_shares: 当前持仓份额（数值，单位：份）
- cost_price: 成本价（数值，单位：元/份）
- current_nav: 当前净值（数值，单位：元/份）
- last_5_trades: 最近5次交易记录（数组，无则为 null）
- weekly_return: 近1周涨跌幅（数值，小数形式；无数据则为 null）
- monthly_return: 近1月涨跌幅（数值，小数形式；无数据则为 null）
- quarterly_return: 近3月涨跌幅（数值，小数形式；无数据则为 null）
- halfyear_return: 近6月涨跌幅（数值，小数形式；无数据则为 null）
- top10_stocks: 基金前十股票持仓（对象数组；无数据则为 null）
- nav_last_10_days: 最近10天净值（数值数组，从最近日期开始，最新在前）
- ma5_last_10_days: 最近10天的5日均值（数值数组，从最近日期开始，最新在前）
- ma10_last_10_days: 最近10天的10日均值（数值数组，从最近日期开始，最新在前）
- ma20_last_10_days: 最近10天的20日均值（数值数组，从最近日期开始，最新在前）

### indices 数组（指数列表）
每个指数对象包含以下字段：
- index_name: 指数名称（字符串）
- current_value: 当前指数值（数值）
- current_volume: 当前成交量（数值）
- values_last_10_days: 最近10天指数值（数值数组，从最近日期开始，最新在前）
- volume_last_10_days: 最近10天成交量（数值数组，从最近日期开始，最新在前）
- ma5_last_10_days: 最近10天的5日均值（数值数组，从最近日期开始，最新在前）
- ma10_last_10_days: 最近10天的10日均值（数值数组，从最近日期开始，最新在前）
- ma20_last_10_days: 最近10天的20日均值（数值数组，从最近日期开始，最新在前）`;

/**
 * 生成AI投资建议
 */
export async function generateAIInvestmentAdvice(
  config: AIConfiguration,
  funds: MarketFund[],
  indices: MarketIndex[],
  templateId: string = 'ai-investment-advice'
): Promise<{ advice: AIAdviceEntry[]; success: boolean; error?: string }> {
  const targetTemplate = getById(templateId || TEMPLATE_IDS.AI_INVESTMENT_ADVICE);

  if (!targetTemplate) {
    return {
      advice: [],
      success: false,
      error: '未找到AI辅助模板配置'
    };
  }

  // 格式化数据（不含用户计划）
  const analysisData = formatFundBaseContextData(funds, indices);

  // 转为JSON字符串
  const jsonContent = JSON.stringify(analysisData, null, 2);

  // 替换模板变量
  const prompt = targetTemplate.template
    .replace(/{json_schema}/g, AI_ADVICE_JSON_SCHEMA)
    .replace(/{json_content}/g, jsonContent);

  // 调用AI（增加maxTokens避免响应被截断）
  const result = await queryAI(config, prompt, undefined, undefined, 4000);

  if (!result.success) {
    return {
      advice: [],
      success: false,
      error: result.error || 'AI调用失败'
    };
  }

  // 解析AI返回
  try {
    const advice = parseAIAdviceJSON(result.content);
    return { advice, success: true };
  } catch (e) {
    return {
      advice: [],
      success: false,
      error: (e as Error).message
    };
  }
}