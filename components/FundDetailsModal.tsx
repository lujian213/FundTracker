import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ValuationData, HistoricalPoint, IntradayPoint } from '../types';
import { fetchFundHistory as defaultFetchFundHistory } from '../services/fundService';
import * as cacheService from '../services/cacheService';
import { computeMultipleSMAs, MA_COLORS } from '../utils/movingAverage';
import { DEFAULT_VISIBLE_MAS, MA_WINDOWS } from '../utils/maConfig';
import { computeRatingFromHistory } from '../utils/ratingHelper';
import RatingTooltip from './RatingTooltip';
import TradeManager from './TradeManager';
import useTrades, { TradeRecord } from '../hooks/useTrades';
import ProfitModal from './ProfitModal';
import VirtualTradeModal from './VirtualTradeModal';
import { resolvePreferredPrice, toLocalDateKey } from '../utils/priceResolver';
import { localDateKey, AggregatedMarker, aggregateTradesByDate } from '../utils/tradeAggregation';
import IntradayChart from './IntradayChart';
import HistoryChart from './HistoryChart';

interface FundDetailsModalProps {
  data: ValuationData;
  onClose: () => void;
  fetchHistory?: (symbol: string) => Promise<HistoricalPoint[]>; // optional injection for tests
}

export const FundDetailsModal: React.FC<FundDetailsModalProps> = ({ data, onClose, fetchHistory }) => {
  const [history, setHistory] = useState<HistoricalPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'intraday' | 'history'>('intraday');
  const [intradayPoints, setIntradayPoints] = useState<any[]>([]);
  const [hoveredIntradayPoint, setHoveredIntradayPoint] = useState<IntradayPoint | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<HistoricalPoint | null>(null);
  const [hoveredTrade, setHoveredTrade] = useState<any | null>(null);
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
  const [showVirtual, setShowVirtual] = useState(false);
  // 计算器弹窗控制与输入
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcAmount, setCalcAmount] = useState<string>('');
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

  // shared chart visual height used by HistoryChart and IntradayChart
  // reduced to 180 per request; top/bottom padding will be removed to eliminate extra whitespace
  const chartHeight = 180;


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
          // keep up to 365 entries from cache (longer window)
          setHistory(cached.slice(-365));
          setLoading(false);
        }
        return;
      }
      // 缓存未命中，走网络请求（fetchFn 内部也会写入 cacheService）
      setLoading(true);
      try {
        const points = await fetchFn(data.symbol);
        // keep the network-returned points in full (no truncation)
        if (mounted) setHistory(points);
      } catch (e) {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [data.symbol, fetchFn]);

  // Load intraday points from cacheService when modal mounts or when data.symbol/lastUpdated changes
  useEffect(() => {
    try {
      const code = data.symbol.padStart ? data.symbol.padStart(6, '0') : data.symbol;
      const pts = cacheService.getIntradayPoints(code);
      setIntradayPoints(pts);
    } catch (e) { setIntradayPoints([]); }
  }, [data.symbol, data.lastUpdated]);

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

    // Merge realtime point carefully: only append/replace when realtimeDate is explicit and valid, preventing synthetic today points from distorting MA values.
    const chartData = useMemo(() => {
    if (!history || history.length === 0) return [];

    const lastHist = history[history.length - 1];
    const hasRealtimeDate = !!(data.realtimeDate && data.realtimeDate !== '---');
    if (!hasRealtimeDate) return history;

    const valuationTs = new Date(`${data.realtimeDate} 15:00`).getTime();
    if (!Number.isFinite(valuationTs)) return history;

    // If lastHist.date is on same local day as valuationTs, replace it with realtime point to avoid duplicate days.
    const lastDayKey = localDateKey(lastHist.date);
    const valDayKey = localDateKey(valuationTs);
    if (lastDayKey === valDayKey) {
      return [...history.slice(0, history.length - 1), { date: valuationTs, value: data.currentPrice, equityReturn: data.changePercentage }];
    }

    // Only append when realtime point is strictly newer than the latest confirmed history point.
    if (valuationTs > lastHist.date) {
      return [...history, { date: valuationTs, value: data.currentPrice, equityReturn: data.changePercentage }];
    }
    return history;
    }, [history, data.currentPrice, data.changePercentage, data.realtimeDate]);

  const { path, area, points, viewBox, yLabels, xLabels, maPaths, maValues } = useMemo(() => {
    // Use a display window of the most recent 90 points for the chart drawing and MA lines
    const displayWindow = 90;
    const displayData = chartData.length > displayWindow ? chartData.slice(-displayWindow) : chartData;
    if (displayData.length < 2) return { path: '', area: '', points: [], viewBox: '0 0 100 100', yLabels: [], xLabels: [], maPaths: {} as Record<number, string>, maValues: {} as Record<number, (number | null)[]> };

    const width = 1000;
    const height = chartHeight; // use shared chart height
    const paddingLeft = 60;
    const paddingRight = 30;
    // remove top/bottom padding to eliminate extra whitespace
    const paddingTop = 0; // align with HistoryChart PADDING_TOP to avoid label clipping
    const paddingBottom = 0;

    const values = displayData.map(p => p.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    // use a modest margin to avoid overly flat charts
    const margin = (rawMax - rawMin) * 0.1 || 0.01;
    const min = rawMin - margin;
    const max = rawMax + margin;
    const range = max - min;

    const getX = (idx: number) => paddingLeft + (idx * (width - paddingLeft - paddingRight) / (displayData.length - 1));
    const getY = (val: number) => height - paddingBottom - ((val - min) / range * (height - paddingTop - paddingBottom));

    const svgPoints = displayData.map((p, i) => ({
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

    const xLabelIndices = [0, Math.floor(displayData.length / 2), displayData.length - 1];
    const xLabels = xLabelIndices.map(idx => {
      const d = new Date(displayData[idx].date);
      return { x: getX(idx), text: `${d.getMonth() + 1}/${d.getDate()}` };
    });

    // Calculate multiple SMAs (5,10,20) on the display window values
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

    // Risk analysis based on history + today's valuation through the shared isolated model
  const ratingInfo = useMemo(() => {
    try {
      return computeRatingFromHistory(chartData, data);
    } catch (e) {
      return {
        rating: '观望' as const,
        color: '#f59e0b',
        action: '等待确认',
        summary: '当前可用信号不足，先观察后续均线与价格关系是否进一步明朗。',
        opportunitySignals: [],
        riskSignals: [],
        notes: ['历史数据不足，暂时只能进行有限的均线风险分析，建议继续观察。'],
        reasons: ['历史数据不足，暂时只能进行有限的均线风险分析，建议继续观察。']
      };
    }

  }, [chartData, data]);

  const formattedNetWorthDate = data.netWorthDate && data.netWorthDate !== '---'
    ? data.netWorthDate.split('-').slice(1).join('/')
    : '---';

  // helpers for config modal
  const openConfig = () => {
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

  const todayLocal = useMemo(() => toLocalDateKey(new Date()), []);

  // 基金份额计算器：本地今天估值优先；无当日可用值时回退到最近可用值（同日估值优先）
  const calcPrice = useMemo(() => resolvePreferredPrice({
    targetDate: todayLocal,
    todayDate: todayLocal,
    history,
    currentPrice: data.currentPrice,
    realtimeDate: data.realtimeDate,
    previousPrice: data.previousPrice,
    netWorthDate: data.netWorthDate,
  }), [todayLocal, history, data.currentPrice, data.realtimeDate, data.previousPrice, data.netWorthDate]);

  // 基金份额计算器：金额 / 估值，优先 currentPrice，fallback 到 previousPrice
  const calcShares = useMemo(() => {
    const price = calcPrice ? calcPrice.price : null;
    const raw = calcAmount.replace(/,/g, '').trim();
    if (!price) return { type: 'no-price' as const };
    if (raw === '') return { type: 'empty' as const };
    const num = Number(raw);
    if (Number.isNaN(num) || !isFinite(num)) return { type: 'invalid' as const };
    if (num < 0) return { type: 'negative' as const };
    return { type: 'ok' as const, value: (num / price).toFixed(2) };
  }, [calcAmount, calcPrice]);

    // holdings summary from trades
    const { trades: tradeList } = useTrades(data.symbol);

    // Aggregate trades into markers using a pure util (improves testability)
    const markers = useMemo(() => {
      try {
        return aggregateTradesByDate(tradeList, chartData, points);
      } catch (e) {
        console.error(`[FundDetailsModal] Error aggregating trades:`, e);
        return [];
      }
    }, [tradeList, chartData, points]);


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
    const resolved = resolvePreferredPrice({
      targetDate: todayLocal,
      todayDate: todayLocal,
      history,
      currentPrice: data.currentPrice,
      realtimeDate: data.realtimeDate,
      previousPrice: data.previousPrice,
      netWorthDate: data.netWorthDate,
    });
    const effectivePrice = resolved ? resolved.price : 0;
    const marketValue = totalShares * effectivePrice;
    // initialPrice may be null -> treat as 0 for calculation (or if null, initialPosition*0)
    const initPrice = initialPrice !== null ? initialPrice : 0;
    const profit = (totalShares * effectivePrice) + sellAmount - buyAmount - (initialPosition * initPrice);
    return { totalShares, buyShares, sellShares, buyAmount, sellAmount, marketValue, profit };
    }, [tradeList, todayLocal, history, data.currentPrice, data.realtimeDate, data.previousPrice, data.netWorthDate, initialPosition, initialPrice, fullCapacity]);

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
             {/* 计算器按钮 */}
             <button aria-label="基金份额计算器" title="基金份额计算器" onClick={() => setShowCalculator(true)} className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors">
               <i className="fas fa-calculator"></i>
             </button>
             {/* 虚拟交易按钮 */}
             <button aria-label="虚拟交易" title="虚拟交易" onClick={() => setShowVirtual(true)} className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors">
               <i className="fas fa-flask"></i>
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

        <div className="flex-1 overflow-hidden p-6">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center space-y-3">
              <i className="fas fa-circle-notch animate-spin text-red-500 text-3xl"></i>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">正在抓取净值趋势...</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="relative bg-gray-50 rounded-2xl p-4">
                <div className="mb-3 flex items-center space-x-2">
                  <button onClick={() => setActiveTab('intraday')} className={`px-3 py-1 rounded text-sm ${activeTab === 'intraday' ? 'bg-white border' : 'bg-transparent text-gray-500'}`}>日内趋势图</button>
                  <button onClick={() => setActiveTab('history')} className={`px-3 py-1 rounded text-sm ${activeTab === 'history' ? 'bg-white border' : 'bg-transparent text-gray-500'}`}>历史趋势图</button>
                </div>
                {activeTab === 'intraday' ? (
                  // Keep intraday chart height same as history svg height to avoid layout jump when switching tabs
                  <>
                    {/* MA placeholder to keep parity with history tab (legend area) */}
                    <div className="mt-3 flex items-center space-x-2" aria-hidden>
                      <div className="text-xs text-transparent font-medium">占位：均线</div>
                    </div>
                    <IntradayChart points={intradayPoints} width={1000} height={chartHeight} onHover={(p) => setHoveredIntradayPoint(p)} />
                    {/* Reserved fixed-width info area under intraday chart (time, value, change vs prev day) */}
                    <div className="mt-2 h-14 bg-white flex items-center justify-start px-4 border-t">
                      {(() => {
                        const hp = hoveredIntradayPoint as any;
                        const fmtTime = (ts: number) => {
                          try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return new Date(ts).toLocaleString(); }
                        };
                        const computeChange = (value: number, pct: number | undefined) => {
                          if (pct === undefined || pct === null || Number.isNaN(pct)) return { abs: null as number | null, pct: null as number | null };
                          const prev = pct === -100 ? 0 : value / (1 + pct / 100);
                          const abs = value - prev;
                          return { abs, pct };
                        };
                        let timeLabel = '—';
                        let valueLabel = '—';
                        let changeText = '—';
                        let changeClass = 'text-gray-700';
                        if (hp) {
                          timeLabel = hp.timestamp ? fmtTime(hp.timestamp) : '—';
                          valueLabel = typeof hp.value === 'number' ? (hp.value).toFixed(4) : '—';
                          const ch = computeChange(hp.value, hp.equityReturn);
                          if (ch.abs !== null && ch.pct !== null) {
                            changeText = `${(ch.abs).toFixed(4)} (${ch.pct >= 0 ? '+' : ''}${ch.pct.toFixed(2)}%)`;
                            changeClass = ch.pct >= 0 ? 'text-red-600' : 'text-green-600';
                          }
                        } else if (intradayPoints && intradayPoints.length > 0) {
                          const last = intradayPoints[intradayPoints.length - 1];
                          timeLabel = last.timestamp ? fmtTime(last.timestamp) : '—';
                          valueLabel = typeof last.value === 'number' ? last.value.toFixed(4) : '—';
                        }
                        return (
                          <>
                            <div className="w-36 mr-6"><div className="text-[10px] text-gray-400">时间</div><div className="text-sm font-medium text-gray-800">{timeLabel}</div></div>
                            <div className="w-44 mr-6"><div className="text-[10px] text-gray-400">净值</div><div className="text-sm font-medium text-gray-800">{valueLabel}</div></div>
                            <div className="w-48 mr-6"><div className="text-[10px] text-gray-400">较上一日</div><div className={`text-sm font-medium ${changeClass}`}>{changeText}</div></div>
                          </>
                        );
                      })()}
                    </div>
                  </>
                ) : null}

                {activeTab === 'history' && (
                  <>
                    <div className="mt-0">{/* remove extra gap between chart and MA toggles */}
                      <HistoryChart
                         viewBox={viewBox}
                         path={path}
                         area={area}
                         points={points}
                         yLabels={yLabels}
                         xLabels={xLabels}
                         maPaths={maPaths}
                         maValues={maValues}
                         visibleMAs={visibleMAs}
                         hoveredPoint={hoveredPoint}
                         setHoveredPoint={setHoveredPoint}
                        markers={markers}
                        onMarkerHover={(m) => setHoveredTrade(m)}
                         height={chartHeight}
                         stroke="#ef4444"
                       />
                     </div>

                    <div className="mt-0 flex items-center space-x-2">
                      <label className="text-xs text-gray-500 font-medium">均线：</label>
                      {[5,10,20].map(n => {
                        const color = MA_COLORS[n] || '#2563eb';
                        return (
                          <button
                            key={n}
                            type="button"
                            aria-label={`切换显示 MA${n}`}
                            onClick={() => setVisibleMAs(v => ({ ...v, [n]: !v[n] }))}
                            className="text-xs px-2.5 py-1 rounded border inline-flex items-center gap-1.5 transition-colors"
                            style={{ borderColor: color, color, backgroundColor: visibleMAs[n] ? `${color}1a` : '#ffffff' }}
                          >
                            <span data-testid={`ma-toggle-dot-${n}`} className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                            <span className="font-medium">MA{n}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Preallocated reserved info area under MA toggles to avoid layout jump when hover changes */}
                    <div className="mt-2 h-14 bg-white flex items-center justify-start px-4 border-t">
                      {(() => {
                        const hp = hoveredPoint as any;
                        let dateLabel = '—';
                        let valueLabel = '—';
                        let changeText = '—';
                        let changeClass = 'text-gray-700';
                        if (hp && chartData && chartData.length > 0) {
                          const idx = chartData.findIndex((p: any) => p.date === hp.date);
                          const v = (idx >= 0) ? chartData[idx].value : (chartData[chartData.length - 1].value);
                          const d = (idx >= 0) ? new Date(chartData[idx].date) : new Date(chartData[chartData.length - 1].date);
                          dateLabel = toLocalDateKey(d);
                          valueLabel = v.toFixed(4);
                          // compute previous net value for comparison
                          const prev = (idx > 0) ? chartData[idx - 1].value : null;
                          if (prev !== null && prev !== undefined) {
                            const abs = v - prev;
                            const pct = prev !== 0 ? (abs / prev * 100) : 0;
                            changeText = `${abs.toFixed(4)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
                            changeClass = pct >= 0 ? 'text-red-600' : 'text-green-600';
                          }
                        } else if (chartData && chartData.length > 0) {
                          const last = chartData[chartData.length - 1];
                          dateLabel = toLocalDateKey(new Date(last.date));
                          valueLabel = last.value.toFixed(4);
                          changeText = '—';
                        }
                        return (
                          <>
                            <div className="mr-6 w-36">
                              <div className="text-[10px] text-gray-400">时间</div>
                              <div className="text-sm font-medium text-gray-800">{dateLabel}</div>
                            </div>
                            <div className="mr-6 w-44">
                              <div className="text-[10px] text-gray-400">净值</div>
                              <div data-testid="history-current-value" className="text-sm font-medium text-gray-800">{valueLabel}</div>
                            </div>
                            <div className="mr-6 w-48">
                              <div className="text-[10px] text-gray-400">涨跌</div>
                              <div className={`text-sm font-medium ${changeClass}`}>{changeText}</div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                   </>
                 )}
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

               {/* 基金份额计算器弹窗 */}
               {showCalculator && (
                 <div className="fixed inset-0 z-[120] flex items-center justify-center">
                   <div className="absolute inset-0 bg-black/40" onClick={() => { setShowCalculator(false); setCalcAmount(''); }} />
                   <div className="relative bg-white rounded-lg shadow-lg w-full max-w-sm p-6 z-30">
                     <h3 className="text-lg font-bold mb-4">基金份额计算器</h3>
                     <div className="space-y-4">
                       <div className="flex items-center justify-between">
                         <label className="text-sm text-gray-600">买入/卖出金额（元）</label>
                         <input
                           aria-label="计算器金额输入"
                           type="text"
                           inputMode="decimal"
                           className="w-40 px-2 py-1 border rounded text-right"
                           placeholder="如 1,000"
                           value={calcAmount}
                           onChange={e => setCalcAmount(e.target.value)}
                         />
                       </div>
                       <div className="flex items-center justify-between">
                         <label className="text-sm text-gray-600">可买份额（份）</label>
                         <span
                           aria-label="计算器份额输出"
                           className={`w-40 px-2 py-1 text-right font-mono text-sm font-medium ${
                             calcShares.type === 'no-price' || calcShares.type === 'invalid'
                               ? 'text-red-500'
                               : 'text-gray-400'
                           }`}
                         >
                           {calcShares.type === 'no-price' ? '无法计算'
                            : calcShares.type === 'ok' ? calcShares.value
                            : '-'}
                         </span>
                       </div>
                       <p className="text-xs text-gray-400">
                         参考价格：{calcPrice ? `${calcPrice.price.toFixed(4)}（${calcPrice.source === 'valuation' ? '估值' : calcPrice.source === 'confirmed' ? '确认净值' : '历史净值'}）` : '暂无数据'}
                       </p>
                     </div>
                     <div className="mt-4 flex justify-end">
                       <button className="px-3 py-1 rounded bg-gray-100 text-sm" onClick={() => { setShowCalculator(false); setCalcAmount(''); }}>关闭</button>
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
                 <TradeManager name={data.name} symbol={data.symbol} currentPrice={data.currentPrice} previousPrice={data.previousPrice} realtimeDate={data.realtimeDate} netWorthDate={data.netWorthDate} onClose={() => setShowTrade(false)} />,
                 document.body
               ) : <TradeManager name={data.name} symbol={data.symbol} currentPrice={data.currentPrice} previousPrice={data.previousPrice} realtimeDate={data.realtimeDate} netWorthDate={data.netWorthDate} onClose={() => setShowTrade(false)} />)}
               {showVirtual && (typeof document !== 'undefined' && document.body ? createPortal(
                 <VirtualTradeModal symbol={data.symbol} fundName={data.name} history={history} valuation={data} onClose={() => setShowVirtual(false)} />,
                 document.body
               ) : <VirtualTradeModal symbol={data.symbol} fundName={data.name} history={history} valuation={data} onClose={() => setShowVirtual(false)} />)}
               {showProfit && (typeof document !== 'undefined' && document.body ? createPortal(
                 <ProfitModal symbol={data.symbol} fundName={data.name} currentPrice={data.currentPrice} previousPrice={data.previousPrice} realtimeDate={data.realtimeDate} netWorthDate={data.netWorthDate} initialPosition={initialPosition} initialPrice={initialPrice} initialStartDate={startDate} onClose={() => setShowProfit(false)} />,
                 document.body
               ) : <ProfitModal symbol={data.symbol} fundName={data.name} currentPrice={data.currentPrice} previousPrice={data.previousPrice} realtimeDate={data.realtimeDate} netWorthDate={data.netWorthDate} initialPosition={initialPosition} initialPrice={initialPrice} initialStartDate={startDate} onClose={() => setShowProfit(false)} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FundDetailsModal;
