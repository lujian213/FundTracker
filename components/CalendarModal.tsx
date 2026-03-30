// components/CalendarModal.tsx
import React, { useState, useMemo, useRef } from 'react';
import { zhCN } from 'date-fns/locale';
import { CalendarEvent, CalendarData } from '../types';
import { getEventsForYear, getUpcomingEvents, isHolidayType } from '../services/calendarService';

interface CalendarModalProps {
  onClose: () => void;
  zIndex?: number;
}

// 获取月份的天数
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// 获取月份第一天是星期几（0=周日）
function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export const CalendarModal: React.FC<CalendarModalProps> = ({
  onClose,
  zIndex = 150,
}) => {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [tooltipData, setTooltipData] = useState<{ x: number; y: number; events: CalendarEvent[]; dateStr: string } | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 月份名称
  const months = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

  // 获取本年的所有事件
  const yearEvents = useMemo(() => {
    return getEventsForYear(currentYear);
  }, [currentYear]);

  // 获取当前月份的天数和星期信息
  const daysInMonth = getDaysInMonth(currentYear, viewMonth);
  const firstDayOfMonth = getFirstDayOfMonth(currentYear, viewMonth);

  // 生成日历网格数据
  const calendarDays = useMemo(() => {
    const days: Array<{ date: number; isCurrentMonth: boolean }> = [];

    // 填充空白（月初的空白天）
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push({ date: 0, isCurrentMonth: false });
    }

    // 填充当月天数
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ date: d, isCurrentMonth: true });
    }

    // 只补齐到实际需要的行数，不多余的格子
    const totalCells = firstDayOfMonth + daysInMonth;
    const requiredRows = Math.ceil(totalCells / 7);
    const totalCellsInGrid = requiredRows * 7;

    while (days.length < totalCellsInGrid) {
      days.push({ date: 0, isCurrentMonth: false });
    }

    return days;
  }, [daysInMonth, firstDayOfMonth]);

  // 计算实际行数
  const actualRows = Math.ceil((firstDayOfMonth + daysInMonth) / 7);

  // 获取某一天的事件
  const getEventsForDay = (day: number): CalendarEvent[] => {
    if (day === 0) return [];
    const dateStr = `${currentYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return yearEvents[dateStr] || [];
  };

  // 判断是否今天
  const isToday = (day: number): boolean => {
    return day === today.getDate() &&
      viewMonth === today.getMonth() &&
      currentYear === today.getFullYear();
  };

  // 处理鼠标进入 - 清除之前的timeout并显示tooltip
  const handleMouseEnter = (day: number, e: React.MouseEvent) => {
    if (day === 0) return;
    // 清除可能存在的隐藏timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    const events = getEventsForDay(day);
    const dateStr = `${currentYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // 如果该日期没有事件，不显示tooltip
    if (events.length === 0) {
      return;
    }

    // 使用 e.currentTarget 获取格子元素，而不是 e.target（可能是子元素）
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltipData({
      x: rect.left + rect.width / 2,
      y: rect.top,
      events,
      dateStr
    });
  };

  // 处理鼠标离开 - 使用延迟隐藏
  const handleMouseLeave = () => {
    // 延迟500ms后隐藏，让鼠标有时间移动到tooltip上
    hideTimeoutRef.current = setTimeout(() => {
      setTooltipData(null);
    }, 500);
  };

  // 处理鼠标进入tooltip - 清除隐藏timeout
  const handleTooltipMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  // 处理鼠标离开tooltip - 立即隐藏
  const handleTooltipMouseLeave = () => {
    setTooltipData(null);
  };

  // 切换上个月
  const prevMonth = () => {
    if (viewMonth > 0) {
      setViewMonth(viewMonth - 1);
    }
  };

  // 切换下个月
  const nextMonth = () => {
    if (viewMonth < 11) {
      setViewMonth(viewMonth + 1);
    }
  };

  // 跳转到今天
  const goToToday = () => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setViewMonth(now.getMonth());
  };

  // 计算未来三天内（包括今天，不含周末）的节假日/交割日提示
  const upcomingAlerts = useMemo(() => {
    return getUpcomingEvents(3).map(event => ({
      ...event,
      type: event.type as 'holiday_china' | 'holiday_hk' | 'holiday_us' | 'holiday_sg' | 'delivery'
    }));
  }, []);

  const holidayEvents = tooltipData?.events.filter(e => isHolidayType(e.type)) || [];
  const deliveryEvents = tooltipData?.events.filter(e => e.type === 'delivery') || [];

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex }}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>
      <div className="relative bg-white rounded-lg shadow-lg w-[1100px] h-[680px] p-4 z-40 flex flex-col font-sans">
        {/* 标题栏 */}
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-bold">投资日历</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors"
            aria-label="关闭"
          >
            <i className="fas fa-times text-gray-400"></i>
          </button>
        </div>

        {/* 即将到来的节假日/交割日提示 */}
        {upcomingAlerts.length > 0 && (
          <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs">
            <div className="font-medium text-amber-700 mb-1">即将到来：</div>
            <div className="flex flex-wrap gap-2">
              {upcomingAlerts.slice(0, 5).map((alert, idx) => (
                <span key={idx} className="flex items-center gap-1">
                  <span className={isHolidayType(alert.type) ? 'text-red-500' : 'text-amber-500'}>●</span>
                  <span className="text-gray-700">
                    {alert.date.slice(5)} {alert.content}
                  </span>
                </span>
              ))}
              {upcomingAlerts.length > 5 && (
                <span className="text-gray-500">等{upcomingAlerts.length}条</span>
              )}
            </div>
          </div>
        )}

        {/* 控制栏 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              disabled={viewMonth === 0}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-gray-600 ${viewMonth === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-100'}`}
            >
              <i className="fas fa-chevron-left"></i>
            </button>
            <select
              value={viewMonth}
              onChange={(e) => setViewMonth(parseInt(e.target.value))}
              className="px-2 py-1 border border-gray-200 rounded text-sm text-gray-700"
            >
              {months.map((month, idx) => (
                <option key={idx} value={idx}>{month}</option>
              ))}
            </select>
            <span className="px-2 py-1 text-sm text-gray-700 font-medium">{currentYear}年</span>
            <button
              onClick={nextMonth}
              disabled={viewMonth === 11}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-gray-600 ${viewMonth === 11 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-100'}`}
            >
              <i className="fas fa-chevron-right"></i>
            </button>
          </div>
          <button
            onClick={goToToday}
            className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            今日
          </button>
        </div>

        {/* 图例 */}
        <div className="flex gap-4 mb-2 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <span className="text-red-500">●</span>
            <span>节假日</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-amber-500">●</span>
            <span>交割日</span>
          </div>
        </div>

        {/* 月历网格 - 使用CSS Grid确保每个格子大小一致 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 星期标题 */}
          <div className="grid grid-cols-7 gap-px text-center text-xs font-medium text-gray-500 border-b border-gray-200 pb-2 mb-1">
            <div>日</div><div>一</div><div>二</div><div>三</div><div>四</div><div>五</div><div>六</div>
          </div>

          {/* 日期格子网格 - 根据实际行数显示 */}
          <div className={`grid grid-cols-7 gap-px bg-gray-200`} style={{ gridTemplateRows: `repeat(${Math.ceil((firstDayOfMonth + daysInMonth) / 7)}, 1fr)` }}>
            {calendarDays.map((dayInfo, idx) => {
              const day = dayInfo.date;
              const events = getEventsForDay(day);
              const isCurrentMonth = dayInfo.isCurrentMonth;
              const isTodayCell = isToday(day);

              return (
                <div
                  key={idx}
                  className={`relative bg-white p-1 flex flex-col items-center h-[90px] ${isCurrentMonth ? 'text-gray-800' : 'text-gray-300'} ${isTodayCell ? 'bg-blue-50' : ''}`}
                  onMouseEnter={(e) => handleMouseEnter(day, e)}
                  onMouseLeave={handleMouseLeave}
                >
                  {/* 日期数字 */}
                  <span className={`text-sm ${isTodayCell ? 'font-bold text-blue-600' : ''}`}>
                    {day > 0 ? day : ''}
                  </span>

                  {/* 事件列表 - pointer-events-none确保日期格子的tooltip能正常显示 */}
                  {events.length > 0 && day > 0 && (
                    <div className="w-full flex flex-col mt-0.5 overflow-hidden pointer-events-none">
                      {events.slice(0, 4).map((event, eIdx) => (
                        <div
                          key={eIdx}
                          className="flex items-center gap-px text-[10px] leading-none whitespace-nowrap overflow-hidden"
                        >
                          <span className={isHolidayType(event.type) ? 'text-red-500 flex-shrink-0' : 'text-amber-500 flex-shrink-0'}>●</span>
                          {event.market && <span className="text-gray-400 text-[9px] flex-shrink-0">{event.market}</span>}
                          <span className="truncate">{event.content}</span>
                        </div>
                      ))}
                      {events.length > 4 && (
                        <span className="text-[9px] text-gray-400">+{events.length - 4}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Tooltip - 使用绝对定位跟随鼠标/元素 - 去掉滚动条，全部显示 */}
        {tooltipData && (
          <div
            className="fixed z-[9999] w-56 bg-white rounded-lg shadow-xl border border-gray-200 p-3 text-xs"
            style={{
              left: tooltipData.x,
              top: tooltipData.y + 10,
              transform: 'translateX(-50%)'
            }}
            onMouseEnter={handleTooltipMouseEnter}
            onMouseLeave={handleTooltipMouseLeave}
          >
            <div className="font-semibold text-gray-700 mb-2">{tooltipData.dateStr}</div>
            {holidayEvents.length > 0 && (
              <div className="mb-2">
                <div className="text-red-500 font-medium mb-1">节假日</div>
                {holidayEvents.map((event, idx) => (
                  <div key={idx} className="text-gray-600 ml-1 mb-1">
                    {event.market && <span className="text-gray-400">[{event.market}] </span>}
                    {event.description || event.content}
                  </div>
                ))}
              </div>
            )}
            {deliveryEvents.length > 0 && (
              <div>
                <div className="text-amber-500 font-medium mb-1">交割日</div>
                {deliveryEvents.map((event, idx) => (
                  <div key={idx} className="text-gray-600 ml-1 mb-1">
                    {event.market && <span className="text-gray-400">[{event.market}] </span>}
                    {event.description || event.content}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CalendarModal;