
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Ticker, ValuationData, MarketType } from './types';
import { fetchFundData } from './services/fundService';
import { TickerCard } from './components/TickerCard';
import { AddTickerModal } from './components/AddTickerModal';
import { ConfirmDialog } from './components/ConfirmDialog';

type SortOrder = 'none' | 'asc' | 'desc';

const App: React.FC = () => {
  const [portfolio, setPortfolio] = useState<Ticker[]>(() => {
    try {
      const saved = localStorage.getItem('fund_portfolio');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [marketData, setMarketData] = useState<Record<string, ValuationData>>(() => {
    try {
      const saved = localStorage.getItem('fund_market_data');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
    return (localStorage.getItem('fund_sort_order') as SortOrder) || 'desc';
  });

  // UI 状态
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [backgroundTasks, setBackgroundTasks] = useState<number>(0);

  // 删除确认状态
  const [pendingDelete, setPendingDelete] = useState<{ id?: string, symbol?: string, name?: string, bulk: boolean } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 本地持久化
  useEffect(() => {
    localStorage.setItem('fund_portfolio', JSON.stringify(portfolio));
  }, [portfolio]);

  useEffect(() => {
    localStorage.setItem('fund_market_data', JSON.stringify(marketData));
  }, [marketData]);

  useEffect(() => {
    localStorage.setItem('fund_sort_order', sortOrder);
  }, [sortOrder]);

  const updateSingleFund = useCallback(async (symbol: string) => {
    setBackgroundTasks(prev => prev + 1);
    try {
      const data = await fetchFundData(symbol);
      if (data) {
        setMarketData(prev => ({
          ...prev,
          [symbol]: data
        }));
        setPortfolio(prev => prev.map(item =>
          item.symbol === symbol && !item.name ? { ...item, name: data.name } : item
        ));
      }
    } finally {
      setBackgroundTasks(prev => Math.max(0, prev - 1));
    }
  }, []);

  const runBatchUpdate = useCallback(async (targets: Ticker[]) => {
    if (targets.length === 0) return;
    const limit = Math.min(5, targets.length);
    const queue = [...targets];
    const workers = Array(limit).fill(null).map(async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item) await updateSingleFund(item.symbol);
      }
    });
    await Promise.all(workers);
  }, [updateSingleFund]);

  const refreshAll = useCallback(async () => {
    if (portfolio.length === 0 || isRefreshing) return;
    setIsRefreshing(true);
    await runBatchUpdate(portfolio);
    setIsRefreshing(false);
  }, [portfolio, isRefreshing, runBatchUpdate]);

  useEffect(() => {
    refreshAll();
    const interval = setInterval(refreshAll, 120000);
    return () => clearInterval(interval);
  }, [portfolio.length]);

  const handleExport = () => {
    const dataStr = JSON.stringify(portfolio, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `fund_backup_${date}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsMenuOpen(false);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importedData = JSON.parse(e.target?.result as string);
        if (!Array.isArray(importedData)) throw new Error('Invalid format');
        const existingSymbols = new Set(portfolio.map(p => p.symbol));
        const newItems: Ticker[] = [];
        importedData.forEach((item: any) => {
          if (item.symbol && /^\d{5,6}$/.test(item.symbol) && !existingSymbols.has(item.symbol)) {
            newItems.push({
              id: item.id || Math.random().toString(36).substr(2, 9),
              symbol: item.symbol,
              name: item.name || '',
              market: item.market || MarketType.FUND
            });
          }
        });
        if (newItems.length > 0) {
          setPortfolio(prev => [...prev, ...newItems]);
          runBatchUpdate(newItems);
        }
      } catch (err) {
        alert('导入失败：文件格式不正确');
      }
    };
    reader.readAsText(file);
    setIsMenuOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const sortedPortfolio = useMemo(() => {
    if (sortOrder === 'none') return portfolio;
    return [...portfolio].sort((a, b) => {
      const valA = marketData[a.symbol]?.changePercentage ?? -9999;
      const valB = marketData[b.symbol]?.changePercentage ?? -9999;
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });
  }, [portfolio, marketData, sortOrder]);

  const addTickers = async (symbols: string[]) => {
    const validSymbols = symbols.map(s => s.trim()).filter(s => /^\d{5,6}$/.test(s));
    const currentSymbols = new Set(portfolio.map(p => p.symbol));
    const newItems: Ticker[] = [];
    validSymbols.forEach(symbol => {
      if (!currentSymbols.has(symbol)) {
        newItems.push({ id: Math.random().toString(36).substr(2, 9), symbol, name: '', market: MarketType.FUND });
      }
    });
    if (newItems.length > 0) {
      setPortfolio(prev => [...prev, ...newItems]);
      setIsModalOpen(false);
      runBatchUpdate(newItems);
    } else {
      setIsModalOpen(false);
    }
  };

  /**
   * 删除逻辑处理
   */
  const handleRemoveClick = (id: string, symbol: string) => {
    const ticker = portfolio.find(p => p.id === id);
    setPendingDelete({
      id,
      symbol,
      name: ticker?.name || symbol,
      bulk: false
    });
  };

  const handleBulkRemoveClick = () => {
    if (selectedIds.size === 0) return;
    setPendingDelete({ bulk: true });
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;

    if (pendingDelete.bulk) {
      // 批量删除
      setPortfolio(prev => prev.filter(t => !selectedIds.has(t.id)));
      setMarketData(prev => {
        const newData = { ...prev };
        portfolio.forEach(t => {
          if (selectedIds.has(t.id)) delete newData[t.symbol];
        });
        return newData;
      });
      setSelectedIds(new Set());
      setIsSelectionMode(false);
    } else if (pendingDelete.id && pendingDelete.symbol) {
      // 单个删除
      const id = pendingDelete.id;
      const symbol = pendingDelete.symbol;
      setPortfolio(prev => prev.filter(t => t.id !== id));
      setMarketData(prev => {
        const newData = { ...prev };
        delete newData[symbol];
        return newData;
      });
    }

    setPendingDelete(null);
  };

  const cancelDelete = () => {
    setPendingDelete(null);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === portfolio.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(portfolio.map(p => p.id)));
    }
  };

  return (
    <div className={`min-h-screen pb-32 transition-colors duration-300 ${isSelectionMode ? 'bg-blue-50/50' : 'bg-gray-50'}`}>
      <header className="bg-white border-b sticky top-0 z-20 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className={`p-2 rounded-lg shadow-inner transition-colors ${isSelectionMode ? 'bg-blue-600' : 'bg-red-600'}`}>
              <i className="fas fa-chart-line text-white text-xl"></i>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800 leading-tight">极简基金估值</h1>
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-tighter">
                {backgroundTasks > 0 ? `正在同步 ${backgroundTasks} 个项目...` : '实时数据同步中'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1">
            {!isSelectionMode && (
              <button
                disabled={isRefreshing || portfolio.length === 0}
                onClick={refreshAll}
                className={`p-2 w-10 h-10 rounded-full hover:bg-gray-100 transition-all flex items-center justify-center ${isRefreshing ? 'text-red-500' : 'text-gray-400'}`}
              >
                <i className={`fas fa-sync-alt ${isRefreshing ? 'animate-spin' : ''}`}></i>
              </button>
            )}

            <div className="relative">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className={`p-2 w-10 h-10 rounded-full hover:bg-gray-100 transition-all flex items-center justify-center ${isMenuOpen ? 'bg-gray-100 text-gray-800' : 'text-gray-400'}`}
              >
                <i className="fas fa-ellipsis-v"></i>
              </button>

              {isMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsMenuOpen(false)}></div>
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-gray-100 z-20 py-1 overflow-hidden animate-in fade-in zoom-in duration-200 origin-top-right">
                    <button
                      onClick={handleExport}
                      className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-3 transition-colors"
                    >
                      <i className="fas fa-file-export w-4 opacity-70"></i>
                      <span>备份基金列表</span>
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-3 transition-colors"
                    >
                      <i className="fas fa-file-import w-4 opacity-70"></i>
                      <span>恢复基金列表</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <input type="file" ref={fileInputRef} onChange={handleImport} accept=".json" className="hidden" />

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center">
              {isSelectionMode ? (
                <span className="text-blue-600 flex items-center">
                  <span className="w-1.5 h-1.5 bg-blue-600 rounded-full mr-2 animate-pulse"></span>
                  管理模式：选中项目以批量删除
                </span>
              ) : (
                '我的自选'
              )}
            </h2>
            <div className="flex items-center space-x-2">
               {!isSelectionMode ? (
                 <>
                   <button
                    onClick={() => setIsSelectionMode(true)}
                    className="flex items-center space-x-1.5 px-4 py-1.5 rounded-full bg-blue-600 shadow-md shadow-blue-100 hover:bg-blue-700 transition-all text-[11px] font-bold text-white"
                   >
                     <i className="fas fa-list-check"></i>
                     <span>管理</span>
                   </button>
                   <button
                    onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : prev === 'asc' ? 'none' : 'desc')}
                    className="flex items-center space-x-1 px-2 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors text-[10px] font-bold text-gray-500"
                   >
                     <i className={`fas fa-sort-amount-${sortOrder === 'asc' ? 'up' : 'down'} ${sortOrder === 'none' ? 'opacity-30' : ''}`}></i>
                     <span>{sortOrder === 'none' ? '默认' : sortOrder === 'desc' ? '跌幅' : '涨幅'}</span>
                   </button>
                   <span className="text-[10px] text-gray-400 bg-gray-200 px-2 py-1.5 rounded-full font-mono">{portfolio.length}</span>
                 </>
               ) : (
                 <button
                  onClick={() => { setSelectedIds(new Set()); setIsSelectionMode(false); }}
                  className="px-4 py-1.5 rounded-full bg-white border border-blue-200 shadow-sm text-[10px] font-bold text-blue-600 hover:bg-blue-50 transition-colors"
                 >
                   完成管理
                 </button>
               )}
            </div>
          </div>

          {portfolio.length === 0 ? (
            <div className="text-center py-24 bg-white rounded-3xl border-2 border-dashed border-gray-100">
              <p className="text-gray-500 font-medium">还没有添加基金</p>
              <p className="text-gray-400 text-sm mt-1">点击右下角按钮开始</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {sortedPortfolio.map(ticker => (
                <TickerCard
                  key={ticker.id}
                  ticker={ticker}
                  data={marketData[ticker.symbol]}
                  onRemove={() => handleRemoveClick(ticker.id, ticker.symbol)}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedIds.has(ticker.id)}
                  onSelect={() => toggleSelect(ticker.id)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* 批量操作工具栏 */}
      {isSelectionMode && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-blue-100 p-5 z-40 animate-in slide-in-from-bottom duration-300 shadow-[0_-15px_30px_rgba(0,0,0,0.08)]">
          <div className="max-w-2xl mx-auto flex justify-between items-center">
            <div className="flex flex-col">
              <span className="text-xs text-blue-400 font-bold uppercase tracking-widest">已选择</span>
              <span className="text-2xl font-black text-gray-800 tracking-tight">
                {selectedIds.size}
                <span className="text-xs font-medium text-gray-300 ml-1.5 uppercase tracking-tighter">个项目</span>
              </span>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={toggleSelectAll}
                className="px-5 py-3 text-xs font-bold text-gray-600 bg-gray-100 rounded-2xl hover:bg-gray-200 transition-colors active:scale-95"
              >
                {selectedIds.size === portfolio.length ? '取消全选' : '选择全部'}
              </button>
              <button
                disabled={selectedIds.size === 0}
                onClick={handleBulkRemoveClick}
                className="px-7 py-3 text-xs font-bold text-white bg-red-600 rounded-2xl hover:bg-red-700 disabled:opacity-40 disabled:grayscale transition-all shadow-xl shadow-red-100 flex items-center space-x-2 active:scale-95"
              >
                <i className="fas fa-trash-can"></i>
                <span>批量删除</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 浮动操作按钮 */}
      {!isSelectionMode && (
        <div className="fixed bottom-8 right-8 z-30">
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-red-600 hover:bg-red-700 text-white w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-90"
          >
            <i className="fas fa-plus text-xl"></i>
          </button>
        </div>
      )}

      {/* 弹窗与确认框 */}
      {isModalOpen && (
        <AddTickerModal
          onClose={() => setIsModalOpen(false)}
          onAdd={addTickers}
          isLoading={false}
        />
      )}

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title={pendingDelete?.bulk ? "批量删除确认" : "删除自选基金"}
        message={pendingDelete?.bulk
          ? `确定要删除选中的 ${selectedIds.size} 个基金项目吗？此操作不可撤销。`
          : `确定要移除 "${pendingDelete?.name}" (${pendingDelete?.symbol}) 吗？`
        }
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </div>
  );
};

export default App;
