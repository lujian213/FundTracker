import React, { useState, useEffect, useMemo, useRef } from 'react';
import { HistoricalPoint, TradeRecord } from '../types';
import { fetchFundHistory } from '../services/fundService';
import { resolvePreferredPrice, toLocalDateKey } from '../utils/priceResolver';
import { formatDateDisplay } from '../utils/dateFormat';
import useTrades from '../hooks/useTrades';
import { getMatcher, MatchedRecord } from '../utils/tradeMatcher';

type TradeType = 'buy' | 'sell';
type ViewMode = 'normal' | 'fifo' | 'lifo';

export const TradeManager: React.FC<{
  name?: string;
  symbol: string;
  currentPrice: number;
  previousPrice?: number;
  realtimeDate?: string | null;
  netWorthDate?: string | null;
  onClose: () => void;
  zIndex?: number;
  initialPosition?: number;
  initialPrice?: number | null;
  startDate?: string | null;
}> = ({ name, symbol, currentPrice, previousPrice, realtimeDate, netWorthDate, onClose, zIndex = 130, initialPosition = 0, initialPrice = null, startDate = null }) => {
  const { trades, refresh, add, update, remove, setAll, exportJSON, exportCSV } = useTrades(symbol);
  const [page, setPage] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('normal');
  const [history, setHistory] = useState<HistoricalPoint[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 选中状态
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null); // 用于Shift连续选择的锚点
  const tableRef = useRef<HTMLDivElement | null>(null);

  // 是否显示建仓记录
  const hasInitialPosition = initialPosition > 0;

  // 构建包含建仓记录的完整交易列表
  const allRecords = useMemo(() => {
    const records = [...(trades || [])];
    // 添加建仓记录
    if (hasInitialPosition && startDate) {
      records.push({
        id: '__initial__',
        date: startDate,
        type: 'initial' as const,
        shares: initialPosition,
        price: initialPrice ?? 0,
        fee: 0,
        isInitial: true,
      } as any);
    }
    return records;
  }, [trades, hasInitialPosition, startDate, initialPosition, initialPrice]);

  // 使用匹配器处理数据
  const { matchedRecords, matchErrors } = useMemo(() => {
    const matcher = getMatcher(viewMode);
    const result = matcher(allRecords, currentPrice);
    return { matchedRecords: result.records, matchErrors: result.errors };
  }, [viewMode, allRecords, currentPrice]);

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(matchedRecords.length / pageSize));

  useEffect(() => { refresh(); }, [symbol, refresh]);

  // 切换视图时重置到第一页
  useEffect(() => {
    setPage(0);
  }, [viewMode]);

  // 切换视图或页面时清空选中状态
  useEffect(() => {
    setSelectedIds(new Set());
  }, [viewMode, page]);

  // 点击表格外部取消选中
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) {
        setSelectedIds(new Set());
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const points = await fetchFundHistory(symbol);
        // Defer setState to next tick to avoid render-phase updates causing act() warnings in tests
        if (mounted) setTimeout(() => { if (mounted) setHistory(points.slice(-365)); }, 0);
      } catch (e) {
        if (mounted) setTimeout(() => { if (mounted) setHistory([]); }, 0);
      }
    };
    load();
    return () => { mounted = false; };
    }, [symbol]);

  // form state
  const [date, setDate] = useState<string>(() => toLocalDateKey(new Date()));
  const [type, setType] = useState<TradeType>('buy');
  const [shares, setShares] = useState<string>('0'); // editable for sell; computed (readonly) for buy
  const [total, setTotal] = useState<string>('0');   // editable for buy;  computed (readonly) for sell
  const [fee, setFee] = useState<string>('0');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setError(null); }, [date, type, shares, total, fee]);

  // 计算当前页应显示的记录
  const visibleRecords = useMemo(() => {
    return matchedRecords.slice(page * pageSize, (page + 1) * pageSize);
  }, [matchedRecords, page]);

  // 计算合计行数据
  const summary = useMemo(() => {
    let totalShares = 0;

    for (const record of matchedRecords) {
      const isSell = record.type === 'sell';
      const displayShares = record.remainingShares;

      // 数量：买入和建仓为正，卖出为负
      if (isSell) {
        totalShares -= displayShares;
      } else {
        totalShares += displayShares;
      }
    }

    return { totalShares };
  }, [matchedRecords]);

  // 计算选中记录的统计信息（仅买入/建仓记录）
  const selectedStats = useMemo(() => {
    let count = 0;
    let totalShares = 0;

    for (const record of matchedRecords) {
      if (selectedIds.has(record.id)) {
        const isInitial = (record as any).isInitial;
        const isSell = record.type === 'sell';

        // 只统计买入和建仓记录
        if (!isSell) {
          count++;
          totalShares += record.remainingShares;
        }
      }
    }

    // 市场价值 = 数量总和 * 最新估值
    const marketValue = totalShares * currentPrice;

    return { count, totalShares, marketValue };
  }, [matchedRecords, selectedIds, currentPrice]);

  // 选中处理函数
  const handleRowMouseDown = (recordId: string, index: number, e: React.MouseEvent) => {
    // 如果点击的是按钮，不处理选中
    if ((e.target as HTMLElement).closest('button')) return;

    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd+点击：切换选中状态
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(recordId)) {
          newSet.delete(recordId);
        } else {
          newSet.add(recordId);
        }
        return newSet;
      });
      setAnchorIndex(index);
    } else if (e.shiftKey && anchorIndex !== null) {
      // Shift+点击：连续多选（从锚点到当前位置）
      const start = Math.min(anchorIndex, index);
      const end = Math.max(anchorIndex, index);
      const idsToSelect = visibleRecords.slice(start, end + 1).map(r => r.id);
      setSelectedIds(new Set(idsToSelect));
    } else {
      // 普通点击：开始拖拽选择
      setIsDragging(true);
      setDragStartIndex(index);
      setAnchorIndex(index);
      setSelectedIds(new Set([recordId]));
    }
  };

  const handleRowMouseEnter = (recordId: string, index: number) => {
    if (isDragging && dragStartIndex !== null) {
      // 拖拽选择：选中从起点到当前的所有记录
      const start = Math.min(dragStartIndex, index);
      const end = Math.max(dragStartIndex, index);
      const idsToSelect = visibleRecords.slice(start, end + 1).map(r => r.id);
      setSelectedIds(new Set(idsToSelect));
    }
  };

  const handleRowMouseUp = () => {
    setIsDragging(false);
    setDragStartIndex(null);
  };

  // 全局鼠标释放处理
  useEffect(() => {
    const handleMouseUp = () => {
      setIsDragging(false);
      setDragStartIndex(null);
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const todayLocal = useMemo(() => toLocalDateKey(new Date()), []);

  // get price for a given local date string: exact match by local date or nearest previous available (<= end of day)
  const getPriceForDate = (isoDate: string) => {
    const resolved = resolvePreferredPrice({
      targetDate: isoDate,
      todayDate: todayLocal,
      history,
      currentPrice,
      realtimeDate,
      previousPrice,
      netWorthDate,
    });
    return resolved ? resolved.price : 0;
  };

  const addOrUpdateTrade = () => {
    const f = Number(fee);
    if (isNaN(f) || f < 0) { setError('手续费不能为负'); return; }

    const price = getPriceForDate(date);

    // Derive the actual shares to persist:
    // - sell: user inputs shares; total is computed (readonly)
    // - buy:  user inputs total;  shares = (total - fee) / price (readonly, 2dp)
    let s: number;
    if (type === 'sell') {
      s = Number(shares);
      if (!s || s <= 0) { setError('请输入正确的份额（>0）'); return; }
    } else {
      const t = Number(total);
      if (!t || t <= 0) { setError('请输入正确的总额（>0）'); return; }
      if (price <= 0) { setError('价格无效，无法计算份额'); return; }
      s = Number(((t - f) / price).toFixed(2));
      if (s <= 0) { setError('计算所得份额不合理，请检查总额和手续费'); return; }
    }

    if (editingId) {
      update(editingId, { date, type, shares: s, price, fee: f });
      setEditingId(null);
    } else {
      const record: TradeRecord = {
        id: Math.random().toString(36).substr(2, 9),
        date,
        type,
        shares: s,
        price,
        fee: f,
      };
      add(record);
    }

    // reset
    setShares('0'); setTotal('0'); setFee('0'); setPage(0);
  };

  const removeTrade = (id: string) => { remove(id); };

  const startEdit = (t: TradeRecord) => {
    setEditingId(t.id);
    setDate(t.date);
    setType(t.type);
    if (t.type === 'sell') {
      // sell: user edits shares directly
      setShares(String(t.shares));
      setTotal('0');
    } else {
      // buy: user edits total; back-compute from stored shares * price + fee
      const backTotal = Number((t.shares * t.price + (t.fee || 0)).toFixed(2));
      setTotal(String(backTotal));
      setShares('0');
    }
    setFee(String(t.fee));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDate(todayLocal);
    setShares('0'); setTotal('0'); setFee('0'); setError(null);
  };

  // computed display price for the chosen date (live)
  const displayPrice = useMemo(() => getPriceForDate(date), [date, history, currentPrice, previousPrice, realtimeDate, netWorthDate, todayLocal]);

  const onExportJSON = () => {
    const payload = exportJSON();
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `trades_${symbol}.json`; a.click();
  };
  const onExportCSV = () => {
    const payload = exportCSV();
    const blob = new Blob([payload], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `trades_${symbol}.csv`; a.click();
  };

  const handleImportFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        if (Array.isArray(parsed.trades)) {
          // overwrite trades for this symbol
          setAll(parsed.trades);
        }
      } catch (err) {}
    };
    reader.readAsText(file);
  };

  // 表格行固定高度: 42px，间距: 0px，10行总高度 = 10 * 42 = 420px
  const rowHeight = 42;
  const rowGap = 4;
  const tableHeight = pageSize * rowHeight + (pageSize - 1) * rowGap;

  // 数字格式化：千分位 + 小数位
  const formatNumber = (num: number, decimals: number) => {
    return num.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  // 计算盈亏率 (currentPrice - tradePrice) / tradePrice * 100
  const calcProfitRate = (tradePrice: number): number => {
    if (tradePrice <= 0) return 0;
    return ((currentPrice - tradePrice) / tradePrice) * 100;
  };

  // 计算盈亏额 shares * (currentPrice - tradePrice)
  const calcProfitAmount = (shares: number, tradePrice: number): number => {
    return shares * (currentPrice - tradePrice);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex }}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>
      <div className="relative bg-white rounded-2xl w-full max-w-3xl p-6 z-40">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-bold">{name ? `${name}（${symbol}）` : `${symbol} 交易管理`}</h3>
            <p className="text-xs text-gray-400">当前估值：{currentPrice.toFixed(4)}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center"><i className="fas fa-times text-gray-400"></i></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
          <div>
            <label className="text-xs text-gray-500">交易日期</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-2 py-1 border rounded h-8 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500">类型</label>
            <select
              value={type}
              onChange={e => {
                setType(e.target.value as TradeType);
                setShares('0');
                setTotal('0');
              }}
              className="w-full px-2 py-1 border rounded h-8 text-sm"
            >
              <option value="buy">买入</option>
              <option value="sell">卖出</option>
            </select>
          </div>
          <div>
            {type === 'sell' ? (
              <>
                <label className="text-xs text-gray-500">份额</label>
                <input
                  type="number"
                  step="0.01"
                  value={shares}
                  onChange={e => setShares(e.target.value)}
                  className="w-full px-2 py-1 border rounded h-8 text-sm text-right"
                />
              </>
            ) : (
              <>
                <label className="text-xs text-gray-500">份额（只读）</label>
                <input
                  type="text"
                  readOnly
                  value={(() => {
                    const t = Number(total) || 0;
                    const f = Number(fee) || 0;
                    if (displayPrice <= 0) return '--';
                    const s = (t - f) / displayPrice;
                    return s.toFixed(2);
                  })()}
                  className="w-full px-2 py-1 border rounded h-8 text-sm text-right bg-gray-50"
                />
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
          <div>
            <label className="text-xs text-gray-500">价格（只读，按交易日期）</label>
            <input type="text" readOnly value={displayPrice.toFixed(4)} className="w-full px-2 py-1 border rounded h-8 text-sm text-right bg-gray-50" />
          </div>
          <div>
            <label className="text-xs text-gray-500">手续费</label>
            <input type="number" step="0.01" value={fee} onChange={e => setFee(e.target.value)} className="w-full px-2 py-1 border rounded h-8 text-sm text-right" />
          </div>
          <div>
            {type === 'buy' ? (
              <>
                <label className="text-xs text-gray-500">总额</label>
                <input
                  type="number"
                  step="0.01"
                  value={total}
                  onChange={e => setTotal(e.target.value)}
                  className="w-full px-2 py-1 border rounded h-8 text-sm text-right"
                />
              </>
            ) : (
              <>
                <label className="text-xs text-gray-500">总额（只读）</label>
                <input
                  type="text"
                  readOnly
                  value={(() => {
                    const s = Number(shares) || 0;
                    const f = Number(fee) || 0;
                    return (displayPrice * s - f).toFixed(2);
                  })()}
                  className="w-full px-2 py-1 border rounded h-8 text-sm text-right bg-gray-50"
                />
              </>
            )}
          </div>
        </div>

        {error && <div className="text-xs text-red-600 mt-2">{error}</div>}

        <div className="flex justify-between mt-2 items-center">
          <div className="flex items-center space-x-2">
            <button onClick={onExportJSON} className="px-3 py-1 rounded bg-gray-100 text-xs">导出 JSON</button>
            <button onClick={onExportCSV} className="px-3 py-1 rounded bg-gray-100 text-xs">导出 CSV</button>
            <input ref={fileInputRef} type="file" accept=".json" onChange={e => handleImportFile(e.target.files?.[0] ?? null)} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1 rounded bg-gray-100 text-xs">导入 JSON</button>
          </div>
          <div className="flex items-center space-x-2">
           {editingId ? (
             <>
               <button onClick={cancelEdit} className="px-3 py-1 rounded bg-gray-100 text-sm">取消</button>
               <button onClick={addOrUpdateTrade} className="px-3 py-1 rounded bg-emerald-500 text-white text-sm">更新</button>
             </>
           ) : (
             <button onClick={addOrUpdateTrade} className="px-3 py-1 rounded bg-emerald-500 text-white text-sm">添加交易</button>
           )}
          </div>
         </div>

        <hr className="my-2" />

        <div>
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-sm font-bold">交易记录（最近在上）</h4>
            <div className="flex items-center space-x-3 text-xs">
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="viewMode"
                  value="normal"
                  checked={viewMode === 'normal'}
                  onChange={() => setViewMode('normal')}
                  className="mr-1"
                />
                普通视图
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="viewMode"
                  value="fifo"
                  checked={viewMode === 'fifo'}
                  onChange={() => setViewMode('fifo')}
                  className="mr-1"
                />
                先进先出
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="viewMode"
                  value="lifo"
                  checked={viewMode === 'lifo'}
                  onChange={() => setViewMode('lifo')}
                  className="mr-1"
                />
                后进先出
              </label>
            </div>
          </div>
          {/* 表头 */}
          <div className="flex items-center px-2 py-2 bg-gray-100 rounded text-xs font-medium text-gray-600 mb-2">
            <div className="w-[12%] text-left">日期</div>
            <div className="w-[8%] text-left">操作</div>
            <div className="w-[12%] text-right">数量</div>
            <div className="w-[10%] text-right">价格</div>
            <div className="w-[14%] text-right">交易额</div>
            <div className="w-[10%] text-right">手续费</div>
            <div className="w-[12%] text-right">盈亏率</div>
            <div className="w-[14%] text-right">盈亏额</div>
            <div className="w-[8%] text-right"></div>
          </div>
          <div style={{ height: tableHeight }} className="relative" ref={tableRef}>
            {matchedRecords.length === 0 ? (
              <>
                {/* 空状态：10行空白 + 中央提示 */}
                {Array.from({ length: pageSize }).map((_, i) => (
                  <div key={`empty-${i}`} style={{ height: rowHeight, marginTop: i === 0 ? 0 : rowGap }} className="border border-transparent" />
                ))}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <p className="text-xs text-gray-400">暂无交易记录</p>
                </div>
              </>
            ) : (
              <div className="flex flex-col justify-start" style={{ height: tableHeight }}>
                {visibleRecords.map((t, index) => {
                  const isInitial = (t as any).isInitial;
                  const isSell = t.type === 'sell';
                  const isError = t.isError;
                  const isSelected = selectedIds.has(t.id);

                  // 使用 remainingShares 和 remainingFee
                  const displayShares = t.remainingShares;
                  const displayFee = t.remainingFee;
                  const tradeAmount = isSell
                    ? t.price * displayShares - displayFee
                    : t.price * displayShares + displayFee;

                  // 盈亏计算：买入和建仓计算盈亏，卖出显示"-"
                  const profitRate = isSell ? 0 : calcProfitRate(t.price);
                  const profitAmount = isSell ? 0 : displayShares * (currentPrice - t.price);

                  return (
                    <div
                      key={t.id}
                      style={{ height: rowHeight, marginTop: index === 0 ? 0 : rowGap }}
                      className={`flex items-center px-2 py-1.5 border rounded cursor-pointer select-none ${
                        isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''
                      } ${
                        isError ? 'bg-orange-50 border-orange-400' :
                        isInitial ? 'bg-blue-50 border-blue-200' :
                        (t.type === 'buy' ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100')
                      }`}
                      onMouseDown={(e) => handleRowMouseDown(t.id, index, e)}
                      onMouseEnter={() => handleRowMouseEnter(t.id, index)}
                      onMouseUp={handleRowMouseUp}
                    >
                      <div className="w-[12%] text-left text-xs truncate">{formatDateDisplay(t.date)}</div>
                      <div className={`w-[8%] text-left text-xs ${isInitial ? 'text-blue-500' : 'text-gray-500'}`}>
                        {isInitial ? '建仓' : (t.type === 'buy' ? '买入' : '卖出')}
                      </div>
                      <div className="w-[12%] text-right text-xs">{formatNumber(displayShares, 2)}</div>
                      <div className="w-[10%] text-right text-xs">{t.price.toFixed(4)}</div>
                      <div className="w-[14%] text-right text-xs font-medium">{formatNumber(tradeAmount, 2)}</div>
                      <div className="w-[10%] text-right text-xs">{displayFee === 0 ? '-' : formatNumber(displayFee, 2)}</div>
                      <div className={`w-[12%] text-right text-xs ${profitRate > 0 ? 'text-red-500' : profitRate < 0 ? 'text-green-500' : ''}`}>
                        {profitRate === 0 ? '-' : `${profitRate > 0 ? '+' : ''}${profitRate.toFixed(2)}%`}
                      </div>
                      <div className={`w-[14%] text-right text-xs ${profitAmount > 0 ? 'text-red-500' : profitAmount < 0 ? 'text-green-500' : ''}`}>
                        {profitAmount === 0 ? '-' : `${profitAmount > 0 ? '+' : '-'}${formatNumber(Math.abs(profitAmount), 2)}`}
                      </div>
                      <div className="w-[8%] text-right text-xs">
                        {isInitial || viewMode !== 'normal' ? (
                          <span className="text-gray-400">-</span>
                        ) : (
                          <span className="space-x-2">
                            <button onClick={() => startEdit(t as TradeRecord)} className="text-blue-500 hover:text-blue-600" title="编辑">
                              <i className="fas fa-edit"></i>
                            </button>
                            <button onClick={() => removeTrade(t.id)} className="text-red-500 hover:text-red-600" title="删除">
                              <i className="fas fa-trash-alt"></i>
                            </button>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 合计行 */}
          {matchedRecords.length > 0 && (
            <div className="flex items-center px-2 py-1 border rounded bg-gray-100 mt-2">
              <div className="w-[12%] text-left text-xs font-medium">合计</div>
              <div className="w-[8%] text-left text-xs text-gray-400">-</div>
              <div className="w-[12%] text-right text-xs font-medium">
                {formatNumber(Math.abs(summary.totalShares), 2)}
              </div>
              <div className="w-[10%] text-right text-xs text-gray-400">-</div>
              <div className="w-[14%] text-right text-xs text-gray-400">-</div>
              <div className="w-[10%] text-right text-xs text-gray-400">-</div>
              <div className="w-[12%] text-right text-xs text-gray-400">-</div>
              <div className="w-[14%] text-right text-xs text-gray-400">-</div>
              <div className="w-[8%] text-right text-xs text-gray-400">-</div>
            </div>
          )}

          <div className="flex justify-between items-center mt-2">
            <div className="text-xs text-gray-400">共 {matchedRecords.length} 条记录  第 {page + 1} / {pageCount} 页</div>
            <div className="text-xs text-center flex-1 mx-4 truncate">
              {selectedStats.count > 0 ? (
                <span className="text-black">已选中 {selectedStats.count} 条买入/建仓记录，数量合计 {formatNumber(selectedStats.totalShares, 2)}，市场价值约 {formatNumber(selectedStats.marketValue, 2)}</span>
              ) : matchErrors.length > 0 ? (
                <span className="text-red-500">{matchErrors.join('; ')}</span>
              ) : null}
            </div>
            <div className="space-x-2">
              <button disabled={page <= 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="px-2 py-1 rounded bg-gray-100 text-sm disabled:opacity-50 disabled:cursor-not-allowed">上一页</button>
              <button disabled={page >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} className="px-2 py-1 rounded bg-gray-100 text-sm disabled:opacity-50 disabled:cursor-not-allowed">下一页</button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default TradeManager;