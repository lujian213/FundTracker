import React from 'react';
import {
  getProfitColorClass,
  getProfitBgClass,
  formatProfitDisplay,
  getNavigationButtonClass
} from '../utils/calendarCommon';
import { ExtremeIndicator } from './ExtremeIndicator';

interface MonthCalendarProps {
  calendarYear: number;
  monthlyProfits: Array<{ month: number; profit: number; isInRange: boolean }>;
  canGoPrevYear: boolean;
  canGoNextYear: boolean;
  onPrevYear: () => void;
  onNextYear: () => void;
  onMonthClick: (month: number) => void;
  maxProfitMonth?: string | null; // 全局最赚钱的月（格式：YYYY-MM）
  minProfitMonth?: string | null; // 全局最亏钱的月（格式：YYYY-MM）
}

const MonthCalendar: React.FC<MonthCalendarProps> = (props) => {
  const {
    calendarYear,
    monthlyProfits,
    canGoPrevYear,
    canGoNextYear,
    onPrevYear,
    onNextYear,
    onMonthClick,
    maxProfitMonth,
    minProfitMonth
  } = props;

  return (
    <div className="flex flex-col">
      {/* 导航栏：年份切换 */}
      <div className="flex items-center justify-between mb-2 px-2">
        <button
          type="button"
          onClick={onPrevYear}
          disabled={!canGoPrevYear}
          className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${getNavigationButtonClass(canGoPrevYear)}`}
          aria-label="上一年"
        >
          <i className="fas fa-chevron-left text-xs" />
        </button>
        <span className="text-sm font-medium text-gray-700">
          {calendarYear}年
        </span>
        <button
          type="button"
          onClick={onNextYear}
          disabled={!canGoNextYear}
          className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${getNavigationButtonClass(canGoNextYear)}`}
          aria-label="下一年"
        >
          <i className="fas fa-chevron-right text-xs" />
        </button>
      </div>

      {/* 月份格子 */}
      <div className="grid grid-cols-4 gap-2">
        {monthlyProfits.map((mp, i) => {
          // 判断当前月是否为全局最赚/最亏的月
          const currentMonthStr = `${calendarYear}-${String(mp.month).padStart(2, '0')}`;
          const isMaxProfit = currentMonthStr === maxProfitMonth;
          const isMinProfit = currentMonthStr === minProfitMonth;

          return (
            <div
              key={mp.month}
              onClick={() => mp.isInRange && onMonthClick(mp.month)}
              className={`text-center py-2 rounded border relative ${mp.isInRange ? 'cursor-pointer' : ''} ${getProfitBgClass(mp.profit, mp.isInRange)} hover:bg-opacity-80`}
            >
              <ExtremeIndicator isMax={isMaxProfit} isMin={isMinProfit} />

              <div className="text-[10px] text-gray-600 font-medium">{mp.month}月</div>
              <div className={`text-[10px] font-mono ${getProfitColorClass(mp.profit)}`}>
                {formatProfitDisplay(mp.profit)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MonthCalendar;