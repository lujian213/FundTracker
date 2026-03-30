import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { DayPicker } from 'react-day-picker';
import { zhCN } from 'date-fns/locale';
import { Ticker, ValuationData } from '../types';
import { readAll, getAllTradeDates } from '../hooks/useTrades';
import TradeBatchInputModal from './TradeBatchInputModal';

interface Props {
  portfolio: Ticker[];
  marketData: Record<string, ValuationData>;
  onClose: () => void;
  onSelectFund?: (symbol: string) => void;
  initiallySelectedFund?: string; // 新增属性：初始选中的基金
}

// Parse a local YYYY-MM-DD string into a local Date (midnight)
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Format a local Date to YYYY-MM-DD
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const fmt = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatNum(v: number): React.ReactNode {
  if (v === 0) return <span className="text-black">-</span>;
  return <span>{fmt.format(v)}</span>;
}

const TransactionsModal: React.FC<Props> = ({ portfolio, marketData, onClose, onSelectFund, initiallySelectedFund }) => {
  const [tradeDateStrs, setTradeDateStrs] = useState<string[]>([]);
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState<Date>(new Date());
  const [showBatchInput, setShowBatchInput] = useState(false);

  // Load trade dates on mount (fresh read each time modal opens)
  useEffect(() => {
    const dates = getAllTradeDates(); // descending
    setTradeDateStrs(dates);
    if (dates.length > 0) {
      // 如果提供了initiallySelectedFund，则尝试找到该基金的第一个交易日期
      if (initiallySelectedFund) {
        const all = readAll();
        const fundTrades = all[initiallySelectedFund] || [];
        if (fundTrades.length > 0) {
          // 找到该基金最早的交易日期
          const earliestFundDate = fundTrades.reduce((earliest, trade) => {
            return trade.date < earliest ? trade.date : earliest;
          }, fundTrades[0].date);

          // 检查这个日期是否在总的交易日期列表中
          if (dates.includes(earliestFundDate)) {
            setSelectedDateStr(earliestFundDate);
            setPickerMonth(parseLocalDate(earliestFundDate));
          } else {
            // 如果不在列表中，使用列表中的第一个日期
            setSelectedDateStr(dates[0]);
            setPickerMonth(parseLocalDate(dates[0]));
          }
        } else {
          // 如果该基金没有交易记录，使用列表中的第一个日期
          setSelectedDateStr(dates[0]);
          setPickerMonth(parseLocalDate(dates[0]));
        }
      } else {
        // 没有提供特定基金时，使用原来的逻辑
        setSelectedDateStr(dates[0]);
        setPickerMonth(parseLocalDate(dates[0]));
      }
    } else {
      setSelectedDateStr(null);
    }
  }, [initiallySelectedFund]);

  const tradeDateSet = useMemo(
    () => new Set(tradeDateStrs),
    [tradeDateStrs]
  );

  // DayPicker Date objects for highlighted / allowed days
  const tradeDateObjects = useMemo(
    () => tradeDateStrs.map(parseLocalDate),
    [tradeDateStrs]
  );

  // Rows for the selected date
  const rows = useMemo(() => {
    if (!selectedDateStr) return [];
    const all = readAll();
    const result: { symbol: string; name: string; type: 'buy' | 'sell'; shares: number; price: number; fee: number; total: number }[] = [];
    Object.entries(all).forEach(([symbol, records]) => {
      records.forEach(r => {
        if (r.date === selectedDateStr) {
          const name =
            (marketData[symbol]?.name) ||
            (portfolio.find(p => p.symbol === symbol)?.name) ||
            '';
          const total = r.type === 'sell'
            ? r.price * r.shares - (r.fee || 0)
            : r.price * r.shares + (r.fee || 0);
          result.push({ symbol, name, type: r.type, shares: r.shares, price: r.price, fee: r.fee || 0, total });
        }
      });
    });
    return result;
  }, [selectedDateStr, tradeDateStrs, portfolio, marketData]);

  const totalFee = rows.reduce((s, r) => s + r.fee, 0);
  // 净额 = 所有卖出交易总额之和 - 所有买入交易总额之和
  const totalNet = rows.reduce((s, r) => s + (r.type === 'sell' ? r.total : -r.total), 0);

  const hasNoTrades = tradeDateStrs.length === 0;

  const handleDaySelect = (day: Date | undefined) => {
    if (!day) return;
    const str = toLocalDateStr(day);
    if (tradeDateSet.has(str)) {
      setSelectedDateStr(str);
      setPickerOpen(false);
    }
  };

  // Disable days that have no trades
  const disabledMatcher = (day: Date) => {
    return !tradeDateSet.has(toLocalDateStr(day));
  };

  const content = (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative bg-white rounded-2xl w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col"
        style={{ maxHeight: '90vh' }}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
          <h3 className="text-lg font-bold">基金交易明细</h3>
          <button
            aria-label="关闭"
            className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100"
            onClick={onClose}
          >
            <i className="fas fa-times" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 min-h-0" style={{ minHeight: '450px' }}>
          {/* Date picker button and batch input */}
          <div className="mb-4 relative flex items-center gap-3">
            <button
              disabled={hasNoTrades}
              onClick={() => setPickerOpen(o => !o)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                hasNoTrades
                  ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                  : 'bg-white border-gray-200 hover:border-blue-400 text-gray-700 shadow-sm'
              }`}
            >
              <i className="far fa-calendar-alt text-gray-400" />
              <span>{selectedDateStr ?? '暂无交易日期'}</span>
              {!hasNoTrades && (
                <i className={`fas fa-chevron-down text-xs text-gray-400 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
              )}
            </button>

            <button
              onClick={() => setShowBatchInput(true)}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:border-blue-400 hover:text-blue-600 shadow-sm transition-colors"
            >
              <i className="fas fa-plus-circle text-gray-400" />
              <span>批量输入</span>
            </button>

            {/* Inline DayPicker dropdown */}
            {pickerOpen && !hasNoTrades && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
                <div className="absolute left-0 top-full mt-2 z-20 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2">
                  <DayPicker
                    mode="single"
                    locale={zhCN}
                    month={pickerMonth}
                    onMonthChange={setPickerMonth}
                    selected={selectedDateStr ? parseLocalDate(selectedDateStr) : undefined}
                    onSelect={handleDaySelect}
                    disabled={disabledMatcher}
                    modifiers={{ hasTrack: tradeDateObjects }}
                    modifiersStyles={{
                      hasTrack: {
                        fontWeight: 'bold',
                        textDecoration: 'underline',
                        textDecorationColor: '#3b82f6',
                        textUnderlineOffset: '3px',
                      },
                    }}
                    styles={{
                      day: { borderRadius: '8px' },
                    }}
                  />
                </div>
              </>
            )}
          </div>

          {/* Table area */}
          {hasNoTrades ? (
            <div className="py-12 text-center text-sm text-gray-400">无任何交易存在</div>
          ) : (
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="overflow-y-auto" style={{ maxHeight: '330px' }}>
                <table className="w-full text-sm table-fixed border-collapse">
                  <colgroup>
                    <col style={{ width: '30%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '32%' }} />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-gray-50">
                    <tr className="border-b border-gray-200">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">基金名称</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">类型</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">份额</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">手续费</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">交易总额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-gray-400 text-xs">
                          该日期无任何交易
                        </td>
                      </tr>
                    ) : (
                      rows.map((r, i) => {
                        const label = r.name ? `${r.name}（${r.symbol}）` : `（${r.symbol}）`;
                        return (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                            <td className="px-3 py-2 text-left">
                              {onSelectFund ? (
                                <button
                                  className="block truncate text-xs text-left w-full hover:text-blue-600 transition-colors"
                                  title={label}
                                  onClick={() => { onSelectFund(r.symbol); onClose(); }}
                                >
                                  {label}
                                </button>
                              ) : (
                                <span className="block truncate text-xs text-gray-700" title={label}>{label}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-left">
                              <span className={`text-xs font-medium ${r.type === 'buy' ? 'text-green-600' : 'text-red-500'}`}>
                                {r.type === 'buy' ? '买入' : '卖出'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-xs text-gray-700">{formatNum(r.shares)}</td>
                            <td className="px-3 py-2 text-right text-xs text-gray-700">{formatNum(r.fee)}</td>
                            <td className="px-3 py-2 text-right text-xs text-gray-700">{formatNum(r.total)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  <tfoot className="sticky bottom-0 z-10 bg-gray-50">
                    <tr className="border-t border-gray-200">
                      <td className="px-3 py-2 text-left text-xs font-bold text-gray-700">总计：{rows.length} 条记录</td>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right text-xs font-bold text-gray-700">{formatNum(totalFee)}</td>
                      <td className="px-3 py-2 text-right text-xs font-bold text-gray-700">
                        {totalNet === 0
                          ? <span className="text-black">-</span>
                          : totalNet > 0
                            ? <span>{fmt.format(totalNet)}（卖出）</span>
                            : <span>{fmt.format(Math.abs(totalNet))}（买入）</span>
                        }
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 批量输入弹窗 */}
      {showBatchInput && (
        <TradeBatchInputModal
          portfolio={portfolio}
          marketData={marketData}
          onClose={() => setShowBatchInput(false)}
          onSaved={() => {
            // 刷新交易记录 - 通过更新时间戳触发重新渲染
            setTradeDateStrs(getAllTradeDates());
          }}
        />
      )}
    </div>
  );

  return createPortal(content, document.body);
};

export default TransactionsModal;

