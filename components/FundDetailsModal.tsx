import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ValuationData, HistoricalPoint } from '../types';
import { fetchFundHistory as defaultFetchFundHistory } from '../services/fundService';
import * as cacheService from '../services/cacheService';
import { computeMultipleSMAs, MA_COLORS } from '../utils/movingAverage';
import { TOLERANCE, DEFAULT_VISIBLE_MAS, MA_WINDOWS } from '../utils/maConfig';
import { computeRiskRating } from '../utils/riskTooltip';
import { computeRatingFromHistory } from '../utils/ratingHelper';
import RatingTooltip from './RatingTooltip';
import TradeManager from './TradeManager';
import useTrades from '../hooks/useTrades';
import ProfitModal from './ProfitModal';

interface FundDetailsModalProps {
  data: ValuationData;
  onClose: () => void;
  fetchHistory?: (symbol: string) => Promise<HistoricalPoint[]>; // optional injection for tests
}

export const FundDetailsModal: React.FC<FundDetailsModalProps> = ({ data, onClose, fetchHistory }) => {
  const [history, setHistory] = useState<HistoricalPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredPoint, setHoveredPoint] = useState<HistoricalPoint | null>(null);
  const [visibleMAs, setVisibleMAs] = useState<Record<number, boolean>>(() => Object.fromEntries(DEFAULT_VISIBLE_MAS.map(n => [n, true])));
  const [showTooltip, setShowTooltip] = useState(false);
  // 满仓额度与初始仓位（单位：份）
  const [fullCapacity, setFullCapacity] = useState<number>(0);
  const [initialPosition, setInitialPosition] = useState<number>(0);
  // 起始日期（YYYY-MM-DD）与初始价格（只读，从历史取）
  const [startDate, setStartDate] = useState<string | null>(null);
  const [initialPrice, setInitialPrice] = useState<number | null>(null);
  // 配置弹窗控制与临时输入
  const [showConfig, setShowConfig] = useState(false);
  const [tmpFull, setTmpFull] = useState<string>('0');
  const [tmpInitial, setTmpInitial] = useState<string>('0');
  const [tmpStartDate, setTmpStartDate] = useState<string>('');
  const [showTrade, setShowTrade] = useState(false);
  const [showProfit, setShowProfit] = useState(false);
  // validation errors for modal inputs
  const [tmpFullError, setTmpFullError] = useState<string | null>(null);
  const [tmpInitialError, setTmpInitialError] = useState<string | null>(null);
  const [tmpStartDateError, setTmpStartDateError] = useState<string | null>(null);
  // refs to inputs for focusing
  const fullInputRef = useRef<HTMLInputElement | null>(null);
  const initialInputRef = useRef<HTMLInputElement | null>(null);
  // refs for computing marker tooltip position relative to modal container
  const svgRef = useRef<SVGSVGElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [markerTooltip, setMarkerTooltip] = useState<{ left: number; top: number; lines: string[] } | null>(null);

  const fetchFn = fetchHistory ?? defaultFetchFundHistory;

  // runtime dev flag: prefer NODE_ENV (works in Jest); Vite may replace this at build time
  const isDev = typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development';

  // localStorage key per fund symbol
  const storageKey = `fund_position_${data.symbol}`;

  // helper to convert timestamp to local YYYY-MM-DD key (used by startDate lookups)
  const localDateKey = (ts: number) => {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // helper: get price for isoDate from history: exact match or nearest previous available (<= end of day)
  const getPriceForISODate = (isoDate: string): number | null => {
    if (!history || history.length === 0) return null;
    // exact match
    const exact = history.find(h => localDateKey(h.date) === isoDate);
    if (exact) return exact.value;
    // find last point <= end of day
    const end = new Date(isoDate);
    end.setHours(23, 59, 59, 999);
    const endTs = end.getTime();
    const prev = [...history].filter(h => h.date <= endTs).sort((a, b) => b.date - a.date)[0];
    if (prev) return prev.value;
    // B: fallback to earliest available history point if none <= end of day
    const first = history[0];
    return first ? first.value : null;
  };

  // formatting helpers
  const formatCurrency = (v: number, decimals = 2) => {
    try {
      return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v) + ' 元';
    } catch (e) {
      return v.toFixed(decimals) + ' 元';
    }
  };

  // load persisted config on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const obj = JSON.parse(raw);
        // Coerce persisted values (accept numbers or numeric strings)
        if (obj.fullCapacity !== undefined && obj.fullCapacity !== null) setFullCapacity(Number(obj.fullCapacity) || 0);
        if (obj.initialPosition !== undefined && obj.initialPosition !== null) setInitialPosition(Number(obj.initialPosition) || 0);
        if (typeof obj.startDate === 'string') setStartDate(obj.startDate);
        // load persisted initialPrice if present (number or numeric string) — allow null
        if (obj.initialPrice === null) setInitialPrice(null);
        else if (obj.initialPrice !== undefined) {
          const p = Number(obj.initialPrice);
          setInitialPrice(!Number.isNaN(p) ? p : null);
        }
      }
    } catch (e) {
      // ignore parse errors
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      // 先查内存缓存，命中则秒开无需网络请求
      const code = data.symbol.padStart(6, '0');
      const cached = cacheService.getHistory(code);
      if (cached && cached.length > 0) {
        if (mounted) {
          setHistory(cached.slice(-90));
          setLoading(false);
        }
        return;
      }
      // 缓存未命中，走网络请求（fetchFn 内部也会写入 cacheService）
      setLoading(true);
      try {
        const points = await fetchFn(data.symbol);
        if (mounted) setHistory(points.slice(-90));
      } catch (e) {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [data.symbol, fetchFn]);

  // If startDate is configured but initialPrice is null, try to compute it once history arrives
  useEffect(() => {
    if (!startDate) return;
    // only act if we don't already have an initialPrice
    if (initialPrice !== null) return;
    if (!history || history.length === 0) return;
    const price = getPriceForISODate(startDate);
    if (price !== null) {
      setInitialPrice(price);
      try {
        localStorage.setItem(storageKey, JSON.stringify({ fullCapacity, initialPosition, startDate, initialPrice: price }));
      } catch (e) {
        // ignore
      }
    }
  }, [history, startDate, initialPrice, storageKey, fullCapacity, initialPosition]);

  // Merge realtime point carefully: only append realtime valuation when it's strictly after last history timestamp
  // and avoid duplicating if last history point is the same day as realtime.
  const chartData = useMemo(() => {
    if (history.length === 0) return [];

    const lastHist = history[history.length - 1];
    const dateStr = data.realtimeDate && data.realtimeDate !== '---' ? data.realtimeDate : new Date().toISOString().split('T')[0];
    const valuationTs = new Date(dateStr + ' 15:00').getTime();

    // If lastHist.date is on same local day as valuationTs, replace it with realtime point to avoid duplicate days
    const lastDayKey = localDateKey(lastHist.date);
    const valDayKey = localDateKey(valuationTs);
    if (lastDayKey === valDayKey) {
      // replace last entry with realtime
      return [...history.slice(0, history.length - 1), { date: valuationTs, value: data.currentPrice, equityReturn: data.changePercentage }];
    }

    // otherwise if valuation ts is after lastHist, append
    if (!isNaN(valuationTs) && valuationTs > lastHist.date) {
      return [...history, { date: valuationTs, value: data.currentPrice, equityReturn: data.changePercentage }];
    }
    return history;
  }, [history, data.currentPrice, data.changePercentage, data.realtimeDate]);

  const { path, area, points, viewBox, yLabels, xLabels, maPaths, maValues } = useMemo(() => {
    if (chartData.length < 2) return { path: '', area: '', points: [], viewBox: '0 0 100 100', yLabels: [], xLabels: [], maPaths: {} as Record<number, string>, maValues: {} as Record<number, (number | null)[]> };

    const width = 1000;
    const height = 450;
    const paddingLeft = 60;
    const paddingRight = 30;
    const paddingTop = 40;
    const paddingBottom = 60;

    const values = chartData.map(p => p.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const margin = (rawMax - rawMin) * 0.1 || 0.01;
    const min = rawMin - margin;
    const max = rawMax + margin;
    const range = max - min;

    const getX = (idx: number) => paddingLeft + (idx * (width - paddingLeft - paddingRight) / (chartData.length - 1));
    const getY = (val: number) => height - paddingBottom - ((val - min) / range * (height - paddingTop - paddingBottom));

    const svgPoints = chartData.map((p, i) => ({
      x: getX(i),
      y: getY(p.value),
      data: p
    }));

    const pathData = `M ${svgPoints[0].x} ${svgPoints[0].y} ` +
      svgPoints.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');

    const areaData = pathData +
      ` L ${svgPoints[svgPoints.length - 1].x} ${height - paddingBottom}` +
      ` L ${svgPoints[0].x} ${height - paddingBottom} Z`;

    const yLabelsCount = 4;
    const yLabels = Array.from({ length: yLabelsCount }).map((_, i) => {
      const val = min + (i * range / (yLabelsCount - 1));
      return { text: val.toFixed(4), y: getY(val) };
    });

    const xLabelIndices = [0, Math.floor(chartData.length / 2), chartData.length - 1];
    const xLabels = xLabelIndices.map(idx => {
      const d = new Date(chartData[idx].date);
      return { text: `${d.getMonth() + 1}/${d.getDate()}`, x: getX(idx) };
    });

    // Calculate multiple SMAs (5,10,20)
    const maValues = computeMultipleSMAs(values, MA_WINDOWS);
    const maPaths: Record<number, string> = {};

    for (const w of MA_WINDOWS) {
      const sma = maValues[w];
      // build path for this SMA
      const smaPts = sma.map((v, i) => v !== null ? { x: getX(i), y: getY(v as number) } : null);
      const firstIdx = smaPts.findIndex(p => p !== null);
      if (firstIdx !== -1) {
        let d = `M ${(smaPts[firstIdx] as any).x} ${(smaPts[firstIdx] as any).y} `;
        for (let j = firstIdx + 1; j < smaPts.length; j++) {
          const p = smaPts[j];
          if (p) d += `L ${p.x} ${p.y} `;
        }
        maPaths[w] = d;
      } else {
        maPaths[w] = '';
      }
    }

    return { path: pathData, area: areaData, points: svgPoints, viewBox: `0 0 ${width} ${height}`, yLabels, xLabels, maPaths, maValues };
  }, [chartData]);

  // Rating logic based on MAs and price (use shared computeRiskRating to ensure consistency)
  const ratingInfo = useMemo(() => {
    try {
      // computeRatingFromHistory will merge history + today's valuation same as chartData logic
      return computeRatingFromHistory(chartData, data);
    } catch (e) {
      return { rating: '谨慎' as const, color: '#f59e0b', action: '观望', reasons: ['数据不足或均线关系不明确，建议观望'] };
    }

  }, [chartData, data]);

  const formattedNetWorthDate = data.netWorthDate && data.netWorthDate !== '---'
    ? data.netWorthDate.split('-').slice(1).join('/')
    : '---';

  // helpers for config modal
  const openConfig = () => {
    console.log('openConfig invoked for', data.symbol);
    setTmpFull(fullCapacity.toString());
    setTmpInitial(initialPosition.toString());
    setTmpStartDate(startDate ?? (data.realtimeDate && data.realtimeDate !== '---' ? data.realtimeDate : ''));
    // clear previous errors when opening
    setTmpFullError(null);
    setTmpInitialError(null);
    setTmpStartDateError(null);
    setShowConfig(true);
  };
  const saveConfig = async () => {
    // validate inputs and decide focus immediately
    const fRaw = tmpFull.trim();
    const iRaw = tmpInitial.trim();
    const sRaw = (tmpStartDate || '').trim();
    const fNum = Number(fRaw);
    const iNum = Number(iRaw);
    let hasError = false;
    // syntactic checks
    if (fRaw === '' || Number.isNaN(fNum) || !isFinite(fNum) || fNum < 0) {
      setTmpFullError(fRaw === '' || Number.isNaN(fNum) || !isFinite(fNum) ? '请输入有效的满仓额度（数字）' : '满仓额度不能为负');
      if (fullInputRef.current) fullInputRef.current.focus();
      hasError = true;
    }
    if (!hasError && (iRaw === '' || Number.isNaN(iNum) || !isFinite(iNum) || iNum < 0)) {
      setTmpInitialError(iRaw === '' || Number.isNaN(iNum) || !isFinite(iNum) ? '请输入有效的初始仓位（数字）' : '初始仓位不能为负');
      if (initialInputRef.current) initialInputRef.current.focus();
      hasError = true;
    }
    if (!hasError) {
      if (fNum !== 0 && iNum > fNum) {
        setTmpInitialError('初始仓位不能大于满仓额度');
        if (initialInputRef.current) initialInputRef.current.focus();
        hasError = true;
      }
    }
    // validate start date format (YYYY-MM-DD)
    if (sRaw) {
      // simple YYYY-MM-DD check
      if (!/^\d{4}-\d{2}-\d{2}$/.test(sRaw)) {
        setTmpStartDateError('请输入有效的起始日期（YYYY-MM-DD）');
        hasError = true;
      } else {
        setTmpStartDateError(null);
      }
    } else {
      setTmpStartDateError(null);
    }
    if (hasError) return;

    // commit values
    let f = Number(tmpFull) || 0;
    let c = Number(tmpInitial) || 0;
    let s = tmpStartDate ? tmpStartDate.trim() : '';
    if (f < 0) f = 0;
    if (c < 0) c = 0;
    if (f === 0) c = 0;
    if (c > f) c = f;
    setFullCapacity(f);
    setInitialPosition(c);
    // compute initial price from history for the start date (if provided)
    if (s) {
      // if history not loaded, try to fetch it now to compute initial price
      if (!history || history.length === 0) {
        try {
          const points = await fetchFn(data.symbol);
          setHistory(points.slice(-365));
        } catch (e) {
          // ignore
        }
      }
      const price = getPriceForISODate(s);
      setStartDate(s);
      setInitialPrice(price);
      try {
        localStorage.setItem(storageKey, JSON.stringify({ fullCapacity: f, initialPosition: c, startDate: s || null, initialPrice: price !== null ? price : null }));
      } catch (e) {
        // ignore storage errors
      }
    } else {
      setStartDate(null);
      setInitialPrice(null);
      try { localStorage.setItem(storageKey, JSON.stringify({ fullCapacity: f, initialPosition: c, startDate: null, initialPrice: null })); } catch (e) {}
    }
    setShowConfig(false);
  };
  const clearConfig = () => {
    setFullCapacity(0);
    setInitialPosition(0);
    setStartDate(null);
    setInitialPrice(null);
    try { localStorage.removeItem(storageKey); } catch (e) {}
    setShowConfig(false);
  };

  // live-validate current tmp values and set errors (returns whether valid)
  const validateTmp = (showErrors = true) => {
    const fRaw = tmpFull.trim();
    const iRaw = tmpInitial.trim();
    const sRaw = (tmpStartDate || '').trim();
    let hasError = false;
    const fNum = Number(fRaw);
    const iNum = Number(iRaw);

    if (fRaw === '' || Number.isNaN(fNum) || !isFinite(fNum) || fNum < 0) {
      if (showErrors) setTmpFullError(fRaw === '' || Number.isNaN(fNum) || !isFinite(fNum) ? '请输入有效的满仓额度（数字）' : '满仓额度不能为负');
      hasError = true;
    } else {
      if (showErrors) setTmpFullError(null);
    }

    if (iRaw === '' || Number.isNaN(iNum) || !isFinite(iNum) || iNum < 0) {
      if (showErrors) setTmpInitialError(iRaw === '' || Number.isNaN(iNum) || !isFinite(iNum) ? '请输入有效的初始仓位（数字）' : '初始仓位不能为负');
      hasError = true;
    } else {
      if (showErrors) setTmpInitialError(null);
    }

    // validate start date format (YYYY-MM-DD)
    if (sRaw) {
      // simple YYYY-MM-DD check
      if (!/^\d{4}-\d{2}-\d{2}$/.test(sRaw)) {
        if (showErrors) setTmpStartDateError('请输入有效的起始日期（YYYY-MM-DD）');
        hasError = true;
      } else {
        if (showErrors) setTmpStartDateError(null);
      }
    } else {
      if (showErrors) setTmpStartDateError(null);
    }

    return !hasError;
  };

  const isFormValid = useMemo(() => validateTmp(false), [tmpFull, tmpInitial, tmpStartDate]);

  // temporary initial price computed from tmpStartDate (or persisted startDate) and history
  const tmpInitialPrice = useMemo(() => {
    const s = (tmpStartDate && tmpStartDate.trim()) || startDate;
    if (!s) return null;
    return getPriceForISODate(s);
  }, [tmpStartDate, startDate, history]);

  // holdings summary from trades
  const { trades: tradeList } = useTrades(data.symbol);

  // Compute holdings and profit using initialPosition and trades per requirements, but only when fullCapacity configured (>0)
  // If fullCapacity is 0 (not configured), we treat these values as not-applicable (null) so they don't appear in other aggregations.
  const holdings = useMemo(() => {
    if (!fullCapacity || fullCapacity <= 0) {
      return { totalShares: 0, buyShares: 0, sellShares: 0, buyAmount: 0, sellAmount: 0, marketValue: null as number | null, profit: null as number | null };
    }
    let buyShares = 0;
    let sellShares = 0;
    let buyAmount = 0; // sum of buy: price*shares + fee
    let sellAmount = 0; // sum of sell: price*shares - (t.fee || 0);
    for (const t of tradeList || []) {
      if (t.type === 'buy') {
        buyShares += t.shares;
        buyAmount += t.price * t.shares + (t.fee || 0);
      } else {
        sellShares += t.shares;
        sellAmount += t.price * t.shares - (t.fee || 0);
      }
    }
    const totalShares = initialPosition + buyShares - sellShares;
    const marketValue = totalShares * data.currentPrice;
    // initialPrice may be null -> treat as 0 for calculation (or if null, initialPosition*0)
    const initPrice = initialPrice !== null ? initialPrice : 0;
    const profit = (totalShares * data.currentPrice) + sellAmount - buyAmount - (initialPosition * initPrice);
    return { totalShares, buyShares, sellShares, buyAmount, sellAmount, marketValue, profit };
  }, [tradeList, data.currentPrice, initialPosition, initialPrice, fullCapacity]);

  const { totalShares, buyShares, sellShares, buyAmount, sellAmount, marketValue, profit } = holdings;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}></div>

      <div className="relative bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]" style={{ maxWidth: '46.3rem' }}>
        <div className="px-6 py-6 border-b border-gray-50 flex justify-between items-start">
          <div className="min-w-0"> {/* allow left column to shrink and not push actions out */}
             <div className="flex items-center space-x-2 mb-1">
               <h2 className="text-xl font-black text-gray-800 leading-tight truncate">{data.name}</h2>
               <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] font-mono">{data.symbol}</span>
                {/* Rating badge */}
                <RatingTooltip ratingInfo={ratingInfo} open={showTooltip} onOpen={() => setShowTooltip(true)} onClose={() => setShowTooltip(false)} alignRight={false} />
             </div>
            <div className="flex items-baseline space-x-3">
              <span className={`text-2xl font-normal ${data.changePercentage >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                {data.currentPrice.toFixed(4)}
              </span>
              <span className={`text-sm font-medium ${data.changePercentage >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                {data.changePercentage >= 0 ? '+' : ''}{data.changePercentage.toFixed(2)}%
              </span>
              <span className="text-[10px] text-gray-400 font-medium">前值: {data.previousPrice.toFixed(4)} ({formattedNetWorthDate})</span>
            </div>
            {/* Position summary: show only when configured (fullCapacity > 0 or startDate present) */}
            {(fullCapacity > 0 || startDate || initialPrice !== null) && (
             <div className="mt-2 text-xs text-gray-600 flex items-baseline space-x-6 whitespace-nowrap overflow-visible">
                {fullCapacity > 0 && (
                  <span className="whitespace-nowrap">满仓份额：<span className="font-medium">{fullCapacity.toFixed(2)}份</span></span>
                )}
                {initialPosition > 0 && (
                  <span className="whitespace-nowrap">初始份额：<span className="font-medium">{initialPosition.toFixed(2)}份</span></span>
                )}
                {startDate && (
                  <span className="whitespace-nowrap">起始日期：<span className="font-medium">{startDate}</span></span>
                )}
                {initialPrice !== null && (
                 <span className="whitespace-nowrap">初始价格：<span className="font-medium">{initialPrice.toFixed(4)}</span></span>
                )}
              </div>
            )}

           {/* Market / position / profit row - only show when fullCapacity configured (>0) */}
           {fullCapacity && fullCapacity > 0 ? (
             <div className="mt-1 text-xs text-gray-600 flex items-baseline space-x-6 whitespace-nowrap">
               <span className="whitespace-nowrap">市场价值：<span className="font-medium">{(marketValue !== null && !isNaN(marketValue as any)) ? formatCurrency(marketValue as number, 2) : '—'}</span></span>
               <span className="whitespace-nowrap">当前仓位：<span className="font-medium">{(typeof totalShares === 'number') ? `${totalShares.toFixed(2)} 份` : '—'}</span></span>
               <span className="whitespace-nowrap">仓位占比：<span className="font-medium">{(fullCapacity > 0) ? `${((totalShares / fullCapacity) * 100).toFixed(2)}%` : '—'}</span></span>
               <span className="whitespace-nowrap">整体盈利：<span className={`font-medium ${typeof profit === 'number' ? (profit < 0 ? 'text-green-600' : profit > 0 ? 'text-red-600' : 'text-gray-600') : ''}`}>{(typeof profit === 'number') ? formatCurrency(profit, 2) : '—'}</span></span>
             </div>
           ) : null}
          </div>
          <div className="flex-shrink-0 flex items-center space-x-2"> {/* lock actions to avoid being pushed out */}
             {/* 配置与交易按钮 */}
             <button aria-label="配置仓位" title="配置仓位" onClick={openConfig} className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors">
               <i className="fas fa-cog"></i>
             </button>
             <button aria-label="交易管理" aria-haspopup="dialog" title="交易管理" onClick={() => { if (fullCapacity && fullCapacity > 0) setShowTrade(true); }}
               className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${fullCapacity && fullCapacity > 0 ? 'bg-gray-50 text-gray-500 hover:bg-gray-100' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}
               disabled={!(fullCapacity && fullCapacity > 0)}>
                <i className="fas fa-exchange-alt"></i>
              </button>
             {/* 盈利按钮：放在交易按钮右侧 */}
             <button aria-label="查看盈利" aria-haspopup="dialog" title="查看每日盈利" onClick={() => { if (fullCapacity && fullCapacity > 0) setShowProfit(true); }}
               className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${fullCapacity && fullCapacity > 0 ? 'bg-gray-50 text-gray-500 hover:bg-gray-100' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}
               disabled={!(fullCapacity && fullCapacity > 0)}>
               <i className="fas fa-chart-line"></i>
             </button>
              <button onClick={onClose} className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
                <i className="fas fa-times"></i>
              </button>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center space-y-3">
              <i className="fas fa-circle-notch animate-spin text-red-500 text-3xl"></i>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">正在抓取净值趋势...</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="relative bg-gray-50 rounded-2xl p-4">
                <div className="absolute top-4 left-4 z-10 h-12">
                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">净值趋势 (近90个交易日)</p>
                   {hoveredPoint && (
                     <div className="animate-in fade-in slide-in-from-left-2 duration-150">
                        <p className="text-lg font-normal text-gray-800">{(hoveredPoint as any).value !== undefined ? (hoveredPoint as any).value.toFixed(4) : '—'}</p>
                        <p className="text-[10px] text-gray-500 font-bold">
                           {hoveredPoint.date ? localDateKey((hoveredPoint as any).date) : ''}
                           <span className={`ml-2 font-medium ${hoveredPoint.equityReturn >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                             {hoveredPoint.equityReturn > 0 ? '+' : ''}{hoveredPoint.equityReturn !== undefined ? hoveredPoint.equityReturn.toFixed(2) : '0.00'}%
                           </span>
                        </p>
                        {/* If hovered point is a trade, show trade details */}
                        {(hoveredPoint as any).shares !== undefined && (
                          <div className="text-xs text-gray-600 mt-1">
                            <div>类型：<span className="font-medium">{(hoveredPoint as any).tradeType === 'buy' ? '买入' : '卖出'}</span></div>
                            <div>份额：<span className="font-medium">{(hoveredPoint as any).shares}</span></div>
                            <div>价格：<span className="font-medium">{(hoveredPoint as any).price.toFixed(4)}</span></div>
                          </div>
                        )}
                        {/* show MA values at hovered index when hoveredPoint corresponds to history point */}
                        <div className="flex items-center space-x-2 mt-1">
                          {Object.keys(maValues).map(k => {
                            const n = parseInt(k, 10);
                            const arr = maValues[n];
                            const idx = points.findIndex(p => p.data === hoveredPoint || p.data.date === hoveredPoint.date);
                            const v = idx >= 0 ? arr[idx] : null;
                            if (!v) return null;
                            return (
                              <span key={k} className="text-xs font-mono text-gray-500">
                                <span style={{ color: MA_COLORS[n] }}>{n}：</span>{v.toFixed(4)}
                              </span>
                            );
                          })}
                        </div>
                     </div>
                   )}
                </div>

                <svg viewBox={viewBox} className="w-full h-auto drop-shadow-sm overflow-visible" onMouseLeave={() => setHoveredPoint(null)}>
                  <defs>
                    <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {yLabels.map((label, i) => (
                    <g key={i}>
                      <line x1="60" y1={label.y} x2="970" y2={label.y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 4" />
                      <text x="50" y={label.y} textAnchor="end" alignmentBaseline="middle" className="text-[22px] fill-gray-400 font-mono">{label.text}</text>
                    </g>
                  ))}
                  {xLabels.map((label, i) => (
                    <text key={i} x={label.x} y="420" textAnchor="middle" className="text-[22px] fill-gray-400 font-medium">{label.text}</text>
                  ))}
                  <path d={area} fill="url(#gradient)" className="transition-all duration-700" />
                  <path d={path} fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="transition-all duration-700" />
                  {/* render MA lines based on visibility */}
                  {Object.keys(maPaths).map(k => {
                    const n = parseInt(k, 10);
                    const d = maPaths[n];
                    if (!d || !visibleMAs[n]) return null;
                    return <path key={k} d={d} fill="none" stroke={MA_COLORS[n] || '#2563eb'} strokeWidth={n === 5 ? 2 : 1.5} strokeLinecap="round" className="transition-all duration-700" />;
                  })}
                  <circle cx={points[points.length - 1]?.x} cy={points[points.length - 1]?.y} r="6" fill="#ef4444" className="animate-pulse" />
                  {/* transparent overlays for hover handling (behind markers) */}
                  {points.map((p, i) => (
                    <rect key={i} x={p.x - 5} y={0} width="10" height="400" fill="transparent" onMouseEnter={() => setHoveredPoint(p.data)} className="cursor-crosshair" />
                  ))}
                  {/* Trade markers: aggregate trades by calendar date and render one marker per date on the net value line */}
                  {tradeList && tradeList.length > 0 && points && points.length > 0 && (() => {
                    // aggregate trades by date key (YYYY-MM-DD)
                    // accumulate per-date shares AND amounts
                    const byDate: Record<string, { buy: number; sell: number; buyAmount: number; sellAmount: number }> = {};
                    for (const t of tradeList) {
                      const dKey = (t.date || '').trim();
                      if (!dKey) continue;
                      if (!byDate[dKey]) byDate[dKey] = { buy: 0, sell: 0, buyAmount: 0, sellAmount: 0 };
                      const shares = Number(t.shares || 0);
                      const amt = (t.price || 0) * shares + (t.fee || 0);
                      if (t.type === 'buy') {
                        byDate[dKey].buy += shares;
                        // buy amount = price*shares + fee
                        byDate[dKey].buyAmount += amt;
                      } else {
                        byDate[dKey].sell += shares;
                        // sell amount = price*shares - fee
                        byDate[dKey].sellAmount += ((t.price || 0) * shares - (t.fee || 0));
                      }
                    }

                    const markers: Array<{ dateKey: string; net: number; x: number; y: number }> = [];
                    for (const dateKey of Object.keys(byDate)) {
                      const agg = byDate[dateKey];
                      const net = (agg.buy || 0) - (agg.sell || 0);
                      // compute net amount = total buys - total sells, then take absolute value for display
                      const netAmount = Math.abs((agg.buyAmount || 0) - (agg.sellAmount || 0));
                      if (!net || net === 0) continue; // skip zero net
                      // find chart index matching this date (last point <= end of that day)
                      const end = new Date(dateKey);
                      end.setHours(23, 59, 59, 999);
                      const endTs = end.getTime();
                      let idx = -1;
                      for (let i = 0; i < chartData.length; i++) {
                        if (chartData[i].date <= endTs) idx = i;
                      }
                      if (idx === -1) continue; // no suitable point
                      const pt = points[idx];
                      if (!pt) continue;
                      markers.push({ dateKey, net, x: pt.x, y: pt.y });
                    }

                    const fmtShares = (v: number) => {
                      if (Number.isInteger(v)) return `${v}`;
                      return v.toFixed(2);
                    };

                    return markers.map((m, i) => {
                      const isBuy = m.net > 0;
                      const absShares = Math.abs(m.net);
                      // find aggregated amounts for this date to include in tip
                      const agg = (byDate as any)[m.dateKey];
                      const totalAmt = agg ? Math.abs((agg.buyAmount || 0) - (agg.sellAmount || 0)) : 0;
                      const tip = `${isBuy ? '买入' : '卖出'}${fmtShares(absShares)}份 · 总额: ${formatCurrency(totalAmt, 2)}`;
                      return (
                        <g key={`trade-${m.dateKey}-${i}`} className="cursor-pointer" onMouseEnter={() => { /* keep tooltip native; do not set side panel */ }}>
                          <circle cx={m.x} cy={m.y} r={6} fill={isBuy ? '#10b981' : '#ef4444'} stroke="#fff" strokeWidth={1.6} />
                          <title>{tip}</title>
                        </g>
                      );
                    });
                  })()}
                   {hoveredPoint && (() => {
                      const pt = points.find(p => p.data === hoveredPoint);
                      const dateLabel = hoveredPoint && hoveredPoint.date ? localDateKey((hoveredPoint as any).date) : '';
                      const x = pt ? pt.x : 0;
                      return (
                        <g>
                          <line x1={x} y1="40" x2={x} y2="380" stroke="#ef4444" strokeWidth="1" strokeDasharray="4 2" className="pointer-events-none" />
                          {/* date label above the chart for hovered point */}
                          <text x={x} y={30} textAnchor="middle" className="text-[12px] font-medium fill-gray-700 pointer-events-none">{dateLabel}</text>
                        </g>
                      );
                   })()}
                 </svg>

                 <div className="mt-3 flex items-center space-x-2">
                   <label className="text-xs text-gray-500 font-medium">均线：</label>
                  {[5,10,20].map(n => (
                    <button key={n} type="button" onClick={() => setVisibleMAs(v => ({ ...v, [n]: !v[n] }))} className={`text-xs px-2 py-1 rounded ${visibleMAs[n] ? 'bg-gray-100' : 'bg-white'} border`}>{n}</button>
                  ))}
                </div>

              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div className="p-4 bg-gray-50 rounded-2xl">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">最后更新</p>
                    <p className="text-sm font-bold text-gray-700">{data.lastUpdated}</p>
                 </div>
                 <div className="p-4 bg-gray-50 rounded-2xl">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">估值日期</p>
                    <p className="text-sm font-bold text-gray-700">{data.realtimeDate}</p>
                 </div>
              </div>

              <a href={data.sourceUrl} target="_blank" rel="noreferrer" className="block w-full py-4 text-center text-xs font-bold text-gray-400 border border-gray-100 rounded-2xl hover:bg-gray-50 transition-colors">
                在天天基金查看详细页 <i className="fas fa-external-link-alt ml-1"></i>
              </a>

              {/* Debug panel (dev only) */}
              {isDev && (
                  <div className="mt-6 p-4 bg-gray-50 rounded-2xl border">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">调试信息</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-sm text-gray-700">
                        <span className="font-medium">起始日期:</span> {startDate}
                      </div>
                      <div className="text-sm text-gray-700">
                        <span className="font-medium">初始价格:</span> {initialPrice !== null ? initialPrice.toFixed(4) : 'N/A'}
                      </div>
                      <div className="text-sm text-gray-700">
                        <span className="font-medium">市值:</span> {marketValue !== null && !isNaN(marketValue) ? formatCurrency(marketValue, 2) : '—'}
                      </div>
                      <div className="text-sm text-gray-700">
                        <span className="font-medium">盈亏:</span> <span className={`${typeof profit === 'number' ? (profit < 0 ? 'text-green-600' : profit > 0 ? 'text-red-600' : 'text-gray-700') : ''}`}>{profit !== null && !isNaN(profit) ? formatCurrency(profit, 2) : '—'}</span>
                      </div>
                      <div className="text-sm text-gray-700 col-span-2">
                        <span className="font-medium">交易记录:</span> {tradeList.length} 条
                      </div>
                    </div>
                  </div>
                )}
               {/* Configuration modal (show when user clicks gear) */}
               {showConfig && (
                 <div className="fixed inset-0 z-[120] flex items-center justify-center">
                   <div className="absolute inset-0 bg-black/40" onClick={() => setShowConfig(false)} />
                   <div className="relative bg-white rounded-lg shadow-lg w-full max-w-md p-6 z-30">
                     <h3 className="text-lg font-bold mb-3">配置仓位（单位：份）</h3>
                     <div className="space-y-3">
                       <div className="flex items-center justify-between">
                         <label className="text-sm text-gray-600">满仓额度</label>
                         <input
                           ref={fullInputRef}
                           aria-label="modal-full"
                           aria-invalid={!!(tmpFullError || tmpInitialError || tmpStartDateError)}
                           aria-describedby={tmpFullError || tmpInitialError || tmpStartDateError ? 'modal-errors' : undefined}
                           type="number"
                           className="w-36 px-2 py-1 border rounded text-right"
                           value={tmpFull}
                           onChange={e => { setTmpFull(e.target.value); /* run validation lightly */ }}
                           onBlur={() => { /* validation handled on save */ }}
                         />
                       </div>
                       <div className="flex items-center justify-between">
                         <label className="text-sm text-gray-600">初始持仓</label>
                         <input
                           ref={initialInputRef}
                           aria-label="modal-initial"
                           aria-invalid={!!(tmpFullError || tmpInitialError || tmpStartDateError)}
                           aria-describedby={tmpFullError || tmpInitialError || tmpStartDateError ? 'modal-errors' : undefined}
                           type="number"
                           className="w-36 px-2 py-1 border rounded text-right"
                           value={tmpInitial}
                           onChange={e => { setTmpInitial(e.target.value); }}
                           onBlur={() => {}}
                         />
                       </div>
                       <div className="flex items-center justify-between">
                         <label className="text-sm text-gray-600">起始日期</label>
                         <input
                           aria-label="modal-start-date"
                           aria-invalid={!!tmpStartDateError}
                           aria-describedby={tmpStartDateError ? 'modal-errors' : undefined}
                           type="date"
                           className="w-36 px-2 py-1 border rounded text-right"
                           value={tmpStartDate}
                           onChange={e => { setTmpStartDate(e.target.value); }}
                         />
                       </div>
                       <div className="flex items-center justify-between">
                         <label className="text-sm text-gray-600">初始价格</label>
                         <input
                           aria-label="modal-initial-price"
                           type="text"
                           readOnly
                           className="w-44 px-2 py-1 border rounded text-right bg-gray-50"
                           value={
                             // during editing, prefer the temporary computed price for the tmpStartDate; fallback to persisted initialPrice
                            (tmpStartDate && tmpStartDate.trim()) ? (tmpInitialPrice !== null ? tmpInitialPrice.toFixed(4) : '—') : (initialPrice !== null ? initialPrice.toFixed(4) : '—')
                           }
                         />
                       </div>
                       <div className="mt-3 flex items-center justify-end space-x-2">
                         <button className="px-3 py-1 rounded bg-gray-100 whitespace-nowrap" onClick={() => setShowConfig(false)}>取消</button>
                         <button className="px-3 py-1 rounded bg-red-100 text-red-600 whitespace-nowrap" onClick={() => { clearConfig(); }}>清除</button>
                         <button className="px-3 py-1 rounded bg-emerald-500 text-white disabled:opacity-50 whitespace-nowrap" onClick={() => { saveConfig(); }}>
                           保存
                         </button>
                       </div>
                       <div id="modal-errors" role="alert" aria-live="assertive" className="text-xs text-red-600 min-h-[1.25rem] mt-2 text-left">
                         {tmpFullError && <div>{tmpFullError}</div>}
                         {tmpInitialError && <div>{tmpInitialError}</div>}
                         {tmpStartDateError && <div>{tmpStartDateError}</div>}
                       </div>
                     </div>
                   </div>
                 </div>
               )}
               {/* Trade manager modal rendered into document.body to avoid z-index issues */}
               {showTrade && (typeof document !== 'undefined' && document.body ? createPortal(
                 <TradeManager name={data.name} symbol={data.symbol} currentPrice={data.currentPrice} onClose={() => setShowTrade(false)} />,
                 document.body
               ) : <TradeManager name={data.name} symbol={data.symbol} currentPrice={data.currentPrice} onClose={() => setShowTrade(false)} />)}
               {showProfit && (typeof document !== 'undefined' && document.body ? createPortal(
                 <ProfitModal symbol={data.symbol} fundName={data.name} currentPrice={data.currentPrice} realtimeDate={data.realtimeDate} initialPosition={initialPosition} initialPrice={initialPrice} initialStartDate={startDate} onClose={() => setShowProfit(false)} />,
                 document.body
               ) : <ProfitModal symbol={data.symbol} fundName={data.name} currentPrice={data.currentPrice} realtimeDate={data.realtimeDate} initialPosition={initialPosition} initialPrice={initialPrice} initialStartDate={startDate} onClose={() => setShowProfit(false)} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


