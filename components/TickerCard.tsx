
import React, { useMemo } from 'react';
import { Ticker, ValuationData } from '../types';

interface TickerCardProps {
  ticker: Ticker;
  data?: ValuationData;
  onRemove: () => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
}

export const TickerCard: React.FC<TickerCardProps> = ({
  ticker,
  data,
  onRemove,
  isSelectionMode = false,
  isSelected = false,
  onSelect
}) => {
  const hasData = !!data;
  const isNoValuation = hasData && (data.lastUpdated.includes('无估值') || data.lastUpdated.includes('已休市'));

  // 检查是否为非当日数据（使用本地时区 YYYY-MM-DD）
  const isTodayData = useMemo(() => {
    if (!hasData || !data.valuationDate) return true;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return data.valuationDate === todayStr;
  }, [hasData, data?.valuationDate]);

  const change = hasData ? data.changePercentage : 0;
  const absChange = Math.abs(change);
  const isUp = change > 0;
  const isDown = change < 0;

  const getChangeStyles = () => {
    if (!hasData) return 'bg-gray-100 text-transparent select-none';
    if (isNoValuation || change === 0) return 'bg-gray-50 text-gray-500';

    if (isUp) {
      if (absChange < 1) return 'bg-red-50 text-red-600';
      if (absChange < 3) return 'bg-red-100 text-red-700 font-bold';
      if (absChange < 5) return 'bg-red-500 text-white font-bold shadow-sm shadow-red-200';
      return 'bg-red-700 text-white font-black shadow-md shadow-red-300 ring-2 ring-red-100';
    }

    if (isDown) {
      if (absChange < 1) return 'bg-green-50 text-green-600';
      if (absChange < 3) return 'bg-green-100 text-green-700 font-bold';
      if (absChange < 5) return 'bg-green-500 text-white font-bold shadow-sm shadow-green-200';
      return 'bg-green-700 text-white font-black shadow-md shadow-green-300 ring-2 ring-green-100';
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
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className={`bg-white rounded-2xl p-5 shadow-sm border transition-all relative overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300 ${isSelected ? 'border-blue-500 ring-4 ring-blue-500/10' : 'border-gray-100'} ${isSelectionMode ? 'cursor-pointer active:scale-[0.98]' : ''}`}
    >
      {/* 顶部状态标识 */}
      {!isSelectionMode && (
        <div className="absolute top-0 right-0 flex items-center">
          {!isTodayData && hasData && data.valuationDate !== '---' && (
             <div className="bg-amber-100 text-amber-700 text-[9px] font-bold px-2 py-1 rounded-bl-lg shadow-sm mr-[1px] animate-in slide-in-from-right-2 duration-300">
               <i className="fas fa-history mr-1 opacity-70"></i>
               {data.valuationDate.split('-').slice(1).join('/')}
             </div>
          )}
          <div className={`${!hasData ? 'bg-gray-300' : isNoValuation ? 'bg-gray-400' : 'bg-red-600'} text-white text-[9px] font-bold px-3 py-1 rounded-bl-lg shadow-sm transition-colors`}>
            {!hasData ? '加载中' : isNoValuation ? '收盘' : '估值'}
          </div>
        </div>
      )}

      {/* 选择指示器 */}
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
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="w-10 h-10 -mr-2 -mt-2 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all group"
            title="删除"
          >
            <i className="fas fa-trash-can text-sm group-active:scale-90"></i>
          </button>
        )}
      </div>

      <div className="flex justify-between items-end">
        <div className="space-y-1">
          {hasData ? (
            <>
              <div className="flex items-baseline space-x-2">
                <span className={`text-3xl font-black leading-none tracking-tight ${getPriceColor()}`}>
                  {data.currentPrice.toFixed(4)}
                </span>
                <span className="text-[10px] text-gray-400 font-medium">
                  {isNoValuation ? '收盘净值' : '实时估值'}
                </span>
              </div>
              <div className="flex flex-col text-[11px] text-gray-400">
                <div className="flex items-center space-x-1">
                  <span>昨日净值:</span>
                  <span className="font-mono font-medium text-gray-600">
                    {data.previousPrice.toFixed(4)}
                  </span>
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
                {!isNoValuation && change !== 0 && (
                  <i className={`fas fa-caret-${isUp ? 'up' : 'down'} mr-1.5`}></i>
                )}
                {isUp ? '+' : ''}{data.changePercentage.toFixed(2)}%
              </div>
              <div className="text-[9px] text-gray-400 mt-2 font-medium bg-gray-50 px-2 py-0.5 rounded-full flex items-center">
                <i className="far fa-clock mr-1"></i>
                {data.lastUpdated}
              </div>
            </div>
          ) : (
            <div className="h-10 w-24 bg-gray-100 rounded-xl animate-pulse"></div>
          )}
        </div>
      </div>
    </div>
  );
};
