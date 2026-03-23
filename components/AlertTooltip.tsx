import React, { useState, useMemo, useCallback } from 'react';
import { TickerAlert } from '../types';

interface AlertTooltipProps {
  alerts: TickerAlert[];
}

// 生成唯一ID用于accessibility关联
let tooltipIdCounter = 0;

export const AlertTooltip: React.FC<AlertTooltipProps> = ({ alerts }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tooltipId] = useState(() => `alert-tooltip-${++tooltipIdCounter}`);

  // 按日期升序排列（最紧急的在前）
  const sortedAlerts = useMemo(() => {
    return [...alerts].sort((a, b) => a.date.localeCompare(b.date));
  }, [alerts]);

  // 键盘事件处理：Escape键关闭tooltip
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }, []);

  const handleFocus = useCallback(() => setIsOpen(true), []);
  const handleBlur = useCallback(() => setIsOpen(false), []);
  const handleMouseEnter = useCallback(() => setIsOpen(true), []);
  const handleMouseLeave = useCallback(() => setIsOpen(false), []);

  return (
    <div className="relative inline-flex items-center">
      <button
        aria-label="提示信息"
        aria-expanded={isOpen}
        aria-describedby={isOpen ? tooltipId : undefined}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="w-5 h-5 flex items-center justify-center text-amber-500 hover:text-amber-600 transition-colors"
      >
        <i className="fas fa-bell text-xs" role="img" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          id={tooltipId}
          role="tooltip"
          className="absolute left-0 top-full mt-1 z-50 w-60 bg-white rounded-lg shadow-lg border border-gray-100 py-2 px-3 animate-in fade-in zoom-in-95 duration-150"
        >
          <ul className="space-y-1.5">
            {sortedAlerts.map((alert) => (
              <li key={`${alert.date}-${alert.type}`} className="text-[11px] text-gray-700 leading-relaxed break-words whitespace-normal">
                • {alert.type === 'delivery' ? `${alert.date} ` : ''}{alert.content}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};