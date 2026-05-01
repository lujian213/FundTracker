import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { SmartAddFund, SmartAddError } from '../hooks/useSmartAddFunds';
import { fmtNumber, fmtNav } from '../utils/format';
import { isFeatureEnabled } from '../services/systemConfigService';

interface SmartAddResultModalProps {
  visible: boolean;
  funds: SmartAddFund[];
  errors: SmartAddError[];
  ocrRawTexts: Record<string, string>;  // DEBUG: 文件名 -> OCR原始文本
  onClose: () => void;
  onConfirm: (selectedFunds: SmartAddFund[]) => void;
}

const truncateName = (name: string | undefined, maxLen: number = 12): string => {
  if (!name) return '-';
  if (name.length <= maxLen) return name;
  return name.substring(0, maxLen) + '...';
};

export function SmartAddResultModal({
  visible,
  funds,
  errors,
  ocrRawTexts,
  onClose,
  onConfirm,
}: SmartAddResultModalProps) {
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (visible) {
      setSelectedRowKeys(new Set());
    }
  }, [visible]);

  const handleSelectAll = () => {
    if (selectedRowKeys.size === funds.length) {
      setSelectedRowKeys(new Set());
    } else {
      setSelectedRowKeys(new Set(funds.map(f => f.ocrData.fundCode)));
    }
  };

  const handleSelect = (fundCode: string, checked: boolean) => {
    const newSet = new Set(selectedRowKeys);
    if (checked) {
      newSet.add(fundCode);
    } else {
      newSet.delete(fundCode);
    }
    setSelectedRowKeys(newSet);
  };

  const handleConfirm = () => {
    const selectedFunds = funds.filter(f => selectedRowKeys.has(f.ocrData.fundCode));
    onConfirm(selectedFunds);
    onClose();
  };

  const formatChange = (
    oldValue: number | string | null | undefined,
    newValue: number | string | null,
    isNumber: boolean = true,
    decimals: number = 2
  ): React.ReactNode => {
    const hasOldValue = oldValue !== null && oldValue !== undefined;
    const oldDisplay = hasOldValue
      ? (isNumber ? fmtNumber(Number(oldValue), decimals) : String(oldValue))
      : '-';
    const newDisplay = newValue !== null
      ? (isNumber ? fmtNumber(Number(newValue), decimals) : String(newValue))
      : '-';

    const hasChange = !hasOldValue
      ? true
      : isNumber
        ? Number(Number(oldValue).toFixed(decimals)) !== Number(Number(newValue).toFixed(decimals))
        : oldValue !== newValue;

    if (!hasChange) {
      return <span className="whitespace-nowrap text-gray-600">{newDisplay}</span>;
    }

    return (
      <span className="whitespace-nowrap">
        <span className="text-gray-400">{oldDisplay}</span>
        <span className="text-gray-300 mx-1">→</span>
        <span className="text-red-500">{newDisplay}</span>
      </span>
    );
  };

  if (!visible) return null;

  const COL_WIDTHS = {
    checkbox: '40px',
    fundCode: '70px',
    fundName: '120px',
    shares: '100px',
    nav: '90px',
    navDate: '100px',
    profit: '100px',
    operation: '50px',
    fullCapacity: '140px',
    initialPosition: '120px',
    startDate: '110px',
    initialPrice: '120px',
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ width: '1200px', maxWidth: '95vw', maxHeight: '90vh' }}>
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
          <h3 className="text-base font-bold text-gray-800">识别结果</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">
            ✕
          </button>
        </div>

        <div className="px-5 py-4 flex-1 min-h-0 overflow-y-auto">
          <div className="border border-gray-100 rounded-xl overflow-hidden" style={{ height: '300px' }}>
            <div className="h-full overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr className="border-b border-gray-200" style={{ height: '35px' }}>
                    <th style={{ width: COL_WIDTHS.checkbox }} className="px-1 py-1 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedRowKeys.size === funds.length && funds.length > 0}
                        ref={(el) => {
                          if (el) el.indeterminate = selectedRowKeys.size > 0 && selectedRowKeys.size < funds.length;
                        }}
                        onChange={handleSelectAll}
                        className="w-3 h-3 cursor-pointer"
                      />
                    </th>
                    <th style={{ width: COL_WIDTHS.fundCode }} className="px-2 py-1 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">基金代码</th>
                    <th style={{ width: COL_WIDTHS.fundName }} className="px-2 py-1 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">基金名称</th>
                    <th style={{ width: COL_WIDTHS.shares }} className="px-2 py-1 text-right text-xs font-semibold text-gray-500 whitespace-nowrap">当前份额</th>
                    <th style={{ width: COL_WIDTHS.nav }} className="px-2 py-1 text-right text-xs font-semibold text-gray-500 whitespace-nowrap">当前净值</th>
                    <th style={{ width: COL_WIDTHS.navDate }} className="px-2 py-1 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">净值日期</th>
                    <th style={{ width: COL_WIDTHS.profit }} className="px-2 py-1 text-right text-xs font-semibold text-gray-500 whitespace-nowrap">累计收益</th>
                    <th style={{ width: COL_WIDTHS.operation }} className="px-2 py-1 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">操作</th>
                    <th style={{ width: COL_WIDTHS.fullCapacity }} className="px-2 py-1 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">满仓份额</th>
                    <th style={{ width: COL_WIDTHS.initialPosition }} className="px-2 py-1 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">初始持仓</th>
                    <th style={{ width: COL_WIDTHS.startDate }} className="px-2 py-1 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">起始日期</th>
                    <th style={{ width: COL_WIDTHS.initialPrice }} className="px-2 py-1 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">初始价格</th>
                  </tr>
                </thead>

                <tbody>
                  {funds.map((fund, index) => (
                    <tr
                      key={fund.ocrData.fundCode}
                      className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-25'}`}
                      style={{ height: '40px' }}
                    >
                      <td style={{ width: COL_WIDTHS.checkbox }} className="px-1 py-1 text-center">
                        <input
                          type="checkbox"
                          checked={selectedRowKeys.has(fund.ocrData.fundCode)}
                          onChange={(e) => handleSelect(fund.ocrData.fundCode, e.target.checked)}
                          className="w-3 h-3 cursor-pointer"
                        />
                      </td>
                      <td style={{ width: COL_WIDTHS.fundCode }} className="px-2 py-1 text-center text-xs font-medium whitespace-nowrap">{fund.ocrData.fundCode}</td>
                      <td style={{ width: COL_WIDTHS.fundName }} className="px-2 py-1 text-left text-xs whitespace-nowrap truncate" title={fund.ocrData.fundName}>
                        {truncateName(fund.ocrData.fundName)}
                      </td>
                      <td style={{ width: COL_WIDTHS.shares }} className="px-2 py-1 text-right text-xs whitespace-nowrap">{fmtNumber(fund.ocrData.shares)}</td>
                      <td style={{ width: COL_WIDTHS.nav }} className="px-2 py-1 text-right text-xs whitespace-nowrap">{fmtNav(fund.ocrData.nav)}</td>
                      <td style={{ width: COL_WIDTHS.navDate }} className="px-2 py-1 text-center text-xs whitespace-nowrap">{fund.ocrData.navDate}</td>
                      <td style={{ width: COL_WIDTHS.profit }} className={`px-2 py-1 text-right text-xs whitespace-nowrap ${fund.ocrData.accumulatedProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {fmtNumber(fund.ocrData.accumulatedProfit)}
                      </td>
                      <td style={{ width: COL_WIDTHS.operation }} className={`px-2 py-1 text-center text-xs whitespace-nowrap ${fund.positionResult.operationType === 'add' ? 'text-blue-500' : 'text-orange-500'}`}>
                        {fund.positionResult.operationType === 'add' ? '添加' : '更新'}
                      </td>
                      <td style={{ width: COL_WIDTHS.fullCapacity }} className="px-2 py-1 text-center text-xs">
                        {formatChange(
                          fund.positionResult.previousPosition?.fullCapacity,
                          fund.positionResult.newPosition.fullCapacity
                        )}
                      </td>
                      <td style={{ width: COL_WIDTHS.initialPosition }} className="px-2 py-1 text-center text-xs">
                        {formatChange(
                          fund.positionResult.previousPosition?.initialPosition,
                          fund.positionResult.newPosition.initialPosition
                        )}
                      </td>
                      <td style={{ width: COL_WIDTHS.startDate }} className="px-2 py-1 text-center text-xs">
                        {formatChange(
                          fund.positionResult.previousPosition?.startDate,
                          fund.positionResult.newPosition.startDate,
                          false
                        )}
                      </td>
                      <td style={{ width: COL_WIDTHS.initialPrice }} className="px-2 py-1 text-center text-xs">
                        {formatChange(
                          fund.positionResult.previousPosition?.initialPrice,
                          fund.positionResult.newPosition.initialPrice,
                          true,
                          4
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-gray-50 border-t border-gray-200 flex-shrink-0" style={{ height: '35px' }}>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="h-full">
                    <td style={{ width: COL_WIDTHS.checkbox }} className="px-1 py-1 text-center"></td>
                    <td colSpan={11} className="px-2 py-1 text-center text-xs font-semibold text-gray-600 whitespace-nowrap">
                      解析成功 <span className="text-green-500">{funds.length}</span> 个，失败 <span className="text-red-500">{errors.length}</span> 个
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div
            className={`mt-4 rounded-lg overflow-y-auto ${errors.length > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}
            style={{ height: '48px', maxHeight: '48px', scrollbarGutter: 'stable' }}
          >
            <div className="p-3 flex items-center gap-2">
              {errors.length > 0 ? (
                <>
                  <i className="fas fa-exclamation-triangle text-yellow-500"></i>
                  <div className="text-xs text-yellow-700 whitespace-normal">
                    <span className="font-medium">{errors.length} 个图片识别失败：</span>
                    <span className="ml-1">{errors.map(e => `${e.fileName}(${e.message})`).join('; ')}</span>
                  </div>
                </>
              ) : (
                <>
                  <i className="fas fa-rocket text-green-500"></i>
                  <span className="text-xs text-green-600 font-medium">解析正常，没有错误。</span>
                </>
              )}
            </div>
          </div>

          {/* DEBUG: OCR原始文本输出 - 受系统开关控制 */}
          {isFeatureEnabled('ocrDebugPanelEnabled') && Object.keys(ocrRawTexts).length > 0 && (
            <div className="mt-4 bg-gray-100 border border-gray-300 rounded-lg p-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">OCR原始文本（调试）</span>
                <button
                  onClick={() => {
                    const text = Object.entries(ocrRawTexts)
                      .map(([file, text]) => `=== ${file} ===\n${text}`)
                      .join('\n\n');
                    navigator.clipboard.writeText(text);
                  }}
                  className="text-xs text-blue-500 hover:text-blue-700"
                >
                  复制全部
                </button>
              </div>
              <div className="overflow-y-auto max-h-[150px] text-xs text-gray-600 whitespace-pre-wrap font-mono">
                {Object.entries(ocrRawTexts)
                  .map(([file, text]) => (
                    <div key={file} className="mb-2">
                      <div className="font-bold text-gray-800">{file}：</div>
                      <div>{text}</div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex justify-end flex-shrink-0">
          <button
            onClick={handleConfirm}
            disabled={selectedRowKeys.size === 0}
            className={`px-4 py-2 text-sm font-bold text-white rounded-lg transition-colors ${
              selectedRowKeys.size === 0
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            确认添加 ({selectedRowKeys.size})
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}