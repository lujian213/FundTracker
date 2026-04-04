import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TradeDifference, SyncDifferenceType } from '../types/syncTypes';
import { compareTrades, applySyncUpdates } from '../services/syncService';
import { getEggfundFunds, getHistoricalTrades } from '../services/eggfundService';
import { getTradesForFund } from '../utils/realProfitCalculator';
import TradeManager from '../components/TradeManager';
import { ValuationData } from '../types';
import { getSyncConfig, getSyncFilterConfig, saveSyncFilterConfig } from '../services/systemConfigService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedDifferences: TradeDifference[]) => void;
  // 添加市场数据以供交易管理器使用
  marketData?: Record<string, ValuationData>;
}

const SyncConfirmationModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onConfirm,
  marketData = {}
}) => {
  const [differences, setDifferences] = useState<TradeDifference[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('正在初始化...');
  const [selectedItems, setSelectedItems] = useState<TradeDifference[]>([]);
  const [selectedFunds, setSelectedFunds] = useState<string[]>([]);
  const [availableFunds, setAvailableFunds] = useState<{code: string, name: string}[]>([]);
  const [filterDate, setFilterDate] = useState<string>('');
  const [selectedTypes, setSelectedTypes] = useState<SyncDifferenceType[]>([]);
  const [earliestDate, setEarliestDate] = useState<string>('');
  const [syncMessage, setSyncMessage] = useState<string>('');
  // 存储从eggfund获取的原始数据，以便同步后重复使用
  const [eggfundData, setEggfundData] = useState<Record<string, any[]>>({});
  // 存储过滤条件
  const [filterConfig, setFilterConfig] = useState({
    selectedFunds: [] as string[],
    filterDate: '',
    selectedTypes: [] as SyncDifferenceType[]
  });
  // 控制是否显示特定基金的交易管理器
  const [showTradeManager, setShowTradeManager] = useState<string | null>(null);

  // Initialize the earliest date on component mount
  useEffect(() => {
    const portfolioStr = localStorage.getItem('fund_portfolio');
    const portfolio = portfolioStr ? JSON.parse(portfolioStr) : [];

    // Find the earliest start date across all funds by checking each fund's position config
    let earliest = '';
    for (const fund of portfolio) {
      try {
        const positionStr = localStorage.getItem(`fund_position_${fund.symbol}`);
        if (positionStr) {
          const position = JSON.parse(positionStr);
          if (position && position.startDate) {
            if (!earliest || position.startDate < earliest) {
              earliest = position.startDate;
            }
          }
        }
      } catch (e) {
        // ignore errors reading position config
      }
    }

    setEarliestDate(earliest);
    setFilterDate(earliest); // Set the default date to the earliest date
  }, []);

  // Load and apply saved filter settings when modal opens
  useEffect(() => {
    if (isOpen) {
      // Load saved filter configuration
      const savedFilterConfig = getSyncFilterConfig();
      if (savedFilterConfig) {
        setFilterConfig({
          selectedFunds: savedFilterConfig.selectedFunds,
          filterDate: savedFilterConfig.filterDate,
          selectedTypes: savedFilterConfig.selectedTypes as SyncDifferenceType[]
        });
        // Apply the saved filters
        setSelectedFunds(savedFilterConfig.selectedFunds || []);
        setFilterDate(savedFilterConfig.filterDate || '');
        setSelectedTypes((savedFilterConfig.selectedTypes || []) as SyncDifferenceType[]);
      }

      loadDifferences();
    } else {
      // Reset state when modal closes
      setDifferences([]);
      setSelectedItems([]);
      setSelectedFunds([]);
      setAvailableFunds([]);
      setFilterDate(earliestDate); // Reset to earliest date
      setLoading(false);
      setLoadingMessage('正在初始化...');
    }
  }, [isOpen]);

  const loadDifferences = async () => {
    try {
      setLoading(true);

      // Get sync configuration
      const syncConfig = getSyncConfig();
      if (!syncConfig.eggfundUsername || !syncConfig.eggfundPassword) {
        setSyncMessage('请先在"同步配置"中设置 Eggfund 账户信息');
        setLoading(false);
        // 延迟关闭窗口，让用户看到错误信息
        setTimeout(() => onClose(), 1500);
        return;
      }

      const { eggfundUsername, eggfundPassword } = syncConfig;

      // Step 1: Get all funds from eggfund
      setLoadingMessage('正在获取 Eggfund 基金列表...');
      const eggfundFunds = await getEggfundFunds(eggfundUsername, eggfundPassword);

      // Step 2: Get current portfolio from local storage
      const portfolioStr = localStorage.getItem('fund_portfolio');
      const portfolio = portfolioStr ? JSON.parse(portfolioStr) : [];

      // Create mapping of fund code to name from portfolio
      const fundCodeToNameMap: Record<string, string> = {};
      portfolio.forEach((fund: any) => {
        fundCodeToNameMap[fund.symbol] = fund.name;
      });

      // Step 3: Find intersection of funds
      const intersectingFunds = eggfundFunds.filter((fund: any) =>
        portfolio.some((pf: any) => pf.symbol === fund.id)
      ).map((fund: any) => ({ code: fund.id, name: fund.name }));

      if (intersectingFunds.length === 0) {
        setSyncMessage('未找到与本地基金组合匹配的基金，无法进行同步');
        setLoading(false);
        setTimeout(() => onClose(), 1500);
        return;
      }

      // Set available funds for the filter
      setAvailableFunds(intersectingFunds);

      // Step 4: For each intersecting fund, get trades from both systems and compare
      setLoadingMessage(`正在获取 ${intersectingFunds.length} 个基金的交易记录...`);

      // Store the eggfund data for potential reuse after sync
      const allEggfundData: Record<string, any[]> = {};
      const allDifferences: TradeDifference[] = [];

      for (let i = 0; i < intersectingFunds.length; i++) {
        const fundInfo = intersectingFunds[i];
        const fundCode = fundInfo.code;

        // Use fundInfo which already contains name
        setLoadingMessage(`正在处理基金 ${fundInfo.name} (${i + 1}/${intersectingFunds.length})...`);

        // Get local trades
        const localTrades = getTradesForFund(fundCode);

        // Get external trades from eggfund
        try {
          const externalTrades = await getHistoricalTrades(eggfundUsername, eggfundPassword, fundCode);

          // Store the external trades data for potential reuse after sync
          allEggfundData[fundCode] = externalTrades;

          // Compare and get differences
          const fundDifferences = compareTrades(localTrades, externalTrades, fundCode);
          allDifferences.push(...fundDifferences);
        } catch (error) {
          console.error(`Error fetching trades for fund ${fundCode}:`, error);
          // Continue with other funds
        }
      }

      // Save the eggfund data for reuse after sync
      setEggfundData(allEggfundData);
      setDifferences(allDifferences);
    } catch (error) {
      console.error('Error during sync process:', error);
      setSyncMessage('同步过程中发生错误，请检查网络连接和账户信息');
    } finally {
      setLoading(false);
    }
  };

  // Handle fund selection
  const handleFundToggle = (fundCode: string) => {
    setSelectedFunds(prev =>
      prev.includes(fundCode)
        ? prev.filter(code => code !== fundCode)
        : [...prev, fundCode]
    );
  };

  // Handle type selection
  const handleTypeToggle = (type: SyncDifferenceType) => {
    setSelectedTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  // Handle select all funds
  const handleSelectAllFunds = () => {
    setSelectedFunds(availableFunds.map(f => f.code));
  };

  // Handle reset funds
  const handleResetFunds = () => {
    setSelectedFunds([]);
  };

  // Handle reset types
  const handleResetTypes = () => {
    setSelectedTypes([]);
  };

  // Handle reset date
  const handleResetDate = () => {
    setFilterDate('');  // Clear the date field instead of resetting to earliest date
  };

  // Handle save filter settings
  const handleSaveFilterSettings = () => {
    const configToSave = {
      selectedFunds,
      filterDate,
      selectedTypes
    };
    saveSyncFilterConfig(configToSave);
    setSyncMessage('过滤条件已保存');

    // Clear the message after 2 seconds
    setTimeout(() => {
      if (syncMessage === '过滤条件已保存') {
        setSyncMessage('');
      }
    }, 2000);
  };

  // 应用过滤器
  const filteredDifferences = useMemo(() => {
    return differences.filter(diff => {
      // 基金代码过滤
      if (selectedFunds.length > 0 && !selectedFunds.includes(diff.symbol)) {
        return false;
      }

      // 日期过滤
      if (filterDate && diff.date < filterDate) {
        return false;
      }

      // 类型过滤
      if (selectedTypes.length > 0 && !selectedTypes.includes(diff.type)) {
        return false;
      }

      return true;
    });
  }, [differences, selectedFunds, filterDate, selectedTypes]);

  // 处理复选框变化
  const handleItemToggle = (item: TradeDifference) => {
    setSelectedItems(prev => {
      const exists = prev.some(i => i.date === item.date && i.symbol === item.symbol);
      if (exists) {
        return prev.filter(i => !(i.date === item.date && i.symbol === item.symbol));
      } else {
        return [...prev, item];
      }
    });
  };

  // 重新从eggfund同步数据并刷新表格
  const handleRefreshSync = async () => {
    // 防止在已有操作进行时再次触发
    if (loading) {
      return;
    }

    try {
      setLoading(true);
      setSyncMessage(''); // 清空之前的同步消息

      // Get sync configuration
      const syncConfig = getSyncConfig();
      if (!syncConfig.eggfundUsername || !syncConfig.eggfundPassword) {
        setSyncMessage('请先在"同步配置"中设置 Eggfund 账户信息');
        setLoading(false);
        return;
      }

      const { eggfundUsername, eggfundPassword } = syncConfig;

      // Step 1: Get all funds from eggfund
      setLoadingMessage('正在重新获取 Eggfund 基金列表...');
      const eggfundFunds = await getEggfundFunds(eggfundUsername, eggfundPassword);

      // Step 2: Get current portfolio from local storage
      const portfolioStr = localStorage.getItem('fund_portfolio');
      const portfolio = portfolioStr ? JSON.parse(portfolioStr) : [];

      // Create mapping of fund code to name from portfolio
      const fundCodeToNameMap: Record<string, string> = {};
      portfolio.forEach((fund: any) => {
        fundCodeToNameMap[fund.symbol] = fund.name;
      });

      // Step 3: Find intersection of funds
      const intersectingFunds = eggfundFunds.filter((fund: any) =>
        portfolio.some((pf: any) => pf.symbol === fund.id)
      ).map((fund: any) => ({ code: fund.id, name: fund.name }));

      if (intersectingFunds.length === 0) {
        // 如果没有找到匹配的基金，显示警告但不关闭窗口
        setSyncMessage('未找到与本地基金组合匹配的基金，无法进行同步');
        setLoading(false);
        return; // 仅退出本次同步操作，不关闭窗口
      }

      // Set available funds for the filter
      setAvailableFunds(intersectingFunds);

      // Step 4: For each intersecting fund, get trades from both systems and compare
      setLoadingMessage(`正在重新获取 ${intersectingFunds.length} 个基金的交易记录...`);

      // Store the eggfund data for potential reuse after sync
      const allEggfundData: Record<string, any[]> = {};
      const allDifferences: TradeDifference[] = [];

      for (let i = 0; i < intersectingFunds.length; i++) {
        const fundInfo = intersectingFunds[i];
        const fundCode = fundInfo.code;

        // Use fundInfo which already contains name
        setLoadingMessage(`正在重新处理基金 ${fundInfo.name} (${i + 1}/${intersectingFunds.length})...`);

        // Get local trades
        const localTrades = getTradesForFund(fundCode);

        // Get external trades from eggfund
        try {
          const externalTrades = await getHistoricalTrades(eggfundUsername, eggfundPassword, fundCode);

          // Store the external trades data for potential reuse after sync
          allEggfundData[fundCode] = externalTrades;

          // Compare and get differences
          const fundDifferences = compareTrades(localTrades, externalTrades, fundCode);
          allDifferences.push(...fundDifferences);
        } catch (error) {
          console.error(`Error fetching trades for fund ${fundCode}:`, error);
          // Continue with other funds
        }
      }

      // Save the eggfund data for reuse after sync
      setEggfundData(allEggfundData);
      setDifferences(allDifferences);

      setSyncMessage(`重新同步完成，共获取 ${allDifferences.length} 个交易差异`);
    } catch (error) {
      console.error('重新同步过程中发生错误:', error);
      setSyncMessage('重新同步过程中发生错误，请查看控制台了解详细信息');
    } finally {
      setLoading(false);
    }
  };

  // 全选/取消全选
  const handleSelectAll = () => {
    if (selectedItems.length === filteredDifferences.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems([...filteredDifferences]);
    }
  };

  // 确认同步
  const handleConfirm = async () => {
    if (selectedItems.length > 0) {
      try {
        // 应用同步更新
        applySyncUpdates(selectedItems);

        // 显示成功消息
        setSyncMessage(`成功同步 ${selectedItems.length} 个交易差异`);

        // 使用之前存储的eggfund数据重新计算差异，而不是重新加载
        const allDifferences: TradeDifference[] = [];

        // Get current portfolio from local storage
        const portfolioStr = localStorage.getItem('fund_portfolio');
        const portfolio = portfolioStr ? JSON.parse(portfolioStr) : [];

        // Iterate through the eggfund data we have already loaded
        Object.entries(eggfundData).forEach(([fundCode, externalTrades]) => {
          // Only process funds that are in the current portfolio
          if (portfolio.some((pf: any) => pf.symbol === fundCode)) {
            // Get local trades after sync (updated data)
            const localTrades = getTradesForFund(fundCode);

            // Compare and get differences
            const fundDifferences = compareTrades(localTrades, externalTrades, fundCode);
            allDifferences.push(...fundDifferences);
          }
        });

        // Update the differences display with new comparison
        setDifferences(allDifferences);

        // 清空选中的项目
        setSelectedItems([]);
      } catch (error) {
        console.error('同步过程中出现错误:', error);
        setSyncMessage('同步过程中出现错误，请查看控制台了解详细信息');
      }
    }
  };

  // 检查是否所有显示的项都被选中
  const isAllSelected = filteredDifferences.length > 0 &&
                        selectedItems.length === filteredDifferences.length;

  if (!isOpen) {
    return null;
  }

  // 如果正在显示交易管理器，则渲染交易管理器
  if (showTradeManager) {
    const fundData = marketData[showTradeManager];
    const fundInfo = availableFunds.find(f => f.code === showTradeManager);

    return createPortal(
      <TradeManager
        symbol={showTradeManager}
        name={fundInfo?.name}
        currentPrice={fundData?.currentPrice || 0}
        previousPrice={fundData?.previousPrice || 0}
        realtimeDate={fundData?.lastUpdated || null}
        netWorthDate={fundData?.netWorthDate || null}
        onClose={() => setShowTradeManager(null)}
      />,
      document.body
    );
  }

  if (loading) {
    return createPortal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"></div>
        <div className="relative bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
          <div className="px-6 py-8 flex flex-col items-center justify-center">
            <div className="flex items-center w-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3 flex-shrink-0"></div>
              <p className="text-gray-700 text-sm truncate">{loadingMessage}</p>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-confirmation-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={!loading ? onClose : undefined} // 当loading为true时，不响应点击
        style={!loading ? {} : { pointerEvents: 'none' }} // 当loading为true时，禁用鼠标事件
      />

      {/* Modal body */}
      <div className="relative bg-white rounded-3xl w-full max-w-6xl min-w-[800px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col"
           style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 id="sync-confirmation-title" className="text-base font-bold text-gray-800">
            交易同步确认
          </h2>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleRefreshSync}
              disabled={loading}
              className={`w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:text-gray-600'}`}
              aria-label="重新同步"
              title="重新同步"
            >
              <i className={`fas fa-sync-alt ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              disabled={loading}  // 在loading期间禁用关闭按钮
              className={`w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:text-gray-600'}`}
              aria-label="关闭"
            >
              <i className="fas fa-times" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 border-b border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">
                基金
              </label>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={handleSelectAllFunds}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  全选
                </button>
                <button
                  type="button"
                  onClick={handleResetFunds}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  重置
                </button>
              </div>
            </div>
            <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-xl p-2">
              {availableFunds.map((fund) => (
                <div key={fund.code} className="flex items-center">
                  <input
                    type="checkbox"
                    id={`fund-${fund.code}`}
                    checked={selectedFunds.includes(fund.code)}
                    onChange={() => handleFundToggle(fund.code)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor={`fund-${fund.code}`} className="ml-2 text-xs truncate max-w-[calc(100%-20px)]">
                    {fund.name}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div> {/* Restore original width for date filter */}
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="filter-date" className="text-xs font-medium text-gray-700">
                日期从
              </label>
              <button
                type="button"
                onClick={handleResetDate}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                重置
              </button>
            </div>
            <input
              id="filter-date"
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div> {/* Restore original width for type filter */}
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">
                差异类型
              </label>
              <button
                type="button"
                onClick={handleResetTypes}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                重置
              </button>
            </div>
            <div className="border border-gray-200 rounded-xl p-2 mb-2">
              {(['new', 'modified', 'deleted'] as SyncDifferenceType[]).map((type) => (
                <div key={type} className="flex items-center">
                  <input
                    type="checkbox"
                    id={`type-${type}`}
                    checked={selectedTypes.includes(type)}
                    onChange={() => handleTypeToggle(type)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor={`type-${type}`} className="ml-2 text-xs">
                    {type === 'new' ? '新增' : type === 'modified' ? '修改' : '删除'}
                  </label>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={handleSaveFilterSettings}
              className="w-full text-xs text-center text-blue-600 hover:text-blue-800 py-1 border border-blue-200 rounded-xl"
            >
              保存过滤条件
            </button>
          </div>
        </div>

        {/* Table header */}
        <div className="px-6 py-3 border-b border-gray-100 flex items-center text-xs font-medium text-gray-700">
          <div className="w-8 flex items-center justify-center">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={handleSelectAll}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1 grid grid-cols-12 gap-2">
            <div className="col-span-2">基金</div>
            <div className="col-span-2">日期</div>
            <div className="col-span-2">差异类型</div>
            <div className="col-span-3">Eggfund 交易详情</div>
            <div className="col-span-3">本地交易详情</div>
          </div>
        </div>

        {/* Table body */}
        <div className="overflow-y-auto flex-grow" style={{ maxHeight: '40vh' }}>
          {filteredDifferences.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              {differences.length === 0 ? '本地交易记录与 Eggfund 一致，无需同步' : '没有找到符合条件的交易差异'}
            </div>
          ) : (
            filteredDifferences.map((diff, index) => {
              const isSelected = selectedItems.some(
                item => item.date === diff.date && item.symbol === diff.symbol
              );

              // 根据差异类型设置样式
              let typeLabel = '';
              let typeColor = '';
              switch (diff.type) {
                case 'new':
                  typeLabel = '新增';
                  typeColor = 'bg-green-100 text-green-800';
                  break;
                case 'modified':
                  typeLabel = '修改';
                  typeColor = 'bg-yellow-100 text-yellow-800';
                  break;
                case 'deleted':
                  typeLabel = '删除';
                  typeColor = 'bg-red-100 text-red-800';
                  break;
                default:
                  typeLabel = diff.type;
                  typeColor = 'bg-gray-100 text-gray-800';
              }

              // Get fund name from available funds
              const fundInfo = availableFunds.find(f => f.code === diff.symbol);
              const fundName = fundInfo ? fundInfo.name : diff.symbol;

              return (
                <div
                  key={`${diff.date}-${diff.symbol}`}
                  className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                    isSelected ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="px-6 py-2 flex items-center text-sm">
                    <div className="w-8 flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleItemToggle(diff)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex-1 grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-2 flex items-center">
                        <button
                          onClick={() => setShowTradeManager(diff.symbol)}
                          className="font-medium text-xs whitespace-nowrap overflow-hidden text-ellipsis max-w-full text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                          title={fundName}
                        >
                          {fundName}
                        </button>
                      </div>
                      <div className="col-span-2 flex items-center">
                        <span className="text-xs">{diff.date}</span>
                      </div>
                      <div className="col-span-2 flex items-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${typeColor}`}>
                          {typeLabel}
                        </span>
                      </div>
                      <div className="col-span-3 text-xs">
                        {diff.externalData && (
                          <div>
                            {diff.externalData.trades.map((trade, idx) => (
                              <div key={idx} className="mb-1 last:mb-0">
                                <span className={trade.type === 'buy' ? 'text-green-600' : 'text-red-600'}>
                                  {trade.type === 'buy' ? '买入' : '卖出'}：{trade.shares.toFixed(2)}份，手续费：{trade.fee.toFixed(2)}
                                </span>
                              </div>
                            ))}
                            {diff.externalData.trades.length > 0 && (
                              <div className="font-medium mt-1">
                                方向:{diff.externalData.netDirection === 'buy' ? '买' : diff.externalData.netDirection === 'sell' ? '卖' : '持'}，净份额:{diff.externalData.netShares.toFixed(2)}，总费用:{diff.externalData.totalFees.toFixed(2)}
                              </div>
                            )}
                          </div>
                        )}
                        {!diff.externalData && diff.type === 'deleted' && (
                          <div className="text-gray-500">无外部记录</div>
                        )}
                      </div>
                      <div className="col-span-3 text-xs">
                        {diff.localData && (
                          <div>
                            {diff.localData.trades.map((trade, idx) => (
                              <div key={idx} className="mb-1 last:mb-0">
                                <span className={trade.type === 'buy' ? 'text-green-600' : 'text-red-600'}>
                                  {trade.type === 'buy' ? '买入' : '卖出'}：{trade.shares.toFixed(2)}份，手续费：{trade.fee.toFixed(2)}
                                </span>
                              </div>
                            ))}
                            {diff.localData.trades.length > 0 && (
                              <div className={`font-medium mt-1 ${
                                diff.type === 'modified' && diff.differenceDetails?.some(d => d.type === 'direction' || d.type === 'netShares' || d.type === 'fees')
                                  ? 'bg-yellow-100' : ''
                              }`}>
                                方向:<span className={
                                  diff.type === 'modified' && diff.differenceDetails?.some(d => d.type === 'direction' && d.localValue !== d.externalValue)
                                    ? 'bg-yellow-200 px-1 rounded' : ''
                                }>
                                  {diff.localData.netDirection === 'buy' ? '买' : diff.localData.netDirection === 'sell' ? '卖' : '持'}
                                </span>，净份额:<span className={
                                  diff.type === 'modified' && diff.differenceDetails?.some(d => d.type === 'netShares' && Math.abs(d.localValue - d.externalValue) > 0.001)
                                    ? 'bg-yellow-200 px-1 rounded' : ''
                                }>
                                  {diff.localData.netShares.toFixed(2)}
                                </span>，总费用:<span className={
                                  diff.type === 'modified' && diff.differenceDetails?.some(d => d.type === 'fees' && Math.abs(d.localValue - d.externalValue) > 0.001)
                                    ? 'bg-yellow-200 px-1 rounded' : ''
                                }>
                                  {diff.localData.totalFees.toFixed(2)}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                        {!diff.localData && diff.type === 'new' && (
                          <div className="text-gray-500">无本地记录</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 p-4 flex flex-col space-y-3">
          {/* 预留空间给同步消息显示 */}
          <div className="h-6 flex items-center">
            {syncMessage && (
              <div className="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-1.5 truncate max-w-full">
                {syncMessage}
              </div>
            )}
          </div>
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              显示 {filteredDifferences.length} 项，已选中 {selectedItems.length} 项
            </div>
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                disabled={loading}  // 在loading期间禁用关闭按钮
                className={`px-5 py-2.5 text-sm font-bold text-gray-400 hover:bg-gray-50 rounded-xl transition-colors ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                关闭窗口
              </button>
              <button
                onClick={handleConfirm}
                disabled={selectedItems.length === 0}
                className={`px-5 py-2.5 text-sm font-bold rounded-xl transition-colors ${
                  selectedItems.length === 0
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                确认同步 ({selectedItems.length})
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SyncConfirmationModal;