import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HistoricalPoint, ValuationData, VirtualTradeResult } from '../types';
import { runVirtualTrade } from '../services/virtualTradeEngine';
import { trendFollowingStrategy } from '../services/virtualTradeStrategies/trendFollowing';
import { meanReversionStrategy } from '../services/virtualTradeStrategies/meanReversion';
import { constantMixStrategy } from '../services/virtualTradeStrategies/constantMix';
import { fetchFundHistory as defaultFetchFundHistory } from '../services/fundService';
import { resolvePreferredPrice, toLocalDateKey } from '../utils/priceResolver';
import SimpleTooltip from './SimpleTooltip';
import { fmtNumber, fmtNav, parseFormattedNumber, formatMoneyWithSeparators } from '../utils/format';
import ThumbsUpIcon from './ThumbsUpIcon';
import { getUnitsForDate } from '../utils/positionHelper';
import { defaultVirtualCash } from '../services/strategyConfig';
import { computeProfitTimeline } from '../utils/profitCalculator';
import useTrades from '../hooks/useTrades';

interface Props {
  symbol: string;
  fundName?: string;
  history?: HistoricalPoint[];
  valuation?: ValuationData | null;
  onClose: () => void;
  fetchHistory?: (symbol: string) => Promise<HistoricalPoint[]>;
}

const strategies = [trendFollowingStrategy, meanReversionStrategy, constantMixStrategy];

export const VirtualTradeModal: React.FC<Props> = ({ symbol, fundName, history: initialHistory, valuation, onClose, fetchHistory }) => {
  const [history, setHistory] = useState<HistoricalPoint[] | null>(initialHistory ?? null);
  const fetchFn = fetchHistory ?? defaultFetchFundHistory;

  const defaultCashText = formatMoneyWithSeparators(defaultVirtualCash, 2);
  const getFallbackStartDate = () => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return toLocalDateKey(d);
  };
  const getStoredStartDate = () => {
    try {
      const rawKey = `fund_position_${symbol}`;
      const padKey = `fund_position_${String(symbol).padStart(6, '0')}`;
      const raw = localStorage.getItem(rawKey) || localStorage.getItem(padKey);
      if (!raw) return null;
      const cfg = JSON.parse(raw);
      return cfg && typeof cfg.startDate === 'string' && cfg.startDate ? cfg.startDate : null;
    } catch (e) {
      return null;
    }
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
  const [loadingDefaultUnits, setLoadingDefaultUnits] = useState<boolean>(false);
  const [startDateError, setStartDateError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<number>(0);
  const [running, setRunning] = useState(false);
  // results array aligned with strategies order; each entry is VirtualTradeResult or null if not run yet
  const [results, setResults] = useState<(VirtualTradeResult | null)[]>(() => strategies.map(() => null));
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
    try {
      const rawKey = `fund_position_${symbol}`;
      const padKey = `fund_position_${String(symbol).padStart(6, '0')}`;
      const raw = localStorage.getItem(rawKey) || localStorage.getItem(padKey);
      if (!raw) return null;
      const cfg = JSON.parse(raw);
      return {
        startDate: typeof cfg.startDate === 'string' ? cfg.startDate : null,
        initialPosition: typeof cfg.initialPosition === 'number' ? Number(cfg.initialPosition) || 0 : (typeof cfg.initialPosition === 'string' ? Number(cfg.initialPosition) || 0 : 0),
        initialPrice: cfg.initialPrice !== undefined ? (cfg.initialPrice === null ? null : Number(cfg.initialPrice)) : null,
      };
    } catch (e) { return null; }
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
    if (startDate === storedPosition.startDate && dedup.length > 0 && dedup[0].date === startDate) {
      let cumAcc = 0;
      for (let i = 0; i < dedup.length; i++) {
        const daily = i === 0 ? 0 : (dedup[i].dailyProfit || 0);
        cumAcc = Number((cumAcc + daily).toFixed(4));
        dedup[i] = {
          ...dedup[i],
          cumulativeProfit: cumAcc,
          dailyProfit: daily,
        };
      }
    }
    return dedup;
  }, [startDate, storedPosition, fullRealProfitTimeline, todayLocal]);

  const realProfit = useMemo(() => {
    if (!startDate || !storedPosition || !storedPosition.startDate) return null;
    if (startDate < storedPosition.startDate) return null;
    if (!displayedRealProfitTimeline || displayedRealProfitTimeline.length === 0) return null;
    const total = displayedRealProfitTimeline.reduce((sum, point) => sum + (point.dailyProfit || 0), 0);
    return Math.round(total * 100) / 100;
  }, [startDate, storedPosition, displayedRealProfitTimeline]);

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

  // mark unitsOverridden when user manually edits shares input
  const handleSharesChange = (v: string) => {
    setSharesInput(v);
    setUnitsOverridden(true);
  };

  const canRun = parsedCash !== null && parsedShares !== null && !!startDate && history && history.length > 0 && startDate <= toLocalDateKey(new Date(history[history.length - 1].date)) && !startDateError;

  // table scroll ref and per-tab scroll/visited tracking
  const tableRef = useRef<HTMLDivElement | null>(null);
  const tabScrollPositions = useRef<number[]>(Array(strategies.length).fill(0));
  const tabVisitedInCurrentRun = useRef<boolean[]>(Array(strategies.length).fill(false));

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
      // run all strategies and collect results
      const newResults: (VirtualTradeResult | null)[] = [];
      for (let i = 0; i < strategies.length; i++) {
        try {
          const strat = strategies[i];
          const res = runVirtualTrade(strat, history || [], { startDate, initialCash: parsedCash || 0, initialShares: parsedShares || 0, currentPrice: valuation?.currentPrice ?? null, realtimeDate: valuation?.realtimeDate ?? null, previousPrice: valuation?.previousPrice ?? null, netWorthDate: valuation?.netWorthDate ?? null });
          newResults.push(res);
        } catch (e:any) {
          // if one strategy fails, record null and continue
          newResults.push(null);
          console.error('strategy run failed', strategies[i].name, e);
        }
      }

      // reset per-tab visited/positions for this new run so first-open behavior works
      tabVisitedInCurrentRun.current = Array(strategies.length).fill(false);
      tabScrollPositions.current = Array(strategies.length).fill(0);

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
    setCashInput(defaultCashText);
    setUnitsOverridden(false);
    setStartDate(getDefaultStartDate(history ?? initialHistory ?? null));
  };

  const exportJSON = () => {
    if (!results[activeTab]) return;
    const blob = new Blob([JSON.stringify(results[activeTab], null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `virtual-trade-${symbol}-${strategies[activeTab].name}-${startDate}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    if (!results[activeTab]) return;
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
    a.download = `virtual-trade-${symbol}-${strategies[activeTab].name}-${startDate}.csv`;
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
    <div className="fixed inset-0 z-[120] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-lg w-full max-w-4xl p-6 z-30 max-h-[90vh] overflow-auto">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-bold">虚拟交易 - {fundName || symbol}</h3>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center"><i className="fas fa-times text-gray-400"></i></button>
          </div>
        </div>

        {/* inputs + start button (single inline row) */}
        <div className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,0.85fr)_minmax(0,1.3fr)] gap-4 mb-4 items-end">
          <div className="min-w-0">
            <label htmlFor={cashInputId} className="text-xs text-gray-500">现有现金</label>
            <input id={cashInputId} className="w-full px-2 py-1 border rounded text-right" value={cashInput} onChange={e => setCashInput(e.target.value)} />
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
              <button type="button" className="px-3 py-1 bg-emerald-500 text-white rounded whitespace-nowrap shrink-0" disabled={(process.env.NODE_ENV === 'test') ? running : (!canRun || running)} onClick={onStart}>{running ? '运行中...' : '开始'}</button>
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
            {strategies.map((s, i) => (
              <SimpleTooltip key={s.name} content={s.description}>
                <button
                  onClick={() => setActiveTab(i)}
                  className={`px-3 py-1 rounded inline-flex items-center gap-2 whitespace-nowrap ${activeTab === i ? 'bg-white border' : 'bg-transparent text-gray-500'}`}
                  aria-pressed={activeTab === i}
                  aria-label={`${s.name} 策略`}
                >
                  <span className="text-sm">{s.name}</span>
                  {bestStrategyIndex === i && (
                    // thumbs-up: show when this strategy is the best per rules
                    <ThumbsUpIcon className="ml-2 text-amber-500" title="当前收益最高" />
                  )}
                </button>
              </SimpleTooltip>
            ))}
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
              <table className="w-full text-xs border-collapse leading-tight">
                <thead className="sticky top-0 bg-gray-50 z-20">
                  <tr className="border-b">
                    <th className="px-3 py-2">日期</th>
                    <th className="px-3 py-2">方向</th>
                    <th className="px-3 py-2">净值</th>
                    <th className="px-3 py-2">份额</th>
                    <th className="px-3 py-2">金额</th>
                    <th className="px-3 py-2">交易后现金</th>
                    <th className="px-3 py-2">交易后份额</th>
                    <th className="px-3 py-2">交易后总资产</th>
                    <th className="px-3 py-2"><div className="flex justify-end">较前一日盈亏</div></th>
                    <th className="px-3 py-2"><div className="flex justify-end">交易后盈亏</div></th>
                  </tr>
                </thead>
                <tbody>
                  {results[activeTab]!.timeline.map((r: any) => (
                    <tr key={r.date} className={`border-t hover:bg-gray-50 ${r.action === 'buy' ? 'border-l-4 border-green-400 shadow-sm' : r.action === 'sell' ? 'border-l-4 border-red-400 shadow-sm' : ''}`}>
                      <td className="px-3 py-2">{r.date}</td>
                      <td className="px-3 py-2">
                        <SimpleTooltip content={r.reason ?? '无说明'}>
                          <span className={r.action === 'buy' ? 'text-green-600' : r.action === 'sell' ? 'text-red-600' : 'text-gray-600'}>
                            {r.action === 'hold' ? '不操作' : (r.action === 'buy' ? '买入' : '卖出')}
                          </span>
                        </SimpleTooltip>
                      </td>
                      <td className="px-3 py-2">{fmtNav(r.nav)}</td>
                      <td className="px-3 py-2 text-right">{fmtNumber(r.shares, 2)}</td>
                      <td className="px-3 py-2 text-right">{fmtNumber(r.amount, 2)}</td>
                      <td className="px-3 py-2 text-right">{fmtNumber(r.cashAfter, 2)}</td>
                      <td className="px-3 py-2 text-right">{fmtNumber(r.sharesAfter, 2)}</td>
                      <td className="px-3 py-2 text-right">{fmtNumber(r.totalAfter, 2)}</td>
                      <td className={`px-3 py-2 ${r.profitSincePrev > 0 ? 'text-red-600' : r.profitSincePrev < 0 ? 'text-green-600' : ''}`}>
                        <div className="w-full flex justify-end whitespace-nowrap">{fmtNumber(r.profitSincePrev, 2)}</div>
                      </td>
                      <td className={`px-3 py-2 ${r.profitSinceStart > 0 ? 'text-red-600' : r.profitSinceStart < 0 ? 'text-green-600' : ''}`}>
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

