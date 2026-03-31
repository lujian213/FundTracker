import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ComboTrade, ComboTradeRecord } from '../types';
import { ConfirmDialog } from './ConfirmDialog';
import { loadComboTradesFromStorage, saveComboTradesToStorage, filterValidRecords, validateComboTrade, isValidComboTradeRecord } from '../utils/comboTradeService';
import { fmtNumber } from '../utils/format';

interface Props {
  portfolio: { symbol: string; name: string }[];
  onClose: () => void;
}

interface FundWithPosition {
  symbol: string;
  name: string;
}

function generateId(): string {
  return `combo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

const ComboTradeModal: React.FC<Props> = ({ portfolio, onClose }) => {
  // 组合列表
  const [comboList, setComboList] = useState<ComboTrade[]>([]);
  // 当前选中的组合ID
  const [selectedComboId, setSelectedComboId] = useState<string | null>(null);
  // 编辑区域的数据
  const [editData, setEditData] = useState<{
    name: string;
    records: { fundId: string; amount: number; fee: number }[];
  } | null>(null);
  // 原始数据（用于检测变化）
  const [originalEditData, setOriginalEditData] = useState<{
    name: string;
    records: { fundId: string; amount: number; fee: number }[];
  } | null>(null);
  // 是否有未保存的数据
  const [hasUnsavedData, setHasUnsavedData] = useState(false);
  // 保存后的消息（成功或错误）
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // 新组合名称输入
  const [newComboName, setNewComboName] = useState('');
  // 满仓基金列表
  const [fullCapacityFunds, setFullCapacityFunds] = useState<FundWithPosition[]>([]);
  // 确认弹窗状态
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null);

  // 组件挂载状态跟踪
  const isMounted = useRef(true);

  // 初始化：加载组合列表
  useEffect(() => {
    const list = loadComboTradesFromStorage();
    setComboList(list);
  }, []);

  // 组件卸载时清理
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // 初始化：获取满仓基金（fullCapacity > 0）
  useEffect(() => {
    const funds: FundWithPosition[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('fund_position_')) continue;

      try {
        const pos = JSON.parse(localStorage.getItem(key) || '{}');
        if (pos.fullCapacity > 0) {
          const symbol = key.replace('fund_position_', '');
          // 尝试获取基金名称
          const name =
            portfolio.find(p => p.symbol === symbol)?.name ||
            symbol;
          funds.push({ symbol, name });
        }
      } catch (e) {
        // 忽略解析错误
      }
    }

    // 按基金名称排序
    funds.sort((a, b) => a.name.localeCompare(b.name));
    setFullCapacityFunds(funds);
  }, [portfolio]);

  // 计算编辑区域的总计
  const totals = useMemo(() => {
    if (!editData) return { count: 0, amount: 0, fee: 0 };

    // 使用统一的校验规则
    const validRecords = editData.records.filter(r => isValidComboTradeRecord(r));
    const count = validRecords.length;
    const amount = validRecords.reduce((sum, r) => sum + r.amount, 0);
    const fee = validRecords.reduce((sum, r) => sum + r.fee, 0);

    return { count, amount, fee };
  }, [editData]);

  // 检测数据是否有变化
  const checkDataChanged = (current: typeof editData, original: typeof originalEditData): boolean => {
    if (!current || !original) return false;
    if (current.name !== original.name) return true;
    if (current.records.length !== original.records.length) return true;
    for (let i = 0; i < current.records.length; i++) {
      const c = current.records[i];
      const o = original.records[i];
      if (c.amount !== o.amount || c.fee !== o.fee) return true;
    }
    return false;
  };

  // 当编辑数据变化时，自动检测是否有未保存的更改
  useEffect(() => {
    if (editData && originalEditData) {
      const changed = checkDataChanged(editData, originalEditData);
      setHasUnsavedData(changed);
    }
  }, [editData, originalEditData]);

  // 选择组合
  const handleSelectCombo = (combo: ComboTrade) => {
    if (hasUnsavedData) {
      setConfirmDialog({
        isOpen: true,
        title: '确认切换',
        message: '当前输入的数据尚未保存，确定要切换吗？',
        onConfirm: () => {
          setConfirmDialog(null);
          loadComboToEdit(combo);
        },
        onCancel: () => setConfirmDialog(null),
      });
    } else {
      loadComboToEdit(combo);
    }
  };

  // 加载组合到编辑区域
  const loadComboToEdit = (combo: ComboTrade) => {
    // 创建编辑数据，使用满仓基金列表作为基础，填充已有数据
    const recordsMap = new Map(combo.records.map(r => [r.fundId, r]));

    const records = fullCapacityFunds.map(fund => {
      const existing = recordsMap.get(fund.symbol);
      return existing || { fundId: fund.symbol, amount: 0, fee: 0 };
    });

    // 排序：买入金额大于0的记录显示在上方，买入金额为0的记录显示在下方
    const sortedRecords = [...records].sort((a, b) => b.amount - a.amount);

    const newEditData = { name: combo.name, records: sortedRecords };
    setSelectedComboId(combo.id);
    setEditData(newEditData);
    setOriginalEditData(newEditData);
  };

  // 添加组合
  const handleAddCombo = () => {
    const name = newComboName.trim();
    if (!name) {
      return;
    }

    // 创建新组合
    const newCombo: ComboTrade = {
      id: generateId(),
      name,
      records: [],
    };

    // 保存到 localStorage（使用公共函数）
    const updatedList = [...comboList, newCombo];
    const storageObj = Object.fromEntries(updatedList.map(c => [c.id, c]));
    saveComboTradesToStorage(storageObj);

    setComboList(updatedList);
    setNewComboName('');

    // 加载到编辑区域
    const records = fullCapacityFunds.map(fund => ({
      fundId: fund.symbol,
      amount: 0,
      fee: 0,
    }));
    setSelectedComboId(newCombo.id);
    const newEditData = { name, records };
    setEditData(newEditData);
    setOriginalEditData(newEditData);
  };

  // 删除组合
  const handleDeleteCombo = (combo: ComboTrade) => {
    setConfirmDialog({
      isOpen: true,
      title: '确认删除',
      message: `确定要删除组合 "${combo.name}" 吗？`,
      onConfirm: () => {
        const updatedList = comboList.filter(c => c.id !== combo.id);
        const storageObj = Object.fromEntries(updatedList.map(c => [c.id, c]));
        saveComboTradesToStorage(storageObj);

        setComboList(updatedList);

        // 如果删除的是当前正在编辑的组合，清空编辑区域
        if (selectedComboId === combo.id) {
          setSelectedComboId(null);
          setEditData(null);
          setHasUnsavedData(false);
        }

        setConfirmDialog(null);
      },
      onCancel: () => setConfirmDialog(null),
    });
  };

  // 更新编辑数据
  const handleUpdateRecord = (fundId: string, field: 'amount' | 'fee', value: number) => {
    if (!editData) return;
    // 阻止负数输入
    if (value < 0) return;

    setEditData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        records: prev.records.map(r =>
          r.fundId === fundId ? { ...r, [field]: value } : r
        ),
      };
    });
  };

  // 重置单条记录
  const handleResetRecord = (fundId: string) => {
    if (!editData) return;

    setEditData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        records: prev.records.map(r =>
          r.fundId === fundId ? { ...r, amount: 0, fee: 0 } : r
        ),
      };
    });
  };

  // 更新组合名称
  const handleUpdateName = (name: string) => {
    if (!editData) return;
    setEditData({ ...editData, name });
  };

  // 保存组合
  const handleSave = () => {
    if (!editData) return;

    // 使用公共校验函数
    const existingNames = comboList.map(c => c.name);
    // 获取当前组合的原始名称用于排除自身
    const currentName = originalEditData?.name;
    const validation = validateComboTrade(
      editData.name,
      editData.records,
      existingNames,
      currentName,
      fullCapacityFunds
    );

    if (!validation.valid) {
      setSaveMessage({ type: 'error', text: validation.errorMessage || '数据校验失败' });
      return;
    }

    try {
      // 过滤掉 amount = 0 且 fee = 0 的记录
      const nonEmptyRecords = editData.records.filter(r => r.amount > 0 || r.fee > 0);

      // 格式化并保存过滤后的记录
      const records = nonEmptyRecords.map(r => ({
        fundId: r.fundId,
        amount: Number(r.amount.toFixed(2)),
        fee: Number(r.fee.toFixed(2)),
      }));

      const updatedCombo: ComboTrade = {
        id: selectedComboId!,
        name: (editData.name || '').trim(),
        records,
      };

      // 更新列表
      const updatedList = comboList.map(c =>
        c.id === selectedComboId ? updatedCombo : c
      );

      // 如果是新增的组合（不在列表中），添加进去
      if (!updatedList.find(c => c.id === selectedComboId)) {
        updatedList.push(updatedCombo);
      }

      // 使用公共函数保存
      const storageObj = Object.fromEntries(updatedList.map(c => [c.id, c]));
      saveComboTradesToStorage(storageObj);

      setComboList(updatedList);

      // 重新加载当前组合（保持编辑状态）
      const savedCombo = updatedList.find(c => c.id === selectedComboId);
      if (savedCombo) {
        loadComboToEdit(savedCombo);
      }

      setHasUnsavedData(false);
      setSaveMessage({ type: 'success', text: '保存成功' });

      // 3秒后清除消息（组件卸载后不执行）
      setTimeout(() => {
        if (isMounted.current) {
          setSaveMessage(null);
        }
      }, 3000);
    } catch (e) {
      setSaveMessage({ type: 'error', text: '保存失败，请重试' });
    }
  };

  // 关闭弹窗
  const handleClose = () => {
    if (hasUnsavedData) {
      setConfirmDialog({
        isOpen: true,
        title: '确认关闭',
        message: '当前输入的数据尚未保存，确定要放弃吗？',
        onConfirm: () => {
          setConfirmDialog(null);
          onClose();
        },
        onCancel: () => setConfirmDialog(null),
      });
    } else {
      onClose();
    }
  };

  // 查找基金名称
  const getFundName = (fundId: string): string => {
    const fund = fullCapacityFunds.find(f => f.symbol === fundId);
    return fund ? fund.name : `未知基金 (${fundId})`;
  };

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
      <div
        className="relative bg-white rounded-2xl w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col"
        style={{ height: '660px' }}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
          <h3 className="text-lg font-bold">组合交易管理</h3>
          <button
            aria-label="关闭"
            className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100"
            onClick={handleClose}
          >
            <i className="fas fa-times" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 min-h-0" style={{ minHeight: '500px' }}>
          {/* 已有组合 */}
          <div className="mb-4">
            <div className="text-xs font-medium text-gray-700 mb-2">已有组合：</div>
            {comboList.length === 0 ? (
              <div className="text-sm text-gray-400 py-2">暂无组合，请添加新组合</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {comboList.map(combo => (
                  <div
                    key={combo.id}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                      selectedComboId === combo.id
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <button
                      onClick={() => handleSelectCombo(combo)}
                      className="font-medium"
                    >
                      {combo.name}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCombo(combo);
                      }}
                      className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 rounded hover:bg-gray-200"
                      title="删除"
                    >
                      <i className="fas fa-times text-xs" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 添加组合 */}
          <div className="mb-4">
            <div className="text-xs font-medium text-gray-700 mb-2">添加组合：</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newComboName}
                onChange={(e) => setNewComboName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCombo()}
                placeholder="请输入组合名称"
                className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
              />
              <button
                onClick={handleAddCombo}
                disabled={!newComboName.trim()}
                className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                  newComboName.trim()
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                添加组合交易
              </button>
            </div>
          </div>

          {/* 编辑区域 */}
          <div className="border-t border-gray-100 pt-4">
            <div className="text-xs font-medium text-gray-700 mb-3">编辑组合：</div>

            {editData ? (
              <>
                {/* 组合名称输入 */}
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-xs text-gray-600">组合名称：</span>
                  <input
                    type="text"
                    value={editData.name}
                    onChange={(e) => handleUpdateName(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                  />
                </div>

                {/* 表格 */}
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="overflow-y-auto" style={{ maxHeight: '270px' }}>
                    <table className="w-full text-sm table-fixed border-collapse">
                      <colgroup>
                        <col style={{ width: '35%' }} />
                        <col style={{ width: '30%' }} />
                        <col style={{ width: '25%' }} />
                        <col style={{ width: '10%' }} />
                      </colgroup>
                      <thead className="sticky top-0 z-10 bg-gray-50">
                        <tr className="border-b border-gray-200">
                          <th className="px-2 py-0 text-left text-xs font-semibold text-gray-500">基金</th>
                          <th className="px-2 py-0 text-right text-xs font-semibold text-gray-500">买入金额</th>
                          <th className="px-2 py-0 text-right text-xs font-semibold text-gray-500">手续费</th>
                          <th className="px-2 py-0"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {editData.records.map((record) => (
                          <tr key={record.fundId} className="border-b border-gray-50 hover:bg-gray-50 h-6">
                            <td className="px-1 py-0 text-left text-xs text-gray-700">
                              {getFundName(record.fundId)}
                            </td>
                            <td className="px-1 py-0">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={record.amount}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value) || 0;
                                  handleUpdateRecord(record.fundId, 'amount', value);
                                }}
                                placeholder="0.00"
                                className="w-full h-5 text-right text-xs border border-gray-200 rounded px-1 py-0 [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </td>
                            <td className="px-1 py-0">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={record.fee}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value) || 0;
                                  handleUpdateRecord(record.fundId, 'fee', value);
                                }}
                                placeholder="0.00"
                                className="w-full h-5 text-right text-xs border border-gray-200 rounded px-1 py-0 [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button
                                onClick={() => handleResetRecord(record.fundId)}
                                className="text-gray-400 hover:text-blue-500 p-1"
                                title="重置"
                              >
                                <i className="fas fa-undo" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {/* 总计行 - 固定在底部，始终可见 */}
                      <tfoot className="sticky bottom-0 bg-white">
                        <tr className="border-t border-gray-200">
                          <td className="px-2 py-2 text-xs text-gray-600">总计：{totals.count}条</td>
                          <td className="px-2 py-2 text-right text-xs text-gray-600">{fmtNumber(totals.amount)}</td>
                          <td className="px-2 py-2 text-right text-xs text-gray-600">{fmtNumber(totals.fee)}</td>
                          <td className="px-2 py-2"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* 保存按钮和信息显示区 */}
                <div className="mt-2 flex items-center gap-4">
                  <div className={`flex-1 text-xs ${saveMessage?.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                    {saveMessage?.text || '\u00A0'}
                  </div>
                  <button
                    onClick={handleSave}
                    className="px-6 py-2 rounded-xl text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-colors"
                  >
                    保存
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-sm text-gray-400">
                请从上方选择一个组合，或添加新组合
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 确认弹窗 */}
      {confirmDialog && confirmDialog.isOpen && (
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={confirmDialog.onCancel}
          confirmText={confirmDialog.title === '确认删除' ? '确认删除' : '确认'}
          cancelText="取消"
          type={confirmDialog.title === '确认删除' ? 'danger' : 'info'}
        />
      )}
    </div>,
    document.body
  );
};

export default ComboTradeModal;