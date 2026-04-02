import React, { useState, useEffect, useMemo } from 'react';
import { MarketIndex, HistoricalPoint, VolumeData } from '../types';
import { fetchIndexHistory } from '../services/fundService';
import * as cacheService from '../services/cacheService';
import IntradayChart from './IntradayChart';
import HistoryChart from './HistoryChart';
import { MA_COLORS } from '../utils/movingAverage';
import { DEFAULT_VISIBLE_MAS, MA_WINDOWS } from '../utils/maConfig';
import { toLocalDateKey } from '../utils/priceResolver';
import { formatDateDisplay } from '../utils/dateFormat';
import { prepareChartData } from '../utils/chartDataHelper';
import { formatVolume, formatAmount } from '../utils/format';
import IndexAISidePanel from './IndexAISidePanel';

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
  // shared chart height to match FundDetailsModal
  // IntradayChart has paddingBottom=30, HistoryChart has paddingBottom=0 but x labels outside viewBox
  // Use consistent total height for both tabs
  const chartHeight = 200;
  const volumeHeight = 60; // 成交量图表高度

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      // 先查缓存，命中则秒开无需网络请求
      const cached = cacheService.getHistory(data.symbol);
      if (cached && cached.length > 0) {
        if (mounted) {
          setHistory(cached.slice(-365));
          setLoading(false);
        }
        return;
      }
      // 缓存未命中，走网络请求
      setLoading(true);
      const points = await fetchIndexHistory(data.symbol);
      if (mounted) {
        setHistory(points);
        setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [data.symbol]);

  useEffect(() => {
    try {
      const code = data.symbol;
      const pts = cacheService.getIntradayPoints(code);
      setIntradayPoints(pts);
    } catch (e) { setIntradayPoints([]); }
  }, [data.symbol, data.lastUpdated]);

  // 合并当前点到历史数据
  const chartData = useMemo(() => {
    if (!history || history.length === 0) return history;

    // 检查是否有有效的交易日期和当前值
    if (!data.tradeDate || data.current == null) return history;

    // 解析交易日期为时间戳
    const tradeTs = new Date(`${data.tradeDate} 15:00`).getTime();
    if (!Number.isFinite(tradeTs)) return history;

    // 检查历史数据最后一条的日期
    const lastHist = history[history.length - 1];
    const lastDayKey = toLocalDateKey(lastHist.date);
    const tradeDayKey = toLocalDateKey(tradeTs);

    // 始终以实时指数值作为图中最新点
    // 当交易日期晚于历史数据最后日期时，追加当前点
    if (tradeDayKey > lastDayKey) {
      return [...history, {
        date: tradeTs,
        value: data.current,
        equityReturn: data.changePercent || 0,
        volume: data.volume,
        amount: data.amount
      }];
    }

    // 当交易日期等于或早于历史数据最后日期时，更新最后一个点的价格和涨跌幅
    const updated = [...history];
    updated[updated.length - 1] = {
      ...lastHist,
      value: data.current,
      equityReturn: data.changePercent || 0,
      volume: data.volume ?? lastHist.volume,
      amount: data.amount ?? lastHist.amount
    };
    return updated;
  }, [history, data.tradeDate, data.current, data.changePercent, data.volume, data.amount]);

  const { path, area, points, viewBox, yLabels, xLabels, maPaths, maValues, volumeData } = useMemo(() => {
    // 使用公共函数准备数据（包含MA计算和截取）
    const { displayData, maValues: computedMaValues } = prepareChartData(chartData || [], {
      displayCount: 90,
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
      return { text: `${d.getMonth() + 1}/${d.getDate()}`, x: getX(idx) };
    });

    // 使用公共函数计算好的MA值
    const maValues = computedMaValues;
    const maPaths: Record<number, string> = {};
    for (const w of MA_WINDOWS) {
      const sma = maValues[w];
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

    // 计算成交量数据
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
  }, [history]);

  return (
    <div id="index-details-modal" className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}></div>

      <div className="relative bg-white w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh] rounded-3xl">
        <div className="px-6 pt-3 pb-1 border-b border-gray-50 flex justify-between items-start">
          <div>
            <div className="flex items-center space-x-2 mb-1">
               <h2 className="text-lg font-black text-gray-800 leading-tight">{data.name}</h2>
               <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] font-mono">{data.symbol}</span>
            </div>
            <div className="flex items-baseline space-x-3">
              <span className={`text-2xl font-normal ${data.changePercent >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                {data.current.toLocaleString()}
              </span>
              <span className={`text-sm font-medium ${data.changePercent >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                {data.changePercent >= 0 ? '+' : ''}{data.changePercent.toFixed(2)}%
                <span className="ml-2">({data.change >= 0 ? '+' : ''}{data.change.toFixed(2)})</span>
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
                <div className="mb-1 flex items-center space-x-2">
                  <button onClick={() => setActiveTab('intraday')} className={`px-3 py-1 rounded text-sm ${activeTab === 'intraday' ? 'bg-white border' : 'bg-transparent text-gray-500'}`}>日内趋势图</button>
                  <button onClick={() => setActiveTab('history')} className={`px-3 py-1 rounded text-sm ${activeTab === 'history' ? 'bg-white border' : 'bg-transparent text-gray-500'}`}>历史趋势图</button>
                </div>
                {/* 固定高度的图表容器，确保tab切换时高度不变 */}
                <div className="relative" style={{ height: chartHeight + 12 }}>
                  {/* 均线切换按钮 - 右上角绝对定位 */}
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
                    <IntradayChart points={intradayPoints} width={1000} height={chartHeight} stroke="#2563eb" onHover={p => setHoveredIntradayPoint(p)} valueDecimalPlaces={2} />
                  ) : (
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
                  )}
                </div>
                {/* 固定高度的信息栏 */}
                <div className="h-12 bg-white flex items-center justify-between px-4 border-t">
                  {(() => {
                    if (activeTab === 'intraday') {
                      const hp = hoveredIntradayPoint as any;
                      const fmtTime = (ts: number) => { try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return new Date(ts).toLocaleString(); } };
                      let timeLabel = '—';
                      let valueLabel = '—';
                      let changeText = '—';
                      let changeClass = 'text-gray-700';
                      if (hp) {
                        timeLabel = hp.timestamp ? fmtTime(hp.timestamp) : '—';
                        valueLabel = typeof hp.value === 'number' ? hp.value.toFixed(4) : '—';
                        const pct = hp.equityReturn;
                        if (typeof pct === 'number') {
                          const prev = pct === -100 ? 0 : hp.value / (1 + pct / 100);
                          const abs = hp.value - prev;
                          changeText = `${abs.toFixed(4)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
                          changeClass = pct >= 0 ? 'text-red-600' : 'text-green-600';
                        }
                      } else if (intradayPoints && intradayPoints.length > 0) {
                        const last = intradayPoints[intradayPoints.length - 1];
                        timeLabel = last.timestamp ? fmtTime(last.timestamp) : '—';
                        valueLabel = typeof last.value === 'number' ? last.value.toFixed(4) : '—';
                        // 计算较上一日的变化
                        const pct = last.equityReturn;
                        if (typeof pct === 'number' && typeof last.value === 'number') {
                          const prev = pct === -100 ? 0 : last.value / (1 + pct / 100);
                          const abs = last.value - prev;
                          changeText = `${abs.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
                          changeClass = pct >= 0 ? 'text-red-600' : 'text-green-600';
                        }
                      }
                      return (<><div className="w-36 mr-6"><div className="text-[10px] text-gray-400">时间</div><div className="text-sm font-medium text-gray-800">{timeLabel}</div></div><div className="w-44 mr-6"><div className="text-[10px] text-gray-400">净值</div><div className="text-sm font-medium text-gray-800">{valueLabel}</div></div><div className="w-48"><div className="text-[10px] text-gray-400">较上一日</div><div className={`text-sm font-medium ${changeClass}`}>{changeText}</div></div></>);
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
                        dateLabel = formatDateDisplay(d);
                        valueLabel = v.toFixed(4);
                        // 最新点直接使用 data 中的值，历史点使用 equityReturn 计算
                        if (isLastPoint) {
                          // 最新点：以窗口显示的实时数据为准
                          const changePct = data.changePercent;
                          const changeAbs = data.change;
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
                        dateLabel = formatDateDisplay(new Date(last.data.date));
                        valueLabel = last.data.value.toFixed(4);
                        // 最新点：以窗口显示的实时数据为准
                        const changePct = data.changePercent;
                        const changeAbs = data.change;
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
                <p className="text-xs font-bold text-gray-700">{data.lastUpdated}</p>
              </div>
            </div>
          )}
        </div>
      </div>
      <IndexAISidePanel
        isVisible={showAI}
        onClose={() => setShowAI(false)}
        indexSymbol={data.symbol}
        indexName={data.name}
        history={chartData}
        maValues={maValues}
        volumeData={volumeData}
        intradayPoints={intradayPoints}
      />
    </div>
  );
};
