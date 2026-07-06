import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MarketIndex, HistoricalPoint, VolumeData, KlinePoint, HistoryKlinePeriod, HISTORY_KLINE_PERIOD_CONFIG } from '../types';
import { fetchIndexHistory, fetchIndexIntradayKline } from '../services/fundService';
import * as indexService from '../services/indexService';
import IntradayChart from './IntradayChart';
import HistoryChart from './HistoryChart';
import { MA_COLORS } from '../utils/movingAverage';
import { DEFAULT_VISIBLE_MAS, MA_WINDOWS } from '../utils/maConfig';
import { toLocalDateKey } from '../utils/priceResolver';
import { formatDateDisplay, formatDateShort, formatTime } from '../utils/dateFormat';
import { formatVolume, formatAmount } from '../utils/format';
import { prepareChartData } from '../utils/chartDataHelper';
import IndexAISidePanel from './IndexAISidePanel';
import { getIndexDetailUrl } from '../src/utils/indexUrlHelper';
import { useModalBodyStyle } from '../hooks/useModalBodyStyle';

// 分钟K线数据内存缓存（不持久化）
// key: `${symbol}-${period}`, value: KlinePoint[]
const KLINE_CACHE_MAX_SIZE = 20; // 最大缓存条数
const klineCache = new Map<string, KlinePoint[]>();

// 带淘汰策略的缓存设置（超出限制时删除最旧的条目）
function setKlineCache(key: string, value: KlinePoint[]) {
  if (klineCache.size >= KLINE_CACHE_MAX_SIZE) {
    // 删除最早的条目（Map按插入顺序迭代）
    const oldestKey = klineCache.keys().next().value;
    if (oldestKey) {
      klineCache.delete(oldestKey);
    }
  }
  klineCache.set(key, value);
}

interface IndexDetailsModalProps {
  data: MarketIndex;
  onClose: () => void;
}

export const IndexDetailsModal: React.FC<IndexDetailsModalProps> = ({ data, onClose }) => {
  const [history, setHistory] = useState<HistoricalPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredPoint, setHoveredPoint] = useState<HistoricalPoint | null>(null);
  const [activeTab, setActiveTab] = useState<'intraday' | 'history'>('intraday');
  const [intradayPoints, setIntradayPoints] = useState<any[]>([]);
  const [visibleMAs, setVisibleMAs] = useState<Record<number, boolean>>(() => Object.fromEntries(DEFAULT_VISIBLE_MAS.map(n => [n, true])));
  const [hoveredIntradayPoint, setHoveredIntradayPoint] = useState<any | null>(null);
  const [showAI, setShowAI] = useState(false);
  // 历史趋势图周期选择（日K、5分钟、15分钟、30分钟、60分钟）
  const [historyPeriod, setHistoryPeriod] = useState<HistoryKlinePeriod>('realtime'); // 'realtime' 表示日K
  const [historyKlineData, setHistoryKlineData] = useState<KlinePoint[]>([]);
  const [historyKlineLoading, setHistoryKlineLoading] = useState(false);
  const [historyKlineError, setHistoryKlineError] = useState<string | null>(null);
  // shared chart height to match FundDetailsModal
  // IntradayChart has paddingBottom=30, HistoryChart has paddingBottom=0 but x labels outside viewBox
  // Use consistent total height for both tabs
  const chartHeight = 200;
  const volumeHeight = 60; // 成交量图表高度

  // 全屏模态框打开时隐藏主页面滚动条
  useModalBodyStyle();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      // 使用 MarketIndex 中的 history 数据
      if (data.history && data.history.length > 0) {
        if (mounted) {
          setHistory(data.history.slice(-365));
          setLoading(false);
        }
        return;
      }
      // 如果没有历史数据，走网络请求
      setLoading(true);
      const points = await fetchIndexHistory(data.info.symbol);
      if (mounted) {
        setHistory(points);
        setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [data.info.symbol, data.history]);

  useEffect(() => {
    try {
      // 优先使用 MarketIndex 中的 intraday 数据，否则从 indexService 获取
      if (data.intraday && data.intraday.length > 0) {
        setIntradayPoints(data.intraday);
      } else {
        const pts = indexService.getIntraday(data.info.symbol);
        setIntradayPoints(pts);
      }
    } catch (e) { setIntradayPoints([]); }
  }, [data.info.symbol, data.info.lastUpdated, data.intraday]);

  // 处理历史趋势图周期切换
  const handleHistoryPeriodChange = useCallback(async (period: HistoryKlinePeriod) => {
    setHistoryPeriod(period);
    if (period === 'realtime') {
      // 日K：使用现有 history 数据
      setHistoryKlineData([]);
      setHistoryKlineError(null);
      return;
    }

    // 分钟K：先检查缓存
    const cacheKey = `${data.info.symbol}-${period}`;
    const cachedData = klineCache.get(cacheKey);

    // 设置加载状态（即使有缓存也要显示，但数据会立即显示）
    setHistoryKlineLoading(true);
    setHistoryKlineError(null);

    if (cachedData && cachedData.length > 0) {
      // 有缓存数据，直接显示，但仍会发起请求更新数据
      setHistoryKlineData(cachedData);
    } else {
      // 无缓存数据，显示空白
      setHistoryKlineData([]);
    }

    // 获取K线数据（无论是否有缓存，都发起请求以更新数据）
    const config = HISTORY_KLINE_PERIOD_CONFIG[period];
    try {
      const previousClose = data.info.previousClose;
      const fetchedData = await fetchIndexIntradayKline(
        data.info.symbol,
        config.klt!,
        config.lmt,
        previousClose
      );

      // 成功获取数据，更新显示和缓存
      if (fetchedData.length > 0) {
        setHistoryKlineData(fetchedData);
        setKlineCache(cacheKey, fetchedData);
        setHistoryKlineError(null);
      } else {
        // API 返回空数据，显示"暂无K线数据"（仅在没有缓存时显示）
        if (!cachedData || cachedData.length === 0) {
          setHistoryKlineError('暂无K线数据');
        }
      }
    } catch (e) {
      // 获取失败，不替换现有数据和缓存，显示错误信息（仅在没有缓存时显示）
      if (!cachedData || cachedData.length === 0) {
        setHistoryKlineError('获取K线数据失败');
      }
    } finally {
      setHistoryKlineLoading(false);
    }
  }, [data.info.symbol, data.info.previousClose]);

  // 根据周期选择，将K线数据转换为 HistoricalPoint 格式
  const klineChartData = useMemo(() => {
    if (historyPeriod === 'realtime' || historyKlineData.length === 0) return null;

    // 将 KlinePoint 转换为 HistoricalPoint 格式
    return historyKlineData.map(k => ({
      date: k.timestamp,
      value: k.close,
      equityReturn: k.changePercent,
      volume: k.volume,
      amount: k.amount
    }));
  }, [historyPeriod, historyKlineData]);

  // 合并当前点到历史数据（仅日K模式）
  const chartData = useMemo(() => {
    // 分钟K模式：使用转换后的K线数据
    if (historyPeriod !== 'realtime') {
      // 如果没有K线数据，返回空数组（不要 fallback 到日K数据）
      return klineChartData || [];
    }

    // 日K模式：使用 history 数据
    if (!history || history.length === 0) return history;

    // 检查是否有有效的交易日期和当前值
    if (!data.info.tradeDate || data.info.current == null) return history;

    // 解析交易日期为时间戳
    const tradeTs = new Date(`${data.info.tradeDate} 15:00`).getTime();
    if (!Number.isFinite(tradeTs)) return history;

    // 检查历史数据最后一条的日期
    const lastHist = history[history.length - 1];
    const lastDayKey = toLocalDateKey(lastHist.date);
    const tradeDayKey = toLocalDateKey(tradeTs);

    // 始终以实时指数值作为图中最新点
    // 当交易日期晚于历史数据最后日期时，追加当前点
    // 注意：volume/amount 只使用当日数据，不使用历史数据作为 fallback
    // 因为历史数据的 volume 是历史日期的，不应该显示为当日数据
    if (tradeDayKey > lastDayKey) {
      return [...history, {
        date: tradeTs,
        value: data.info.current,
        equityReturn: data.info.changePercent || 0,
        volume: data.info.volume,
        amount: data.info.amount
      }];
    }

    // 当交易日期等于历史数据最后日期时，更新最后一个点
    // 此时 lastHist 是当日的历史数据，可以使用
    // 但如果历史数据获取失败，data.info.volume 是旧缓存的数据（日期不匹配），不应使用
    // 判断：只有当 data.info.volume 存在且 > 0 时才使用，否则保留 lastHist 的值
    // （如果 lastHist.volume == 0，说明当日确实没数据）
    const updated = [...history];
    const shouldUseRealtimeVolume = data.info.volume !== undefined && data.info.volume > 0;
    updated[updated.length - 1] = {
      ...lastHist,
      value: data.info.current,
      equityReturn: data.info.changePercent || 0,
      volume: shouldUseRealtimeVolume ? data.info.volume : lastHist.volume,
      amount: shouldUseRealtimeVolume ? data.info.amount : lastHist.amount
    };
    return updated;
  }, [historyPeriod, klineChartData, history, data.info.tradeDate, data.info.current, data.info.changePercent, data.info.volume, data.info.amount]);

  // 是否为分钟K模式
  const isMinuteK = historyPeriod !== 'realtime';

  const { path, area, points, viewBox, yLabels, xLabels, maPaths, maValues, volumeData } = useMemo(() => {
    const sourceData = chartData || [];
    if (sourceData.length < 2) return { path: '', area: '', points: [], viewBox: '0 0 100 100', yLabels: [], xLabels: [], maPaths: {} as Record<number, string>, maValues: {} as Record<number, (number | null)[]>, volumeData: [] };

    // 日K模式：截取为90个点显示
    // 分钟K模式：使用全部数据显示（API返回约80个点）
    // 两种模式都计算MA均线
    const displayCount = isMinuteK ? sourceData.length : 90;
    const { displayData, maValues: computedMaValues } = prepareChartData(sourceData, {
      displayCount,
      maLookback: 25,
      maWindows: MA_WINDOWS
    });

    if (displayData.length < 2) return { path: '', area: '', points: [], viewBox: '0 0 100 100', yLabels: [], xLabels: [], maPaths: {} as Record<number, string>, maValues: {} as Record<number, (number | null)[]>, volumeData: [] };

    const width = 1000;
    const height = chartHeight;
    const paddingLeft = 80; // extra left space to ensure y-axis labels fit
    const paddingRight = 30;
    const paddingTop = 0;
    const paddingBottom = 0;

    const values = displayData.map(p => p.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
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
      return { text: val.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), y: getY(val) };
    });

    const xLabelIndices = [0, Math.floor(displayData.length / 2), displayData.length - 1];
    const xLabels = xLabelIndices.map(idx => {
      const d = new Date(displayData[idx].date);
      // 分钟K模式：显示 时:分 格式；日K模式：显示 月/日 格式
      const text = isMinuteK
        ? `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
        : `${d.getMonth() + 1}/${d.getDate()}`;
      return { text, x: getX(idx) };
    });

    // 使用公共函数计算好的MA值
    const maValues = computedMaValues;
    const maPaths: Record<number, string> = {};
    for (const w of MA_WINDOWS) {
      const sma = maValues[w];
      if (!sma || !Array.isArray(sma)) {
        maPaths[w] = '';
        continue;
      }
      const smaPts = sma.map((v, i) => v !== null ? { x: getX(i), y: getY(v as number) } : null);
      const firstIdx = smaPts.findIndex(p => p !== null);
      if (firstIdx !== -1) {
        let d = `M ${(smaPts[firstIdx] as any).x} ${(smaPts[firstIdx] as any).y} `;
        for (let j = firstIdx + 1; j < smaPts.length; j++) {
          const p = smaPts[j]; if (p) d += `L ${p.x} ${p.y} `;
        }
        maPaths[w] = d;
      } else {
        maPaths[w] = '';
      }
    }

    // 计算成交量数据（用于柱状图）
    const volumeData: VolumeData[] = svgPoints.map((p, i) => {
      const data = p.data;
      const volume = data.volume || 0;
      const amount = data.amount;
      // 判断涨跌：使用 equityReturn 或与前一日比较
      const isUp = data.equityReturn >= 0;
      return {
        x: p.x,
        volume,
        amount,
        isUp
      };
    });

    return { path: pathData, area: areaData, points: svgPoints, viewBox: `0 0 ${width} ${height}`, yLabels, xLabels, maPaths, maValues, volumeData };
  }, [chartData, isMinuteK]);

  return (
    <div id="index-details-modal" className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}></div>

      <div className="relative bg-white w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh] rounded-3xl">
        <div className="px-6 pt-3 pb-1 border-b border-gray-50 flex justify-between items-start">
          <div>
            <div className="flex items-center space-x-2 mb-1">
               <h2 className="text-lg font-black text-gray-800 leading-tight">{data.info.name}</h2>
               <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] font-mono">{data.info.symbol}</span>
            </div>
            <div className="flex items-baseline space-x-3">
              <span className={`text-2xl font-normal ${data.info.changePercent >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                {data.info.current.toLocaleString()}
              </span>
              <span className={`text-sm font-medium ${data.info.changePercent >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                {data.info.changePercent >= 0 ? '+' : ''}{data.info.changePercent.toFixed(2)}%
                <span className="ml-2">({data.info.change >= 0 ? '+' : ''}{data.info.change.toFixed(2)})</span>
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowAI(true)}
              className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 hover:bg-blue-100 transition-colors"
              title="AI助手"
            >
              <i className="fas fa-robot"></i>
            </button>
            <button onClick={onClose} className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden p-1">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center space-y-3">
              <i className="fas fa-circle-notch animate-spin text-blue-500 text-3xl"></i>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">正在抓取指数趋势...</p>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="relative bg-gray-50 rounded-lg p-1">
                <div className="mb-1 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <button onClick={() => setActiveTab('intraday')} className={`px-3 py-1 rounded text-sm ${activeTab === 'intraday' ? 'bg-white border' : 'bg-transparent text-gray-500'}`}>日内趋势图</button>
                    <button onClick={() => setActiveTab('history')} className={`px-3 py-1 rounded text-sm ${activeTab === 'history' ? 'bg-white border' : 'bg-transparent text-gray-500'}`}>历史趋势图</button>
                  </div>
                  {/* 周期选择下拉框 - 历史趋势图时显示，与tab按钮水平齐平 */}
                  {activeTab === 'history' && (
                    <select
                      role="combobox"
                      value={historyPeriod}
                      onChange={(e) => handleHistoryPeriodChange(e.target.value as HistoryKlinePeriod)}
                      className="px-2 py-1 rounded text-sm border bg-white"
                    >
                      {Object.entries(HISTORY_KLINE_PERIOD_CONFIG).map(([key, config]) => (
                        <option key={key} value={key}>{key === 'realtime' ? '日K' : config.label}</option>
                      ))}
                    </select>
                  )}
                </div>
                {/* 固定高度的图表容器，确保tab切换时高度不变 */}
                <div className="relative" style={{ height: chartHeight + 12 }}>
                  {/* 均线切换按钮 - 右上角绝对定位（历史趋势图 + 日K模式） */}
                  {activeTab === 'history' && (
                    <div className="absolute top-1 right-2 z-10 flex items-center space-x-1">
                      {MA_WINDOWS.map(n => {
                        const color = MA_COLORS[n] || '#2563eb';
                        return (
                          <button key={n} type="button" aria-label={`切换显示 MA${n}`} onClick={() => setVisibleMAs(v => ({ ...v, [n]: !v[n] }))}
                            className="text-[10px] px-1.5 py-0.5 rounded border inline-flex items-center gap-1 transition-colors bg-white/80 backdrop-blur-sm" style={{ borderColor: color, color, backgroundColor: visibleMAs[n] ? `${color}20` : 'rgba(255,255,255,0.8)' }}>
                            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
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
                  )}
                  {activeTab === 'intraday' ? (
                    <IntradayChart
                      points={intradayPoints}
                      width={1000}
                      height={chartHeight}
                      stroke="#2563eb"
                      onHover={p => setHoveredIntradayPoint(p)}
                      valueDecimalPlaces={2}
                      showKeyTimes={true}
                    />
                  ) : (
                    <>
                      {historyKlineLoading && (
                        <div className="absolute top-0 left-0 right-0 text-center text-xs text-gray-500 py-1 bg-gray-100/80 z-10">
                          加载中...
                        </div>
                      )}
                      {historyKlineError && (
                        <div className="absolute top-0 left-0 right-0 text-center text-xs text-red-500 py-1 bg-red-50/80 z-10">
                          {historyKlineError}
                        </div>
                      )}
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
                         stroke="#2563eb"
                         height={chartHeight}
                         volumeData={volumeData}
                         volumeHeight={volumeHeight}
                       />
                    </>
                  )}
                </div>
                {/* 固定高度的信息栏 */}
                <div className="h-12 bg-white flex items-center justify-between px-4 border-t">
                  {(() => {
                    if (activeTab === 'intraday') {
                      const hp = hoveredIntradayPoint as any;
                      let timeLabel = '—';
                      let valueLabel = '—';
                      let changeText = '—';
                      let changeClass = 'text-gray-700';
                      if (hp) {
                        timeLabel = hp.timestamp ? formatTime(new Date(hp.timestamp)) : '—';
                        valueLabel = typeof hp.value === 'number' ? hp.value.toFixed(2) : '—';
                        const pct = hp.equityReturn;
                        if (typeof pct === 'number') {
                          const prev = pct === -100 ? 0 : hp.value / (1 + pct / 100);
                          const abs = hp.value - prev;
                          changeText = `${abs.toFixed(4)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
                          changeClass = pct >= 0 ? 'text-red-600' : 'text-green-600';
                        }
                      } else if (intradayPoints && intradayPoints.length > 0) {
                        const last = intradayPoints[intradayPoints.length - 1];
                        timeLabel = last.timestamp ? formatTime(new Date(last.timestamp)) : '—';
                        valueLabel = typeof last.value === 'number' ? last.value.toFixed(2) : '—';
                        // 计算较上一日的变化
                        const pct = last.equityReturn;
                        if (typeof pct === 'number' && typeof last.value === 'number') {
                          const prev = pct === -100 ? 0 : last.value / (1 + pct / 100);
                          const abs = last.value - prev;
                          changeText = `${abs.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
                          changeClass = pct >= 0 ? 'text-red-600' : 'text-green-600';
                        }
                      }
                      return (<><div className="w-36 mr-4"><div className="text-[10px] text-gray-400">时间</div><div className="text-sm font-medium text-gray-800">{timeLabel}</div></div><div className="w-40 mr-4"><div className="text-[10px] text-gray-400">净值</div><div className="text-sm font-medium text-gray-800">{valueLabel}</div></div><div className="w-44"><div className="text-[10px] text-gray-400">较上一日</div><div className={`text-sm font-medium ${changeClass}`}>{changeText}</div></div></>);
                    } else {
                      const hp = hoveredPoint as any;
                      let dateLabel = '—';
                      let valueLabel = '—';
                      let changeText = '—';
                      let changeClass = 'text-gray-700';
                      let volumeLabel = '—';
                      let amountLabel = '—';
                      if (hp && points && points.length > 0) {
                        const idx = points.findIndex((p: any) => p.data === hp);
                        const isLastPoint = idx === points.length - 1 || idx === -1;
                        const v = (idx >= 0) ? points[idx].data.value : (points[points.length - 1].data.value);
                        const d = (idx >= 0) ? new Date(points[idx].data.date) : new Date(points[points.length - 1].data.date);
                        // 分钟K模式：显示"月/日 时:分"格式（使用公用方法）；日K模式：显示日期格式
                        const shortDate = formatDateShort(d).replace('-', '/'); // MM-DD -> MM/DD
                        dateLabel = isMinuteK
                          ? `${shortDate} ${formatTime(d)}`
                          : formatDateDisplay(d);
                        valueLabel = v.toFixed(2);
                        // 最新点直接使用 data 中的值，历史点使用 equityReturn 计算
                        if (isLastPoint) {
                          // 最新点：以窗口显示的实时数据为准
                          const changePct = data.info.changePercent;
                          const changeAbs = data.info.change;
                          if (typeof changePct === 'number') {
                            changeText = `${changeAbs >= 0 ? '+' : ''}${changeAbs.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`;
                            changeClass = changePct >= 0 ? 'text-red-600' : 'text-green-600';
                          }
                        } else {
                          // 历史点：使用 equityReturn 字段计算涨跌
                          const equityReturn = (idx >= 0) ? points[idx].data.equityReturn : (points[points.length - 1].data.equityReturn);
                          if (typeof equityReturn === 'number') {
                            const prev = equityReturn === -100 ? 0 : v / (1 + equityReturn / 100);
                            const abs = v - prev;
                            changeText = `${abs.toFixed(2)} (${equityReturn >= 0 ? '+' : ''}${equityReturn.toFixed(2)}%)`;
                            changeClass = equityReturn >= 0 ? 'text-red-600' : 'text-green-600';
                          } else if (idx > 0) {
                            // fallback: 与前一日比较
                            const prev = points[idx - 1].data.value;
                            const abs = v - prev;
                            const pct = prev !== 0 ? (abs / prev * 100) : 0;
                            changeText = `${abs.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
                            changeClass = pct >= 0 ? 'text-red-600' : 'text-green-600';
                          }
                        }
                        // 成交量和成交额
                        const dataPoint = (idx >= 0) ? points[idx].data : (points[points.length - 1].data);
                        if (dataPoint.volume !== undefined && dataPoint.volume > 0) {
                          volumeLabel = formatVolume(dataPoint.volume);
                        }
                        if (dataPoint.amount !== undefined && dataPoint.amount > 0) {
                          amountLabel = formatAmount(dataPoint.amount);
                        }
                      } else if (points && points.length > 0) {
                        const last = points[points.length - 1];
                        const lastDate = new Date(last.data.date);
                        // 分钟K模式：显示"月/日 时:分"格式（使用公用方法）；日K模式：显示日期格式
                        const shortDate = formatDateShort(lastDate).replace('-', '/');
                        dateLabel = isMinuteK
                          ? `${shortDate} ${formatTime(lastDate)}`
                          : formatDateDisplay(lastDate);
                        valueLabel = last.data.value.toFixed(2);
                        // 最新点：以窗口显示的实时数据为准
                        const changePct = data.info.changePercent;
                        const changeAbs = data.info.change;
                        if (typeof changePct === 'number') {
                          changeText = `${changeAbs >= 0 ? '+' : ''}${changeAbs.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`;
                          changeClass = changePct >= 0 ? 'text-red-600' : 'text-green-600';
                        }
                        // 成交量和成交额
                        if (last.data.volume !== undefined && last.data.volume > 0) {
                          volumeLabel = formatVolume(last.data.volume);
                        }
                        if (last.data.amount !== undefined && last.data.amount > 0) {
                          amountLabel = formatAmount(last.data.amount);
                        }
                      }
                      return (
                        <div className="flex items-center">
                          <div className="w-28 mr-3"><div className="text-[10px] text-gray-400">时间</div><div className="text-xs font-medium text-gray-800">{dateLabel}</div></div>
                          <div className="w-28 mr-3"><div className="text-[10px] text-gray-400">净值</div><div className="text-xs font-medium text-gray-800">{valueLabel}</div></div>
                          <div className="w-28 mr-3"><div className="text-[10px] text-gray-400">涨跌</div><div className={`text-xs font-medium ${changeClass}`}>{changeText}</div></div>
                          <div className="w-24 mr-3"><div className="text-[10px] text-gray-400">成交量</div><div className="text-xs font-medium text-gray-800">{volumeLabel}</div></div>
                          <div className="w-20"><div className="text-[10px] text-gray-400">成交额</div><div className="text-xs font-medium text-gray-800">{amountLabel}</div></div>
                        </div>
                      );
                    }
                  })()}
                </div>
              </div>

              <div className="p-2 bg-gray-50 rounded-lg">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">行情更新时间</p>
                <p className="text-xs font-bold text-gray-700">{data.info.lastUpdated}</p>
              </div>

              {/* 外部链接 - 在东方财富查看详细页 */}
              <div className="mt-2">
                <a
                  href={getIndexDetailUrl(data.info.symbol)}
                  target="_blank"
                  rel="noreferrer"
                  className="block py-3 text-center text-xs font-bold text-gray-400 border border-gray-100 rounded-2xl hover:bg-gray-50 transition-colors"
                >
                  在东方财富查看详细页 <i className="fas fa-external-link-alt ml-1"></i>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* AI Assistant panel - rendered with portal to avoid z-index issues */}
      {showAI && (() => {
        const aiPanel = (
          <IndexAISidePanel
            isVisible={showAI}
            onClose={() => setShowAI(false)}
            indexSymbol={data.info.symbol}
            indexName={data.info.name}
            currentValue={data.info.current}
            currentVolume={data.info.volume}
            history={chartData}
            maValues={maValues}
            volumeData={volumeData}
            intradayPoints={intradayPoints}
          />
        );
        return (typeof document !== 'undefined' && document.body) ? createPortal(aiPanel, document.body) : aiPanel;
      })()}
    </div>
  );
};
