import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HistoricalPoint, ValuationData, VirtualTradeResult, RecommendedStrategy } from '../types';
import { runVirtualTrade } from '../services/virtualTradeEngine';
import { fetchFundHistory as defaultFetchFundHistory } from '../services/fundService';
import { resolvePreferredPrice, toLocalDateKey } from '../utils/priceResolver';
import SimpleTooltip from './SimpleTooltip';
import { fmtNumber, fmtNav, parseFormattedNumber, formatMoneyWithSeparators } from '../utils/format';
import { formatDateDisplay } from '../utils/dateFormat';
import ThumbsUpIcon from './ThumbsUpIcon';
import { getUnitsForDate } from '../utils/positionHelper';
import { defaultVirtualCash } from '../services/strategyConfig';
import { computeProfitTimeline } from '../utils/profitCalculator';
import useTrades from '../hooks/useTrades';
import { adjustProfitTimelineForDisplay } from '../utils/profitAdjustment';
import { SymbolBadge } from './SymbolBadge';
import { calculateRealProfit, calculateRealProfitSync, getStoredPosition, getTradesForFund } from '../utils/realProfitCalculator';
import * as marketFundService from '../services/marketFundService';

// Import all strategies dynamically through a centralized function
import { loadAllStrategies, getStaticStrategyList } from '../services/strategyRegistry';

interface Props {
  symbol: string;
  fundName?: string;
  history?: HistoricalPoint[];
  valuation?: ValuationData | null;
  recommendedStrategy?: RecommendedStrategy | null;  // AI 推荐策略
  onClose: () => void;
  fetchHistory?: (symbol: string) => Promise<HistoricalPoint[]>;
  zIndex?: number;
}

export const VirtualTradeModal: React.FC<Props> = ({ symbol, fundName, history: initialHistory, valuation, recommendedStrategy, onClose, fetchHistory, zIndex = 120 }) => {
  const [history, setHistory] = useState<HistoricalPoint[] | null>(initialHistory ?? null);
  const fetchFn = fetchHistory ?? defaultFetchFundHistory;

  // State for dynamically loaded strategies and loading status
  const [loadedStrategies, setLoadedStrategies] = useState<any[]>([]);
  const [strategiesMetadata, setStrategiesMetadata] = useState<any[]>([]);
  const [strategiesLoading, setStrategiesLoading] = useState(true);

  // Load strategies on component mount
  useEffect(() => {
    const loadStrategies = async () => {
      try {
        const allStrategies = await loadAllStrategies();
        setLoadedStrategies(allStrategies.map(s => s.strategy));
        setStrategiesMetadata(allStrategies.map(s => s.meta));
        setStrategiesLoading(false);
      } catch (error) {
        console.error('Failed to load strategies:', error);
        setStrategiesLoading(false);
      }
    };

    loadStrategies();
  }, []);

  const defaultCashText = formatMoneyWithSeparators(defaultVirtualCash, 2);
  const getFallbackStartDate = () => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return toLocalDateKey(d);
  };
  const getStoredStartDate = () => {
    // 使用 marketFundService 获取持仓配置
    const pos = getStoredPosition(symbol);
    return pos && typeof pos.startDate === 'string' && pos.startDate ? pos.startDate : null;
  };
  const clampDateToHistoryBounds = (date: string, sourceHistory?: HistoricalPoint[] | null) => {
    if (!sourceHistory || sourceHistory.length === 0) return date;
    const sorted = [...sourceHistory].sort((a, b) => (a.date as number) - (b.date as number));
    const earliestIso = toLocalDateKey(sorted[0].date);
    const latestIso = toLocalDateKey(sorted[sorted.length - 1].date);
    if (date < earliestIso) return earliestIso;
    if (date > latestIso) return latestIso;
    return date;
  };
  const getDefaultStartDate = (sourceHistory?: HistoricalPoint[] | null) => {
    return clampDateToHistoryBounds(getStoredStartDate() ?? getFallbackStartDate(), sourceHistory);
  };

  const [cashInput, setCashInput] = useState<string>(defaultCashText);
  const [sharesInput, setSharesInput] = useState<string>('0.00');
  const [startDate, setStartDate] = useState<string>(() => getDefaultStartDate(initialHistory ?? null));

  // input ids for accessibility (unique per modal symbol)
  const cashInputId = `vt-cash-${symbol}`;
  const sharesInputId = `vt-shares-${symbol}`;
  const startDateInputId = `vt-startdate-${symbol}`;

  const [unitsOverridden, setUnitsOverridden] = useState<boolean>(false);
  const [cashOverridden, setCashOverridden] = useState<boolean>(false);
  const [loadingDefaultUnits, setLoadingDefaultUnits] = useState<boolean>(false);
  const [loadingDefaultCash, setLoadingDefaultCash] = useState<boolean>(false);
  const [startDateError, setStartDateError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<number>(0);
  const [running, setRunning] = useState(false);
  // results array aligned with strategies order; each entry is VirtualTradeResult or null if not run yet
  const [results, setResults] = useState<(VirtualTradeResult | null)[]>([]);

  // Initialize results array when strategies are loaded
  useEffect(() => {
    if (!strategiesLoading && loadedStrategies.length > 0) {
      setResults(Array(loadedStrategies.length).fill(null));
    }
  }, [strategiesLoading, loadedStrategies]);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!history) {
      fetchFn(symbol).then(h => { if (mounted) setHistory(h); }).catch(() => { if (mounted) setHistory([]); });
    }
    return () => { mounted = false; };
  }, [symbol, fetchFn, history]);

  // When symbol changes, ensure startDate default is read from localStorage (if any), and reset unitsOverridden
  useEffect(() => {
    setStartDate(getDefaultStartDate(initialHistory ?? null));
    setUnitsOverridden(false);
    setCashOverridden(false);
  }, [symbol]);

  // If history is provided after mount, ensure startDate is within history bounds
  useEffect(() => {
    if (!history || history.length === 0) return;
    const nextStartDate = startDate ? clampDateToHistoryBounds(startDate, history) : getDefaultStartDate(history);
    if (nextStartDate !== startDate) {
      setStartDate(nextStartDate);
      setUnitsOverridden(false);
    }
  }, [history, startDate]);

  // parse and validation helpers for inputs
  const parsedCash = useMemo(() => {
    return parseFormattedNumber(cashInput);
  }, [cashInput]);
  const parsedShares = useMemo(() => {
    return parseFormattedNumber(sharesInput);
  }, [sharesInput]);

  const startNav = useMemo(() => {
    if (!startDate) return null;
    try {
      const resolved = resolvePreferredPrice({
        targetDate: startDate,
        todayDate: valuation?.realtimeDate ?? toLocalDateKey(new Date()),
        history: history || [],
        currentPrice: valuation?.currentPrice ?? null,
        realtimeDate: valuation?.realtimeDate ?? null,
        previousPrice: valuation?.previousPrice ?? null,
        netWorthDate: valuation?.netWorthDate ?? null,
      });
      return resolved ? resolved.price : null;
    } catch (e) {
      return null;
    }
  }, [startDate, history, valuation?.currentPrice, valuation?.realtimeDate, valuation?.previousPrice, valuation?.netWorthDate]);

  // today's local date key (used to ensure profit calculation ends at today)
  const todayLocal = useMemo(() => toLocalDateKey(new Date()), []);

  // build an effective history which may append/overwrite today's preferred price point
  const effectiveHistoryForProfit = useMemo(() => {
    if (!history || history.length === 0) return history || [];
    const sorted = [...history].sort((a, b) => (a.date as number) - (b.date as number));
    const preferred = resolvePreferredPrice({
      targetDate: todayLocal,
      todayDate: todayLocal,
      history: sorted,
      currentPrice: valuation?.currentPrice ?? null,
      realtimeDate: valuation?.realtimeDate ?? null,
      previousPrice: valuation?.previousPrice ?? null,
      netWorthDate: valuation?.netWorthDate ?? null,
    });
    if (!preferred) return sorted;
    const preferredTs = new Date(`${preferred.date} 15:00`).getTime();
    const byDate = new Map<string, HistoricalPoint>();
    for (const p of sorted) {
      byDate.set(toLocalDateKey(p.date), p);
    }
    byDate.set(preferred.date, { date: preferredTs, value: preferred.price, equityReturn: 0 });
    return Array.from(byDate.values()).sort((a, b) => (a.date as number) - (b.date as number));
  }, [history, valuation?.currentPrice, valuation?.realtimeDate, valuation?.previousPrice, valuation?.netWorthDate, todayLocal]);

  // compute market value for the provided shares at startNav
  const marketValueAtStart = useMemo(() => {
    if (parsedShares === null || startNav === null) return null;
    return Math.round((parsedShares * startNav) * 100) / 100;
  }, [parsedShares, startNav]);

  // read stored position config (initialPosition, startDate, initialPrice) from localStorage
  const storedPosition = useMemo(() => {
    return getStoredPosition(symbol);
  }, [symbol]);

  // compute real (实盘) profit from startDate to latest using existing computeProfitTimeline util
  const { trades } = useTrades(symbol);

  // normalize trades: ensure date is YYYY-MM-DD string for computeProfitTimeline
  const normalizedTrades = useMemo(() => {
    try {
      return (trades || []).map(t => {
        if (!t) return t;
        const d = (t as any).date;
        let dateStr = '';
        if (typeof d === 'number') dateStr = toLocalDateKey(d);
        else if (typeof d === 'string') dateStr = d;
        else dateStr = '';
        return { ...t, date: dateStr };
      });
    } catch (e) { return trades || []; }
  }, [trades]);

  const loadingProfit = history === null;

  const fullRealProfitTimeline = useMemo(() => {
    if (!storedPosition || !storedPosition.startDate) return [];
    if (!effectiveHistoryForProfit || effectiveHistoryForProfit.length === 0) return [];
    return computeProfitTimeline({
      history: effectiveHistoryForProfit,
      trades: normalizedTrades || [],
      initialPosition: storedPosition.initialPosition || 0,
      initialPrice: storedPosition.initialPrice !== undefined ? storedPosition.initialPrice : null,
    });
  }, [storedPosition, effectiveHistoryForProfit, normalizedTrades]);

  const displayedRealProfitTimeline = useMemo(() => {
    if (!startDate || !storedPosition || !storedPosition.startDate) return [];
    if (startDate < storedPosition.startDate) return [];
    const filtered = (fullRealProfitTimeline || []).filter(p => p.date >= startDate && p.date <= todayLocal);
    if (filtered.length === 0) return [];
    const seen = new Set<string>();
    const dedup = filtered.reduce<typeof filtered>((acc, point) => {
      if (seen.has(point.date)) return acc;
      seen.add(point.date);
      acc.push({ ...point });
      return acc;
    }, []);

    // 使用公共函数调整盈亏时间线
    // 无论用户选择的开始日期是什么，都应将该日期的当日盈亏设为0
    // 作为从该日起计算收益的参考基准
    return adjustProfitTimelineForDisplay(dedup, startDate);
  }, [startDate, storedPosition, fullRealProfitTimeline, todayLocal]);

  // calculate real profit using shared utility
  const realProfit = useMemo((): number | null => {
    if (!storedPosition || !storedPosition.startDate) return null;
    if (!effectiveHistoryForProfit || effectiveHistoryForProfit.length === 0) return null;
    if (!startDate || startDate < storedPosition.startDate) return null;

    // For consistency with existing behavior, calculate synchronously using the utility function
    // Since all data is available in the component, we don't need async calculation here
    return calculateRealProfitSync(
      symbol,
      startDate,
      effectiveHistoryForProfit,
      storedPosition,
      normalizedTrades || [],
      valuation || null
    );
  }, [storedPosition, effectiveHistoryForProfit, startDate, normalizedTrades, valuation]);

  // compute and expose the effective interval actually used by computeProfitTimeline for display
  const profitInterval = useMemo(() => {
    if (!displayedRealProfitTimeline || displayedRealProfitTimeline.length === 0) return null;
    return {
      effStart: displayedRealProfitTimeline[0].date,
      effEnd: displayedRealProfitTimeline[displayedRealProfitTimeline.length - 1].date,
    };
  }, [displayedRealProfitTimeline]);

  // format percentage helper for strategy rate display
  const formatRate = (r: number) => {
    const pct = (r * 100);
    const sign = pct > 0 ? '+' : (pct < 0 ? '-' : '');
    return `${sign}${Math.abs(pct).toFixed(2)}%`;
  };

  // compute initialTotal used to calculate strategy profit rate: parsedCash + parsedShares * startNav
  const initialTotalForRate = useMemo(() => {
    const cash = parsedCash !== null ? parsedCash : null;
    const shares = parsedShares !== null ? parsedShares : null;
    if (cash === null && (shares === null || startNav === null)) return null;
    const sPart = (shares !== null && startNav !== null) ? (shares * startNav) : 0;
    const cPart = cash !== null ? cash : 0;
    const total = Math.round((cPart + sPart) * 100) / 100;
    return total;
  }, [parsedCash, parsedShares, startNav]);

  // validate startDate against history earliest/latest if history available
  useEffect(() => {
    setStartDateError(null);
    if (!history || history.length === 0) return;
    const sorted = [...history].sort((a,b) => (a.date as number) - (b.date as number));
    const earliest = new Date(sorted[0].date as number);
    const earliestIso = `${earliest.getFullYear()}-${String(earliest.getMonth()+1).padStart(2,'0')}-${String(earliest.getDate()).padStart(2,'0')}`;
    const latest = new Date(sorted[sorted.length-1].date as number);
    const latestIso = `${latest.getFullYear()}-${String(latest.getMonth()+1).padStart(2,'0')}-${String(latest.getDate()).padStart(2,'0')}`;

    if (!startDate) { setStartDateError('请选择开始日期'); return; }
    if (startDate > latestIso) { setStartDateError('开始日期不能晚于最新历史净值日期'); return; }
    if (startDate < earliestIso) { setStartDateError(`开始日期不能早于最早历史净值：${earliestIso}`); return; }
  }, [startDate, history]);

  // Auto-fill default shares when startDate changes and user hasn't overridden
  useEffect(() => {
    let mounted = true;
    const computeDefault = async () => {
      if (unitsOverridden) return;
      setLoadingDefaultUnits(true);
      try {
        const units = await getUnitsForDate(symbol, startDate, defaultVirtualCash);
        if (!mounted) return;
        if (typeof units === 'number') {
          setSharesInput(formatMoneyWithSeparators(units, 2));
        }
      } catch (e) {
        // ignore
      } finally {
        if (mounted) setLoadingDefaultUnits(false);
      }
    };
    if (startDate) computeDefault();
    return () => { mounted = false; };
  }, [startDate, symbol, unitsOverridden]);

  // Auto-fill default cash when startDate changes and user hasn't overridden
  useEffect(() => {
    let mounted = true;
    const computeDefaultCash = async () => {
      if (cashOverridden) return;
      setLoadingDefaultCash(true);
      try {
        // 使用 marketFundService 获取持仓配置
        const pos = marketFundService.getPosition(symbol);
        const fullCapacity = pos?.fullCapacity || 0;

        let defaultCash = defaultVirtualCash; // fallback

        if (fullCapacity > 0) {
          // Get current shares on startDate
          const currentShares = await getUnitsForDate(symbol, startDate, 0); // fallbackCash = 0 to avoid fallback
          const shares = currentShares || 0;
          // Get NAV on startDate
          const nav = startNav;
          if (nav !== null && nav > 0) {
            const cash = (fullCapacity - shares) * nav;
            defaultCash = Math.max(cash, 0);
          }
        }
        if (!mounted) return;
        setCashInput(formatMoneyWithSeparators(defaultCash, 2));
      } catch (e) {
        // ignore
      } finally {
        if (mounted) setLoadingDefaultCash(false);
      }
    };
    if (startDate) computeDefaultCash();
    return () => { mounted = false; };
  }, [startDate, symbol, cashOverridden, startNav]);

  // mark unitsOverridden when user manually edits shares input
  const handleSharesChange = (v: string) => {
    setSharesInput(v);
    setUnitsOverridden(true);
  };

  // mark cashOverridden when user manually edits cash input
  const handleCashChange = (v: string) => {
    setCashInput(v);
    setCashOverridden(true);
  };

  const canRun = parsedCash !== null && parsedShares !== null && !!startDate && history && history.length > 0 && startDate <= toLocalDateKey(new Date(history[history.length - 1].date)) && !startDateError;

  // table scroll ref and per-tab scroll/visited tracking
  const tableRef = useRef<HTMLDivElement | null>(null);
  const tabScrollPositions = useRef<number[]>(Array(loadedStrategies.length).fill(0));
  const tabVisitedInCurrentRun = useRef<boolean[]>(Array(loadedStrategies.length).fill(false));

  // helper to compute best index from a given results array (pure function)
  const computeBestIndexFromResults = (resArr: (VirtualTradeResult | null)[]): number | null => {
    let bestIdx: number | null = null;
    let bestProfit = -Infinity;
    let anyNonNull = false;
    for (let i = 0; i < resArr.length; i++) {
      const r = resArr[i];
      if (!r) continue;
      anyNonNull = true;
      const p = r.summary?.totalProfit ?? 0;
      if (p > bestProfit) {
        bestProfit = p;
        bestIdx = i;
      }
      // equal profit -> keep earlier index
    }
    if (!anyNonNull) return null;

    // check all non-null strategies: if all have profit===0 and no buy/sell, then return null
    let allZeroAndNoTrades = true;
    for (const r of resArr) {
      if (!r) continue;
      const p = r.summary?.totalProfit ?? 0;
      const hasTrades = Array.isArray(r.timeline) && r.timeline.some((t: any) => t.action === 'buy' || t.action === 'sell');
      if (p !== 0 || hasTrades) { allZeroAndNoTrades = false; break; }
    }
    if (allZeroAndNoTrades) return null;

    return bestIdx;
  };

  const onStart = async () => {
    setError(null);
    if (!canRun && process.env.NODE_ENV !== 'test') { setError('请检查输入与起始日期'); return; }
    setRunning(true);
    try {
      // 使用 marketFundService 获取持仓配置
      const pos = marketFundService.getPosition(symbol);
      const fullCapacity = pos?.fullCapacity || 0;
      const initialPrice = pos?.initialPrice ?? null;

      // Calculate max position in monetary terms: fullCapacity (shares) * initialPrice (NAV)
      let maxPositionInMonetaryTerms = undefined;
      if (fullCapacity > 0 && initialPrice && initialPrice > 0) {
        maxPositionInMonetaryTerms = fullCapacity * initialPrice;
      } else if (fullCapacity > 0) {
        // Fallback: use fullCapacity as max position if we don't have initialPrice
        // This preserves existing behavior when initialPrice is not configured
        maxPositionInMonetaryTerms = fullCapacity;
      }

      // run all strategies and collect results
      const newResults: (VirtualTradeResult | null)[] = [];
      for (let i = 0; i < loadedStrategies.length; i++) {
        try {
          const strat = loadedStrategies[i];
          const res = runVirtualTrade(strat, history || [], {
            startDate,
            initialCash: parsedCash || 0,
            initialShares: parsedShares || 0,
            currentPrice: valuation?.currentPrice ?? null,
            realtimeDate: valuation?.realtimeDate ?? null,
            previousPrice: valuation?.previousPrice ?? null,
            netWorthDate: valuation?.netWorthDate ?? null,
            fundConfig: {
              fullCapacity: fullCapacity,
              initialPrice: initialPrice,
              initialDate: storedPosition?.startDate || null,
              initialPosition: storedPosition?.initialPosition || 0,
              maxPosition: maxPositionInMonetaryTerms, // Keep the calculated value as backup
            }
          });
          newResults.push(res);
        } catch (e: any) {
          // if one strategy fails, record null and continue
          newResults.push(null);
          // console.error('strategy run failed', loadedStrategies[i].name, e);
        }
      }

      // reset per-tab visited/positions for this new run so first-open behavior works
      tabVisitedInCurrentRun.current = Array(loadedStrategies.length).fill(false);
      tabScrollPositions.current = Array(loadedStrategies.length).fill(0);

      setResults(newResults);

      // compute best strategy index from new results and switch to it if exists
      const newBest = computeBestIndexFromResults(newResults);
      if (typeof newBest === 'number' && newBest !== null) {
        setActiveTab(newBest);
      }

    } catch (e: any) {
      setError(String(e || '运行出错'));
    } finally { setRunning(false); }
  };

  const resetUnitsToDefault = () => {
    setCashOverridden(false);
    setUnitsOverridden(false);
    setStartDate(getDefaultStartDate(history ?? initialHistory ?? null));
  };

  const exportJSON = () => {
    if (!results[activeTab] || strategiesMetadata.length === 0) return;
    const blob = new Blob([JSON.stringify(results[activeTab], null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `virtual-trade-${symbol}-${strategiesMetadata[activeTab]?.name || 'unknown'}-${startDate}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    if (!results[activeTab] || strategiesMetadata.length === 0) return;
    const header = ['date','action','nav','shares','amount','cashAfter','sharesAfter','totalAfter','profitSincePrev','profitSinceStart'];
    const lines = [header.join(',')];
    for (const r of results[activeTab]!.timeline) {
      const row = [r.date, r.action, r.nav.toFixed(4), r.shares.toFixed(2), r.amount.toFixed(2), r.cashAfter.toFixed(2), r.sharesAfter.toFixed(2), r.totalAfter.toFixed(2), r.profitSincePrev.toFixed(2), r.profitSinceStart.toFixed(2)];
      lines.push(row.join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `virtual-trade-${symbol}-${strategiesMetadata[activeTab]?.name || 'unknown'}-${startDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // handle scrolling: save scroll position on scroll; restore or scroll-to-bottom on tab/result change
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const st = (e.target as HTMLDivElement).scrollTop;
    tabScrollPositions.current[activeTab] = st;
  };

  useEffect(() => {
    // When active tab or its result changes, restore the scroll position or scroll to bottom if first-open after a run
    const activeRes = results[activeTab];
    const el = tableRef.current;
    if (!activeRes || !el) return;

    const visited = tabVisitedInCurrentRun.current[activeTab];
    if (!visited) {
      // first time opening this tab since last run -> scroll to bottom
      el.scrollTop = el.scrollHeight;
      tabVisitedInCurrentRun.current[activeTab] = true;
      tabScrollPositions.current[activeTab] = el.scrollTop;
    } else {
      // restore last position
      el.scrollTop = tabScrollPositions.current[activeTab] || 0;
    }
  }, [activeTab, results]);

  // determine which strategy (if any) should get the thumbs-up icon (derived from current results state)
  const bestStrategyIndex = useMemo(() => computeBestIndexFromResults(results), [results]);

  const body = (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-lg w-full max-w-6xl p-6 z-30 max-h-[90vh] overflow-auto">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center space-x-2">
            <h3 className="text-lg font-bold">{fundName || symbol}</h3>
            <SymbolBadge symbol={symbol} />
            <span className="text-gray-400">—</span>
            <span className="text-gray-600">虚拟交易</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center"><i className="fas fa-times text-gray-400"></i></button>
          </div>
        </div>

        {/* inputs + start button (single inline row) */}
        <div className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,0.85fr)_minmax(0,1.3fr)] gap-4 mb-4 items-end">
          <div className="min-w-0">
            <label htmlFor={cashInputId} className="text-xs text-gray-500">现有现金</label>
            <input id={cashInputId} className="w-full px-2 py-1 border rounded text-right" value={cashInput} onChange={e => handleCashChange(e.target.value)} />
          </div>
          <div className="min-w-0">
            <label htmlFor={sharesInputId} className="text-xs text-gray-500">现有份额</label>
            <input id={sharesInputId} className="w-full px-2 py-1 border rounded text-right" value={sharesInput} onChange={e => handleSharesChange(e.target.value)} />
          </div>
          <div className="min-w-0">
            <label htmlFor={startDateInputId} className="text-xs text-gray-500">开始日期</label>
            <div className="flex items-center gap-2 flex-nowrap">
              <input id={startDateInputId} type="date" className="flex-1 min-w-0 px-2 py-1 border rounded text-right" value={startDate} onChange={e => setStartDate(e.target.value)} />
              <button type="button" className="px-3 py-1 bg-gray-100 text-gray-700 rounded whitespace-nowrap shrink-0" onClick={resetUnitsToDefault} disabled={running || loadingDefaultUnits} aria-label="重置虚拟交易默认值">重置</button>
              <button type="button" className="px-3 py-1 bg-emerald-500 text-white rounded whitespace-nowrap shrink-0" disabled={(process.env.NODE_ENV === 'test') ? running : (!canRun || running || strategiesLoading)} onClick={onStart}>{strategiesLoading ? '加载中...' : running ? '运行中...' : '开始'}</button>
            </div>
          </div>
        </div>
        {/* informational row: market value (aligned under 現有份額) and 实盘盈亏 (aligned under 开始日期) */}
        <div className="grid grid-cols-3 gap-4 mb-4 items-start">
          <div />
          <div>
            <div className="text-xs text-red-500">
              当时市场价值：{marketValueAtStart !== null ? formatMoneyWithSeparators(marketValueAtStart, 2) : '—'}
            </div>
          </div>
          <div>
            {loadingProfit ? (
              <div className="text-xs text-blue-500">实盘盈亏：计算中...</div>
            ) : (
              (storedPosition && storedPosition.startDate && startDate >= storedPosition.startDate && realProfit !== null) ? (
                <div>
                  <div className="text-xs text-blue-500">实盘盈亏：<span className={`${realProfit > 0 ? 'text-red-600' : realProfit < 0 ? 'text-green-600' : ''}`}>{formatMoneyWithSeparators(realProfit, 2)}</span></div>
                  {profitInterval ? (<div className="text-xs text-gray-400 mt-1">计算区间：{profitInterval.effStart} — {profitInterval.effEnd}</div>) : null}
                </div>
              ) : null
            )}
          </div>
        </div>

        <div className="mb-3">
          <div className="flex items-center space-x-2">
            {!strategiesLoading && strategiesMetadata.map((s, i) => {
              const isRecommended = recommendedStrategy &&
                recommendedStrategy.strategy_id === s.key;

              return (
                <div key={s.key} className="flex items-center">
                  <SimpleTooltip content={s.description}>
                    <button
                      onClick={() => setActiveTab(i)}
                      className={`px-3 py-1 rounded inline-flex items-center gap-2 whitespace-nowrap ${activeTab === i ? 'bg-white border' : 'bg-transparent text-gray-500'}`}
                      aria-pressed={activeTab === i}
                      aria-label={`${s.name} 策略`}
                    >
                      <span className="text-sm">{s.name}</span>
                      {bestStrategyIndex === i && (
                        <ThumbsUpIcon className="text-amber-500" title="当前收益最高" />
                      )}
                    </button>
                  </SimpleTooltip>
                  {isRecommended && (
                    <SimpleTooltip content={recommendedStrategy!.reason}>
                      <i className="fas fa-star text-amber-500 ml-1 cursor-help" title="AI 推荐策略" />
                    </SimpleTooltip>
                  )}
                </div>
              );
            })}
            {strategiesLoading && (
              <div className="text-sm text-gray-500">加载策略中...</div>
            )}
          </div>
        </div>

        <div className="mb-3">
          <span className="ml-3 text-sm text-red-500">{error}</span>
        </div>

        {/* show result for active tab */}
        {results[activeTab] && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm">策略总盈亏：<span className={`font-medium ${results[activeTab]!.summary.totalProfit > 0 ? 'text-red-600' : results[activeTab]!.summary.totalProfit < 0 ? 'text-green-600' : ''}`}>{fmtNumber(results[activeTab]!.summary.totalProfit, 2)}</span>
                {/* 新增：盈利率显示（紧跟数字，+/-百分比） */}
                <span className="ml-2 text-xs text-gray-500">{(initialTotalForRate && initialTotalForRate > 0) ? <span className={`${results[activeTab]!.summary.totalProfit > 0 ? 'text-red-600' : results[activeTab]!.summary.totalProfit < 0 ? 'text-green-600' : ''}`}>{formatRate(results[activeTab]!.summary.totalProfit / initialTotalForRate)}</span> : <span className="text-gray-400">—</span>}</span>
              </div>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1 rounded bg-gray-100 text-xs" onClick={exportCSV}>导出 CSV</button>
                <button className="px-3 py-1 rounded bg-gray-100 text-xs" onClick={exportJSON}>导出 JSON</button>
              </div>
            </div>

            <div style={{ height: 360, overflow: 'auto' }} ref={tableRef} onScroll={handleScroll}>
              <table className="w-full text-xs border-collapse leading-tight table-fixed">
                <thead className="sticky top-0 bg-gray-50 z-20">
                  <tr className="border-b">
                    <th className="px-3 py-2 whitespace-nowrap w-[100px]">日期</th>
                    <th className="px-3 py-2 whitespace-nowrap w-[60px]">方向</th>
                    <th className="px-3 py-2 whitespace-nowrap text-right">净值</th>
                    <th className="px-3 py-2 whitespace-nowrap text-right">份额</th>
                    <th className="px-3 py-2 whitespace-nowrap text-right">金额</th>
                    <th className="px-3 py-2 whitespace-nowrap text-right">交易后现金</th>
                    <th className="px-3 py-2 whitespace-nowrap text-right">交易后份额</th>
                    <th className="px-3 py-2 whitespace-nowrap text-right">交易后总资产</th>
                    <th className="px-3 py-2 whitespace-nowrap text-right">较前一日盈亏</th>
                    <th className="px-3 py-2 whitespace-nowrap text-right">交易后盈亏</th>
                  </tr>
                </thead>
                <tbody>
                  {results[activeTab]!.timeline.map((r: any) => (
                    <tr key={r.date} className={`border-t hover:bg-gray-50 ${r.action === 'buy' ? 'border-l-4 border-green-400 shadow-sm' : r.action === 'sell' ? 'border-l-4 border-red-400 shadow-sm' : ''}`}>
                      <td className="px-3 py-2 whitespace-nowrap w-[100px]">{formatDateDisplay(r.date)}</td>
                      <td className="px-3 py-2 whitespace-nowrap w-[60px]">
                        <SimpleTooltip content={r.reason ?? '无说明'}>
                          <span className={r.action === 'buy' ? 'text-green-600' : r.action === 'sell' ? 'text-red-600' : 'text-gray-600'}>
                            {r.action === 'hold' ? '不操作' : (r.action === 'buy' ? '买入' : '卖出')}
                          </span>
                        </SimpleTooltip>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{fmtNav(r.nav)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{fmtNumber(r.shares, 2)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{fmtNumber(r.amount, 2)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{fmtNumber(r.cashAfter, 2)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{fmtNumber(r.sharesAfter, 2)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{fmtNumber(r.totalAfter, 2)}</td>
                      <td className={`px-3 py-2 whitespace-nowrap ${r.profitSincePrev > 0 ? 'text-red-600' : r.profitSincePrev < 0 ? 'text-green-600' : ''}`}>
                        <div className="w-full flex justify-end whitespace-nowrap">{fmtNumber(r.profitSincePrev, 2)}</div>
                      </td>
                      <td className={`px-3 py-2 whitespace-nowrap ${r.profitSinceStart > 0 ? 'text-red-600' : r.profitSinceStart < 0 ? 'text-green-600' : ''}`}>
                        <div className="w-full flex justify-end whitespace-nowrap">{fmtNumber(r.profitSinceStart, 2)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {results[activeTab]!.todayTip && (
              <div className="mt-3 text-sm">今日提示：
                <SimpleTooltip content={results[activeTab]!.todayTip!.reason ?? '无说明'}>
                  <span className={results[activeTab]!.todayTip!.action === 'buy' ? 'text-green-600' : results[activeTab]!.todayTip!.action === 'sell' ? 'text-red-600' : 'text-gray-600'}>
                    {results[activeTab]!.todayTip!.action === 'hold' ? '不操作' : (results[activeTab]!.todayTip!.action === 'buy' ? `买入 ${fmtNumber(results[activeTab]!.todayTip!.shares, 2)} 份` : `卖出 ${fmtNumber(results[activeTab]!.todayTip!.shares, 2)} 份`)}
                  </span>
                </SimpleTooltip>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );

  return (typeof document !== 'undefined' && document.body) ? createPortal(body, document.body) : body;
};

export default VirtualTradeModal;

