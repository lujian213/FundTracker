import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ValuationData, HistoricalPoint, IntradayPoint, KlinePoint, TradeRecord, RecommendedStrategy, FundProfile, FundNavType } from '../types';
import { fetchFundHistory as defaultFetchFundHistory } from '../services/fundService';
import * as marketFundService from '../services/marketFundService';
import { MA_COLORS } from '../utils/movingAverage';
import { DEFAULT_VISIBLE_MAS, MA_WINDOWS } from '../utils/maConfig';
import { computeRatingFromHistory } from '../utils/ratingHelper';
import { computeAvgCostPrice, getLatestValuationPrice, computePositionState } from '../utils/positionHelper';
import RatingTooltip from './RatingTooltip';
import TradeManager from './TradeManager';
import useTrades from '../hooks/useTrades';
import ProfitModal from './ProfitModal';
import VirtualTradeModal from './VirtualTradeModal';
import FundProfileModal from './FundProfileModal';
import { resolvePreferredPrice, toLocalDateKey } from '../utils/priceResolver';
import { localDateKey, AggregatedMarker, aggregateTradesByDate, generatePositionStartMarker } from '../utils/tradeAggregation';
import IntradayChart from './IntradayChart';
import HistoryChart from './HistoryChart';
import FundAISidePanel from './FundAISidePanel';
import { queryAI, AIResponse } from '../services/aiService';
import { formatMoneyWithSeparators, fmtNav, fmtNumber, formatPercent } from '../utils/format';
import { getAIConfig, AIConfiguration } from '../services/aiConfigService';
import { smartPrepareChartData } from '../utils/chartDataHelper';
import { calculateYAxisRange } from '../utils/chartYAxisHelper';
import { computePositionSharesByDate, prepareVolumeBars, computeCostPricesByDate } from '../utils/tradeVolumeHelper';
import { isFeatureEnabled } from '../services/systemConfigService';
import InitialPriceAdjustModal from './InitialPriceAdjustModal';
import TrackingIndexSearchModal from './TrackingIndexSearchModal';
import { buildCashFlows, computeXIRR, computeSimpleAnnualizedReturn } from '../utils/xirrHelper';
import { calculateFundAnnualizedReturn } from '../utils/fundReturnCalculator';
import { useModalBodyStyle } from '../hooks/useModalBodyStyle';

interface FundDetailsModalProps {
  data: ValuationData;
  onClose: () => void;
  fetchHistory?: (symbol: string) => Promise<HistoricalPoint[]>; // optional injection for tests
  position?: 'center' | 'right';  // 定位模式：居中或右侧
  animateSlide?: boolean;  // 是否启用滑入滑出动画（从草稿窗口打开时）
  skipExitAnimation?: boolean;  // 是否跳过退出动画（草稿窗口关闭时）
  recommendedStrategy?: RecommendedStrategy | null;  // AI 推荐策略
  initialTab?: 'intraday' | 'history';  // 初始显示的标签页
  profile?: FundProfile;  // 基金基本信息
  fromDraft?: boolean;  // 是否从草稿窗口打开
}

export const FundDetailsModal: React.FC<FundDetailsModalProps> = ({ data, onClose, fetchHistory, position = 'center', animateSlide = false, skipExitAnimation = false, recommendedStrategy, initialTab = 'intraday', profile, fromDraft = false }) => {
  useModalBodyStyle();
  const [history, setHistory] = useState<HistoricalPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'intraday' | 'history'>(initialTab);
  const [intradayPoints, setIntradayPoints] = useState<any[]>([]);
  const [hoveredIntradayPoint, setHoveredIntradayPoint] = useState<IntradayPoint | KlinePoint | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<HistoricalPoint | null>(null);
  const [hoveredTrade, setHoveredTrade] = useState<any | null>(null);
  const [visibleMAs, setVisibleMAs] = useState<Record<number, boolean>>(() => Object.fromEntries(DEFAULT_VISIBLE_MAS.map(n => [n, true])));
  const [showTooltip, setShowTooltip] = useState(false);
  // 两点对比功能
  const [compareMode, setCompareMode] = useState<boolean>(false);
  const [selectedPoints, setSelectedPoints] = useState<HistoricalPoint[]>([]);
  // 满仓额度与初始仓位（单位：份）
  const [fullCapacity, setFullCapacity] = useState<number>(0);
  const [initialPosition, setInitialPosition] = useState<number>(0);
  // 起始日期（YYYY-MM-DD）与初始价格（可编辑，默认为起始日期净值）
  const [startDate, setStartDate] = useState<string | null>(null);
  const [initialPrice, setInitialPrice] = useState<number | null>(null);
  // 配置弹窗控制与临时输入
  const [showConfig, setShowConfig] = useState(false);
  const [tmpFull, setTmpFull] = useState<string>('0');
  const [tmpInitial, setTmpInitial] = useState<string>('0');
  const [tmpStartDate, setTmpStartDate] = useState<string>('');
  const [tmpInitialPrice, setTmpInitialPrice] = useState<string>('');
  const [tmpAliasName, setTmpAliasName] = useState<string>('');
  const [tmpTrackingIndex, setTmpTrackingIndex] = useState<string>('');
  const [tmpNavType, setTmpNavType] = useState<FundNavType>('T+1');
  const [showTrade, setShowTrade] = useState(false);
  const [showProfit, setShowProfit] = useState(false);
  const [showVirtual, setShowVirtual] = useState(false);
  // AI Assistant panel control
  const [showAI, setShowAI] = useState(false);
  const [shouldResetAIChat, setShouldResetAIChat] = useState(false);
  // 初始价格调整弹窗控制
  const [showPriceAdjust, setShowPriceAdjust] = useState(false);
  // 基金详情弹窗控制
  const [showProfileModal, setShowProfileModal] = useState(false);
  // 跟踪指数搜索弹窗控制
  const [showTrackingIndexSearch, setShowTrackingIndexSearch] = useState(false);

  // 两点对比功能处理函数
  const toggleCompareMode = () => {
    const newMode = !compareMode;
    setCompareMode(newMode);
    if (!newMode) {
      setSelectedPoints([]);  // 关闭时清空选中点
    }
  };

  const handleSelectPoint = (point: HistoricalPoint) => {
    if (selectedPoints.length >= 2) {
      return;  // 已选 2 个点，不再接受新选择
    }
    setSelectedPoints([...selectedPoints, point]);
  };

  const clearSelection = () => {
    setSelectedPoints([]);
  };

  // 计算两点对比信息（使用 useMemo 避免每次渲染重新计算）
  const compareInfo = useMemo(() => {
    if (selectedPoints.length === 0) return null;

    const formatPointInfo = (point: HistoricalPoint) => {
      const dateStr = toLocalDateKey(point.date).replace(/-/g, '/');
      const valueStr = point.value.toFixed(4);  // 基金保留4位小数
      return `${dateStr}: ${valueStr}`;
    };

    if (selectedPoints.length === 1) {
      return formatPointInfo(selectedPoints[0]);
    }

    // 两个点：显示两点信息和变化百分比
    const point1Info = formatPointInfo(selectedPoints[0]);
    const point2Info = formatPointInfo(selectedPoints[1]);
    const changePercent = ((selectedPoints[1].value - selectedPoints[0].value) / selectedPoints[0].value) * 100;
    const changeSign = changePercent >= 0 ? '+' : '';
    const changeColor = changePercent >= 0 ? '#ef4444' : '#22c55e';

    return (
      <span>
        {point1Info} → {point2Info}
        <span style={{ color: changeColor }}> ({changeSign}{changePercent.toFixed(2)}%)</span>
      </span>
    );
  }, [selectedPoints]);

  // AI Assistant state variables
  interface Message {
    id: string;
    content: string;
    role: 'user' | 'assistant';
    timestamp: Date;
  }

  const [aiMessages, setAIMessages] = useState<Message[]>([]);
  const [aiInputValue, setAIInputValue] = useState('');

  // 滑入滑出动画状态
  const [isClosing, setIsClosing] = useState(false);
  const [isEntering, setIsEntering] = useState(animateSlide && position === 'right'); // 初始是否在进入动画中

  // 进入动画：组件挂载后立即开始
  useEffect(() => {
    if (animateSlide && position === 'right') {
      // 使用requestAnimationFrame确保初始样式已应用
      requestAnimationFrame(() => {
        setIsEntering(false);
      });
    }
  }, [animateSlide, position]);

  // 同步 modal 高度到 window.__detailModalHeight（用于草稿窗口高度同步）
  useEffect(() => {
    if (position !== 'right') return; // 只在右侧定位时同步高度

    const syncHeight = () => {
      const modal = document.querySelector('#fund-details-modal > .bg-white') as HTMLElement;
      if (modal) {
        const height = modal.getBoundingClientRect().height;
        (window as any).__detailModalHeight = height;
      }
    };

    // 初始同步
    requestAnimationFrame(() => {
      syncHeight();
    });

    // 使用 ResizeObserver 监听高度变化（如果浏览器支持）
    const modal = document.querySelector('#fund-details-modal > .bg-white') as HTMLElement;
    let resizeObserver: ResizeObserver | null = null;
    if (modal && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        syncHeight();
      });
      resizeObserver.observe(modal);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      // 清除全局变量
      delete (window as any).__detailModalHeight;
    };
  }, [position]);
  const [aiLoading, setAILoading] = useState(false);
  const [aiConfig, setAIConfig] = useState<AIConfiguration | null>(null);
  const [showAIConfig, setShowAIConfig] = useState(false);
  const [aiApiEndpoint, setAIApiEndpoint] = useState('');
  const [aiApiKey, setAIApiKey] = useState('');
  const [aiModel, setAIModel] = useState('gpt-4');
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

  // Use enhanced valuation data with accuracy adjustments
  const valuationData = useMemo(() => {
    const enhanced = marketFundService.getValuation(data.symbol);
    return enhanced || data;
  }, [data.symbol, data]);

  // holdings summary from trades - 移到前面以便后面的useMemo可以使用
  const { trades: tradeList } = useTrades(data.symbol);

  // runtime dev flag: prefer NODE_ENV (works in Jest); Vite may replace this at build time
  const isDev = typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development';

  // Memoize feature flag check to avoid repeated localStorage reads on every render
  const isInitialPriceAdjustmentEnabled = useMemo(
    () => isFeatureEnabled('initialPriceAdjustmentEnabled'),
    []
  );

  // localStorage key per fund symbol
  // 注意：持仓数据已迁移到 marketFundService，不再使用 localStorage 直接读写

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

  // formatting helper for currency with suffix
  const formatCurrency = (v: number, decimals = 2) => {
    return formatMoneyWithSeparators(v, decimals) + ' 元';
  };

  // load persisted config on mount and when symbol changes
  useEffect(() => {
    // 先重置状态，避免显示上一个基金的数据
    setFullCapacity(0);
    setInitialPosition(0);
    setStartDate(null);
    setInitialPrice(null);

    // 重置其他相关状态
    setActiveTab(initialTab);
    setHoveredPoint(null);
    setHoveredIntradayPoint(null);
    setHoveredTrade(null);
    setShowTooltip(false);
    setShowConfig(false);
    setShowTrade(false);
    setShowProfit(false);
    setShowVirtual(false);
    setShowAI(false);
    setAIMessages([]);
    setAIInputValue('');
    setCalcAmount('');
    setMarkerTooltip(null);

    // 从 marketFundService 读取持仓配置
    const position = marketFundService.getPosition(data.symbol);
    if (position) {
      if (position.fullCapacity !== undefined && position.fullCapacity !== null) setFullCapacity(Number(position.fullCapacity) || 0);
      if (position.initialPosition !== undefined && position.initialPosition !== null) setInitialPosition(Number(position.initialPosition) || 0);
      if (typeof position.startDate === 'string') setStartDate(position.startDate);
      // load persisted initialPrice if present (number or numeric string) — allow null
      if (position.initialPrice === null) setInitialPrice(null);
      else if (position.initialPrice !== undefined) {
        const p = Number(position.initialPrice);
        setInitialPrice(!Number.isNaN(p) ? p : null);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.symbol]);


  useEffect(() => {
    let mounted = true;
    const load = async () => {
      // 先查内存缓存，命中则秒开无需网络请求
      const code = data.symbol.padStart(6, '0');
      const cached = marketFundService.getHistory(code);
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
      const pts = marketFundService.getIntraday(code);
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
      // 使用 marketFundService 更新持仓配置
      marketFundService.updatePosition(data.symbol, {
        fullCapacity,
        initialPosition,
        startDate,
        initialPrice: price
      });
    }
  }, [history, startDate, initialPrice, data.symbol, fullCapacity, initialPosition]);

    // Merge realtime point carefully: only append/replace when realtimeDate is explicit and valid, preventing synthetic today points from distorting MA values.
    // 重要规则：只有当 realtimeDate > netWorthDate 时才合并估值点（即估值是针对还未公布净值的日期）
    // 如果 realtimeDate == netWorthDate 或历史净值最后一条日期 == realtimeDate，说明当天的净值已确认，不应替换
    const chartData = useMemo(() => {
    if (!history || history.length === 0) return [];

    const lastHist = history[history.length - 1];
    const hasRealtimeDate = !!(valuationData.realtimeDate && valuationData.realtimeDate !== '---');
    if (!hasRealtimeDate) return history;

    const valuationTs = new Date(`${valuationData.realtimeDate} 15:00`).getTime();
    if (!Number.isFinite(valuationTs)) return history;

    // 检查历史净值最后一条的日期
    const lastDayKey = localDateKey(lastHist.date);
    const valDayKey = localDateKey(valuationTs);
    const netWorthDate = valuationData.netWorthDate && valuationData.netWorthDate !== '---' ? valuationData.netWorthDate : null;

    // 核心逻辑：只有当估值日期 > 最后确认净值日期时，才合并估值点
    // 这意味着：
    // 1. 如果 realtimeDate <= netWorthDate，估值是针对已确认净值的日期，不应替换历史净值
    // 2. 如果历史净值最后一条日期 == realtimeDate，说明历史数据已包含当天净值，不应替换
    if (netWorthDate && valDayKey <= netWorthDate) {
      return history;
    }

    // 如果历史净值最后一条日期已经 >= 估值日期，说明历史数据更新，不需要合并估值
    if (lastDayKey >= valDayKey) {
      return history;
    }

    // 只有当估值日期严格晚于历史净值最后一条日期时，才追加估值点
    if (valuationTs > lastHist.date) {
      return [...history, { date: valuationTs, value: valuationData.currentPrice, equityReturn: valuationData.changePercentage }];
    }
    return history;
    }, [history, valuationData.currentPrice, valuationData.changePercentage, valuationData.realtimeDate, valuationData.netWorthDate]);

  // 收集交易日期（用于历史趋势图）
  const tradeDates = useMemo(() => {
    const dates = new Set<string>();
    // 交易记录
    for (const t of tradeList) {
      dates.add(toLocalDateKey(t.date));
    }
    // 建仓日期
    if (startDate) {
      dates.add(startDate);
    }
    return Array.from(dates);
  }, [tradeList, startDate]);

  // 历史趋势图数据准备（净值曲线、MA、成本价）
  const trendChartData = useMemo(() => {
    if (!chartData || chartData.length === 0) {
      return {
        path: '',
        area: '',
        points: [],
        viewBox: '0 0 100 100',
        yLabels: [],
        xLabels: [],
        maPaths: {} as Record<number, string>,
        maValues: {} as Record<number, (number | null)[]>,
        costPath: '',
        costPrices: [] as (number | null | undefined)[],
        costPriceMap: new Map<string, number | null>(),
        displayData: [],
        earlyDataStats: { totalPoints: 0, keptPoints: 0, tradePoints: 0, turningPoints: 0 }
      };
    }

    // 使用智能数据准备函数
    const { displayData, maValues: computedMaValues, earlyDataStats } = smartPrepareChartData(chartData, {
      displayCount: 90,
      preserveDates: tradeDates,
      maWindows: MA_WINDOWS,
      turningThreshold: 0.01
    });

    if (displayData.length < 2) {
      return {
        path: '',
        area: '',
        points: [],
        viewBox: '0 0 100 100',
        yLabels: [],
        xLabels: [],
        maPaths: {} as Record<number, string>,
        maValues: {} as Record<number, (number | null)[]>,
        costPath: '',
        costPrices: [] as (number | null | undefined)[],
        costPriceMap: new Map<string, number | null>(),
        displayData: [],
        earlyDataStats
      };
    }

    const width = 1000;
    const height = chartHeight;
    const paddingLeft = 60;
    const paddingRight = 30;
    const paddingTop = 0;
    const paddingBottom = 0;

    // 计算成本价序列
    const position = marketFundService.getPosition(data.symbol);
    const posInitialPosition = position?.initialPosition || 0;
    const posInitialPrice = position?.initialPrice || null;
    const posStartDate = position?.startDate || null;
    const dates = displayData.map(p => toLocalDateKey(p.date));
    const costPriceMap = computeCostPricesByDate(posInitialPosition, posInitialPrice, posStartDate, tradeList, dates);
    const costPrices = dates.map(d => costPriceMap.get(d));

    // 计算Y轴范围（使用基于百分比的动态Y轴策略）
    const values = displayData.map(p => p.value);
    const { min, max, range } = calculateYAxisRange(values, costPrices, 0.05);

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
      return { text: fmtNav(val), y: getY(val) };
    });

    const xLabelIndices = [0, Math.floor(displayData.length / 2), displayData.length - 1];
    const xLabels = xLabelIndices.map(idx => {
      const d = new Date(displayData[idx].date);
      return { x: getX(idx), text: `${d.getMonth() + 1}/${d.getDate()}` };
    });

    // MA 路径
    const maValues = computedMaValues;
    const maPaths: Record<number, string> = {};
    for (const w of MA_WINDOWS) {
      const sma = maValues[w];
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

    // 成本价路径
    let costPath = '';
    const costPts = costPrices.map((v, i) => v !== null && v !== undefined ? { x: getX(i), y: getY(v as number) } : null);
    const costFirstIdx = costPts.findIndex(p => p !== null);
    if (costFirstIdx !== -1) {
      costPath = `M ${(costPts[costFirstIdx] as any).x} ${(costPts[costFirstIdx] as any).y} `;
      for (let j = costFirstIdx + 1; j < costPts.length; j++) {
        const p = costPts[j];
        if (p) costPath += `L ${p.x} ${p.y} `;
      }
    }

    return {
      path: pathData,
      area: areaData,
      points: svgPoints,
      viewBox: `0 0 ${width} ${height}`,
      yLabels,
      xLabels,
      maPaths,
      maValues,
      costPath,
      costPrices,
      costPriceMap,
      displayData,
      earlyDataStats
    };
  }, [chartData, tradeDates, data.symbol, tradeList]);

  // 历史趋势图的交易量数据和标记
  const volumeChartData = useMemo(() => {
    if (!chartData || chartData.length === 0 || !trendChartData.points || trendChartData.points.length === 0) {
      return {
        fundVolumeBars: [],
        positionTrendData: [],
        positionTrendPath: '',
        maxBarShares: 1,
        markers: []
      };
    }

    const trades = tradeList;
    const { points, displayData } = trendChartData;

    // 读取初始仓位配置和建仓日期
    let initialShares = 0;
    let positionStartDate: string | null = null;
    try {
      const position = marketFundService.getPosition(data.symbol);
      if (position) {
        initialShares = position.initialPosition || 0;
        positionStartDate = position.startDate || null;
      }
    } catch (e) {
      // ignore
    }

    // 构建日期列表
    const dates = points.map(p => toLocalDateKey(p.data.date));

    // 构建日期到 X 坐标的映射
    const dateToX = new Map<string, number>();
    for (const p of points) {
      const dateKey = toLocalDateKey(p.data.date);
      dateToX.set(dateKey, p.x);
    }

    // 计算持仓份额趋势
    const positionMap = computePositionSharesByDate(initialShares, trades || [], dates);
    const positionTrendData = dates.map(d => ({
      date: d,
      shares: positionMap.get(d) || 0,
    }));

    // 准备交易量柱状图数据
    const { bars: fundVolumeBars, maxBarShares } = prepareVolumeBars(trades || [], dateToX);

    // 交易量区域坐标
    const volumeChartHeight = 80;
    const chartTop = chartHeight - 20;
    const chartBottom = chartHeight + volumeChartHeight - 20;
    const rangeHeight = chartBottom - chartTop;

    // 计算持仓趋势线的独立 Y 轴范围
    let minPosition = 0;
    let maxPosition = 0;
    const validShares = positionTrendData.map(p => p.shares).filter(s => s > 0);
    if (validShares.length > 0) {
      minPosition = Math.min(...validShares);
      maxPosition = Math.max(...validShares);
      const margin = (maxPosition - minPosition) * 0.1 || maxPosition * 0.1;
      minPosition = Math.max(0, minPosition - margin);
      maxPosition = maxPosition + margin;
    }

    const getPositionY = (shares: number) => {
      if (maxPosition === minPosition) return chartBottom;
      return chartBottom - ((shares - minPosition) / (maxPosition - minPosition)) * rangeHeight;
    };

    let positionTrendPath = '';
    let pathStarted = false;
    for (let i = 0; i < positionTrendData.length; i++) {
      const pt = positionTrendData[i];
      const x = dateToX.get(pt.date);
      if (x === undefined) continue;
      if (positionStartDate && pt.date < positionStartDate) continue;
      if (pt.shares <= 0 && !pathStarted) continue;

      const y = getPositionY(pt.shares);
      if (!pathStarted) {
        positionTrendPath = `M ${x} ${y}`;
        pathStarted = true;
      } else {
        positionTrendPath += ` L ${x} ${y}`;
      }
    }

    // 计算交易标记
    const tradeMarkers = aggregateTradesByDate(trades, chartData, points);
    const positionStartMarkers = generatePositionStartMarker(data.symbol, chartData, points);
    const markers = [...tradeMarkers, ...positionStartMarkers];

    return {
      fundVolumeBars,
      positionTrendData,
      positionTrendPath,
      maxBarShares,
      markers
    };
  }, [chartData, trendChartData, data.symbol, tradeList]);

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

  }, [chartData, valuationData]);

  const formattedNetWorthDate = valuationData.netWorthDate && valuationData.netWorthDate !== '---'
    ? valuationData.netWorthDate.split('-').slice(1).join('/')
    : '---';

  // helpers for config modal
  const openConfig = () => {
    setTmpFull(fullCapacity.toString());
    setTmpInitial(initialPosition.toString());
    setTmpStartDate(startDate ?? (valuationData.realtimeDate && valuationData.realtimeDate !== '---' ? valuationData.realtimeDate : ''));
    setTmpInitialPrice(initialPrice !== null ? initialPrice.toFixed(4) : '');
    // 初始化常用名称和净值类型
    const position = marketFundService.getPosition(data.symbol);
    setTmpAliasName(position?.aliasName || '');
    setTmpTrackingIndex(position?.trackingIndex || '');
    setTmpNavType(position?.navType || 'T+1');
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

    // 处理初始价格：优先使用用户输入的值，否则使用起始日期的净值作为默认值
    let finalInitialPrice: number | null = null;
    const ipRaw = tmpInitialPrice.trim();
    if (ipRaw !== '') {
      const ipNum = Number(ipRaw);
      if (!Number.isNaN(ipNum) && isFinite(ipNum) && ipNum >= 0) {
        finalInitialPrice = ipNum;
      }
    }

    // 如果用户没有输入初始价格，但有起始日期，则使用起始日期的净值作为默认值
    if (finalInitialPrice === null && s) {
      // if history not loaded, try to fetch it now to compute initial price
      if (!history || history.length === 0) {
        try {
          const points = await fetchFn(data.symbol);
          setHistory(points.slice(-365));
        } catch (e) {
          // ignore
        }
      }
      const priceFromHistory = getPriceForISODate(s);
      if (priceFromHistory !== null) {
        finalInitialPrice = priceFromHistory;
      }
    }

    if (s) {
      setStartDate(s);
      setInitialPrice(finalInitialPrice);
      // 使用 marketFundService 保存 position
      marketFundService.updatePosition(data.symbol, {
        fullCapacity: f,
        initialPosition: c,
        startDate: s || null,
        initialPrice: finalInitialPrice,
        aliasName: tmpAliasName.trim() || undefined,
        trackingIndex: tmpTrackingIndex.trim() || undefined,
        navType: tmpNavType,
      });
    } else {
      setStartDate(null);
      setInitialPrice(null);
      // 使用 marketFundService 保存 position
      marketFundService.updatePosition(data.symbol, {
        fullCapacity: f,
        initialPosition: c,
        startDate: null,
        initialPrice: null,
        aliasName: tmpAliasName.trim() || undefined,
        trackingIndex: tmpTrackingIndex.trim() || undefined,
        navType: tmpNavType,
      });
    }
    setShowConfig(false);
  };
  const clearConfig = () => {
    setFullCapacity(0);
    setInitialPosition(0);
    setStartDate(null);
    setInitialPrice(null);
    setTmpTrackingIndex('');
    // 使用 marketFundService 清除 position
    marketFundService.updatePosition(data.symbol, {
      fullCapacity: 0,
      initialPosition: 0,
      startDate: null,
      initialPrice: null,
      aliasName: undefined,
      trackingIndex: undefined,
    });
    setShowConfig(false);
  };

  // AI Assistant functions
  const handleAIAsk = async () => {
    if (!aiInputValue.trim() || !aiConfig) {
      return;
    }

    const userMessage = {
      id: Date.now().toString(),
      content: aiInputValue,
      role: 'user' as const,
      timestamp: new Date()
    };

    setAIMessages(prev => [...prev, userMessage]);
    setAIInputValue('');
    setAILoading(true);

    try {
      // Prepare context with fund data
      const context = {
        fundName: valuationData.name,
        fundSymbol: data.symbol,
        valuationData: valuationData
      };

      // Get the current AI config
      const currentConfig = aiConfig;

      const response = await queryAI(currentConfig, {
        messages: [{ role: 'user', content: aiInputValue }]
      });

      const aiMessage = {
        id: `ai-${Date.now()}`,
        content: response.content,
        role: 'assistant' as const,
        timestamp: new Date()
      };

      setAIMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      const errorMessage = {
        id: `error-${Date.now()}`,
        content: '抱歉，AI服务暂时不可用，请稍后再试。',
        role: 'assistant' as const,
        timestamp: new Date()
      };
      setAIMessages(prev => [...prev, errorMessage]);
    } finally {
      setAILoading(false);
    }
  };

  // Initialize AI config on mount
  useEffect(() => {
    const savedConfig = getAIConfig();
    if (savedConfig) {
      setAIConfig(savedConfig);
      setAIApiEndpoint(savedConfig.apiEndpoint);
      setAIApiKey(savedConfig.apiKey);
      setAIModel(savedConfig.model || 'gpt-4');
    }
  }, []);

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

  // initial price computed from tmpStartDate (or persisted startDate) and history - used as hint/display
  const computedInitialPriceFromStartDate = useMemo(() => {
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
    currentPrice: valuationData.currentPrice,
    realtimeDate: valuationData.realtimeDate,
    previousPrice: valuationData.previousPrice,
    netWorthDate: valuationData.netWorthDate,
  }), [todayLocal, history, valuationData.currentPrice, valuationData.realtimeDate, valuationData.previousPrice, valuationData.netWorthDate]);

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

    // 使用 useRef 来缓存基金数据，避免在数据更新时重新渲染 AI 助手
    const aiFundDataRef = useRef<{
      symbol: string;
      name: string;
      valuationData: ValuationData;
      tradeHistory: any[];
      fullCapacity: number;
      initialCapacity: number;
      initialDate: string | null;
      initialPrice: number | null;
      marketValue: number | null;
      position: number | null;
      positionRate: number | null;
      profit: number | null;
      avgCostPrice: number | null;
    } | null>(null);

    // Compute holdings and profit using initialPosition and trades per requirements, but only when fullCapacity configured (>0)
    // If fullCapacity is 0 (not configured), we treat these values as not-applicable (null) so they don't appear in other aggregations.
    const holdings = useMemo(() => {
    if (!fullCapacity || fullCapacity <= 0) {
      return { totalShares: 0, buyShares: 0, sellShares: 0, buyAmount: 0, sellAmount: 0, dividendAmount: 0, marketValue: null as number | null, profit: null as number | null };
    }

    // 使用公共函数计算持仓状态
    const state = computePositionState(initialPosition, initialPrice, tradeList || []);

    const resolved = resolvePreferredPrice({
      targetDate: todayLocal,
      todayDate: todayLocal,
      history,
      currentPrice: valuationData.currentPrice,
      realtimeDate: valuationData.realtimeDate,
      previousPrice: valuationData.previousPrice,
      netWorthDate: valuationData.netWorthDate,
    });
    const effectivePrice = resolved ? resolved.price : 0;
    const marketValue = state.currentShares * effectivePrice;

    // 计算盈利：市值 + 卖出金额 + 分红金额 - 买入金额 - 初始成本
    const profit = marketValue + state.sellAmount + state.dividendAmount - state.buyAmount - state.initialCost;

    return {
      totalShares: state.currentShares,
      buyShares: state.buyShares,
      sellShares: state.sellShares,
      buyAmount: state.buyAmount,
      sellAmount: state.sellAmount,
      dividendAmount: state.dividendAmount,
      marketValue,
      profit
    };
    }, [tradeList, todayLocal, history, valuationData.currentPrice, valuationData.realtimeDate, valuationData.previousPrice, valuationData.netWorthDate, initialPosition, initialPrice, fullCapacity]);

    const { totalShares, buyShares, sellShares, buyAmount, sellAmount, marketValue, profit } = holdings;

    // 计算平均成本价
    const avgCostPrice = useMemo(() => {
      return computeAvgCostPrice(data.symbol, tradeList);
    }, [data.symbol, tradeList, initialPrice]);

    // 计算累计收益率（简单年化收益率）
    // 返回对象：shouldShow 表示是否显示，value 为 null 时显示 "—"
    const cumulativeReturn = useMemo((): { shouldShow: boolean; value: number | null } => {
      // 必须配置满仓份额才显示
      if (!fullCapacity || fullCapacity <= 0) {
        return { shouldShow: false, value: null };
      }

      // 既无初始仓位也无交易记录 → 显示 "—"
      if (initialPosition <= 0 && (!tradeList || tradeList.length === 0)) {
        return { shouldShow: true, value: null };
      }

      // 使用公共函数获取最新估值数据
      const latestValuation = getLatestValuationPrice(valuationData);
      if (!latestValuation) {
        return { shouldShow: true, value: null }; // 无法计算 → 显示 "—"
      }

      const { date: currentDate, price: currentPrice } = latestValuation;

      // 检查必需参数
      if (initialPrice === null || !startDate) {
        return { shouldShow: true, value: null }; // 无法计算 → 显示 "—"
      }

      // 使用公共函数计算年化收益率
      const result = calculateFundAnnualizedReturn({
        initialPosition,
        initialPrice,
        startDate,
        trades: tradeList || [],
        currentShares: totalShares,
        currentPrice,
        currentDate
      });

      // 年化收益率计算失败 → 显示 "—"
      return { shouldShow: true, value: result };
    }, [fullCapacity, initialPosition, tradeList, startDate, initialPrice, totalShares, valuationData.realtimeDate, valuationData.netWorthDate, valuationData.currentPrice, valuationData.previousPrice]);

    // 计算仓位占比
    const holdingsPositionRate = (fullCapacity > 0 && typeof totalShares === 'number')
      ? (totalShares / fullCapacity) * 100
      : null;

    // 更新缓存的基金数据（只在基金真正改变时更新）
    useEffect(() => {
      // 始终更新 ref 中的数据，确保仓位配置等字段保持最新
      aiFundDataRef.current = {
        symbol: data.symbol,
        name: valuationData.name,
        valuationData: valuationData,
        tradeHistory: tradeList,
        fullCapacity,
        initialCapacity: initialPosition,
        initialDate: startDate,
        initialPrice,
        marketValue,
        position: totalShares,
        positionRate: holdingsPositionRate,
        profit,
        avgCostPrice,
      };
    }, [data.symbol, valuationData, tradeList, fullCapacity, initialPosition, startDate, initialPrice, marketValue, totalShares, holdingsPositionRate, profit, avgCostPrice]);

  // 计算 position：响应式设计，屏幕宽度 < 1200px 时强制使用居中
  const isWideScreen = typeof window !== 'undefined' && window.innerWidth >= 1200;
  const actualPosition = position === 'right' && isWideScreen ? 'right' : 'center';

  // 处理关闭：如果需要动画且不是跳过退出动画，则先播放滑出动画
  const handleClose = useCallback(() => {
    if (animateSlide && actualPosition === 'right' && !skipExitAnimation) {
      setIsClosing(true);
      // 等待动画完成后再关闭
      setTimeout(() => {
        onClose();
      }, 300); // 动画时长300ms
    } else {
      onClose();
    }
  }, [animateSlide, actualPosition, skipExitAnimation, onClose]);

  // z-index 层级定义：B窗口层级，子弹窗层级 = B窗口层级 + 10
  const MODAL_Z_INDEX = 140;
  const SUBMODAL_Z_INDEX = MODAL_Z_INDEX + 10;

  // 根据 position 计算容器样式
  const containerStyle: React.CSSProperties = actualPosition === 'right'
    ? { position: 'fixed', inset: 0, zIndex: MODAL_Z_INDEX, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }
    : { position: 'fixed', inset: 0, zIndex: MODAL_Z_INDEX, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', pointerEvents: 'auto' };

  // 动态计算偏移量，使两个窗口整体居中
  const [detailOffset, setDetailOffset] = useState<number>(0);

  useEffect(() => {
    if (actualPosition === 'right') {
      const calculateOffset = () => {
        const draftModal = document.querySelector('.investment-draft-modal-content') as HTMLElement;
        if (draftModal) {
          const draftWidth = draftModal.getBoundingClientRect().width;
          // 详情窗口需要向右偏移 draftWidth/2，使两个窗口整体居中
          setDetailOffset(draftWidth / 2);
        }
      };

      // 初始计算
      calculateOffset();

      // 使用 ResizeObserver 监听草稿窗口宽度变化
      const draftModal = document.querySelector('.investment-draft-modal-content') as HTMLElement;
      if (draftModal) {
        const resizeObserver = new ResizeObserver(calculateOffset);
        resizeObserver.observe(draftModal);
        return () => resizeObserver.disconnect();
      }
    } else {
      setDetailOffset(0);
    }
  }, [actualPosition]);

  const contentStyle: React.CSSProperties = (() => {
    const base: React.CSSProperties = { maxWidth: '46.3rem' };
    if (actualPosition === 'right') {
      // 向右偏移，使两个窗口整体居中并紧密贴合
      base.transform = `translateX(${detailOffset}px)`;
      // 滑入滑出动画
      if (animateSlide) {
        base.transition = 'transform 300ms ease-in-out';
        if (isEntering) {
          // 初始位置：从屏幕右侧外滑入到目标位置
          base.transform = `translateX(calc(50vw + ${detailOffset}px))`;
        } else if (isClosing) {
          base.transform = `translateX(calc(50vw + ${detailOffset}px))`; // 滑出
        }
      }
    }
    return base;
  })();

  return (
    <div id="fund-details-modal" style={containerStyle}>
      {actualPosition === 'center' && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300 pointer-events-auto" onClick={handleClose}></div>
      )}

      <div className={`relative bg-white w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh] pointer-events-auto ${actualPosition === 'center' ? 'rounded-3xl' : ''}`} style={contentStyle}>
        <div className="px-6 pt-3 pb-1 border-b border-gray-50 flex justify-between items-start">
          <div className="min-w-0"> {/* allow left column to shrink and not push actions out */}
             <div className="flex items-center space-x-2 mb-1">
               <h2 className="text-lg font-black text-gray-800 leading-tight truncate">{valuationData.name}</h2>
               <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] font-mono">{data.symbol}</span>
                {/* Rating badge */}
                <RatingTooltip ratingInfo={ratingInfo} open={showTooltip} onOpen={() => setShowTooltip(true)} onClose={() => setShowTooltip(false)} alignRight={false} />
             </div>
            <div className="flex items-baseline space-x-3">
              <span className={`text-2xl font-normal ${valuationData.changePercentage >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                {fmtNav(valuationData.currentPrice)}
              </span>
              <span className={`text-sm font-medium ${valuationData.changePercentage >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                {formatPercent(valuationData.changePercentage)}
              </span>
              <span className="text-[10px] text-gray-400 font-medium">前值: {fmtNav(valuationData.previousPrice)} ({formattedNetWorthDate})</span>
            </div>
            {/* Position summary: show only when configured (fullCapacity > 0 or startDate present) */}
            {(fullCapacity > 0 || startDate || initialPrice !== null) && (
             <div className="mt-1 text-xs text-gray-600 flex items-baseline space-x-3 whitespace-nowrap overflow-visible">
                {fullCapacity > 0 && (
                  <span className="whitespace-nowrap">满仓份额：<span className="font-medium">{fmtNumber(fullCapacity)}份</span></span>
                )}
                {fullCapacity > 0 && (
                  <span className="whitespace-nowrap">初始份额：<span className="font-medium">{fmtNumber(initialPosition)}份</span></span>
                )}
                {startDate && (
                  <span className="whitespace-nowrap">起始日期：<span className="font-medium">{startDate}</span></span>
                )}
                {initialPrice !== null && (
                 <span className="whitespace-nowrap">初始价格：<span className="font-medium">{fmtNav(initialPrice)}</span></span>
                )}
              </div>
            )}

           {/* Market / position / profit row - only show when fullCapacity configured (>0) */}
           {fullCapacity && fullCapacity > 0 ? (
             <div className="mt-1 text-xs text-gray-600 flex items-baseline space-x-3 whitespace-nowrap">
               <span className="whitespace-nowrap">市值：<span className="font-medium">{(marketValue !== null && !isNaN(marketValue as any)) ? formatCurrency(marketValue as number, 2) : '—'}</span></span>
               <span className="whitespace-nowrap">仓位：<span className="font-medium">{(typeof totalShares === 'number') ? `${fmtNumber(totalShares)} 份` : '—'}</span></span>
               <span className="whitespace-nowrap">占比：<span className="font-medium">{(fullCapacity > 0) ? `${fmtNumber((totalShares / fullCapacity) * 100)}%` : '—'}</span></span>
               <span className="whitespace-nowrap">盈利：<span className={`font-medium ${typeof profit === 'number' ? (profit < 0 ? 'text-green-600' : profit > 0 ? 'text-red-600' : 'text-gray-600') : ''}`}>{(typeof profit === 'number') ? formatCurrency(profit, 2) : '—'}</span></span>
               {avgCostPrice !== null && (
                 <span className="whitespace-nowrap">成本价：<span className="font-medium">{fmtNav(avgCostPrice)}</span></span>
               )}
               {cumulativeReturn.shouldShow && (
                <span className="whitespace-nowrap">累计收益率：<span className={`font-medium ${cumulativeReturn.value === null ? 'text-gray-600' : cumulativeReturn.value >= 0 ? 'text-red-600' : 'text-green-600'}`}>{cumulativeReturn.value !== null ? formatPercent(cumulativeReturn.value, 2) : '—'}</span></span>
               )}
             </div>
           ) : null}
          </div>
          <div className="flex-shrink-0 flex items-center space-x-2"> {/* lock actions to avoid being pushed out */}
             {/* 配置与交易按钮 */}
             <button aria-label="基金设置" title="基金设置" onClick={openConfig} className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors">
               <i className="fas fa-cog"></i>
             </button>
             {/* 调整初始价格按钮：仅当初始份额 > 0 且功能启用时显示 */}
             {initialPosition > 0 && isInitialPriceAdjustmentEnabled && (
               <button
                 aria-label="调整初始价格"
                 title="调整初始价格"
                 onClick={() => setShowPriceAdjust(true)}
                 className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
               >
                 <i className="fas fa-wrench"></i>
               </button>
             )}
             {/* 计算器按钮 */}
             <button aria-label="基金份额计算器" title="基金份额计算器" onClick={() => setShowCalculator(true)} className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors">
               <i className="fas fa-calculator"></i>
             </button>
             {/* AI助手按钮 */}
             <button
               aria-label="AI投资助手"
               title="AI投资助手"
               onClick={() => {
                 // Set reset flag to false when opening for same fund
                 setShouldResetAIChat(false);
                 setShowAI(true);
               }}
               className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
             >
               <i className="fas fa-robot"></i>
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
              <button onClick={handleClose} className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
                <i className="fas fa-times"></i>
              </button>
            </div>
        </div>

        <div className="flex-1 overflow-hidden p-1">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center space-y-3">
              <i className="fas fa-circle-notch animate-spin text-red-500 text-3xl"></i>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">正在抓取净值趋势...</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative bg-gray-50 rounded-2xl p-1">
                <div className="flex items-center space-x-2">
                  <button onClick={() => setActiveTab('intraday')} className={`px-3 py-1 rounded text-sm ${activeTab === 'intraday' ? 'bg-white border' : 'bg-transparent text-gray-500'}`}>日内趋势图</button>
                  <button onClick={() => setActiveTab('history')} className={`px-3 py-1 rounded text-sm ${activeTab === 'history' ? 'bg-white border' : 'bg-transparent text-gray-500'}`}>历史趋势图</button>
                </div>
                {activeTab === 'intraday' ? (
                  // Keep intraday chart height same as history svg height to avoid layout jump when switching tabs
                  <>
                    <div className="flex items-center space-x-2 h-6" aria-hidden>
                      <div className="text-xs text-transparent font-medium">占位：均线区域</div>
                    </div>
                    <div style={{ height: chartHeight }}>
                      <IntradayChart points={intradayPoints} width={1000} height={chartHeight} onHover={(p) => setHoveredIntradayPoint(p)} />
                    </div>
                    {/* MA toggle placeholder to keep parity with history tab */}
                    <div className="flex items-center space-x-2 h-6" aria-hidden>
                      <span className="text-xs text-transparent">均线：</span>
                    </div>
                    {/* Reserved fixed-width info area under intraday chart (time, value, change vs prev day) */}
                    <div className="h-12 bg-white flex items-center justify-start px-4 border-t">
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
                          // 计算较上一日的变化
                          const ch = computeChange(last.value, last.equityReturn);
                          if (ch.abs !== null && ch.pct !== null) {
                            changeText = `${ch.abs.toFixed(4)} (${ch.pct >= 0 ? '+' : ''}${ch.pct.toFixed(2)}%)`;
                            changeClass = ch.pct >= 0 ? 'text-red-600' : 'text-green-600';
                          }
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
                    {/* 占位区域，保持与日内趋势图高度一致 */}
                    <div className="flex items-center space-x-2 h-6" aria-hidden>
                      <div className="text-xs text-transparent font-medium">占位</div>
                    </div>
                    <div className="relative" style={{ height: chartHeight }}>
                      {/* 两点对比控件 - 左上角绝对定位 */}
                      <div className="absolute top-0 left-2 z-10 flex items-center space-x-1">
                        <button
                          type="button"
                          aria-label="两点对比"
                          title="两点对比"
                          onClick={toggleCompareMode}
                          className="text-[10px] p-1.5 rounded border inline-flex items-center justify-center transition-colors bg-white/80 backdrop-blur-sm"
                          style={{
                            borderColor: compareMode ? '#2563eb' : '#d1d5db',
                            color: compareMode ? '#2563eb' : '#6b7280',
                            backgroundColor: compareMode ? 'rgba(37, 99, 235, 0.1)' : 'rgba(255,255,255,0.8)'
                          }}
                        >
                          <i className="fas fa-ruler text-xs"></i>
                        </button>
                        {compareMode && (
                          <button
                            type="button"
                            aria-label="清除选择"
                            title="清除选择"
                            onClick={clearSelection}
                            className="text-[10px] p-1.5 rounded border border-gray-300 inline-flex items-center justify-center transition-colors bg-white/80 backdrop-blur-sm text-gray-500 hover:text-gray-700 hover:border-gray-400"
                          >
                            <i className="fas fa-times text-xs"></i>
                          </button>
                        )}
                        {compareMode && selectedPoints.length > 0 && (
                          <span className="text-[11px] font-medium ml-2" style={{ color: '#374151' }}>
                            {compareInfo}
                          </span>
                        )}
                      </div>
                      {/* 均线切换按钮 - 右上角绝对定位 */}
                      <div className="absolute top-1 right-2 z-10 flex items-center space-x-1">
                        {MA_WINDOWS.map(n => {
                          const color = MA_COLORS[n] || '#2563eb';
                          return (
                            <button
                              key={n}
                              type="button"
                              aria-label={`切换显示 MA${n}`}
                              onClick={() => setVisibleMAs(v => ({ ...v, [n]: !v[n] }))}
                              className="text-[10px] px-1.5 py-0.5 rounded border inline-flex items-center gap-1 transition-colors bg-white/80 backdrop-blur-sm"
                              style={{ borderColor: color, color, backgroundColor: visibleMAs[n] ? `${color}20` : 'rgba(255,255,255,0.8)' }}
                            >
                              <span data-testid={`ma-toggle-dot-${n}`} className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                              <span className="font-medium">MA{n}</span>
                            </button>
                          );
                        })}
                        {/* 全选/全不选按钮 */}
                        <button
                          type="button"
                          aria-label="全选/全不选均线"
                          onClick={() => {
                            const allSelected = MA_WINDOWS.every(n => visibleMAs[n]);
                            setVisibleMAs(Object.fromEntries(MA_WINDOWS.map(n => [n, !allSelected])));
                          }}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-gray-300 inline-flex items-center gap-1 transition-colors bg-white/80 backdrop-blur-sm text-gray-500 hover:text-gray-700 hover:border-gray-400"
                        >
                          <i className={`fas ${MA_WINDOWS.every(n => visibleMAs[n]) ? 'fa-check-square' : 'fa-square'} text-xs`}></i>
                          <span className="font-medium">全选</span>
                        </button>
                      </div>
                      <HistoryChart
                         viewBox={trendChartData.viewBox}
                         path={trendChartData.path}
                         area={trendChartData.area}
                         points={trendChartData.points}
                         yLabels={trendChartData.yLabels}
                         xLabels={trendChartData.xLabels}
                         maPaths={trendChartData.maPaths}
                         maValues={trendChartData.maValues}
                         visibleMAs={visibleMAs}
                         hoveredPoint={hoveredPoint}
                         setHoveredPoint={setHoveredPoint}
                        markers={volumeChartData.markers}
                        onMarkerHover={(m) => setHoveredTrade(m)}
                         height={chartHeight}
                         stroke="#ef4444"
                         fundVolumeBars={volumeChartData.fundVolumeBars}
                         positionTrendData={volumeChartData.positionTrendData}
                         positionTrendPath={volumeChartData.positionTrendPath}
                         maxBarShares={volumeChartData.maxBarShares}
                         showFundVolume={true}
                         volumeChartHeight={80}
                         costPath={trendChartData.costPath}
                         costPrices={trendChartData.costPrices}
                         // 两点对比功能
                         compareMode={compareMode}
                         selectedPoints={selectedPoints}
                         onSelectPoint={handleSelectPoint}
                         priceDecimals={4}
                         showPriceLine={true}
                       />
                     </div>
                    {/* 占位区域，保持与日内趋势图高度一致 */}
                    <div className="flex items-center space-x-2 h-6" aria-hidden>
                      <span className="text-xs text-transparent">均线：</span>
                    </div>

                    {/* 信息区域 */}
                    <div className="h-12 bg-white flex items-center justify-start px-4 border-t">
                      {(() => {
                        const hp = hoveredPoint as any;
                        let dateLabel = '—';
                        let valueLabel = '—';
                        let changeText = '—';
                        let changeClass = 'text-gray-700';
                        let costPriceLabel = '—';

                        let targetDataPoint: HistoricalPoint | null = null;
                        let prevValue: number | null = null;

                        if (hp && trendChartData.displayData && trendChartData.displayData.length > 0) {
                          const idx = trendChartData.displayData.findIndex((p: any) => p.date === hp.date);
                          targetDataPoint = (idx >= 0) ? trendChartData.displayData[idx] : trendChartData.displayData[trendChartData.displayData.length - 1];
                          prevValue = (idx > 0) ? trendChartData.displayData[idx - 1].value : null;
                        } else if (trendChartData.displayData && trendChartData.displayData.length > 0) {
                          targetDataPoint = trendChartData.displayData[trendChartData.displayData.length - 1];
                          prevValue = trendChartData.displayData.length > 1 ? trendChartData.displayData[trendChartData.displayData.length - 2].value : null;
                        }

                        if (targetDataPoint) {
                          const d = new Date(targetDataPoint.date);
                          dateLabel = toLocalDateKey(d);
                          valueLabel = targetDataPoint.value.toFixed(4);

                          if (prevValue !== null) {
                            const abs = targetDataPoint.value - prevValue;
                            const pct = prevValue !== 0 ? (abs / prevValue * 100) : 0;
                            changeText = `${abs.toFixed(4)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
                            changeClass = pct >= 0 ? 'text-red-600' : 'text-green-600';
                          }

                          const targetDate = toLocalDateKey(targetDataPoint.date);
                          const targetCostPrice = trendChartData.costPriceMap.get(targetDate);
                          if (targetCostPrice != null) {
                            costPriceLabel = targetCostPrice.toFixed(4);
                          }
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
                            {/* 成本价显示 */}
                            <div className="mr-6 w-36">
                              <div className="text-[10px] text-gray-400">成本价</div>
                              <div className="text-sm font-medium text-green-600">{costPriceLabel}</div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                   </>
                 )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                 <div className="p-3 bg-gray-50 rounded-2xl">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">最后更新</p>
                    <p className="text-sm font-bold text-gray-700">{data.lastUpdated}</p>
                 </div>
                 <div className="p-3 bg-gray-50 rounded-2xl">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">估值日期</p>
                    <p className="text-sm font-bold text-gray-700">{valuationData.realtimeDate}</p>
                 </div>
              </div>

              {/* 外部链接和基金详情并排显示 */}
              <div className="flex gap-2">
                <a href={data.sourceUrl} target="_blank" rel="noreferrer" className="flex-1 py-3 text-center text-xs font-bold text-gray-400 border border-gray-100 rounded-2xl hover:bg-gray-50 transition-colors">
                  在天天基金查看详细页 <i className="fas fa-external-link-alt ml-1"></i>
                </a>
                {profile && (
                  <button
                    onClick={() => setShowProfileModal(true)}
                    className="flex-1 py-3 text-center text-xs font-bold text-blue-600 border border-blue-100 rounded-2xl hover:bg-blue-50 transition-colors"
                  >
                    <i className="fas fa-info-circle mr-1" />
                    基金详情
                  </button>
                )}
              </div>

              {/* 基金详情弹窗 */}
              {showProfileModal && profile && (
                <FundProfileModal
                  profile={profile}
                  fundName={valuationData.name}
                  onClose={() => setShowProfileModal(false)}
                />
              )}

               {/* 基金份额计算器弹窗 */}
               {showCalculator && (
                 <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: SUBMODAL_Z_INDEX }}>
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
                 <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: SUBMODAL_Z_INDEX }}>
                   <div className="absolute inset-0 bg-black/40" onClick={() => setShowConfig(false)} />
                   <div className="relative bg-white rounded-lg shadow-lg w-full max-w-md p-6 z-30">
                     <h3 className="text-lg font-bold mb-3">基金设置</h3>
                     <div className="space-y-3">
                       <div className="flex items-center justify-between">
                         <label className="text-sm text-gray-600">常用名称</label>
                         <input
                           aria-label="modal-alias-name"
                           type="text"
                           className="w-46 px-2 py-1 border rounded text-right"
                           value={tmpAliasName}
                           onChange={e => { setTmpAliasName(e.target.value); }}
                           placeholder="可选"
                         />
                       </div>
                       <div className="flex items-center justify-between">
                         <label className="text-sm text-gray-600">跟踪指数</label>
                         <div className="flex flex-col items-end">
                           <div className="relative flex items-center">
                             <input
                               aria-label="modal-tracking-index"
                               type="text"
                               className="w-46 px-2 py-1 pr-8 border rounded text-right"
                               value={tmpTrackingIndex}
                               onChange={e => { setTmpTrackingIndex(e.target.value); }}
                               placeholder="可选"
                             />
                             <button
                               type="button"
                               onClick={() => setShowTrackingIndexSearch(true)}
                               className="absolute right-1 px-1.5 py-1 text-gray-400 hover:text-blue-500 transition-colors"
                               title="搜索指数/板块"
                               aria-label="搜索指数/板块"
                             >
                               <i className="fas fa-search text-xs"></i>
                             </button>
                           </div>
                           <span className="text-[10px] text-gray-400 mt-0.5">
                             格式如: 2.H50036
                           </span>
                         </div>
                       </div>
                       <div className="flex items-start justify-between">
                         <label className="text-sm text-gray-600 mt-1">净值类型</label>
                         <div className="flex flex-col items-end gap-1">
                           <div className="flex gap-4">
                             <label className="flex items-center gap-1.5 cursor-pointer">
                               <input
                                 type="radio"
                                 name="navType"
                                 value="T+1"
                                 checked={tmpNavType === 'T+1'}
                                 onChange={() => setTmpNavType('T+1')}
                                 className="w-4 h-4 text-blue-600"
                               />
                               <span className="text-sm">T+1</span>
                             </label>
                             <label className="flex items-center gap-1.5 cursor-pointer">
                               <input
                                 type="radio"
                                 name="navType"
                                 value="T+2"
                                 checked={tmpNavType === 'T+2'}
                                 onChange={() => setTmpNavType('T+2')}
                                 className="w-4 h-4 text-blue-600"
                               />
                               <span className="text-sm">T+2（美股QDII）</span>
                             </label>
                           </div>
                           <span className="text-[10px] text-gray-400">美股QDII基金净值更新晚1天</span>
                         </div>
                       </div>
                       <div className="flex items-center justify-between">
                         <label className="text-sm text-gray-600">满仓额度</label>
                         <input
                           ref={fullInputRef}
                           aria-label="modal-full"
                           aria-invalid={!!(tmpFullError || tmpInitialError || tmpStartDateError)}
                           aria-describedby={tmpFullError || tmpInitialError || tmpStartDateError ? 'modal-errors' : undefined}
                           type="number"
                           className="w-46 px-2 py-1 border rounded text-right"
                           value={tmpFull}
                           onChange={e => { setTmpFull(e.target.value); }}
                           onBlur={() => {}}
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
                           className="w-46 px-2 py-1 border rounded text-right"
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
                           className="w-46 px-2 py-1 border rounded text-right"
                           value={tmpStartDate}
                           onChange={e => { setTmpStartDate(e.target.value); }}
                         />
                       </div>
                       <div className="flex items-center justify-between">
                         <label className="text-sm text-gray-600">初始价格</label>
                         <div className="flex flex-col items-end">
                           <input
                             aria-label="modal-initial-price"
                             type="text"
                             inputMode="decimal"
                             placeholder={computedInitialPriceFromStartDate !== null ? computedInitialPriceFromStartDate.toFixed(4) : '可选'}
                             className="w-46 px-2 py-1 border rounded text-right"
                             value={tmpInitialPrice}
                             onChange={e => { setTmpInitialPrice(e.target.value); }}
                           />
                           {computedInitialPriceFromStartDate !== null && (
                             <span className="text-[10px] text-gray-400 mt-0.5">
                               提示: {computedInitialPriceFromStartDate.toFixed(4)} (起始日期净值)
                             </span>
                           )}
                         </div>
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
               {/* 跟踪指数搜索弹窗 */}
               {showTrackingIndexSearch && (
                 <TrackingIndexSearchModal
                   onSelect={(code) => {
                     setTmpTrackingIndex(code);
                     setShowTrackingIndexSearch(false);
                   }}
                   onClose={() => setShowTrackingIndexSearch(false)}
                   zIndex={SUBMODAL_Z_INDEX}
                 />
               )}
               {/* Trade manager modal rendered into document.body to avoid z-index issues */}
               {showTrade && (typeof document !== 'undefined' && document.body ? createPortal(
                 <TradeManager name={valuationData.name} symbol={data.symbol} currentPrice={valuationData.currentPrice} previousPrice={valuationData.previousPrice} realtimeDate={valuationData.realtimeDate} netWorthDate={valuationData.netWorthDate} initialPosition={initialPosition} initialPrice={initialPrice} startDate={startDate} onClose={() => setShowTrade(false)} zIndex={SUBMODAL_Z_INDEX} initialViewMode={fromDraft ? 'lifo' : 'normal'} />,
                 document.body
               ) : <TradeManager name={valuationData.name} symbol={data.symbol} currentPrice={valuationData.currentPrice} previousPrice={valuationData.previousPrice} realtimeDate={valuationData.realtimeDate} netWorthDate={valuationData.netWorthDate} onClose={() => setShowTrade(false)} zIndex={SUBMODAL_Z_INDEX} initialViewMode={fromDraft ? 'lifo' : 'normal'} />)}
               {showVirtual && (typeof document !== 'undefined' && document.body ? createPortal(
                 <VirtualTradeModal symbol={data.symbol} fundName={valuationData.name} history={history} valuation={valuationData} recommendedStrategy={recommendedStrategy} onClose={() => setShowVirtual(false)} zIndex={SUBMODAL_Z_INDEX} />,
                 document.body
               ) : <VirtualTradeModal symbol={data.symbol} fundName={valuationData.name} history={history} valuation={valuationData} recommendedStrategy={recommendedStrategy} onClose={() => setShowVirtual(false)} zIndex={SUBMODAL_Z_INDEX} />)}
               {showProfit && (typeof document !== 'undefined' && document.body ? createPortal(
                 <ProfitModal symbol={data.symbol} fundName={valuationData.name} currentPrice={valuationData.currentPrice} previousPrice={valuationData.previousPrice} realtimeDate={valuationData.realtimeDate} netWorthDate={valuationData.netWorthDate} initialPosition={initialPosition} initialPrice={initialPrice} initialStartDate={startDate} onClose={() => setShowProfit(false)} zIndex={SUBMODAL_Z_INDEX} />,
                 document.body
               ) : <ProfitModal symbol={data.symbol} fundName={valuationData.name} currentPrice={valuationData.currentPrice} previousPrice={valuationData.previousPrice} realtimeDate={valuationData.realtimeDate} netWorthDate={valuationData.netWorthDate} initialPosition={initialPosition} initialPrice={initialPrice} initialStartDate={startDate} onClose={() => setShowProfit(false)} zIndex={SUBMODAL_Z_INDEX} />)}
               {/* 初始价格调整弹窗 */}
               {showPriceAdjust && (
                 <InitialPriceAdjustModal
                   symbol={data.symbol}
                   fundName={valuationData.name}
                   currentProfit={profit ?? 0}
                   currentInitialPrice={initialPrice}
                   initialPosition={initialPosition}
                   totalShares={totalShares}
                   currentPrice={valuationData.currentPrice}
                   sellAmount={sellAmount}
                   buyAmount={buyAmount}
                   onSave={(newPrice) => {
                     setInitialPrice(newPrice);
                     // 使用 marketFundService 更新持仓配置
                     marketFundService.updatePosition(data.symbol, {
                       fullCapacity,
                       initialPosition,
                       startDate,
                       initialPrice: newPrice
                     });
                     setShowPriceAdjust(false);
                   }}
                   onClose={() => setShowPriceAdjust(false)}
                   zIndex={SUBMODAL_Z_INDEX}
                 />
               )}
               {/* AI Assistant panel - rendered with portal to avoid parent re-renders */}
               {showAI && aiFundDataRef.current && (typeof document !== 'undefined' && document.body ? createPortal(
                 <FundAISidePanel
                   isVisible={showAI}
                   onClose={() => setShowAI(false)}
                   fundSymbol={aiFundDataRef.current.symbol}
                   fundName={aiFundDataRef.current.name}
                   valuationData={aiFundDataRef.current.valuationData}
                   tradeHistory={aiFundDataRef.current.tradeHistory}
                   fullCapacity={aiFundDataRef.current.fullCapacity}
                   initialCapacity={aiFundDataRef.current.initialCapacity}
                   initialDate={aiFundDataRef.current.initialDate ?? undefined}
                   initialPrice={aiFundDataRef.current.initialPrice ?? undefined}
                   marketValue={aiFundDataRef.current.marketValue}
                   position={aiFundDataRef.current.position}
                   positionRate={aiFundDataRef.current.positionRate}
                   profit={aiFundDataRef.current.profit}
                   avgCostPrice={aiFundDataRef.current.avgCostPrice}
                 />,
                 document.body
               ) : <FundAISidePanel
                 isVisible={showAI}
                 onClose={() => setShowAI(false)}
                 fundSymbol={aiFundDataRef.current.symbol}
                 fundName={aiFundDataRef.current.name}
                 valuationData={aiFundDataRef.current.valuationData}
                 tradeHistory={aiFundDataRef.current.tradeHistory}
                 fullCapacity={aiFundDataRef.current.fullCapacity}
                 initialCapacity={aiFundDataRef.current.initialCapacity}
                 initialDate={aiFundDataRef.current.initialDate ?? undefined}
                 initialPrice={aiFundDataRef.current.initialPrice ?? undefined}
                 marketValue={aiFundDataRef.current.marketValue}
                 position={aiFundDataRef.current.position}
                 positionRate={aiFundDataRef.current.positionRate}
                 profit={aiFundDataRef.current.profit}
                 avgCostPrice={aiFundDataRef.current.avgCostPrice}
               />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FundDetailsModal;
