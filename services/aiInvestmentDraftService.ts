// services/aiInvestmentDraftService.ts
import { Ticker, ValuationData, HistoricalPoint, MarketIndex, TradeRecord } from '../types';
import { AIConfiguration } from './aiConfigService';
import { queryAI, StreamCallback, PromptTemplate } from './aiService';
import { getTradesForSymbol } from '../hooks/useTrades';
import { computeAvgCostPrice } from '../utils/positionHelper';
import { toLocalDateKey } from '../utils/priceResolver';
import { computeSMA } from '../utils/movingAverage';

// 最近交易记录格式
export interface LastTrade {
  date: string;
  action: '买入' | '卖出';
  shares: number;
  price: number;
}

// 基金数据格式
export interface FundDraftData {
  code: string;
  name: string;
  current_shares: number;
  cost_price: number;
  current_nav: number;
  today_action: '买入' | '卖出';
  action_shares: number;
  estimate_amount: number;
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

// 完整请求数据
export interface InvestmentDraftAnalysisData {
  funds: FundDraftData[];
  indices: IndexDraftData[];
}

// 草稿条目类型（与 InvestmentDraftModal 中定义一致）
export interface DraftEntry {
  fundSymbol: string;
  operation: '买入' | '卖出' | '不操作';
  amount: string;
  note: string;
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
- nav_last_10_days: 最近10天净值（数值数组，不含今日，按时间倒序，最新在前）
- ma5_last_10_days: 最近10天的5日均值（数值数组，不含今日，对应 nav_last_10_days 各日的5日均值）
- ma10_last_10_days: 最近10天的10日均值（数值数组，不含今日）
- ma20_last_10_days: 最近10天的20日均值（数值数组，不含今日）

### indices 数组（指数列表）
每个指数对象包含以下字段：
- index_name: 指数名称（字符串，如 "上证指数"、"纳斯达克100指数"）
- current_value: 当前指数值（数值）
- current_volume: 当前成交量（数值，单位：手）
- values_last_10_days: 最近10天指数值（数值数组，不含今日，按时间倒序）
- volume_last_10_days: 最近10天成交量（数值数组，不含今日）
- ma5_last_10_days: 最近10天的5日均值（数值数组，不含今日）
- ma10_last_10_days: 最近10天的10日均值（数值数组，不含今日）
- ma20_last_10_days: 最近10天的20日均值（数值数组，不含今日）`;

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
    const raw = localStorage.getItem(`fund_position_${symbol}`);
    if (raw) {
      const cfg = JSON.parse(raw);
      const initialPosition = Number(cfg.initialPosition) || 0;

      // 加上交易记录
      const trades = getTradesForSymbol(symbol);
      let buyShares = 0;
      let sellShares = 0;
      for (const t of trades) {
        if (t.type === 'buy') buyShares += t.shares;
        else sellShares += t.shares;
      }

      return initialPosition + buyShares - sellShares;
    }
  } catch (e) {
    // ignore
  }
  return 0;
}

/**
 * 格式化投资计划数据为JSON结构
 */
export function formatInvestmentDraftData(
  draftData: Record<string, DraftEntry>,
  portfolio: Ticker[],
  fundHistories: Record<string, HistoricalPoint[]>,
  indexHistories: Record<string, HistoricalPoint[]>,
  marketIndices: MarketIndex[],
  globalIndices: MarketIndex[],
  marketData: Record<string, ValuationData>
): InvestmentDraftAnalysisData {
  const today = toLocalDateKey(new Date());
  const funds: FundDraftData[] = [];

  // 处理基金数据（只处理买入或卖出操作的）
  for (const [symbol, entry] of Object.entries(draftData)) {
    if (entry.operation === '不操作' || !entry.amount) continue;

    const ticker = portfolio.find(t => t.symbol === symbol);
    if (!ticker) continue;

    const valuation = marketData[symbol];
    if (!valuation) continue;

    // 获取历史净值
    const history = fundHistories[symbol] || [];
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

    // 使用全部历史数据计算均值
    const ma5 = computeSMA(allNavValues, 5);
    const ma10 = computeSMA(allNavValues, 10);
    const ma20 = computeSMA(allNavValues, 20);

    // 取最近10天的净值和均值（倒序，最新在前）
    const navLast10Days = allNavValues.slice(-10).reverse();
    const ma5Last10 = ma5.slice(-10).reverse().map(v => v ?? 0);
    const ma10Last10 = ma10.slice(-10).reverse().map(v => v ?? 0);
    const ma20Last10 = ma20.slice(-10).reverse().map(v => v ?? 0);

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

    // 计算操作份额
    const actionAmount = parseFloat(entry.amount);
    const actionShares = valuation.currentPrice > 0
      ? actionAmount / valuation.currentPrice
      : 0;

    funds.push({
      code: symbol,
      name: ticker.name || symbol,
      current_shares: currentShares,
      cost_price: costPrice || 0,
      current_nav: valuation.currentPrice,
      today_action: entry.operation,
      action_shares: actionShares,
      estimate_amount: actionAmount,
      last_5_trades: last5Trades,
      weekly_return: weeklyReturn,
      monthly_return: monthlyReturn,
      quarterly_return: quarterlyReturn,
      halfyear_return: halfyearReturn,
      top10_stocks: top10Stocks,
      nav_last_10_days: [...navLast10Days].reverse(),
      ma5_last_10_days: ma5Last10,
      ma10_last_10_days: ma10Last10,
      ma20_last_10_days: ma20Last10
    });
  }

  // 处理指数数据
  const indices: IndexDraftData[] = [];
  const allIndices = [...marketIndices, ...globalIndices];

  for (const idx of allIndices) {
    const history = indexHistories[idx.symbol] || [];
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

    // 使用全部历史数据计算均值
    const ma5 = computeSMA(allValues, 5);
    const ma10 = computeSMA(allValues, 10);
    const ma20 = computeSMA(allValues, 20);

    // 取最近10天的数据（倒序，最新在前）
    const valuesLast10Days = allValues.slice(-10).reverse();
    const volumeLast10Days = allVolume.slice(-10).reverse();
    const ma5Last10 = ma5.slice(-10).reverse().map(v => v ?? 0);
    const ma10Last10 = ma10.slice(-10).reverse().map(v => v ?? 0);
    const ma20Last10 = ma20.slice(-10).reverse().map(v => v ?? 0);

    indices.push({
      index_name: idx.name,
      current_value: idx.current,
      current_volume: idx.volume || 0,
      values_last_10_days: [...valuesLast10Days].reverse(),
      volume_last_10_days: [...volumeLast10Days].reverse(),
      ma5_last_10_days: ma5Last10,
      ma10_last_10_days: ma10Last10,
      ma20_last_10_days: ma20Last10
    });
  }

  return { funds, indices };
}

/**
 * 加载投资计划分析模板
 */
export async function loadInvestmentDraftTemplate(): Promise<PromptTemplate | null> {
  try {
    const response = await fetch('./assets/config/ai-investment-draft-templates.json', { cache: 'no-store' });

    if (!response.ok) {
      console.error(`Failed to load investment draft templates: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data && data.templates && Array.isArray(data.templates)) {
      const enabledTemplate = data.templates.find((t: PromptTemplate) => t.enabled);
      return enabledTemplate || null;
    }

    return null;
  } catch (error) {
    console.error('Failed to load investment draft templates:', error);
    return null;
  }
}

/**
 * 执行投资计划分析
 */
export async function analyzeInvestmentDraft(
  config: AIConfiguration,
  draftData: Record<string, DraftEntry>,
  portfolio: Ticker[],
  fundHistories: Record<string, HistoricalPoint[]>,
  indexHistories: Record<string, HistoricalPoint[]>,
  marketIndices: MarketIndex[],
  globalIndices: MarketIndex[],
  marketData: Record<string, ValuationData>,
  onChunk?: StreamCallback
): Promise<{ content: string; success: boolean; error?: string }> {
  // 加载模板
  const template = await loadInvestmentDraftTemplate();

  if (!template) {
    return {
      content: '未找到启用的投资计划分析模板',
      success: false,
      error: '未找到启用的投资计划分析模板'
    };
  }

  // 格式化数据
  const analysisData = formatInvestmentDraftData(
    draftData, portfolio, fundHistories, indexHistories,
    marketIndices, globalIndices, marketData
  );

  // 转为JSON字符串
  const jsonContent = JSON.stringify(analysisData, null, 2);

  // 替换模板变量
  const prompt = template.template
    .replace(/{json_schema}/g, JSON_SCHEMA)
    .replace(/{json_content}/g, jsonContent);

  // 调用AI
  return queryAI(config, prompt, undefined, onChunk);
}