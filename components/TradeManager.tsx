import React, { useState, useEffect, useMemo, useRef } from 'react';
import { HistoricalPoint } from '../types';
import { fetchFundHistory } from '../services/fundService';
import useTrades, { TradeRecord } from '../hooks/useTrades';

type TradeType = 'buy' | 'sell';

export const TradeManager: React.FC<{ name?: string; symbol: string; currentPrice: number; onClose: () => void; }> = ({ name, symbol, currentPrice, onClose }) => {
  const { trades, refresh, add, update, remove, setAll, exportJSON, exportCSV } = useTrades(symbol);
  const [page, setPage] = useState(0);
  const [history, setHistory] = useState<HistoricalPoint[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const localTrades = [...(trades || [])];
  // sort by date desc
  localTrades.sort((a,b) => (new Date(b.date).getTime()) - (new Date(a.date).getTime()));

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(localTrades.length / pageSize));

  useEffect(() => { refresh(); }, [symbol, refresh]);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const points = await fetchFundHistory(symbol);
        if (mounted) setHistory(points.slice(-365));
      } catch (e) {
        if (mounted) setHistory([]);
      }
    };
    load();
    return () => { mounted = false; };
  }, [symbol]);

  // form state
  const [date, setDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [type, setType] = useState<TradeType>('buy');
  const [shares, setShares] = useState<string>('0'); // editable for sell; computed (readonly) for buy
  const [total, setTotal] = useState<string>('0');   // editable for buy;  computed (readonly) for sell
  const [fee, setFee] = useState<string>('0');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setError(null); }, [date, type, shares, total, fee]);

  const visibleTrades = useMemo(() => localTrades.slice(page * pageSize, (page + 1) * pageSize), [localTrades, page]);

  // helper: get local date string YYYY-MM-DD from timestamp
  const localDateKey = (ts: number) => {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // get price for a given local date string: exact match by local date or nearest previous available (<= end of day)
  const getPriceForDate = (isoDate: string) => {
    if (!history || history.length === 0) return currentPrice;
    // exact match by local date
    const exact = history.find(h => localDateKey(h.date) === isoDate);
    if (exact) return exact.value;
    // else compute end of day timestamp for isoDate (local)
    const end = new Date(isoDate);
    end.setHours(23, 59, 59, 999);
    const endTs = end.getTime();
    const prev = [...history].filter(h => h.date <= endTs).sort((a,b) => b.date - a.date)[0];
    if (prev) return prev.value;
    // fallback to earliest available
    const first = history[0];
    return first ? first.value : currentPrice;
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
    setDate(new Date().toISOString().split('T')[0]);
    setShares('0'); setTotal('0'); setFee('0'); setError(null);
  };

  // computed display price for the chosen date (live)
  const displayPrice = useMemo(() => getPriceForDate(date), [date, history]);

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

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>
      <div className="relative bg-white rounded-2xl w-full max-w-2xl p-6 z-40">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-bold">{name ? `${name}（${symbol}）` : `${symbol} 交易管理`}</h3>
            <p className="text-xs text-gray-400">当前净值：{currentPrice.toFixed(4)}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center"><i className="fas fa-times text-gray-400"></i></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="text-xs text-gray-500">交易日期</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-2 py-1 border rounded" />
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
              className="w-full px-2 py-1 border rounded"
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
                  className="w-full px-2 py-1 border rounded text-right"
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
                  className="w-full px-2 py-1 border rounded text-right bg-gray-50"
                />
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="text-xs text-gray-500">价格（只读，按交易日期）</label>
            <input type="text" readOnly value={displayPrice.toFixed(4)} className="w-full px-2 py-1 border rounded text-right bg-gray-50" />
          </div>
          <div>
            <label className="text-xs text-gray-500">手续费</label>
            <input type="number" step="0.01" value={fee} onChange={e => setFee(e.target.value)} className="w-full px-2 py-1 border rounded text-right" />
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
                  className="w-full px-2 py-1 border rounded text-right"
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
                  className="w-full px-2 py-1 border rounded text-right bg-gray-50"
                />
              </>
            )}
          </div>
        </div>

        {error && <div className="text-xs text-red-600 mt-2">{error}</div>}

        <div className="flex justify-between mt-4 items-center">
          <div className="flex items-center space-x-2">
            <button onClick={onExportJSON} className="px-3 py-1 rounded bg-gray-100 text-xs">导出 JSON</button>
            <button onClick={onExportCSV} className="px-3 py-1 rounded bg-gray-100 text-xs">导出 CSV</button>
            <input ref={fileInputRef} type="file" accept=".json" onChange={e => handleImportFile(e.target.files?.[0] ?? null)} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1 rounded bg-gray-100 text-xs">导入 JSON</button>
          </div>
          <div className="flex items-center space-x-2">
           {editingId ? (
             <>
               <button onClick={cancelEdit} className="px-3 py-1 rounded bg-gray-100">取消</button>
               <button onClick={addOrUpdateTrade} className="px-3 py-1 rounded bg-emerald-500 text-white">更新</button>
             </>
           ) : (
             <button onClick={addOrUpdateTrade} className="px-3 py-1 rounded bg-emerald-500 text-white">添加交易</button>
           )}
          </div>
         </div>

        <hr className="my-4" />

        <div>
          <h4 className="text-sm font-bold mb-2">交易记录（最近在上）</h4>
          {trades.length === 0 ? (
            <p className="text-xs text-gray-400">暂无交易记录</p>
          ) : (
            <div className="space-y-2">
              {visibleTrades.map(t => {
                const computed = t.type === 'sell' ? t.price * t.shares - (t.fee || 0) : t.price * t.shares + (t.fee || 0);
                return (
                  <div key={t.id} className={`flex items-start justify-between px-2 py-1 border rounded ${t.type === 'buy' ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                    <div className="flex flex-col min-w-0">
                      <div className="text-xs font-medium leading-snug truncate">{t.date} <span className="text-[10px] text-gray-400 ml-2">{t.type === 'buy' ? '买入' : '卖出'}</span></div>
                      <div className="text-[11px] text-gray-500 leading-snug truncate">{t.shares.toFixed(2)} 份 · {t.price.toFixed(4)} ({(t.fee || 0).toFixed(2)} 手续)</div>
                    </div>
                    <div className="text-right flex flex-col items-end ml-3">
                      <div className="font-bold text-xs">{computed.toFixed(2)}</div>
                      <div className="flex items-center space-x-2 mt-0.5">
                        <button onClick={() => startEdit(t)} className="text-xs text-blue-500">编辑</button>
                        <button onClick={() => removeTrade(t.id)} className="text-xs text-red-500">删除</button>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="flex justify-between items-center">
                <div className="text-xs text-gray-400">第 {page + 1} / {pageCount} 页</div>
                <div className="space-x-2">
                  <button disabled={page <= 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="px-2 py-1 rounded bg-gray-100">上一页</button>
                  <button disabled={page >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} className="px-2 py-1 rounded bg-gray-100">下一页</button>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default TradeManager;

