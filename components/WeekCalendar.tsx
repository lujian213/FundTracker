import React, { useMemo } from 'react';
import { WeekData, getWeeksOfMonth, calculateWeekProfit } from '../utils/calendarWeekUtils';
import {
  formatProfitDisplay,
  getProfitBgClass,
  getProfitColorClass,
  getNavigationButtonClass
} from '../utils/calendarCommon';

interface WeekCalendarProps {
  calendarYear: number;
  calendarMonth: number;
  calendarProfitMap: Record<string, number>;
  chartFromDate: string | null;
  chartEndDate: string | null;
  canGoPrevMonth: boolean;
  canGoNextMonth: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onWeekClick: (weekStart: string, weekEnd: string) => void;
}

const WeekCalendar: React.FC<WeekCalendarProps> = (props) => {
  const {
    calendarYear,
    calendarMonth,
    calendarProfitMap,
    chartFromDate,
    chartEndDate,
    canGoPrevMonth,
    canGoNextMonth,
    onPrevMonth,
    onNextMonth,
    onWeekClick
  } = props;

  const weeks = getWeeksOfMonth(calendarYear, calendarMonth);

  const weeksWithProfit = useMemo(() => {
    return weeks.map(week => ({
      ...week,
      ...calculateWeekProfit(week.startDate, week.endDate, calendarProfitMap, chartFromDate, chartEndDate)
    }));
  }, [weeks, calendarProfitMap, chartFromDate, chartEndDate]);

  const handleWeekClick = (week: typeof weeksWithProfit[0]) => {
    if (week.isInRange) {
      onWeekClick(week.startDate, week.endDate);
    }
  };

  return (
    <div className="flex flex-col">
      {/* 导航栏：月份切换 */}
      <div className="flex items-center justify-between mb-2 px-2">
        <button
          type="button"
          onClick={onPrevMonth}
          disabled={!canGoPrevMonth}
          className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${getNavigationButtonClass(canGoPrevMonth)}`}
          aria-label="上一月"
        >
          <i className="fas fa-chevron-left text-xs" />
        </button>
        <span className="text-sm font-medium text-gray-700">
          {calendarYear}年{calendarMonth}月
        </span>
        <button
          type="button"
          onClick={onNextMonth}
          disabled={!canGoNextMonth}
          className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${getNavigationButtonClass(canGoNextMonth)}`}
          aria-label="下一月"
        >
          <i className="fas fa-chevron-right text-xs" />
        </button>
      </div>

      {/* 周格子网格：每行最多4个 */}
      <div className="grid grid-cols-4 gap-2">
        {weeksWithProfit.map((week) => (
          <div
            key={`${week.startDate}-${week.endDate}`}
            onClick={() => handleWeekClick(week)}
            className={`text-center py-2 rounded border ${getProfitBgClass(week.profit, week.isInRange)} ${week.isInRange ? 'cursor-pointer hover:bg-opacity-80' : 'cursor-not-allowed'}`}
          >
            {/* 日期范围 */}
            <div className="text-[10px] text-gray-600 font-medium">
              {week.startDateDisplay}至{week.endDateDisplay}
            </div>

            {/* 盈利金额 */}
            <div className={`text-[10px] font-mono ${getProfitColorClass(week.profit)}`}>
              {formatProfitDisplay(week.profit)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WeekCalendar;