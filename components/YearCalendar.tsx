import React from 'react';
import { formatDateDisplay } from '../utils/dateFormat';
import {
  getProfitColorClass,
  getProfitBgClass,
  formatProfitDisplay
} from '../utils/calendarCommon';

interface YearCalendarProps {
  yearlyProfits: Array<{ year: number; profit: number }>;
  chartFromDate: string | null;
  chartEndDate: string | null;
  chartPeriodTotal: number;
  onYearClick: (year: number) => void;
}

// 年份格子组件：复用格子渲染逻辑
const YearCell: React.FC<{ year: number; profit: number; onClick: () => void }> = ({ year, profit, onClick }) => (
  <div
    onClick={onClick}
    className={`text-center py-2 rounded border cursor-pointer ${getProfitBgClass(profit, true)} hover:bg-opacity-80`}
  >
    <div className="text-[10px] text-gray-600 font-medium">{year}年</div>
    <div className={`text-[10px] font-mono ${getProfitColorClass(profit)}`}>
      {formatProfitDisplay(profit)}
    </div>
  </div>
);

const YearCalendar: React.FC<YearCalendarProps> = (props) => {
  const {
    yearlyProfits,
    chartFromDate,
    chartEndDate,
    chartPeriodTotal,
    onYearClick
  } = props;

  return (
    <div className="flex flex-col">
      {/* 年历顶部：期间累计信息 */}
      <div className="text-center text-xs mb-2 py-1 border-b border-gray-200">
        {chartFromDate && chartEndDate ? (
          <>
            <span className="text-gray-500">期间累计</span>
            <span className="text-gray-400 mx-1">（{formatDateDisplay(chartFromDate)} ~ {formatDateDisplay(chartEndDate)}）</span>
            <span className={`font-medium ${getProfitColorClass(chartPeriodTotal)}`}>
              {formatProfitDisplay(chartPeriodTotal)}
            </span>
          </>
        ) : (
          <span className="text-gray-400">暂无数据</span>
        )}
      </div>

      {/* 年份格子 */}
      {yearlyProfits.length >= 4 ? (
        <div className="grid grid-cols-4 gap-2">
          {yearlyProfits.map(yp => (
            <YearCell key={yp.year} year={yp.year} profit={yp.profit} onClick={() => onYearClick(yp.year)} />
          ))}
        </div>
      ) : (
        <div className="flex justify-center gap-2">
          {yearlyProfits.map(yp => (
            <div key={yp.year} className="w-1/4">
              <YearCell year={yp.year} profit={yp.profit} onClick={() => onYearClick(yp.year)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default YearCalendar;