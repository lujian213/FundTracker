// components/TradeSmartInputResultModal.tsx

import React, { useState, useEffect, useMemo, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { ValidatedTradeRecord, ValidationResult } from '../utils/tradeRecordValidator';
import { fmtNumber } from '../utils/format';
import { ConfirmDialog } from './ConfirmDialog';
import { SimpleTooltip } from './SimpleTooltip';
import { TradeSmartInputError } from '../hooks/useTradeSmartInput';
import { isFeatureEnabled } from '../services/systemConfigService';

interface TradeSmartInputResultModalProps {
  visible: boolean;
  records: ValidatedTradeRecord[];
  errors: TradeSmartInputError[];  // OCR识别失败的错误列表
  ocrRawTexts: Record<string, string>;  // DEBUG: 文件名 -> OCR原始文本
  onClose: () => void;
  onConfirm: (selectedRecords: ValidatedTradeRecord[]) => void;
}

/**
 * 生成唯一ID用于选择
 */
function generateRecordId(record: ValidatedTradeRecord): string {
  return `${record.ocrData.tradeDate}_${record.ocrData.fundName}_${record.ocrData.tradeTime}`;
}

/**
 * 交易智能输入结果窗口
 *
 * 显示识别结果，按日期分组，支持选择和校验状态显示
 */
export function TradeSmartInputResultModal({
  visible,
  records,
  errors,
  ocrRawTexts,
  onClose,
  onConfirm,
}: TradeSmartInputResultModalProps) {
  // 选中的记录ID集合
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 是否显示关闭确认弹窗
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  // 窗口打开时重置选择状态（默认不选中）
  useEffect(() => {
    if (visible) {
      setSelectedIds(new Set());
    }
  }, [visible]);

  // 按日期分组
  const groupedRecords = useMemo(() => {
    const groups: Record<string, ValidatedTradeRecord[]> = {};
    for (const record of records) {
      const date = record.ocrData.tradeDate;
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(record);
    }
    // 按日期降序排序
    const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    return sortedDates.map(date => ({
      date,
      records: groups[date],
    }));
  }, [records]);

  // 有效记录列表
  const validRecords = useMemo(() => {
    return records.filter(r => r.validation.isValid);
  }, [records]);

  // 统计信息（包含OCR失败和校验失败）
  const stats = useMemo(() => {
    const successCount = records.filter(r => r.validation.isValid).length;
    const ocrFailCount = errors.length;
    const validationFailCount = records.filter(r => !r.validation.isValid).length;
    const failCount = ocrFailCount + validationFailCount;
    return { successCount, failCount };
  }, [records, errors]);

  // 全选/反选（只操作有效记录）
  const handleSelectAll = () => {
    if (selectedIds.size === validRecords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(validRecords.map(generateRecordId)));
    }
  };

  // 单条选择（无效记录不可选）
  const handleSelect = (record: ValidatedTradeRecord, checked: boolean) => {
    if (!record.validation.isValid) return;
    const id = generateRecordId(record);
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  };

  // 确认添加
  const handleConfirm = () => {
    const selectedRecords = records.filter(r =>
      selectedIds.has(generateRecordId(r))
    );
    onConfirm(selectedRecords);
    onClose();
  };

  // 尝试关闭（检查是否有有效记录）
  const handleClose = () => {
    if (validRecords.length > 0) {
      setShowConfirmClose(true);
    } else {
      onClose();
    }
  };

  // 确认关闭
  const confirmClose = () => {
    setShowConfirmClose(false);
    onClose();
  };

  if (!visible) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ width: '900px', maxWidth: '95vw', maxHeight: '90vh' }}>
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
          <h3 className="text-base font-bold text-gray-800">识别结果</h3>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl">
            ✕
          </button>
        </div>

        <div className="px-5 py-4 flex-1 min-h-0 overflow-y-auto">
          <div className="border border-gray-100 rounded-xl overflow-hidden" style={{ height: '350px' }}>
            <div className="h-full overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr className="border-b border-gray-200" style={{ height: '35px' }}>
                    <th style={{ width: '30px' }} className="px-1 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === validRecords.length && validRecords.length > 0}
                        ref={(el) => {
                          if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < validRecords.length;
                        }}
                        onChange={handleSelectAll}
                        className="w-3 h-3 cursor-pointer"
                      />
                    </th>
                    <th style={{ width: '90px' }} className="px-2 py-1 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">交易日期</th>
                    <th style={{ width: '80px' }} className="px-2 py-1 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">基金代码</th>
                    <th style={{ width: '150px' }} className="px-2 py-1 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">基金名称</th>
                    <th style={{ width: '50px' }} className="px-2 py-1 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">类型</th>
                    <th style={{ width: '70px' }} className="px-2 py-1 text-right text-xs font-semibold text-gray-500 whitespace-nowrap">价格</th>
                    <th style={{ width: '80px' }} className="px-2 py-1 text-right text-xs font-semibold text-gray-500 whitespace-nowrap">份额</th>
                    <th style={{ width: '70px' }} className="px-2 py-1 text-right text-xs font-semibold text-gray-500 whitespace-nowrap">手续费</th>
                    <th style={{ width: '90px' }} className="px-2 py-1 text-right text-xs font-semibold text-gray-500 whitespace-nowrap">交易总额</th>
                    <th style={{ width: '40px' }} className="px-2 py-1 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">有效性</th>
                  </tr>
                </thead>

                <tbody>
                  {groupedRecords.map(group => (
                    <Fragment key={group.date}>
                      <tr className="bg-blue-50 border-b border-gray-100">
                        <td colSpan={10} className="px-3 py-2 text-xs font-semibold text-blue-700">
                          📅 {group.date} ({group.records.length}条记录)
                        </td>
                      </tr>
                      {group.records.map((record, idx) => {
                        const id = generateRecordId(record);
                        const isValid = record.validation.isValid;
                        const hasMatch = record.matchResult.matched;
                        const hasPosition = record.matchResult.hasPosition;

                        // 确定显示的基金代码和名称
                        const displayCode = hasMatch
                          ? record.matchResult.symbol!
                          : '<无法匹配>';
                        const displayName = hasMatch
                          ? record.matchResult.matchedName!
                          : record.ocrData.fundName;

                        // 确定是否高亮显示错误
                        const codeIsError = !hasMatch || !hasPosition;

                        // 价格错误：OCR价格与系统历史价格不一致
                        const priceIsError = record.systemPrice !== undefined &&
                          Number(record.ocrData.nav.toFixed(4)) !== Number(record.systemPrice.toFixed(4));

                        // 份额错误：买入时，计算份额与识别份额不一致
                        const sharesIsError = record.ocrData.operation === 'buy' &&
                          record.calculatedShares !== undefined &&
                          Number(record.ocrData.shares.toFixed(2)) !== Number(record.calculatedShares.toFixed(2));

                        // 总额错误：卖出时，计算总额与识别总额不一致
                        const amountIsError = record.ocrData.operation === 'sell' &&
                          record.calculatedTotal !== undefined &&
                          Number(record.ocrData.amount.toFixed(2)) !== Number(record.calculatedTotal.toFixed(2));

                        return (
                          <tr
                            key={id}
                            className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-25'} ${!isValid ? 'bg-red-50' : ''}`}
                            style={{ height: '40px' }}
                          >
                            <td style={{ width: '30px' }} className="px-1 py-1 text-center">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(id)}
                                onChange={(e) => handleSelect(record, e.target.checked)}
                                disabled={!isValid}
                                className={`w-3 h-3 cursor-pointer ${!isValid ? 'opacity-30 cursor-not-allowed' : ''}`}
                              />
                            </td>
                            <td style={{ width: '90px' }} className="px-2 py-1 text-center text-xs text-gray-500">{record.ocrData.tradeDate}</td>
                            <td style={{ width: '80px' }} className={`px-2 py-1 text-center text-xs font-medium ${codeIsError ? 'text-red-500' : 'text-gray-700'}`}>
                              {displayCode}
                            </td>
                            <td style={{ width: '150px' }} className="px-2 py-1 text-left text-xs truncate" title={displayName}>
                              {displayName}
                            </td>
                            <td style={{ width: '50px' }} className="px-2 py-1 text-center">
                              <span className={`text-xs font-medium ${record.ocrData.operation === 'buy' ? 'text-green-600' : 'text-red-500'}`}>
                                {record.ocrData.operation === 'buy' ? '买入' : '卖出'}
                              </span>
                            </td>
                            <td style={{ width: '70px' }} className={`px-2 py-1 text-right text-xs ${priceIsError ? 'text-red-500 font-bold' : 'text-gray-700'}`}>
                              {record.ocrData.nav.toFixed(4)}
                            </td>
                            <td style={{ width: '80px' }} className={`px-2 py-1 text-right text-xs ${sharesIsError ? 'text-red-500 font-bold' : 'text-gray-700'}`}>
                              {fmtNumber(record.ocrData.shares)}
                            </td>
                            <td style={{ width: '70px' }} className="px-2 py-1 text-right text-xs text-gray-700">
                              {fmtNumber(record.ocrData.fee)}
                            </td>
                            <td style={{ width: '90px' }} className={`px-2 py-1 text-right text-xs ${amountIsError ? 'text-red-500 font-bold' : 'text-gray-700'}`}>
                              {fmtNumber(record.ocrData.amount)}
                            </td>
                            <td style={{ width: '40px' }} className="px-2 py-1 text-center">
                              <SimpleTooltip
                                content={isValid ? '校验通过' : record.validation.errors.join('\n')}
                                alignRight={false}
                              >
                              {isValid ? (
                                <span className="text-green-500 text-sm">✓</span>
                              ) : (
                                <span className="text-red-500 text-sm">✗</span>
                              )}
                              </SimpleTooltip>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>

                <tfoot className="sticky bottom-0 z-10 bg-gray-50">
                  <tr className="border-t border-gray-200" style={{ height: '35px' }}>
                    <td style={{ width: '30px' }} className="px-1 py-1"></td>
                    <td colSpan={9} className="px-2 py-1 text-center text-xs font-semibold text-gray-600">
                      成功 <span className="text-green-500">{stats.successCount}</span> 条，失败 <span className="text-red-500">{stats.failCount}</span> 条
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div
            className={`mt-4 rounded-lg p-3 flex items-center gap-2 ${stats.failCount > 0 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}
            style={{ minHeight: '44px' }}
          >
            {stats.failCount > 0 ? (
              <>
                <span className="text-red-500">⚠️</span>
                <div className="text-xs text-red-600 flex flex-col gap-1">
                  {/* OCR识别失败的图片 */}
                  {errors.map((err, idx) => (
                    <div key={`ocr-${idx}`} className="flex items-center gap-1">
                      <span className="text-red-500">⚠</span>
                      <span className="font-medium">{err.fileName}：</span>
                      <span>{err.message}</span>
                    </div>
                  ))}
                  {/* 校验失败的记录 */}
                  {records
                    .filter(r => !r.validation.isValid)
                    .map((r, idx) => (
                      <div key={`valid-${idx}`} className="flex items-center gap-1">
                        <span className="text-red-500">⚠</span>
                        <span className="font-medium">{r.fileName || r.ocrData.fundName}：</span>
                        <span>{r.validation.errors[0]}</span>
                      </div>
                    ))}
                </div>
              </>
            ) : (
              <>
                <span className="text-green-500">🚀</span>
                <span className="text-xs text-green-600 font-medium">解析正确，没有错误！</span>
              </>
            )}
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
            disabled={selectedIds.size === 0}
            className={`px-4 py-2 text-sm font-bold text-white rounded-lg transition-colors ${
              selectedIds.size === 0
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            确认添加 ({selectedIds.size})
          </button>
        </div>
      </div>

      {/* 关闭确认弹窗 */}
      {showConfirmClose && (
        <ConfirmDialog
          isOpen={showConfirmClose}
          title="确认关闭"
          message="当前有识别成功的交易记录，确定要关闭吗？"
          confirmText="确认关闭"
          cancelText="取消"
          onConfirm={confirmClose}
          onCancel={() => setShowConfirmClose(false)}
        />
      )}
    </div>,
    document.body
  );
}