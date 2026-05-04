// components/TradeSmartInputResultModal.tsx

import React, { useState, useEffect, useMemo, Fragment, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ValidatedTradeRecord, ValidationResult, validateTradeRecord } from '../utils/tradeRecordValidator';
import { fmtNumber } from '../utils/format';
import { ConfirmDialog } from './ConfirmDialog';
import { SimpleTooltip } from './SimpleTooltip';
import { TradeSmartInputError, ParseDebugInfo } from '../hooks/useTradeSmartInput';
import { OcrTradeData } from '../utils/tradeOcrParser';
import { isFeatureEnabled } from '../services/systemConfigService';

/**
 * 记录编辑值状态
 */
interface EditedValues {
  price?: number;       // 编辑的交易价格
  shares?: number;      // 编辑的份额
  fee: number;          // 编辑的手续费
  amount: number;       // 编辑的交易总额
}

/**
 * 生成唯一ID用于选择
 */
function generateRecordId(record: ValidatedTradeRecord): string {
  return `${record.ocrData.tradeDate}_${record.ocrData.fundName}_${record.ocrData.tradeTime}`;
}

interface TradeSmartInputResultModalProps {
  visible: boolean;
  records: ValidatedTradeRecord[];
  errors: TradeSmartInputError[];  // OCR识别失败的错误列表
  ocrRawTexts: Record<string, string>;  // DEBUG: 文件名 -> OCR原始文本
  parseDebugInfos: ParseDebugInfo[];  // DEBUG: 解析调试信息
  onClose: () => void;
  onConfirm: (selectedRecords: ValidatedTradeRecord[]) => void;
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
  parseDebugInfos,
  onClose,
  onConfirm,
}: TradeSmartInputResultModalProps) {
  // 选中的记录ID集合
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 是否显示关闭确认弹窗
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  // 编辑后的记录数据（记录ID -> 编辑值）
  const [editedRecords, setEditedRecords] = useState<Map<string, ValidatedTradeRecord>>(new Map());
  // 输入框的原始字符串值（记录ID+字段名 -> 字符串值），用于允许用户自由编辑
  const [inputStrings, setInputStrings] = useState<Map<string, string>>(new Map());

  // 调试面板是否启用（用于调整窗口高度）
  const debugPanelEnabled = isFeatureEnabled('ocrDebugPanelEnabled') && (Object.keys(ocrRawTexts).length > 0 || parseDebugInfos.length > 0);

  // 窗口打开时重置选择状态和编辑状态（默认不选中）
  useEffect(() => {
    if (visible) {
      setSelectedIds(new Set());
      setEditedRecords(new Map());
      setInputStrings(new Map());
    }
  }, [visible]);

  // 获取记录的实际显示数据（优先使用编辑后的数据）
  const getDisplayRecord = useCallback((record: ValidatedTradeRecord): ValidatedTradeRecord => {
    const id = generateRecordId(record);
    const edited = editedRecords.get(id);
    return edited || record;
  }, [editedRecords]);

  // 处理输入框值变化（只更新字符串，不校验）
  const handleInputChange = useCallback((recordId: string, field: string, value: string) => {
    setInputStrings(prev => {
      const newMap = new Map(prev);
      newMap.set(`${recordId}_${field}`, value);
      return newMap;
    });
  }, []);

  // 处理字段编辑，触发重新计算和校验
  const handleFieldChange = useCallback((record: ValidatedTradeRecord, field: 'price' | 'shares' | 'fee' | 'amount', value: number) => {
    const id = generateRecordId(record);
    const currentEdited = editedRecords.get(id);

    // 构建新的OCR数据（基于编辑值）
    const baseOcrData = currentEdited?.ocrData || record.ocrData;
    const newOcrData: OcrTradeData = {
      ...baseOcrData,
      fee: field === 'fee' ? value : (currentEdited?.ocrData.fee ?? baseOcrData.fee),
      amount: field === 'amount' ? value : (currentEdited?.ocrData.amount ?? baseOcrData.amount),
    };

    // 处理交易价格编辑
    if (field === 'price') {
      newOcrData.nav = value;
    }

    // 处理份额编辑
    if (field === 'shares') {
      newOcrData.shares = value;
    }

    // 重新校验记录
    const newValidatedRecord = validateTradeRecord(newOcrData, record.matchResult);

    // 更新编辑状态
    setEditedRecords(prev => {
      const newMap = new Map(prev);
      newMap.set(id, newValidatedRecord);
      return newMap;
    });
  }, [editedRecords]);

  // 处理输入框失去焦点（进行校验）
  const handleInputBlur = useCallback((record: ValidatedTradeRecord, field: 'price' | 'shares' | 'fee' | 'amount', stringValue: string) => {
    const value = parseFloat(stringValue) || 0;
    handleFieldChange(record, field, value);
  }, [handleFieldChange]);

  // 显示记录（编辑后的数据）- 统一计算一次，避免重复
  const displayRecords = useMemo(() => {
    return records.map(r => getDisplayRecord(r));
  }, [records, getDisplayRecord]);

  // 原始记录Map（用于O(1)查找）
  const originalRecordMap = useMemo(() => {
    const map = new Map<string, ValidatedTradeRecord>();
    for (const record of records) {
      map.set(generateRecordId(record), record);
    }
    return map;
  }, [records]);

  // 按日期分组（使用编辑后的数据）
  const groupedRecords = useMemo(() => {
    const groups: Record<string, ValidatedTradeRecord[]> = {};
    for (const record of displayRecords) {
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
  }, [displayRecords]);

  // 有效记录列表（使用编辑后的数据）
  const validRecords = useMemo(() => {
    return displayRecords.filter(r => r.validation.isValid);
  }, [displayRecords]);

  // 统计信息（包含OCR失败和校验失败，使用编辑后的数据）
  const stats = useMemo(() => {
    const successCount = displayRecords.filter(r => r.validation.isValid).length;
    const ocrFailCount = errors.length;
    const validationFailCount = displayRecords.filter(r => !r.validation.isValid).length;
    const failCount = ocrFailCount + validationFailCount;
    return { successCount, failCount, validationFailCount };
  }, [displayRecords, errors]);

  // 选中记录的统计信息
  const selectedStats = useMemo(() => {
    if (selectedIds.size === 0) return null;

    const selectedRecords = displayRecords.filter(r => selectedIds.has(generateRecordId(r)));

    const buyRecords = selectedRecords.filter(r => r.ocrData.operation === 'buy');
    const dingtouRecords = selectedRecords.filter(r => r.ocrData.operation === 'dingtou');
    const sellRecords = selectedRecords.filter(r => r.ocrData.operation === 'sell');

    const buyTotal = buyRecords.reduce((sum, r) => sum + r.ocrData.amount, 0);
    const dingtouTotal = dingtouRecords.reduce((sum, r) => sum + r.ocrData.amount, 0);
    const sellTotal = sellRecords.reduce((sum, r) => sum + r.ocrData.amount, 0);

    return {
      selectedCount: selectedIds.size,
      buyCount: buyRecords.length,
      buyTotal,
      dingtouCount: dingtouRecords.length,
      dingtouTotal,
      sellCount: sellRecords.length,
      sellTotal,
    };
  }, [displayRecords, selectedIds]);

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

  // 确认添加（使用编辑后的记录数据）
  const handleConfirm = () => {
    const selectedRecords = records
      .filter(r => selectedIds.has(generateRecordId(r)))
      .map(r => getDisplayRecord(r));
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
    <>
      {/* 隐藏number输入框的spinner箭头 */}
      <style>{`
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"] {
          -moz-appearance: textfield;
        }
      `}</style>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ width: '940px', maxWidth: '95vw', maxHeight: debugPanelEnabled ? '90vh' : '70vh' }}>
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
          <h3 className="text-base font-bold text-gray-800">识别结果</h3>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl">
            ✕
          </button>
        </div>

        <div className="px-5 py-4 flex-shrink-0">
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
                    <th style={{ width: '95px' }} className="px-2 py-1 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">基金代码</th>
                    <th style={{ width: '135px' }} className="px-2 py-1 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">基金名称</th>
                    <th style={{ width: '50px' }} className="px-2 py-1 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">类型</th>
                    <th style={{ width: '80px' }} className="px-2 py-1 text-right text-xs font-semibold text-gray-500 whitespace-nowrap">价格</th>
                    <th style={{ width: '90px' }} className="px-2 py-1 text-right text-xs font-semibold text-gray-500 whitespace-nowrap">份额</th>
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
                        const originalRecord = originalRecordMap.get(id) || record;
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

                        // 使用校验器提供的 mismatch 字段
                        const priceIsError = record.priceMismatch === true;
                        const sharesIsError = record.sharesMismatch === true;
                        const amountIsError = record.amountMismatch === true;

                        // 判断字段是否可编辑（根据文档规则）
                        // 交易价格：OCR有nav → 可输入；否则显示系统价格
                        const priceEditable = originalRecord.ocrData.nav !== undefined && originalRecord.ocrData.nav !== 0;
                        // 基金份额：OCR有shares → 可输入；否则显示计算值
                        const sharesEditable = originalRecord.ocrData.shares !== undefined && originalRecord.ocrData.shares !== 0;
                        // 手续费：始终可输入
                        // 交易总额：始终可输入

                        // 显示值（使用编辑后的数据）
                        const displayPrice = record.ocrData.nav ?? record.systemPrice;
                        const displayShares = record.ocrData.shares ?? record.calculatedShares ?? 0;
                        const displayFee = record.ocrData.fee ?? 0;
                        const displayAmount = record.ocrData.amount;

                        // 获取原始记录用于编辑回调
                        const recordForEdit = originalRecord;

                        // 获取输入框的字符串值（用于自由编辑）
                        const getPriceInputValue = () => {
                          const key = `${id}_price`;
                          const stored = inputStrings.get(key);
                          if (stored !== undefined) return stored;
                          return displayPrice !== undefined ? displayPrice.toFixed(4) : '';
                        };
                        const getSharesInputValue = () => {
                          const key = `${id}_shares`;
                          const stored = inputStrings.get(key);
                          if (stored !== undefined) return stored;
                          return displayShares.toFixed(2);
                        };
                        const getFeeInputValue = () => {
                          const key = `${id}_fee`;
                          const stored = inputStrings.get(key);
                          if (stored !== undefined) return stored;
                          return displayFee.toFixed(2);
                        };
                        const getAmountInputValue = () => {
                          const key = `${id}_amount`;
                          const stored = inputStrings.get(key);
                          if (stored !== undefined) return stored;
                          return displayAmount.toFixed(2);
                        };

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
                            <td style={{ width: '90px' }} className="px-2 py-1 text-center text-xs text-gray-500 whitespace-nowrap">{record.ocrData.tradeDate}</td>
                            <td style={{ width: '80px' }} className={`px-2 py-1 text-center text-xs font-medium ${codeIsError ? 'text-red-500' : 'text-gray-700'}`}>
                              {displayCode}
                            </td>
                            <td style={{ width: '150px' }} className="px-2 py-1 text-left text-xs truncate" title={displayName}>
                              {displayName}
                            </td>
                            <td style={{ width: '50px' }} className="px-2 py-1 text-center">
                              <span className={`text-xs font-medium ${record.ocrData.operation === 'sell' ? 'text-red-500' : 'text-green-600'}`}>
                                {record.ocrData.operation === 'dingtou' ? '定投' : (record.ocrData.operation === 'sell' ? '卖出' : '买入')}
                              </span>
                            </td>
                            <td style={{ width: '80px' }} className={`px-2 py-1 text-right text-xs whitespace-nowrap ${priceIsError ? 'text-red-500 font-bold' : 'text-gray-700'}`}>
                              {priceEditable ? (
                                <input
                                  type="number"
                                  step="0.0001"
                                  value={getPriceInputValue()}
                                  onChange={(e) => handleInputChange(id, 'price', e.target.value)}
                                  onBlur={(e) => handleInputBlur(recordForEdit, 'price', e.target.value)}
                                  className="w-full text-right text-xs bg-white border border-gray-200 rounded px-1 py-0.5 focus:border-blue-400 focus:outline-none"
                                />
                              ) : (
                                displayPrice !== undefined ? displayPrice.toFixed(4) : '-'
                              )}
                            </td>
                            <td style={{ width: '90px' }} className={`px-2 py-1 text-right text-xs whitespace-nowrap ${sharesIsError ? 'text-red-500 font-bold' : 'text-gray-700'}`}>
                              {sharesEditable ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  value={getSharesInputValue()}
                                  onChange={(e) => handleInputChange(id, 'shares', e.target.value)}
                                  onBlur={(e) => handleInputBlur(recordForEdit, 'shares', e.target.value)}
                                  className="w-full text-right text-xs bg-white border border-gray-200 rounded px-1 py-0.5 focus:border-blue-400 focus:outline-none"
                                />
                              ) : (
                                fmtNumber(displayShares)
                              )}
                            </td>
                            <td style={{ width: '70px' }} className="px-2 py-1 text-right text-xs text-gray-700 whitespace-nowrap">
                              <input
                                type="number"
                                step="0.01"
                                value={getFeeInputValue()}
                                onChange={(e) => handleInputChange(id, 'fee', e.target.value)}
                                onBlur={(e) => handleInputBlur(recordForEdit, 'fee', e.target.value)}
                                className="w-full text-right text-xs bg-white border border-gray-200 rounded px-1 py-0.5 focus:border-blue-400 focus:outline-none"
                              />
                            </td>
                            <td style={{ width: '90px' }} className={`px-2 py-1 text-right text-xs whitespace-nowrap ${amountIsError ? 'text-red-500 font-bold' : 'text-gray-700'}`}>
                              <input
                                type="number"
                                step="0.01"
                                value={getAmountInputValue()}
                                onChange={(e) => handleInputChange(id, 'amount', e.target.value)}
                                onBlur={(e) => handleInputBlur(recordForEdit, 'amount', e.target.value)}
                                className="w-full text-right text-xs bg-white border border-gray-200 rounded px-1 py-0.5 focus:border-blue-400 focus:outline-none"
                              />
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
                    <td colSpan={9} className="px-2 py-1 text-xs font-semibold text-gray-600">
                      <span>
                        校验成功 <span className="text-green-500">{stats.successCount}</span> 条，
                        校验失败 <span className="text-red-500">{stats.validationFailCount}</span> 条
                      </span>
                      {selectedStats && (
                        <span className="ml-4 text-gray-500">
                          | 已选 {selectedStats.selectedCount} 条
                          {selectedStats.buyCount > 0 && (
                            <span className="ml-2">
                              买入 <span className="text-green-600">{selectedStats.buyCount}</span>条/<span className="text-green-600">{fmtNumber(selectedStats.buyTotal)}</span>元
                            </span>
                          )}
                          {selectedStats.dingtouCount > 0 && (
                            <span className="ml-2">
                              定投 <span className="text-green-600">{selectedStats.dingtouCount}</span>条/<span className="text-green-600">{fmtNumber(selectedStats.dingtouTotal)}</span>元
                            </span>
                          )}
                          {selectedStats.sellCount > 0 && (
                            <span className="ml-2">
                              卖出 <span className="text-red-500">{selectedStats.sellCount}</span>条/<span className="text-red-500">{fmtNumber(selectedStats.sellTotal)}</span>元
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div
            className={`mt-4 rounded-lg p-3 flex items-center gap-2 ${errors.length > 0 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}
            style={{ minHeight: '44px' }}
          >
            {errors.length > 0 ? (
              <>
                <span className="text-red-500">⚠️</span>
                <div className="text-xs text-red-600 flex flex-col gap-1">
                  {/* 只显示OCR识别失败的图片，不显示校验失败的记录 */}
                  {errors.map((err, idx) => (
                    <div key={`ocr-${idx}`} className="flex items-center gap-1">
                      <span className="text-red-500">⚠</span>
                      <span className="font-medium">{err.fileName}：</span>
                      <span>{err.message}</span>
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

          {/* DEBUG: 调试面板 - OCR原始文本和解析调试信息并列 */}
          {isFeatureEnabled('ocrDebugPanelEnabled') && (Object.keys(ocrRawTexts).length > 0 || parseDebugInfos.length > 0) && (
            <div className="mt-4 flex gap-4">
              {/* OCR原始文本 */}
              {Object.keys(ocrRawTexts).length > 0 && (
                <div className="flex-1 bg-gray-100 border border-gray-300 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-700">OCR原始文本</span>
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

              {/* 解析调试信息 */}
              {parseDebugInfos.length > 0 && (
                <div className="flex-1 bg-yellow-50 border border-yellow-300 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      解析调试信息 (v{parseDebugInfos[0]?.parserVersion || '?'})
                    </span>
                    <button
                      onClick={() => {
                        // 构建完整复制文本
                        const lines: string[] = [];

                        // 1. OCR关键行
                        if (ocrRawTexts && Object.keys(ocrRawTexts).length > 0) {
                          lines.push('OCR关键行（含|）:');
                          Object.entries(ocrRawTexts).forEach(([file, text]) => {
                            const keyLines = text.split('\n')
                              .filter(line => line.includes('|') && (line.includes('定投') || line.includes('买') || line.includes('卖') || line.includes('IA') || line.includes('TA') || line.includes('Be') || line.includes('黄金')))
                              .slice(0, 10);
                            keyLines.forEach(line => lines.push(line.trim()));
                          });
                          lines.push('');
                        }

                        // 2. 解析调试信息表格
                        parseDebugInfos.forEach(info => {
                          lines.push(`${info.fileName}: 原始${info.rawRecordCount} 过滤${info.afterFilterCount} 匹配${info.matchedCount} 未匹配[${info.unmatchedFunds.join(', ')}] 错误[${info.parseErrors.join('; ')}]`);
                        });

                        navigator.clipboard.writeText(lines.join('\n'));
                      }}
                      className="text-xs text-blue-500 hover:text-blue-700"
                    >
                      复制全部
                    </button>
                  </div>
                  <div className="overflow-y-auto max-h-[150px] text-xs">
                    {/* OCR关键行 */}
                    {ocrRawTexts && Object.keys(ocrRawTexts).length > 0 && (
                      <div className="mb-2 text-gray-600 border-b border-yellow-200 pb-2">
                        <div className="font-bold">OCR关键行（含|）:</div>
                        {Object.entries(ocrRawTexts).map(([file, text]) => {
                          const keyLines = text.split('\n')
                            .filter(line => line.includes('|') && (line.includes('定投') || line.includes('买') || line.includes('卖') || line.includes('IA') || line.includes('TA') || line.includes('Be') || line.includes('黄金')))
                            .slice(0, 10);
                          return (
                            <div key={file} className="mt-1">
                              {keyLines.map((line, i) => (
                                <div key={i} className="font-mono">{line.trim()}</div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-yellow-200">
                          <th className="px-1 py-1 text-left font-semibold">文件</th>
                          <th className="px-1 py-1 text-center font-semibold">原始</th>
                          <th className="px-1 py-1 text-center font-semibold">过滤</th>
                          <th className="px-1 py-1 text-center font-semibold">匹配</th>
                          <th className="px-1 py-1 text-left font-semibold">未匹配</th>
                          <th className="px-1 py-1 text-left font-semibold">错误</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parseDebugInfos.map((info, idx) => (
                          <tr key={idx} className="border-b border-yellow-100">
                            <td className="px-1 py-1 font-medium truncate max-w-[80px]" title={info.fileName}>{info.fileName}</td>
                            <td className="px-1 py-1 text-center">{info.rawRecordCount}</td>
                            <td className="px-1 py-1 text-center">{info.afterFilterCount}</td>
                            <td className="px-1 py-1 text-center text-green-600">{info.matchedCount}</td>
                            <td className="px-1 py-1 text-red-500 truncate max-w-[80px]" title={info.unmatchedFunds.join(', ')}>
                              {info.unmatchedFunds.length > 0 ? info.unmatchedFunds.slice(0, 2).join(', ') + (info.unmatchedFunds.length > 2 ? '...' : '') : '-'}
                            </td>
                            <td className="px-1 py-1 text-red-500 truncate max-w-[80px]" title={info.parseErrors.join('; ')}>
                              {info.parseErrors.length > 0 ? info.parseErrors[0] + (info.parseErrors.length > 1 ? '...' : '') : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
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
    </div>
    </>,
    document.body
  );
}