import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Ticker, ValuationData, MarketType, MarketIndex, BackupData, CardStatus, ManageItemType, ManageSelectionKey } from './types';
import { fetchFundData, fetchMarketIndices, forceFetchFundHistory, maybeTriggerHistoryRefresh } from './services/fundService';
import { toLocalDateKey } from './utils/priceResolver';
import * as cacheService from './services/cacheService';
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
import SystemSettingsModal from './components/SystemSettingsModal';
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
import { refreshTickerAlerts } from './services/backgroundJobService';
import { refreshStrategyRecommendations } from './services/strategyRecommendationService';

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
  const [virtualTradeModalFund, setVirtualTradeModalFund] = useState<string | null>(null);
  const [viewingIndexSymbol, setViewingIndexSymbol] = useState<string | null>(null);
  const [pendingImportData, setPendingImportData] = useState<BackupData | null>(null);
  const [showBackupSettings, setShowBackupSettings] = useState<boolean>(false);
  const [showSyncManagement, setShowSyncManagement] = useState<boolean>(false);
  const [showAIConfig, setShowAIConfig] = useState<boolean>(false);
  const [showSystemSettings, setShowSystemSettings] = useState<boolean>(false);
  const [showSystemConfig, setShowSystemConfig] = useState<boolean>(false);
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

  const refreshMarketIndicesAsync = useCallback(async () => {
    const fetchDomestic = async () => {
      if (indicesConfig.length === 0) {
        setMarketIndices([]);
        return;
      }
      try {
        const data = await fetchMarketIndices(indicesConfig);
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
        const data = await fetchMarketIndices(globalIndicesConfig);
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
        refreshMarketIndicesAsync(),
        runBatchHistoryUpdate(portfolio),
      ]);
    } finally { setIsRefreshing(false); }
  }, [portfolio, isRefreshing, runBatchUpdate, refreshMarketIndicesAsync, runBatchHistoryUpdate]);

  const deepRefreshAll = useCallback(() => {
    if (portfolio.length === 0) return;
    // 在后台强制刷新所有基金的历史净值（不改变 isRefreshing，不阻塞界面）
    setBackgroundTasks(prev => prev + portfolio.length);
    // immediate feedback
    setDeepToast({ message: '深度刷新已启动（后台进行）', visible: true });
    // fire-and-forget
    runBatchHistoryUpdate(portfolio).then(() => {
      setBackgroundTasks(prev => Math.max(0, prev - portfolio.length));
      setDeepToast({ message: '深度刷新完成', visible: true });
      setTimeout(() => setDeepToast(undefined), 3000);
    }).catch(() => {
      setBackgroundTasks(prev => Math.max(0, prev - portfolio.length));
      setDeepToast({ message: '深度刷新失败', visible: true });
      setTimeout(() => setDeepToast(undefined), 3000);
    });
  }, [portfolio, runBatchHistoryUpdate]);

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

    scheduler.registerHandler('history-refresh', async () => {
      await runBatchHistoryUpdate(portfolio);
    });

    scheduler.registerHandler('market-index-refresh', async () => {
      await refreshMarketIndicesAsync();
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
    }

    return () => scheduler.stop();
  }, [portfolio, runBatchUpdate, runBatchHistoryUpdate, refreshMarketIndicesAsync, addError, reloadNews]);

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
    refreshMarketIndicesAsync();
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
              <button disabled={isRefreshing} onClick={refreshAll} title="刷新行情" aria-label="刷新行情" className={`p-2 w-10 h-10 rounded-full hover:bg-gray-100 transition-all flex items-center justify-center ${isRefreshing ? 'text-red-500' : 'text-gray-400'}`}>
                <i className={`fas fa-sync-alt ${isRefreshing ? 'animate-spin' : ''}`}></i>
              </button>
            )}
            {/* 深度刷新按钮：靠近刷新按钮的图标（纯图标以节省空间），data-testid 保留方便测试 */}
            <button data-testid="deep-refresh-button" onClick={deepRefreshAll} title="深度刷新历史（后台）" aria-label="深度刷新历史" className="p-2 w-10 h-10 rounded-full hover:bg-gray-100 text-gray-700 transition-all">
              <i className="fas fa-database"></i>
            </button>
            {/* 系统配置按钮 */}
            <button onClick={() => setShowSystemConfig(true)} title="系统配置" aria-label="系统配置" className="p-2 w-10 h-10 rounded-full hover:bg-gray-100 text-gray-400 transition-all">
              <i className="fas fa-cog"></i>
            </button>
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
          return (
            <FundDetailsModal
              key={`${viewingFund.symbol}-${viewingFund.fromDraft}`}
              data={marketData[viewingFund.symbol]}
              recommendedStrategy={fund?.recommended_strategy}
              onClose={() => { setViewingFund(null); }}
              position={viewingFund.fromDraft ? 'right' : 'center'}
              animateSlide={viewingFund.fromDraft}
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
      {showSystemSettings && (
        <SystemSettingsModal
          isOpen={showSystemSettings}
          onClose={() => setShowSystemSettings(false)}
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

