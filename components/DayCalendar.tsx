import React from 'react';
import {
  getProfitColorClass,
  getProfitBgClass,
  formatProfitDisplay,
  getNavigationButtonClass
} from '../utils/calendarCommon';

interface DayCalendarProps {
  calendarYear: number;
  calendarMonth: number;
  calendarDays: Array<{ date: number; profit: number; isInRange: boolean }>;
  canGoPrevMonth: boolean;
  canGoNextMonth: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onDayClick: (day: number) => void;
}

const DayCalendar: React.FC<DayCalendarProps> = (props) => {
  const {
    calendarYear,
    calendarMonth,
    calendarDays,
    canGoPrevMonth,
    canGoNextMonth,
    onPrevMonth,
    onNextMonth,
    onDayClick
  } = props;

  return (
    <div className="flex flex-col">
      {/* 导航栏：月份切换 */}
      <div className="flex items-center justify-between mb-0.5 px-2">
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

      {/* 星期标题 */}
      <div className="grid grid-cols-7 gap-0.5 mb-0.5">
        {['日', '一', '二', '三', '四', '五', '六'].map(day => (
          <div key={day} className="text-center text-[10px] text-gray-400 font-medium">
            {day}
          </div>
        ))}
      </div>

      {/* 日期格子 */}
      <div className="grid grid-cols-7 gap-0.5">
        {calendarDays.map((day, i) => (
          <div
            key={i}
            onClick={() => day.date > 0 && day.isInRange && onDayClick(day.date)}
            className={`text-center py-0.5 rounded border ${
              day.date === 0
                ? 'border-transparent'
                : `${day.isInRange ? 'cursor-pointer' : ''} ${getProfitBgClass(day.profit, day.isInRange)} hover:bg-opacity-80`
            }`}
          >
            {day.date > 0 && (
              <>
                <div className="text-[10px] text-gray-600">{day.date}</div>
                <div className={`text-[10px] font-mono ${getProfitColorClass(day.profit)}`}>
                  {formatProfitDisplay(day.profit)}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default DayCalendar;