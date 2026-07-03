import React from 'react';
import { createPortal } from 'react-dom';
import { PositionCompareResult, PositionCompareItem } from '../types/positionExportTypes';
import { formatMoneyWithSeparators } from '../utils/format';
import { useModalBodyStyle } from '../hooks/useModalBodyStyle';

interface PositionCompareModalProps {
  compareResult: PositionCompareResult;
  onClose: () => void;
}

// Format shares or value: 0 displays as "-"
function formatSharesOrValue(value: number): string {
  if (value === 0) return "-";
  return formatMoneyWithSeparators(value);
}

// Format ratio percentage: null displays as "-"
function formatRatio(ratio: number | null): string {
  if (ratio === null) return "-";
  return `${ratio.toFixed(2)}%`;
}

const PositionCompareModal: React.FC<PositionCompareModalProps> = ({ compareResult, onClose }) => {
  useModalBodyStyle();
  const { items, totalCurrentValue, totalImportedValue, totalValueDiff, totalRatio } = compareResult;

  const content = (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative bg-white rounded-2xl w-full shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col"
        style={{ maxWidth: '64rem', maxHeight: '90vh' }}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
          <h3 className="text-lg font-bold">持仓对比</h3>
          <button
            aria-label="关闭对比窗口"
            className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100"
            onClick={onClose}
          >
            <i className="fas fa-times" />
          </button>
        </div>

        {/* Body with table */}
        <div className="flex flex-col min-h-0 flex-1 p-6 overflow-hidden">
          <div className="border border-gray-100 rounded-xl flex flex-col min-h-0 flex-1" style={{ overflow: 'hidden' }}>
            {/* Scrollable tbody container - max 10 rows visible */}
            <div className="overflow-y-auto flex-1 min-h-0" style={{ maxHeight: '400px' }}>
              <table className="w-full text-sm table-fixed border-collapse">
                <colgroup>
                  <col style={{ width: '28%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '8%' }} />
                </colgroup>

                {/* Fixed header */}
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr className="border-b border-gray-200">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">基金名称</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">持仓份额</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">持仓价值</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">对方份额</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">对方价值</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">份额差异</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">价值差异</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">比例</th>
                  </tr>
                </thead>

                {/* Scrollable tbody */}
                <tbody>
                  {items.map((item) => (
                    <tr key={item.symbol} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      {/* 基金名称 */}
                      <td className="px-3 py-2 text-left">
                        <button
                          className="flex items-center gap-1.5 text-left w-full min-w-0 hover:text-blue-600 transition-colors"
                          title={`${item.name}（${item.symbol}）`}
                        >
                          <span className="truncate text-xs text-gray-700">
                            {item.name}（{item.symbol}）
                          </span>
                        </button>
                      </td>
                      {/* 持仓份额 */}
                      <td className="px-3 py-2 text-right text-xs text-gray-700">
                        {formatSharesOrValue(item.currentShares)}
                      </td>
                      {/* 持仓价值 */}
                      <td className="px-3 py-2 text-right text-xs text-gray-700">
                        {formatSharesOrValue(item.currentValue)}
                      </td>
                      {/* 对方份额 */}
                      <td className="px-3 py-2 text-right text-xs text-gray-700">
                        {formatSharesOrValue(item.importedShares)}
                      </td>
                      {/* 对方价值 */}
                      <td className="px-3 py-2 text-right text-xs text-gray-700">
                        {formatSharesOrValue(item.importedValue)}
                      </td>
                      {/* 份额差异 */}
                      <td className="px-3 py-2 text-right text-xs text-gray-700">
                        {formatSharesOrValue(item.sharesDiff)}
                      </td>
                      {/* 价值差异 */}
                      <td className="px-3 py-2 text-right text-xs text-gray-700">
                        {formatSharesOrValue(item.valueDiff)}
                      </td>
                      {/* 比例 */}
                      <td className="px-3 py-2 text-right text-xs text-gray-700">
                        {formatRatio(item.ratio)}
                      </td>
                    </tr>
                  ))}
                </tbody>

                {/* Fixed totals footer */}
                <tfoot className="sticky bottom-0 z-10 bg-gray-50">
                  <tr className="border-t border-gray-200">
                    <td className="px-3 py-2 text-left text-xs font-bold text-gray-700">
                      总计：{items.length}条记录
                    </td>
                    {/* 份额列：不显示总计 */}
                    <td className="px-3 py-2" />
                    {/* 持仓价值总计 */}
                    <td className="px-3 py-2 text-right text-xs font-bold text-gray-700">
                      {formatSharesOrValue(totalCurrentValue)}
                    </td>
                    {/* 对方份额列：不显示总计 */}
                    <td className="px-3 py-2" />
                    {/* 对方价值总计 */}
                    <td className="px-3 py-2 text-right text-xs font-bold text-gray-700">
                      {formatSharesOrValue(totalImportedValue)}
                    </td>
                    {/* 份额差异列：不显示总计 */}
                    <td className="px-3 py-2" />
                    {/* 价值差异总计 */}
                    <td className="px-3 py-2 text-right text-xs font-bold text-gray-700">
                      {formatSharesOrValue(totalValueDiff)}
                    </td>
                    {/* 比例总计 */}
                    <td className="px-3 py-2 text-right text-xs font-bold text-gray-700">
                      {formatRatio(totalRatio)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default PositionCompareModal;