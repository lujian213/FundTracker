import React, { useMemo } from 'react';
import { MarketIndex, CardStatus, ManageSelectionKey } from '../types';
import { getIntraday } from '../services/indexService';
import { buildSparklinePath } from '../utils/sparklineUtils';
import ManageSelectButton from './ManageSelectButton';

interface IndexCardProps {
  idx: MarketIndex;
  type: 'index' | 'global_index';
  status?: CardStatus;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: (selectionKey: ManageSelectionKey) => void;
  onClick?: () => void;
  selectionKey: ManageSelectionKey;
}

const IndexCard: React.FC<IndexCardProps> = ({
  idx,
  status = 'unknown',
  isSelectionMode = false,
  isSelected = false,
  onSelect,
  onClick,
  selectionKey
}) => {
  const isPlaceholder = idx.info.lastUpdated === '等待更新';
  const statusDotClass = status === 'ok' ? 'bg-green-500' : status === 'error' ? 'bg-red-500' : 'bg-gray-400';
  const statusDotTitle = status === 'ok' ? '正常' : status === 'error' ? '错误' : '未知';

  // 判断是否显示历史标签：交易日期早于今天
  const shouldShowHistoryLabel = (() => {
    if (!idx.info.tradeDate) return false;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return idx.info.tradeDate < todayStr;
  })();

  // 格式化交易日期显示 (MM/DD)
  const formattedTradeDate = idx.info.tradeDate
    ? `${idx.info.tradeDate.substring(5, 7)}/${idx.info.tradeDate.substring(8, 10)}`
    : '';

  // 格式化完整日期时间显示 (MM-dd HH:mm)
  const formattedDateTime = idx.info.tradeDate
    ? `${idx.info.tradeDate.substring(5, 7)}-${idx.info.tradeDate.substring(8, 10)} ${idx.info.lastUpdated.substring(0, 5)}`
    : idx.info.lastUpdated.substring(0, 5);

  // 格式化前值（千分位，2位小数）
  const formattedPreviousClose = idx.info.previousClose
    ? idx.info.previousClose.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '-';

  const sparkline = useMemo(() => buildSparklinePath(getIntraday(idx.info.symbol)), [idx.info.symbol, idx.info.lastUpdated]);

  const handleClick = () => {
    if (isSelectionMode && onSelect) {
      onSelect(selectionKey);
    } else if (!isSelectionMode && onClick) {
      onClick();
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`bg-white rounded-2xl pt-3 pb-2 px-3 shadow-sm border transition-all min-w-[150px] lg:min-w-0 relative group cursor-pointer hover:shadow-md ${isSelected ? 'border-blue-500 ring-4 ring-blue-500/10' : isSelectionMode ? 'border-blue-200 ring-2 ring-blue-50' : 'border-gray-100'} animate-in fade-in duration-300`}
    >
      {/* Status dot — top-left corner */}
      <div
        className={`absolute top-2 left-2 w-1.5 h-1.5 rounded-full ${statusDotClass} z-10`}
        title={statusDotTitle}
        aria-label={`状态: ${statusDotTitle}`}
      />
      {/* History label - top right */}
      {shouldShowHistoryLabel && !isPlaceholder && (
        <div className="absolute top-0 right-0 bg-amber-100 text-amber-700 text-[9px] font-bold px-2 py-0.5 rounded-bl-lg rounded-tr-2xl shadow-sm animate-in slide-in-from-right-2 duration-300">
          <i className="fas fa-history mr-1 opacity-70"></i>
          历史:{formattedTradeDate}
        </div>
      )}
      {isSelectionMode && (
        <ManageSelectButton
          isSelected={isSelected}
          label={`切换删除选择 ${idx.info.name || idx.info.symbol}`}
          className="absolute -top-1.5 -right-1.5 z-10"
          onClick={(e) => {
            e.stopPropagation();
            onSelect?.(selectionKey);
          }}
        />
      )}
      <div className="mb-0.5 pl-2.5">
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0 pr-2">
            <h4 className={`text-[12px] font-bold truncate leading-none ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>{idx.info.name}</h4>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-[9px] text-gray-400 font-mono">{idx.info.symbol}</p>
              {sparkline && (
                <svg viewBox="0 0 60 20" className="w-10 h-3.5 rounded-sm" aria-hidden="true" style={{ border: '1px solid #e5e7eb' }}>
                  <path d={sparkline.pathD} fill="none" stroke={sparkline.strokeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* 指数数值与变化率 */}
      <div className="flex justify-between items-end">
        <div className="flex flex-col">
          <div className="flex items-baseline space-x-1">
            <span className={`text-base font-normal ${idx.info.changePercent >= 0 ? 'text-red-600' : 'text-green-600'}`}>
              {isPlaceholder
                ? '-'
                : (idx.info.current || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {!isPlaceholder && formattedTradeDate && (
              <span className="text-[8px] text-gray-400 opacity-60">({formattedTradeDate})</span>
            )}
          </div>
          {/* 前值 */}
          <div className="flex flex-col text-[9px] text-gray-400 mt-0.5">
            <div className="flex items-center space-x-1">
              <span>前值:</span>
              <span className="font-mono font-medium text-gray-600">{formattedPreviousClose}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <div className={`inline-flex items-center px-1.5 py-0.5 rounded-lg text-[12px] transition-all duration-300 ${isPlaceholder ? 'bg-gray-100 text-gray-500' : idx.info.changePercent > 0 ? 'bg-red-100 text-red-700' : idx.info.changePercent < 0 ? 'bg-green-100 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
            {!isPlaceholder && idx.info.changePercent !== 0 && (
              <i className={`fas fa-caret-${idx.info.changePercent > 0 ? 'up' : 'down'} mr-0.5`} />
            )}
            {isPlaceholder ? '-' : `${idx.info.changePercent >= 0 ? '+' : ''}${idx.info.changePercent.toFixed(2)}%`}
          </div>
          <div className="text-[8px] text-gray-400 mt-0.5 font-medium bg-gray-50 px-1.5 py-0.5 rounded-full flex items-center whitespace-nowrap">
            <i className="far fa-clock mr-0.5 opacity-60"></i>
            <span>{formattedDateTime}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IndexCard;