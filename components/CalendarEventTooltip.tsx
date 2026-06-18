// components/CalendarEventTooltip.tsx
import React from 'react';
import { isHolidayType, isImportantDataType, isDeliveryType } from '../services/calendarService';

export interface CalendarEventItem {
  date: string;
  content: string;
  description: string;
  type: string;
  market?: string;
}

interface CalendarEventTooltipProps {
  events: CalendarEventItem[];
  title?: string;
  showDate?: boolean;
  style?: React.CSSProperties;
  className?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

/**
 * 日历事件tooltip组件
 * 统一用于主界面日历图标hover和日历窗口日期格子hover
 */
export const CalendarEventTooltip: React.FC<CalendarEventTooltipProps> = ({
  events,
  title = '即将到来的事件',
  showDate = true,
  style,
  className = '',
  onMouseEnter,
  onMouseLeave
}) => {
  if (events.length === 0) return null;

  // 分类事件
  const holidayEvents = events.filter(e => isHolidayType(e.type));
  const deliveryEvents = events.filter(e => isDeliveryType(e.type));
  const importantDataEvents = events.filter(e => isImportantDataType(e.type));

  // 获取日期显示（所有事件的日期相同，取第一个）
  const dateStr = events[0]?.date || '';
  const dateDisplay = dateStr.slice(5); // 只保留月-日

  return (
    <div
      data-testid="calendar-event-tooltip"
      className={`w-56 bg-white rounded-lg shadow-xl border border-gray-200 p-3 text-xs ${className}`}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="font-semibold text-gray-700 mb-2">
        {showDate ? dateDisplay : ''} {title}
      </div>
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
      {importantDataEvents.length > 0 && (
        <div>
          <div className="text-green-500 font-medium mb-1">重要数据</div>
          {importantDataEvents.map((event, idx) => (
            <div key={idx} className="text-gray-600 ml-1 mb-1">
              {event.market && <span className="text-gray-400">[{event.market}] </span>}
              {event.description || event.content}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CalendarEventTooltip;