import React, { useMemo, useEffect, useState } from 'react';
import { Ticker, ValuationData } from '../types';
import { fetchFundHistory as defaultFetchFundHistory } from '../services/fundService';
import { computeRatingFromHistory } from '../utils/ratingHelper';
import RatingTooltip from './RatingTooltip';

interface TickerCardProps {
  ticker: Ticker;
  data?: ValuationData;
  onRemove: () => void;
  onClick?: () => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  // optional injection for easier testing
  fetchHistory?: (symbol: string) => Promise<{ date: number; value: number; equityReturn: number }[]>;
}

export const TickerCard: React.FC<TickerCardProps> = ({
  ticker,
  data,
  onRemove,
  onClick,
  isSelectionMode = false,
  isSelected = false,
  onSelect,
  fetchHistory
}) => {
  // local history for MA calculation (best-effort)
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
  }, [ticker.symbol, fetchFn]);

  const hasData = !!data;
  const isNoValuation = hasData && (data!.lastUpdated?.includes('无估值') || data!.lastUpdated?.includes('已休市'));

  const isTodayData = useMemo(() => {
    if (!hasData || !data!.realtimeDate) return true;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return data!.realtimeDate === todayStr;
  }, [hasData, data?.realtimeDate]);

  const change = hasData ? data!.changePercentage : 0;
  const absChange = Math.abs(change);
  const isUp = change > 0;
  const isDown = change < 0;

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

  const displayPrice = hasData && !isNaN(data!.currentPrice) ? data!.currentPrice.toFixed(4) : '---';
  const displayPrevPrice = hasData && !isNaN(data!.previousPrice) ? data!.previousPrice.toFixed(4) : '---';
  const displayChange = hasData && !isNaN(data!.changePercentage) ? `${isUp ? '+' : ''}${data!.changePercentage.toFixed(2)}%` : '---';

  // compute a simple rating from MAs using shared logic
  const ratingComputed = useMemo(() => {
    try {
      return computeRatingFromHistory(history, data);
    } catch (e) {
      return null;
    }
  }, [history, data]);

  return (
    <div
      onClick={handleCardClick}
      className={`bg-white rounded-2xl p-5 shadow-sm border transition-all relative overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300 ${isSelected ? 'border-blue-500 ring-4 ring-blue-500/10' : 'border-gray-100'} cursor-pointer hover:shadow-lg hover:border-gray-200 active:scale-[0.98]`}>

      {!isSelectionMode && (
        <div className="absolute top-0 right-0 flex items-center">
          {!isTodayData && hasData && data!.realtimeDate !== '---' && (
            <div className="bg-amber-100 text-amber-700 text-[9px] font-bold px-2 py-1 rounded-bl-lg shadow-sm mr-[1px] animate-in slide-in-from-right-2 duration-300">
              <i className="fas fa-history mr-1 opacity-70"></i>
              历史:{formattedRealtimeDate}
            </div>
          )}
          <div className={`${!hasData ? 'bg-gray-300' : isNoValuation ? 'bg-gray-400' : 'bg-red-600'} text-white text-[9px] font-bold px-3 py-1 rounded-bl-lg shadow-sm transition-colors`}>
            {!hasData ? '加载中' : isNoValuation ? '收盘' : '估值'}
          </div>
        </div>
      )}

      {isSelectionMode && (
        <div className={`absolute top-4 right-4 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white border-gray-200 text-transparent'}`}>
          <i className="fas fa-check text-[12px]"></i>
        </div>
      )}

      <div className="flex justify-between items-start mb-4">
        <div className="flex-1 min-w-0 pr-8">
          <h3 className={`font-bold truncate text-base transition-colors ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>
            {data?.name || ticker.name || <span className="text-gray-300 italic font-normal">正在获取名称...</span>}
          </h3>
          <p className="text-xs text-gray-400 mt-1 font-mono tracking-wider">{ticker.symbol}</p>
        </div>

        {!isSelectionMode && (
          <>
            {ratingComputed && (
              <RatingTooltip ratingInfo={ratingComputed} open={ratingTooltipOpen} onOpen={() => setRatingTooltipOpen(true)} onClose={() => setRatingTooltipOpen(false)} />
            )}

            <button onClick={(e) => { e.stopPropagation(); onRemove(); }} aria-label={`删除 ${ticker.symbol}`} className="w-10 h-10 -mr-2 -mt-2 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all group">
              <i className="fas fa-trash-can text-sm group-active:scale-90"></i>
            </button>
          </>
        )}
      </div>

      <div className="flex justify-between items-end">
        <div className="space-y-1">
          {hasData ? (
            <>
              <div className="flex items-baseline space-x-2">
                <span className={`text-3xl font-normal leading-none tracking-tight ${getPriceColor()}`}>
                  {displayPrice}
                </span>
                <span className="text-[10px] text-gray-400 font-medium">{isNoValuation ? '净值' : '实时估值'}</span>
              </div>
              <div className="flex flex-col text-[11px] text-gray-400">
                <div className="flex items-center space-x-1">
                  <span>确认净值:</span>
                  <span className="font-mono font-medium text-gray-600">{displayPrevPrice}</span>
                  <span className="text-[9px] opacity-60">({formattedNetWorthDate})</span>
                </div>
              </div>
            </>
          ) : (
            <div className="animate-pulse space-y-2">
              <div className="h-8 w-24 bg-gray-100 rounded"></div>
              <div className="h-4 w-32 bg-gray-50 rounded"></div>
            </div>
          )}
        </div>

        <div className="text-right">
          {hasData ? (
            <div className="flex flex-col items-end">
              <div className={`inline-flex items-center px-3 py-1.5 rounded-xl text-base transition-all duration-300 ${getChangeStyles()}`}>
                {!isNoValuation && change !== 0 && !isNaN(change) && (
                  <i className={`fas fa-caret-${isUp ? 'up' : 'down'} mr-1.5`} />
                )}
                {displayChange}
              </div>
              <div className="text-[9px] text-gray-400 mt-2 font-medium bg-gray-50 px-2 py-0.5 rounded-full flex items-center">
                <i className="far fa-clock mr-1" />
                {data!.lastUpdated}
              </div>
            </div>
          ) : (
            <div className="h-10 w-24 bg-gray-100 rounded-xl animate-pulse" />
          )}
        </div>

      </div>
    </div>
  );
};
