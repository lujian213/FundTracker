import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Ticker, ValuationData, MarketType, MarketIndex, BackupData, CardStatus, ManageItemType, ManageSelectionKey } from './types';
import { fetchFundData, fetchMarketIndices, forceFetchFundHistory, fetchIndexHistory, maybeTriggerHistoryRefresh } from './services/fundService';
import { toLocalDateKey } from './utils/priceResolver';
import * as cacheService from './services/cacheService';
import { isFeatureEnabled } from './services/systemSettingsService';
import { TickerCard } from './components/TickerCard';
import IndexCard from './components/IndexCard';
import { AddTickerModal } from './components/AddTickerModal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { FundDetailsModal } from './components/FundDetailsModal';
import { IndexDetailsModal } from './components/IndexDetailsModal';
import { MarketNewsTicker } from './components/MarketNewsTicker';
import OverallProfitModal from './components/OverallProfitModal';
import TransactionsModal from './components/TransactionsModal';
import PositionsModal from './components/PositionsModal';
import InvestmentNoticeModal from './components/InvestmentNoticeModal';
import InvestmentDraftModal from './components/InvestmentDraftModal';
import VirtualTradeModal from './components/VirtualTradeModal';
import BackupSettingsModal from './components/BackupSettingsModal';
import SyncManagementModal from './components/SyncManagementModal';
import SyncConfirmationModal from './components/SyncConfirmationModal';
import AIMenuItem from './components/AIMenuItem';
import AIConfigModal from './components/AIConfigModal';
import CalendarModal from './components/CalendarModal';
import JobLogModal from './components/JobLogModal';
import SystemConfigModal from './components/SystemConfigModal';
import { getAvailableStrategyKeys } from './services/strategyRegistry';
import {
  buildBackupData, downloadBackupFile, applyBackupData,
  readBackupConfig,
} from './utils/backupService';
import { VERSION } from './version';
import { applySyncUpdates } from './services/syncService';
import { TimerJobErrorProvider, useTimerJobErrors } from './contexts/TimerJobErrorContext';
import { NewsProvider, useNews } from './contexts/NewsContext';
import { getTimerJobScheduler } from './services/timerJobScheduler';
import { refreshTickerAlerts, loadBackgroundJobPrompts } from './services/backgroundJobService';
import { queryAI, AIResponse } from './services/aiService';
import { getAIConfig } from './services/aiConfigService';
import { refreshStrategyRecommendations } from './services/strategyRecommendationService';
import { updateCalendarData, getEventsForYear, getUpcomingEvents, loadCalendarData } from './services/calendarService';
import { formatDateDisplay } from './utils/dateFormat';

type SortOrder = 'asc' | 'desc';

const DEFAULT_INDICES = ['1.000001', '0.399001', '0.399006'];
const DEFAULT_GLOBAL_INDICES = ['100.NDX', '100.SPX', '100.HSI'];

const INDEX_SYMBOL_ALIASES: Record<string, string> = {
  NDX: '100.NDX',
  SPX: '100.SPX',
  HSI: '100.HSI',
};

const INDEX_NAME_HINTS: Record<string, string> = {
  '1.000001': '上证指数',
  '0.399001': '深证成指',
  '0.399006': '创业板指',
  '100.NDX': '纳斯达克',
  '100.SPX': '标普500',
  '100.HSI': '恒生指数',
};

const normalizeIndexSymbol = (symbol: string): string => {
  const normalized = (symbol || '').trim().toUpperCase();
  if (INDEX_SYMBOL_ALIASES[normalized]) return INDEX_SYMBOL_ALIASES[normalized];
  return normalized;
};

const createPlaceholderIndex = (symbol: string): MarketIndex => {
  const normalized = normalizeIndexSymbol(symbol);
  return {
    symbol: normalized,
    name: INDEX_NAME_HINTS[normalized] || `指数 ${normalized}`,
    current: 0,
    change: 0,
    changePercent: 0,
    lastUpdated: '等待更新',
  };
};

const mergeIndicesForDisplay = (
  configSymbols: string[],
  incoming: MarketIndex[],
  previous: MarketIndex[]
): MarketIndex[] => {
  if (configSymbols.length === 0) return [];

  const bySymbol = new Map<string, MarketIndex>();
  previous.forEach(item => bySymbol.set(normalizeIndexSymbol(item.symbol), { ...item, symbol: normalizeIndexSymbol(item.symbol) }));
  incoming.forEach(item => bySymbol.set(normalizeIndexSymbol(item.symbol), { ...item, symbol: normalizeIndexSymbol(item.symbol) }));

  return configSymbols.map(sym => {
    const normalized = normalizeIndexSymbol(sym);
    return bySymbol.get(normalized) || createPlaceholderIndex(normalized);
  });
};

const createManageSelectionKey = (type: ManageItemType, value: string): ManageSelectionKey => `${type}:${value}`;

/**
 * 检查未来三天内（包括今天）是否有节假日/交割日事件
 * 返回：{ hasUpcoming: boolean, nextEvent: { date: string, content: string, type: string } | null }
 */
function checkUpcomingCalendarEvents(): { hasUpcoming: boolean; nextEvent: { date: string; content: string; type: string } | null } {
  const upcomingEvents = getUpcomingEvents(3);
  if (upcomingEvents.length === 0) {
    return { hasUpcoming: false, nextEvent: null };
  }
  const first = upcomingEvents[0];
  return {
    hasUpcoming: true,
    nextEvent: {
      date: first.date.slice(5), // 只保留月-日
      content: first.content,
      type: first.type
    }
  };
}

/**
 * 解析 Calendar AI 响应
 */
interface CalendarAIResponse {
  market?: string;
  date?: string;
  content?: string;
  description?: string;
}

interface CalendarEventInput {
  date: string;
  content: string;
  description: string;
  market?: string;
}

function parseCalendarAIResponse(response: string): CalendarEventInput[] {
  try {
    let cleanedResponse = response.trim();

    // 尝试从代码块中提取JSON（新格式：AI输出包含思考过程 + ```json ... ```代码块）
    const codeBlockMatch = cleanedResponse.match(/```json\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      cleanedResponse = codeBlockMatch[1].trim();
    } else if (cleanedResponse.startsWith('```')) {
      // 旧格式：从开头开始
      const firstNewline = cleanedResponse.indexOf('\n');
      if (firstNewline !== -1) {
        cleanedResponse = cleanedResponse.slice(firstNewline + 1);
      }
      if (cleanedResponse.endsWith('```')) {
        cleanedResponse = cleanedResponse.slice(0, -3).trim();
      }
    }

    const parsed = JSON.parse(cleanedResponse);
    if (!Array.isArray(parsed)) {
      console.warn('[Calendar] AI response is not an array');
      return [];
    }

    return parsed.filter((item: CalendarAIResponse) =>
      item.date && item.content
    ).map((item: CalendarAIResponse) => ({
      market: typeof item.market === 'string' ? item.market : '',
      date: String(item.date),
      content: typeof item.content === 'string' ? item.content : '',
      description: typeof item.description === 'string' ? item.description : '',
    }));
  } catch (e) {
    console.error('[Calendar] Failed to parse AI response:', e);
    return [];
  }
}

/**
 * 公共函数：从网站获取内容（通过jina.ai网页抓取）
 */
async function fetchWebContent(url: string, logPrefix: string): Promise<string> {
  const JINA_URL = `https://r.jina.ai/${url}`;
  try {
    const response = await fetch(JINA_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const content = await response.text();
    console.log(`[Calendar] ${logPrefix}成功获取网站内容，长度:`, content.length);
    return content;
  } catch (e) {
    console.error(`[Calendar] ${logPrefix}获取网站内容失败:`, e);
    throw new Error(`无法获取网站内容: ${url}，任务失败`);
  }
}

/**
 * 公共函数：处理Calendar节假日AI请求
 */
async function processCalendarHoliday(
  promptType: string,
  url: string,
  logPrefix: string,
  calendarType: 'holiday_china' | 'holiday_hk' | 'holiday_us'
): Promise<void> {
  const aiConfig = getAIConfig();
  if (!aiConfig || !aiConfig.apiKey) {
    throw new Error('未配置 AI API Key');
  }

  // 获取网站内容
  const webContent = await fetchWebContent(url, logPrefix);

  // 检查内容是否包含年份（基本验证）
  const currentYear = new Date().getFullYear().toString();
  if (!webContent.includes(currentYear) && !webContent.includes(String(parseInt(currentYear) + 1))) {
    console.warn(`[Calendar] ${logPrefix}网站内容可能不包含有效年份信息`);
  }

  // 加载提示词模板
  const prompts = await loadBackgroundJobPrompts();
  const prompt = prompts.find(p => p.type === promptType);
  if (!prompt) {
    throw new Error(`未找到 ${promptType} 提示词模板`);
  }

  // 填充变量（包括网站内容）
  const current_date = formatDateDisplay(new Date());
  const current_year = new Date().getFullYear().toString();
  const filledPrompt = prompt.template
    .replace(/{web_content}/g, webContent)
    .replace(/{current_date}/g, current_date)
    .replace(/{year}/g, current_year);

  // 从提示词模板中获取maxTokens和temperature参数
  const maxTokens = prompt.maxTokens;
  const temperature = prompt.temperature;

  // 调用 AI
  const response: AIResponse = await queryAI(aiConfig, filledPrompt, undefined, undefined, maxTokens, temperature);

  if (!response.success) {
    throw new Error(response.error || 'AI 请求失败');
  }

  // 解析响应
  const results = parseCalendarAIResponse(response.content);

  // 更新 calendar 数据
  updateCalendarData(calendarType, results);

  // 作为子任务，计算并更新交割日信息
  calculateDeliveryDates();
}

/**
 * 刷新 Calendar A股节假日信息
 */
async function refreshCalendarHolidays(): Promise<void> {
  await processCalendarHoliday(
    'calendar_holiday_china',
    'https://www.sse.com.cn/disclosure/dealinstruc/closed',
    'A股',
    'holiday_china'
  );
}

/**
 * 刷新 Calendar 港股节假日信息
 */
async function refreshCalendarHolidaysHK(): Promise<void> {
  await processCalendarHoliday(
    'calendar_holiday_hk',
    'https://invest101.com.hk/hong-kong-stock-market-holiday',
    '港股',
    'holiday_hk'
  );
}

/**
 * 刷新 Calendar 美股节假日信息
 */
async function refreshCalendarHolidaysUS(): Promise<void> {
  await processCalendarHoliday(
    'calendar_holiday_us',
    'https://invest101.com.hk/stock-us-holidays',
    '美股',
    'holiday_us'
  );
}

/**
 * 计算交割日信息（基于已有节假日数据计算，不再使用AI）
 * 在每个calendar节假日任务执行结束后作为子任务调用
 */
function calculateDeliveryDates(): void {
  const year = new Date().getFullYear();
  const results: Array<{ date: string; content: string; description: string; market?: string }> = [];

  // Helper: 获取某月的第N个星期几
  function getNthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
    const firstDay = new Date(year, month, 1);
    let count = 0;
    for (let d = 1; d <= 31; d++) {
      const date = new Date(year, month, d);
      if (date.getMonth() !== month) break;
      if (date.getDay() === weekday) {
        count++;
        if (count === n) return date;
      }
    }
    return new Date(year, month, 1);
  }

  // Helper: 检查是否为节假日（需要考虑A股节假日）
  function isHoliday(date: Date): boolean {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const data = loadCalendarData();
    const events = data[dateStr] || [];
    return events.some(e => e.type === 'holiday_china');
  }

  // Helper: 找到下一个营业日（跳过周末和节假日）
  function getNextBusinessDay(date: Date): Date {
    let next = new Date(date);
    while (next.getDay() === 0 || next.getDay() === 6 || isHoliday(next)) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  // Helper: 找到上一个营业日
  function getPrevBusinessDay(date: Date): Date {
    let prev = new Date(date);
    while (prev.getDay() === 0 || prev.getDay() === 6 || isHoliday(prev)) {
      prev.setDate(prev.getDate() - 1);
    }
    return prev;
  }

  // 月份遍历（1-12月）
  for (let month = 0; month < 12; month++) {
    // A股 - 中金所股指期货/期权交割日：每月第三个星期五
    const thirdFriday = getNthWeekdayOfMonth(year, month, 5, 3);
    let adjThirdFriday = thirdFriday;
    // 遇法定节假日顺延至下一交易日
    if (isHoliday(thirdFriday)) {
      adjThirdFriday = getNextBusinessDay(thirdFriday);
    }
    results.push({
      date: `${year}-${String(month + 1).padStart(2, '0')}-${String(adjThirdFriday.getDate()).padStart(2, '0')}`,
      content: 'A股-中金所股指期货/期权交割日',
      description: 'A股：每月第三个星期五，遇法定节假日顺延至下一交易日'
    });

    // A股 - 上交所/深交所ETF期权交割日：每月第四个星期三
    const fourthWednesday = getNthWeekdayOfMonth(year, month, 3, 4);
    let adjFourthWednesday = fourthWednesday;
    if (isHoliday(fourthWednesday)) {
      adjFourthWednesday = getNextBusinessDay(fourthWednesday);
    }
    results.push({
      date: `${year}-${String(month + 1).padStart(2, '0')}-${String(adjFourthWednesday.getDate()).padStart(2, '0')}`,
      content: 'A股-上交所/深交所ETF期权交割日',
      description: 'A股：每月第四个星期三，遇法定节假日顺延'
    });

    // A股 - 富时中国A50指数期货（SGX）：每月倒数第二个营业日
    // new Date(year, month + 2, 0) 获取month月的最后一天
    let lastDay = new Date(year, month + 2, 0);
    let secondLastBusinessDay = getPrevBusinessDay(lastDay);
    results.push({
      date: `${year}-${String(month + 1).padStart(2, '0')}-${String(secondLastBusinessDay.getDate()).padStart(2, '0')}`,
      content: 'A股-富时中国A50指数期货（SGX）交割日',
      description: 'A股：每月倒数第二个营业日，新加坡交易所规则'
    });

    // 港股 - 恒指期货及期权月度交割日：合约月份倒数第二个营业日
    let hkLastDay = new Date(year, month + 2, 0);
    let hkSecondLastBusinessDay = getPrevBusinessDay(hkLastDay);
    results.push({
      date: `${year}-${String(month + 1).padStart(2, '0')}-${String(hkSecondLastBusinessDay.getDate()).padStart(2, '0')}`,
      content: '港股-恒指/国企股/科指期货及期权交割日',
      description: '港股：合约月份倒数第二个营业日'
    });

    // 美股 - 月度期权到期日：每月第三个星期五
    const usThirdFriday = getNthWeekdayOfMonth(year, month, 5, 3);
    results.push({
      date: `${year}-${String(month + 1).padStart(2, '0')}-${String(usThirdFriday.getDate()).padStart(2, '0')}`,
      content: '美股-月度期权到期日',
      description: '美股：每月第三个星期五'
    });

    // 美股 - 三巫日：3,6,9,12月的第三个星期五
    if (month === 2 || month === 5 || month === 8 || month === 11) {
      results.push({
        date: `${year}-${String(month + 1).padStart(2, '0')}-${String(usThirdFriday.getDate()).padStart(2, '0')}`,
        content: '美股-三巫日',
        description: '美股：股指期货+股指期权+个股期权同时到期'
      });
    }
  }

  // 更新 calendar 数据
  updateCalendarData('delivery', results);
}

const AppContent: React.FC = () => {
  const [portfolio, setPortfolio] = useState<Ticker[]>(() => {
    try {
      const saved = localStorage.getItem('fund_portfolio');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  const [indicesConfig, setIndicesConfig] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('fund_indices_config');
      return saved ? JSON.parse(saved) : DEFAULT_INDICES;
    } catch (e) { return DEFAULT_INDICES; }
  });

  const [globalIndicesConfig, setGlobalIndicesConfig] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('fund_global_indices_config');
      return saved ? JSON.parse(saved) : DEFAULT_GLOBAL_INDICES;
    } catch (e) { return DEFAULT_GLOBAL_INDICES; }
  });

  const [marketData, setMarketData] = useState<Record<string, ValuationData>>(() => {
    const fromCache = cacheService.getAllValuations();
    if (Object.keys(fromCache).length > 0) return fromCache;
    try {
      const saved = localStorage.getItem('fund_market_data');
      return saved ? JSON.parse(saved) : {};
    } catch (e) { return {}; }
  });

  const [marketIndices, setMarketIndices] = useState<MarketIndex[]>(() => {
    try {
      const saved = localStorage.getItem('fund_market_indices_cache');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  const [globalIndices, setGlobalIndices] = useState<MarketIndex[]>(() => {
    try {
      const saved = localStorage.getItem('fund_global_indices_cache');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
    const saved = localStorage.getItem('fund_sort_order');
    return (saved === 'asc' || saved === 'desc') ? saved : 'desc';
  });

  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);
  const [showOverallProfit, setShowOverallProfit] = useState<boolean>(false);
  const [showTransactions, setShowTransactions] = useState<boolean>(false);
  const [showPositions, setShowPositions] = useState<boolean>(false);
  const [isInvestmentNoticeModalOpen, setIsInvestmentNoticeModalOpen] = useState<boolean>(false);
  const [isInvestmentDraftModalOpen, setIsInvestmentDraftModalOpen] = useState<boolean>(false);
  const [selectedItems, setSelectedItems] = useState<Set<ManageSelectionKey>>(new Set());
  const [backgroundTasks, setBackgroundTasks] = useState<number>(0);

  // Per-symbol card status for funds (keyed by symbol) and indices (keyed by normalized symbol)
  const [fundStatuses, setFundStatuses] = useState<Record<string, CardStatus>>({});
  const [indexStatuses, setIndexStatuses] = useState<Record<string, CardStatus>>({});

  // viewingSymbol 和 viewingFromDraft 合并为一个状态对象，确保同时更新
  const [viewingFund, setViewingFund] = useState<{ symbol: string; fromDraft: boolean } | null>(null);
  // 跟踪上一次 viewingFund 是否为非 null，用于判断是否需要进场动画
  const wasViewingFundOpenRef = useRef<boolean>(false);
  // 更新 ref：每次 viewingFund 变化后，将当前值同步到 ref，供下一次渲染使用
  useEffect(() => {
    wasViewingFundOpenRef.current = viewingFund !== null;
  }, [viewingFund]);

  const [virtualTradeModalFund, setVirtualTradeModalFund] = useState<string | null>(null);
  const [viewingIndexSymbol, setViewingIndexSymbol] = useState<string | null>(null);
  const [pendingImportData, setPendingImportData] = useState<BackupData | null>(null);
  const [showBackupSettings, setShowBackupSettings] = useState<boolean>(false);
  const [showSyncManagement, setShowSyncManagement] = useState<boolean>(false);
  const [showAIConfig, setShowAIConfig] = useState<boolean>(false);
  const [showSystemConfig, setShowSystemConfig] = useState<boolean>(false);
  const [showCalendar, setShowCalendar] = useState<boolean>(false);
  const [showCalendarTooltip, setShowCalendarTooltip] = useState<boolean>(false);
  const [showJobLog, setShowJobLog] = useState<boolean>(false);
  const [showSyncConfirmation, setShowSyncConfirmation] = useState<boolean>(false);
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [autoExportTime, setAutoExportTime] = useState<string>(() => readBackupConfig().autoExportTime);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState<boolean>(() => readBackupConfig().autoBackupEnabled ?? false);
  const [autoBackupStatus, setAutoBackupStatus] = useState<'pending' | 'done' | null>(null);
  const [deepToast, setDeepToast] = useState<{ message: string, visible: boolean } | undefined>(undefined);

  const manageableItemCount = portfolio.length + indicesConfig.length + globalIndicesConfig.length;

  const clearSelectionMode = useCallback(() => {
    setSelectedItems(new Set());
    setIsSelectionMode(false);
  }, []);

  const toggleSelection = useCallback((key: ManageSelectionKey) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const confirmSelectionDeletion = useCallback(() => {
    if (selectedItems.size === 0) return;

    setPortfolio(prev => prev.filter(t => !selectedItems.has(createManageSelectionKey('fund', t.id))));
    setIndicesConfig(prev => prev.filter(symbol => !selectedItems.has(createManageSelectionKey('index', normalizeIndexSymbol(symbol)))));
    setGlobalIndicesConfig(prev => prev.filter(symbol => !selectedItems.has(createManageSelectionKey('global_index', normalizeIndexSymbol(symbol)))));
    clearSelectionMode();
  }, [selectedItems, clearSelectionMode]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 监听从 SystemConfigModal 触发的备份导入事件
  useEffect(() => {
    const handleBackupImport = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail) {
        setPendingImportData(customEvent.detail);
      }
    };

    window.addEventListener('backup-import', handleBackupImport);
    return () => {
      window.removeEventListener('backup-import', handleBackupImport);
    };
  }, []);

  useEffect(() => { localStorage.setItem('fund_portfolio', JSON.stringify(portfolio)); }, [portfolio]);
  useEffect(() => { localStorage.setItem('fund_indices_config', JSON.stringify(indicesConfig)); }, [indicesConfig]);
  useEffect(() => { localStorage.setItem('fund_global_indices_config', JSON.stringify(globalIndicesConfig)); }, [globalIndicesConfig]);
  // fund_market_data 由 cacheService.setValuation() 写入，此处不重复同步
  useEffect(() => { localStorage.setItem('fund_sort_order', sortOrder); }, [sortOrder]);
  useEffect(() => { localStorage.setItem('fund_market_indices_cache', JSON.stringify(marketIndices)); }, [marketIndices]);
  useEffect(() => { localStorage.setItem('fund_global_indices_cache', JSON.stringify(globalIndices)); }, [globalIndices]);

  useEffect(() => {
    if (!isSelectionMode) return;

    const validKeys = new Set<ManageSelectionKey>([
      ...portfolio.map(item => createManageSelectionKey('fund', item.id)),
      ...indicesConfig.map(symbol => createManageSelectionKey('index', normalizeIndexSymbol(symbol))),
      ...globalIndicesConfig.map(symbol => createManageSelectionKey('global_index', normalizeIndexSymbol(symbol))),
    ]);

    setSelectedItems(prev => {
      const next = new Set(Array.from(prev).filter(key => validKeys.has(key)));
      return next.size === prev.size ? prev : next;
    });

    if (validKeys.size === 0) clearSelectionMode();
  }, [portfolio, indicesConfig, globalIndicesConfig, isSelectionMode, clearSelectionMode]);

  const updateSingleFund = useCallback(async (symbol: string) => {
    try {
      const data = await fetchFundData(symbol);
      if (data) {
        cacheService.setValuation(symbol, data);
        // Append intraday point based on this valuation (lastUpdated preferred inside append)
        try { cacheService.appendIntradayPoint(symbol, data); } catch (e) { /* swallow */ }
        // Use getValuation to get enhanced data with accuracy adjustments
        const enhancedData = cacheService.getValuation(symbol) || data;
        setMarketData(prev => ({ ...prev, [symbol]: enhancedData }));
        setPortfolio(prev => prev.map(item =>
          item.symbol === symbol && !item.name ? { ...item, name: enhancedData.name } : item
        ));
        setFundStatuses(prev => ({ ...prev, [symbol]: 'ok' }));

        // 自动历史补全：当估值返回的 netWorthDate 比本地缓存的历史最后日期更新时，触发对该 symbol 的强制历史刷新
        try {
          // increment backgroundTasks optimistically and call helper; helper does fire-and-forget fetch
          setBackgroundTasks(prev => prev + 1);
          maybeTriggerHistoryRefresh(symbol, enhancedData.netWorthDate).finally(() => {
            setBackgroundTasks(prev => Math.max(0, prev - 1));
          });
        } catch (e) { setBackgroundTasks(prev => Math.max(0, prev - 1)); }
      } else {
        setFundStatuses(prev => ({ ...prev, [symbol]: 'error' }));
      }
    } catch {
      setFundStatuses(prev => ({ ...prev, [symbol]: 'error' }));
    } finally { setBackgroundTasks(prev => Math.max(0, prev - 1)); }
  }, []);

  const runBatchUpdate = useCallback(async (targets: Ticker[]) => {
    if (targets.length === 0) return;
    setBackgroundTasks(prev => prev + targets.length);
    const queue = [...targets];
    const workers = Array(Math.min(3, targets.length)).fill(null).map(async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item) await updateSingleFund(item.symbol);
      }
    });
    await Promise.all(workers);
  }, [updateSingleFund]);

  const runBatchHistoryUpdate = useCallback(async (targets: Ticker[]) => {
    if (targets.length === 0) return;
    const queue = [...targets];
    const workers = Array(Math.min(3, targets.length)).fill(null).map(async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item) {
          try { await forceFetchFundHistory(item.symbol); } catch { /* ignore individual errors */ }
        }
      }
    });
    await Promise.all(workers);
  }, []);

  const refreshMarketIndicesAsync = useCallback(async (ignoreCache: boolean = false) => {
    const fetchDomestic = async () => {
      if (indicesConfig.length === 0) {
        setMarketIndices([]);
        return;
      }
      try {
        const data = await fetchMarketIndices(indicesConfig, ignoreCache);
        setMarketIndices(prev => mergeIndicesForDisplay(indicesConfig, data, prev));
        // mark fetched symbols as ok, any configured but missing as error
        const fetchedSet = new Set(data.map(d => normalizeIndexSymbol(d.symbol)));
        setIndexStatuses(prev => {
          const next = { ...prev };
          indicesConfig.forEach(sym => {
            const n = normalizeIndexSymbol(sym);
            next[n] = fetchedSet.has(n) ? 'ok' : 'error';
          });
          return next;
        });
        // Append intraday points for each fetched index
        try {
          data.forEach(d => {
            try {
              cacheService.appendIntradayPoint(d.symbol, { value: d.current, lastUpdated: d.lastUpdated, equityReturn: d.changePercent });
            } catch (e) { /* ignore per-index errors */ }
          });
        } catch (e) { /* ignore */ }
      } catch {
        setMarketIndices(prev => mergeIndicesForDisplay(indicesConfig, [], prev));
        setIndexStatuses(prev => {
          const next = { ...prev };
          indicesConfig.forEach(sym => { next[normalizeIndexSymbol(sym)] = 'error'; });
          return next;
        });
      }
    };

    const fetchGlobal = async () => {
      if (globalIndicesConfig.length === 0) {
        setGlobalIndices([]);
        return;
      }
      try {
        const data = await fetchMarketIndices(globalIndicesConfig, ignoreCache);
        setGlobalIndices(prev => mergeIndicesForDisplay(globalIndicesConfig, data, prev));
        const fetchedSet = new Set(data.map(d => normalizeIndexSymbol(d.symbol)));
        setIndexStatuses(prev => {
          const next = { ...prev };
          globalIndicesConfig.forEach(sym => {
            const n = normalizeIndexSymbol(sym);
            next[n] = fetchedSet.has(n) ? 'ok' : 'error';
          });
          return next;
        });
        // Append intraday points for each fetched global index
        try {
          data.forEach(d => {
            try {
              cacheService.appendIntradayPoint(d.symbol, { value: d.current, lastUpdated: d.lastUpdated, equityReturn: d.changePercent });
            } catch (e) { /* ignore per-index errors */ }
          });
        } catch (e) { /* ignore */ }
      } catch {
        setGlobalIndices(prev => mergeIndicesForDisplay(globalIndicesConfig, [], prev));
        setIndexStatuses(prev => {
          const next = { ...prev };
          globalIndicesConfig.forEach(sym => { next[normalizeIndexSymbol(sym)] = 'error'; });
          return next;
        });
      }
    };

    await Promise.allSettled([fetchDomestic(), fetchGlobal()]);
  }, [indicesConfig, globalIndicesConfig]);

  // 刷新指数历史数据
  const refreshIndexHistoryAsync = useCallback(async (ignoreCache: boolean = false) => {
    const allIndexSymbols = [...indicesConfig, ...globalIndicesConfig];
    if (allIndexSymbols.length === 0) return;

    const queue = [...allIndexSymbols];
    const workers = Array(Math.min(3, allIndexSymbols.length)).fill(null).map(async () => {
      while (queue.length > 0) {
        const symbol = queue.shift();
        if (symbol) {
          try { await fetchIndexHistory(symbol, ignoreCache); } catch { /* ignore individual errors */ }
        }
      }
    });
    await Promise.all(workers);
  }, [indicesConfig, globalIndicesConfig]);

  const displayDomesticIndices = useMemo(
    () => mergeIndicesForDisplay(indicesConfig, marketIndices, marketIndices),
    [indicesConfig, marketIndices]
  );

  const displayGlobalIndices = useMemo(
    () => mergeIndicesForDisplay(globalIndicesConfig, globalIndices, globalIndices),
    [globalIndicesConfig, globalIndices]
  );

  const refreshAll = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.allSettled([
        runBatchUpdate(portfolio),
        refreshMarketIndicesAsync(true),
        runBatchHistoryUpdate(portfolio),
        refreshIndexHistoryAsync(true),
      ]);
    } finally { setIsRefreshing(false); }
  }, [portfolio, isRefreshing, runBatchUpdate, refreshMarketIndicesAsync, runBatchHistoryUpdate, refreshIndexHistoryAsync]);

  useEffect(() => {
    if (portfolio.length > 0) {
      const targets = portfolio.filter(p => !marketData[p.symbol]);
      if (targets.length > 0) runBatchUpdate(targets);
    }
  }, [portfolio.length]);

  useEffect(() => { refreshMarketIndicesAsync(); }, [indicesConfig, globalIndicesConfig]);

  // Timer Job Scheduler: handles fund valuation, history, and market index refresh
  const { addError } = useTimerJobErrors();
  const { reload: reloadNews } = useNews();

  // 用于跟踪是否已触发过初始后台任务
  const initialJobTriggeredRef = useRef(false);

  useEffect(() => {
    const scheduler = getTimerJobScheduler();

    // Register error callback
    scheduler.onError((jobId, jobName, error) => {
      console.error(`[TimerJob] ${jobName} (${jobId}) failed:`, error);
      addError({
        jobName,
        message: error.message || 'Unknown error',
      });
    });

    // Register job handlers
    scheduler.registerHandler('fund-valuation-refresh', async () => {
      await runBatchUpdate(portfolio);
    });

    scheduler.registerHandler('fund-history-refresh', async () => {
      await runBatchHistoryUpdate(portfolio);
    });

    scheduler.registerHandler('market-index-refresh', async () => {
      await refreshMarketIndicesAsync(true);
    });

    scheduler.registerHandler('index-history-refresh', async () => {
      await refreshIndexHistoryAsync(true);
    });

    scheduler.registerHandler('news-refresh', async () => {
      reloadNews();
    });

    // 注册后台任务处理器
    scheduler.registerHandler('holiday-info-refresh', async () => {
      await refreshTickerAlerts('holiday', () => portfolio, setPortfolio);
    });

    scheduler.registerHandler('delivery-info-refresh', async () => {
      await refreshTickerAlerts('delivery', () => portfolio, setPortfolio);
    });

    // 注册策略推荐任务处理器
    scheduler.registerHandler('strategy-recommendation-refresh', async () => {
      await refreshStrategyRecommendations(() => portfolio, setPortfolio);
    });

    // 注册 Calendar 任务处理器
    scheduler.registerHandler('calendar_holiday_china', async () => {
      await refreshCalendarHolidays();
    });

    scheduler.registerHandler('calendar_holiday_hk', async () => {
      await refreshCalendarHolidaysHK();
    });

    scheduler.registerHandler('calendar_holiday_us', async () => {
      await refreshCalendarHolidaysUS();
    });

    // Set context with current portfolio
    scheduler.setContext({ portfolio });

    // Start the scheduler
    scheduler.start();

    // 页面加载时触发一次后台任务（延迟执行，避免阻塞首屏渲染）
    // 使用 ref 确保只触发一次，避免 portfolio 变化时重复触发
    if (portfolio.length > 0 && !initialJobTriggeredRef.current) {
      initialJobTriggeredRef.current = true;
      setTimeout(() => {
        scheduler._triggerJob?.('holiday-info-refresh');
        scheduler._triggerJob?.('delivery-info-refresh');
      }, 5000);

      // 策略推荐任务延迟 6 秒执行
      setTimeout(() => {
        scheduler._triggerJob?.('strategy-recommendation-refresh');
      }, 6000);

      // Calendar 任务延迟 7 秒执行
      setTimeout(() => {
        scheduler._triggerJob?.('calendar_holiday_china');
        scheduler._triggerJob?.('calendar_holiday_hk');
        scheduler._triggerJob?.('calendar_holiday_us');
      }, 7000);
    }

    return () => scheduler.stop();
  }, [portfolio, runBatchUpdate, runBatchHistoryUpdate, refreshMarketIndicesAsync, refreshIndexHistoryAsync, addError, reloadNews]);

  // 自动导出定时器
  useEffect(() => {
    let preBannerTimer: ReturnType<typeof setTimeout> | null = null;
    let exportTimer: ReturnType<typeof setTimeout> | null = null;

    function schedule() {
      if (!autoBackupEnabled) return; // Only schedule if auto backup is enabled

      const [hh, mm] = autoExportTime.split(':').map(Number);
      const now = new Date();
      const target = new Date(now);
      target.setHours(hh, mm, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
      const msToExport = target.getTime() - now.getTime();
      const msToPreBanner = Math.max(0, msToExport - 5000);

      preBannerTimer = setTimeout(() => {
        setAutoBackupStatus('pending');
        exportTimer = setTimeout(async () => {
          const data = await buildBackupData(portfolio, indicesConfig, globalIndicesConfig, marketIndices, globalIndices);
          downloadBackupFile(data, true);
          setAutoBackupStatus('done');
          setTimeout(() => setAutoBackupStatus(null), 3000);
          schedule(); // schedule next day
        }, Math.min(5000, msToExport));
      }, msToPreBanner);
    }

    schedule();

    // When Tab becomes visible again, re-schedule to correct drift
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        if (preBannerTimer) clearTimeout(preBannerTimer);
        if (exportTimer) clearTimeout(exportTimer);
        if (autoBackupEnabled) { // Only reschedule if auto backup is enabled
          schedule();
        }
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (preBannerTimer) clearTimeout(preBannerTimer);
      if (exportTimer) clearTimeout(exportTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoExportTime, autoBackupEnabled]);

  const sortedPortfolio = useMemo(() => {
    const today = toLocalDateKey(new Date());

    return [...portfolio].sort((a, b) => {
      const valA = marketData[a.symbol];
      const valB = marketData[b.symbol];

      // 判断是否有当日估值：realtimeDate 等于今天日期
      const hasTodayValuationA = valA?.realtimeDate === today;
      const hasTodayValuationB = valB?.realtimeDate === today;

      // A类（有当日估值）排在B类（无当日估值）前面
      if (hasTodayValuationA && !hasTodayValuationB) return -1;
      if (!hasTodayValuationA && hasTodayValuationB) return 1;

      // 同类内部按涨跌幅排序
      const changeA = valA?.changePercentage ?? -9999;
      const changeB = valB?.changePercentage ?? -9999;
      return sortOrder === 'asc' ? changeA - changeB : changeB - changeA;
    });
  }, [portfolio, marketData, sortOrder]);

  const handleExport = async () => {
    const data = await buildBackupData(portfolio, indicesConfig, globalIndicesConfig, marketIndices, globalIndices);
    downloadBackupFile(data, false);
    setIsMenuOpen(false);
  };

  // 处理数据同步点击，先检查配置
  const handleDataSyncClick = () => {
    setIsMenuOpen(false);
    const configStr = localStorage.getItem('eggfund_sync_config');
    if (!configStr) {
      setSyncErrorMessage('请先在"同步配置"中设置 Eggfund 账户信息');
      return;
    }
    try {
      const config = JSON.parse(configStr);
      if (!config.eggfundUsername || !config.eggfundPassword) {
        setSyncErrorMessage('同步配置信息不完整，请检查用户名和密码');
        return;
      }
    } catch (e) {
      setSyncErrorMessage('同步配置格式错误，请重新配置');
      return;
    }
    setShowSyncConfirmation(true);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        // Compatibility: support old format (top-level array or object without new fields)
        // Old format: indices/globalIndices were string[], new format is BackupIndex[]
        const normalizeIndices = (arr: any[]): any[] =>
          arr.map(item => typeof item === 'string' ? { symbol: item } : item);

        const normalized: BackupData = {
          portfolio: Array.isArray(imported) ? imported : (imported.portfolio || []),
          indices: normalizeIndices(imported.indices || []),
          globalIndices: normalizeIndices(imported.globalIndices || []),
          positions: imported.positions || {},
          trades: imported.trades || {},
          config: imported.config || { autoExportTime: '16:00' },
        };
        setPendingImportData(normalized);
      } catch { /* ignore parse errors */ }
    };
    reader.readAsText(file);
    // Reset so the same file can be re-imported if needed
    event.target.value = '';
    setIsMenuOpen(false);
  };

  const handleConfirmImport = useCallback(async () => {
    if (!pendingImportData) return;
    const applied = await applyBackupData(pendingImportData);
    setPortfolio(applied.portfolio);
    setIndicesConfig(applied.indicesConfig);
    setGlobalIndicesConfig(applied.globalIndicesConfig);
    if (pendingImportData.config?.autoExportTime) {
      setAutoExportTime(pendingImportData.config.autoExportTime);
    }
    if (pendingImportData.config?.autoBackupEnabled !== undefined) {
      setAutoBackupEnabled(pendingImportData.config.autoBackupEnabled);
    }
    setPendingImportData(null);
    runBatchUpdate(applied.portfolio);
    refreshMarketIndicesAsync(true);
  }, [pendingImportData, runBatchUpdate, refreshMarketIndicesAsync]);

  const renderIndexCard = (idx: MarketIndex, type: 'index' | 'global_index', status: CardStatus = 'unknown') => {
    const selectionKey = createManageSelectionKey(type, normalizeIndexSymbol(idx.symbol));
    const isSelected = selectedItems.has(selectionKey);

    return (
      <IndexCard
        key={idx.symbol}
        idx={idx}
        type={type}
        status={status}
        isSelectionMode={isSelectionMode}
        isSelected={isSelected}
        onSelect={toggleSelection}
        onClick={() => setViewingIndexSymbol(normalizeIndexSymbol(idx.symbol))}
        selectionKey={selectionKey}
      />
    );
  };

  // 从 indices 中查找当前查看的指数（确保使用最新数据）
  const viewingIndex = useMemo(() => {
    if (!viewingIndexSymbol) return null;
    const allIndices = [...displayDomesticIndices, ...displayGlobalIndices];
    return allIndices.find(idx => normalizeIndexSymbol(idx.symbol) === viewingIndexSymbol) || null;
  }, [viewingIndexSymbol, displayDomesticIndices, displayGlobalIndices]);

  return (
    <div className={`min-h-screen pb-32 transition-colors duration-300 ${isSelectionMode ? 'bg-blue-50/50' : 'bg-gray-50'}`}>
      <header className="bg-white border-b sticky top-0 z-50 shadow-sm overflow-visible">
        <div className="max-w-6xl mx-auto px-4 py-2 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className={`p-2 rounded-lg shadow-inner transition-colors ${isSelectionMode ? 'bg-blue-600' : 'bg-red-600'}`}>
              <i className="fas fa-chart-line text-white text-xl"></i>
            </div>
            <div>
              <div className="flex items-baseline space-x-2">
                <h1 className="text-xl font-bold text-gray-800 leading-tight">极简基金估值</h1>
                <span className="text-xs text-gray-400 font-medium">v{VERSION}</span>
              </div>
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-tighter">
                同步链路: {backgroundTasks > 0 ? `活跃 (${backgroundTasks})` : '就绪'} | 自动刷新开启
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 relative">
            {!isSelectionMode && (
              <button disabled={isRefreshing} onClick={refreshAll} title="刷新全部（基金和指数的实时数据、历史数据）" aria-label="刷新全部" className={`p-2 w-10 h-10 rounded-full hover:bg-gray-100 transition-all flex items-center justify-center ${isRefreshing ? 'text-red-500' : 'text-gray-400'}`}>
                <i className={`fas fa-sync-alt ${isRefreshing ? 'animate-spin' : ''}`}></i>
              </button>
            )}
            {/* Calendar 按钮 */}
            <div className="relative">
              <div
                className="relative"
                onMouseEnter={() => setShowCalendarTooltip(true)}
                onMouseLeave={() => setShowCalendarTooltip(false)}
              >
                <div className="relative">
                  <button onClick={() => setShowCalendar(true)} title="日历" aria-label="日历" className="p-2 w-10 h-10 rounded-full hover:bg-gray-100 text-gray-400 transition-all">
                    <i className="fas fa-calendar-alt"></i>
                  </button>
                  {(() => {
                    const { hasUpcoming, nextEvent } = checkUpcomingCalendarEvents();
                    if (hasUpcoming && nextEvent) {
                      return (
                        <div
                          className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white"
                          onClick={() => setShowCalendar(true)}
                          title="查看日历"
                        ></div>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
              {/* Tooltip - 鼠标悬停时显示 */}
              {showCalendarTooltip && (() => {
                const { hasUpcoming, nextEvent } = checkUpcomingCalendarEvents();
                if (hasUpcoming && nextEvent) {
                  return (
                    <div className="absolute z-[99999] w-56 bg-white rounded-lg shadow-xl border border-gray-200 p-3 text-xs"
                        style={{
                          left: '50%',
                          transform: 'translateX(-50%)',
                          top: '100%',
                          marginTop: '10px'
                        }}>
                      <div className="font-semibold text-gray-700 mb-1">即将到来的事件</div>
                      <div className="text-gray-600">
                        <span className={nextEvent.type === 'holiday' ? 'text-red-500' : 'text-amber-500'}>●</span> {nextEvent.date} {nextEvent.content}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
            {/* 系统配置按钮 */}
            <button onClick={() => setShowSystemConfig(true)} title="系统配置" aria-label="系统配置" className="p-2 w-10 h-10 rounded-full hover:bg-gray-100 text-gray-400 transition-all">
              <i className="fas fa-cog"></i>
            </button>
            {/* 日志按钮 - 仅在开关开启时显示 */}
            {isFeatureEnabled('jobLogEnabled') && (
              <button onClick={() => setShowJobLog(true)} title="后台任务日志" aria-label="后台任务日志" className="p-2 w-10 h-10 rounded-full hover:bg-gray-100 text-gray-400 transition-all">
                <i className="fas fa-list-alt"></i>
              </button>
            )}
            {/* 小型 toast 通知：在深度刷新开始/完成时短暂显示 */}
            {/** toast 位于 header 右上，短暂显示 */}
            {/** deepToast: { message: string, visible: boolean } */}
            {typeof deepToast !== 'undefined' && deepToast.visible && (
              <div className="absolute right-12 top-2 z-40">
                <div className="bg-black text-white text-xs px-3 py-1 rounded-md shadow-md">{deepToast.message}</div>
              </div>
            )}
          </div>
        </div>
        {/* Auto-backup Banner */}
        <div className={`border-t px-4 py-2 flex items-center justify-center space-x-2 transition-colors duration-300 ${autoBackupStatus ? 'bg-green-50 border-green-100 visible' : 'border-transparent invisible'}`}>
          {autoBackupStatus === 'pending' ? (
            <><i className="fas fa-spinner fa-spin text-green-500 text-xs" /><span className="text-xs font-medium text-green-700">正在自动备份数据...</span></>
          ) : (
            <><i className="fas fa-check-circle text-green-500 text-xs" /><span className="text-xs font-medium text-green-700">备份成功</span></>
          )}
        </div>
        {!isSelectionMode && <MarketNewsTicker />}
        {/* Column title bar — three-column grid matching the main content layout */}
        <div className={`border-t transition-colors duration-300 ${isSelectionMode ? 'bg-blue-50/80 border-blue-100' : 'bg-gray-50/80 border-gray-100'}`}>
          <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-[200px_1fr_200px] gap-2.5">
            {/* 大盘看板 title */}
            <div className="hidden lg:flex h-10 items-center">
              <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none m-0">大盘看板</h2>
            </div>
            {/* 中间：自选基金标题 + 操作按钮 */}
            <div className="h-10">
              {!isSelectionMode ? (
                <div className="h-full flex justify-between items-center gap-3">
                  <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none m-0 flex items-center shrink-0">
                    我的自选基金
                  </h2>
                  <div className="flex items-center space-x-2 shrink-0">
                    <button onClick={() => setShowPositions(true)} className="px-4 py-1.5 rounded-full bg-blue-600 shadow-md text-[11px] font-bold text-white hover:bg-blue-700 transition-all">持仓</button>
                    <button onClick={() => setShowOverallProfit(true)} className="px-4 py-1.5 rounded-full bg-blue-600 shadow-md text-[11px] font-bold text-white hover:bg-blue-700 transition-all">盈利</button>
                    <button onClick={() => setShowTransactions(true)} className="px-4 py-1.5 rounded-full bg-blue-600 shadow-md text-[11px] font-bold text-white hover:bg-blue-700 transition-all">交易</button>
                    <button onClick={() => setIsInvestmentNoticeModalOpen(true)} className="px-4 py-1.5 rounded-full bg-blue-600 shadow-md text-[11px] font-bold text-white hover:bg-blue-700 transition-all">投顾</button>
                    <button onClick={() => setIsInvestmentDraftModalOpen(true)} className="px-4 py-1.5 rounded-full bg-blue-600 shadow-md text-[11px] font-bold text-white hover:bg-blue-700 transition-all">草稿</button>
                    <button disabled={manageableItemCount === 0} onClick={() => { setSelectedItems(new Set()); setIsSelectionMode(true); }} className={`px-4 py-1.5 rounded-full shadow-md text-[11px] font-bold text-white transition-all ${manageableItemCount === 0 ? 'bg-blue-300 cursor-not-allowed opacity-60' : 'bg-blue-600 hover:bg-blue-700'}`}>管理</button>
                    <button onClick={() => setSortOrder(o => o === 'desc' ? 'asc' : 'desc')} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                      <i className={`fas fa-sort-amount-${sortOrder === 'asc' ? 'up' : 'down'}`}></i>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-full grid grid-cols-[auto_1fr_auto] items-center gap-3">
                  <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none m-0 flex items-center shrink-0">
                    <span className="text-blue-600 font-black">批量删除</span>
                  </h2>
                  <div className="flex items-center justify-center min-w-0">
                    {selectedItems.size > 0 && (
                      <span className="text-[10px] font-bold text-blue-500 whitespace-nowrap text-center">
                        {selectedItems.size}个项目待删除
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 shrink-0 justify-self-end">
                    <button disabled={selectedItems.size === 0} onClick={confirmSelectionDeletion} className={`px-4 py-1.5 rounded-full text-[10px] font-bold transition-all ${selectedItems.size === 0 ? 'bg-blue-100 text-blue-300 cursor-not-allowed border border-blue-100' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'}`}>确认</button>
                    <button onClick={clearSelectionMode} className="px-4 py-1.5 rounded-full bg-white border border-blue-200 text-[10px] font-bold text-blue-600">取消</button>
                  </div>
                </div>
              )}
            </div>
            {/* 全球市场 title */}
            <div className="hidden lg:flex h-10 items-center">
              <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none m-0">全球市场</h2>
            </div>
          </div>
        </div>
      </header>

      <input type="file" ref={fileInputRef} onChange={handleImport} accept=".json" className="hidden" />

      <div className="max-w-6xl mx-auto px-4 py-3 grid grid-cols-1 lg:grid-cols-[200px_1fr_200px] gap-2.5 items-start">
        <aside className="space-y-1.5">
          <div className="flex lg:flex-col overflow-x-auto lg:overflow-visible gap-1.5 pb-2 no-scrollbar">
            {displayDomesticIndices.map(idx => renderIndexCard(idx, 'index', indexStatuses[normalizeIndexSymbol(idx.symbol)] ?? 'unknown'))}
          </div>
        </aside>

        <main>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2">
            {sortedPortfolio.map(ticker => {
              const selectionKey = createManageSelectionKey('fund', ticker.id);
              return (
                <TickerCard
                  key={ticker.id}
                  ticker={ticker}
                  data={marketData[ticker.symbol]}
                  status={fundStatuses[ticker.symbol] ?? 'unknown'}
                  onClick={() => marketData[ticker.symbol] && setViewingFund({ symbol: ticker.symbol, fromDraft: false })}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedItems.has(selectionKey)}
                  onSelect={() => toggleSelection(selectionKey)}
                />
              );
            })}
          </div>
        </main>

        <aside className="space-y-1.5">
          <div className="flex lg:flex-col overflow-x-auto lg:overflow-visible gap-1.5 pb-2 no-scrollbar">
            {displayGlobalIndices.map(idx => renderIndexCard(idx, 'global_index', indexStatuses[normalizeIndexSymbol(idx.symbol)] ?? 'unknown'))}
          </div>
        </aside>
      </div>

      {!isSelectionMode && (
        <button onClick={() => setIsModalOpen(true)} className="fixed bottom-8 right-8 bg-red-600 text-white w-14 h-14 rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-90 transition-all z-30"><i className="fas fa-plus text-xl"></i></button>
      )}

      {isModalOpen && <AddTickerModal onClose={() => setIsModalOpen(false)} onAdd={async (symbols, type) => { if (type === MarketType.INDEX) { const isGlobal = (s: string) => /[A-Za-z]/.test(s) || /^(100|101|102)\./.test(s); const newDomestic = symbols.filter(s => !isGlobal(s) && !indicesConfig.includes(s)); const newGlobal = symbols.filter(s => isGlobal(s) && !globalIndicesConfig.includes(s)); if (newDomestic.length) setIndicesConfig(p => [...p, ...newDomestic]); if (newGlobal.length) setGlobalIndicesConfig(p => [...p, ...newGlobal]); } else { const existing = new Set(portfolio.map(p => p.symbol)); const news = symbols.filter(s => !existing.has(s)).map(s => ({ id: Math.random().toString(36).substr(2, 9), symbol: s, name: '', market: MarketType.FUND })); if (news.length) { setPortfolio(p => [...p, ...news]); runBatchUpdate(news); } } setIsModalOpen(false); }} isLoading={false} />}
      {showOverallProfit && <OverallProfitModal onClose={() => setShowOverallProfit(false)} onSelectFund={(sym) => { setShowOverallProfit(false); setViewingFund({ symbol: sym, fromDraft: false }); }} />}
      {showPositions && <PositionsModal portfolio={portfolio} marketData={marketData} onClose={() => setShowPositions(false)} onSelectFund={(sym) => { setShowPositions(false); setViewingFund({ symbol: sym, fromDraft: false }); }} />}
      {showTransactions && <TransactionsModal portfolio={portfolio} marketData={marketData} onClose={() => setShowTransactions(false)} onSelectFund={(sym) => { setShowTransactions(false); setViewingFund({ symbol: sym, fromDraft: false }); }} />}
      {isInvestmentNoticeModalOpen && <InvestmentNoticeModal portfolio={portfolio} onClose={() => setIsInvestmentNoticeModalOpen(false)} onSelectFund={(sym) => {
        setIsInvestmentNoticeModalOpen(false);
        // Check if sym contains query parameters for virtual trade
        if (sym.includes('?')) {
          const [fundSymbol, paramsStr] = sym.split('?');
          const params = new URLSearchParams(paramsStr);
          const tab = params.get('tab');

          // If it's a virtual trade tab request, open VirtualTradeModal
          if (tab && getAvailableStrategyKeys().includes(tab)) {
            setVirtualTradeModalFund(fundSymbol);
          } else {
            setViewingFund({ symbol: fundSymbol, fromDraft: false });
          }
        } else {
          setViewingFund({ symbol: sym, fromDraft: false });
        }
      }} marketData={marketData} />}
      {isInvestmentDraftModalOpen && <InvestmentDraftModal portfolio={portfolio} onClose={() => { setIsInvestmentDraftModalOpen(false); setViewingFund(null); }} onSelectFund={(sym) => {
        setViewingFund({ symbol: sym, fromDraft: true });
      }} marketData={marketData} sideBySide={viewingFund?.fromDraft} />}
      {viewingFund && marketData[viewingFund.symbol] && (() => {
          const fund = portfolio.find(f => f.symbol === viewingFund.symbol);
          // 使用 useRef 来跟踪上一次 viewingFund 的值，判断是否是从关闭到打开的过渡
          const shouldAnimate = viewingFund.fromDraft && !wasViewingFundOpenRef.current;
          // 从草稿窗口打开时，key 只用 fromDraft，避免切换基金时重新挂载组件导致动画
          const modalKey = viewingFund.fromDraft ? 'fromDraft' : viewingFund.symbol;
          return (
            <FundDetailsModal
              key={modalKey}
              data={marketData[viewingFund.symbol]}
              recommendedStrategy={fund?.recommended_strategy}
              onClose={() => { setViewingFund(null); }}
              position={viewingFund.fromDraft ? 'right' : 'center'}
              animateSlide={shouldAnimate}
              initialTab={viewingFund.fromDraft ? 'history' : 'intraday'}
            />
          );
        })()}
      {virtualTradeModalFund && portfolio.some(f => f.symbol === virtualTradeModalFund) && (() => {
          const fund = portfolio.find(f => f.symbol === virtualTradeModalFund);
          return (
            <VirtualTradeModal
              symbol={virtualTradeModalFund}
              fundName={fund?.name}
              onClose={() => setVirtualTradeModalFund(null)}
              valuation={marketData[virtualTradeModalFund]}
              recommendedStrategy={fund?.recommended_strategy}
            />
          );
        })()}
      {viewingIndex && <IndexDetailsModal data={viewingIndex} onClose={() => setViewingIndexSymbol(null)} />}
      <ConfirmDialog
        isOpen={!!pendingImportData}
        title="导入确认"
        message="导入将完全替换现有的基金、指数、仓位配置和交易记录，操作不可撤销。确认继续吗？"
        confirmText="确认导入"
        cancelText="取消"
        type="danger"
        onConfirm={handleConfirmImport}
        onCancel={() => setPendingImportData(null)}
      />
      {showBackupSettings && (
        <BackupSettingsModal
          autoExportTime={autoExportTime}
          autoBackupEnabled={autoBackupEnabled}
          onSave={(time, enabled) => {
            setAutoExportTime(time);
            setAutoBackupEnabled(enabled);
            setShowBackupSettings(false);
          }}
          onClose={() => setShowBackupSettings(false)}
        />
      )}
      {showSyncManagement && (
        <SyncManagementModal
          isOpen={showSyncManagement}
          onClose={() => setShowSyncManagement(false)}
          onSave={(config) => {
            // Save the sync configuration to localStorage
            localStorage.setItem('eggfund_sync_config', JSON.stringify(config));
            setShowSyncManagement(false);
          }}
          initialConfig={JSON.parse(localStorage.getItem('eggfund_sync_config') || '{}')}
        />
      )}
      {showAIConfig && (
        <AIConfigModal
          isOpen={showAIConfig}
          onClose={() => setShowAIConfig(false)}
        />
      )}
      {showCalendar && (
        <CalendarModal
          onClose={() => setShowCalendar(false)}
        />
      )}
      {showJobLog && (
        <JobLogModal
          onClose={() => setShowJobLog(false)}
        />
      )}
      {showSystemConfig && (
        <SystemConfigModal
          isOpen={showSystemConfig}
          onClose={() => setShowSystemConfig(false)}
          onSyncNow={() => {
            handleDataSyncClick();
          }}
          portfolio={portfolio}
          indicesConfig={indicesConfig}
          globalIndicesConfig={globalIndicesConfig}
          marketIndices={marketIndices}
          globalIndices={globalIndices}
          onBackupSettingsChange={(time, enabled) => {
            setAutoExportTime(time);
            setAutoBackupEnabled(enabled);
          }}
        />
      )}
      {showSyncConfirmation && (
        <SyncConfirmationModal
          isOpen={showSyncConfirmation}
          onClose={() => setShowSyncConfirmation(false)}
          onConfirm={(selectedDifferences) => {
            // Process the selected differences

            if (selectedDifferences.length > 0) {
              // Apply the sync updates
              try {
                applySyncUpdates(selectedDifferences);

                // Show success notification or refresh UI as needed
                setSyncErrorMessage(`成功同步 ${selectedDifferences.length} 个交易差异`);
              } catch (error) {
                console.error('同步过程中出现错误:', error);
                setSyncErrorMessage('同步过程中出现错误，请查看控制台了解详细信息');
              }
            }

            setShowSyncConfirmation(false);
          }}
          marketData={marketData}
        />
      )}
      {/* 同步错误/成功提示 Modal */}
      {syncErrorMessage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setSyncErrorMessage(null)}
          ></div>
          <div className="relative bg-white rounded-3xl w-full max-w-xs overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center mb-4 bg-blue-50 text-blue-600">
                <i className="fas fa-info-circle text-xl"></i>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">{syncErrorMessage}</p>
            </div>
            <div className="flex border-t border-gray-100">
              <button
                onClick={() => setSyncErrorMessage(null)}
                className="flex-1 py-4 text-sm font-bold text-blue-600 hover:bg-blue-50 transition-colors"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <TimerJobErrorProvider>
      <NewsProvider>
        <AppContent />
      </NewsProvider>
    </TimerJobErrorProvider>
  );
};

export default App;

