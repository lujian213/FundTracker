import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { DayPicker } from 'react-day-picker';
import { zhCN } from 'date-fns/locale';
import { Ticker, ValuationData, TradeType, ComboTrade } from '../types';
import { addTradeForSymbol, readAll } from '../hooks/useTrades';
import { resolvePreferredPrice, toLocalDateKey } from '../utils/priceResolver';
import { getHistory } from '../services/marketFundService';
import { ConfirmDialog } from './ConfirmDialog';
import { loadComboTradesFromStorage } from '../utils/comboTradeService';
import * as marketFundService from '../services/marketFundService';
import { FeeInput } from './FeeInput';

interface Props {
  onClose: () => void;
  onSaved: () => void;
  // 可选：传入当前投资组合和估值数据，用于获取基金名称和当前价格
  portfolio?: Ticker[];
  marketData?: Record<string, ValuationData>;
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

// 获取前一个交易日（跳过周末）
function getPreviousTradingDay(): string {
  const today = new Date();
  const dayOfWeek = today.getDay();
  let daysToSubtract = 1;

  if (dayOfWeek === 0) { // 周日
    daysToSubtract = 2;
  } else if (dayOfWeek === 1) { // 周一
    daysToSubtract = 3;
  }

  const prevDate = new Date(today);
  prevDate.setDate(today.getDate() - daysToSubtract);
  return toLocalDateStr(prevDate);
}

// 生成唯一ID
function generateId(): string {
  return `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// 计算交易总额
function calculateTotal(type: TradeType, shares: number, price: number, fee: number): number {
  return type === 'buy'
    ? Number((shares * price + fee).toFixed(2))
    : Number((shares * price - fee).toFixed(2));
}

// 根据总额计算份额（保留2位小数）
function calculateShares(type: TradeType, total: number, price: number, fee: number): number {
  if (price <= 0) return 0;
  return type === 'buy'
    ? Number(((total - fee) / price).toFixed(2))
    : Number(((total + fee) / price).toFixed(2));
}

// 单条交易输入行
interface TradeRowInput {
  id: string;
  type: TradeType;
  price: number;
  shares: number;
  fee: number;
  total: number;
}

// 单个基金的分组数据
interface FundGroup {
  symbol: string;
  name: string;
  fullCapacity: number;
  price: number; // 当前日期的交易价格
  rows: TradeRowInput[];
}

const TradeBatchInputModal: React.FC<Props> = ({ onClose, onSaved, portfolio = [], marketData = {} }) => {
  const [selectedDateStr, setSelectedDateStr] = useState<string>(getPreviousTradingDay());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState<Date>(parseLocalDate(getPreviousTradingDay()));
  const [fundGroups, setFundGroups] = useState<FundGroup[]>([]);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [errorFieldIds, setErrorFieldIds] = useState<Set<string>>(new Set());

  // 组合交易相关状态
  const [comboTrades, setComboTrades] = useState<ComboTrade[]>([]);

  // 标记是否已初始化
  const [initialized, setInitialized] = useState(false);

  // 获取所有有持仓的基金（fullCapacity > 0）- 只在初始化时运行一次
  useEffect(() => {
    if (initialized) return; // 只初始化一次

    const groups: FundGroup[] = [];

    // 使用 marketFundService 获取所有基金信息
    const fundInfos = marketFundService.getAllFundInfos();
    for (const info of fundInfos) {
      if (info.position && info.position.fullCapacity > 0) {
        const symbol = info.ticker.symbol;
        // 尝试获取基金名称（优先使用传入的props，否则使用 ticker 名称）
        const name =
          (marketData[symbol]?.name) ||
          (portfolio.find(p => p.symbol === symbol)?.name) ||
          info.ticker.name ||
          symbol;

        groups.push({
          symbol,
          name,
          fullCapacity: info.position.fullCapacity,
          price: 0, // 稍后获取
          rows: [], // 初始为空，用户可以添加行
        });
      }
    }

    // 按基金名称排序
    groups.sort((a, b) => a.name.localeCompare(b.name));
    setFundGroups(groups);

    // 加载组合交易数据（使用公共函数）
    const list = loadComboTradesFromStorage();
    setComboTrades(list);

    setInitialized(true);
  }, []); // 空依赖，只在初始化时运行一次

  // 当 marketData 或 portfolio 变化时，更新基金名称（如果有更好的名称）
  useEffect(() => {
    if (!initialized) return; // 等待初始化完成

    setFundGroups(prevGroups => {
      let hasUpdates = false;
      const newGroups = prevGroups.map(group => {
        const newName =
          (marketData[group.symbol]?.name) ||
          (portfolio.find(p => p.symbol === group.symbol)?.name) ||
          group.name;
        if (newName !== group.name) {
          hasUpdates = true;
          return { ...group, name: newName };
        }
        return group;
      });
      return hasUpdates ? newGroups : prevGroups;
    });
  }, [marketData, portfolio, initialized]);

  // 是否可以选择的日期（不能选未来的日期，且最好选有交易的日期）
  const isDateSelectable = (date: Date): boolean => {
    const str = toLocalDateStr(date);
    const today = toLocalDateStr(new Date());
    return str <= today;
  };

  // 获取指定日期的价格
  const getPriceForDate = async (symbol: string, targetDate: string): Promise<number | null> => {
    const history = getHistory(symbol);
    const valuation = marketData[symbol];

    const input = {
      targetDate,
      todayDate: toLocalDateStr(new Date()),
      history: history || [],
      currentPrice: valuation?.currentPrice || null,
      realtimeDate: valuation?.realtimeDate || null,
      previousPrice: valuation?.previousPrice || null,
      netWorthDate: valuation?.netWorthDate || null,
    };

    const resolved = resolvePreferredPrice(input);
    return resolved?.price ?? null;
  };

  // 处理日期选择 - 切换日期时重置表格并获取价格
  const handleDaySelect = (day: Date | undefined) => {
    if (!day) return;
    const str = toLocalDateStr(day);
    if (isDateSelectable(day)) {
      setSelectedDateStr(str);
      setPickerOpen(false);
    }
  };

  // 当日期变化时，获取价格并重置表格为初始状态
  useEffect(() => {
    if (!selectedDateStr || !initialized || fundGroups.length === 0) return;

    const updatePrices = async () => {
      // 并行获取所有基金的价格
      const prices = await Promise.all(
        fundGroups.map(g => getPriceForDate(g.symbol, selectedDateStr))
      );

      // 更新每个分组的 price 并重置 rows
      const newGroups = fundGroups.map((group, index) => ({
        ...group,
        price: prices[index] || 0,
        rows: [], // 初始为空
      }));
      setFundGroups(newGroups);
    };

    updatePrices();
  }, [selectedDateStr, initialized]);

  // 为基金分组添加新行
  const addRow = (groupIndex: number) => {
    const newGroups = [...fundGroups];
    const group = newGroups[groupIndex];

    // 使用 group's 当前价格
    const price = group.price || 0;

    group.rows.push({
      id: generateId(),
      type: 'buy',
      price,
      shares: 0,
      fee: 0,
      total: 0,
    });
    setFundGroups(newGroups);
  };

  // 删除某一行
  const removeRow = (groupIndex: number, rowId: string) => {
    const newGroups = [...fundGroups];
    const group = newGroups[groupIndex];
    group.rows = group.rows.filter(r => r.id !== rowId);
    // 如果没有行了，就不添加空行（让用户手动添加）
    setFundGroups(newGroups);
  };

  // 应用组合交易 - 根据组合交易中的记录自动填充交易行
  const applyComboTrade = (combo: ComboTrade) => {
    const newGroups = [...fundGroups];

    // 遍历组合交易中的每条记录
    for (const record of combo.records) {
      // 找到对应的基金分组
      const groupIndex = newGroups.findIndex(g => g.symbol === record.fundId);
      if (groupIndex === -1) continue; // 如果找不到对应的基金，跳过

      const group = newGroups[groupIndex];
      const price = group.price || 0;

      if (price <= 0) continue; // 如果价格无效，跳过

      // 添加新行
      group.rows.push({
        id: generateId(),
        type: 'buy', // 默认为买入
        price,
        shares: 0,
        fee: record.fee, // 设置手续费
        total: record.amount, // 设置总额（会触发 shares 计算）
      });

      // 获取刚添加的行，触发自动计算
      const newRow = group.rows[group.rows.length - 1];
      // 买入时：根据总额和手续费计算份额
      newRow.shares = calculateShares(newRow.type, newRow.total, newRow.price, newRow.fee);
    }

    setFundGroups(newGroups);
  };

  // 更新行的数据
  const updateRow = (groupIndex: number, rowId: string, field: keyof TradeRowInput, value: string | number) => {
    const newGroups = [...fundGroups];
    const group = newGroups[groupIndex];
    const row = group.rows.find(r => r.id === rowId);
    if (!row) return;

    // 清除相关字段的错误状态
    const rowIndex = group.rows.findIndex(r => r.id === rowId);
    const rowIdStr = `${groupIndex}-${rowIndex}`;
    setErrorFieldIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(`type-${rowIdStr}`);
      newSet.delete(`price-${rowIdStr}`);
      newSet.delete(`shares-${rowIdStr}`);
      newSet.delete(`fee-${rowIdStr}`);
      newSet.delete(`total-${rowIdStr}`);
      return newSet;
    });
    setErrors([]);

    if (field === 'type') {
      row.type = value as TradeType;
      // 切换类型时重置份额和总额
      row.shares = 0;
      row.total = 0;
    } else if (field === 'shares') {
      const num = Math.max(0, parseFloat(value as string) || 0);
      row.shares = num;
      row.total = calculateTotal(row.type, row.shares, row.price, row.fee);
    } else if (field === 'fee') {
      const num = Math.max(0, parseFloat(value as string) || 0);
      row.fee = num;
      // 手续费变化时：
      // 买入：如果总额不为空，根据总额和手续费重新计算份额
      // 卖出：如果份额不为空，根据份额和手续费重新计算总额
      if (row.type === 'buy') {
        if (row.total > 0) {
          row.shares = calculateShares(row.type, row.total, row.price, row.fee);
        }
      } else {
        // 卖出
        if (row.shares > 0) {
          row.total = calculateTotal(row.type, row.shares, row.price, row.fee);
        }
      }
    } else if (field === 'total') {
      const num = Math.max(0, parseFloat(value as string) || 0);
      row.total = num;
      row.shares = calculateShares(row.type, row.total, row.price, row.fee);
    }

    setFundGroups(newGroups);
  };

  // 计算总计
  const totals = useMemo(() => {
    let buyCount = 0;
    let sellCount = 0;
    let buyTotal = 0;
    let sellTotal = 0;
    let totalFee = 0;

    for (const group of fundGroups) {
      for (const row of group.rows) {
        if (row.shares <= 0 && row.total <= 0) continue; // 忽略空行

        if (row.type === 'buy') {
          buyCount++;
          buyTotal += row.total;
        } else {
          sellCount++;
          sellTotal += row.total;
        }
        totalFee += row.fee;
      }
    }

    return { buyCount, sellCount, buyTotal, sellTotal, totalFee };
  }, [fundGroups]);

  // 检查是否有未保存的数据
  const hasUnsavedData = useMemo(() => {
    for (const group of fundGroups) {
      for (const row of group.rows) {
        if (row.shares > 0 || row.total > 0) return true;
      }
    }
    return false;
  }, [fundGroups]);

  // 缓存持仓数据，避免重复读取
  const positionCache = useMemo(() => {
    const cache: Record<string, number> = {};
    for (const group of fundGroups) {
      try {
        const pos = marketFundService.getPosition(group.symbol);
        cache[group.symbol] = pos?.fullCapacity || 0;
      } catch (e) {
        cache[group.symbol] = 0;
      }
    }
    return cache;
  }, [fundGroups]);

  // 校验并保存
  const handleSave = (): { success: boolean; errors: string[]; errorFieldIds: Set<string> } => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const errorFieldIds = new Set<string>();

    // 先进行数据校验
    for (let groupIndex = 0; groupIndex < fundGroups.length; groupIndex++) {
      const group = fundGroups[groupIndex];
      for (let rowIndex = 0; rowIndex < group.rows.length; rowIndex++) {
        const row = group.rows[rowIndex];
        const rowId = `${groupIndex}-${rowIndex}`;

        // 交易类型检查 - 必须有值（买入或卖出）
        if (!row.type) {
          errors.push(`${group.name}: 请选择交易类型`);
          errorFieldIds.add(`type-${rowId}`);
        }

        // 交易价格检查 - 必须有值且大于0
        if (!row.price || row.price <= 0) {
          errors.push(`${group.name}: 交易价格必须为正数`);
          errorFieldIds.add(`price-${rowId}`);
        }

        // 份额检查 - 必须大于0（不管是用户输入还是自动计算）
        if (row.shares <= 0) {
          errors.push(`${group.name}: 基金份额必须为正数`);
          errorFieldIds.add(`shares-${rowId}`);
        }

        // 手续费检查 - 必须为非负数字（空白当成0处理）
        const feeValue = row.fee || 0;
        if (feeValue < 0) {
          errors.push(`${group.name}: 手续费不能为负数`);
          errorFieldIds.add(`fee-${rowId}`);
        }

        // 总额检查 - 必须大于0（不管是用户输入还是自动计算）
        if (row.total <= 0) {
          errors.push(`${group.name}: 交易总额必须为正数`);
          errorFieldIds.add(`total-${rowId}`);
        }

        // 卖出超额检查（宽松模式）
        if (row.type === 'sell') {
          const currentShares = positionCache[group.symbol] || 0;
          if (row.shares > currentShares) {
            warnings.push(`${group.name}: 卖出份额(${row.shares})超过当前持仓份额(${currentShares})，显示警告提示`);
          }
        }
      }
    }

    // 如果有错误，不保存
    if (errors.length > 0) {
      return { success: false, errors, errorFieldIds };
    }

    // 保存数据
    try {
      for (const group of fundGroups) {
        for (const row of group.rows) {
          if (row.shares <= 0 && row.total <= 0) continue; // 跳过空行

          const tradeRecord = {
            id: row.id,
            date: selectedDateStr,
            type: row.type,
            shares: row.shares,
            price: row.price,
            fee: row.fee,
          };

          addTradeForSymbol(group.symbol, tradeRecord);
        }
      }

      // 刷新并关闭
      onSaved();
      onClose();

      // 如果有警告，显示给用户（这里可以扩展为显示警告弹窗）
      if (warnings.length > 0) {
        console.warn('警告:', warnings);
      }

      return { success: true, errors: warnings, errorFieldIds: new Set<string>() };
    } catch (e) {
      errors.push('保存失败，请重试');
      return { success: false, errors, errorFieldIds };
    }
  };

  // 尝试关闭
  const handleClose = () => {
    if (hasUnsavedData) {
      setShowConfirmClose(true);
    } else {
      onClose();
    }
  };

  const content = (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
      <div
        className="relative bg-white rounded-2xl w-full max-w-4xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col"
        style={{ maxHeight: '90vh' }}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
          <h3 className="text-lg font-bold">批量交易录入</h3>
          <button
            aria-label="关闭"
            className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100"
            onClick={handleClose}
          >
            <i className="fas fa-times" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-hidden" style={{ minHeight: '500px' }}>
          {/* Date picker */}
          <div className="mb-4 relative flex items-center gap-3">
            <span className="text-sm text-gray-600">交易日期：</span>
            <button
              onClick={() => setPickerOpen(o => !o)}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:border-blue-400 shadow-sm transition-colors"
            >
              <i className="far fa-calendar-alt text-blue-500" />
              <span>{selectedDateStr}</span>
              <i className={`fas fa-chevron-down text-xs text-gray-400 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
            </button>

            {pickerOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
                <div className="absolute left-0 top-full mt-2 z-20 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2">
                  <DayPicker
                    mode="single"
                    locale={zhCN}
                    month={pickerMonth}
                    onMonthChange={setPickerMonth}
                    selected={parseLocalDate(selectedDateStr)}
                    onSelect={handleDaySelect}
                    disabled={(day) => !isDateSelectable(day)}
                    styles={{
                      day: { borderRadius: '8px' },
                    }}
                  />
                </div>
              </>
            )}
          </div>

          {/* 组合交易面板 - 始终展开 */}
          {comboTrades.length > 0 && (
            <div className="mb-4 border border-gray-100 rounded-xl overflow-hidden">
              {/* 面板标题 */}
              <div className="px-4 py-2 bg-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-700">组合交易</span>
                  <span className="text-xs text-gray-400">({comboTrades.length}个)</span>
                </div>
              </div>

              {/* 面板内容 */}
              <div className="p-3 bg-white">
                <div className="flex flex-wrap gap-2">
                  {comboTrades.map(combo => (
                    <button
                      key={combo.id}
                      onClick={() => applyComboTrade(combo)}
                      className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                      title={`点击应用组合交易"${combo.name}"`}
                    >
                      <i className="fas fa-layer-group mr-1.5" />
                      {combo.name}
                    </button>
                  ))}
                </div>
                <div className="mt-2 text-xs text-gray-400">
                  点击组合交易名称自动填充对应基金的交易记录
                </div>
              </div>
            </div>
          )}

          {/* Fund groups table */}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="overflow-y-auto" style={{ maxHeight: '400px' }}>
              {fundGroups.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-400">
                  暂无持仓基金，请先添加基金并设置满仓份额
                </div>
              ) : (
                <table className="w-full text-sm table-fixed border-collapse">
                  <colgroup>
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '10%' }} />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-gray-50">
                    <tr className="border-b border-gray-200">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">基金</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">类型</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">交易价格</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">基金份额</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">手续费</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">总额</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fundGroups.map((group, groupIndex) => (
                      <React.Fragment key={group.symbol}>
                        {/* 分组标题行 */}
                        <tr className="border-b border-gray-200 bg-blue-50">
                          <td colSpan={7} className="px-3 py-2">
                            <div className="flex justify-between items-center w-full text-xs font-semibold text-blue-700">
                              <span>{group.name}</span>
                              <button
                                onClick={() => addRow(groupIndex)}
                                className="inline-flex items-center px-2 py-0.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                              >
                                <i className="fas fa-plus mr-1" /> 添加记录
                              </button>
                            </div>
                          </td>
                        </tr>
                        {/* 交易记录行 */}
                        {group.rows.map((row, rowIndex) => {
                          const rowId = `${groupIndex}-${rowIndex}`;
                          const hasRowError = errorFieldIds.has(`type-${rowId}`) ||
                            errorFieldIds.has(`price-${rowId}`) ||
                            errorFieldIds.has(`shares-${rowId}`) ||
                            errorFieldIds.has(`fee-${rowId}`) ||
                            errorFieldIds.has(`total-${rowId}`);
                          return (
                          <tr key={row.id} className={`border-b transition-colors ${hasRowError ? 'bg-red-50' : 'border-gray-50 hover:bg-gray-50'}`}>
                            <td className="px-3 py-2 text-left text-xs text-gray-500">
                              第 {rowIndex + 1} 条
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={row.type}
                                onChange={(e) => updateRow(groupIndex, row.id, 'type', e.target.value)}
                                className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                              >
                                <option value="buy">买入</option>
                                <option value="sell">卖出</option>
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.0001"
                                value={row.price}
                                readOnly
                                className="w-full text-right text-xs border border-gray-100 rounded px-2 py-1 bg-gray-50 text-gray-500 [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={row.shares === undefined ? '' : (row.shares > 0 ? Number(row.shares.toFixed(2)) : '')}
                                readOnly={row.type === 'buy'}
                                onChange={(e) => updateRow(groupIndex, row.id, 'shares', e.target.value)}
                                placeholder={row.type === 'buy' ? '自动计算' : '输入份额'}
                                className={`w-full text-right text-xs border rounded px-2 py-1 [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${row.type === 'buy' ? 'border-gray-100 bg-gray-50 text-gray-500' : 'border-gray-200'}`}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <FeeInput
                                symbol={group.symbol}
                                type={row.type}
                                currentDate={selectedDateStr}
                                price={row.price}
                                total={row.type === 'buy' ? row.total : undefined}
                                shares={row.type === 'sell' ? row.shares : undefined}
                                value={row.fee}
                                onChange={(newFee) => updateRow(groupIndex, row.id, 'fee', newFee)}
                                compact={true}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={row.total === undefined ? '' : row.total}
                                readOnly={row.type === 'sell'}
                                onChange={(e) => updateRow(groupIndex, row.id, 'total', e.target.value)}
                                placeholder={row.type === 'sell' ? '自动计算' : '输入总额'}
                                className={`w-full text-right text-xs border rounded px-2 py-1 [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${row.type === 'sell' ? 'border-gray-100 bg-gray-50 text-gray-500' : 'border-gray-200'}`}
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button
                                onClick={() => removeRow(groupIndex, row.id)}
                                className="text-red-400 hover:text-red-600 p-1"
                                title="删除"
                              >
                                <i className="fas fa-trash-alt" />
                              </button>
                            </td>
                          </tr>
                        );})}
                      </React.Fragment>
                    ))}
                  </tbody>
                  {/* 总计行 */}
                  <tfoot className="sticky bottom-0 z-10 bg-gray-50">
                    <tr className="border-t border-gray-200">
                      <td colSpan={7} className="px-3 py-3 text-xs text-gray-700">
                        <div className="flex justify-between">
                          <span>
                            总计：买入 <span className="font-bold text-green-600">{totals.buyCount}</span> 条，
                            卖出 <span className="font-bold text-red-500">{totals.sellCount}</span> 条
                          </span>
                          <span className="space-x-4">
                            <span>买入总额：<span className="font-bold text-green-600">{totals.buyTotal.toFixed(2)}</span></span>
                            <span>卖出总额：<span className="font-bold text-red-500">{totals.sellTotal.toFixed(2)}</span></span>
                            <span>手续费：<span className="font-bold">{totals.totalFee.toFixed(2)}</span></span>
                          </span>
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>

          {/* 保存按钮 */}
          {/* 错误信息和保存按钮在同一行，保存按钮位置固定 */}
          <div className="mt-4 flex items-center gap-4">
            <div className={`flex-1 p-3 rounded-lg border transition-all min-h-[44px] flex items-center ${errors.length > 0 ? 'bg-red-50 border-red-200' : 'border-transparent'}`}>
              {errors.length > 0 && (
                <div className="text-sm text-red-600">输入信息有误，请修正显示红色的交易记录后再保存。</div>
              )}
            </div>

            <button
              onClick={() => {
                const result = handleSave();
                if (!result.success) {
                  setErrors(result.errors);
                  setErrorFieldIds(result.errorFieldIds);
                } else {
                  setErrors([]);
                  setErrorFieldIds(new Set());
                }
              }}
              disabled={fundGroups.length === 0}
              className={`px-6 py-2 rounded-xl text-sm font-medium transition-colors ${
                fundGroups.length === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
              }`}
            >
              保存
            </button>
          </div>
        </div>
      </div>

      {/* 关闭确认弹窗 */}
      {showConfirmClose && (
        <ConfirmDialog
          isOpen={showConfirmClose}
          title="确认关闭"
          message="当前输入的数据尚未保存，确定要关闭吗？"
          confirmText="确认关闭"
          cancelText="取消"
          onConfirm={() => {
            setShowConfirmClose(false);
            onClose();
          }}
          onCancel={() => setShowConfirmClose(false)}
        />
      )}
    </div>
  );

  return createPortal(content, document.body);
};

export default TradeBatchInputModal;