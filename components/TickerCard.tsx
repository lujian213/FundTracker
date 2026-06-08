import React, { useMemo, useEffect, useState } from 'react';
import { Ticker, ValuationData, CardStatus, TickerAlert } from '../types';
import { fetchFundHistory as defaultFetchFundHistory } from '../services/fundService';
import { computeRatingFromHistory } from '../utils/ratingHelper';
import { getPreviousDayChange } from '../utils/historyHelper';
import RatingTooltip from './RatingTooltip';
import ManageSelectButton from './ManageSelectButton';
import { AlertTooltip } from './AlertTooltip';
import { getIntraday } from '../services/marketFundService';
import { buildSparklinePath } from '../utils/sparklineUtils';

// Alert 显示的日期范围（天）：仅当 alert 的生效日期在当前日期后 N 天内时才显示图标
export const ALERT_VISIBILITY_DAYS = 3;

interface TickerCardProps {
  ticker: Ticker;
  data?: ValuationData;
  status?: CardStatus;
  onClick?: () => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  // 历史数据更新触发器，变化时重新获取历史数据
  historyUpdateTrigger?: number;
  // optional injection for easier testing
  fetchHistory?: (symbol: string) => Promise<{ date: number; value: number; equityReturn: number }[]>;
}

export const TickerCard: React.FC<TickerCardProps> = ({
  ticker,
  data,
  status = 'unknown',
  onClick,
  isSelectionMode = false,
  isSelected = false,
  onSelect,
  historyUpdateTrigger,
  fetchHistory
}) => {
  const [history, setHistory] = useState<{ date: number; value: number; equityReturn: number }[]>([]);
  const [ratingTooltipOpen, setRatingTooltipOpen] = useState(false);

  const fetchFn = fetchHistory ?? defaultFetchFundHistory;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const h = await fetchFn(ticker.symbol);
        if (mounted && Array.isArray(h)) setHistory(h.slice(-90));
      } catch (e) {
        // ignore
      }
    };
    load();
    return () => { mounted = false; };
  }, [ticker.symbol, fetchFn, historyUpdateTrigger]);

  const intradayPoints = useMemo(() => getIntraday(ticker.symbol), [ticker.symbol, data?.lastUpdated]);
  const sparkline = useMemo(() => buildSparklinePath(intradayPoints), [intradayPoints]);

  const hasData = !!data;
  const isNoValuation = hasData && (data!.lastUpdated?.includes('无估值') || data!.lastUpdated?.includes('已休市'));

  // 判断估值日期是否在今天之前（每次渲染都重新计算，确保跨日场景正确）
  const isTodayData = (() => {
    if (!hasData || !data!.realtimeDate) return true;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    // 估值日期在今天之前才显示"历史"标签
    return data!.realtimeDate >= todayStr;
  })();

  const change = hasData ? data!.changePercentage : 0;
  const absChange = Math.abs(change);
  const isUp = change > 0;
  const isDown = change < 0;

  // 计算上一个交易日涨跌幅（使用公共函数）
  const previousDayChange = useMemo(() => {
    return getPreviousDayChange(history, data?.realtimeDate);
  }, [history, data?.realtimeDate]);

  const getChangeStyles = () => {
    if (!hasData) return 'bg-gray-100 text-transparent select-none';
    if (isNoValuation || change === 0 || isNaN(change)) return 'bg-gray-50 text-gray-500';
    if (isUp) {
      if (absChange < 1) return 'bg-red-50 text-red-600';
      if (absChange < 3) return 'bg-red-100 text-red-700 font-medium';
      if (absChange < 5) return 'bg-red-500 text-white font-medium shadow-sm shadow-red-200';
      return 'bg-red-700 text-white font-normal shadow-md shadow-red-300 ring-2 ring-red-100';
    }
    if (isDown) {
      if (absChange < 1) return 'bg-green-50 text-green-600';
      if (absChange < 3) return 'bg-green-100 text-green-700 font-medium';
      if (absChange < 5) return 'bg-green-500 text-white font-medium shadow-sm shadow-green-200';
      return 'bg-green-700 text-white font-normal shadow-md shadow-green-300 ring-2 ring-green-100';
    }
    return 'bg-gray-50 text-gray-500';
  };

  // 上一个交易日涨跌幅样式（与今日涨跌幅样式一致）
  const getPreviousDayChangeStyles = () => {
    if (previousDayChange === undefined || previousDayChange === 0 || isNaN(previousDayChange)) return 'bg-gray-50 text-gray-500';
    const absPrevChange = Math.abs(previousDayChange);
    const prevIsUp = previousDayChange > 0;
    const prevIsDown = previousDayChange < 0;
    if (prevIsUp) {
      if (absPrevChange < 1) return 'bg-red-50 text-red-600';
      if (absPrevChange < 3) return 'bg-red-100 text-red-700 font-medium';
      if (absPrevChange < 5) return 'bg-red-500 text-white font-medium shadow-sm shadow-red-200';
      return 'bg-red-700 text-white font-normal shadow-md shadow-red-300 ring-2 ring-red-100';
    }
    if (prevIsDown) {
      if (absPrevChange < 1) return 'bg-green-50 text-green-600';
      if (absPrevChange < 3) return 'bg-green-100 text-green-700 font-medium';
      if (absPrevChange < 5) return 'bg-green-500 text-white font-medium shadow-sm shadow-green-200';
      return 'bg-green-700 text-white font-normal shadow-md shadow-green-300 ring-2 ring-green-100';
    }
    return 'bg-gray-50 text-gray-500';
  };

  const getPriceColor = () => {
    if (!hasData) return 'text-gray-200';
    if (isNoValuation) return 'text-gray-800';
    if (isUp) return 'text-red-600';
    if (isDown) return 'text-green-600';
    return 'text-gray-800';
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (isSelectionMode && onSelect) {
      onSelect();
    } else if (!isSelectionMode && onClick) {
      onClick();
    }
  };

  const formattedRealtimeDate = data?.realtimeDate && data!.realtimeDate !== '---' ? data!.realtimeDate.split('-').slice(1).join('/') : '';
  const formattedNetWorthDate = data?.netWorthDate && data!.netWorthDate !== '---' ? data!.netWorthDate.split('-').slice(1).join('/') : '---';

  const displayPrice = hasData && !isNaN(data!.currentPrice) ? data!.currentPrice.toFixed(4) : '-';
  const displayPrevPrice = hasData && !isNaN(data!.previousPrice) ? data!.previousPrice.toFixed(4) : '-';
  const displayChange = hasData && !isNaN(data!.changePercentage) ? `${isUp ? '+' : ''}${data!.changePercentage.toFixed(2)}%` : '-';

  // compute a simple rating from MAs using shared logic
  const ratingComputed = useMemo(() => {
    try {
      return computeRatingFromHistory(history, data);
    } catch (e) {
      return null;
    }
  }, [history, data]);

  // 计算 N 天内生效的 alerts
  const visibleAlerts = useMemo(() => {
    if (!ticker.alert_list || ticker.alert_list.length === 0) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysLater = new Date(today);
    daysLater.setDate(today.getDate() + ALERT_VISIBILITY_DAYS);

    return ticker.alert_list.filter(alert => {
      // 支持两种日期格式：yyyy/MM/dd 和 yyyy-MM-dd
      const dateStr = alert.date.replace(/-/g, '/');
      const [year, month, day] = dateStr.split('/').map(Number);
      const alertDate = new Date(year, month - 1, day);
      return alertDate >= today && alertDate <= daysLater;
    });
  }, [ticker.alert_list, ticker.symbol]);

  const statusDotClass = status === 'ok'
    ? 'bg-green-500'
    : status === 'error'
      ? 'bg-red-500'
      : 'bg-gray-400';
  const statusDotTitle = status === 'ok' ? '正常' : status === 'error' ? '错误' : '未知';

  return (
    <div
      onClick={handleCardClick}
      className={`bg-white rounded-2xl pt-4 pb-3 px-4 shadow-sm border transition-all relative overflow-visible animate-in fade-in slide-in-from-bottom-2 duration-300 ${isSelected ? 'border-blue-500 ring-4 ring-blue-500/10' : 'border-gray-100'} cursor-pointer hover:shadow-lg hover:border-gray-200 active:scale-[0.98]`}>

      {/* Status dot — top-left corner */}
      <div
        className={`absolute top-2.5 left-2.5 w-1.5 h-1.5 rounded-full ${statusDotClass} z-10`}
        title={statusDotTitle}
        aria-label={`状态: ${statusDotTitle}`}
      />

      {!isSelectionMode && (
        <div className="absolute top-0 right-0 flex items-center">
          {!isTodayData && hasData && data!.realtimeDate !== '---' && (
            <div className="bg-amber-100 text-amber-700 text-[9px] font-bold px-2 py-0.5 rounded-bl-lg rounded-tr-2xl shadow-sm mr-[1px] animate-in slide-in-from-right-2 duration-300">
              <i className="fas fa-history mr-1 opacity-70"></i>
              历史:{formattedRealtimeDate}
            </div>
          )}
          <div className={`${!hasData ? 'bg-gray-300' : isNoValuation ? 'bg-gray-400' : 'bg-red-600'} text-white text-[9px] font-bold px-3 py-0.5 rounded-bl-lg rounded-tr-2xl shadow-sm transition-colors`}>
            {!hasData ? '加载中' : isNoValuation ? '收盘' : '估值'}
          </div>
        </div>
      )}

      {isSelectionMode && (
        <ManageSelectButton
          isSelected={isSelected}
          label={`切换删除选择 ${data?.name || ticker.name || ticker.symbol}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect?.();
          }}
        />
      )}

      <div className="flex justify-between items-start mb-2">
        <div className="flex-1 min-w-0 pl-2.5">
          <h3 title={data?.name || ticker.name || ticker.symbol} className={`font-bold truncate text-base transition-colors ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>
            {data?.name || ticker.name || ticker.symbol}
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-[11px] text-gray-400 font-mono tracking-wider">{ticker.symbol}</p>
            {sparkline && (
              <svg viewBox="0 0 60 20" className="w-12 h-4 rounded-sm" aria-hidden="true" style={{ border: '1px solid #e5e7eb' }}>
                <path d={sparkline.pathD} fill="none" stroke={sparkline.strokeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        </div>

        {!isSelectionMode && (
          <div data-testid="rating-badge-slot" className="min-h-[24px] mr-0 mt-0 flex items-start justify-start shrink-0 whitespace-nowrap pt-0.5 gap-1">
            {ratingComputed && (
              <RatingTooltip ratingInfo={ratingComputed} open={ratingTooltipOpen} onOpen={() => setRatingTooltipOpen(true)} onClose={() => setRatingTooltipOpen(false)} />
            )}
            {visibleAlerts.length > 0 && (
              <AlertTooltip alerts={visibleAlerts} />
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between items-end">
        <div className="space-y-0.5">
          <div className="flex items-baseline space-x-2 -translate-y-2">
            <span className={`text-xl font-normal leading-none tracking-tight ${getPriceColor()}`}>
              {displayPrice}
            </span>
            {hasData && (
              <span className="text-[10px] text-gray-400 font-medium">{isNoValuation ? '净值' : '实时估值'}</span>
            )}
          </div>
          <div className="flex flex-col text-[10px] text-gray-400">
            <div className="flex items-center space-x-1">
              <span>确认净值:</span>
              <span className="font-mono font-medium text-gray-600">{displayPrevPrice}</span>
              {hasData && formattedNetWorthDate && (
                <span className="text-[9px] opacity-60">({formattedNetWorthDate})</span>
              )}
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="flex flex-col items-end">
            <div className="flex items-end gap-1.5">
              <div className={`inline-flex items-center px-3 py-1 rounded-xl text-sm transition-all duration-300 ${getChangeStyles()}`}>
                {hasData && !isNoValuation && change !== 0 && !isNaN(change) && (
                  <i className={`fas fa-caret-${isUp ? 'up' : 'down'} mr-1.5`} />
                )}
                {displayChange}
              </div>
              {previousDayChange !== undefined && (
                <div className={`inline-flex items-center px-1.5 py-0.5 rounded-lg text-[10px] transition-all duration-300 ${getPreviousDayChangeStyles()}`}>
                  {previousDayChange !== 0 && !isNaN(previousDayChange) && (
                    <i className={`fas fa-caret-${previousDayChange > 0 ? 'up' : 'down'} mr-0.5`} />
                  )}
                  {previousDayChange >= 0 ? '+' : ''}{previousDayChange.toFixed(2)}%
                </div>
              )}
            </div>
            {hasData && (
              <div className="text-[9px] text-gray-400 mt-1 font-medium bg-gray-50 px-2 py-0.5 rounded-full flex items-center">
                <i className="far fa-clock mr-1" />
                {data!.lastUpdated}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
