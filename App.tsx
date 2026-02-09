
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Ticker, ValuationData, MarketType, MarketIndex } from './types';
import { fetchFundData, fetchMarketIndices } from './services/fundService';
import { TickerCard } from './components/TickerCard';
import { AddTickerModal } from './components/AddTickerModal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { FundDetailsModal } from './components/FundDetailsModal';
import { IndexDetailsModal } from './components/IndexDetailsModal';

type SortOrder = 'asc' | 'desc';

const DEFAULT_INDICES: string[] = [];
const DEFAULT_GLOBAL_INDICES: string[] = [];

const App: React.FC = () => {
  const [portfolio, setPortfolio] = useState<Ticker[]>(() => {
    try {
      const saved = localStorage.getItem('fund_portfolio');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  const [indicesConfig, setIndicesConfig] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('fund_indices_config');
      return saved ? JSON.parse(saved) : DEFAULT_INDICES;
    } catch (e) { return DEFAULT_INDICES; }
  });

  const [globalIndicesConfig, setGlobalIndicesConfig] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('fund_global_indices_config');
      return saved ? JSON.parse(saved) : DEFAULT_GLOBAL_INDICES;
    } catch (e) { return DEFAULT_GLOBAL_INDICES; }
  });

  const [marketData, setMarketData] = useState<Record<string, ValuationData>>(() => {
    try {
      const saved = localStorage.getItem('fund_market_data');
      return saved ? JSON.parse(saved) : {};
    } catch (e) { return {}; }
  });

  const [marketIndices, setMarketIndices] = useState<MarketIndex[]>([]);
  const [globalIndices, setGlobalIndices] = useState<MarketIndex[]>([]);
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
    const saved = localStorage.getItem('fund_sort_order');
    return (saved === 'asc' || saved === 'desc') ? saved : 'desc';
  });

  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [backgroundTasks, setBackgroundTasks] = useState<number>(0);

  const [viewingSymbol, setViewingSymbol] = useState<string | null>(null);
  const [viewingIndex, setViewingIndex] = useState<MarketIndex | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id?: string, symbol?: string, name?: string, bulk: boolean, type?: 'fund' | 'index' | 'global_index' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { localStorage.setItem('fund_portfolio', JSON.stringify(portfolio)); }, [portfolio]);
  useEffect(() => { localStorage.setItem('fund_indices_config', JSON.stringify(indicesConfig)); }, [indicesConfig]);
  useEffect(() => { localStorage.setItem('fund_global_indices_config', JSON.stringify(globalIndicesConfig)); }, [globalIndicesConfig]);
  useEffect(() => { localStorage.setItem('fund_market_data', JSON.stringify(marketData)); }, [marketData]);
  useEffect(() => { localStorage.setItem('fund_sort_order', sortOrder); }, [sortOrder]);

  const updateSingleFund = useCallback(async (symbol: string) => {
    try {
      const data = await fetchFundData(symbol);
      if (data) {
        setMarketData(prev => ({ ...prev, [symbol]: data }));
        setPortfolio(prev => prev.map(item =>
          item.symbol === symbol && !item.name ? { ...item, name: data.name } : item
        ));
      }
    } finally { setBackgroundTasks(prev => Math.max(0, prev - 1)); }
  }, []);

  const runBatchUpdate = useCallback(async (targets: Ticker[]) => {
    if (targets.length === 0) return;
    setBackgroundTasks(prev => prev + targets.length);
    const limit = 5;
    const queue = [...targets];
    const workers = Array(Math.min(limit, targets.length)).fill(null).map(async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item) await updateSingleFund(item.symbol);
      }
    });
    await Promise.all(workers);
  }, [updateSingleFund]);

  const refreshMarketIndices = useCallback(async () => {
    const tasks: Promise<any>[] = [];
    if (indicesConfig.length > 0) {
      tasks.push(fetchMarketIndices(indicesConfig).then(setMarketIndices).catch(() => {}));
    } else {
      setMarketIndices([]);
    }

    if (globalIndicesConfig.length > 0) {
      tasks.push(fetchMarketIndices(globalIndicesConfig).then(setGlobalIndices).catch(() => {}));
    } else {
      setGlobalIndices([]);
    }
    await Promise.allSettled(tasks);
  }, [indicesConfig, globalIndicesConfig]);

  const refreshAll = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.allSettled([
        runBatchUpdate(portfolio),
        refreshMarketIndices()
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [portfolio, isRefreshing, runBatchUpdate, refreshMarketIndices]);

  useEffect(() => {
    if (portfolio.length > 0) {
      const targets = portfolio.filter(p => !marketData[p.symbol]);
      if (targets.length > 0) runBatchUpdate(targets);
    }
  }, [portfolio.length]);

  useEffect(() => {
    refreshMarketIndices();
  }, [indicesConfig, globalIndicesConfig]);

  useEffect(() => {
    const fundInterval = setInterval(() => {
      runBatchUpdate(portfolio);
    }, 90000);
    return () => clearInterval(fundInterval);
  }, [portfolio, runBatchUpdate]);

  useEffect(() => {
    const indexInterval = setInterval(() => {
      refreshMarketIndices();
    }, 20000);
    return () => clearInterval(indexInterval);
  }, [refreshMarketIndices]);

  const sortedPortfolio = useMemo(() => {
    return [...portfolio].sort((a, b) => {
      const valA = marketData[a.symbol]?.changePercentage ?? -9999;
      const valB = marketData[b.symbol]?.changePercentage ?? -9999;
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });
  }, [portfolio, marketData, sortOrder]);

  const handleExport = () => {
    const data = { portfolio, indices: indicesConfig, globalIndices: globalIndicesConfig };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fund_backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    setIsMenuOpen(false);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        const fundList = Array.isArray(imported) ? imported : (imported.portfolio || []);
        const indexList = imported.indices || [];
        const globalList = imported.globalIndices || [];

        const existingSymbols = new Set(portfolio.map(p => p.symbol));
        const newItems = fundList.filter((item: any) =>
          item.symbol && /^\d{5,6}$/.test(item.symbol) && !existingSymbols.has(item.symbol)
        ).map((item: any) => ({
          id: Math.random().toString(36).substr(2, 9),
          symbol: item.symbol,
          name: item.name || '',
          market: MarketType.FUND
        }));

        if (newItems.length > 0) {
          setPortfolio(prev => [...prev, ...newItems]);
          runBatchUpdate(newItems);
        }
        setIndicesConfig(indexList);
        setGlobalIndicesConfig(globalList);
      } catch (err) {}
    };
    reader.readAsText(file);
    setIsMenuOpen(false);
  };

  const renderIndexCard = (idx: MarketIndex, type: 'index' | 'global_index') => (
    <div
      key={idx.symbol}
      onClick={() => !isSelectionMode && setViewingIndex(idx)}
      className={`bg-white rounded-2xl p-4 shadow-sm border transition-all min-w-[180px] lg:min-w-0 relative group cursor-pointer hover:shadow-md ${isSelectionMode ? 'border-blue-200 ring-2 ring-blue-50' : 'border-gray-100'}`}
    >
      {isSelectionMode && (
        <button
          onClick={(e) => { e.stopPropagation(); setPendingDelete({ symbol: idx.symbol, name: idx.name, bulk: false, type }); }}
          className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors z-10 scale-in"
        >
          <i className="fas fa-times text-xs"></i>
        </button>
      )}
      <div className="mb-2">
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0 pr-2">
            <h4 className="text-[12px] font-bold text-gray-800 truncate" title={idx.name}>{idx.name}</h4>
            <p className="text-[9px] text-gray-400 font-mono mt-0.5">{idx.symbol}</p>
          </div>
          <span className={`text-[11px] font-medium whitespace-nowrap ${idx.changePercent >= 0 ? 'text-red-500' : 'text-green-500'}`}>
            {idx.changePercent >= 0 ? '+' : ''}{idx.changePercent.toFixed(2)}%
          </span>
        </div>
      </div>
      <div className={`text-xl font-normal ${idx.changePercent >= 0 ? 'text-red-600' : 'text-green-600'}`}>
        {(idx.current || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <div className="flex flex-col mt-2">
        <div className="text-[9px] text-gray-300 flex items-center bg-gray-50/50 rounded-md py-0.5 px-1">
          <i className="far fa-clock mr-1 opacity-60"></i>
          <span>{idx.lastUpdated}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen pb-32 transition-colors duration-300 ${isSelectionMode ? 'bg-blue-50/50' : 'bg-gray-50'}`}>
      <header className="bg-white border-b sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className={`p-2 rounded-lg shadow-inner transition-colors ${isSelectionMode ? 'bg-blue-600' : 'bg-red-600'}`}>
              <i className="fas fa-chart-line text-white text-xl"></i>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800 leading-tight">极简基金估值</h1>
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-tighter">
                {backgroundTasks > 0 ? `同步中 (${backgroundTasks})` : '高频实时行情同步中'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1 relative">
            {!isSelectionMode && (
              <button disabled={isRefreshing} onClick={refreshAll} className={`p-2 w-10 h-10 rounded-full hover:bg-gray-100 transition-all flex items-center justify-center ${isRefreshing ? 'text-red-500' : 'text-gray-400'}`}>
                <i className={`fas fa-sync-alt ${isRefreshing ? 'animate-spin' : ''}`}></i>
              </button>
            )}
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 w-10 h-10 rounded-full hover:bg-gray-100 text-gray-400">
              <i className="fas fa-ellipsis-v"></i>
            </button>
            {isMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsMenuOpen(false)}></div>
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-2xl border py-1 z-20 animate-in fade-in zoom-in-95 duration-150 origin-top-right">
                  <button onClick={handleExport} className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50 flex items-center space-x-3"><i className="fas fa-file-export opacity-70"></i><span>导出备份</span></button>
                  <button onClick={() => fileInputRef.current?.click()} className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50 flex items-center space-x-3"><i className="fas fa-file-import opacity-70"></i><span>导入备份</span></button>
                  <div className="h-px bg-gray-100 my-1 mx-2"></div>
                  <button onClick={() => { setIndicesConfig([]); setGlobalIndicesConfig([]); setIsMenuOpen(false); }} className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50 flex items-center space-x-3 text-red-500"><i className="fas fa-trash-alt opacity-70"></i><span>清空指数</span></button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <input type="file" ref={fileInputRef} onChange={handleImport} accept=".json" className="hidden" />

      <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6">
        <aside className="lg:w-56 flex-shrink-0">
          <div className="sticky lg:top-24 space-y-4">
            <div className="h-8 flex items-center justify-between px-1">
              <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">大盘看板</h2>
            </div>
            <div className="flex lg:flex-col overflow-x-auto lg:overflow-visible gap-3 pb-2 no-scrollbar">
              {marketIndices.map(idx => renderIndexCard(idx, 'index'))}
              {marketIndices.length === 0 && (
                 <div className="bg-white border-2 border-dashed border-gray-100 rounded-3xl py-12 text-center text-[10px] text-gray-400 min-w-[180px] lg:min-w-0 flex flex-col items-center justify-center space-y-2">
                   <i className="fas fa-chart-bar text-xl opacity-20"></i>
                   <span>暂无指数</span>
                 </div>
              )}
            </div>
          </div>
        </aside>

        <main className="flex-1">
          <div className="space-y-4">
            <div className="h-8 flex justify-between items-center px-1">
              <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                {isSelectionMode ? <span className="text-blue-600">选择管理项目</span> : '我的自选'}
              </h2>
              <div className="flex items-center space-x-2">
                {!isSelectionMode ? (
                  <>
                    <button onClick={() => setIsSelectionMode(true)} className="px-4 py-1.5 rounded-full bg-blue-600 shadow-md text-[11px] font-bold text-white hover:bg-blue-700 transition-all">管理</button>
                    <button onClick={() => setSortOrder(o => o === 'desc' ? 'asc' : 'desc')} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                      <i className={`fas fa-sort-amount-${sortOrder === 'asc' ? 'up' : 'down'}`}></i>
                    </button>
                  </>
                ) : (
                  <button onClick={() => setIsSelectionMode(false)} className="px-4 py-1.5 rounded-full bg-white border border-blue-200 text-[10px] font-bold text-blue-600">取消管理</button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
              {sortedPortfolio.map(ticker => (
                <TickerCard
                  key={ticker.id}
                  ticker={ticker}
                  data={marketData[ticker.symbol]}
                  onRemove={() => setPendingDelete({ id: ticker.id, symbol: ticker.symbol, name: ticker.name, bulk: false, type: 'fund' })}
                  onClick={() => marketData[ticker.symbol] && setViewingSymbol(ticker.symbol)}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedIds.has(ticker.id)}
                  onSelect={() => setSelectedIds(prev => {
                    const next = new Set(prev);
                    if (next.has(ticker.id)) next.delete(ticker.id); else next.add(ticker.id);
                    return next;
                  })}
                />
              ))}
            </div>

            {portfolio.length === 0 && (
              <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-gray-100 text-gray-400">
                点击右下角按钮添加第一个自选项目
              </div>
            )}
          </div>
        </main>

        <aside className="lg:w-56 flex-shrink-0">
          <div className="sticky lg:top-24 space-y-4">
            <div className="h-8 flex items-center justify-between px-1">
              <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-blue-500">全球市场</h2>
            </div>
            <div className="flex lg:flex-col overflow-x-auto lg:overflow-visible gap-3 pb-2 no-scrollbar">
              {globalIndices.map(idx => renderIndexCard(idx, 'global_index'))}
              {globalIndices.length === 0 && (
                 <div className="bg-white border-2 border-dashed border-gray-100 rounded-3xl py-12 text-center text-[10px] text-gray-400 min-w-[180px] lg:min-w-0 flex flex-col items-center justify-center space-y-2">
                   <i className="fas fa-globe text-xl opacity-20"></i>
                   <span>暂无数据</span>
                 </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {isSelectionMode && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t p-5 z-40 shadow-2xl animate-in slide-in-from-bottom duration-300">
          <div className="max-w-2xl mx-auto flex justify-between items-center">
            <span className="text-xl font-black text-gray-800">{selectedIds.size} <span className="text-xs font-normal text-gray-400">个已选基金</span></span>
            <div className="flex space-x-3">
              <button onClick={() => setSelectedIds(new Set(portfolio.map(p => p.id)))} className="px-4 py-2 text-xs font-bold bg-gray-100 rounded-xl">全选</button>
              <button disabled={selectedIds.size === 0} onClick={() => setPendingDelete({ bulk: true, type: 'fund' })} className="px-6 py-2 text-xs font-bold text-white bg-red-600 rounded-xl shadow-lg">批量删除</button>
            </div>
          </div>
        </div>
      )}

      {!isSelectionMode && (
        <button onClick={() => setIsModalOpen(true)} className="fixed bottom-8 right-8 bg-red-600 text-white w-14 h-14 rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-90 transition-all z-30">
          <i className="fas fa-plus text-xl"></i>
        </button>
      )}

      {isModalOpen && (
        <AddTickerModal
          onClose={() => setIsModalOpen(false)}
          onAdd={async (symbols, type) => {
            if (type === MarketType.INDEX) {
              const isGlobal = (s: string) =>
                /[A-Za-z]/.test(s) ||
                /^(100|101|102|104|105|106|107)\./.test(s) ||
                s.includes('IXIC') || s.includes('NDX') || s.includes('SPX');

              const newDomestic = symbols.filter(s => !isGlobal(s) && !indicesConfig.includes(s));
              const newGlobal = symbols.filter(s => isGlobal(s) && !globalIndicesConfig.includes(s));

              if (newDomestic.length) setIndicesConfig(p => [...p, ...newDomestic]);
              if (newGlobal.length) setGlobalIndicesConfig(p => [...p, ...newGlobal]);

            } else {
              const existing = new Set(portfolio.map(p => p.symbol));
              const news = symbols.filter(s => !existing.has(s)).map(s => ({
                id: Math.random().toString(36).substr(2, 9),
                symbol: s, name: '', market: MarketType.FUND
              }));
              if (news.length) { setPortfolio(p => [...p, ...news]); runBatchUpdate(news); }
            }
            setIsModalOpen(false);
          }}
          isLoading={false}
        />
      )}

      {viewingSymbol && marketData[viewingSymbol] && (
        <FundDetailsModal
          data={marketData[viewingSymbol]}
          onClose={() => setViewingSymbol(null)}
        />
      )}

      {viewingIndex && (
        <IndexDetailsModal
          data={viewingIndex}
          onClose={() => setViewingIndex(null)}
        />
      )}

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title={pendingDelete?.bulk ? "批量删除" : (pendingDelete?.type?.includes('index') ? "删除指数" : "删除自选")}
        message={pendingDelete?.bulk ? `确定删除选中的 ${selectedIds.size} 个基金吗？` : `确定移除 "${pendingDelete?.name || pendingDelete?.symbol}" 吗？`}
        onConfirm={() => {
          if (pendingDelete?.bulk) {
            setPortfolio(p => p.filter(t => !selectedIds.has(t.id)));
            setSelectedIds(new Set());
            setIsSelectionMode(false);
          } else if (pendingDelete?.type === 'index' && pendingDelete.symbol) {
            setIndicesConfig(p => p.filter(s => s !== pendingDelete.symbol));
            setMarketIndices(p => p.filter(idx => idx.symbol !== pendingDelete.symbol));
          } else if (pendingDelete?.type === 'global_index' && pendingDelete.symbol) {
            setGlobalIndicesConfig(p => p.filter(s => s !== pendingDelete.symbol));
            setGlobalIndices(p => p.filter(idx => idx.symbol !== pendingDelete.symbol));
          } else if (pendingDelete?.id) {
            setPortfolio(p => p.filter(t => t.id !== pendingDelete.id));
          }
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
};

export default App;
