import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DndContext, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { Ticker, ValuationData, MarketType, MarketIndex, BackupData, CardStatus, ManageItemType, ManageSelectionKey, JobResult, HistoricalPoint, FundInfo, IndexInfo } from './types';
import { FastNewsItem } from './types/fastNewsTypes';
import { fetchFundData, fetchFundDatas, forceFetchFundHistories, fetchMarketIndices, fetchIndexHistories, maybeTriggerHistoryRefresh, normalizeIndexSymbol } from './services/fundService';
import { toLocalDateKey } from './utils/priceResolver';
import { calculateTotalTasks, createProgressCallback, incrementTaskCount } from './utils/taskCounter';
import * as marketFundService from './services/marketFundService';
import * as indexService from './services/indexService';
import * as marketNewsService from './services/marketNewsService';
import { INDEX_NAME_MAP, isDomesticIndex, isGlobalIndex, DEFAULT_INDEX_SYMBOLS, DEFAULT_INDICES, saveAllIndexInfos, getIndexSymbolsByCategory } from './services/indexService';
import { isFeatureEnabled, getSyncConfig, saveSyncConfig } from './services/systemConfigService';
import { getSortOrder, saveSortOrder, SortOrder } from './services/userPreferenceService';
import { TickerCard } from './components/TickerCard';
import IndexCard from './components/IndexCard';
import SortableIndexCard from './components/SortableIndexCard';
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
import CalendarEventTooltip from './components/CalendarEventTooltip';
import JobLogModal from './components/JobLogModal';
import SystemConfigModal from './components/SystemConfigModal';
import { SmartAddButton } from './components/SmartAddButton';
import { SmartAddProgressModal } from './components/SmartAddProgressModal';
import { SmartAddResultModal } from './components/SmartAddResultModal';
import { useSmartAddFunds } from './hooks/useSmartAddFunds';
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
import { queryAI, AIResponse } from './services/aiService';
import { getAIConfig } from './services/aiConfigService';
import { refreshStrategyRecommendations } from './services/strategyRecommendationService';
import { refreshFundProfiles, fetchFundProfile } from './services/fundProfileService';
import { refreshImportantData } from './services/importantDataService';
import { fetchWithProxy } from './services/proxyService';
import { updateCalendarData, getEventsForYear, getUpcomingEvents, loadCalendarData, getFirstEventInWorkdays, HolidayType } from './services/calendarService';
import { calculateChinaDeliveryDates, calculateHKDeliveryDates, calculateUSDeliveryDates } from './services/deliveryDateService';
import { formatDateDisplay } from './utils/dateFormat';
import { verifyStorageMigration } from './services/localStorageService';
import { mountRoot } from './services/rootService';
import { loadAllTemplates, TEMPLATE_IDS } from './services/promptTemplateService';
import { getHolidaySource } from './services/calendarHolidaySourceService';
import { processCalendarHoliday, parseCalendarAIResponse } from './services/calendarHolidayService';
// 调试面板和日志拦截器 - 仅开发环境使用（构建时会自动移除）
import { isDev } from './utils/env';
import NewsSidebar from './components/NewsSidebar';
import ImportantNewsNotifier from './components/ImportantNewsNotifier';
// 动态导入热力图组件（懒加载ECharts）
import { lazy } from 'react';
const SectorHeatmapModal = lazy(() => import('./components/SectorHeatmapModal'));

const createPlaceholderIndex = (symbol: string): MarketIndex => {
  const normalized = normalizeIndexSymbol(symbol);
  return {
    info: {
      symbol: normalized,
      name: INDEX_NAME_MAP[normalized] || `指数 ${normalized}`,
      current: 0,
      change: 0,
      changePercent: 0,
      lastUpdated: '等待更新',
    },
    intraday: [],
    history: [],
  };
};

const mergeIndicesForDisplay = (
  configSymbols: string[],
  incoming: MarketIndex[],
  previous: MarketIndex[]
): MarketIndex[] => {
  if (configSymbols.length === 0) return [];

  const bySymbol = new Map<string, MarketIndex>();

  // 辅助函数：将任意格式的指数数据转换为 MarketIndex
  const toMarketIndex = (item: any): MarketIndex | null => {
    if (!item) return null;
    // 新格式：有 info 属性
    if (item.info) {
      return {
        info: { ...item.info, symbol: normalizeIndexSymbol(item.info.symbol) },
        intraday: item.intraday || [],
        history: item.history || []
      };
    }
    // 旧格式兼容：直接有 symbol 属性
    if (item.symbol) {
      return {
        info: {
          symbol: normalizeIndexSymbol(item.symbol),
          name: item.name || '',
          current: item.current || 0,
          change: item.change || 0,
          changePercent: item.changePercent || 0,
          lastUpdated: item.lastUpdated || '',
          tradeDate: item.tradeDate,
          previousClose: item.previousClose,
          volume: item.volume,
          amount: item.amount,
        },
        intraday: [],
        history: []
      };
    }
    return null;
  };

  previous.forEach(item => {
    const normalized = toMarketIndex(item);
    if (normalized) {
      bySymbol.set(normalizeIndexSymbol(normalized.info.symbol), normalized);
    }
  });

  incoming.forEach(item => {
    const normalized = toMarketIndex(item);
    if (normalized) {
      bySymbol.set(normalizeIndexSymbol(normalized.info.symbol), normalized);
    }
  });

  return configSymbols.map(sym => {
    const normalized = normalizeIndexSymbol(sym);
    return bySymbol.get(normalized) || createPlaceholderIndex(normalized);
  });
};

const createManageSelectionKey = (type: ManageItemType, value: string): ManageSelectionKey => `${type}:${value}`;

/**
 * 检测新的重要快讯
 * 使用双重验证：code ID + 时间戳
 */
function detectNewImportantNews(
  currentNews: FastNewsItem[],
  previousNews: FastNewsItem[]
): FastNewsItem[] {
  // 获取当前重要快讯（titleColor=3）
  const currentImportant = currentNews.filter(n => n.titleColor === 3);

  // 获取上次重要快讯的code集合
  const lastCodes = marketNewsService.getLastImportantNewsCodes();

  // 检测新的重要快讯：双重验证（code + 时间）
  const newImportant = currentImportant.filter(n => {
    // 条件1：code不在上次集合中
    const isNewCode = !lastCodes.has(n.code);

    // 条件2：时间比上次最新快讯时间更晚
    // 如果上次快讯为空，则所有重要快讯都是新的
    const isNewTime = previousNews.length === 0 ||
      n.showTime > previousNews[0]?.showTime;

    return isNewCode && isNewTime;
  });

  // 更新上次重要快讯的code集合
  const newCodes = new Set(currentImportant.map(n => n.code));
  marketNewsService.setLastImportantNewsCodes(newCodes);

  return newImportant;
}

/**
 * 刷新 Calendar 节假日信息（统一处理各市场）
 */
async function refreshCalendarHolidayByType(
  promptType: string,
  calendarType: HolidayType
): Promise<void> {
  const source = await getHolidaySource(calendarType);
  if (!source) {
    throw new Error(`未找到 ${calendarType} 的节假日来源配置`);
  }
  await processCalendarHoliday(
    promptType,
    source.url,
    source.name,
    calendarType
  );
}

/**
 * 刷新 Calendar A股节假日信息
 */
async function refreshCalendarHolidaysChina(): Promise<void> {
  await refreshCalendarHolidayByType(TEMPLATE_IDS.BG_CALENDAR_HOLIDAY_CHINA, 'holiday_china');
  // A股节假日刷新成功后，计算A股交割日
  calculateChinaDeliveryDates();
}

/**
 * 刷新 Calendar 港股节假日信息
 */
async function refreshCalendarHolidaysHK(): Promise<void> {
  await refreshCalendarHolidayByType(TEMPLATE_IDS.BG_CALENDAR_HOLIDAY_HK, 'holiday_hk');
  // 港股节假日刷新成功后，计算港股交割日
  calculateHKDeliveryDates();
}

/**
 * 刷新 Calendar 美股节假日信息
 */
async function refreshCalendarHolidaysUS(): Promise<void> {
  await refreshCalendarHolidayByType(TEMPLATE_IDS.BG_CALENDAR_HOLIDAY_US, 'holiday_us');
  // 美股节假日刷新成功后，计算美股交割日
  calculateUSDeliveryDates();
}

/**
 * 刷新 Calendar 新加坡股市节假日信息
 */
async function refreshCalendarHolidaysSG(): Promise<void> {
  await refreshCalendarHolidayByType(TEMPLATE_IDS.BG_CALENDAR_HOLIDAY_SG, 'holiday_sg');
}

const AppContent: React.FC = () => {
  const [portfolio, setPortfolio] = useState<Ticker[]>(() => {
    return marketFundService.getAllTickers();
  });

  const initialIndexSymbols = indexService.getAllIndexSymbols();

  const [indicesConfig, setIndicesConfig] = useState<string[]>(
    initialIndexSymbols.length > 0 ? initialIndexSymbols : DEFAULT_INDEX_SYMBOLS
  );

  const [marketData, setMarketData] = useState<Record<string, ValuationData>>(() => {
    return marketFundService.getAllValuations();
  });

  const [marketIndices, setMarketIndices] = useState<MarketIndex[]>(() => {
    // 使用 indexService 获取所有指数数据
    return indexService.getAllMarketIndices();
  });

  const [sortOrder, setSortOrder] = useState<SortOrder>(() => getSortOrder());

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
  // 历史数据更新计数器，用于触发 fundHistories useMemo 重新计算
  const [historyUpdateCount, setHistoryUpdateCount] = useState<number>(0);

  // Per-symbol card status for funds (keyed by symbol) and indices (keyed by normalized symbol)
  const [fundStatuses, setFundStatuses] = useState<Record<string, CardStatus>>({});
  const [indexStatuses, setIndexStatuses] = useState<Record<string, CardStatus>>({});

  const [pendingIndexOrder, setPendingIndexOrder] = useState<{
    domestic: string[];
    global: string[];
  } | null>(null);

  const [originalIndexOrder, setOriginalIndexOrder] = useState<{
    domestic: string[];
    global: string[];
  } | null>(null);
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
  // 智能添加流程状态
  const { state: smartAddState, actions: smartAddActions } = useSmartAddFunds();
  const [showSmartAddProgress, setShowSmartAddProgress] = useState<boolean>(false);
  const [showSmartAddResult, setShowSmartAddResult] = useState<boolean>(false);
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [autoExportTime, setAutoExportTime] = useState<string>(() => readBackupConfig().autoExportTime);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState<boolean>(() => readBackupConfig().autoBackupEnabled ?? false);
  const [autoBackupStatus, setAutoBackupStatus] = useState<'pending' | 'done' | null>(null);
  const [deepToast, setDeepToast] = useState<{ message: string, visible: boolean } | undefined>(undefined);
  const [screenshotToast, setScreenshotToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isNewsSidebarVisible, setIsNewsSidebarVisible] = useState<boolean>(false);
  const [showSectorHeatmap, setShowSectorHeatmap] = useState<boolean>(false);

  const manageableItemCount = portfolio.length + indicesConfig.length;

  const clearSelectionMode = useCallback(() => {
    setSelectedItems(new Set());
    setIsSelectionMode(false);
    setPendingIndexOrder(null);
    setOriginalIndexOrder(null);
  }, []);

  const enterSelectionMode = useCallback(() => {
    setSelectedItems(new Set());
    setIsSelectionMode(true);
    const currentOrder = getIndexSymbolsByCategory();
    setPendingIndexOrder(currentOrder);
    setOriginalIndexOrder(currentOrder);
  }, []);

  const handleIndexDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeSymbol = active.id as string;
    const overSymbol = over.id as string;
    const isDomestic = isDomesticIndex(activeSymbol);

    if (!pendingIndexOrder) return;

    if (isDomestic) {
      const oldIndex = pendingIndexOrder.domestic.indexOf(activeSymbol);
      const newIndex = pendingIndexOrder.domestic.indexOf(overSymbol);
      if (oldIndex === -1 || newIndex === -1) return;
      setPendingIndexOrder({ ...pendingIndexOrder, domestic: arrayMove(pendingIndexOrder.domestic, oldIndex, newIndex) });
    } else {
      const oldIndex = pendingIndexOrder.global.indexOf(activeSymbol);
      const newIndex = pendingIndexOrder.global.indexOf(overSymbol);
      if (oldIndex === -1 || newIndex === -1) return;
      setPendingIndexOrder({ ...pendingIndexOrder, global: arrayMove(pendingIndexOrder.global, oldIndex, newIndex) });
    }
  }, [pendingIndexOrder]);

  const toggleSelection = useCallback((key: ManageSelectionKey) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const confirmSelectionDeletion = useCallback(() => {
    if (selectedItems.size === 0 && !pendingIndexOrder) return;

    let finalIndicesConfig = indicesConfig;
    let indicesToDelete: string[] = [];
    let finalMarketIndices: MarketIndex[] | null = null;

    // 1. 执行删除逻辑
    if (selectedItems.size > 0) {
      // 先从当前 portfolio 收集要删除的基金 symbols
      const fundsToDelete = portfolio
        .filter(t => selectedItems.has(createManageSelectionKey('fund', t.id)))
        .map(t => t.symbol);

      // 同步删除 localStorage 数据
      if (fundsToDelete.length > 0) {
        marketFundService.removeFunds(fundsToDelete);
      }

      // 更新 React 状态
      setPortfolio(prev => prev.filter(t => !selectedItems.has(createManageSelectionKey('fund', t.id))));

      const remaining = indicesConfig.filter(symbol => {
        const normalSymbol = normalizeIndexSymbol(symbol);
        const shouldDelete = selectedItems.has(createManageSelectionKey('index', normalSymbol)) ||
                             selectedItems.has(createManageSelectionKey('global_index', normalSymbol));
        if (shouldDelete) {
          indicesToDelete.push(symbol);
          return false;
        }
        return true;
      });

      if (indicesToDelete.length > 0) {
        indexService.removeIndexInfos(indicesToDelete.map(normalizeIndexSymbol));
      }

      if (remaining.length === 0) {
        indexService.resetToDefaults();
        finalIndicesConfig = DEFAULT_INDEX_SYMBOLS;
        setPendingIndexOrder(null);
      } else {
        finalIndicesConfig = remaining;
      }
    }

    // 2. 保存指数顺序（如果有 pendingIndexOrder 且指数未全部删除）
    if (pendingIndexOrder && !indicesToDelete.includes(DEFAULT_INDEX_SYMBOLS[0]) && finalIndicesConfig.length > 0) {
      const indicesMap = new Map<string, MarketIndex>(
        indexService.getAllMarketIndices().map(idx => [idx.info.symbol, idx])
      );

      const allSymbols = [...pendingIndexOrder.domestic, ...pendingIndexOrder.global]
        .filter(symbol => !indicesToDelete.includes(symbol));

      const { allInfos, newMarketIndices } = allSymbols.reduce<{ allInfos: IndexInfo[]; newMarketIndices: MarketIndex[] }>(
        (acc, symbol) => {
          const idx = indicesMap.get(symbol);
          if (idx) {
            acc.allInfos.push(idx.info);
            acc.newMarketIndices.push(idx);
          }
          return acc;
        },
        { allInfos: [], newMarketIndices: [] }
      );

      if (allInfos.length > 0) {
        saveAllIndexInfos(allInfos);
        finalIndicesConfig = allSymbols.filter(symbol => indicesMap.has(symbol));
        finalMarketIndices = newMarketIndices;
      }
    }

    // 3. 统一更新状态（避免多次重渲染）
    if (finalIndicesConfig !== indicesConfig) {
      setIndicesConfig(finalIndicesConfig);
    }
    if (finalMarketIndices) {
      setMarketIndices(finalMarketIndices);
    }

    clearSelectionMode();
  }, [selectedItems, clearSelectionMode, indicesConfig, pendingIndexOrder, portfolio]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 应用初始化时清理旧版 localStorage key
  useEffect(() => {
    verifyStorageMigration(true);
  }, []);

  // 初始化模板服务
  useEffect(() => {
    loadAllTemplates();
  }, []);

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

  // portfolio 由 marketFundService 管理，不需要单独同步到 localStorage
  // fund_market_data 由 marketFundService.updateValuation() 写入，此处不重复同步
  // indicesConfig 由 indexService 管理，写入 fund_all_indices_info，此处不再单独同步
  useEffect(() => { saveSortOrder(sortOrder); }, [sortOrder]);

  useEffect(() => {
    if (!isSelectionMode) return;

    // 生成有效选择键：根据指数类型使用正确的 key 类型
    const validKeys = new Set<ManageSelectionKey>([
      ...portfolio.map(item => createManageSelectionKey('fund', item.id)),
      ...indicesConfig.map(symbol => {
        const normalSymbol = normalizeIndexSymbol(symbol);
        // 根据指数类型决定使用 'index' 还是 'global_index'
        return createManageSelectionKey(isDomesticIndex(normalSymbol) ? 'index' : 'global_index', normalSymbol);
      }),
    ]);

    setSelectedItems(prev => {
      const next = new Set(Array.from(prev).filter(key => validKeys.has(key)));
      return next.size === prev.size ? prev : next;
    });

    if (validKeys.size === 0) clearSelectionMode();
  }, [portfolio, indicesConfig, isSelectionMode, clearSelectionMode]);

  const updateSingleFund = useCallback(async (
    symbol: string,
    onProgress?: () => void,
    skipHistoryRefresh?: boolean
  ): Promise<ValuationData | null> => {
    try {
      const data = await fetchFundData(symbol);
      if (data) {
        marketFundService.updateValuation(symbol, data);
        // Append intraday point based on this valuation (lastUpdated preferred inside append)
        try { marketFundService.appendIntradayPoint(symbol, data.currentPrice, data.changePercentage, data.lastUpdated, data.realtimeDate); } catch (e) { /* swallow */ }
        // Use getValuation to get enhanced data with accuracy adjustments
        const enhancedData = marketFundService.getValuation(symbol) || data;
        setMarketData(prev => ({ ...prev, [symbol]: enhancedData }));
        setPortfolio(prev => prev.map(item =>
          item.symbol === symbol && !item.name ? { ...item, name: enhancedData.name } : item
        ));
        setFundStatuses(prev => ({ ...prev, [symbol]: 'ok' }));

        // 自动历史补全：当估值返回的 netWorthDate 比本地缓存的历史最后日期更新时，触发对该 symbol 的强制历史刷新
        // 注意：这个历史刷新是独立任务，不计入 refreshAll 的总任务数
        // 在 refreshAll 场景下跳过，因为 runBatchHistoryUpdate 已在并行执行
        if (!skipHistoryRefresh) {
          try {
            incrementTaskCount(setBackgroundTasks, 1);
            maybeTriggerHistoryRefresh(symbol, enhancedData.netWorthDate).finally(() => {
              createProgressCallback(setBackgroundTasks)();
              // 历史数据可能已更新，触发 fundHistories 重新计算
              setHistoryUpdateCount(prev => prev + 1);
            });
          } catch (e) {
            createProgressCallback(setBackgroundTasks)();
            setHistoryUpdateCount(prev => prev + 1);
          }
        }

        // 调用进度回调（如果提供）
        if (onProgress) onProgress();
        return enhancedData;
      } else {
        setFundStatuses(prev => ({ ...prev, [symbol]: 'error' }));
        if (onProgress) onProgress();
        return null;
      }
    } catch {
      setFundStatuses(prev => ({ ...prev, [symbol]: 'error' }));
      if (onProgress) onProgress();
      return null;
    }
  }, []);

  const runBatchUpdate = useCallback(async (
    targets: Ticker[],
    onProgress?: () => void,
    skipHistoryRefresh?: boolean
  ): Promise<JobResult<void>> => {
    if (targets.length === 0) return { success: true, data: undefined };

    const symbols = targets.map(t => t.symbol);
    const errors: string[] = [];
    let successCount = 0;

    // 不在这里设置 backgroundTasks，由调用者（refreshAll 或定时任务）预先设置

    for (const sym of symbols) {
      try {
        const data = await updateSingleFund(sym, onProgress, skipHistoryRefresh);
        if (!data) {
          errors.push(`${sym}: API返回空数据`);
        } else {
          successCount++;
        }
      } catch (e) {
        errors.push(`${sym}: ${(e as Error).message || '未知错误'}`);
        if (onProgress) onProgress();
      }
    }

    const failCount = errors.length;

    // 全部失败
    if (failCount === symbols.length) {
      return { success: false, message: `${failCount} 只基金估值更新失败` };
    }

    // 部分失败
    if (failCount > 0) {
      return { success: false, data: undefined, message: `成功更新 ${successCount} 只基金估值，${failCount} 只更新失败` };
    }

    return { success: true, data: undefined, message: `成功更新 ${successCount} 只基金估值` };
  }, [updateSingleFund]);

  const runBatchHistoryUpdate = useCallback(async (targets: Ticker[], onProgress?: () => void): Promise<JobResult<void>> => {
    if (targets.length === 0) return { success: true, data: undefined };

    const symbols = targets.map(t => t.symbol);
    const result = await forceFetchFundHistories(symbols, onProgress);
    // 历史数据已更新，触发 fundHistories 重新计算
    setHistoryUpdateCount(prev => prev + 1);
    return result;
  }, []);

  /**
   * 获取新添加基金的详情（股票持仓等）
   * 单线程顺序获取，避免并发请求过多
   */
  const fetchNewFundProfiles = useCallback(async (targets: Ticker[], onPortfolioUpdate: (updater: (prev: Ticker[]) => Ticker[]) => void) => {
    if (targets.length === 0) return;

    for (let i = 0; i < targets.length; i++) {
      const fund = targets[i];
      try {
        const profile = await fetchFundProfile(fund.symbol);
        if (profile) {
          // 更新 portfolio 状态
          onPortfolioUpdate((prev: Ticker[]) => prev.map(t =>
            t.symbol === fund.symbol ? { ...t, profile } : t
          ));
          // 持久化到 localStorage
          marketFundService.updateTicker(fund.symbol, { profile });
        }
        // 添加延迟，避免请求过于频繁（每个请求间隔3秒）
        if (i < targets.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } catch (e) {
        console.error(`[fetchNewFundProfiles] 获取 ${fund.symbol} 详情失败:`, e);
      }
    }
  }, []);

  const refreshMarketIndicesAsync = useCallback(async (ignoreCache: boolean = false, onProgress?: () => void, additionalSymbols?: string[]): Promise<JobResult<MarketIndex[]>> => {
    const errors: string[] = [];

    // 合并当前配置和新添加的符号（解决 state 更新时序问题）
    const effectiveConfig = additionalSymbols
      ? [...indicesConfig, ...additionalSymbols.filter(s => !indicesConfig.includes(normalizeIndexSymbol(s)))]
      : indicesConfig;

    // 使用统一的指数配置
    if (effectiveConfig.length === 0) {
      setMarketIndices([]);
      return { success: true, data: [] };
    }

    // 统一获取所有指数数据，传入进度回调
    const result = await fetchMarketIndices(effectiveConfig, ignoreCache, onProgress);
    const data = result.data || [];

    if (!result.success && result.message) {
      errors.push(result.message);
    }

    // 单次遍历：构建查找表并写入缓存
    const fetchedMap = new Map<string, MarketIndex>();
    data.forEach(item => {
      const normalized = normalizeIndexSymbol(item.info.symbol);
      fetchedMap.set(normalized, item);
      try {
        // 使用 indexService 管理指数日内数据
        indexService.appendIntradayPoint(
          item.info.symbol,
          item.info.current,
          item.info.changePercent,
          item.info.lastUpdated,
          item.info.tradeDate,
          item.info.tradingPeriodBegin
        );
      } catch (e) { /* ignore */ }
    });

    // 更新状态
    setMarketIndices(prev => mergeIndicesForDisplay(effectiveConfig, data, prev));
    setIndexStatuses(prev => {
      const next = { ...prev };
      effectiveConfig.forEach(sym => {
        const normalized = normalizeIndexSymbol(sym);
        next[normalized] = fetchedMap.has(normalized) ? 'ok' : 'error';
      });
      return next;
    });

    if (errors.length > 0) {
      return { success: false, message: errors[0] };
    }
    return { success: true, data, message: `成功更新 ${data.length} 只指数` };
  }, [indicesConfig]);

  // 刷新指数历史数据
  const refreshIndexHistoryAsync = useCallback(async (ignoreCache: boolean = false, onProgress?: () => void): Promise<JobResult<void>> => {
    if (indicesConfig.length === 0) return { success: true, data: undefined };

    return await fetchIndexHistories(indicesConfig, ignoreCache, onProgress);
  }, [indicesConfig]);

  const displayDomesticIndices = useMemo(
    () => marketIndices.filter(m => isDomesticIndex(m.info.symbol)),
    [marketIndices]
  );

  const displayGlobalIndices = useMemo(
    () => marketIndices.filter(m => isGlobalIndex(m.info.symbol)),
    [marketIndices]
  );

  // 用于快速查找的 Map（避免 render 中的 O(n²) find 操作）
  const domesticIndexMap = useMemo(
    () => new Map(displayDomesticIndices.map(i => [i.info.symbol, i])),
    [displayDomesticIndices]
  );

  const globalIndexMap = useMemo(
    () => new Map(displayGlobalIndices.map(i => [i.info.symbol, i])),
    [displayGlobalIndices]
  );

  const refreshAll = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);

    // 计算总任务数
    const totalCount = calculateTotalTasks(portfolio.length, indicesConfig.length);

    // 增加任务计数
    incrementTaskCount(setBackgroundTasks, totalCount);

    // 进度回调
    const onProgress = createProgressCallback(setBackgroundTasks);

    try {
      await Promise.allSettled([
        // 在 refreshAll 中跳过单独的历史刷新触发，因为 runBatchHistoryUpdate 已在并行执行
        runBatchUpdate(portfolio, onProgress, true),
        refreshMarketIndicesAsync(true, onProgress),
        runBatchHistoryUpdate(portfolio, onProgress),
        refreshIndexHistoryAsync(true, onProgress),
      ]);
    } finally { setIsRefreshing(false); }
  }, [portfolio, indicesConfig, isRefreshing, runBatchUpdate, refreshMarketIndicesAsync, runBatchHistoryUpdate, refreshIndexHistoryAsync]);

  useEffect(() => {
    if (portfolio.length > 0) {
      const targets = portfolio.filter(p => !marketData[p.symbol]);
      if (targets.length > 0) {
        incrementTaskCount(setBackgroundTasks, targets.length);
        const onProgress = createProgressCallback(setBackgroundTasks);
        runBatchUpdate(targets, onProgress);
      }
    }
  }, [portfolio.length]);

  // 指数刷新由定时任务统一管理，不再在这里单独触发
  // useEffect(() => { refreshMarketIndicesAsync(); }, [indicesConfig]);

  // Timer Job Scheduler: handles fund valuation, history, and market index refresh
  const { addError } = useTimerJobErrors();

  useEffect(() => {
    const scheduler = getTimerJobScheduler();

    // Register error callback
    scheduler.onError((jobId, jobName, error) => {
      console.error(`[TimerJob] ${jobName} (${jobId}) failed:`, error);

      if (jobId === 'fast-news-refresh') {
        // 快讯刷新失败仅记录日志，不显示错误提示
        console.warn(`[${jobName}] 快讯获取失败，保留原有缓存`);
      } else {
        // 其他任务失败显示在 TimerJobErrorContext
        addError({
          jobName,
          message: error.message || 'Unknown error',
        });
      }
    });

    // Register job handlers
    scheduler.registerHandler('fund-valuation-refresh', async () => {
      incrementTaskCount(setBackgroundTasks, portfolio.length);
      return await runBatchUpdate(portfolio, createProgressCallback(setBackgroundTasks));
    });

    scheduler.registerHandler('fund-history-refresh', async () => {
      incrementTaskCount(setBackgroundTasks, portfolio.length);
      return await runBatchHistoryUpdate(portfolio, createProgressCallback(setBackgroundTasks));
    });

    scheduler.registerHandler('market-index-refresh', async () => {
      incrementTaskCount(setBackgroundTasks, indicesConfig.length);
      return await refreshMarketIndicesAsync(true, createProgressCallback(setBackgroundTasks));
    });

    scheduler.registerHandler('index-history-refresh', async () => {
      incrementTaskCount(setBackgroundTasks, indicesConfig.length);
      return await refreshIndexHistoryAsync(true, createProgressCallback(setBackgroundTasks));
    });

    scheduler.registerHandler('news-refresh', async () => {
      // fetchMarketNews 成功后会自动更新缓存并触发事件，NewsContext 会自动刷新
      return await marketNewsService.fetchMarketNews();
    });

    // 注册策略推荐任务处理器
    scheduler.registerHandler('strategy-recommendation-refresh', async () => {
      await refreshStrategyRecommendations(() => portfolio, setPortfolio);
    });

    // 注册 Calendar 任务处理器
    scheduler.registerHandler('calendar_holiday_china', async () => {
      await refreshCalendarHolidaysChina();
    });

    scheduler.registerHandler('calendar_holiday_hk', async () => {
      await refreshCalendarHolidaysHK();
    });

    scheduler.registerHandler('calendar_holiday_us', async () => {
      await refreshCalendarHolidaysUS();
    });

    scheduler.registerHandler('calendar_holiday_sg', async () => {
      await refreshCalendarHolidaysSG();
    });

    // 注册基金基本信息刷新任务
    scheduler.registerHandler('fund-profile-refresh', async () => {
      return await refreshFundProfiles(() => portfolio, setPortfolio);
    });

    // 注册重要数据刷新任务（非农数据、CPI等）
    scheduler.registerHandler('important_data_refresh', async () => {
      return await refreshImportantData();
    });

    // 注册财经快讯刷新任务处理器
    scheduler.registerHandler('fast-news-refresh', async () => {
      const result = await marketNewsService.fetchFastNews(20);

      if (result.length > 0) {
        const prevCache = marketNewsService.getFastNews();
        const newImportantNews = detectNewImportantNews(result, prevCache);

        // 更新缓存（只有成功时才更新）
        marketNewsService.setFastNews(result);

        // 如果有新的重要快讯，触发通知事件
        if (newImportantNews.length > 0) {
          window.dispatchEvent(new CustomEvent('important-news-detected', {
            detail: { news: newImportantNews }
          }));
        }

        // 返回成功状态，记录到任务日志
        return {
          success: true,
          message: `获取${result.length}条快讯，其中${newImportantNews.length}条重要快讯`
        };
      }

      // 失败时不更新缓存，保留原有数据
      return {
        success: false,
        message: '获取快讯失败或API返回空数据'
      };
    });

    // Set context with current portfolio
    scheduler.setContext({ portfolio });

    // Start the scheduler
    scheduler.start();

    return () => scheduler.stop();
  }, [portfolio, runBatchUpdate, runBatchHistoryUpdate, refreshMarketIndicesAsync, refreshIndexHistoryAsync, addError]);

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
          const data = await buildBackupData(portfolio, indicesConfig, marketIndices);
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
    const data = await buildBackupData(portfolio, indicesConfig, marketIndices);
    downloadBackupFile(data, false);
    setIsMenuOpen(false);
  };

  // 处理数据同步点击，先检查配置
  const handleDataSyncClick = () => {
    setIsMenuOpen(false);
    const syncConfig = getSyncConfig();
    if (!syncConfig.eggfundUsername || !syncConfig.eggfundPassword) {
      setSyncErrorMessage('请先在"同步配置"中设置 Eggfund 账户信息');
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
          comboTrades: imported.comboTrades || {},
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

  // 从 indices 中查找当前查看的指数（确保使用最新数据）
  const viewingIndex = useMemo(() => {
    if (!viewingIndexSymbol) return null;
    const allIndices = [...displayDomesticIndices, ...displayGlobalIndices];
    return allIndices.find(idx => normalizeIndexSymbol(idx.info.symbol) === viewingIndexSymbol) || null;
  }, [viewingIndexSymbol, displayDomesticIndices, displayGlobalIndices]);

  // 获取即将到来的日历事件（每次渲染都获取最新数据）
  const upcomingCalendarEvents = getFirstEventInWorkdays(4);

  // 从 marketFundService 获取基金历史数据
  const fundHistories = useMemo(() => {
    const result: Record<string, HistoricalPoint[]> = {};
    portfolio.forEach(fund => {
      const history = marketFundService.getHistory(fund.symbol);
      if (history && history.length > 0) {
        result[fund.symbol] = history;
      }
    });
    return result;
  }, [portfolio, historyUpdateCount]);

  // 从 indexService 获取指数历史数据
  const indexHistories = useMemo(() => {
    const result: Record<string, HistoricalPoint[]> = {};
    indicesConfig.forEach(symbol => {
      const normalized = normalizeIndexSymbol(symbol);
      const marketIndex = indexService.getMarketIndex(normalized);
      if (marketIndex && marketIndex.history.length > 0) {
        result[normalized] = marketIndex.history;
      }
    });
    return result;
  }, [indicesConfig]);

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
            <div
              className="relative"
              onMouseEnter={() => setShowCalendarTooltip(true)}
              onMouseLeave={() => setShowCalendarTooltip(false)}
            >
              <button onClick={() => setShowCalendar(true)} title="日历" aria-label="日历" className="p-2 w-10 h-10 rounded-full hover:bg-gray-100 text-gray-400 transition-all">
                <i className="fas fa-calendar-alt"></i>
              </button>
              {(() => {
                if (upcomingCalendarEvents.length > 0) {
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
              {/* Tooltip - 鼠标悬停时显示 */}
              {showCalendarTooltip && (() => {
                if (upcomingCalendarEvents.length > 0) {
                  return (
                    <CalendarEventTooltip
                      events={upcomingCalendarEvents}
                      title="即将到来的事件"
                      style={{
                        position: 'absolute',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        top: '100%',
                        marginTop: '10px',
                        zIndex: 99999
                      }}
                    />
                  );
                }
                return null;
              })()}
            </div>
            {/* 系统配置按钮 */}
            <button onClick={() => setShowSystemConfig(true)} title="系统配置" aria-label="系统配置" className="p-2 w-10 h-10 rounded-full hover:bg-gray-100 text-gray-400 transition-all">
              <i className="fas fa-cog"></i>
            </button>
            {/* 调试面板按钮 - 只在开发环境显示 */}
            {/* 调试面板按钮和渲染已在调试结束后移除 */}
            {/* 日志按钮 - 仅在开关开启时显示 */}
            {isFeatureEnabled('jobLogEnabled') && (
              <button onClick={() => setShowJobLog(true)} title="后台任务日志" aria-label="后台任务日志" className="p-2 w-10 h-10 rounded-full hover:bg-gray-100 text-gray-400 transition-all">
                <i className="fas fa-list-alt"></i>
              </button>
            )}
            {/* 截屏按钮 */}
            <button
              onClick={async () => {
                try {
                  // 使用类型断言以支持 Chrome 的实验性 preferCurrentTab 属性
                  const stream = await navigator.mediaDevices.getDisplayMedia({
                    video: { displaySurface: 'browser' },
                    // @ts-expect-error Chrome 实验性属性
                    preferCurrentTab: true,
                    audio: false
                  });
                  const video = document.createElement('video');
                  video.srcObject = stream;
                  await video.play();
                  const canvas = document.createElement('canvas');
                  canvas.width = video.videoWidth;
                  canvas.height = video.videoHeight;
                  const ctx = canvas.getContext('2d');
                  ctx?.drawImage(video, 0, 0);
                  const blob = await new Promise<Blob>((resolve, reject) => {
                    canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Failed to create blob')), 'image/png');
                  });
                  await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                  ]);
                  stream.getTracks().forEach(track => track.stop());
                  setScreenshotToast({ message: '已复制到剪切板', type: 'success' });
                  setTimeout(() => setScreenshotToast(null), 3000);
                } catch (err) {
                  console.error('截屏失败:', err);
                  setScreenshotToast({ message: '截屏失败', type: 'error' });
                  setTimeout(() => setScreenshotToast(null), 3000);
                }
              }}
              title="截屏"
              aria-label="截屏"
              className="p-2 w-10 h-10 rounded-full hover:bg-gray-100 text-gray-400 transition-all"
            >
              <i className="fas fa-camera"></i>
            </button>
            {/* 小型 toast 通知：在深度刷新开始/完成时短暂显示 */}
            {/** toast 位于 header 右上，短暂显示 */}
            {/** deepToast: { message: string, visible: boolean } */}
            {typeof deepToast !== 'undefined' && deepToast.visible && (
              <div className="absolute right-12 top-2 z-40">
                <div className="bg-black text-white text-xs px-3 py-1 rounded-md shadow-md">{deepToast.message}</div>
              </div>
            )}
            {/* 截屏 Toast */}
            {screenshotToast && (
              <div className="absolute right-12 top-2 z-40 animate-fade-in">
                <div className={`text-xs px-3 py-1 rounded-md shadow-md ${screenshotToast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
                  {screenshotToast.message}
                </div>
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
                    <button id="positions-button" onClick={() => setShowPositions(true)} className="px-4 py-1.5 rounded-full bg-blue-600 shadow-md text-[11px] font-bold text-white hover:bg-blue-700 transition-all">持仓</button>
                    <button onClick={() => setShowOverallProfit(true)} className="px-4 py-1.5 rounded-full bg-blue-600 shadow-md text-[11px] font-bold text-white hover:bg-blue-700 transition-all">盈利</button>
                    <button onClick={() => setShowTransactions(true)} className="px-4 py-1.5 rounded-full bg-blue-600 shadow-md text-[11px] font-bold text-white hover:bg-blue-700 transition-all">交易</button>
                    <button onClick={() => setShowSectorHeatmap(true)} className="px-4 py-1.5 rounded-full bg-blue-600 shadow-md text-[11px] font-bold text-white hover:bg-blue-700 transition-all">板块</button>
                    <button onClick={() => setIsInvestmentNoticeModalOpen(true)} className="px-4 py-1.5 rounded-full bg-blue-600 shadow-md text-[11px] font-bold text-white hover:bg-blue-700 transition-all">投顾</button>
                    <button onClick={() => setIsInvestmentDraftModalOpen(true)} className="px-4 py-1.5 rounded-full bg-blue-600 shadow-md text-[11px] font-bold text-white hover:bg-blue-700 transition-all">草稿</button>
                    <button disabled={manageableItemCount === 0} onClick={enterSelectionMode} className={`px-4 py-1.5 rounded-full shadow-md text-[11px] font-bold text-white transition-all ${manageableItemCount === 0 ? 'bg-blue-300 cursor-not-allowed opacity-60' : 'bg-blue-600 hover:bg-blue-700'}`}>管理</button>
                    <button onClick={() => setSortOrder(o => o === 'desc' ? 'asc' : 'desc')} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                      <i className={`fas fa-sort-amount-${sortOrder === 'asc' ? 'up' : 'down'}`}></i>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-full grid grid-cols-[auto_1fr_auto] items-center gap-3">
                  <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none m-0 flex items-center shrink-0">
                    <span className="text-blue-600 font-black">管理模式</span>
                  </h2>
                  <div className="flex items-center justify-center min-w-0">
                    {selectedItems.size > 0 && (
                      <span className="text-[10px] font-bold text-blue-500 whitespace-nowrap text-center">
                        {selectedItems.size}个项目待删除
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 shrink-0 justify-self-end">
                    <button disabled={selectedItems.size === 0 && (!pendingIndexOrder || JSON.stringify(pendingIndexOrder) === JSON.stringify(originalIndexOrder))} onClick={confirmSelectionDeletion} className={`px-4 py-1.5 rounded-full text-[10px] font-bold transition-all ${selectedItems.size === 0 && (!pendingIndexOrder || JSON.stringify(pendingIndexOrder) === JSON.stringify(originalIndexOrder)) ? 'bg-blue-100 text-blue-300 cursor-not-allowed border border-blue-100' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'}`}>保存</button>
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
        {/* 国内指数区域 */}
        <aside className="space-y-1.5">
          <DndContext onDragEnd={handleIndexDragEnd}>
            <SortableContext
              items={pendingIndexOrder?.domestic ?? displayDomesticIndices.map(i => i.info.symbol)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex lg:flex-col overflow-x-auto lg:overflow-visible gap-1.5 pb-2 no-scrollbar">
                {(pendingIndexOrder?.domestic ?? displayDomesticIndices.map(i => i.info.symbol)).map((symbol) => {
                  const indexData = domesticIndexMap.get(symbol) ?? indexService.getMarketIndex(symbol);
                  if (!indexData) return null;
                  const selectionKey = createManageSelectionKey('index', normalizeIndexSymbol(indexData.info.symbol));
                  const isSelected = selectedItems.has(selectionKey);
                  const status = indexStatuses[normalizeIndexSymbol(indexData.info.symbol)] ?? 'unknown';

                  if (isSelectionMode) {
                    return (
                      <SortableIndexCard
                        key={indexData.info.symbol}
                        idx={indexData}
                        type="index"
                        status={status}
                        isSelectionMode={true}
                        isSelected={isSelected}
                        onSelect={toggleSelection}
                        onClick={() => setViewingIndexSymbol(normalizeIndexSymbol(indexData.info.symbol))}
                        selectionKey={selectionKey}
                      />
                    );
                  }
                  return (
                    <IndexCard
                      key={indexData.info.symbol}
                      idx={indexData}
                      type="index"
                      status={status}
                      isSelectionMode={false}
                      isSelected={false}
                      onClick={() => setViewingIndexSymbol(normalizeIndexSymbol(indexData.info.symbol))}
                      selectionKey={selectionKey}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
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
                  historyUpdateTrigger={historyUpdateCount}
                />
              );
            })}
          </div>
        </main>

        {/* 全球指数区域 */}
        <aside id="global-indices-area" className="space-y-1.5">
          <DndContext onDragEnd={handleIndexDragEnd}>
            <SortableContext
              items={pendingIndexOrder?.global ?? displayGlobalIndices.map(i => i.info.symbol)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex lg:flex-col overflow-x-auto lg:overflow-visible gap-1.5 pb-2 no-scrollbar">
                {(pendingIndexOrder?.global ?? displayGlobalIndices.map(i => i.info.symbol)).map((symbol) => {
                  const indexData = globalIndexMap.get(symbol) ?? indexService.getMarketIndex(symbol);
                  if (!indexData) return null;
                  const selectionKey = createManageSelectionKey('global_index', normalizeIndexSymbol(indexData.info.symbol));
                  const isSelected = selectedItems.has(selectionKey);
                  const status = indexStatuses[normalizeIndexSymbol(indexData.info.symbol)] ?? 'unknown';

                  if (isSelectionMode) {
                    return (
                      <SortableIndexCard
                        key={indexData.info.symbol}
                        idx={indexData}
                        type="global_index"
                        status={status}
                        isSelectionMode={true}
                        isSelected={isSelected}
                        onSelect={toggleSelection}
                        onClick={() => setViewingIndexSymbol(normalizeIndexSymbol(indexData.info.symbol))}
                        selectionKey={selectionKey}
                      />
                    );
                  }
                  return (
                    <IndexCard
                      key={indexData.info.symbol}
                      idx={indexData}
                      type="global_index"
                      status={status}
                      isSelectionMode={false}
                      isSelected={false}
                      onClick={() => setViewingIndexSymbol(normalizeIndexSymbol(indexData.info.symbol))}
                      selectionKey={selectionKey}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        </aside>
      </div>

      {!isSelectionMode && (
        <>
          {/* 智能添加按钮 - 在添加按钮左边 */}
          <SmartAddButton onClick={async (files) => {
            setShowSmartAddProgress(true);
            await smartAddActions.processFiles(files);
          }} />
          {/* 添加基金/指数按钮 */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="fixed bottom-8 right-8 bg-red-600 text-white w-14 h-14 rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-90 transition-all z-30 group"
          >
            <i className="fas fa-plus text-xl"></i>
            {/* 上方提示 */}
            <span className="absolute bottom-full mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              添加基金/指数
            </span>
          </button>
        </>
      )}

      {isModalOpen && <AddTickerModal onClose={() => setIsModalOpen(false)} onAdd={async (symbols, type) => {
          if (type === MarketType.INDEX) {
            // 直接添加到统一配置，显示时会自动分类
            const existingSymbols = new Set(indicesConfig.map(normalizeIndexSymbol));
            const newSymbols = symbols.filter(s => !existingSymbols.has(normalizeIndexSymbol(s)));
            if (newSymbols.length) {
              // 更新 indicesConfig
              setIndicesConfig(p => [...p, ...newSymbols]);
              // 立即为新指数创建 placeholder 并添加到 marketIndices
              const placeholders = newSymbols.map(s => createPlaceholderIndex(s));
              setMarketIndices(prev => [...prev, ...placeholders]);
              // 触发数据获取，传入新添加的符号以解决 state 更新时序问题
              refreshMarketIndicesAsync(true, undefined, newSymbols);
            }
          } else {
            const existing = new Set(portfolio.map(p => p.symbol));
            const news = symbols.filter(s => !existing.has(s)).map(s => ({
              id: Math.random().toString(36).substr(2, 9),
              symbol: s,
              name: '',
              market: MarketType.FUND
            }));
            if (news.length) {
              setPortfolio(p => [...p, ...news]);
              runBatchUpdate(news);
              // 主动获取新添加基金的详情（股票持仓等）
              fetchNewFundProfiles(news, setPortfolio);
            }
          }
          setIsModalOpen(false);
        }} isLoading={false} />}
      {showOverallProfit && <OverallProfitModal onClose={() => setShowOverallProfit(false)} onSelectFund={(sym) => { setShowOverallProfit(false); setViewingFund({ symbol: sym, fromDraft: false }); }} />}
      {showPositions && <PositionsModal portfolio={portfolio} marketData={marketData} onClose={() => setShowPositions(false)} onSelectFund={(sym) => { setShowPositions(false); setViewingFund({ symbol: sym, fromDraft: false }); }} />}
      {showTransactions && <TransactionsModal portfolio={portfolio} marketData={marketData} onClose={() => setShowTransactions(false)} onSelectFund={(sym) => { setShowTransactions(false); setViewingFund({ symbol: sym, fromDraft: false }); }} />}
      {showSectorHeatmap && (
        <React.Suspense fallback={<div className="fixed inset-0 flex items-center justify-center bg-black/40 z-[150]"><div className="bg-white rounded-lg p-6 text-gray-600">正在加载板块热力图...</div></div>}>
          <SectorHeatmapModal isOpen={showSectorHeatmap} onClose={() => setShowSectorHeatmap(false)} />
        </React.Suspense>
      )}
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
      }} marketData={marketData} sideBySide={viewingFund?.fromDraft} fundHistories={fundHistories} indexHistories={indexHistories} marketIndices={marketIndices} />}
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
              profile={fund?.profile}
              onClose={() => { setViewingFund(null); }}
              position={viewingFund.fromDraft ? 'right' : 'center'}
              animateSlide={shouldAnimate}
              initialTab={viewingFund.fromDraft ? 'history' : 'intraday'}
              fromDraft={viewingFund.fromDraft}
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
            // Save the sync configuration
            saveSyncConfig({
              eggfundUsername: config.eggfundUsername,
              eggfundPassword: config.eggfundPassword,
            });
            setShowSyncManagement(false);
          }}
          initialConfig={{
            eggfundUsername: getSyncConfig().eggfundUsername || '',
            eggfundPassword: getSyncConfig().eggfundPassword || '',
          }}
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
          marketIndices={marketIndices}
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

      {/* 智能添加进度窗口 */}
      <SmartAddProgressModal
        visible={showSmartAddProgress}
        state={smartAddState}
        onComplete={() => {
          setShowSmartAddProgress(false);
          if (smartAddState.funds.length > 0 || smartAddState.errors.length > 0) {
            setShowSmartAddResult(true);
          }
        }}
      />

      {/* 智能添加结果窗口 */}
      <SmartAddResultModal
        visible={showSmartAddResult}
        funds={smartAddState.funds}
        errors={smartAddState.errors}
        ocrRawTexts={smartAddState.ocrRawTexts}
        onClose={() => {
          setShowSmartAddResult(false);
          smartAddActions.reset();
        }}
        onConfirm={(selectedFunds) => {
          smartAddActions.confirm(selectedFunds);
          // 将新基金添加到 portfolio 并触发数据更新
          const newFunds = selectedFunds
            .filter(f => f.positionResult.operationType === 'add')
            .map(f => ({
              id: Math.random().toString(36).substr(2, 9),
              symbol: f.ocrData.fundCode,
              name: f.ocrData.fundName || f.ocrData.fundCode,
              market: MarketType.FUND,
            }));
          if (newFunds.length > 0) {
            setPortfolio(p => [...p, ...newFunds]);
            runBatchUpdate(newFunds);
          }
        }}
      />
      {/* 调试面板组件已在调试结束后移除 */}

      {/* 快讯侧边栏触发区域 - 带视觉提示 */}
      <div
        className="fixed right-0 top-1/2 -translate-y-1/2 z-[9997] flex items-center cursor-pointer group"
        onMouseEnter={() => setIsNewsSidebarVisible(true)}
        aria-label="打开财经快讯侧边栏"
      >
        {/* 触发条 */}
        <div className="flex flex-col items-center bg-gradient-to-b from-blue-400 to-blue-600 rounded-l-lg py-3 px-2 shadow-lg group-hover:from-blue-500 group-hover:to-blue-700 transition-all duration-200">
          <i className="fas fa-bolt text-white text-xs mb-1" />
          <i className="fas fa-newspaper text-white text-sm" />
        </div>
      </div>

      {/* 快讯侧边栏 */}
      <NewsSidebar
        isVisible={isNewsSidebarVisible}
        onClose={() => setIsNewsSidebarVisible(false)}
      />

      {/* 重要快讯通知组件 */}
      <ImportantNewsNotifier />
    </div>
  );
};

const App: React.FC = () => {
  // 挂载 Root 到 window（供测试用例访问）
  mountRoot();
  return (
    <TimerJobErrorProvider>
      <NewsProvider>
        <AppContent />
      </NewsProvider>
    </TimerJobErrorProvider>
  );
};

export default App;

