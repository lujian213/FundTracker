import { useCallback, useEffect, useState } from 'react';
import { TradeRecord, TradeType, getTradeAmount } from '../types';
import * as marketFundService from '../services/marketFundService';

// 事件名称，用于通知其他组件交易数据已变更
const TRADES_CHANGED_EVENT = 'fund-trades-changed';

/**
 * 触发交易变更事件
 */
function notifyTradesChanged() {
  try {
    const ev = new CustomEvent(TRADES_CHANGED_EVENT, { detail: { time: Date.now() } });
    window.dispatchEvent(ev);
  } catch (e) {
    // ignore if CustomEvent not available
  }
}

/**
 * 获取所有基金的交易记录
 */
export function readAll(): Record<string, TradeRecord[]> {
  return marketFundService.getAllTrades();
}

/**
 * 获取所有交易日期
 */
export function getAllTradeDates(): string[] {
  const all = readAll();
  const dateSet = new Set<string>();
  Object.values(all).forEach(records => {
    records.forEach(r => { if (r.date) dateSet.add(r.date); });
  });
  return Array.from(dateSet).sort((a, b) => b.localeCompare(a)); // descending
}

/**
 * 获取指定基金的交易记录
 */
export function getTradesForSymbol(symbol: string): TradeRecord[] {
  return marketFundService.getTrades(symbol);
}

/**
 * 设置指定基金的交易记录
 */
export function setTradesForSymbol(symbol: string, arr: TradeRecord[]) {
  marketFundService.updateTrades(symbol, arr);
  notifyTradesChanged();
}

/**
 * 添加交易记录
 */
export function addTradeForSymbol(symbol: string, rec: TradeRecord) {
  marketFundService.addTrade(symbol, rec);
  notifyTradesChanged();
}

/**
 * 更新交易记录
 */
export function updateTradeForSymbol(symbol: string, id: string, patch: Partial<TradeRecord>) {
  marketFundService.updateTrade(symbol, id, patch);
  notifyTradesChanged();
}

/**
 * 删除交易记录
 */
export function removeTradeForSymbol(symbol: string, id: string) {
  marketFundService.removeTrade(symbol, id);
  notifyTradesChanged();
}

/**
 * 导出交易记录为 JSON
 */
export function exportTradesForSymbolJSON(symbol: string) {
  const arr = getTradesForSymbol(symbol);
  const out = arr.map(t => ({
    ...t,
    total: getTradeAmount(t)
  }));
  return JSON.stringify({ symbol, trades: out }, null, 2);
}

/**
 * 导出交易记录为 CSV
 */
export function exportTradesForSymbolCSV(symbol: string) {
  const arr = getTradesForSymbol(symbol);
  const header = ['id', 'date', 'type', 'shares', 'price', 'fee', 'total'];
  const lines = [header.join(',')];
  for (const t of arr) {
    const total = getTradeAmount(t);
    const typeDisplay = t.type === 'dividend' ? '分红' : t.type;
    lines.push([t.id, t.date, typeDisplay, t.shares, t.price, t.fee, total].join(','));
  }
  return lines.join('\n');
}

/**
 * 导入交易记录
 */
export function importTradesForSymbol(symbol: string, arr: TradeRecord[]) {
  setTradesForSymbol(symbol, arr);
}

/**
 * React hook：管理指定基金的交易记录
 */
export default function useTrades(symbol: string) {
  const [trades, setTrades] = useState<TradeRecord[]>(() => getTradesForSymbol(symbol));

  useEffect(() => {
    setTrades(getTradesForSymbol(symbol));
  }, [symbol]);

  // 监听交易变更事件
  useEffect(() => {
    const handler = () => {
      setTrades(getTradesForSymbol(symbol));
    };
    window.addEventListener(TRADES_CHANGED_EVENT, handler as EventListener);
    // 监听 storage 事件（其他标签页变更）
    const storageHandler = (e: StorageEvent) => {
      if (e.key === 'fund_all_funds_data') setTrades(getTradesForSymbol(symbol));
    };
    window.addEventListener('storage', storageHandler);
    return () => {
      window.removeEventListener(TRADES_CHANGED_EVENT, handler as EventListener);
      window.removeEventListener('storage', storageHandler);
    };
  }, [symbol]);

  const refresh = useCallback(() => setTrades(getTradesForSymbol(symbol)), [symbol]);

  const add = useCallback((rec: TradeRecord) => { addTradeForSymbol(symbol, rec); refresh(); }, [symbol, refresh]);
  const update = useCallback((id: string, patch: Partial<TradeRecord>) => { updateTradeForSymbol(symbol, id, patch); refresh(); }, [symbol, refresh]);
  const remove = useCallback((id: string) => { removeTradeForSymbol(symbol, id); refresh(); }, [symbol, refresh]);
  const setAll = useCallback((arr: TradeRecord[]) => { setTradesForSymbol(symbol, arr); refresh(); }, [symbol, refresh]);

  const exportJSON = useCallback(() => exportTradesForSymbolJSON(symbol), [symbol]);
  const exportCSV = useCallback(() => exportTradesForSymbolCSV(symbol), [symbol]);

  return { trades, refresh, add, update, remove, setAll, exportJSON, exportCSV };
}
